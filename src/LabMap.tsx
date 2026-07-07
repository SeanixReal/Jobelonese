import React, { useEffect, useState } from "react";
import {
  getStations,
  addStation,
  deleteStation,
  bulkAddStations,
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

export default function LabMap({
  labs,
  selectedLabId,
  onSelectLabId,
  activeTickets,
  onViewTicket,
  onReportIssueAtStation,
}: LabMapProps) {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  const [newStationNumber, setNewStationNumber] = useState("");
  const [bulkStart, setBulkStart] = useState("");
  const [bulkEnd, setBulkEnd] = useState("");
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (selectedLabId) {
      loadStations(selectedLabId);
    }
  }, [selectedLabId]);

  const loadStations = async (labId: number) => {
    setLoading(true);
    setActionError("");
    try {
      const data = await getStations(labId.toString());
      setStations(data);
    } catch (err: any) {
      console.error(err);
      setActionError("Failed to load stations.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLabId || !newStationNumber.trim()) return;
    setActionError("");
    try {
      const num = newStationNumber.trim();
      // Check duplicate local first
      if (stations.some((s) => s.station_number.toLowerCase() === num.toLowerCase())) {
        setActionError(`Station ${num} already exists in this lab.`);
        return;
      }
      const added = await addStation(selectedLabId, num);
      setStations((prev) => [...prev, added].sort((a, b) => a.station_number.localeCompare(b.station_number, undefined, { numeric: true })));
      setNewStationNumber("");
    } catch (err: any) {
      setActionError(err.message || "Failed to add station.");
    }
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLabId || !bulkStart.trim() || !bulkEnd.trim()) return;
    setActionError("");
    try {
      const startNum = parseInt(bulkStart.trim(), 10);
      const endNum = parseInt(bulkEnd.trim(), 10);
      if (isNaN(startNum) || isNaN(endNum) || startNum > endNum) {
        setActionError("Invalid range values.");
        return;
      }
      const toAdd: string[] = [];
      for (let i = startNum; i <= endNum; i++) {
        // Pad with leading zero if needed, match length of start or end
        const length = Math.max(bulkStart.trim().length, bulkEnd.trim().length);
        const strNum = String(i).padStart(length, "0");
        if (!stations.some((s) => s.station_number === strNum)) {
          toAdd.push(strNum);
        }
      }
      if (toAdd.length === 0) {
        setActionError("All stations in this range already exist.");
        return;
      }
      await bulkAddStations(selectedLabId, toAdd);
      await loadStations(selectedLabId);
      setBulkStart("");
      setBulkEnd("");
    } catch (err: any) {
      setActionError(err.message || "Failed to bulk add stations.");
    }
  };

  const handleDeleteStation = async (stationId: number) => {
    if (!confirm("Are you sure you want to delete this station? All related ticket assignments will lose their station link.")) return;
    setActionError("");
    try {
      await deleteStation(stationId);
      setStations((prev) => prev.filter((s) => s.id !== stationId));
      if (selectedStation?.id === stationId) {
        setSelectedStation(null);
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to delete station.");
    }
  };

  // Find ticket associated with a station
  const getStationStatus = (stationId: number) => {
    const tickets = activeTickets.filter(
      (t) => t.station_id === stationId && t.status !== "resolved"
    );
    if (tickets.length === 0) return { color: "green", label: "Operational", tickets };
    
    // If any ticket is escalated / assigned to IT
    const hasEscalated = tickets.some((t) => t.current_handler === "it" || t.priority === "high");
    if (hasEscalated) {
      return { color: "red", label: "Urgent / Escalated", tickets };
    }
    return { color: "yellow", label: "In progress", tickets };
  };

  return (
    <div className="lab-map-container">
      <div className="lab-selector-header">
        <div className="form-group-row">
          <label htmlFor="lab-select-dropdown" className="form-label-inline">Select Laboratory Room:</label>
          <select
            id="lab-select-dropdown"
            className="input-select select-lab-map"
            value={selectedLabId || ""}
            onChange={(e) => onSelectLabId(Number(e.target.value))}
          >
            <option value="" disabled>-- Choose a Lab --</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {selectedLabId && (
          <div className="lab-legend">
            <span className="legend-item"><span className="dot dot-green"></span> Operational</span>
            <span className="legend-item"><span className="dot dot-yellow"></span> In progress</span>
            <span className="legend-item"><span className="dot dot-red"></span> Escalated / Urgent</span>
          </div>
        )}
      </div>

      {actionError && <div className="toast toast-error">{actionError}</div>}

      {selectedLabId ? (
        <div className="lab-map-layout">
          {/* Main Grid View */}
          <div className="grid-section">
            <div className="section-title-row">
              <h3>Station Layout Map</h3>
              <span className="badge-count">{stations.length} Registered Stations</span>
            </div>
            {loading ? (
              <div className="map-loading">Loading lab layout...</div>
            ) : stations.length === 0 ? (
              <div className="empty-map-state">
                <p>No stations have been registered for this laboratory yet.</p>
                <p className="text-muted">Use the station manager on the right to populate the room grid.</p>
              </div>
            ) : (
              <div className="stations-grid">
                {stations.map((station) => {
                  const status = getStationStatus(station.id);
                  const isSelected = selectedStation?.id === station.id;
                  return (
                    <button
                      key={station.id}
                      type="button"
                      className={`station-tile tile-${status.color} ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedStation(station)}
                    >
                      <div className="station-number">{station.station_number}</div>
                      {status.tickets.length > 0 && (
                        <div className="active-ticket-count-pill">{status.tickets.length}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar Editor / Info Pane */}
          <div className="editor-section">
            {selectedStation ? (
              <div className="pane-card selected-station-pane animate-fade-in">
                <div className="pane-header">
                  <div>
                    <h4>Station {selectedStation.station_number}</h4>
                    <span className="text-muted">Room: {labs.find((l) => l.id === selectedLabId)?.name}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-delete-station"
                    onClick={() => handleDeleteStation(selectedStation.id)}
                  >
                    Delete Station
                  </button>
                </div>

                <div className="pane-body">
                  {(() => {
                    const status = getStationStatus(selectedStation.id);
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
                                  selectedStation.id,
                                  selectedStation.station_number
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
                <p>Click any station tile in the grid to inspect details, view active tickets, or delete it.</p>
              </div>
            )}

            {/* Admin Station Creation Tools */}
            <div className="pane-card station-admin-tools">
              <h4>Register Station</h4>
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
                <p className="form-help-text">Generate a range of stations (e.g. 1 to 24).</p>
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
      ) : (
        <div className="no-lab-selected-state">
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
              d="M9 6.75V15m6-6v8.25m.503 3.446 6.002-3.466a2.25 2.25 0 0 0 0-3.897L15.503 4.382a2.25 2.25 0 0 0-2.253 0L7.248 7.854a2.25 2.25 0 0 0 0 3.897l6.003 3.466a2.25 2.25 0 0 0 2.252 0Z"
            />
          </svg>
          <p>Please select a laboratory room from the dropdown menu to display the grid layout map.</p>
        </div>
      )}
    </div>
  );
}
