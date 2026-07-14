# TechFix Authentication and Supabase Setup

This guide describes the authentication flow currently implemented in the TechFix prototype. The
database migration is deliberately separate from the app so it can be reviewed and run only against
the intended Supabase project.

## Environment variables

Create an ignored `.env.local` file in the repository root:

```text
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-publishable-key>
```

The repository also has an ignored `.env` file in some local checkouts. Never commit real keys, and do
not place a service-role/secret key or SMTP credentials in a `VITE_` variable.

## Current implementation

`src/lib.ts` is the canonical Supabase client and data-access layer used by `App.tsx`, the auth
forms, and the portal components. `src/authService.ts` remains in the repository only as a legacy
compatibility module; new call sites must use `src/lib.ts`.

The legacy `authService.ts` functions are:

| Function | Behavior |
| --- | --- |
| `signUp(email, password, fullName, studentOrStaffId, program)` | Creates a Supabase Auth user with non-privileged profile metadata. The database assigns the `student` role. |
| `signIn(email, password)` | Authenticates and attempts to read the matching `public.users` row. |
| `getCurrentUser()` | Reads the current Supabase Auth user. |
| `getUserProfile(userId)` | Reads one profile row from `public.users`. |
| `updateUserProfile(userId, updates)` | Updates the caller's profile row if RLS permits it. |
| `signOut()` | Signs out through Supabase Auth. |

There is no `deleteUserAccount()` function in `src/authService.ts`. The Admin portal's
`deleteUser()` function deletes a profile row from `public.users`; it does not delete the matching
`auth.users` account.
## Database setup

`DATABASE_SETUP.sql` creates only the initial `users` table and its basic policies. It does not create
the complete application schema. The deployed database currently exposes these application tables:

- `users`
- `labs`
- `stations`
- `tickets`
- `ticket_history`

There is no `ticket_assignments` table; ticket assignment is stored in `tickets.assigned_to`.
See [docs/DATA_MODEL.md](docs/DATA_MODEL.md) for the live column names and relationships.

`SUPABASE_REALTIME_AUTH_MIGRATION.sql` defines the `auth.users` profile-insert trigger. It copies only
non-privileged profile fields and always creates the public row with `role = 'student'`.

## Authentication flow

1. The signup form validates the fields and requires an exact `@cit.edu` address.
2. `src/lib.ts` repeats the domain check before calling Supabase Auth.
3. Supabase Auth creates the account and stores the non-privileged details in user metadata.
4. The database trigger creates the matching `public.users` row with `role = 'student'`.
5. When email confirmation is enabled, the form tells the user to check their CIT-U inbox before
   signing in.
6. `App.tsx` observes the Auth session, loads the server-owned profile, and routes the session to the student,
   NAS, IT, or Admin portal.

## Password recovery

The sign-in page's **Forgot password?** link now uses
`supabase.auth.resetPasswordForEmail()` through `src/lib.ts`. The reset email returns to the app's
current origin and path, where `App.tsx` handles Supabase's `PASSWORD_RECOVERY` event and shows the
new-password form. The form saves the new password with `supabase.auth.updateUser({ password })`,
then signs the recovery session out before returning the user to sign-in.

In **Authentication > URL Configuration > Redirect URLs**, allow every URL that can host the app,
including both common local Vite URLs and the deployed URL:

```text
http://localhost:5173/
http://127.0.0.1:5173/
https://<your-deployed-app-host>/
```

The reset link cannot return to a URL that is not on this allowlist. Configure the Auth email
template to use Supabase's reset-link variable, and use custom SMTP as described below so reset and
verification messages can reach real `@cit.edu` inboxes. The app does not contain SMTP credentials.

The server-side domain rule and Realtime publication setup are in
[SUPABASE_REALTIME_AUTH_MIGRATION.sql](SUPABASE_REALTIME_AUTH_MIGRATION.sql). The SQL creates a
database trigger that blocks non-`@cit.edu` Auth users and a Postgres function that can be selected
in Supabase's **Auth > Hooks > Before User Created** setting for a clearer API error.

## Email verification and SMTP

For the intended Supabase project:

1. In **Authentication > Providers > Email**, enable email confirmations.
2. In **Authentication > SMTP**, enable custom SMTP and enter the provider's host, port, username,
   password, sender email, and sender name. Keep these values in Supabase settings; never put SMTP
   credentials in `VITE_` variables or the repository.
3. In **Authentication > URL Configuration**, add the deployed app URL and local development URL as
   allowed redirect URLs.
4. In **Authentication > Hooks > Before User Created**, select
   `public.hook_restrict_signup_by_email_domain` after running the migration.

Supabase's built-in SMTP is intended for testing and only sends to pre-authorized project team
addresses. A real CIT-U rollout needs a custom SMTP provider with a verified sender/domain.

## Realtime queue updates

The portals subscribe to `tickets` changes (and the related `users`, `labs`, `stations`, and
`ticket_history` tables where needed) and re-run the existing RLS-scoped queries when an event
arrives. Run `SUPABASE_REALTIME_AUTH_MIGRATION.sql` in the intended project to add those tables to
the `supabase_realtime` publication. RLS remains the authorization boundary for Realtime payloads.

## Role and station safeguards

- The signup form has no role selector or role passcodes. Every new account starts as `student`.
- The migration's `private.enforce_user_role_assignment()` trigger rejects non-admin role assignment
  and role changes, including direct profile-table calls. The Admin portal is the only UI that offers
  role changes.
- The migration also deduplicates stations, re-points ticket references to the retained station row,
  and creates a unique `(lab_id, lower(btrim(station_number)))` index. The client normalizes station
  numbers and handles duplicate insert errors.
- `getMyTickets()` now adds the current user's `user_id` filter; the live RLS policy must still prevent
  one user from reading another user's tickets.
- Existing accounts created before the domain rule was installed should be reviewed separately; the
  database trigger blocks new Auth user creation but does not retroactively delete old accounts.

## Verification checklist

```bash
npm install
npm run dev
npm run build
npm run lint
```

Test a student and staff session separately. Confirm that profile creation, portal routing, ticket
ownership, staff queue actions, and sign-out all work under the live RLS policies. Review the SQL
migration and take a backup before applying its data cleanup to a project.
