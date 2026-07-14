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
