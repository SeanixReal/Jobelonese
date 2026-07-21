import { createClient } from "@supabase/supabase-js";

// =========================================================
// CLIENT
// =========================================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configuredAuthRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// CIT-U accounts use the institution's exact email domain. Keep this value in
// the shared layer so the sign-up UI and the auth call apply the same rule.
export const CIT_EMAIL_DOMAIN = "cit.edu";

export function isCitEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${CIT_EMAIL_DOMAIN}`);
}

export function getAuthRedirectUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;

  const currentUrl = `${window.location.origin}${window.location.pathname}`;
  if (!configuredAuthRedirectUrl) return currentUrl;

  try {
    const redirectUrl = new URL(configuredAuthRedirectUrl, window.location.origin);
    if (redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:") return currentUrl;

    redirectUrl.pathname = window.location.pathname || "/";
    redirectUrl.search = "";
    redirectUrl.hash = "";
    return redirectUrl.toString();
  } catch {
    return currentUrl;
  }
}

export type AuthRedirectState = "verification" | "error" | null;

export function getAuthRedirectState(): AuthRedirectState {
  if (typeof window === "undefined") return null;

  const parameterSets = [
    new URLSearchParams(window.location.search),
    new URLSearchParams(window.location.hash.replace(/^#/, "")),
  ];

  if (
    parameterSets.some(
      (params) => params.has("error") || params.has("error_code") || params.has("error_description")
    )
  ) {
    return "error";
  }

  const type = parameterSets.map((params) => params.get("type")).find(Boolean);
  return type === "signup" ? "verification" : null;
}

// =========================================================
// STATION QR DEEP LINKS
// =========================================================
// A printable QR sticker on each PC encodes a link back to the app with the
// lab (and optional station) in the query string. Scanning it with a phone
// camera opens TechFix and pre-fills the "Report an issue" form for that exact
// computer. See buildStationTicketUrl / readStationTicketIntent below.
export interface StationTicketIntent {
  labId: string;
  stationId: string | null;
}

/** Build the absolute URL a station QR code should encode. */
export function buildStationTicketUrl(labId: number | string, stationId?: number | string | null): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const params = new URLSearchParams();
  params.set("lab", String(labId));
  if (stationId !== undefined && stationId !== null && String(stationId) !== "") {
    params.set("station", String(stationId));
  }
  return `${origin}${pathname}?${params.toString()}`;
}

// A scanned intent is stashed here so it survives the sign-up email
// confirmation round-trip, which strips the query string from the URL.
const STATION_INTENT_KEY = "techfix:station-intent";
const STATION_INTENT_TTL_MS = 60 * 60 * 1000; // 1 hour

function parseStationIntentFromUrl(): StationTicketIntent | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const labParam = params.get("lab");
  if (!labParam || !/^\d+$/.test(labParam)) return null;

  const stationParam = params.get("station");
  const stationId = stationParam && /^\d+$/.test(stationParam) ? stationParam : null;
  return { labId: labParam, stationId };
}

/**
 * Capture a station/lab intent from the current URL into storage, if present.
 * Call this once at app startup — before any auth redirect can drop the query
 * string — so a brand-new user who scans, signs up, and confirms their email
 * still lands on the right pre-filled form.
 */
export function persistStationTicketIntent(): void {
  const intent = parseStationIntentFromUrl();
  if (!intent) return;
  try {
    window.localStorage.setItem(
      STATION_INTENT_KEY,
      JSON.stringify({ ...intent, ts: Date.now() })
    );
  } catch {
    // Storage unavailable (private mode / disabled) — the URL still carries the
    // intent for same-tab flows, so this is a best-effort enhancement only.
  }
}

/**
 * Read a station/lab "report here" intent — from the current URL first, then
 * from storage (within a TTL) as a fallback for the post-confirmation redirect.
 * Only returns positive integer ids, so a malformed link is ignored.
 */
export function readStationTicketIntent(): StationTicketIntent | null {
  const fromUrl = parseStationIntentFromUrl();
  if (fromUrl) return fromUrl;

  try {
    const raw = window.localStorage.getItem(STATION_INTENT_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StationTicketIntent & { ts?: number };
    if (!stored?.labId || !/^\d+$/.test(stored.labId)) return null;
    if (!stored.ts || Date.now() - stored.ts > STATION_INTENT_TTL_MS) {
      window.localStorage.removeItem(STATION_INTENT_KEY);
      return null;
    }
    const stationId = stored.stationId && /^\d+$/.test(stored.stationId) ? stored.stationId : null;
    return { labId: stored.labId, stationId };
  } catch {
    return null;
  }
}

/** Clear the intent from both the URL and storage after it is consumed. */
export function clearStationTicketIntent(): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.delete("lab");
  url.searchParams.delete("station");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);

  try {
    window.localStorage.removeItem(STATION_INTENT_KEY);
  } catch {
    // ignore
  }
}

export type RealtimeTable = "users" | "labs" | "stations" | "tickets" | "ticket_history";

export interface RealtimeSubscription {
  table: RealtimeTable;
  filter?: string;
}

/**
 * Subscribe to database changes and return a cleanup function for React
 * effects. RLS remains the authorization boundary for every event delivered
 * by Supabase Realtime; the optional filter only reduces the events received.
 */
export function subscribeToRealtimeChanges(
  subscriptions: readonly RealtimeSubscription[],
  onChange: () => void
): () => void {
  const channelKey = subscriptions.map(({ table }) => table).join("-");
  const channel = supabase.channel(
    `techfix-realtime-${channelKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  subscriptions.forEach(({ table, filter }) => {
    const changeConfig = filter
      ? { event: "*" as const, schema: "public" as const, table, filter }
      : { event: "*" as const, schema: "public" as const, table };

    channel.on("postgres_changes", changeConfig, () => onChange());
  });

  void channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.error(`Supabase Realtime subscription failed (${status}).`);
    }
  });

  return () => {
    void supabase.removeChannel(channel);
  };
}

