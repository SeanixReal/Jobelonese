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
export type Role = "student" | "nas" | "it" | "cpe_faculty";
export type TicketStatus = "open" | "in_progress" | "resolved";
export type TicketPriority = "normal" | "high";
export type HandlerRole = "nas" | "it";

// Updated to perfectly align with your real physical table columns
export interface User {
  id: string;
  email: string;
  fullname: string; // ✅ Changed from full_name to match your trigger function exactly
  role: Role;
  student_or_staff_id: string | null;
  program: string | null;
  created_at: string | null;
  auth_created_at?: string; // ✅ Safe fallback tracking field from auth instance
}

export interface Lab {
  id: string;
  name: string;
  location: string | null;
  station_count: number;
}

export interface Station {
  id: string;
  lab_id: string;
  station_number: number;
  status: "operational" | "flagged" | "offline";
}

export interface Ticket {
  id: string;
  ticket_code: string;
  reported_by: string;
  lab_id: string;
  station_id: string | null;
  category: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  current_handler: HandlerRole;
  created_at: string;
  resolved_at: string | null;
}

export interface TicketWithDetails extends Ticket {
  labs: { name: string } | null;
  stations: { station_number: number } | null;
}

const TICKET_SELECT = "*, labs(name), stations(station_number)";

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

// Updated return mapping to automatically bridge fallback auth data
export async function getCurrentProfile(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("users").select("*").eq("id", user.id).single();
  if (error) throw error;

  if (data) {
    // 1. Map `fullname` column back onto a common runtime value if needed
    if (!data.fullname && user.user_metadata?.full_name) {
      data.fullname = user.user_metadata.full_name;
    }
    // 2. Inject the bulletproof auth record timestamp into the state object 
    // to guarantee "Created At" / "Member Since" never show N/A for older users
    data.auth_created_at = user.created_at;
  }

  return data as User;
}

// =========================================================
// TICKETS
// =========================================================
export interface CreateTicketInput {
  labId: string;
  stationId?: string;
  category: string;
  description: string;
  priority?: TicketPriority;
}

export async function createTicket(input: CreateTicketInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      reported_by: user.id,
      lab_id: input.labId,
      station_id: input.stationId ?? null,
      category: input.category,
      description: input.description,
      priority: input.priority ?? "normal",
    })
    .select()
    .single();

  if (error) throw error;
  return data as Ticket;
}

export async function getMyTickets(): Promise<TicketWithDetails[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as unknown as TicketWithDetails[];
}

export async function getNasQueue(): Promise<TicketWithDetails[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("current_handler", "nas")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as unknown as TicketWithDetails[];
}

export async function getItQueue(): Promise<TicketWithDetails[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("current_handler", "it")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as unknown as TicketWithDetails[];
}

export async function claimTicket(ticketId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { error: assignError } = await supabase
    .from("ticket_assignments")
    .insert({ ticket_id: ticketId, assigned_to: user.id });
  if (assignError) throw assignError;

  const { data, error } = await supabase
    .from("tickets")
    .update({ status: "in_progress" })
    .eq("id", ticketId)
    .select()
    .single();

  if (error) throw error;
  return data as Ticket;
}

export async function resolveTicket(ticketId: string) {
  const { data, error } = await supabase
    .from("tickets")
    .update({ status: "resolved" })
    .eq("id", ticketId)
    .select()
    .single();

  if (error) throw error;
  return data as Ticket;
}

export async function forwardTicket(ticketId: string) {
  const { data, error } = await supabase
    .from("tickets")
    .update({ current_handler: "it", status: "open" })
    .eq("id", ticketId)
    .select()
    .single();

  if (error) throw error;
  return data as Ticket;
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
    .eq("lab_id", labId)
    .order("station_number");

  if (error) throw error;
  return data as Station[];
}