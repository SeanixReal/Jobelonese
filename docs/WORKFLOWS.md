# Workflows

How the pieces in [ARCHITECTURE.md](ARCHITECTURE.md) and [DATA_MODEL.md](DATA_MODEL.md) compose into
user journeys. Diagrams reflect the code as written today; ⚠️ callouts mark where a flow is broken or
incomplete.

## Sign-up

```mermaid
sequenceDiagram
    actor U as User
    participant F as signup.tsx
    participant A as authService.ts
    participant S as Supabase Auth
    participant DB as public.users

    U->>F: fill form (name, email, id, role, program, password)
    F->>F: validate (min length, match, role, program)
    F->>A: signUp(email, password, fullName, role, id, program)
    A->>S: auth.signUp({ email, password, options.data })
    S-->>A: auth user (metadata stored)
    Note over S,DB: ⚠️ No trigger copies metadata into public.users (#6)
    A-->>F: { success, user, profile(fallback) }
    F->>U: navigate to signin

    rect rgb(255,240,240)
    Note over U,S: ⚠️ If email confirmation is ON, the user cannot sign in yet<br/>and nothing tells them to check their inbox (#20)
    end
```

## Sign-in

```mermaid
sequenceDiagram
    actor U as User
    participant F as signin.tsx
    participant A as authService.ts
    participant S as Supabase Auth
    participant DB as public.users
    participant APP as App.tsx

    U->>F: email + password
    F->>A: signIn(email, password)
    A->>S: auth.signInWithPassword
    S-->>A: session + user
    A->>DB: select * from users where id = user.id (maybeSingle)
    alt profile row exists
        DB-->>A: profile
    else missing / RLS-hidden
        A->>A: buildFallbackProfile(from metadata)
    end
    A-->>F: { success, user, profile }
    F->>APP: goTo(role == student ? portal : home)
    APP->>APP: onAuthStateChange -> load profile
    alt role = student or cpe_faculty
        APP->>U: render StudentPortal
    else role = nas
        APP->>U: render NasPortal
    else role = it
        APP->>U: render ITPortal
    else role = admin
        APP->>U: render AdminPortal
    end
```

## Session bootstrap on load

```mermaid
sequenceDiagram
    participant APP as App.tsx
    participant S as Supabase Auth

    APP->>S: auth.getSession()
    alt has session
        S-->>APP: session
        APP->>APP: view = "portal"
    else no session
        S-->>APP: null
        APP->>APP: view = "home"
    end
    APP->>S: onAuthStateChange(cb)
    Note over APP,S: cb sets view = session ? "portal" : "home"<br/>for every future auth change
```

## Report a ticket (student)

```mermaid
sequenceDiagram
    actor St as Student
    participant P as studentportal.tsx
    participant L as lib.ts
    participant DB as Postgres

    St->>P: open portal
    P->>L: getCurrentProfile()
    P->>L: getMyTickets()
    P->>L: getLabs()
    L-->>P: profile, tickets, labs
    St->>P: pick lab -> triggers getStations(labId)
    L-->>P: stations
    St->>P: choose category + issue -> Submit
    P->>L: createTicket({ labId, stationId?, category, issue })
    L->>DB: insert into tickets (user_id = auth.uid())
    DB-->>L: new ticket
    P->>L: loadAll() (refresh)
    Note over P,DB: ⚠️ getMyTickets has no user_id filter in application code.<br/>It must be protected by a correct RLS owner policy.
```

## Ticket lifecycle (state machine)

```mermaid
stateDiagram-v2
    [*] --> open: createTicket()<br/>current_handler = nas
    open --> in_progress: claimTicket()<br/>assigned_to = auth.uid()
    in_progress --> resolved: resolveTicket()<br/>set resolved_at
    open --> open: forwardTicket()<br/>current_handler nas -> it
    in_progress --> resolved
    resolved --> [*]

    note right of open
        NAS works the queue first,
        forwards hardware/network
        issues to IT when needed
    end note
```

## Staff queue

NAS and IT portal components now call the queue functions. The flow below reflects the current
implementation; access still depends on correct live RLS policies.

```mermaid
flowchart TD
    subgraph NAS["NAS queue — getNasQueue()"]
        n1["open / in_progress tickets<br/>current_handler = nas"]
    end
    subgraph IT["IT queue — getItQueue()"]
        i1["tickets<br/>current_handler = it"]
    end

    n1 -->|claimTicket| n2["in_progress<br/>assigned_to = NAS user"]
    n2 -->|resolveTicket| done["resolved"]
    n1 -->|forwardTicket| i1
    i1 -->|claimTicket| i2["in_progress<br/>assigned_to = IT user"]
    i2 -->|resolveTicket| done
```

## Sign-out

```mermaid
sequenceDiagram
    actor U as User
    participant P as studentportal.tsx
    participant L as lib.ts
    participant S as Supabase Auth
    participant APP as App.tsx

    U->>P: click Sign Out
    P->>L: signOut()
    L->>S: auth.signOut()
    S-->>APP: onAuthStateChange(null) -> view = "home"
    P->>P: window.location.reload()
    Note over P,APP: ⚠️ The reload is redundant — onAuthStateChange already<br/>routes home (#22)
```
