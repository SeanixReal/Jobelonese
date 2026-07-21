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
    nas([👤 NAS Staff]):::actor
    it([👤 IT Staff]):::actor
    faculty([👤 CPE Faculty]):::actor

    subgraph TechFix["TechFix System"]
        direction TB
        uc1(["Sign up / Sign in"])
        uc2(["Report a ticket"])
        uc3(["Track my tickets"])
        uc4(["View NAS queue"])
        uc5(["Claim ticket"])
        uc6(["Forward to IT"])
        uc7(["Resolve ticket"])
        uc8(["View IT queue"])
        uc9(["Monitor lab status"])
    end

    student --- uc1 & uc2 & uc3
    nas --- uc1 & uc4 & uc5 & uc6 & uc7
    it --- uc1 & uc8 & uc5 & uc7
    faculty --- uc1 & uc9

    classDef actor fill:#e3f2fd,stroke:#1565c0,stroke-width:2px;
```

> **Slide tip:** the *Student* path (Sign in → Report → Track) is the only one
> fully built today. Highlight it in green on the slide; show the staff paths in
> a lighter shade as "designed."

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
        +uuid id
        +string ticket_code
        +uuid reported_by
        +uuid lab_id
        +uuid station_id
        +string category
        +string description
        +TicketPriority priority
        +TicketStatus status
        +HandlerRole current_handler
    }
    class Lab {
        +uuid id
        +string name
        +string location
        +int station_count
    }
    class Station {
        +uuid id
        +uuid lab_id
        +int station_number
        +string status
    }
    class TicketAssignment {
        +uuid id
        +uuid ticket_id
        +uuid assigned_to
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

    User "1" --> "0..*" Ticket : reports
    Lab "1" --> "0..*" Station : has
    Lab "1" --> "0..*" Ticket : locates
    Station "0..1" --> "0..*" Ticket : at
    Ticket "1" --> "0..*" TicketAssignment : via
    User "1" --> "0..*" TicketAssignment : assigned
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
    St->>P: Category + description → Submit
    P->>L: createTicket({ lab, station?, category, description })
    L->>DB: INSERT INTO tickets (reported_by = auth.uid())
    DB-->>L: new ticket row
    P->>L: refresh (loadAll)
    L-->>P: updated ticket list
    P-->>St: Ticket shown in "My Tickets"
```

---

## 4. Entity-Relationship Diagram (ERD)

The database backbone — how a ticket links to the student, lab, and station.

```mermaid
erDiagram
    AUTH_USERS ||--|| USERS : "1:1 (id)"
    USERS ||--o{ TICKETS : "reports"
    LABS ||--o{ STATIONS : "has"
    LABS ||--o{ TICKETS : "located in"
    STATIONS ||--o{ TICKETS : "at (optional)"
    TICKETS ||--o{ TICKET_ASSIGNMENTS : "assigned via"
    USERS ||--o{ TICKET_ASSIGNMENTS : "assigned to"

    USERS {
        uuid id PK
        string email
        string fullname
        string role "student|nas|it|cpe_faculty"
        string student_or_staff_id
        string program
    }
    LABS {
        uuid id PK
        string name
        string location
        int station_count
    }
    STATIONS {
        uuid id PK
        uuid lab_id FK
        int station_number
        string status "operational|flagged|offline"
    }
    TICKETS {
        uuid id PK
        string ticket_code
        uuid reported_by FK
        uuid lab_id FK
        uuid station_id FK
        string category
        string priority "normal|high"
        string status "open|in_progress|resolved"
        string current_handler "nas|it"
    }
    TICKET_ASSIGNMENTS {
        uuid id PK
        uuid ticket_id FK
        uuid assigned_to FK
    }
```

> Full column-level schema, types, and RLS notes: [../DATA_MODEL.md](../DATA_MODEL.md).
