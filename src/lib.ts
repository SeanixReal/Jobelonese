import { createClient } from "@supabase/supabase-js";

// =========================================================
// CLIENT
// =========================================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// =========================================================
// TYPES
// =========================================================
export type Role = "student" | "nas" | "it" | "cpe_faculty" | "admin";
export type TicketStatus = "open" | "in_progress" | "resolved";
export type TicketPriority = "normal" | "high";
export type HandlerRole = "nas" | "it";

export interface Profile {
  id: string;
  email: string;
  fullname: string;
  role: Role;
  student_or_staff_id: string | null;
  program: string | null;
  created_at: string;
}

// Alias — some components import this as `User` instead of `Profile`.
export type User = Profile;

export interface Lab {
  id: number;
  name: string;
  created_at: string;
}

export interface Station {
  id: number;
  lab_id: number;
  station_number: string;
  created_at: string;
}

export interface Ticket {
  id: string; // e.g. 'TCK-0851' — the primary key itself, DB-generated
  user_id: string;
  issue: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  current_handler: HandlerRole;
  lab_id: number;
  station_id: number | null;
  assigned_to: string | null;
  created_at: string;
  resolved_at: string | null;
  escalated_at: string | null;
  escalated_by: string | null;
  resolution_notes: string | null;
  internal_notes: string | null;
  closed_reason: string | null;
}

export interface TicketWithDetails extends Ticket {
  labs: { name: string } | null;
  stations: { station_number: string } | null;
  user?: { fullname: string; email: string; student_or_staff_id: string | null; program: string | null } | null;
  assigned_user?: { fullname: string; email: string } | null;
}

const TICKET_SELECT = "*, labs(name), stations(station_number), user:users!tickets_user_id_fkey(fullname, email, student_or_staff_id, program), assigned_user:users!tickets_assigned_to_fkey(fullname, email)";

// =========================================================
// AUTH
// =========================================================
export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  studentOrStaffId?: string;
  program?: string;
}

// Matches the sign-up form: full name, email, password, confirm password
// (checked client-side before calling this), and role.
// Note: the metadata key here is `full_name` because that's what your
// handle_new_user() trigger reads via raw_user_meta_data->>'full_name' —
// the trigger then writes it into the `fullname` column. The key and the
// column are allowed to differ; that's intentional, not a bug.
export async function signUp({
  fullName,
  email,
  password,
  role,
  studentOrStaffId,
  program,
}: SignUpInput) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
        student_or_staff_id: studentOrStaffId ?? null,
        program: program ?? null,
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("users").select("*").eq("id", user.id).single();
  if (error) throw error;
  return data;
}

// =========================================================
// TICKETS
// =========================================================
export interface CreateTicketInput {
  labId: string;
  stationId?: string;
  category: string;
  issue: string;
  priority?: TicketPriority;
}

// Matches the "Report an issue" form: lab, station, issue type, description.
// `id` is left out on purpose — the DB default (TCK-0001, TCK-0002, ...)
// fills it in, per the sequence added in extend-tickets.sql.
export async function createTicket(input: CreateTicketInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      user_id: user.id,
      lab_id: Number(input.labId),
      station_id: input.stationId ? Number(input.stationId) : null,
      category: input.category,
      issue: input.issue,
      priority: input.priority ?? "normal",
    })
    .select(TICKET_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as TicketWithDetails;
}

// "My tickets" list — joins lab/station names so the UI doesn't need
// extra round-trips to display a location.
export async function getMyTickets(): Promise<TicketWithDetails[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as unknown as TicketWithDetails[];
}

// NAS "Received tickets" queue — RLS already restricts this to tickets
// where current_handler = 'nas' AND the caller has the nas role.
export async function getNasQueue(): Promise<TicketWithDetails[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("current_handler", "nas")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as unknown as TicketWithDetails[];
}

// IT "Received tickets" queue — includes both tickets forwarded by NAS
// and (per RLS) anything else, since IT has full oversight.
export async function getItQueue(): Promise<TicketWithDetails[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("current_handler", "it")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as unknown as TicketWithDetails[];
}

// "Claim" button — works for both NAS and IT portals. Your real schema
// has no separate ticket_assignments table, so this just sets
// assigned_to directly on the ticket row.
export async function claimTicket(ticketId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("tickets")
    .update({ assigned_to: user.id, status: "in_progress" })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as TicketWithDetails;
}

// "Mark resolved" — usable by whichever staff role currently holds the
// ticket (RLS checks current_handler for NAS, allows anything for IT).
// resolved_at is set automatically by the set_resolved_at trigger.
export async function resolveTicket(ticketId: string) {
  const { data, error } = await supabase
    .from("tickets")
    .update({ status: "resolved" })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as TicketWithDetails;
}

// "Forward to IT" — only valid while current_handler is still 'nas';
// RLS's "NAS can update tickets in their queue" policy enforces that.
// Puts the ticket back to 'open' and clears the NAS assignment so it
// shows up as unclaimed in the IT queue.
export async function forwardTicket(ticketId: string) {
  const { data, error } = await supabase
    .from("tickets")
    .update({ current_handler: "it", status: "open", assigned_to: null })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as TicketWithDetails;
}

// =========================================================
// LABS / STATIONS
// =========================================================
export async function getLabs(): Promise<Lab[]> {
  const { data, error } = await supabase.from("labs").select("*").order("name");
  if (error) throw error;
  return data as Lab[];
}

