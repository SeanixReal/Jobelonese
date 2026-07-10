# AGENTS.md — Guide for AI Coding Agents

This file orients AI agents (Claude Code, Copilot, Cursor, etc.) working in the TechFix repo.
Humans should start with [README.md](README.md); the deep docs live in [docs/](docs/).

## What this project is

TechFix is a **React + Vite + Supabase** ticketing app for CIT-U computer labs. Students report
broken lab equipment; staff (NAS → IT) work a shared queue. It is a **prototype** — expect
incomplete flows and known inconsistencies (see [Issues](https://github.com/SeanixReal/Jobelonese/issues)).

## Ground rules

1. **`src/lib.ts` is the canonical data/auth layer.** Prefer it. `src/authService.ts` and
   `src/CreateClient.ts` are an older, parallel implementation that should be consolidated away
   ([#14](https://github.com/SeanixReal/Jobelonese/issues/14)). Do not add new call sites to them.
2. **Do not create a second Supabase client.** Import the existing `supabase` from `src/lib.ts`.
   Multiple GoTrue clients cause session bugs.
3. **Roles are `student | nas | it | cpe_faculty`** (underscore). `src/signup.tsx` and
   `DATABASE_SETUP.sql` still use the hyphen form `cpe-faculty` — that's a bug
   ([#8](https://github.com/SeanixReal/Jobelonese/issues/8)), not a pattern to copy. Use underscores.
4. **Never trust client-supplied roles.** Role must not be self-selected at signup or changeable via
   a self-service profile update ([#10](https://github.com/SeanixReal/Jobelonese/issues/10),
   [#11](https://github.com/SeanixReal/Jobelonese/issues/11)). Enforce server-side.
5. **Scope queries to the current user.** e.g. ticket reads must filter by `reported_by` and be backed
   by RLS ([#9](https://github.com/SeanixReal/Jobelonese/issues/9)).
6. **Keep types in sync with the DB.** Column names are snake_case (`fullname`, `created_at`,
   `student_or_staff_id`, `program`). Avoid `as unknown as` casts
   ([#17](https://github.com/SeanixReal/Jobelonese/issues/17)).
7. **Secrets:** only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` via `.env.local`. Never commit
   real keys or hardcode them in source/docs ([#12](https://github.com/SeanixReal/Jobelonese/issues/12)).

## Commands

```bash
npm install
npm run dev      # Vite dev server
npm run build    # tsc -b (typecheck) + vite build  <- use this to verify types
npm run lint     # oxlint
```
There is no test runner yet ([#27](https://github.com/SeanixReal/Jobelonese/issues/27)). Until there is,
verify changes with `npm run build` and by exercising the affected flow in the dev server.

## Conventions

- **Language:** TypeScript + React function components with hooks. No class components.
- **Styling:** plain CSS files colocated per view (`App.css`, `StudentPortal.css`, `index.css`).
- **State:** local `useState`/`useEffect`; no global store. Auth state is observed via
  `supabase.auth.onAuthStateChange` in `src/App.tsx`.
- **Navigation:** a hand-rolled view switch in `src/App.tsx` (`home | signin | signup | portal`),
  not a router library. `goTo(view)` is passed down as a prop.
- **Async data:** all Supabase calls throw on error; callers wrap in `try/catch` and surface a message.

## Where things live

| Concern | File |
| --- | --- |
| View routing / session bootstrap | `src/App.tsx` |
| Supabase client + all data access | `src/lib.ts` |
| Student dashboard UI | `src/studentportal.tsx` |
| Auth forms | `src/signin.tsx`, `src/signup.tsx` |
| Landing page | `src/home.tsx` |
| DB schema | `DATABASE_SETUP.sql` (incomplete — see docs/DATA_MODEL.md) |

## Before you finish a change

- [ ] `npm run build` passes (types included).
- [ ] No new import of `authService.ts` / `CreateClient.ts`.
- [ ] Roles use underscore form; no self-selected/self-editable roles introduced.
- [ ] User-scoped reads are filtered and RLS-safe.
- [ ] If you changed the schema, update [docs/DATA_MODEL.md](docs/DATA_MODEL.md) and `DATABASE_SETUP.sql` together.
- [ ] If behavior changed, update the relevant doc in [docs/](docs/).
