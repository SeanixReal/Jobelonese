# TechFix Authentication and Supabase Setup

This guide describes the authentication flow currently implemented in the TechFix prototype. It is
not a production security design; the known authorization gaps are listed below.

## Environment variables

Create an ignored `.env.local` file in the repository root:

```text
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-publishable-key>
VITE_NAS_ROLE_PASSCODE=<optional-client-side-passcode>
VITE_IT_ROLE_PASSCODE=<optional-client-side-passcode>
VITE_ADMIN_ROLE_PASSCODE=<optional-client-side-passcode>
```

The repository also has an ignored `.env` file in some local checkouts. Never commit real keys or
passcodes, and do not place a service-role/secret key in a `VITE_` variable.

## Current implementation

There are two authentication layers:

- `src/lib.ts` is the canonical Supabase client and data-access layer used by `App.tsx` and the
  portal components.
- `src/authService.ts` is a legacy parallel layer still used by `signin.tsx` and `signup.tsx`.
  It should eventually be consolidated into `src/lib.ts`.

The current `authService.ts` functions are:

| Function | Behavior |
| --- | --- |
| `signUp(email, password, fullName, role, studentOrStaffId, program)` | Creates a Supabase Auth user with metadata and returns a fallback profile object. |
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

The repository does not define the `auth.users` profile-insert trigger. A working server-side trigger
or equivalent trusted insert is required to copy signup metadata into `public.users`; otherwise
`getCurrentProfile()` may fail for a newly registered user.

## Authentication flow

1. The signup form validates the fields and calls the legacy `authService.signUp()` function.
2. Supabase Auth creates the account and stores the supplied details in user metadata.
3. The form navigates to sign-in.
4. Sign-in reads the Auth user and attempts to load its `public.users` profile.
5. `App.tsx` loads the profile and routes the session to the student, NAS, IT, or Admin portal.

If email confirmation is enabled in Supabase, users must confirm their email before signing in. The
signup screen does not currently display a dedicated confirmation message.

## Security gaps to resolve

- Role selection and role passcodes are client-side controls. A user can inspect the bundle or call
  Supabase directly, so privileged roles must be assigned and changed only through server-side logic
  and restrictive RLS policies.
- Do not use user-editable `user_metadata` as the authorization source. Store trusted authorization
  data server-side and prevent self-service role changes.
- `getMyTickets()` does not add an explicit owner filter in application code; the live RLS policy must
  prevent one user from reading another user's tickets.
- The legacy `authService.ts`/`CreateClient.ts` pair should be consolidated with `src/lib.ts` to avoid
  duplicate session behavior.

## Verification checklist

```bash
npm install
npm run dev
npm run build
npm run lint
```

Test a student and staff session separately. Confirm that profile creation, portal routing, ticket
ownership, staff queue actions, and sign-out all work under the live RLS policies.
