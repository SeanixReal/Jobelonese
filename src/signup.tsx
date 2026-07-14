import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import TicketCard, { type Ticket } from "./ticketcard";
import type { View } from "./home";
import { CIT_EMAIL_DOMAIN, isCitEmail, resendSignupConfirmation, signUp } from "./lib";

interface SignUpProps {
  goTo: (view: View) => void;
}

// Standard academic programs at CIT-U
const PROGRAM_OPTIONS = ["BSIT", "BSCS", "BSCpE", "BSEMC", "BSIS", "BSISc", "BSECE", "BSEE", "BSME", "BSCE", "BSApE"];

interface SignUpFormData {
  fullName: string;
  email: string;
  studentOrStaffId: string;
  program: string;
  password: string;
  confirmPassword: string;
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
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
    setVerificationEmail(null);
    setResendError(null);
    setResendMessage(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isCitEmail(form.email)) {
      setError(`Use a CIT-U email ending in @${CIT_EMAIL_DOMAIN}.`);
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords don't match. Re-enter them.");
      return;
    }
    if (!form.program) {
      setError("Please select your academic program.");
      return;
    }

    setLoading(true);

    try {
      const result = await signUp({
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        studentOrStaffId: form.studentOrStaffId.trim() || undefined,
        program: form.program.trim() || undefined,
      });

      if (result.session) {
        goTo("portal");
      } else {
        const normalizedEmail = form.email.trim().toLowerCase();
        setVerificationEmail(normalizedEmail);
        setSuccess(
          `Account created. Check ${normalizedEmail} for the verification link before signing in.`
        );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Sign up failed. Please try again.";
      setError(errorMessage);
      setVerificationEmail(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!verificationEmail) return;

    setResendLoading(true);
    setResendError(null);
    setResendMessage(null);

    try {
      await resendSignupConfirmation(verificationEmail);
      setResendMessage("A new verification email was requested. Check your inbox and spam folder.");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "We couldn't resend the verification email. Please try again.";
      setResendError(errorMessage);
    } finally {
      setResendLoading(false);
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

            <p className="role-hint" role="note">
              New accounts start as Student. Only an administrator can assign NAS, IT, faculty, or admin access.
            </p>

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

            {success && (
              <div style={{ margin: "-6px 0 18px" }}>
                <p
                  style={{ color: "var(--success, #138a5b)", fontSize: "13px", margin: "0 0 10px" }}
                  role="status"
                >
                  {success}
                </p>
                {verificationEmail && (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-block"
                      onClick={handleResendVerification}
                      disabled={resendLoading}
                    >
                      {resendLoading ? "Resending verification..." : "Resend verification email"}
                    </button>
                    {resendMessage && (
                      <p
                        style={{ color: "var(--teal)", fontSize: "13px", lineHeight: 1.5, margin: "10px 0 0" }}
                        role="status"
                      >
                        {resendMessage}
                      </p>
                    )}
                    {resendError && (
                      <p
                        style={{ color: "var(--danger)", fontSize: "13px", lineHeight: 1.5, margin: "10px 0 0" }}
                        role="alert"
                      >
                        {resendError}
                      </p>
                    )}
                  </>
                )}
              </div>
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
