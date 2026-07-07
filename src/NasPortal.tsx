import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  supabase,
  getCurrentProfile,
  getNasQueue,
  createTicket,
  getLabs,
  getStations,
  claimTicket,
  resolveTicket,
  forwardTicket,
  signOut,
} from "./lib.ts";
import type { Lab, User, Station, TicketWithDetails } from "./lib.ts";
import "./StudentPortal.css";

type PortalView = "dashboard" | "report" | "received" | "mine" | "resolved" | "profile";

const ISSUE_TYPES = [
  "Hardware (monitor, mouse, keyboard)",
  "No internet / network",
  "Software / application",
  "Projector / AV equipment",
  "Other",
];

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

const STATUS_CLASS: Record<string, string> = {
  open: "status-open",
  in_progress: "status-progress",
  resolved: "status-resolved",
};

const PRIORITY_CLASS: Record<string, string> = {
  high: "priority-high",
  normal: "priority-normal",
};

function initials(fullName?: string) {
  if (!fullName) return "NA";
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

export default function NasPortal() {
  const [view, setView] = useState<PortalView>("dashboard");

  const [user, setUser] = useState<User | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [queue, setQueue] = useState<TicketWithDetails[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);

  // ---------- report form state ----------
  const [labId, setLabId] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userData, userResult, queueData, labData] = await Promise.all([
        getCurrentProfile(),
        supabase.auth.getUser(),
        getNasQueue(),
        getLabs(),
      ]);
      setUser(userData);
      setUserId(userResult.data.user?.id ?? null);
      setEmail(userResult.data.user?.email ?? "");
      setQueue(queueData);
      setLabs(labData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the NAS dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!labId) {
      setStations([]);
      setStationId("");
      return;
    }
    getStations(labId)
      .then(setStations)
      .catch((err) => setFormError(err.message));
  }, [labId]);

  const received = useMemo(() => queue.filter((t) => t.status === "open"), [queue]);
  const mine = useMemo(
    () => queue.filter((t) => t.status === "in_progress" && t.assigned_to === userId),
    [queue, userId]
  );
  const resolved = useMemo(() => queue.filter((t) => t.status === "resolved"), [queue]);

  const handleClaim = async (ticketId: string) => {
    setActionError(null);
    setBusyTicketId(ticketId);
    try {
      await claimTicket(ticketId);
      await loadAll();
      setView("mine");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't claim that ticket.");
    } finally {
      setBusyTicketId(null);
    }
  };

  const handleResolve = async (ticketId: string) => {
    setActionError(null);
    setBusyTicketId(ticketId);
    try {
      await resolveTicket(ticketId);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't resolve that ticket.");
    } finally {
      setBusyTicketId(null);
    }
  };

  const handleForward = async (ticketId: string) => {
    setActionError(null);
    setBusyTicketId(ticketId);
    try {
      await forwardTicket(ticketId);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't forward that ticket.");
    } finally {
      setBusyTicketId(null);
    }
  };

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
      setView("received");
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

  const derivedFullName = user?.fullname || email.split("@")[0] || "NAS staff";
  const firstName = derivedFullName.split(" ")[0];

  if (loading) {
    return <div className="portal-loading">Loading the NAS dashboard...</div>;
  }

  if (error || !user) {
    return (
      <div className="portal-loading">
        {error ?? "Couldn't load your account."}{" "}
        <button className="btn btn-ghost" onClick={loadAll}>
          Retry
        </button>
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
      key: "received",
      label: "Received tickets",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z" />
        </svg>
      ),
      badge: received.length > 0 ? received.length : undefined,
    },
    {
      key: "mine",
      label: "My tickets",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3 8-8" />
          <path d="M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11" />
        </svg>
      ),
      badge: mine.length > 0 ? mine.length : undefined,
    },
    {
      key: "resolved",
      label: "Resolved tickets",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ),
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

  function TicketRow({ ticket, action }: { ticket: TicketWithDetails; action: "claim" | "work" | "none" }) {
    const busy = busyTicketId === ticket.id;
    return (
      <div className="queue-row">
        <span className="ticket-id-badge">{ticket.id}</span>
        <div>
          <p className="queue-issue-title">{ticket.category}</p>
          <span className="queue-issue-loc">{locationText(ticket)}</span>
        </div>
        <span className={`priority-pill ${PRIORITY_CLASS[ticket.priority] ?? "priority-normal"}`}>
          {ticket.priority}
        </span>
        <span className={`status-pill ${STATUS_CLASS[ticket.status]}`}>
          {STATUS_LABEL[ticket.status]}
        </span>
        {action === "claim" && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => handleClaim(ticket.id)}>
            {busy ? "Claiming..." : "Claim"}
          </button>
        )}
        {action === "work" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => handleResolve(ticket.id)}>
              {busy ? "..." : "Fixed"}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handleForward(ticket.id)}>
              {busy ? "..." : "Forward to IT"}
            </button>
          </div>
        )}
        {action === "none" && <span />}
      </div>
    );
  }

  const reportForm = (
    <div className="card" id="report">
      <div className="card-head">
        <h2 className="card-title">Report an issue</h2>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="row-2">
          <div className="field">
            <label htmlFor="lab">Lab / room</label>
            <select id="lab" value={labId} onChange={(e: ChangeEvent<HTMLSelectElement>) => setLabId(e.target.value)} required>
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
          <select id="category" value={category} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)} required>
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

  return (
    <div className="shell">
      {/* ===================== SIDEBAR ===================== */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">TF</div>
          TechFix<span className="logo-sub">CIT-U · NAS</span>
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
                NAS
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
            <div className="page-eyebrow">NAS dashboard</div>
            <h1 className="page-title">Hi, {firstName}</h1>
            <p className="page-sub">
              {view === "dashboard" && `${received.length} ticket${received.length === 1 ? "" : "s"} waiting in your queue.`}
              {view === "report" && "Flag equipment issues you notice on your rounds."}
              {view === "received" && "New tickets from students and faculty, unclaimed."}
              {view === "mine" && "Tickets you've claimed — fix them or forward to IT."}
              {view === "resolved" && "Tickets you've closed out."}
              {view === "profile" && "Your account details."}
            </p>
          </div>
          {view !== "report" && (
            <button className="btn btn-ghost" onClick={() => setView("report")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Report an issue
            </button>
          )}
        </div>

        {actionError && <p className="form-error">{actionError}</p>}

        {view === "dashboard" && (
          <>
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">Received</div>
                <div className="stat-value accent">{received.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">In progress (mine)</div>
                <div className="stat-value blue">{mine.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Resolved</div>
                <div className="stat-value teal">{resolved.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total in queue</div>
                <div className="stat-value">{queue.length}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2 className="card-title">Received tickets</h2>
                <button className="card-link" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setView("received")}>
                  View all
                </button>
              </div>
              {received.length === 0 && <p className="empty-state">Queue is empty — nice work.</p>}
              {received.slice(0, 5).map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} action="claim" />
              ))}
            </div>
          </>
        )}

        {view === "report" && <div className="content-grid-single">{reportForm}</div>}

        {view === "received" && (
          <div className="card">
            <div className="card-head">
              <h2 className="card-title">Received tickets</h2>
            </div>
            {received.length === 0 && <p className="empty-state">Queue is empty — nice work.</p>}
            {received.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} action="claim" />
            ))}
          </div>
        )}

        {view === "mine" && (
          <div className="card">
            <div className="card-head">
              <h2 className="card-title">My tickets</h2>
            </div>
            {mine.length === 0 && <p className="empty-state">You haven't claimed any tickets yet.</p>}
            {mine.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} action="work" />
            ))}
          </div>
        )}

        {view === "resolved" && (
          <div className="card">
            <div className="card-head">
              <h2 className="card-title">Resolved tickets</h2>
            </div>
            {resolved.length === 0 && <p className="empty-state">Nothing resolved yet.</p>}
            {resolved.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} action="none" />
            ))}
          </div>
        )}

        {view === "profile" && (
          <div className="content-grid-single">
            <div className="card">
              <div className="card-head">
                <h2 className="card-title">User Account</h2>
              </div>
              <div className="profile-header" style={{ marginBottom: "20px" }}>
                <div className="avatar-lg">{initials(derivedFullName)}</div>
                <div>
                  <p className="profile-name">{derivedFullName}</p>
                  <span className="profile-role" style={{ textTransform: "uppercase" }}>
                    NAS
                  </span>
                </div>
              </div>
              <div className="profile-detail">
                <span className="profile-detail-label">Email Address</span>
                <span className="profile-detail-value">{email || "Not Found"}</span>
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
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}