// =========================================================
// TYPES
// =========================================================
export type Role = "student" | "nas" | "it" | "cpe_faculty" | "admin";
export type TicketStatus = "open" | "in_progress" | "resolved";
export type TicketPriority = "normal" | "high";
export type HandlerRole = "nas" | "it";

export const TICKET_CATEGORIES = [
  "Hardware (monitor, mouse, keyboard)",
  "No internet / network",
  "Software / application",
  "Projector / AV equipment",
  "Other",
] as const;

export const MAX_TICKET_ISSUE_LENGTH = 2000;
export const STAFF_PAGE_SIZE = 100;

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

// `tickets` also has a composite lab/station relationship. Name the direct
// station FK explicitly so PostgREST does not treat this embed as ambiguous.
const TICKET_SELECT = "id, user_id, issue, category, priority, status, current_handler, lab_id, station_id, assigned_to, created_at, resolved_at, escalated_at, escalated_by, resolution_notes, internal_notes, closed_reason, labs(name), stations:stations!tickets_station_id_fkey(station_number), user:users!tickets_user_id_fkey(fullname, email, student_or_staff_id, program), assigned_user:users!tickets_assigned_to_fkey(fullname, email)";

// =========================================================
// AUTH
// =========================================================
export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
  studentOrStaffId?: string;
  program?: string;
}

// Matches the sign-up form: full name, email, password, confirm password
// (checked client-side before calling this), student/staff ID, and program.
// Note: the metadata key here is `full_name` because that's what your
// handle_new_user() trigger reads via raw_user_meta_data->>'full_name' —
// the trigger then writes it into the `fullname` column. The key and the
// column are allowed to differ; that's intentional, not a bug.
export async function signUp({
  fullName,
  email,
  password,
  studentOrStaffId,
  program,
}: SignUpInput) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isCitEmail(normalizedEmail)) {
    throw new Error(`Use a CIT-U email ending in @${CIT_EMAIL_DOMAIN}.`);
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
      data: {
        full_name: fullName,
        student_or_staff_id: studentOrStaffId ?? null,
        program: program ?? null,
      },
    },
  });

  if (error) throw error;
  return data;
}

export class ProfileNotReadyError extends Error {
  constructor() {
    super(
      "Your CIT-U account is verified, but its TechFix profile is missing. Ask an administrator to run the database profile repair, then retry."
    );
    this.name = "ProfileNotReadyError";
  }
}

interface ErrorLike {
  code?: string;
  message?: string;
}

function isErrorLike(value: unknown): value is ErrorLike {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as { code?: unknown; message?: unknown };
  return (
    (candidate.code === undefined || typeof candidate.code === "string") &&
    (candidate.message === undefined || typeof candidate.message === "string")
  );
}

export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ProfileNotReadyError) return error.message;

  const errorLike = isErrorLike(error) ? error : null;
  switch (errorLike?.code) {
    case "42501":
    case "PGRST301":
      return "TechFix could not read the data needed for this page. Ask an administrator to check the database permissions, then retry.";
    case "42P01":
    case "PGRST204":
      return "The TechFix database setup is incomplete. Ask an administrator to apply the database migration, then retry.";
    case "PGRST116":
      return "Your TechFix account profile is missing. Ask an administrator to run the database profile repair, then retry.";
    default:
      break;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  if (errorLike?.message?.trim()) return errorLike.message;
  return fallback;
}

