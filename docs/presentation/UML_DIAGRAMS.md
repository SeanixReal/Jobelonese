# TechFix — UML Diagrams

Presentation-ready UML for the **TechFix** CIT-U Computer Lab Support system.
All diagrams use Mermaid so they render on GitHub and can be exported as images
for slides. Keep only the **core** version on a slide; link the full version in
your documentation (per the presentation guide).

Contents: [Use Case](#1-use-case-diagram) · [Class](#2-class-diagram) ·
[Sequence](#3-sequence-diagram) · [ERD](#4-entity-relationship-diagram-erd)

---

## 1. Use Case Diagram

Who does what. Mermaid has no native use-case notation, so actors (left/right)
connect to ovals (use cases) inside the system boundary.

```mermaid
flowchart LR
    student([👤 Student]):::actor
    faculty([👤 CPE Faculty]):::actor
    nas([👤 NAS Staff]):::actor
    it([👤 IT Staff]):::actor
    admin([👤 Admin]):::actor

    subgraph TechFix["TechFix System"]
        direction TB
        uc1(["Sign up / Sign in"])
        uc2(["Report a ticket"])
        uc3(["Track my tickets"])
        uc4(["View NAS queue"])
        uc5(["Claim ticket"])
        uc6(["Forward to IT"])
        uc7(["Resolve ticket"])
        uc8(["View all tickets"])
        uc9(["Assign / reassign"])
        uc10(["Manage labs & stations"])
        uc11(["Manage users & roles"])
        uc12(["Review history / logs"])
    end

    student --- uc1 & uc2 & uc3
    faculty --- uc1 & uc2 & uc3
    nas --- uc1 & uc4 & uc5 & uc6 & uc7
    it --- uc1 & uc8 & uc5 & uc9 & uc7 & uc10 & uc12
    admin --- uc1 & uc8 & uc11 & uc12

    classDef actor fill:#e3f2fd,stroke:#1565c0,stroke-width:2px;
```

> **Slide tip:** all four role portals — Student, NAS, IT, and Admin — exist and
> route by role in `App.tsx`. The staff and admin workflows are prototype-level
> and still need live-schema/RLS verification before production (see the README).
> The **student report → track** path is the most complete, so lead your live
> demo with it. This mirrors the fuller use-case diagram in
> [../ARCHITECTURE.md](../ARCHITECTURE.md#use-case-diagram).

---

## 2. Class Diagram

Object-oriented structure derived from `src/lib.ts` — the data-access layer,
its types, and the entities it reads/writes.

```mermaid
classDiagram
    class User {
        +uuid id
        +string email
        +string fullname
        +Role role
        +string student_or_staff_id
        +string program
    }
    class Ticket {
        +string id
        +uuid user_id
        +int8 lab_id
        +int8 station_id
        +string category
        +string issue
        +string priority
        +string status
        +string current_handler
        +uuid assigned_to
        +uuid escalated_by
        +string resolution_notes
    }
    class Lab {
        +int8 id
        +string name
    }
    class Station {
        +int8 id
        +int8 lab_id
        +string station_number
    }
    class TicketHistory {
        +int4 id
        +string ticket_id
        +string action
        +uuid performed_by
        +string details
    }
    class DataAccess {
        <<service: lib.ts>>
        +signUp() 
        +signIn()
        +getCurrentProfile() User
        +createTicket() Ticket
        +getMyTickets() Ticket[]
        +getNasQueue() Ticket[]
        +getItQueue() Ticket[]
        +claimTicket()
        +forwardTicket()
        +resolveTicket()
        +getLabs() Lab[]
        +getStations() Station[]
    }

    User "1" --> "0..*" Ticket : reports (user_id)
    User "1" --> "0..*" Ticket : handles (assigned_to)
    Lab "1" --> "0..*" Station : has
    Lab "1" --> "0..*" Ticket : locates
    Station "0..1" --> "0..*" Ticket : at
    Ticket "1" --> "0..*" TicketHistory : logs
    User "1" --> "0..*" TicketHistory : performed_by
    DataAccess ..> User : reads/writes
    DataAccess ..> Ticket : reads/writes
```

---

## 3. Sequence Diagram

Core flow: **a student reports a ticket.** (Sign-up, sign-in, and sign-out
sequences live in [../WORKFLOWS.md](../WORKFLOWS.md).)

```mermaid
sequenceDiagram
    actor St as Student
    participant P as StudentPortal
    participant L as lib.ts (Data Access)
    participant DB as Supabase / Postgres

    St->>P: Open portal
    P->>L: getCurrentProfile()
    P->>L: getMyTickets()
    P->>L: getLabs()
    L-->>P: profile, tickets, labs
    St->>P: Select lab
    P->>L: getStations(labId)
    L-->>P: stations
    St->>P: Category + issue → Submit
    P->>L: createTicket({ lab, station?, category, issue })
    L->>DB: INSERT INTO tickets (user_id = auth.uid())
    DB-->>L: new ticket row
    P->>L: refresh (loadAll)
    L-->>P: updated ticket list
    P-->>St: Ticket shown in "My Tickets"
```

---

## 4. Entity-Relationship Diagram (ERD)

The database backbone as it exists **live in Supabase** — how a ticket links to
the student, lab, station, and its audit trail. `assigned_to`, `escalated_by`,
and `ticket_history.performed_by` all reference `users(id)`.

```mermaid
erDiagram
    AUTH_USERS ||--|| USERS : "1:1 (id)"
    USERS ||--o{ TICKETS : "reports (user_id)"
    USERS ||--o{ TICKETS : "handles (assigned_to)"
    LABS ||--o{ STATIONS : "has"
    LABS ||--o{ TICKETS : "located in"
    STATIONS ||--o{ TICKETS : "at (optional)"
    TICKETS ||--o{ TICKET_HISTORY : "logs"
    USERS ||--o{ TICKET_HISTORY : "performed_by"

    USERS {
        uuid id PK "FK auth.users.id"
        varchar email UK
        varchar fullname
        varchar role
        text student_or_staff_id
        text program
        timestamptz createdat
        timestamptz updatedat
        timestamptz created_at
    }
    LABS {
        int8 id PK
        varchar name UK
        timestamptz created_at
    }
    STATIONS {
        int8 id PK
        int8 lab_id FK
        varchar station_number
        timestamptz created_at
    }
    TICKETS {
        varchar id PK
        uuid user_id FK
        text issue
        varchar status
        int8 lab_id FK
        int8 station_id FK
        text category
        text priority
        text current_handler
        uuid assigned_to FK
        timestamptz created_at
        timestamptz resolved_at
        timestamptz escalated_at
        uuid escalated_by FK
        text resolution_notes
        text internal_notes
        text closed_reason
    }
    TICKET_HISTORY {
        int4 id PK
        varchar ticket_id FK
        text action
        uuid performed_by FK
        text details
        timestamptz created_at
    }
```

> This reflects the **deployed** schema (verified against the Supabase table
> view). For the authoritative column-level schema, types, RLS intent, and the
> guarded workflow RPCs, see [../DATA_MODEL.md](../DATA_MODEL.md) — this ERD is
> consistent with it.

> Full column-level schema, types, and RLS notes: [../DATA_MODEL.md](../DATA_MODEL.md).
