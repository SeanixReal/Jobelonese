-- Create users table for storing user profile information
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  fullname VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'student'
    CHECK (role IN ('student', 'nas', 'it', 'cpe_faculty', 'admin')),
  student_or_staff_id VARCHAR(255),
  program VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create RLS (Row Level Security) policies for users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own profile
CREATE POLICY "Users can view their own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Allow new users to insert their profile during signup
CREATE POLICY "Users can insert their own profile"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create indexes for faster queries
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);

-- =========================================================
-- Production hardening for TechFix issues #46 and #13
--
-- Run this section after the application tables (labs, stations, tickets,
-- and ticket_history) have been created. The standalone
-- SUPABASE_REALTIME_AUTH_MIGRATION.sql contains the same idempotent section
-- for an already-provisioned database.
-- =========================================================

-- Publish the tables consumed by the client Realtime subscriptions.
DO $$
DECLARE
  table_name text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    FOREACH table_name IN ARRAY ARRAY[
      'users',
      'labs',
      'stations',
      'tickets',
      'ticket_history'
    ]::text[] LOOP
      IF to_regclass(format('public.%I', table_name)) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = table_name
        )
      THEN
        EXECUTE format(
          'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
          table_name
        );
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- Reject non-CIT-U accounts in the Auth database transaction itself.
CREATE OR REPLACE FUNCTION public.enforce_cit_email_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email IS NULL OR lower(btrim(NEW.email)) !~ '@cit[.]edu$' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Only @cit.edu email addresses can register.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_cit_email_domain() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_cit_email_domain() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS techfix_enforce_cit_email_domain ON auth.users;

CREATE TRIGGER techfix_enforce_cit_email_domain
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cit_email_domain();

-- Optional official Before User Created hook function. Select this function
-- in Auth > Hooks after running the SQL to return a clear Auth API error.
CREATE OR REPLACE FUNCTION public.hook_restrict_signup_by_email_domain(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_email text := lower(btrim(event->'user'->>'email'));
BEGIN
  IF normalized_email IS NULL OR normalized_email !~ '@cit[.]edu$' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Only @cit.edu email addresses can register.',
        'http_code', 403
      )
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hook_restrict_signup_by_email_domain(jsonb)
  TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_restrict_signup_by_email_domain(jsonb)
  FROM authenticated, anon, PUBLIC;