export async function resendSignupConfirmation(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isCitEmail(normalizedEmail)) {
    throw new Error(`Use a CIT-U email ending in @${CIT_EMAIL_DOMAIN}.`);
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalizedEmail,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });

  if (error) throw error;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isCitEmail(normalizedEmail)) {
    throw new Error(`Use a CIT-U email ending in @${CIT_EMAIL_DOMAIN}.`);
  }

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: getAuthRedirectUrl(),
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("This reset link is invalid or has expired. Request a new one.");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ProfileNotReadyError();
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

  const labId = Number(input.labId);
  const stationId = input.stationId ? Number(input.stationId) : null;
  const category = input.category.trim();
  const issue = input.issue.trim();

  if (!Number.isSafeInteger(labId) || labId <= 0) {
    throw new Error("Choose a valid laboratory.");
  }
  if (stationId !== null && (!Number.isSafeInteger(stationId) || stationId <= 0)) {
    throw new Error("Choose a valid station.");
  }
  if (!TICKET_CATEGORIES.includes(category as (typeof TICKET_CATEGORIES)[number])) {
    throw new Error("Choose a valid issue category.");
  }
  if (!issue || issue.length > MAX_TICKET_ISSUE_LENGTH) {
    throw new Error(`Describe the issue using 1 to ${MAX_TICKET_ISSUE_LENGTH} characters.`);
  }
  if (input.priority !== undefined && input.priority !== "normal" && input.priority !== "high") {
    throw new Error("Choose a valid priority.");
  }

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      user_id: user.id,
      lab_id: labId,
      station_id: stationId,
      category,
      issue,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("user_id", user.id)
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
function asTicketConflict(error: { code?: string; message?: string }): Error {
  if (error.code === "P0001") {
    return new Error(error.message || "This ticket changed. Refresh and try again.");
  }
  return new Error(error.message || "Ticket update failed.");
}

async function runTicketAction(
  functionName: string,
  parameters: Record<string, string | null | undefined>
): Promise<TicketWithDetails> {
  const { data, error } = await supabase.rpc(functionName, parameters).select(TICKET_SELECT).single();
  if (error) throw asTicketConflict(error);
  return data as unknown as TicketWithDetails;
}

export async function claimTicket(ticketId: string) {
  return runTicketAction("claim_ticket", { p_ticket_id: ticketId });
}

// NAS staff can release only their own in-progress ticket back to the NAS queue.
export async function cancelNasClaim(ticketId: string) {
  return runTicketAction("cancel_nas_claim", { p_ticket_id: ticketId });
}

// "Mark resolved" — usable by whichever staff role currently holds the
// ticket (RLS checks current_handler for NAS, allows anything for IT).
// resolved_at is set automatically by the set_resolved_at trigger.
export async function resolveTicket(ticketId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return runTicketAction("complete_ticket", {
    p_ticket_id: ticketId,
    p_expected_assigned_to: user.id,
    p_resolution_notes: null,
    p_internal_notes: null,
    p_closed_reason: null,
  });
}

// "Forward to IT" — only valid while current_handler is still 'nas';
// RLS's "NAS can update tickets in their queue" policy enforces that.
// Puts the ticket back to 'open' and clears the NAS assignment so it
// shows up as unclaimed in the IT queue.
export async function forwardTicket(ticketId: string) {
  return runTicketAction("forward_ticket_to_it", { p_ticket_id: ticketId });
}

// =========================================================
// LABS / STATIONS
// =========================================================
export async function getLabs(): Promise<Lab[]> {
  const { data, error } = await supabase
    .from("labs")
    .select("id, name, created_at")
    .order("name")
    .limit(STAFF_PAGE_SIZE);
  if (error) throw error;
  return data as Lab[];
}

export async function getStations(labId: string): Promise<Station[]> {
  const { data, error } = await supabase
    .from("stations")
    .select("id, lab_id, station_number, created_at")
    .eq("lab_id", Number(labId))
    .order("station_number");

  if (error) throw error;
  return data as Station[];
}

// =========================================================
// IT OPERATIONS / MANAGEMENT
// =========================================================

export async function claimTicketAsIt(ticketId: string) {
  return runTicketAction("claim_ticket", { p_ticket_id: ticketId });
}

