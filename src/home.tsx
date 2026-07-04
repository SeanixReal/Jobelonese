import TicketCard, { type Ticket } from "./ticketcard";

export type View = "home" | "signin" | "signup" | "portal";

interface HomeProps {
  goTo: (view: View) => void;
}

const heroTickets: Ticket[] = [
  { id: "TCK-0847", status: "open", issue: "Monitor won't turn on", location: "COMP LAB 3 · STATION 12" },
  { id: "TCK-0846", status: "in-progress", issue: "No internet connection", location: "IT LAB 1 · STATION 04" },
  { id: "TCK-0839", status: "resolved", issue: "Projector bulb replaced", location: "AVR 201" },
];

interface Step {
  num: string;
  title: string;
  body: string;
}

const steps: Step[] = [
  { num: "01 / SUBMIT", title: "Scan or report", body: "Scan the QR code at any station, or submit online in one click — no login required to flag an issue." },
  { num: "02 / TRACK", title: "Watch it move", body: "IT staff see it hit the live dashboard instantly. You watch the same ticket move from open to in progress." },
  { num: "03 / RESOLVE", title: "Get confirmation", body: "Once it's fixed, the ticket closes with a timestamp — logged for maintenance history, not lost in a chat thread." },
];

interface AudienceCard {
  tag: string;
  title: string;
  body: string;
}

const audience: AudienceCard[] = [
  { tag: "Reports issues", title: "Students", body: "Flag a broken station in the seconds before class starts, without hunting for a staff member." },
  { tag: "Resolves tickets", title: "IT department", body: "Work a single prioritized queue across every lab instead of scattered chat messages." },
  { tag: "Maintains labs", title: "NAS & lab personnel", body: "Non-academic scholars staffing the labs log recurring issues without paper forms." },
  { tag: "Monitors classes", title: "Cpe faculty", body: "Check a lab's status before a session and report equipment issues found mid-class." },
];

const businessCards: Step[] = [
  { num: "COST", title: "Running it", body: "Hosting, ongoing maintenance, and cybersecurity for a system handling account and lab data." },
  { num: "REVENUE", title: "Sustaining it", body: "Initial investment plus a SaaS subscription model for continued access and support." },
  { num: "ADVANTAGE", title: "Why it sticks", body: "Built specifically for computer lab operations, integrated into existing CIT-U workflows, and mobile-friendly." },
];

export default function Home({ goTo }: HomeProps) {
  return (
    <div>
      <nav className="nav">
        <div className="logo">
          <div className="logo-mark">TF</div>
          TechFix<span className="logo-sub">CIT-U</span>
        </div>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#audience">Who it's for</a>
          <a href="#cost">Pricing</a>
        </div>
        <div className="nav-actions">
          <button className="btn btn-ghost" onClick={() => goTo("signin")}>
            Sign in
          </button>
          <button className="btn btn-primary" onClick={() => goTo("signup")}>
            Get started
          </button>
        </div>
      </nav>

      <div className="hero">
        <div>
          <div className="eyebrow">CIT-U computer lab support</div>
          <h1 className="hero-title">
            Scan a ticket.
            <br />
            Not a <em>queue</em>.
          </h1>
          <p className="hero-sub">
            TechFix replaces paper logs, group chats, and guesswork with one live ticket queue
            for every computer lab across CIT-U — from a dead mouse in Comp Lab 3 to a frozen PC
            before finals.
          </p>
          <div className="hero-ctas">
            <button className="btn btn-primary" onClick={() => goTo("signup")}>
              Create an account
            </button>
            <button className="btn btn-ghost" onClick={() => goTo("signin")}>
              I already have one
            </button>
          </div>
          <div className="hero-meta">
            <div className="meta-item">
              <span className="meta-num">4</span>lab locations covered
            </div>
            <div className="meta-item">
              <span className="meta-num">&lt;10min</span>avg. first response
            </div>
            <div className="meta-item">
              <span className="meta-num">1-click</span>issue reporting
            </div>
          </div>
        </div>

        <div className="ticket-stack">
          <TicketCard ticket={heroTickets[0]} className="ticket-1" />
          <TicketCard ticket={heroTickets[1]} className="ticket-2" />
          <TicketCard ticket={heroTickets[2]} className="ticket-3" />
        </div>
      </div>

      <section id="how">
        <div className="section-head">
          <div className="section-label">How it works</div>
          <h2 className="section-title">From broken to fixed, in three steps</h2>
          <p className="section-desc">
            The same flow whether you're a student flagging a dead mouse or an IT staffer
            clearing the queue between classes.
          </p>
        </div>
        <div className="steps">
          {steps.map((step) => (
            <div className="step" key={step.num}>
              <div className="step-num">{step.num}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="audience">
        <div className="section-head">
          <div className="section-label">Built for CIT-U</div>
          <h2 className="section-title">One system, every lab role</h2>
        </div>
        <div className="audience-grid">
          {audience.map((card) => (
            <div className="audience-card" key={card.title}>
              <div className="audience-tag">{card.tag}</div>
              <h4>{card.title}</h4>
              <p>{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="cost">
        <div className="section-head">
          <div className="section-label">The business side</div>
          <h2 className="section-title">Cost structure & revenue stream</h2>
        </div>
        <div className="steps">
          {businessCards.map((card) => (
            <div className="step" key={card.num}>
              <div className="step-num">{card.num}</div>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer>
        <div className="footer-credit">
          <b>Designed for</b> Cebu Institute of Technology — University
          <br />
          <b>Designed by</b> Conde, Seanpaul Vincent · Mahinay, Jobelon A. · Orejela, Prince
          Daniel R. · Magdadaro, Adrianne
        </div>  
        <div className="footer-credit">TCK-0001 · TechFix prototype · 6/2026</div>
      </footer>
    </div>
  );
}