-- Issue #6 / #10: create the public profile with a server-owned role.
-- The trigger intentionally never copies a role from Auth metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    fullname,
    role,
    student_or_staff_id,
    program
  )
  VALUES (
    NEW.id,
    lower(btrim(NEW.email)),
    coalesce(
      nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      split_part(lower(btrim(NEW.email)), '@', 1)
    ),
    'student',
    nullif(btrim(NEW.raw_user_meta_data ->> 'student_or_staff_id'), ''),
    nullif(btrim(NEW.raw_user_meta_data ->> 'program'), '')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      fullname = EXCLUDED.fullname,
      student_or_staff_id = EXCLUDED.student_or_staff_id,
      program = EXCLUDED.program;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- Issue #10 / #11: server-side role ownership
-- =========================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION private.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_current_user_admin() TO authenticated;

CREATE OR REPLACE FUNCTION private.enforce_user_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS NULL THEN
      NEW.role := 'student';
    END IF;

    IF NEW.role <> 'student' AND NOT private.is_current_user_admin() THEN
      RAISE EXCEPTION USING
        ERRCODE = 'insufficient_privilege',
        MESSAGE = 'Only administrators can assign user roles.';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
    AND NOT private.is_current_user_admin()
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Only administrators can change user roles.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_user_role_assignment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.enforce_user_role_assignment() TO authenticated;

DROP TRIGGER IF EXISTS users_role_insert_guard ON public.users;
CREATE TRIGGER users_role_insert_guard
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_user_role_assignment();

DROP TRIGGER IF EXISTS users_role_update_guard ON public.users;
CREATE TRIGGER users_role_update_guard
  BEFORE UPDATE OF role ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_user_role_assignment();

DROP POLICY IF EXISTS "Admins can update user profiles" ON public.users;
CREATE POLICY "Admins can update user profiles"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (private.is_current_user_admin())
  WITH CHECK (private.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can view all user profiles" ON public.users;
CREATE POLICY "Admins can view all user profiles"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (private.is_current_user_admin());

-- Repair Auth accounts created before the profile trigger was installed.
-- This is intentionally a review-only migration step: it runs only when an
-- administrator executes this SQL in the intended Supabase project.
INSERT INTO public.users (
  id,
  email,
  fullname,
  role,
  student_or_staff_id,
  program
)
SELECT
  auth_user.id,
  lower(btrim(auth_user.email)),
  coalesce(
    nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    split_part(lower(btrim(auth_user.email)), '@', 1)
  ),
  'student',
  nullif(btrim(auth_user.raw_user_meta_data ->> 'student_or_staff_id'), ''),
  nullif(btrim(auth_user.raw_user_meta_data ->> 'program'), '')
FROM auth.users AS auth_user
WHERE auth_user.email IS NOT NULL
  AND lower(btrim(auth_user.email)) ~ '@cit[.]edu$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.users AS profile
    WHERE profile.id = auth_user.id
  )
ON CONFLICT DO NOTHING;

-- =========================================================
-- Issue #40: canonical station numbers and database uniqueness
-- =========================================================

UPDATE public.labs
SET name = regexp_replace(btrim(name), E'\\s+', ' ', 'g')
WHERE name IS DISTINCT FROM regexp_replace(btrim(name), E'\\s+', ' ', 'g');

UPDATE public.stations
SET station_number = regexp_replace(btrim(station_number), E'\\s+', ' ', 'g')
WHERE station_number IS DISTINCT FROM regexp_replace(btrim(station_number), E'\\s+', ' ', 'g');

WITH ranked AS (
  SELECT
    id,
    min(id) OVER (
      PARTITION BY lab_id, lower(btrim(station_number))
    ) AS keep_id
  FROM public.stations
  WHERE station_number IS NOT NULL
), duplicate_map AS (
  SELECT id, keep_id
  FROM ranked
  WHERE id <> keep_id
)
UPDATE public.tickets AS ticket
SET station_id = duplicate_map.keep_id
FROM duplicate_map
WHERE ticket.station_id = duplicate_map.id;

WITH ranked AS (
  SELECT
    id,
    min(id) OVER (
      PARTITION BY lab_id, lower(btrim(station_number))
    ) AS keep_id
  FROM public.stations
  WHERE station_number IS NOT NULL
), duplicate_map AS (
  SELECT id
  FROM ranked
  WHERE id <> keep_id
)
DELETE FROM public.stations AS station
USING duplicate_map
WHERE station.id = duplicate_map.id;

CREATE UNIQUE INDEX IF NOT EXISTS stations_lab_station_number_unique
  ON public.stations (lab_id, lower(btrim(station_number)))
  WHERE station_number IS NOT NULL;

-- =========================================================
-- Ticket integrity, atomic workflow operations, and admin account deletion
-- =========================================================

-- The ticket UI is not a security boundary. These constraints protect direct
-- Data API writes as well as form submissions.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_issue_length_check') THEN
    ALTER TABLE public.tickets ADD CONSTRAINT tickets_issue_length_check
      CHECK (char_length(btrim(issue)) BETWEEN 1 AND 2000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_category_check') THEN
    ALTER TABLE public.tickets ADD CONSTRAINT tickets_category_check
      CHECK (category IN (
        'Hardware (monitor, mouse, keyboard)',
        'No internet / network',
        'Software / application',
        'Projector / AV equipment',
        'Other'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_notes_length_check') THEN
    ALTER TABLE public.tickets ADD CONSTRAINT tickets_notes_length_check
      CHECK (
        char_length(coalesce(resolution_notes, '')) <= 4000
        AND char_length(coalesce(internal_notes, '')) <= 4000
        AND char_length(coalesce(closed_reason, '')) <= 1000
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stations_lab_id_id_key') THEN
    ALTER TABLE public.stations ADD CONSTRAINT stations_lab_id_id_key UNIQUE (lab_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_station_matches_lab_fkey') THEN
    ALTER TABLE public.tickets ADD CONSTRAINT tickets_station_matches_lab_fkey
      FOREIGN KEY (lab_id, station_id) REFERENCES public.stations (lab_id, id);
  END IF;
END;
$$;

-- Direct ticket updates bypass workflow invariants. Mutations now go through
-- the guarded RPCs below, which compare the expected state in one UPDATE.
DROP POLICY IF EXISTS "Staff can update all tickets" ON public.tickets;
DROP POLICY IF EXISTS "Staff can update tickets" ON public.tickets;
DROP POLICY IF EXISTS tickets_it_update ON public.tickets;
DROP POLICY IF EXISTS tickets_nas_update ON public.tickets;
DROP POLICY IF EXISTS "Anyone authenticated can insert history" ON public.ticket_history;

CREATE OR REPLACE FUNCTION public.claim_ticket(p_ticket_id varchar)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text;
  updated_ticket public.tickets;
BEGIN
  SELECT role INTO actor_role FROM public.users WHERE id = actor_id;
  IF actor_role NOT IN ('nas', 'it') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only NAS or IT staff can claim tickets.';
  END IF;

  UPDATE public.tickets
  SET assigned_to = actor_id, status = 'in_progress'
  WHERE id = p_ticket_id
    AND current_handler = actor_role
    AND status = 'open'
    AND assigned_to IS NULL
  RETURNING * INTO updated_ticket;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This ticket is no longer available to claim.';
  END IF;

  INSERT INTO public.ticket_history (ticket_id, action, performed_by, details)
  VALUES (updated_ticket.id, 'claimed', actor_id, 'Claimed by staff');
  RETURN NEXT updated_ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_nas_claim(p_ticket_id varchar)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  actor_id uuid := auth.uid();
  updated_ticket public.tickets;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = actor_id AND role = 'nas') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only NAS staff can cancel a NAS claim.';
  END IF;

  UPDATE public.tickets
  SET status = 'open', assigned_to = NULL
  WHERE id = p_ticket_id
    AND current_handler = 'nas'
    AND status = 'in_progress'
    AND assigned_to = actor_id
  RETURNING * INTO updated_ticket;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This ticket changed before your claim could be cancelled.';
  END IF;

  INSERT INTO public.ticket_history (ticket_id, action, performed_by, details)
  VALUES (updated_ticket.id, 'claim_cancelled', actor_id, 'Claim cancelled; returned to NAS queue');
  RETURN NEXT updated_ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.forward_ticket_to_it(p_ticket_id varchar)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  actor_id uuid := auth.uid();
  updated_ticket public.tickets;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = actor_id AND role = 'nas') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only NAS staff can forward tickets.';
  END IF;

  UPDATE public.tickets
  SET current_handler = 'it', status = 'open', assigned_to = NULL
  WHERE id = p_ticket_id
    AND current_handler = 'nas'
    AND status = 'in_progress'
    AND assigned_to = actor_id
  RETURNING * INTO updated_ticket;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This ticket changed before it could be forwarded.';
  END IF;

  INSERT INTO public.ticket_history (ticket_id, action, performed_by, details)
  VALUES (updated_ticket.id, 'escalated', actor_id, 'Forwarded to IT');
  RETURN NEXT updated_ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.reassign_it_ticket(
  p_ticket_id varchar,
  p_assigned_to uuid,
  p_expected_assigned_to uuid
)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  actor_id uuid := auth.uid();
  updated_ticket public.tickets;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = actor_id AND role = 'it') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only IT staff can reassign tickets.';
  END IF;
  IF p_assigned_to IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_assigned_to AND role = 'nas') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tickets can only be reassigned to an active NAS user.';
  END IF;

  UPDATE public.tickets
  SET assigned_to = p_assigned_to,
      status = CASE WHEN p_assigned_to IS NULL THEN 'open' ELSE 'in_progress' END,
      current_handler = CASE WHEN p_assigned_to IS NULL THEN 'it' ELSE 'nas' END
  WHERE id = p_ticket_id
    AND current_handler = 'it'
    AND status IN ('open', 'in_progress')
    AND assigned_to IS NOT DISTINCT FROM p_expected_assigned_to
  RETURNING * INTO updated_ticket;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This ticket changed before it could be reassigned.';
  END IF;

  INSERT INTO public.ticket_history (ticket_id, action, performed_by, details)
  VALUES (updated_ticket.id, 'reassigned', actor_id, CASE WHEN p_assigned_to IS NULL THEN 'Returned to the IT queue' ELSE 'Assigned to NAS' END);
  RETURN NEXT updated_ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ticket(
  p_ticket_id varchar,
  p_expected_assigned_to uuid,
  p_resolution_notes text,
  p_internal_notes text,
  p_closed_reason text
)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text;
  updated_ticket public.tickets;
BEGIN
  SELECT role INTO actor_role FROM public.users WHERE id = actor_id;
  IF actor_role NOT IN ('nas', 'it') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only NAS or IT staff can complete tickets.';
  END IF;
  IF p_closed_reason IS NOT NULL AND actor_role <> 'it' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only IT staff can close or reject tickets.';
  END IF;

  UPDATE public.tickets
  SET status = 'resolved',
      resolution_notes = p_resolution_notes,
      internal_notes = p_internal_notes,
      closed_reason = p_closed_reason
  WHERE id = p_ticket_id
    AND current_handler = actor_role
    AND status = 'in_progress'
    AND assigned_to IS NOT DISTINCT FROM p_expected_assigned_to
    AND (actor_role = 'it' OR assigned_to = actor_id)
  RETURNING * INTO updated_ticket;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This ticket changed before it could be completed.';
  END IF;

  INSERT INTO public.ticket_history (ticket_id, action, performed_by, details)
  VALUES (
    updated_ticket.id,
    CASE WHEN p_closed_reason IS NULL THEN 'resolved' ELSE 'closed' END,
    actor_id,
    CASE WHEN p_closed_reason IS NULL THEN 'Resolved' ELSE 'Closed or rejected' END
  );
  RETURN NEXT updated_ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_ticket_to_nas(
  p_ticket_id varchar,
  p_expected_assigned_to uuid
)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  actor_id uuid := auth.uid();
  updated_ticket public.tickets;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = actor_id AND role = 'it') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only IT staff can return tickets to NAS.';
  END IF;

  UPDATE public.tickets
  SET current_handler = 'nas', status = 'open', assigned_to = NULL
  WHERE id = p_ticket_id
    AND current_handler = 'it'
    AND status IN ('open', 'in_progress')
    AND assigned_to IS NOT DISTINCT FROM p_expected_assigned_to
  RETURNING * INTO updated_ticket;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This ticket changed before it could be returned to NAS.';
  END IF;

  INSERT INTO public.ticket_history (ticket_id, action, performed_by, details)
  VALUES (updated_ticket.id, 'deescalated', actor_id, 'Returned to NAS queue');
  RETURN NEXT updated_ticket;
END;
$$;

-- Auth users are not exposed through the Data API. This server-owned RPC
-- revokes sessions first, then deletes auth.users; the profile FK cascades.
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, pg_catalog
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = actor_id AND role = 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only administrators can delete user accounts.';
  END IF;
  IF p_user_id = actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Administrators cannot delete their own account.';
  END IF;

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'User account no longer exists.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ticket(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_nas_claim(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.forward_ticket_to_it(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reassign_it_ticket(varchar, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_ticket(varchar, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.return_ticket_to_nas(varchar, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ticket(varchar) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_nas_claim(varchar) FROM anon;
REVOKE ALL ON FUNCTION public.forward_ticket_to_it(varchar) FROM anon;
REVOKE ALL ON FUNCTION public.reassign_it_ticket(varchar, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.complete_ticket(varchar, uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.return_ticket_to_nas(varchar, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.claim_ticket(varchar) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_nas_claim(varchar) TO authenticated;
GRANT EXECUTE ON FUNCTION public.forward_ticket_to_it(varchar) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_it_ticket(varchar, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ticket(varchar, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_ticket_to_nas(varchar, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
