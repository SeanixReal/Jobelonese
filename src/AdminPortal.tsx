import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCurrentProfile,
  getAllUsers,
  updateUserRole,
  deleteUser,
  getAllTicketHistory,
  getAllTickets,
  signOut,
} from "./lib.ts";
import type { Profile, Role, TicketWithDetails } from "./lib.ts";
import "./StudentPortal.css";
import "./ITPortal.css"; // Reuse card layouts, spacing, table designs
import "./AdminPortal.css";

type AdminPortalView = "dashboard" | "users" | "logs" | "settings" | "profile";

export default function AdminPortal() {
  const [currentView, setCurrentView] = useState<AdminPortalView>("dashboard");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Data States
  const [usersList, setUsersList] = useState<Profile[]>([]);
  const [ticketsList, setTicketsList] = useState<TicketWithDetails[]>([]);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  
  // Loading & Error States
  const [loadingData, setLoadingData] = useState(true);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  // Search & Filter for User Management
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // User detail overlay/edit state
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<Role>("student");

  const loadProfile = useCallback(async () => {
    try {
      const p = await getCurrentProfile();
      setProfile(p);
      setLoadingProfile(false);
    } catch (err) {
      console.error("Error fetching admin profile:", err);
      setLoadingProfile(false);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setLoadingData(true);
    setActionError("");
    try {
      const [uData, tData, logData] = await Promise.all([
        getAllUsers(),
        getAllTickets(),
        getAllTicketHistory(),
      ]);
      setUsersList(uData);
      setTicketsList(tData);
      setSystemLogs(logData);
    } catch (err: any) {
      setActionError(err.message || "Failed to load admin records.");
    } finally {
      setLoadingData(false);
    }
  }, []);

  const refreshDataSilently = useCallback(async () => {
    try {
      const [uData, tData, logData] = await Promise.all([
        getAllUsers(),
        getAllTickets(),
        getAllTicketHistory(),
      ]);
      setUsersList(uData);
      setTicketsList(tData);
      setSystemLogs(logData);

      if (editingUser) {
        const updated = uData.find((u) => u.id === editingUser.id);
        if (updated) setEditingUser(updated);
      }
    } catch (err) {
      console.error("Silent reload failed:", err);
    }
  }, [editingUser]);

  useEffect(() => {
    loadProfile();
    loadAllData();

    // Refresh data every 15 seconds
    const interval = setInterval(() => {
      refreshDataSilently();
    }, 15000);

    return () => clearInterval(interval);
  }, [loadProfile, loadAllData, refreshDataSilently]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (editingUser.id === profile?.id) {
      setActionError("You cannot change your own administrator role status.");
      return;
    }
    setSubmittingAction(true);
    setActionError("");
    try {
      const updated = await updateUserRole(editingUser.id, selectedNewRole);
      setEditingUser(null);
      await refreshDataSilently();
      setActionSuccess(`Successfully changed user role for ${updated.fullname} to ${selectedNewRole}.`);
    } catch (err: any) {
      setActionError(err.message || "Failed to update user role.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (userId === profile?.id) {
      alert("You cannot delete your own account.");
      return;
    }
    if (!confirm(`Are you absolutely sure you want to delete user ${userName}? This action removes their profile records entirely.`)) {
      return;
    }
    setSubmittingAction(true);
    setActionError("");
    try {
      await deleteUser(userId);
      setEditingUser(null);
      await refreshDataSilently();
      setActionSuccess(`Successfully removed user account for ${userName}.`);
    } catch (err: any) {
      setActionError(err.message || "Failed to delete user profile.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const initials = (name?: string) => {
    if (!name) return "AD";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  };

  // Computed metrics
  const metrics = useMemo(() => {
    const totalUsers = usersList.length;
    const students = usersList.filter((u) => u.role === "student").length;
    const nas = usersList.filter((u) => u.role === "nas").length;
    const it = usersList.filter((u) => u.role === "it").length;
    const faculty = usersList.filter((u) => u.role === "cpe_faculty" || (u.role as string) === "cpe-faculty").length;
    const admins = usersList.filter((u) => u.role === "admin").length;

    const totalTickets = ticketsList.length;
    const openTickets = ticketsList.filter((t) => t.status === "open").length;
    const progressTickets = ticketsList.filter((t) => t.status === "in_progress").length;
    const resolvedTickets = ticketsList.filter((t) => t.status === "resolved").length;

    return {
      totalUsers,
      students,
      nas,
      it,
      faculty,
      admins,
      totalTickets,
      openTickets,
      progressTickets,
      resolvedTickets,
    };
  }, [usersList, ticketsList]);

  // Filtering users
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      if (roleFilter !== "all") {
        if (roleFilter === "faculty") {
          if (u.role !== "cpe_faculty" && (u.role as string) !== "cpe-faculty") return false;
        } else if (u.role !== roleFilter) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = u.fullname.toLowerCase().includes(q);
        const emailMatch = u.email.toLowerCase().includes(q);
        const idMatch = u.student_or_staff_id?.toLowerCase().includes(q) || false;
        return nameMatch || emailMatch || idMatch;
      }
      return true;
    });
  }, [usersList, roleFilter, searchQuery]);

  if (loadingProfile) {
    return <div className="portal-loading">Authorizing Admin Console...</div>;
  }

  const derivedFullName = profile?.fullname || "TechFix Administrator";

  return (
    <div className="shell">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark admin-mark">AD</div>
          <div>
            TechFix <span className="logo-sub">ADMIN CONSOLE</span>
          </div>
        </div>

        <nav className="nav-group">
          <div className="nav-group-label">SYSTEM CONSOLE</div>
          <button
            type="button"
            className={`nav-item ${currentView === "dashboard" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("dashboard");
              setEditingUser(null);
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
            System Status
          </button>

          <button
            type="button"
            className={`nav-item ${currentView === "users" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("users");
              setEditingUser(null);
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
                d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.947 11.947 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584v-.109A6 6 0 0 1 12 13.5a6 6 0 0 1 5.214 3.07M15 9.75a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Zm0 0a2.25 2.25 0 1 0-4.5 0 2.25 2.25 0 0 0 4.5 0Zm-13.5 0a2.25 2.25 0 1 1 4.5 0 2.25 2.25 0 0 1-4.5 0Z"
              />
            </svg>
            Manage Users
          </button>

          <button
            type="button"
            className={`nav-item ${currentView === "logs" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("logs");
              setEditingUser(null);
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
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-16.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-16.25v16.25"
              />
            </svg>
            System Activity Log
          </button>

          <button
            type="button"
            className={`nav-item ${currentView === "settings" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("settings");
              setEditingUser(null);
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
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
            Security Passcodes
          </button>

          <div className="nav-group-label">ACCOUNT</div>
          <button
            type="button"
            className={`nav-item ${currentView === "profile" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("profile");
              setEditingUser(null);
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
            My Profile
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="mini-profile">
            <div className="avatar admin-avatar">{initials(derivedFullName)}</div>
            <div className="profile-info-block">
              <div className="mini-profile-name">{derivedFullName}</div>
              <div className="mini-profile-role">System Admin</div>
            </div>
          </div>
          <button onClick={handleSignOut} className="btn btn-ghost btn-block sign-out-sidebar-btn">
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="main">
        {/* Alerts */}
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

        {loadingData && (
          <div className="toast toast-info">
            <span>Syncing admin records...</span>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 1: DASHBOARD */}
        {/* ========================================== */}
        {currentView === "dashboard" && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">SYSTEM STATUS</span>
                <h1 className="page-title">Admin Console Overview</h1>
                <p className="page-sub">Global metrics and quick statistics across the entire TechFix app.</p>
              </div>
              <button type="button" className="btn btn-primary" onClick={loadAllData}>
                Sync Database
              </button>
            </div>

            {/* Dashboard metrics */}
            <div className="admin-dashboard-grids">
              {/* User distribution */}
              <div className="card-glass admin-stats-card">
                <h4>User Directory Stats</h4>
                <div className="stat-value-big">{metrics.totalUsers}</div>
                <p className="text-muted margin-bottom-20">Total registered profiles</p>
                
                <div className="dist-list">
                  <div className="dist-item">
                    <span>Students</span>
                    <strong>{metrics.students}</strong>
                  </div>
                  <div className="dist-item">
                    <span>NAS Staff</span>
                    <strong>{metrics.nas}</strong>
                  </div>
                  <div className="dist-item">
                    <span>IT Specialists</span>
                    <strong>{metrics.it}</strong>
                  </div>
                  <div className="dist-item">
                    <span>Faculty members</span>
                    <strong>{metrics.faculty}</strong>
                  </div>
                  <div className="dist-item">
                    <span>Administrators</span>
                    <strong>{metrics.admins}</strong>
                  </div>
                </div>
              </div>

              {/* Ticket totals */}
              <div className="card-glass admin-stats-card">
                <h4>Equipment Tickets Stats</h4>
                <div className="stat-value-big">{metrics.totalTickets}</div>
                <p className="text-muted margin-bottom-20">Total tickets generated</p>

                <div className="dist-list">
                  <div className="dist-item font-bold text-orange">
                    <span>Unresolved / Open</span>
                    <strong>{metrics.openTickets}</strong>
                  </div>
                  <div className="dist-item font-bold text-blue">
                    <span>Active Work</span>
                    <strong>{metrics.progressTickets}</strong>
                  </div>
                  <div className="dist-item font-bold text-green">
                    <span>Resolved</span>
                    <strong>{metrics.resolvedTickets}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Global Recent Logs */}
            <div className="card-glass margin-top-20">
              <div className="section-header-row">
                <h4>System Logs (Recent Events)</h4>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCurrentView("logs")}
                >
                  View All Log Trails
                </button>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Ticket ID</th>
                      <th>Action</th>
                      <th>Performed By</th>
                      <th>Event Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-muted">No activity logs recorded.</td>
                      </tr>
                    ) : (
                      systemLogs.slice(0, 8).map((log) => (
                        <tr key={log.id}>
                          <td className="font-mono text-muted">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="font-mono text-accent">{log.ticket_id}</td>
                          <td>
                            <span className="badge-status-progress font-bold uppercase">{log.action}</span>
                          </td>
                          <td>{log.users?.fullname || "System/Auth"}</td>
                          <td>{log.details || "N/A"}</td>
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
        {/* VIEW 2: MANAGE USERS */}
        {/* ========================================== */}
        {currentView === "users" && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">DIRECTORY MANAGER</span>
                <h1 className="page-title">Manage User Profiles</h1>
                <p className="page-sub">Edit account roles or delete profile configurations.</p>
              </div>
            </div>

            <div className="tickets-layout-grid">
              {/* User List Block */}
              <div className="ticket-list-column card-glass">
                <div className="ticket-filters-block">
                  <div className="search-bar-row">
                    <input
                      type="text"
                      className="input-field search-input"
                      placeholder="Search users by name, email, or Student/Staff ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="filters-grid">
                    <div className="filter-select-group">
                      <label htmlFor="admin-role-filter" className="filter-label">Filter Role</label>
                      <select
                        id="admin-role-filter"
                        className="input-select select-sm"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                      >
                        <option value="all">All Roles</option>
                        <option value="student">Student</option>
                        <option value="nas">NAS Staff</option>
                        <option value="it">IT Specialist</option>
                        <option value="faculty">Faculty Member</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User Name</th>
                        <th>Email Address</th>
                        <th>Student/Staff ID</th>
                        <th>Role Type</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center text-muted">No users matching filter criteria.</td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.id} className={editingUser?.id === u.id ? "row-selected" : ""}>
                            <td className="font-bold">{u.fullname}</td>
                            <td>{u.email}</td>
                            <td className="font-mono text-muted">{u.student_or_staff_id || "N/A"}</td>
                            <td>
                              <span className="badge-status-progress font-mono font-bold uppercase">{u.role}</span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => {
                                  setEditingUser(u);
                                  setSelectedNewRole(u.role as Role);
                                }}
                              >
                                Modify
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* User Editor Panel */}
              <div className="ticket-inspector-column">
                {editingUser ? (
                  <div className="pane-card ticket-inspector-card animate-fade-in">
                    <div className="inspector-title-row">
                      <div>
                        <h3>Manage Profile</h3>
                        <p className="text-muted">{editingUser.fullname}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-close-pane"
                        onClick={() => setEditingUser(null)}
                      >
                        ×
                      </button>
                    </div>

                    <div className="inspector-body">
                      <div className="details-section-box">
                        <h5>Account Details</h5>
                        <p className="detail-item"><strong>Email:</strong> {editingUser.email}</p>
                        <p className="detail-item"><strong>Reference ID:</strong> {editingUser.student_or_staff_id || "N/A"}</p>
                        <p className="detail-item"><strong>Department/Program:</strong> {editingUser.program || "N/A"}</p>
                        <p className="detail-item"><strong>Signed Up:</strong> {new Date(editingUser.created_at).toLocaleString()}</p>
                      </div>

                      <div className="details-section-box actions-form-box">
                        <h5>Edit User Role</h5>
                        <form onSubmit={handleUpdateRole} className="standard-form">
                          <div className="form-group">
                            <label htmlFor="user-new-role-select">Select New System Role</label>
                            <select
                              id="user-new-role-select"
                              className="input-select select-sm"
                              value={selectedNewRole}
                              onChange={(e) => setSelectedNewRole(e.target.value as Role)}
                            >
                              <option value="student">Student</option>
                              <option value="nas">NAS (Scholar)</option>
                              <option value="it">IT Administrator</option>                           
                              <option value="admin">System Admin</option>
                            </select>
                          </div>
                          <button
                            type="submit"
                            className="btn btn-primary btn-sm btn-block"
                            disabled={submittingAction}
                          >
                            Update Role
                          </button>
                        </form>
                      </div>

                      <div className="details-section-box border-danger-box">
                        <h5>Dangerous Actions</h5>
                        <p className="form-help-text">Deleting a user profile permanently removes their database reference. This cannot be undone.</p>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-block btn-delete-lab"
                          disabled={submittingAction}
                          onClick={() => handleDeleteUser(editingUser.id, editingUser.fullname)}
                        >
                          Delete User Account
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pane-card placeholder-pane">
                    <p>Click "Modify" on any user row in the table to change their system role or remove their account.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 3: SYSTEM AUDIT LOG */}
        {/* ========================================== */}
        {currentView === "logs" && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">AUDIT TRAILS</span>
                <h1 className="page-title">System Activity Log</h1>
                <p className="page-sub">Complete histories of all ticket interactions logged in the database.</p>
              </div>
            </div>

            <div className="card-glass">
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time Logged</th>
                      <th>Ticket ID</th>
                      <th>Action performed</th>
                      <th>Performed By</th>
                      <th>Action logs / notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-muted">No logs recorded.</td>
                      </tr>
                    ) : (
                      systemLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="font-mono text-muted">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="font-mono text-accent font-bold">{log.ticket_id}</td>
                          <td>
                            <span className="badge-status-progress font-bold uppercase">{log.action}</span>
                          </td>
                          <td>{log.users?.fullname || "System/Auth"}</td>
                          <td>{log.details || "N/A"}</td>
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
        {/* VIEW 4: SECURITY CONFIG */}
        {/* ========================================== */}
        {currentView === "settings" && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">SECURITY CONTROLS</span>
                <h1 className="page-title">Registration Passcodes</h1>
                <p className="page-sub">Passcodes needed to sign up for privileged roles on TechFix.</p>
              </div>
            </div>

            <div className="card-glass">
              <h4>Active Passcodes Config</h4>
              <p className="text-muted margin-bottom-20">These codes must be entered during account registration to assign roles:</p>

              <div className="passcodes-info-grid">
                <div className="passcode-card card-glass text-center">
                  <h5>NAS Scholar Role</h5>
                  <div className="passcode-display font-mono">Seanix</div>
                </div>

                <div className="passcode-card card-glass text-center">
                  <h5>IT Specialist Role</h5>
                  <div className="passcode-display font-mono">Seanix</div>
                </div>

                <div className="passcode-card card-glass text-center">
                  <h5>System Admin Role</h5>
                  <div className="passcode-display font-mono">Seanix</div>
                </div>
              </div>

              <div className="info-box-general margin-top-20">
                <h5>💡 Note on signup security</h5>
                <p>Students and CPE Faculty do not require a passcode to sign up. Only administrative, technician, and student assistant roles require validation.</p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 5: PROFILE */}
        {/* ========================================== */}
        {currentView === "profile" && profile && (
          <div className="animate-fade-in">
            <div className="topbar">
              <div>
                <span className="page-eyebrow">ADMINISTRATOR ACCOUNT</span>
                <h1 className="page-title">Personal Profile</h1>
                <p className="page-sub">Account details for root console authorization.</p>
              </div>
            </div>

            <div className="profile-layout-container card-glass animate-fade-in">
              <div className="profile-avatar-section">
                <div className="avatar-huge admin-avatar-huge">{initials(derivedFullName)}</div>
                <h3>{derivedFullName}</h3>
                <span className="badge-status-progress uppercase font-bold">SYSTEM ADMIN</span>
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
                    <span className="lbl text-muted font-bold">Account Reference ID</span>
                    <span className="val">{profile.student_or_staff_id || "N/A"}</span>
                  </div>
                  <div className="profile-detail-card">
                    <span className="lbl text-muted font-bold">Created at date</span>
                    <span className="val">{new Date(profile.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <hr className="divider-soft" />

                <div className="profile-settings-actions">
                  <button onClick={handleSignOut} className="btn btn-ghost btn-signout-huge">
                    Sign Out of Admin Console
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