export async function revokeAndReassignTicket(
  ticketId: string,
  assignedToId: string | null,
  expectedAssignedToId: string | null
) {
  return runTicketAction("reassign_it_ticket", {
    p_ticket_id: ticketId,
    p_assigned_to: assignedToId,
    p_expected_assigned_to: expectedAssignedToId,
  });
}

export async function resolveTicketWithNotes(
  ticketId: string,
  resolutionNotes: string,
  internalNotes: string | undefined,
  expectedAssignedToId: string | null
) {
  return runTicketAction("complete_ticket", {
    p_ticket_id: ticketId,
    p_expected_assigned_to: expectedAssignedToId,
    p_resolution_notes: resolutionNotes,
    p_internal_notes: internalNotes || null,
    p_closed_reason: null,
  });
}

export async function closeTicket(ticketId: string, reason: string, expectedAssignedToId: string | null) {
  return runTicketAction("complete_ticket", {
    p_ticket_id: ticketId,
    p_expected_assigned_to: expectedAssignedToId,
    p_resolution_notes: `Closed/Rejected: ${reason}`,
    p_internal_notes: null,
    p_closed_reason: reason,
  });
}

export async function deescalateTicket(ticketId: string, expectedAssignedToId: string | null) {
  return runTicketAction("return_ticket_to_nas", {
    p_ticket_id: ticketId,
    p_expected_assigned_to: expectedAssignedToId,
  });
}

export async function getAllTickets(limit = STAFF_PAGE_SIZE): Promise<TicketWithDetails[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as unknown as TicketWithDetails[];
}

export async function getNasUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, fullname, role, student_or_staff_id, program, created_at")
    .eq("role", "nas")
    .order("fullname")
    .limit(STAFF_PAGE_SIZE);

  if (error) throw error;
  return data as Profile[];
}

export async function getTicketHistory(ticketId: string) {
  const { data, error } = await supabase
    .from("ticket_history")
    .select("*, users:users(fullname)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(STAFF_PAGE_SIZE);

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
  const normalizedStationNumber = normalizeStationNumber(stationNumber);
  if (!normalizedStationNumber) throw new Error("Station number is required.");

  const { data, error } = await supabase
    .from("stations")
    .insert({ lab_id: labId, station_number: normalizedStationNumber })
    .select()
    .single();
  if (error) throw normalizeStationMutationError(error);
  return data as Station;
}

export async function deleteStation(id: number): Promise<void> {
  const { error } = await supabase.from("stations").delete().eq("id", id);
  if (error) throw error;
}

export async function bulkAddStations(labId: number, stationNumbers: string[]): Promise<Station[]> {
  const normalizedStationNumbers = stationNumbers.map(normalizeStationNumber);
  if (normalizedStationNumbers.some((num) => !num)) {
    throw new Error("Every station needs a station number.");
  }

  const seen = new Set<string>();
  for (const stationNumber of normalizedStationNumbers) {
    const key = stationNumber.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Station ${stationNumber} appears more than once in this batch.`);
    }
    seen.add(key);
  }

  const rows = normalizedStationNumbers.map((station_number) => ({ lab_id: labId, station_number }));
  const { data, error } = await supabase.from("stations").insert(rows).select();
  if (error) throw normalizeStationMutationError(error);
  return data as Station[];
}

export function normalizeStationNumber(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeStationMutationError(error: { code?: string; message?: string }): Error {
  if (error.code === "23505") {
    return new Error("That station number already exists in this lab.");
  }
  return new Error(error.message || "Failed to save the station.");
}

// =========================================================
// ADMIN OPERATIONS
// =========================================================

async function requireCurrentAdmin(): Promise<Profile> {
  const currentProfile = await getCurrentProfile();
  if (currentProfile?.role !== "admin") {
    throw new Error("Only administrators can perform this action.");
  }
  return currentProfile;
}

export async function getAllUsers(): Promise<Profile[]> {
  await requireCurrentAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, fullname, role, student_or_staff_id, program, created_at")
    .order("fullname")
    .limit(STAFF_PAGE_SIZE);

  if (error) throw error;
  return data as Profile[];
}

export async function updateUserRole(userId: string, newRole: Role): Promise<Profile> {
  await requireCurrentAdmin();

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
  await requireCurrentAdmin();
  const { error } = await supabase.rpc("admin_delete_user", { p_user_id: userId });
  if (error) throw error;
}

export async function getAllTicketHistory(limit = STAFF_PAGE_SIZE): Promise<any[]> {
  await requireCurrentAdmin();
  const { data, error } = await supabase
    .from("ticket_history")
    .select("*, users:users(fullname)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}
