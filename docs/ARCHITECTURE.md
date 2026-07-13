# Architecture

TechFix is a single-page React app talking directly to Supabase (Postgres + Auth) from the browser.
There is no custom backend server — the browser is the client, and Supabase enforces access rules
via Row-Level Security (RLS).

## System overview

```mermaid
flowchart LR
    subgraph Browser["Browser (SPA)"]
        UI["React 19 + Vite<br/>Views: home / signin / signup / portal"]
        LIB["src/lib.ts<br/>Supabase client + data access"]
        UI --> LIB
    end

    subgraph Supabase["Supabase (techfix project)"]
        AUTH["Auth / GoTrue<br/>auth.users"]
        DB[("Postgres<br/>public schema")]
        RLS["Row-Level Security"]
        AUTH --> DB
        RLS -.guards.-> DB
    end

    LIB -- "signUp / signIn / getSession" --> AUTH
    LIB -- "select / insert / update (REST)" --> DB
```

The anon key ships in the client bundle (this is expected for Supabase). **All real protection must
come from RLS**, so any table the client touches needs policies. See
[DATA_MODEL.md](DATA_MODEL.md) for the intended policies and the gaps.

## Frontend component map

```mermaid
flowchart TD
    main["main.tsx<br/>React root"] --> App["App.tsx<br/>view router + session bootstrap"]
    App -->|view=home| Home["home.tsx<br/>landing page"]
    App -->|view=signin| SignIn["signin.tsx"]
    App -->|view=signup| SignUp["signup.tsx"]
    App -->|view=portal| Portal["studentportal.tsx"]

    Home --> TicketCard["ticketcard.tsx<br/>(mock display)"]
    SignIn --> TicketCard
    SignUp --> TicketCard

    SignIn --> AuthSvc["authService.ts ⚠️ legacy"]
    SignUp --> AuthSvc
    App --> Lib["lib.ts ✅ canonical"]
    Portal --> Lib

    AuthSvc --> CreateClient["CreateClient.ts ⚠️ 2nd client"]
    Lib --> SupaClient["supabase client"]
    CreateClient --> SupaClient2["supabase client (duplicate)"]
```

> ⚠️ Two Supabase clients and two auth layers currently coexist. `signin`/`signup` use the legacy
> `authService.ts` + `CreateClient.ts`, while `App`/`portal` use `lib.ts`. This should be consolidated
> to a single client — [#14](https://github.com/SeanixReal/Jobelonese/issues/14).

## Routing & session bootstrap

`App.tsx` is a hand-rolled state machine (no router library). View is a `useState`, and auth state
is observed with `supabase.auth.onAuthStateChange`.

```mermaid
stateDiagram-v2
    [*] --> checkingSession
    checkingSession --> portal: getSession() has a session
    checkingSession --> home: no session

    home --> signin: click "Sign in"
    home --> signup: click "Get started"
    signup --> signin: account created
    signin --> portal: onAuthStateChange(session)
    portal --> home: signOut()

    note right of portal
        onAuthStateChange forces "portal"
        for ANY session, which overrides
        signin.tsx's role-based redirect (#16)
    end note
```

> The role-based redirect computed in `signin.tsx` is dead code because `onAuthStateChange` always
> routes a signed-in user to `portal` — [#16](https://github.com/SeanixReal/Jobelonese/issues/16).
> There is also no staff destination yet — [#18](https://github.com/SeanixReal/Jobelonese/issues/18).

## Data access layer (`src/lib.ts`)

All Supabase reads/writes are centralized here. Functions throw on error; callers handle it.

| Group | Functions |
| --- | --- |
| Auth | `signUp`, `signIn`, `signOut`, `getCurrentProfile` |
| Tickets (student) | `createTicket`, `getMyTickets` |
| Tickets (staff — no UI yet) | `getNasQueue`, `getItQueue`, `claimTicket`, `forwardTicket`, `resolveTicket` |
| Reference data | `getLabs`, `getStations` |

See [WORKFLOWS.md](WORKFLOWS.md) for how these compose into user journeys.

## Build & tooling

```mermaid
flowchart LR
    src["src/*.tsx"] --> tsc["tsc -b (typecheck)"]
    tsc --> vite["vite build"]
    vite --> dist["dist/ (static assets)"]
    dist --> host["Static host / Supabase-backed"]
```

- `npm run dev` — Vite dev server with HMR
- `npm run build` — `tsc -b` then `vite build`
- `npm run lint` — Oxlint
- No test runner or CI yet ([#27](https://github.com/SeanixReal/Jobelonese/issues/27)); the lint
  script also skips typechecking ([#28](https://github.com/SeanixReal/Jobelonese/issues/28)).
