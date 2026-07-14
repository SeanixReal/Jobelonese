import React, { useEffect, useRef, useState } from "react";
import {
  getStations,
  addStation,
  deleteStation,
  bulkAddStations,
  normalizeStationNumber,
} from "./lib.ts";
import type { Lab, Station, TicketWithDetails } from "./lib.ts";

interface LabMapProps {
  labs: Lab[];
  selectedLabId: number | null;
  onSelectLabId: (id: number) => void;
  activeTickets: TicketWithDetails[];
  onViewTicket: (ticket: TicketWithDetails) => void;
  onReportIssueAtStation: (stationId: number, stationNumber: string) => void;
}

function MonitorIcon() {
  return (
    <svg className="tile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" strokeLinecap="round" />
    </svg>
  );
}

interface SelectedStationInfo {
  station: Station;
  labId: number;
}

const ALL_LABS = "all" as const;
type LabFilterValue = number | typeof ALL_LABS;

export default function LabMap({
  labs,
  selectedLabId,
  onSelectLabId,
  activeTickets,
  onViewTicket,
  onReportIssueAtStation,
}: LabMapProps) {
  // Stations for every lab, keyed by lab id.
  const [stationsByLab, setStationsByLab] = useState<Record<number, Station[]>>({});
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const [selected, setSelected] = useState<SelectedStationInfo | null>(null);

  // Which lab(s) are currently visible in the grid view. Defaults to
  // whatever the parent has selected, or "all" if nothing is selected yet.
  const [filterLabId, setFilterLabId] = useState<LabFilterValue>(
    selectedLabId ?? ALL_LABS
  );

  // Which lab the admin tools (add/bulk-add station) act on.
  const [adminLabId, setAdminLabId] = useState<number | null>(labs[0]?.id ?? null);
  const [newStationNumber, setNewStationNumber] = useState("");
  const [bulkStart, setBulkStart] = useState("");
  const [bulkEnd, setBulkEnd] = useState("");
  const stationLoadRequest = useRef(0);

  useEffect(() => {
    loadAllStations();
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [labs]);

  useEffect(() => {
    if (adminLabId === null && labs.length > 0) {
      setAdminLabId(labs[0].id);
    }
  }, [labs, adminLabId]);

  // When the parent navigates here targeting a specific lab (e.g. clicking
  // "Inspect Map" on the dashboard), narrow the grid view to that room.
  useEffect(() => {
    if (selectedLabId !== null) {
      setFilterLabId(selectedLabId);
    }
  }, [selectedLabId]);

  const loadAllStations = async () => {
    const requestId = ++stationLoadRequest.current;
    if (labs.length === 0) {
      setStationsByLab({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setActionError("");
    try {
      const results = await Promise.all(
        labs.map(async (lab) => {
          const data = await getStations(lab.id.toString());
          return [lab.id, data] as const;
        })
      );
      if (requestId !== stationLoadRequest.current) return;
      const next: Record<number, Station[]> = {};
      results.forEach(([labId, data]) => {
        next[labId] = data;
      });
      setStationsByLab(next);
    } catch (err: any) {
      console.error(err);
      if (requestId === stationLoadRequest.current) setActionError("Failed to load stations.");
    } finally {
      if (requestId === stationLoadRequest.current) setLoading(false);
    }
  };

  const reloadLab = async (labId: number) => {
    try {
      const data = await getStations(labId.toString());
      setStationsByLab((prev) => ({ ...prev, [labId]: data }));
    } catch (err: any) {
      setActionError(err.message || "Failed to reload stations.");
    }
  };

  const handleAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminLabId || !newStationNumber.trim()) return;
    setActionError("");
    try {
      const num = normalizeStationNumber(newStationNumber);
      const existing = stationsByLab[adminLabId] ?? [];
      if (existing.some((s) => normalizeStationNumber(s.station_number).toLowerCase() === num.toLowerCase())) {
        setActionError(`Station ${num} already exists in this lab.`);
        return;
      }
      const added = await addStation(adminLabId, num);
      setStationsByLab((prev) => ({
        ...prev,
        [adminLabId]: [...(prev[adminLabId] ?? []), added].sort((a, b) =>
          a.station_number.localeCompare(b.station_number, undefined, { numeric: true })
        ),
      }));
      setNewStationNumber("");
    } catch (err: any) {
      setActionError(err.message || "Failed to add station.");
    }
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminLabId || !bulkStart.trim() || !bulkEnd.trim()) return;
    setActionError("");
    try {
      const startNum = parseInt(bulkStart.trim(), 10);
      const endNum = parseInt(bulkEnd.trim(), 10);
      if (isNaN(startNum) || isNaN(endNum) || startNum > endNum) {
        setActionError("Invalid range values.");
        return;
      }
      const existing = stationsByLab[adminLabId] ?? [];
      const existingKeys = new Set(
        existing.map((station) => normalizeStationNumber(station.station_number).toLowerCase())
      );
      const toAdd: string[] = [];
      for (let i = startNum; i <= endNum; i++) {
        const length = Math.max(bulkStart.trim().length, bulkEnd.trim().length);
        const strNum = String(i).padStart(length, "0");
        if (!existingKeys.has(strNum.toLowerCase())) {
          toAdd.push(strNum);
        }
      }
      if (toAdd.length === 0) {
        setActionError("All stations in this range already exist.");
        return;
      }
      await bulkAddStations(adminLabId, toAdd);
      await reloadLab(adminLabId);
      setBulkStart("");
      setBulkEnd("");
    } catch (err: any) {
      setActionError(err.message || "Failed to bulk add stations.");
    }
  };

  const handleDeleteStation = async (labId: number, stationId: number) => {
    if (!confirm("Are you sure you want to delete this station? All related ticket assignments will lose their station link.")) return;
    setActionError("");
    try {
      await deleteStation(stationId);
      setStationsByLab((prev) => ({
        ...prev,
        [labId]: (prev[labId] ?? []).filter((s) => s.id !== stationId),
      }));
      if (selected?.station.id === stationId) {
        setSelected(null);
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to delete station.");
    }
  };

  const getStationStatus = (stationId: number) => {
    const tickets = activeTickets.filter(
      (t) => t.station_id === stationId && t.status !== "resolved"
    );
    if (tickets.length === 0) return { color: "green", label: "Operational", tickets };

    const hasEscalated = tickets.some((t) => t.current_handler === "it" || t.priority === "high");
    if (hasEscalated) {
      return { color: "red", label: "Urgent / Escalated", tickets };
    }
    return { color: "yellow", label: "In progress", tickets };
  };

  const selectedLabName = selected ? labs.find((l) => l.id === selected.labId)?.name : undefined;

  // Labs visible in the grid, based on the "All Labs" / specific room filter.
  const visibleLabs =
    filterLabId === ALL_LABS ? labs : labs.filter((l) => l.id === filterLabId);

  const totalVisibleStations = visibleLabs.reduce(
    (sum, lab) => sum + (stationsByLab[lab.id]?.length ?? 0),
    0
  );

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === ALL_LABS) {
      setFilterLabId(ALL_LABS);
    } else {
      const id = Number(value);
      setFilterLabId(id);
      onSelectLabId(id);
    }
  };

  return (
    <div className="lab-map-container">
      {actionError && <div className="toast toast-error">{actionError}</div>}

      {labs.length === 0 ? (
        <div className="no-lab-selected-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 6.75V15m6-6v8.25m.503 3.446 6.002-3.466a2.25 2.25 0 0 0 0-3.897L15.503 4.382a2.25 2.25 0 0 0-2.253 0L7.248 7.854a2.25 2.25 0 0 0 0 3.897l6.003 3.466a2.25 2.25 0 0 0 2.252 0Z"
            />
          </svg>
          <p>No laboratories are registered yet. Add one from Lab Manager to see it here.</p>
        </div>
      ) : (
        <>
          {/* Filter Header — All Labs vs Specific Room */}
          <div className="lab-selector-header">
            <div className="form-group-row">
              <label htmlFor="lab-filter-select" className="form-label-inline">
                Viewing
              </label>
              <select
                id="lab-filter-select"
                className="input-select select-lab-map"
                value={filterLabId === ALL_LABS ? ALL_LABS : filterLabId}
                onChange={handleFilterChange}
              >
                <option value={ALL_LABS}>All Labs ({labs.length} rooms)</option>
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <span className="badge-count">
                {totalVisibleStations} station{totalVisibleStations === 1 ? "" : "s"}
              </span>
            </div>

            <div className="lab-legend">
              <span className="legend-item"><span className="dot dot-green"></span> ok</span>
              <span className="legend-item"><span className="dot dot-yellow"></span> in progress</span>
              <span className="legend-item"><span className="dot dot-red"></span> Urgent/Escalated</span>
            </div>
          </div>

          <div className="lab-map-layout">
            {/* Visible labs, stacked */}
            <div className="all-labs-column">
              {loading && Object.keys(stationsByLab).length === 0 ? (
                <div className="map-loading">Loading lab layouts...</div>
              ) : visibleLabs.length === 0 ? (
                <div className="empty-map-state">
                  <p>No lab matches the current filter.</p>
                </div>
              ) : (
                visibleLabs.map((lab) => {
                  const stations = stationsByLab[lab.id] ?? [];
                  return (
                    <div className="grid-section" key={lab.id}>
                      <div className="grid-header-row">
                        <h3 className="grid-header-title">
                          <b>{lab.name}</b> · floor status
                        </h3>
                        <span className="badge-count">{stations.length} stations</span>
                      </div>

                      {stations.length === 0 ? (
                        <div className="empty-map-state">
                          <p>No stations registered for this lab yet.</p>
                          <p className="text-muted">Use the station manager on the right to add some.</p>
                        </div>
                      ) : (
                        <div className="stations-grid">
                          {stations.map((station) => {
                            const status = getStationStatus(station.id);
                            const isSelected = selected?.station.id === station.id;
                            return (
                              <button
                                key={station.id}
                                type="button"
                                className={`station-tile tile-${status.color} ${isSelected ? "selected" : ""}`}
                                onClick={() => setSelected({ station, labId: lab.id })}
                              >
                                <MonitorIcon />
                                <span className="tile-label">{station.station_number}</span>
                                {status.tickets.length > 0 && (
                                  <div className="active-ticket-count-pill">{status.tickets.length}</div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Sidebar Editor / Info Pane */}
            <div className="editor-section">
              {selected ? (
                <div className="pane-card selected-station-pane animate-fade-in">
                  <div className="pane-header">
                    <div>
                      <h4>Station {selected.station.station_number}</h4>
                      <span className="text-muted">Room: {selectedLabName}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-delete-station"
                      onClick={() => handleDeleteStation(selected.labId, selected.station.id)}
                    >
                      Delete Station
                    </button>
                  </div>

                  <div className="pane-body">
                    {(() => {
                      const status = getStationStatus(selected.station.id);
                      return (
                        <>
                          <div className="status-indicator">
                            <span className={`dot dot-${status.color}`}></span>
                            <strong>Status: {status.label}</strong>
                          </div>

                          {status.tickets.length > 0 ? (
                            <div className="station-active-tickets">
                              <h5>Active Tickets</h5>
                              <div className="ticket-pane-list">
                                {status.tickets.map((t) => (
                                  <div key={t.id} className="ticket-pane-item">
                                    <div className="ticket-pane-header">
                                      <span className="ticket-pane-id">{t.id}</span>
                                      <span className={`status-pill ${t.status === "in_progress" ? "status-progress" : "status-open"}`}>
                                        {t.status === "in_progress" ? "In progress" : "Open"}
                                      </span>
                                    </div>
                                    <p className="ticket-pane-issue">{t.issue}</p>
                                    <div className="ticket-pane-footer">
                                      <span className="priority-tag">{t.priority}</span>
                                      <button
                                        type="button"
                                        className="btn btn-primary btn-xs"
                                        onClick={() => onViewTicket(t)}
                                      >
                                        Manage Ticket
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="station-no-tickets-state">
                              <p>No active issues reported for this station.</p>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm btn-report-here"
                                onClick={() =>
                                  onReportIssueAtStation(
                                    selected.station.id,
                                    selected.station.station_number
                                  )
                                }
                              >
                                Report an Issue Here
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="pane-card placeholder-pane">
                  <p>Click any station tile in any lab to inspect details, view active tickets, or delete it.</p>
                </div>
              )}

              {/* Admin Station Creation Tools — acts on whichever lab is picked here */}
              <div className="pane-card station-admin-tools">
                <h4>Register Station</h4>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label htmlFor="admin-lab-select">Lab</label>
                  <select
                    id="admin-lab-select"
                    className="input-select"
                    value={adminLabId ?? ""}
                    onChange={(e) => setAdminLabId(Number(e.target.value))}
                  >
                    {labs.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <form onSubmit={handleAddStation} className="form-station-add">
                  <div className="form-row-inline">
                    <input
                      type="text"
                      className="input-field inline-input"
                      placeholder="e.g. 05"
                      value={newStationNumber}
                      onChange={(e) => setNewStationNumber(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn btn-primary btn-sm">
                      Add
                    </button>
                  </div>
                </form>

                <hr className="divider-soft" />

                <h4>Bulk Add Stations</h4>
                <form onSubmit={handleBulkAdd} className="form-station-bulk">
                  <p className="form-help-text">Generate a range of stations (e.g. 1 to 24) for the lab selected above.</p>
                  <div className="form-row-inline">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      className="input-field inline-input"
                      placeholder="Start"
                      value={bulkStart}
                      onChange={(e) => setBulkStart(e.target.value)}
                      required
                    />
                    <span className="join-dash">to</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      className="input-field inline-input"
                      placeholder="End"
                      value={bulkEnd}
                      onChange={(e) => setBulkEnd(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Generate
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
