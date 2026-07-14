-- TechFix production hardening for issues #46 and #13.
-- Run this once in the intended Supabase project's SQL Editor after the
-- application tables exist. The statements are safe to run again.

-- Issue #46: publish the tables consumed by the client Realtime subscriptions.
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

-- Issue #13: reject non-CIT-U accounts in the database transaction itself.
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

-- This function can also be selected in Auth > Hooks > Before User Created.
-- The trigger above keeps the rule active even before that dashboard hook is
-- configured, while the hook provides a clearer Auth API error response.
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
--
-- New Auth users are always created as students. Role changes are guarded by
-- a database trigger so a browser cannot promote itself by editing metadata
-- or its public profile row. Run this section in the intended project only.
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

-- Preserve the existing self-service profile policy while allowing an
-- authenticated administrator to update another user's role. The trigger
-- above remains the final authorization boundary for the role column.
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

-- =========================================================
-- Issue #40: canonical station numbers and database uniqueness
--
-- Keep the lowest station id in each lab, move any ticket references to that
-- row, remove duplicate rows, and then make the invariant permanent. The
-- key is case-insensitive and ignores surrounding whitespace.
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