export async function getStations(labId: string): Promise<Station[]> {
  const { data, error } = await supabase
    .from("stations")
    .select("*")
    .eq("lab_id", Number(labId))
    .order("station_number");

  if (error) throw error;
  return data as Station[];
}

// =========================================================
// IT OPERATIONS / MANAGEMENT
// =========================================================

export async function claimTicketAsIt(ticketId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("tickets")
    .update({ assigned_to: user.id, status: "in_progress", current_handler: "it" })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();

  if (error) throw error;
  await addTicketHistory(ticketId, "claimed", "Claimed by IT staff");
  return data as unknown as TicketWithDetails;
}

export async function revokeAndReassignTicket(ticketId: string, assignedToId: string | null) {
  const updateData: any = { assigned_to: assignedToId };
  if (assignedToId === null) {
    updateData.status = "open";
  } else {
    updateData.status = "in_progress";
  }

  const { data, error } = await supabase
    .from("tickets")
    .update(updateData)
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();

  if (error) throw error;
  await addTicketHistory(ticketId, "reassigned", `Reassigned to ${assignedToId || "unassigned"}`);
  return data as unknown as TicketWithDetails;
}

export async function resolveTicketWithNotes(ticketId: string, resolutionNotes: string, internalNotes?: string) {
  const { data, error } = await supabase
    .from("tickets")
    .update({ 
      status: "resolved", 
      resolution_notes: resolutionNotes, 
      internal_notes: internalNotes || null 
    })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();

  if (error) throw error;
  await addTicketHistory(ticketId, "resolved", `Resolved: ${resolutionNotes}`);
  return data as unknown as TicketWithDetails;
}

export async function closeTicket(ticketId: string, reason: string) {
  const { data, error } = await supabase
    .from("tickets")
    .update({ 
      status: "resolved", 
      closed_reason: reason, 
      resolution_notes: `Closed/Rejected: ${reason}` 
    })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();

  if (error) throw error;
  await addTicketHistory(ticketId, "closed", `Closed: ${reason}`);
  return data as unknown as TicketWithDetails;
}

export async function escalateTicket(ticketId: string, internalNotes?: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("tickets")
    .update({ 
      current_handler: "it", 
      status: "open", 
      assigned_to: null, 
      escalated_at: new Date().toISOString(),
      escalated_by: user?.id || null,
      internal_notes: internalNotes || null
    })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();

  if (error) throw error;
  await addTicketHistory(ticketId, "escalated", `Escalated to IT: ${internalNotes || "No notes"}`);
  return data as unknown as TicketWithDetails;
}

export async function deescalateTicket(ticketId: string) {
  const { data, error } = await supabase
    .from("tickets")
    .update({ 
      current_handler: "nas", 
      status: "open", 
      assigned_to: null 
    })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();

  if (error) throw error;
  await addTicketHistory(ticketId, "deescalated", "Sent back to NAS queue");
  return data as unknown as TicketWithDetails;
}

export async function addTicketHistory(ticketId: string, action: string, details?: string) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("ticket_history").insert({
      ticket_id: ticketId,
      action,
      performed_by: user.id,
      details: details || null,
    });
  } catch (err) {
    console.error("Error writing ticket history:", err);
  }
}

export async function getAllTickets(): Promise<TicketWithDetails[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as unknown as TicketWithDetails[];
}

export async function getNasUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("role", "nas")
    .order("fullname");

  if (error) throw error;
  return data as Profile[];
}

export async function getTicketHistory(ticketId: string) {
  const { data, error } = await supabase
    .from("ticket_history")
    .select("*, users:users(fullname)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

// Lab / Station CRUD
export async function addLab(name: string): Promise<Lab> {
  const { data, error } = await supabase.from("labs").insert({ name }).select().single();
  if (error) throw error;
  return data as Lab;
}

export async function deleteLab(id: number): Promise<void> {
  const { error } = await supabase.from("labs").delete().eq("id", id);
  if (error) throw error;
}

export async function addStation(labId: number, stationNumber: string): Promise<Station> {
  const { data, error } = await supabase
    .from("stations")
    .insert({ lab_id: labId, station_number: stationNumber })
    .select()
    .single();
  if (error) throw error;
  return data as Station;
}

export async function deleteStation(id: number): Promise<void> {
  const { error } = await supabase.from("stations").delete().eq("id", id);
  if (error) throw error;
}

export async function bulkAddStations(labId: number, stationNumbers: string[]): Promise<Station[]> {
  const rows = stationNumbers.map((num) => ({ lab_id: labId, station_number: num }));
  const { data, error } = await supabase.from("stations").insert(rows).select();
  if (error) throw error;
  return data as Station[];
}

// =========================================================
// ADMIN OPERATIONS
// =========================================================

export async function getAllUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("fullname");

  if (error) throw error;
  return data as Profile[];
}

export async function updateUserRole(userId: string, newRole: Role): Promise<Profile> {
  const { data, error } = await supabase
    .from("users")
    .update({ role: newRole })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function deleteUser(userId: string): Promise<void> {
  const { error } = await supabase.from("users").delete().eq("id", userId);
  if (error) throw error;
}

export async function getAllTicketHistory(): Promise<any[]> {
  const { data, error } = await supabase
    .from("ticket_history")
    .select("*, users:users(fullname)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}