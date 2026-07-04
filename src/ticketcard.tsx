import type { CSSProperties } from "react";

export type TicketStatus = "open" | "in-progress" | "resolved";

export interface Ticket {
  id: string;
  status: TicketStatus;
  issue: string;
  location: string;
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  "in-progress": "In progress",
  resolved: "Resolved",
};

const STATUS_CLASS: Record<TicketStatus, string> = {
  open: "status-open",
  "in-progress": "status-progress",
  resolved: "status-resolved",
};

interface TicketCardProps {
  ticket: Ticket;
  className?: string;
  style?: CSSProperties;
}

export default function TicketCard({
  ticket,
  className = "",
  style,
}: TicketCardProps) {
  return (
    <div className={`ticket ${className}`} style={style}>
      <div className="ticket-row">
        <span className="ticket-id">{ticket.id}</span>
        <span className={`status-pill ${STATUS_CLASS[ticket.status]}`}>
          {STATUS_LABEL[ticket.status]}
        </span>
      </div>
      <p className="ticket-issue">{ticket.issue}</p>
      <span className="ticket-loc">{ticket.location}</span>
    </div>
  );
}