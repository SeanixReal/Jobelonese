import { useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import TicketCard, { type Ticket } from "./ticketcard";
import type { View } from "./home";
import { CIT_EMAIL_DOMAIN, isCitEmail, requestPasswordReset, signIn } from "./lib";

interface SignInProps {
  goTo: (view: View) => void;
}

interface SignInFormData {
  email: string;
  password: string;
}

const sideTicket: Ticket = {
  id: "TCK-0851",
  status: "in-progress",
  issue: "Keyboard keys unresponsive",
  location: "COMP LAB 2 · STATION 07",
};

export default function SignIn({ goTo }: SignInProps) {
  const [form, setForm] = useState<SignInFormData>({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!isCitEmail(form.email)) {
      setError(`Use a CIT-U email ending in @${CIT_EMAIL_DOMAIN}.`);
      return;
    }

    setLoading(true);

    try {
      await signIn(form.email.trim(), form.password);
      goTo("portal");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Sign in failed. Please try again.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const openForgotPassword = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setResetEmail(form.email);
    setError(null);
    setResetSent(false);
    setForgotMode(true);
  };

  const handleResetSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!isCitEmail(resetEmail)) {
      setError(`Use a CIT-U email ending in @${CIT_EMAIL_DOMAIN}.`);
      return;
    }

    setResetLoading(true);
    try {
      await requestPasswordReset(resetEmail);
      setResetSent(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "We couldn't send the reset link. Please try again.";
      setError(errorMessage);
    } finally {
      setResetLoading(false);
    }
  };

  const returnToSignIn = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    setForgotMode(false);
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
            <div className="kicker">Welcome back</div>
            <h2>Your lab queue is waiting.</h2>
            <p>
              Sign back in to submit a new ticket, check on one you filed, or pick up where the
              queue left off.
            </p>
          </div>
        </div>
        <div className="auth-ticket-mini">
          <TicketCard ticket={sideTicket} className="ticket-3" style={{ marginLeft: 0 }} />
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
          {forgotMode ? (
            <>
              <h1>Reset your password</h1>
              <p className="form-sub">
                Enter your CIT-U email and we&apos;ll send you a secure password reset link.
              </p>

              <form onSubmit={handleResetSubmit}>
                <div className="field">
                  <label htmlFor="reset-email">Email address</label>
                  <input
                    id="reset-email"
                    type="email"
                    placeholder="juandelacruz@cit.edu"
                    value={resetEmail}
                    onChange={(e) => {
                      setResetEmail(e.target.value);
                      setError(null);
                      setResetSent(false);
                    }}
                    required
                    disabled={resetLoading}
                  />
                </div>

                {error && (
                  <p style={{ color: "var(--danger)", fontSize: "13px", margin: "0 0 18px" }}>
                    {error}
                  </p>
                )}
                {resetSent && (
                  <p
                    style={{ color: "var(--teal)", fontSize: "13px", lineHeight: 1.5, margin: "0 0 18px" }}
                    role="status"
                  >
                    If an account exists for this email, a reset link is on its way. Check your
                    CIT-U inbox and spam folder.
                  </p>
                )}

                <button type="submit" className="btn btn-primary btn-block" disabled={resetLoading}>
                  {resetLoading ? "Sending link..." : "Send reset link"}
                </button>
              </form>

              <p className="form-foot-link">
                Remembered your password?{" "}
                <a href="#signin" onClick={returnToSignIn}>
                  Back to sign in
                </a>
              </p>
            </>
          ) : (
            <>
              <h1>Sign in</h1>
              <p className="form-sub">Enter your CIT-U email and password to access your tickets.</p>

              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label htmlFor="si-email">Email address</label>
                  <input
                    id="si-email"
                    name="email"
                    type="email"
                    placeholder="juandelacruz@cit.edu"
                    value={form.email}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="field">
                  <div className="field-forgot">
                    <label htmlFor="si-pass" style={{ marginBottom: 0 }}>
                      Password
                    </label>
                    <a href="#reset" onClick={openForgotPassword}>
                      Forgot password?
                    </a>
                  </div>
                  <input
                    id="si-pass"
                    name="password"
                    type="password"
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={handleChange}
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <p style={{ color: "var(--danger)", fontSize: "13px", margin: "0 0 18px" }}>
                    {error}
                  </p>
                )}

                <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>

              <p className="form-foot-link">
                Don&apos;t have an account?{" "}
                <a
                  href="#signup"
                  onClick={(e) => {
                    e.preventDefault();
                    goTo("signup");
                  }}
                >
                  Sign up
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
