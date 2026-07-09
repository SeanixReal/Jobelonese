import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import TicketCard, { type Ticket } from "./ticketcard";
import type { View } from "./home";
import { signUp } from "./authService";

interface SignUpProps {
  goTo: (view: View) => void;
}

export type Role = "student" | "nas" | "it" | "admin";

const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  nas: "NAS (Non-Academic Scholar)",
  it: "IT Administrator",
  admin: "System Administrator",
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as Role[];
const PRIVILEGED_ROLE_PASSCODES = {
  nas: import.meta.env.VITE_NAS_ROLE_PASSCODE,
  it: import.meta.env.VITE_IT_ROLE_PASSCODE,
  admin: import.meta.env.VITE_ADMIN_ROLE_PASSCODE,
} as const;
const PRIVILEGED_ROLE_ERROR_LABELS = {
  nas: "NAS Scholar",
  it: "IT Administrator",
  admin: "System Administrator",
} as const;

// Standard academic programs at CIT-U
const PROGRAM_OPTIONS = ["BSIT", "BSCS", "BSCpE", "BSEMC", "BSIS", "BSISc", "BSECE", "BSEE", "BSME", "BSCE", "BSApE"];

interface SignUpFormData {
  fullName: string;
  email: string;
  studentOrStaffId: string;
  program: string; // program (students) or department (staff/faculty)
  password: string;
  confirmPassword: string;
  role: Role | "";
}

const sideTicket: Ticket = {
  id: "TCK-0852",
  status: "open",
  issue: "Mouse not detected",
  location: "IT LAB 1 · STATION 09",
};

export default function SignUp({ goTo }: SignUpProps) {
  const [form, setForm] = useState<SignUpFormData>({
    fullName: "",
    email: "",
    studentOrStaffId: "",
    program: "",
    password: "",
    confirmPassword: "",
    role: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passcode, setPasscode] = useState("");

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleRoleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as Role | "";
    // Program is a fixed list for students; for every other role it's a free-text
    // department, so clear it on role switch since the two aren't interchangeable.
    setForm((prev) => ({ ...prev, role: value, program: "" }));
    setError(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords don't match. Re-enter them.");
      return;
    }
    if (form.role === "") {
      setError("Select a role to continue.");
      return;
    }

    // Validate registration passcodes for privileged roles
    if (form.role === "nas" || form.role === "it" || form.role === "admin") {
      const requiredPasscode = PRIVILEGED_ROLE_PASSCODES[form.role];
      if (!requiredPasscode) {
        setError("Registration passcode for this role is not configured. Please contact an administrator.");
        return;
      }
      if (passcode !== requiredPasscode) {
        setError(`Invalid registration passcode for ${PRIVILEGED_ROLE_ERROR_LABELS[form.role]}.`);
        return;
      }
    }
    if (form.role === "student" && !form.program) {
      setError("Please select your academic program.");
      return;
    }
    if (form.role !== "student" && !form.program) {
      setError("Please enter your department.");
      return;
    }

    setLoading(true);

    try {
      const result = await signUp(
        form.email,
        form.password,
        form.fullName,
        form.role,
        form.studentOrStaffId,
        form.program
      );
      console.log("Sign up successful:", result);
      goTo("signin");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Sign up failed. Please try again.";
      setError(errorMessage);
      console.error("Sign up error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <div className="auth-side-top">
          <div className="logo">
            <div className="logo-mark">TF</div>
            TechFix<span className="logo-sub">CIT-U</span>
          </div>
          <div className="auth-side-copy">
            <div className="kicker">New ticket: account setup</div>
            <h2>Join the queue that actually moves.</h2>
            <p>
              One account gets you reporting, tracking, and (for IT staff) resolving lab issues —
              no separate logins for each lab.
            </p>
          </div>
        </div>
        <div className="auth-ticket-mini">
          <TicketCard ticket={sideTicket} className="ticket-1" style={{ marginLeft: 0 }} />
        </div>
      </div>

      <div className="auth-form-side">
        <div className="form-card">
          <a
            className="back-link"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              goTo("home");
            }}
          >
            &larr; Back to home
          </a>
          <h1>Create your account</h1>
          <p className="form-sub">Fill in your details to start reporting or resolving lab tickets.</p>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="su-name">Full name</label>
              <input
                id="su-name"
                name="fullName"
                type="text"
                placeholder="Juan Dela Cruz"
                value={form.fullName}
                onChange={handleInputChange}
                required
                disabled={loading}
              />
            </div>
            <div className="field">
              <label htmlFor="su-email">Email address</label>
              <input
                id="su-email"
                name="email"
                type="email"
                placeholder="juandelacruz@cit.edu"
                value={form.email}
                onChange={handleInputChange}
                required
                disabled={loading}
              />
            </div>

            <div className="field">
              <label htmlFor="su-id">Student / Staff ID</label>
              <input
                id="su-id"
                name="studentOrStaffId"
                type="text"
                placeholder="e.g., 12-3456-789"
                value={form.studentOrStaffId}
                onChange={handleInputChange}
                required
                disabled={loading}
              />
            </div>

            <div className="field">
              <label htmlFor="su-role">Role</label>
              <select id="su-role" name="role" value={form.role} onChange={handleRoleChange} required disabled={loading}>
                <option value="" disabled>
                  Select your role
                </option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>

            {(form.role === "nas" || form.role === "it" || form.role === "admin") && (
              <div className="field animate-fade-in">
                <label htmlFor="su-passcode">Role Registration Passcode</label>
                <input
                  id="su-passcode"
                  type="password"
                  placeholder="Enter passcode to register for this role"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            )}

            {/* Students pick from a fixed list of CIT-U programs */}
            {form.role === "student" && (
              <div className="field animate-fade-in">
                <label htmlFor="su-program">Degree Program</label>
                <select
                  id="su-program"
                  name="program"
                  value={form.program}
                  onChange={handleInputChange}
                  required
                  disabled={loading}
                >
                  <option value="" disabled>
                    Select your program
                  </option>
                  {PROGRAM_OPTIONS.map((prog) => (
                    <option key={prog} value={prog}>
                      {prog}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Every other role types in their department freely — there's no
                fixed list of NAS/IT/faculty departments the way there is for
                student programs. */}
            {form.role !== "" && form.role !== "student" && (
              <div className="field animate-fade-in">
                <label htmlFor="su-department">Department</label>
                <input
                  id="su-department"
                  name="program"
                  type="text"
                  placeholder="e.g., Computer Engineering Department"
                  value={form.program}
                  onChange={handleInputChange}
                  required
                  disabled={loading}
                />
              </div>
            )}

            <div className="row-2">
              <div className="field">
                <label htmlFor="su-pass">Password</label>
                <input
                  id="su-pass"
                  name="password"
                  type="password"
                  placeholder="Create a password"
                  value={form.password}
                  onChange={handleInputChange}
                  required
                  disabled={loading}
                />
              </div>
              <div className="field">
                <label htmlFor="su-confirm">Confirm password</label>
                <input
                  id="su-confirm"
                  name="confirmPassword"
                  type="password"
                  placeholder="Re-enter password"
                  value={form.confirmPassword}
                  onChange={handleInputChange}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <p style={{ color: "var(--danger)", fontSize: "13px", margin: "-6px 0 18px" }}>
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="form-foot-link">
            Already have an account?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                goTo("signin");
              }}
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}