import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  getCurrentProfile,
  getLabs,
  getStations,
  getAllTickets,
  getNasUsers,
  getTicketHistory,
  claimTicketAsIt,
  revokeAndReassignTicket,
  resolveTicketWithNotes,
  closeTicket,
  deescalateTicket,
  addLab,
  deleteLab,
  createTicket,
  signOut,
  subscribeToRealtimeChanges,
} from "./lib.ts";
import { TICKET_CATEGORIES } from "./lib.ts";
import type { Lab, Station, TicketWithDetails, Profile } from "./lib.ts";
import LabMap from "./LabMap";
import "./StudentPortal.css";
import "./ITPortal.css";

type ITPortalView =
  | "dashboard"
  | "map"
  | "tickets"
  | "nas"
  | "infrastructure"
  | "report"
  | "profile";

const ISSUE_CATEGORIES = TICKET_CATEGORIES;

export default function ITPortal() {
  const [currentView, setCurrentView] = useState<ITPortalView>("dashboard");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Data States
  const [tickets, setTickets] = useState<TicketWithDetails[]>([]);
  const [nasUsers, setNasUsers] = useState<Profile[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  
  // Loading & Action States
  const [dataLoading, setDataLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Map Navigation Helper
  const [mapSelectedLabId, setMapSelectedLabId] = useState<number | null>(null);

  // Inspector Panel / Modal State
  const [selectedTicket, setSelectedTicket] = useState<TicketWithDetails | null>(null);
  const [ticketHistory, setTicketHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // IT Actions Form Input
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [closedReason, setClosedReason] = useState("");
  const [reassignNasId, setReassignNasId] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  // Add Lab State
  const [newLabName, setNewLabName] = useState("");

  // Submitting Ticket State
  const [reportLabId, setReportLabId] = useState("");
  const [reportStationId, setReportStationId] = useState("");
  const [reportStationsList, setReportStationsList] = useState<Station[]>([]);
  const [reportCategory, setReportCategory] = useState<string>(ISSUE_CATEGORIES[0]);
  const [reportIssue, setReportIssue] = useState("");
  const [reportPriority, setReportPriority] = useState<"normal" | "high">("normal");

  // Filters for Ticket Queue
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterLab, setFilterLab] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const ticketsRef = useRef<TicketWithDetails[]>([]);

  // Sync ticketsRef.current with tickets state
  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  // Realtime delivers changes; the initial bounded query avoids repeatedly
  // downloading the entire staff dataset from every open tab.
  useEffect(() => {
    loadProfile();
    loadAllData();

    // Request browser notification permissions
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const unsubscribe = subscribeToRealtimeChanges(
      [
        { table: "tickets" },
        { table: "users" },
        { table: "labs" },
        { table: "stations" },
        { table: "ticket_history" },
      ],
      () => {
        void refreshDataSilently();
      }
    );

    return () => {
      unsubscribe();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerNotification = (ticket: TicketWithDetails) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      const title = `🚨 Ticket Escalated: ${ticket.id}`;
      const labName = ticket.labs?.name || "Unknown Lab";
      const stNum = ticket.stations?.station_number;
      const location = stNum ? `${labName} · Station ${stNum}` : labName;
      const options = {
        body: `Location: ${location}\nIssue: ${ticket.issue}`,
      };
      new Notification(title, options);
    }
  };

  const loadProfile = async () => {
    try {
      const p = await getCurrentProfile();
      setProfile(p);
      setLoadingProfile(false);
    } catch (err) {
      console.error("Error fetching IT profile:", err);
      setLoadingProfile(false);
    }
  };

  const loadAllData = async () => {
    setDataLoading(true);
    setActionError("");
    try {
      const [tData, nasData, labData] = await Promise.all([
        getAllTickets(),
        getNasUsers(),
        getLabs(),
      ]);
      setTickets(tData);
      setNasUsers(nasData);
      setLabs(labData);
      if (labData.length > 0 && !mapSelectedLabId) {
        setMapSelectedLabId(labData[0].id);
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to load database records.");
    } finally {
      setDataLoading(false);
    }
  };

  const refreshDataSilently = async () => {
    try {
      const [tData, nasData, labData] = await Promise.all([
        getAllTickets(),
        getNasUsers(),
        getLabs(),
      ]);

      // Check for newly escalated tickets
      tData.forEach((t) => {
        if (t.current_handler === "it" && t.status !== "resolved") {
          const isNew = !ticketsRef.current.some((prev) => prev.id === t.id);
          if (isNew) {
            triggerNotification(t);
          }
        }
      });

      setTickets(tData);
      setNasUsers(nasData);
      setLabs(labData);

      // Keep inspected ticket in sync if open
      if (selectedTicket) {
        const updated = tData.find((t) => t.id === selectedTicket.id);
        if (updated) {
          setSelectedTicket(updated);
        }
      }
    } catch (err) {
      console.error("Silent reload failure:", err);
    }
  };

  // Submitting ticket load stations
  useEffect(() => {
    let active = true;
    setReportStationsList([]);
    setReportStationId("");

    if (!reportLabId) {
      return () => {
        active = false;
      };
    }

    getStations(reportLabId)
      .then((nextStations) => {
        if (active) setReportStationsList(nextStations);
      })
      .catch((err) => {
        if (active) setActionError(err instanceof Error ? err.message : "Failed to load stations.");
      });

    return () => {
      active = false;
    };
  }, [reportLabId]);

  // Load ticket log history when ticket is selected
  useEffect(() => {
    if (selectedTicket) {
      setLoadingHistory(true);
      getTicketHistory(selectedTicket.id)
        .then(setTicketHistory)
        .catch(console.error)
        .finally(() => setLoadingHistory(false));
    } else {
      setTicketHistory([]);
    }
    // Reset forms
    setResolutionNotes("");
    setInternalNotes("");
    setClosedReason("");
    setReassignNasId("");
  }, [selectedTicket]);

  const initials = (name?: string) => {
    if (!name) return "IT";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  // IT Actions
  const handleClaimTicket = async (ticketId: string) => {
    setSubmittingAction(true);
    setActionError("");
    try {
      const updated = await claimTicketAsIt(ticketId);
      setSelectedTicket(updated);
      await refreshDataSilently();
      setActionSuccess("Ticket claimed successfully.");
    } catch (err: any) {
      setActionError(err.message || "Failed to claim ticket.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRevokeReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    setSubmittingAction(true);
    setActionError("");
    try {
      const targetNas = reassignNasId || null; // empty string means unassign
      const updated = await revokeAndReassignTicket(
        selectedTicket.id,
        targetNas,
        selectedTicket.assigned_to
      );
      setSelectedTicket(updated);
      await refreshDataSilently();
      setActionSuccess("Ticket assignment updated.");
      setReassignNasId("");
    } catch (err: any) {
      setActionError(err.message || "Failed to reassign ticket.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleResolveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !resolutionNotes.trim()) return;
    setSubmittingAction(true);
    setActionError("");
    try {
      const updated = await resolveTicketWithNotes(
        selectedTicket.id,
        resolutionNotes.trim(),
        internalNotes.trim(),
        selectedTicket.assigned_to
      );
      setSelectedTicket(updated);
      await refreshDataSilently();
      setActionSuccess("Ticket resolved successfully.");
      setResolutionNotes("");
      setInternalNotes("");
    } catch (err: any) {
      setActionError(err.message || "Failed to resolve ticket.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCloseTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !closedReason.trim()) return;
    setSubmittingAction(true);
    setActionError("");
    try {
      const updated = await closeTicket(
        selectedTicket.id,
        closedReason.trim(),
        selectedTicket.assigned_to
      );
      setSelectedTicket(updated);
      await refreshDataSilently();
      setActionSuccess("Ticket closed/rejected.");
      setClosedReason("");
    } catch (err: any) {
      setActionError(err.message || "Failed to close ticket.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDeescalate = async () => {
    if (!selectedTicket) return;
    setSubmittingAction(true);
    setActionError("");
    try {
      const updated = await deescalateTicket(selectedTicket.id, selectedTicket.assigned_to);
      setSelectedTicket(updated);
      await refreshDataSilently();
      setActionSuccess("Ticket returned to NAS queue.");
    } catch (err: any) {
      setActionError(err.message || "Failed to return ticket.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCreateLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabName.trim()) return;
    setActionError("");
    try {
      const added = await addLab(newLabName.trim());
      setLabs((prev) => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)));
      setNewLabName("");
      setActionSuccess("New laboratory registered.");
    } catch (err: any) {
      setActionError(err.message || "Failed to create lab.");
    }
  };

  const handleDeleteLab = async (id: number) => {
    if (!confirm("Are you sure you want to delete this lab room? Doing so deletes all its stations and linked tickets.")) return;
    setActionError("");
    try {
      await deleteLab(id);
      setLabs((prev) => prev.filter((l) => l.id !== id));
      setActionSuccess("Laboratory deleted.");
    } catch (err: any) {
      setActionError(err.message || "Failed to delete lab.");
    }
  };

  const handleReportIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportLabId || !reportIssue.trim()) return;
    setActionError("");
    try {
      await createTicket({
        labId: reportLabId,
        stationId: reportStationId || undefined,
        category: reportCategory,
        issue: reportIssue.trim(),
        priority: reportPriority,
      });
      await refreshDataSilently();
      setActionSuccess("Ticket reported successfully.");
      // reset
      setReportLabId("");
      setReportStationId("");
      setReportIssue("");
      setReportPriority("normal");
      setCurrentView("dashboard");
    } catch (err: any) {
      setActionError(err.message || "Failed to file ticket.");
    }
  };

  // Nav helpers
  const handleViewTicketFromMap = (ticket: TicketWithDetails) => {
    setSelectedTicket(ticket);
    setCurrentView("tickets");
  };

  const handleReportIssueFromMap = (stationId: number, _stationNumber: string) => {
    if (mapSelectedLabId) {
      setReportLabId(mapSelectedLabId.toString());
      // Wait for state update to load stations list before pre-selecting
      setTimeout(() => {
        setReportStationId(stationId.toString());
      }, 100);
      setCurrentView("report");
    }
  };

  // Computed Dashboard Metrics
  const metrics = useMemo(() => {
    const total = tickets.length;
    const openTickets = tickets.filter((t) => t.status === "open");
    const progressTickets = tickets.filter((t) => t.status === "in_progress");
    const resolvedTickets = tickets.filter((t) => t.status === "resolved");

    const escalated = tickets.filter((t) => t.status !== "resolved" && t.current_handler === "it");
    const nasQueue = tickets.filter((t) => t.status !== "resolved" && t.current_handler === "nas");

    // Category distribution
    const categories: Record<string, number> = {};
    tickets.forEach((t) => {
      categories[t.category] = (categories[t.category] || 0) + 1;
    });

    // High priority active
    const activeHigh = tickets.filter((t) => t.status !== "resolved" && t.priority === "high");

    // Lab status / health (number of active tickets per lab)
    const labHealth: Record<number, number> = {};
    tickets.forEach((t) => {
      if (t.status !== "resolved") {
        labHealth[t.lab_id] = (labHealth[t.lab_id] || 0) + 1;
      }
    });

    return {
      total,
      open: openTickets.length,
      inProgress: progressTickets.length,
      resolved: resolvedTickets.length,
      escalated: escalated.length,
      nasQueue: nasQueue.length,
      highPriority: activeHigh.length,
      categories,
      labHealth,
    };
  }, [tickets]);

  // Compute NAS Workloads
  const nasWorkloads = useMemo(() => {
    return nasUsers.map((nas) => {
      const assigned = tickets.filter(
        (t) => t.assigned_to === nas.id && t.status !== "resolved"
      );
      const totalResolved = tickets.filter(
        (t) => t.assigned_to === nas.id && t.status === "resolved"
      );
      return {
        ...nas,
        activeCount: assigned.length,
        resolvedCount: totalResolved.length,
      };
    });
  }, [nasUsers, tickets]);

  // Filtering Tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filterStatus !== "all") {
        if (filterStatus === "escalated") {
          if (t.current_handler !== "it" || t.status === "resolved") return false;
        } else {
          if (t.status !== filterStatus) return false;
        }
      }

      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterLab !== "all" && t.lab_id.toString() !== filterLab) return false;
      if (filterCategory !== "all" && t.category !== filterCategory) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const ticketIdMatches = t.id.toLowerCase().includes(query);
        const issueMatches = t.issue.toLowerCase().includes(query);
        const submitterMatches = t.user?.fullname?.toLowerCase().includes(query) || false;
        const handlerMatches = t.assigned_user?.fullname?.toLowerCase().includes(query) || false;
        return ticketIdMatches || issueMatches || submitterMatches || handlerMatches;
      }
      return true;
    });
  }, [tickets, filterStatus, filterPriority, filterLab, filterCategory, searchQuery]);

  // Location display
  const ticketLocation = (t: TicketWithDetails) => {
    const labName = t.labs?.name || "Unknown Lab";
    const stNum = t.stations?.station_number;
    return stNum ? `${labName} · Station ${stNum}` : labName;
  };

  const getStatusLabel = (t: TicketWithDetails) => {
    if (t.status === "resolved") return "Resolved";
    if (t.current_handler === "it") return "Escalated to IT";
    return t.status === "in_progress" ? "In progress (NAS)" : "Open (NAS Queue)";
  };

  const getStatusBadgeClass = (t: TicketWithDetails) => {
    if (t.status === "resolved") return "badge-status-resolved";
    if (t.current_handler === "it") return "badge-status-escalated";
    return t.status === "in_progress" ? "badge-status-progress" : "badge-status-open";
  };

  if (loadingProfile) {
    return <div className="portal-loading">Authenticating IT Account...</div>;
  }

  const derivedFullName = profile?.fullname || "IT Specialist";

  return (
    <div className="shell">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">IT</div>
          <div>
            TechFix <span className="logo-sub">LAB ADMIN</span>
          </div>
        </div>

        <nav className="nav-group">
          <div className="nav-group-label">OPERATIONS</div>
          <button
            type="button"
            className={`nav-item ${currentView === "dashboard" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("dashboard");
              setSelectedTicket(null);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
              />
            </svg>
            Dashboard
            {metrics.escalated > 0 && <span className="nav-badge">{metrics.escalated} Escalated</span>}
          </button>

          <button
            type="button"
            className={`nav-item ${currentView === "map" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("map");
              setSelectedTicket(null);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 6.75V15m6-6v8.25m.503 3.446 6.002-3.466a2.25 2.25 0 0 0 0-3.897L15.503 4.382a2.25 2.25 0 0 0-2.253 0L7.248 7.854a2.25 2.25 0 0 0 0 3.897l6.003 3.466a2.25 2.25 0 0 0 2.252 0Z"
              />
            </svg>
            Interactive Lab Map
          </button>

          <button
            type="button"
            className={`nav-item ${currentView === "tickets" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("tickets");
              setSelectedTicket(null);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-3-12h.008v.008H13.5V6Zm0 3h.008v.008H13.5V9Zm0 3h.008v.008H13.5v-.008Zm0 3h.008v.008H13.5V15Z"
              />
            </svg>
            Manage Tickets
          </button>

          <div className="nav-group-label">STAFF & LABS</div>
          <button
            type="button"
            className={`nav-item ${currentView === "nas" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("nas");
              setSelectedTicket(null);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
              />
            </svg>
            NAS Workforce
          </button>

          <button
            type="button"
            className={`nav-item ${currentView === "infrastructure" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("infrastructure");
              setSelectedTicket(null);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12v18H3V3Z"
              />
            </svg>
            Lab Manager
          </button>

          <div className="nav-group-label">TICKETING</div>
          <button
            type="button"
            className={`nav-item ${currentView === "report" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("report");
              setSelectedTicket(null);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            File Ticket
          </button>

          <button
            type="button"
            className={`nav-item ${currentView === "profile" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("profile");
              setSelectedTicket(null);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
              />
            </svg>
            Profile
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="mini-profile">
            <div className="avatar">{initials(derivedFullName)}</div>
            <div className="profile-info-block">
              <div className="mini-profile-name">{derivedFullName}</div>
              <div className="mini-profile-role">IT Administrator</div>
            </div>
          </div>
          <button onClick={handleSignOut} className="btn btn-ghost btn-block sign-out-sidebar-btn">
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="main">
        {/* SUCCESS/ERR ALERTS */}
        {actionSuccess && (
          <div className="toast toast-success fade-out-alert">
            <span>{actionSuccess}</span>
            <button type="button" onClick={() => setActionSuccess("")}>×</button>
          </div>
        )}
        {actionError && (
          <div className="toast toast-error">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError("")}>×</button>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 1: DASHBOARD */}
        {/* ========================================== */}
        {currentView === "dashboard" && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">TECHFIX SYSTEMS OVERVIEW</span>
                <h1 className="page-title">Command Center Dashboard</h1>
                <p className="page-sub">Real-time supervision of university computing laboratories.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setDataLoading(true);
                  loadAllData();
                }}
              >
                Sync Data
              </button>
            </div>

            {/* Stat Cards */}
            <div className="stats-grid">
              <div className="stat-card stat-red">
                <span className="stat-label">Escalated to IT</span>
                <span className="stat-num">{metrics.escalated}</span>
                <span className="stat-desc">Requires immediate action</span>
              </div>
              <div className="stat-card stat-orange">
                <span className="stat-label">Pending NAS Queue</span>
                <span className="stat-num">{metrics.nasQueue}</span>
                <span className="stat-desc">Unclaimed open issues</span>
              </div>
              <div className="stat-card stat-blue">
                <span className="stat-label font-bold">Active in progress</span>
                <span className="stat-num">{metrics.inProgress}</span>
                <span className="stat-desc">Tickets currently being handled</span>
              </div>
              <div className="stat-card stat-green">
                <span className="stat-label">Resolved (Total)</span>
                <span className="stat-num">{metrics.resolved}</span>
                <span className="stat-desc">Completed requests</span>
              </div>
            </div>

            <div className="dashboard-charts-layout">
              {/* Lab Health Summary */}
              <div className="chart-panel card-glass">
                <h4>Laboratory Room Status</h4>
                <div className="lab-health-list">
                  {labs.length === 0 ? (
                    <div className="empty-health">No laboratories registered.</div>
                  ) : (
                    labs.map((l) => {
                      const activeCount = metrics.labHealth[l.id] || 0;
                      let healthClass = "health-good";
                      let healthLabel = "Operational (Clean)";
                      if (activeCount > 3) {
                        healthClass = "health-critical";
                        healthLabel = `${activeCount} Active Issues`;
                      } else if (activeCount > 0) {
                        healthClass = "health-warning";
                        healthLabel = `${activeCount} Active Issue${activeCount > 1 ? "s" : ""}`;
                      }

                      return (
                        <div key={l.id} className={`lab-health-row ${healthClass}`}>
                          <div className="lab-health-info">
                            <span className="lab-name">{l.name}</span>
                            <span className="lab-status-text">{healthLabel}</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => {
                              setMapSelectedLabId(l.id);
                              setCurrentView("map");
                            }}
                          >
                            Inspect Map
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Category distribution */}
              <div className="chart-panel card-glass">
                <h4>Common Issues (Categories)</h4>
                <div className="categories-list">
                  {Object.keys(metrics.categories).length === 0 ? (
                    <div className="empty-health">No ticket data available.</div>
                  ) : (
                    Object.entries(metrics.categories)
                      .sort((a, b) => b[1] - a[1])
                      .map(([category, count]) => {
                        const pct = Math.round((count / (metrics.total || 1)) * 100);
                        return (
                          <div key={category} className="category-metric-row">
                            <div className="cat-metric-meta">
                              <span className="cat-name">{category}</span>
                              <span className="cat-count">{count} tickets ({pct}%)</span>
                            </div>
                            <div className="bar-track">
                              <div className="bar-fill" style={{ width: `${pct}%` }}></div>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>

            {/* Quick Activity View */}
            <div className="card-glass dashboard-table-section">
              <div className="section-header">
                <h4>Recent Escalations to IT</h4>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setFilterStatus("escalated");
                    setCurrentView("tickets");
                  }}
                >
                  View All Escalations
                </button>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ticket ID</th>
                      <th>Location</th>
                      <th>Category</th>
                      <th>Issue</th>
                      <th>Reported By</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.filter((t) => t.status !== "resolved" && t.current_handler === "it").length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted">
                          No active tickets are currently escalated to IT.
                        </td>
                      </tr>
                    ) : (
                      tickets
                        .filter((t) => t.status !== "resolved" && t.current_handler === "it")
                        .slice(0, 5)
                        .map((t) => (
                          <tr key={t.id}>
                            <td className="font-mono text-accent">{t.id}</td>
                            <td>{ticketLocation(t)}</td>
                            <td>{t.category}</td>
                            <td className="text-truncate-td" title={t.issue}>{t.issue}</td>
                            <td>{t.user?.fullname || "Unknown"}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-primary btn-xs"
                                onClick={() => setSelectedTicket(t)}
                              >
                                Review
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 2: MAP */}
        {/* ========================================== */}
        {currentView === "map" && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">INTERACTIVE GRID VIEW</span>
                <h1 className="page-title">Laboratory Map Monitor</h1>
                <p className="page-sub">Visualize station health and click tiles to manage reports.</p>
              </div>
            </div>

            <LabMap
              labs={labs}
              selectedLabId={mapSelectedLabId}
              onSelectLabId={setMapSelectedLabId}
              activeTickets={tickets}
              onViewTicket={handleViewTicketFromMap}
              onReportIssueAtStation={handleReportIssueFromMap}
            />
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 3: TICKETS QUEUE & SEARCH */}
        {/* ========================================== */}
        {currentView === "tickets" && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">SUPERVISORY CONTROLS</span>
                <h1 className="page-title">Manage Helpdesk Tickets</h1>
                <p className="page-sub">View, reassign, resolve, or audit tickets across the entire system.</p>
              </div>
            </div>

            <div className="tickets-layout-grid">
              {/* Ticket List Section */}
              <div className="ticket-list-column card-glass">
                {/* Search & Filter Header */}
                <div className="ticket-filters-block">
                  <div className="search-bar-row">
                    <input
                      type="text"
                      className="input-field search-input"
                      placeholder="Search tickets by ID, description, student, or NAS handler..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="filters-grid">
                    <div className="filter-select-group">
                      <label htmlFor="filter-status-select" className="filter-label">Status/Handler</label>
                      <select
                        id="filter-status-select"
                        className="input-select select-sm"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                      >
                        <option value="all">All Statuses</option>
                        <option value="open">Open (NAS Queue)</option>
                        <option value="in_progress">In Progress (NAS)</option>
                        <option value="escalated">Escalated (IT Portal)</option>
                        <option value="resolved">Resolved (Completed)</option>
                      </select>
                    </div>

                    <div className="filter-select-group">
                      <label htmlFor="filter-priority-select" className="filter-label">Priority</label>
                      <select
                        id="filter-priority-select"
                        className="input-select select-sm"
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                      >
                        <option value="all">All Priorities</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                    </div>

                    <div className="filter-select-group">
                      <label htmlFor="filter-lab-select" className="filter-label">Lab Room</label>
                      <select
                        id="filter-lab-select"
                        className="input-select select-sm"
                        value={filterLab}
                        onChange={(e) => setFilterLab(e.target.value)}
                      >
                        <option value="all">All Labs</option>
                        {labs.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="filter-select-group">
                      <label htmlFor="filter-category-select" className="filter-label">Category</label>
                      <select
                        id="filter-category-select"
                        className="input-select select-sm"
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                      >
                        <option value="all">All Categories</option>
                        {ISSUE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Tickets Table */}
                <div className="tickets-list-wrapper">
                  {dataLoading ? (
                    <div className="loading-state">Refreshing database...</div>
                  ) : filteredTickets.length === 0 ? (
                    <div className="empty-results-state">
                      No tickets match the search queries or filters.
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Location</th>
                            <th>Priority</th>
                            <th>Category</th>
                            <th>Assigned To</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTickets.map((t) => {
                            const isSelected = selectedTicket?.id === t.id;
                            return (
                              <tr key={t.id} className={isSelected ? "row-selected" : ""}>
                                <td className="font-mono text-accent font-bold">{t.id}</td>
                                <td>{ticketLocation(t)}</td>
                                <td>
                                  <span className={`priority-pill priority-${t.priority}`}>
                                    {t.priority}
                                  </span>
                                </td>
                                <td className="text-truncate-td" title={t.category}>{t.category}</td>
                                <td className="handler-cell">
                                  {t.assigned_user?.fullname ? (
                                    <span className="text-highlight">{t.assigned_user.fullname}</span>
                                  ) : (
                                    <span className="text-muted">Unassigned</span>
                                  )}
                                </td>
                                <td>
                                  <span className={`status-badge-custom ${getStatusBadgeClass(t)}`}>
                                    {getStatusLabel(t)}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-xs btn-inspect"
                                    onClick={() => setSelectedTicket(t)}
                                  >
                                    Inspect
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Inspector Pane Section */}
              <div className="ticket-inspector-column">
                {selectedTicket ? (
                  <div className="pane-card ticket-inspector-card animate-fade-in">
                    <div className="inspector-title-row">
                      <div>
                        <h3>Ticket details: {selectedTicket.id}</h3>
                        <span className={`status-badge-custom ${getStatusBadgeClass(selectedTicket)}`}>
                          {getStatusLabel(selectedTicket)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-close-pane"
                        onClick={() => setSelectedTicket(null)}
                      >
                        ×
                      </button>
                    </div>

                    <div className="inspector-body">
                      {/* Submitter details */}
                      <div className="details-section-box">
                        <h5>Submitted By</h5>
                        <p className="detail-item">
                          <strong>Name:</strong> {selectedTicket.user?.fullname || "Unknown"}
                        </p>
                        <p className="detail-item">
                          <strong>ID:</strong> {selectedTicket.user?.student_or_staff_id || "N/A"}
                        </p>
                        <p className="detail-item">
                          <strong>Program:</strong> {selectedTicket.user?.program || "N/A"}
                        </p>
                        <p className="detail-item">
                          <strong>Email:</strong> {selectedTicket.user?.email || "N/A"}
                        </p>
                      </div>

                      {/* Issue details */}
                      <div className="details-section-box">
                        <h5>Issue Context</h5>
                        <p className="detail-item">
                          <strong>Location:</strong> {ticketLocation(selectedTicket)}
                        </p>
                        <p className="detail-item">
                          <strong>Category:</strong> {selectedTicket.category}
                        </p>
                        <p className="detail-item">
                          <strong>Priority:</strong> {selectedTicket.priority}
                        </p>
                        <p className="detail-item">
                          <strong>Created:</strong> {new Date(selectedTicket.created_at).toLocaleString()}
                        </p>
                        {selectedTicket.resolved_at && (
                          <p className="detail-item text-green">
                            <strong>Resolved:</strong> {new Date(selectedTicket.resolved_at).toLocaleString()}
                          </p>
                        )}
                        <div className="detail-description-block">
                          <strong>Description:</strong>
                          <p className="issue-desc-text">{selectedTicket.issue}</p>
                        </div>
                      </div>

                      {/* Internal Notes / Custom columns */}
                      {(selectedTicket.resolution_notes || selectedTicket.internal_notes || selectedTicket.closed_reason) && (
                        <div className="details-section-box box-notes">
                          <h5>Resolution & Staff Notes</h5>
                          {selectedTicket.internal_notes && (
                            <p className="detail-item note-highlight">
                              <strong>Internal Notes (Staff Only):</strong> {selectedTicket.internal_notes}
                            </p>
                          )}
                          {selectedTicket.resolution_notes && (
                            <p className="detail-item">
                              <strong>Resolution Notes:</strong> {selectedTicket.resolution_notes}
                            </p>
                          )}
                          {selectedTicket.closed_reason && (
                            <p className="detail-item text-red">
                              <strong>Closed Reason:</strong> {selectedTicket.closed_reason}
                            </p>
                          )}
                        </div>
                      )}

                      {/* IT Super Actions Form */}
                      {selectedTicket.status !== "resolved" && (
                        <div className="details-section-box actions-form-box">
                          <h5>Supervisory Actions</h5>
                          
                          {/* Claim button if not assigned or not current IT */}
                          {selectedTicket.current_handler === "it" && !selectedTicket.assigned_to && (
                            <button
                              type="button"
                              className="btn btn-primary btn-block btn-claim-action"
                              disabled={submittingAction}
                              onClick={() => handleClaimTicket(selectedTicket.id)}
                            >
                              Claim Escalated Ticket
                            </button>
                          )}

                          {/* Reassign NAS */}
                          <form onSubmit={handleRevokeReassign} className="action-form-section">
                            <label htmlFor="reassign-nas-select" className="action-form-label">Revoke / Reassign Ticket</label>
                            <div className="form-row-inline">
                              <select
                                id="reassign-nas-select"
                                className="input-select select-sm inline-input"
                                value={reassignNasId}
                                onChange={(e) => setReassignNasId(e.target.value)}
                                required
                              >
                                <option value="" disabled>-- Choose NAS Agent --</option>
                                <option value="unassign">Unassign / Open Queue</option>
                                {nasUsers.map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {n.fullname} ({nasWorkloads.find((w) => w.id === n.id)?.activeCount || 0} active)
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="btn btn-ghost btn-sm"
                                disabled={submittingAction}
                              >
                                Reassign
                              </button>
                            </div>
                          </form>

                          {/* Resolve Form */}
                          <form onSubmit={handleResolveTicket} className="action-form-section">
                            <label htmlFor="resolution-notes-input" className="action-form-label">Resolve Ticket</label>
                            <input
                              type="text"
                              id="resolution-notes-input"
                              className="input-field input-sm"
                              placeholder="Resolution details for student..."
                              value={resolutionNotes}
                              onChange={(e) => setResolutionNotes(e.target.value)}
                              required
                            />
                            <input
                              type="text"
                              className="input-field input-sm margin-top-5"
                              placeholder="Internal note (optional, staff only)..."
                              value={internalNotes}
                              onChange={(e) => setInternalNotes(e.target.value)}
                            />
                            <button
                              type="submit"
                              className="btn btn-primary btn-sm margin-top-5 btn-block-action"
                              disabled={submittingAction}
                            >
                              Complete & Resolve
                            </button>
                          </form>

                          {/* Close/Reject Form */}
                          <form onSubmit={handleCloseTicket} className="action-form-section">
                            <label htmlFor="closed-reason-input" className="action-form-label">Close / Reject Ticket</label>
                            <div className="form-row-inline">
                              <input
                                type="text"
                                id="closed-reason-input"
                                className="input-field input-sm inline-input"
                                placeholder="Reason (e.g. Duplicate report)..."
                                value={closedReason}
                                onChange={(e) => setClosedReason(e.target.value)}
                                required
                              />
                              <button
                                type="submit"
                                className="btn btn-ghost btn-sm btn-danger-action"
                                disabled={submittingAction}
                              >
                                Reject
                              </button>
                            </div>
                          </form>

                          {/* De-escalate button */}
                          {selectedTicket.current_handler === "it" && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-block margin-top-10 btn-deescalate"
                              disabled={submittingAction}
                              onClick={handleDeescalate}
                            >
                              De-escalate to NAS Queue
                            </button>
                          )}
                        </div>
                      )}

                      {/* Audit Log / History Log */}
                      <div className="details-section-box timeline-section">
                        <h5>Ticket Activity Log</h5>
                        {loadingHistory ? (
                          <div className="mini-loading">Fetching logs...</div>
                        ) : ticketHistory.length === 0 ? (
                          <p className="text-muted text-center font-mono">No history entries logged.</p>
                        ) : (
                          <div className="timeline-trail">
                            {ticketHistory.map((h) => (
                              <div key={h.id} className="timeline-node">
                                <div className="node-marker"></div>
                                <div className="node-content">
                                  <div className="node-header">
                                    <span className="node-action font-bold uppercase">{h.action}</span>
                                    <span className="node-time text-muted">
                                      {new Date(h.created_at).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>
                                  <p className="node-details">{h.details}</p>
                                  <span className="node-actor text-muted">
                                    By: {h.users?.fullname || "System"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pane-card placeholder-pane">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-12 h-12 text-muted"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75m-6 3.75 3 3m0 0 3-3m-3 3V1.5m6 9h.008v.008H16.5v-.008Zm0 3h.008v.008H16.5v-.008Zm0 3h.008v.008H16.5v-.008Z"
                      />
                    </svg>
                    <p>Select any ticket from the database list to inspect full details, reassign, view audit trails, or resolve.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 4: NAS ROSTER */}
        {/* ========================================== */}
        {currentView === "nas" && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">WORKFORCE ROSTER</span>
                <h1 className="page-title">Network Administration Staff (NAS)</h1>
                <p className="page-sub">Monitor student assistant workloads, active tickets, and resolution metrics.</p>
              </div>
            </div>

            <div className="nas-roster-grid">
              {nasWorkloads.length === 0 ? (
                <div className="card-glass placeholder-pane col-span-3">
                  <p>No accounts with role 'nas' are currently registered in the database.</p>
                </div>
              ) : (
                nasWorkloads.map((nas) => (
                  <div key={nas.id} className="nas-member-card card-glass animate-fade-in">
                    <div className="card-top">
                      <div className="avatar-lg">{initials(nas.fullname)}</div>
                      <div>
                        <h4>{nas.fullname}</h4>
                        <span className="staff-id font-mono">ID: {nas.student_or_staff_id || "N/A"}</span>
                      </div>
                    </div>
                    
                    <div className="workload-stats-block">
                      <div className="workload-stat">
                        <span className="num text-highlight">{nas.activeCount}</span>
                        <span className="lbl text-muted">Active Workload</span>
                      </div>
                      <div className="workload-stat">
                        <span className="num text-green">{nas.resolvedCount}</span>
                        <span className="lbl text-muted">Resolved (Total)</span>
                      </div>
                    </div>

                    <div className="card-bottom">
                      <div className="contact-info">
                        <p className="text-truncate" title={nas.email}>
                          <strong>Email:</strong> {nas.email}
                        </p>
                        <p>
                          <strong>Registered:</strong> {new Date(nas.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-block"
                        onClick={() => {
                          setFilterStatus("in_progress");
                          setSearchQuery(nas.fullname);
                          setCurrentView("tickets");
                        }}
                      >
                        Inspect Queue
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 5: LAB & INFRASTRUCTURE MANAGER */}
        {/* ========================================== */}
        {currentView === "infrastructure" && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">INFRASTRUCTURE MANAGER</span>
                <h1 className="page-title">Manage Laboratories</h1>
                <p className="page-sub">Add rooms, delete laboratories, and configure layout maps.</p>
              </div>
            </div>

            <div className="infrastructure-layout">
              {/* Add Lab Form */}
              <div className="card-glass form-card-box">
                <h4>Register New Laboratory Room</h4>
                <form onSubmit={handleCreateLab} className="standard-form">
                  <div className="form-group">
                    <label htmlFor="new-lab-name-input">Laboratory Name / Floor / Room</label>
                    <input
                      type="text"
                      id="new-lab-name-input"
                      className="input-field"
                      placeholder="e.g. GLE - 6F - 601"
                      value={newLabName}
                      onChange={(e) => setNewLabName(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-block">
                    Add Laboratory
                  </button>
                </form>
              </div>

              {/* Lab List Manager */}
              <div className="card-glass list-card-box">
                <h4>Registered Laboratories ({labs.length})</h4>
                <div className="labs-manager-list">
                  {labs.length === 0 ? (
                    <p className="text-muted text-center py-4">No lab rooms registered yet.</p>
                  ) : (
                    labs.map((l) => (
                      <div key={l.id} className="lab-manager-row">
                        <div className="lab-info">
                          <span className="lab-name">{l.name}</span>
                          <span className="lab-date font-mono text-muted">ID: {l.id}</span>
                        </div>
                        <div className="lab-manager-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setMapSelectedLabId(l.id);
                              setCurrentView("map");
                            }}
                          >
                            Edit Map Grid
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-delete-lab"
                            onClick={() => handleDeleteLab(l.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 6: FILE A TICKET */}
        {/* ========================================== */}
        {currentView === "report" && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">TICKET CREATOR</span>
                <h1 className="page-title">File Laboratory Ticket</h1>
                <p className="page-sub">Report equipment failures directly to the queue.</p>
              </div>
            </div>

            <div className="card-glass form-card-standalone">
              <form onSubmit={handleReportIssue} className="standard-form">
                <div className="form-group-row-2">
                  <div className="form-group">
                    <label htmlFor="report-lab-select">Laboratory Room</label>
                    <select
                      id="report-lab-select"
                      className="input-select"
                      value={reportLabId}
                      onChange={(e) => setReportLabId(e.target.value)}
                      required
                    >
                      <option value="" disabled>-- Select Lab --</option>
                      {labs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="report-station-select">Station (Optional)</label>
                    <select
                      id="report-station-select"
                      className="input-select"
                      value={reportStationId}
                      onChange={(e) => setReportStationId(e.target.value)}
                      disabled={!reportLabId}
                    >
                      <option value="">No Station (General Lab Issue)</option>
                      {reportStationsList.map((s) => (
                        <option key={s.id} value={s.id}>
                          Station {s.station_number}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group-row-2">
                  <div className="form-group">
                    <label htmlFor="report-category-select">Issue Category</label>
                    <select
                      id="report-category-select"
                      className="input-select"
                      value={reportCategory}
                      onChange={(e) => setReportCategory(e.target.value)}
                      required
                    >
                      {ISSUE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="report-priority-select">Priority</label>
                    <select
                      id="report-priority-select"
                      className="input-select"
                      value={reportPriority}
                      onChange={(e) => setReportPriority(e.target.value as any)}
                      required
                    >
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="report-issue-textarea">Describe the Equipment Problem</label>
                  <textarea
                    id="report-issue-textarea"
                    rows={5}
                    className="input-field textarea-field"
                    placeholder="Provide details about the issue (e.g. Monitor display turns on but has flickering lines, or keyboard missing 'E' key)..."
                    value={reportIssue}
                    onChange={(e) => setReportIssue(e.target.value)}
                    required
                  ></textarea>
                </div>

                <div className="form-actions-row">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setCurrentView("dashboard")}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Submit Issue Report
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 7: PROFILE */}
        {/* ========================================== */}
        {currentView === "profile" && profile && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">IT ACCOUNT</span>
                <h1 className="page-title">Personal Profile</h1>
                <p className="page-sub">IT administrator authorization credentials and details.</p>
              </div>
            </div>

            <div className="profile-layout-container card-glass animate-fade-in">
              <div className="profile-avatar-section">
                <div className="avatar-huge">{initials(derivedFullName)}</div>
                <h3>{derivedFullName}</h3>
                <span className="badge-status-escalated">IT Administrator</span>
              </div>

              <div className="profile-details-section">
                <h4>System Account Details</h4>
                <div className="profile-details-grid">
                  <div className="profile-detail-card">
                    <span className="lbl text-muted font-bold">Email Address</span>
                    <span className="val">{profile.email}</span>
                  </div>
                  <div className="profile-detail-card">
                    <span className="lbl text-muted font-bold">User Role Authorization</span>
                    <span className="val uppercase font-mono">{profile.role}</span>
                  </div>
                  <div className="profile-detail-card">
                    <span className="lbl text-muted font-bold">Staff Reference ID</span>
                    <span className="val">{profile.student_or_staff_id || "N/A"}</span>
                  </div>
                  <div className="profile-detail-card">
                    <span className="lbl text-muted font-bold">Member Account Since</span>
                    <span className="val">{new Date(profile.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <hr className="divider-soft" />

                <div className="profile-settings-actions">
                  <button onClick={handleSignOut} className="btn btn-ghost btn-signout-huge">
                    Sign Out of TechFix Account
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
