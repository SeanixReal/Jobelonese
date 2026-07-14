# TechFix — CIT-U Computer Lab Support

TechFix is a ticketing app for the computer labs at Cebu Institute of Technology – University (CIT-U).
Students flag broken equipment, and lab/IT staff work a single live queue instead of paper logs and group chats.

> **Prototype status.** This is a student capstone prototype built on React + Vite + Supabase.
> Several parts are incomplete or inconsistent — see the [open issues](https://github.com/SeanixReal/Jobelonese/issues)
> and the "Known gaps" section below before relying on any flow end-to-end.

## Documentation

| Doc | What's inside |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, use case diagram, component map, and routing/auth flow |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Entity-relationship diagram, tables, columns, RLS notes |
| [docs/WORKFLOWS.md](docs/WORKFLOWS.md) | Ticket lifecycle, sign-up / sign-in sequences, staff queue flow (diagrams) |
| [AGENTS.md](AGENTS.md) | Orientation for AI coding agents working in this repo |

## Tech stack

- **Frontend:** React 19 + TypeScript, bundled with Vite 8
- **Backend:** Supabase (Postgres + Auth / GoTrue)
- **Lint:** Oxlint

## Getting started

### 1. Prerequisites
- Node.js 20+ and npm
- A Supabase project (this one is codenamed **techfix**)

### 2. Install
```bash
npm install
```

### 3. Configure environment
Create a `.env.local` in the repo root (Vite reads `VITE_`-prefixed vars):
```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```
> There is not yet a committed `.env.example` — tracked in
> [#25](https://github.com/SeanixReal/Jobelonese/issues/25).

### 4. Provision the database
Run the SQL in [`DATABASE_SETUP.sql`](DATABASE_SETUP.sql) in the Supabase SQL Editor, then apply
the ticket-history migration when using the IT workflow. The committed setup is still incomplete;
the deployed database currently contains `users`, `labs`, `stations`, `tickets`, and
`ticket_history`, but not `ticket_assignments`. The actual live columns are documented in
[docs/DATA_MODEL.md](docs/DATA_MODEL.md).

### 5. Run
```bash
npm run dev      # start the dev server
npm run build    # typecheck (tsc -b) + production build
npm run lint     # oxlint
```

## User roles

| Role | Purpose |
| --- | --- |
| `student` | Reports issues and tracks their own tickets |
| `nas` | Non-academic scholars staffing labs; first-line queue |
| `it` | IT department; resolves escalated tickets |
| `cpe_faculty` | Faculty monitoring lab status |
| `admin` | System administrator; manages users, tickets, and audit logs |

> Student, NAS, IT, and Admin portal components are present. The staff workflows are prototype-level
> and still require live-schema/RLS verification before production use.

## Project structure

```
src/
  App.tsx            # top-level view router (home / signin / signup / portal)
  main.tsx           # React entry point
  home.tsx           # marketing landing page
  signin.tsx         # sign-in form
  signup.tsx         # sign-up form
  studentportal.tsx  # student dashboard (report + track tickets)
  NasPortal.tsx      # NAS queue, claim, resolve, and forward actions
  ITPortal.tsx       # IT queue, assignment, resolution, history, and lab management
  AdminPortal.tsx    # user, ticket, and audit-log administration
  ticketcard.tsx     # presentational ticket card (mock/marketing data)
  lib.ts             # Supabase client + typed auth/ticket/lab data access  <- primary API
  authService.ts     # older parallel auth layer (to be consolidated, #14)
  CreateClient.ts    # older parallel Supabase client (to be consolidated, #14)
docs/                # architecture, data model, workflows
DATABASE_SETUP.sql   # Supabase schema (currently incomplete)
```

## Known gaps

The app is under active QA. This PR addresses the client-side portions of several issues and adds a
reviewable Supabase migration for the database portions. The migration has not been applied to a live
project from this workspace.

- **Still needs live-project verification:** schema mismatch & missing tables ([#4](https://github.com/SeanixReal/Jobelonese/issues/4), [#5](https://github.com/SeanixReal/Jobelonese/issues/5)), role value migration ([#8](https://github.com/SeanixReal/Jobelonese/issues/8)), and staff/admin RLS policy coverage.
- **Covered by this PR:** user-scoped ticket reads ([#9](https://github.com/SeanixReal/Jobelonese/issues/9)), canonical auth client ([#14](https://github.com/SeanixReal/Jobelonese/issues/14)), profile creation ([#6](https://github.com/SeanixReal/Jobelonese/issues/6)), admin-only roles ([#10](https://github.com/SeanixReal/Jobelonese/issues/10), [#11](https://github.com/SeanixReal/Jobelonese/issues/11)), station uniqueness ([#40](https://github.com/SeanixReal/Jobelonese/issues/40)), and stale lab selection ([#43](https://github.com/SeanixReal/Jobelonese/issues/43)).

See the full list in [Issues](https://github.com/SeanixReal/Jobelonese/issues).

## Credits

Designed for **Cebu Institute of Technology – University** by
Conde, Seanpaul Vincent · Mahinay, Jobelon A. · Orejela, Prince Daniel R. · Magdadaro, Adrianne.
