# Architecture

TechFix is a single-page React app talking directly to Supabase (Postgres + Auth) from the browser.
There is no custom backend server — the browser is the client, and Supabase enforces access rules
via Row-Level Security (RLS), Auth configuration, and database-side signup controls.

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

    LIB -- "session + data access" --> AUTH
    LIB -- "select / insert / update (REST)" --> DB
```

The anon key ships in the client bundle (this is expected for Supabase). **All real protection must
come from RLS and server-side Auth controls**, so any table the client touches needs policies. See
[DATA_MODEL.md](DATA_MODEL.md) for the intended policies and the gaps.

## Use case diagram

The following use-case view reflects the current portal routing in `src/App.tsx`. CPE faculty is
supported by the role type and uses the student portal. The sign-up form does not offer any role;
new accounts start as students and administrators assign staff roles.

The diagram uses Mermaid flowchart notation for UML-style actors and use-case ellipses because
Mermaid does not provide a native `usecaseDiagram` block.

```mermaid
flowchart LR
    Student{{Student}}
    Faculty{{CPE faculty}}
    NAS{{NAS staff}}
    IT{{IT administrator}}
    Admin{{System administrator}}
    Auth[(Supabase Auth)]
    DB[(Supabase Postgres + RLS)]

    subgraph TechFix["TechFix system"]
        UCAuth([Register / sign in])
        UCSignOut([Sign out])
        UCProfile([View profile])
        UCLabs([View labs and stations])
        UCReport([Submit ticket])
        UCTrack([Track own tickets])
        UCQueue([View NAS queue])
        UCClaim([Claim ticket])
        UCResolve([Resolve ticket])
        UCForward([Forward ticket to IT])
        UCAllTickets([View all tickets])
        UCAssign([Assign or reassign tickets])
        UCNotes([Resolve or close with notes])
        UCHistory([View ticket history])
        UCLabAdmin([Manage laboratories])
        UCUsers([Manage users and roles])
        UCLogs([Review system logs])
    end

    Student --> UCAuth
    Student --> UCSignOut
    Student --> UCProfile
    Student --> UCLabs
    Student --> UCReport
    Student --> UCTrack

    Faculty --> UCAuth
    Faculty --> UCSignOut
    Faculty --> UCProfile
    Faculty --> UCLabs
    Faculty --> UCReport
    Faculty --> UCTrack

    NAS --> UCAuth
    NAS --> UCSignOut
    NAS --> UCProfile
    NAS --> UCQueue
    NAS --> UCClaim
    NAS --> UCResolve
    NAS --> UCForward
    NAS --> UCReport

    IT --> UCAuth
    IT --> UCSignOut
    IT --> UCProfile
    IT --> UCAllTickets
    IT --> UCAssign
    IT --> UCNotes
    IT --> UCHistory
    IT --> UCLabAdmin
    IT --> UCReport

    Admin --> UCAuth
    Admin --> UCSignOut
    Admin --> UCProfile
    Admin --> UCAllTickets
    Admin --> UCHistory
    Admin --> UCUsers
    Admin --> UCLogs

    UCAuth -.-> Auth
    UCSignOut -.-> Auth
    UCProfile -.-> DB
    UCLabs -.-> DB
    UCReport -.-> DB
    UCTrack -.-> DB
    UCQueue -.-> DB
    UCClaim -.-> DB
    UCResolve -.-> DB
    UCForward -.-> DB
    UCAllTickets -.-> DB
    UCAssign -.-> DB
    UCNotes -.-> DB
    UCHistory -.-> DB
    UCLabAdmin -.-> DB
    UCUsers -.-> DB
    UCLogs -.-> DB
```

## Frontend component map

```mermaid
flowchart TD
    main["main.tsx<br/>React root"] --> App["App.tsx<br/>view router + session bootstrap"]
    App -->|view=home| Home["home.tsx<br/>landing page"]
    App -->|view=signin| SignIn["signin.tsx"]
    App -->|view=signup| SignUp["signup.tsx"]
    App -->|role=student or cpe_faculty| StudentPortal["studentportal.tsx"]
    App -->|role=nas| NasPortal["NasPortal.tsx"]
    App -->|role=it| ITPortal["ITPortal.tsx"]
    App -->|role=admin| AdminPortal["AdminPortal.tsx"]

    Home --> TicketCard["ticketcard.tsx<br/>(mock display)"]
    SignIn --> TicketCard
    SignUp --> TicketCard

    SignIn --> Lib["lib.ts ✅ canonical"]
    SignUp --> Lib
    App --> Lib["lib.ts ✅ canonical"]
    StudentPortal --> Lib
    NasPortal --> Lib
    ITPortal --> Lib
    AdminPortal --> Lib

    Lib --> SupaClient["supabase client"]
```

> `authService.ts` and `CreateClient.ts` remain as legacy compatibility files, but the auth forms now
> use the same `lib.ts` client as `App` and the portals. Do not add new call sites to the legacy pair.

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
    signup --> signup: account created; show verification message
    signup --> portal: account created without confirmation
    signin --> portal: onAuthStateChange(session)
    portal --> StudentPortal: role = student or cpe_faculty
    portal --> NasPortal: role = nas
    portal --> ITPortal: role = it
    portal --> AdminPortal: role = admin
    portal --> home: signOut()
```

> `onAuthStateChange` sets the top-level view to `portal`; `App.tsx` then loads the profile and selects
> `StudentPortal`, `NasPortal`, `ITPortal`, or `AdminPortal` from the role. The local redirect in
> `signin.tsx` is therefore redundant for non-student roles, but the staff destinations now exist.

## Data access layer (`src/lib.ts`)

Most Supabase reads/writes are centralized here, including sign-in and sign-up. The portals and
session bootstrap use the same client, so session events and Realtime subscriptions share one
Supabase connection.

| Group | Functions |
| --- | --- |
| Auth | `signUp`, `signIn`, `signOut`, `getCurrentProfile` |
| Tickets (student) | `createTicket`, `getMyTickets` |
| Tickets (NAS portal) | `getNasQueue`, `claimTicket`, `forwardTicket`, `resolveTicket` |
| Tickets (IT portal) | `getAllTickets`, `claimTicketAsIt`, `revokeAndReassignTicket`, `resolveTicketWithNotes`, `closeTicket`, `deescalateTicket`, `getTicketHistory` |
| Administration | `getAllUsers`, `updateUserRole`, `deleteUser`, `getAllTicketHistory` |
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
