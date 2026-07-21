import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  supabase,
  getCurrentProfile,
  getMyTickets,
  createTicket,
  getLabs,
  getStations,
  getUserFacingErrorMessage,
  signOut,
  subscribeToRealtimeChanges,
  TICKET_CATEGORIES,
} from "./lib.ts";
import type { Lab, User, Station, TicketStatus, TicketWithDetails } from "./lib.ts";
import "./StudentPortal.css";

type PortalView = "dashboard" | "report" | "tickets" | "profile";

const ISSUE_TYPES = TICKET_CATEGORIES;

const PROGRESS_STEPS: { key: TicketStatus; label: string }[] = [
  { key: "open", label: "Submitted" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
];

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

const STATUS_CLASS: Record<TicketStatus, string> = {
  open: "status-open",
  in_progress: "status-progress",
  resolved: "status-resolved",
};

function initials(fullName?: string) {
  if (!fullName) return "ST";
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function locationText(ticket: TicketWithDetails) {
  const lab = ticket.labs?.name ?? "Unknown lab";
  const station = ticket.stations?.station_number;
  return station ? `${lab} · STATION ${station}` : lab;
}

export default function StudentPortal() {
  // ---------- view state ----------
  const [view, setView] = useState<PortalView>("dashboard");

  // ---------- data state ----------
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [tickets, setTickets] = useState<TicketWithDetails[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------- report form state ----------
  const [labId, setLabId] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const userData = await getCurrentProfile();
      if (!userData) throw new Error("Your session has expired. Please sign in again.");

      const userResult = await supabase.auth.getUser();
      if (userResult.error) throw userResult.error;

      const [ticketData, labData] = await Promise.all([getMyTickets(), getLabs()]);
      setUser(userData);
      setEmail(userResult.data.user?.email ?? "");
      setTickets(ticketData);
      setLabs(labData);
    } catch (err) {
      setError(getUserFacingErrorMessage(err, "Failed to load your dashboard."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    let active = true;
    const unsubscribe = subscribeToRealtimeChanges(
      [{ table: "tickets", filter: `user_id=eq.${user.id}` }],
      () => {
        void getMyTickets()
          .then((nextTickets) => {
            if (active) setTickets(nextTickets);
          })
          .catch((err) => {
            if (active) setError(err instanceof Error ? err.message : "Failed to refresh your tickets.");
          });
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    setStations([]);
    setStationId("");

    if (!labId) {
      return () => {
        active = false;
      };
    }

    getStations(labId)
      .then((nextStations) => {
        if (active) setStations(nextStations);
      })
      .catch((err) => {
        if (active) setFormError(err.message);
      });

    return () => {
      active = false;
    };
  }, [labId]);

  const stats = useMemo(
    () => ({
      open: tickets.filter((t) => t.status === "open").length,
      inProgress: tickets.filter((t) => t.status === "in_progress").length,
      resolved: tickets.filter((t) => t.status === "resolved").length,
    }),
    [tickets]
  );

  const focusTicket = useMemo(
    () => tickets.find((t) => t.status === "in_progress") ?? null,
    [tickets]
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (!labId || !category || !description) {
      setFormError("Fill in the required fields before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      await createTicket({
        labId,
        stationId: stationId || undefined,
        category,
        issue: description,
      });
      setLabId("");
      setStationId("");
      setCategory("");
      setDescription("");
      await loadAll();
      setJustSubmitted(true);
      setView("tickets");
      setTimeout(() => setJustSubmitted(false), 4000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error logging out.");
    }
  };

  const derivedFullName = user?.fullname || email.split("@")[0] || "User";
  const firstName = derivedFullName.split(" ")[0];
  const activeTimestamp = user?.created_at;

  if (loading) {
    return <div className="portal-loading">Loading your dashboard...</div>;
  }

  if (error || !user) {
    return (
      <div className="portal-loading portal-error">
        <div className="portal-error-content">
          <p role="alert">{error ?? "Couldn't load your account profile details."}</p>
          <div className="portal-error-actions">
            <button className="btn btn-ghost" onClick={loadAll}>
              Retry
            </button>
            <button className="btn btn-ghost" onClick={() => void handleLogout()}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems: { key: PortalView; label: string; icon: ReactNode; badge?: number }[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      ),
    },
    {
      key: "report",
      label: "Report an issue",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
    {
      key: "tickets",
      label: "My tickets",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z" />
        </svg>
      ),
      badge: stats.open > 0 ? stats.open : undefined,
    },
    {
      key: "profile",
      label: "Profile",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      ),
    },
  ];

  const reportForm = (
    <div className="card" id="report">
      <div className="card-head">
        <h2 className="card-title">Report an issue</h2>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="row-2">
          <div className="field">
            <label htmlFor="lab">Lab / room</label>
            <select
              id="lab"
              value={labId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setLabId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select a location
              </option>
              {labs.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="station">Station no.</label>
            <select
              id="station"
              value={stationId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setStationId(e.target.value)}
              disabled={!labId || stations.length === 0}
            >
              <option value="">Not station-specific</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  Station {station.station_number}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="category">Issue type</label>
          <select
            id="category"
            value={category}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)}
            required
          >
            <option value="" disabled>
              Select an issue type
            </option>
            {ISSUE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="desc">Description</label>
          <textarea
            id="desc"
            placeholder="Briefly describe what's wrong..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        {formError && <p className="form-error">{formError}</p>}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit ticket"}
        </button>
      </form>
    </div>
  );

  const ticketList = (
    <div className="card" id="tickets">
      <div className="card-head">
        <h2 className="card-title">My tickets</h2>
      </div>
      {justSubmitted && <p className="form-success">Ticket submitted — it's now with NAS.</p>}
      <div>
        {tickets.length === 0 && (
          <p className="empty-state">No tickets yet — report an issue to see it here.</p>
        )}
        {tickets.map((ticket) => (
          <div className="ticket-row" key={ticket.id}>
            <span className="ticket-id-badge">{ticket.id}</span>
            <div className="ticket-info">
              <p className="ticket-info-title">{ticket.category}</p>
              <span className="ticket-info-loc">{locationText(ticket)}</span>
            </div>
            <span className={`status-pill ${STATUS_CLASS[ticket.status]}`}>
              {STATUS_LABEL[ticket.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const profileCard = (
    <div className="card" id="profile">
      <div className="card-head">
        <h2 className="card-title">User Account</h2>
      </div>

      <div className="profile-header" style={{ marginBottom: "20px" }}>
        <div className="avatar-lg">{initials(derivedFullName)}</div>
        <div>
          <p className="profile-name">{derivedFullName}</p>
          <span className="profile-role" style={{ textTransform: "uppercase" }}>
            {user?.role ?? "STUDENT"}
          </span>
        </div>
      </div>

      <div className="profile-detail">
        <span className="profile-detail-label">Email Address</span>
        <span className="profile-detail-value">{email || "Not Found"}</span>
      </div>

      <div className="profile-detail">
        <span className="profile-detail-label">System Role Assigned</span>
        <span className="profile-detail-value" style={{ textTransform: "capitalize" }}>
          {user?.role?.replace("_", " ") ?? "Student"}
        </span>
      </div>

      <div className="profile-detail">
        <span className="profile-detail-label">Student / Staff ID</span>
        <span className="profile-detail-value">{user?.student_or_staff_id ?? "N/A"}</span>
      </div>

      <div className="profile-detail">
        <span className="profile-detail-label">Program / Department</span>
        <span className="profile-detail-value">{user?.program ?? "None Assigned"}</span>
      </div>

      <div className="profile-detail">
        <span className="profile-detail-label">Member Since</span>
        <span className="profile-detail-value">
          {activeTimestamp
            ? new Date(activeTimestamp).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "N/A"}
        </span>
      </div>
    </div>
  );

  const progressCard = focusTicket && (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">In progress</h2>
        <span className="ticket-id-badge">{focusTicket.id}</span>
      </div>
      <p className="ticket-info-title" style={{ marginBottom: 2 }}>
        {focusTicket.category}
      </p>
      <span className="ticket-info-loc">{locationText(focusTicket)}</span>

      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: `${
              ((PROGRESS_STEPS.findIndex((s) => s.key === focusTicket.status) + 1) /
                PROGRESS_STEPS.length) *
              100
            }%`,
          }}
        />
      </div>
      <div className="progress-steps">
        {PROGRESS_STEPS.map((step, i) => {
          const currentIndex = PROGRESS_STEPS.findIndex((s) => s.key === focusTicket.status);
          return (
            <span
              key={step.key}
              className={`progress-step ${i < currentIndex ? "done" : ""} ${
                i === currentIndex ? "current" : ""
              }`}
            >
              {step.label}
            </span>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="shell">
      {/* ===================== SIDEBAR ===================== */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">TF</div>
          TechFix<span className="logo-sub">CIT-U</span>
        </div>

        <div className="nav-group-label">Menu</div>
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item nav-item-button ${view === item.key ? "active" : ""}`}
            onClick={() => setView(item.key)}
          >
            {item.icon}
            {item.label}
            {item.badge !== undefined && <span className="nav-badge">{item.badge}</span>}
          </button>
        ))}

        <div className="sidebar-footer">
          <div className="mini-profile" style={{ marginBottom: "12px" }}>
            <div className="avatar">{initials(derivedFullName)}</div>
            <div>
              <div className="mini-profile-name">{derivedFullName}</div>
              <div className="mini-profile-role" style={{ textTransform: "uppercase" }}>
                {user?.role ?? "STUDENT"}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="btn btn-ghost nav-item"
            style={{ width: "100%", justifyContent: "flex-start", color: "#ff4d4d", gap: "12px", border: "none", cursor: "pointer" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ===================== MAIN ===================== */}
      <main className="main">
        <div className="topbar">
          <div>
            <div className="page-eyebrow">Welcome back</div>
            <h1 className="page-title">Hi, {firstName}</h1>
            <p className="page-sub">
              {view === "dashboard" && "Here's what's happening with your reported issues."}
              {view === "report" && "Tell us what's wrong and we'll route it to the right team."}
              {view === "tickets" && "Every issue you've reported, and where it stands."}
              {view === "profile" && "Your account details."}
            </p>
          </div>
          {view !== "report" && (
            <button className="btn btn-primary" onClick={() => setView("report")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Report an issue
            </button>
          )}
        </div>

        {view === "dashboard" && (
          <>
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">Open tickets</div>
                <div className="stat-value accent">{stats.open}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">In progress</div>
                <div className="stat-value blue">{stats.inProgress}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Resolved</div>
                <div className="stat-value teal">{stats.resolved}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total tickets</div>
                <div className="stat-value">{tickets.length}</div>
              </div>
            </div>

            <div className="content-grid">
              <div>{ticketList}</div>
              <div>
                {progressCard}
                {profileCard}
              </div>
            </div>
          </>
        )}

        {view === "report" && <div className="content-grid-single">{reportForm}</div>}

        {view === "tickets" && <div className="content-grid-single">{ticketList}</div>}

        {view === "profile" && <div className="content-grid-single">{profileCard}</div>}
      </main>
    </div>
  );
}
