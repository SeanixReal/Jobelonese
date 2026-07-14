import { useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import TicketCard, { type Ticket } from "./ticketcard";
import type { View } from "./home";
import { signOut, updatePassword } from "./lib";

interface ResetPasswordProps {
  goTo: (view: View) => void;
}

const sideTicket: Ticket = {
  id: "TCK-0851",
  status: "in-progress",
  issue: "Keyboard keys unresponsive",
  location: "COMP LAB 2 · STATION 07",
};

export default function ResetPassword({ goTo }: ResetPasswordProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [updated, setUpdated] = useState(false);

  const leaveRecovery = async (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      goTo("signin");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Could not leave recovery mode.";
      setError(errorMessage);
    } finally {
      setSigningOut(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      setPassword("");
      setConfirmPassword("");
      setUpdated(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Could not update your password. Request a new link.";
      setError(errorMessage);
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
            <div className="kicker">Secure account recovery</div>
            <h2>Get back to your lab queue.</h2>
            <p>
              Set a new password, then sign in again to submit tickets and keep track of your lab
              support requests.
            </p>
          </div>
        </div>
        <div className="auth-ticket-mini">
          <TicketCard ticket={sideTicket} className="ticket-3" style={{ marginLeft: 0 }} />
        </div>
      </div>

      <div className="auth-form-side">
        <div className="form-card">
          <a className="back-link" href="#signin" onClick={leaveRecovery}>
            &larr; Back to sign in
          </a>

          {updated ? (
            <>
              <h1>Password updated</h1>
              <p className="form-sub">
                Your password has been changed. Sign in again to continue to TechFix.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={leaveRecovery}
                disabled={signingOut}
              >
                {signingOut ? "Returning..." : "Continue to sign in"}
              </button>
            </>
          ) : (
            <>
              <h1>Set a new password</h1>
              <p className="form-sub">Choose a new password for your TechFix account.</p>

              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    minLength={6}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="field">
                  <label htmlFor="confirm-password">Confirm new password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError(null);
                    }}
                    minLength={6}
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <p style={{ color: "var(--danger)", fontSize: "13px", margin: "0 0 18px" }} role="alert">
                    {error}
                  </p>
                )}

                <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                  {loading ? "Updating password..." : "Update password"}
                </button>
              </form>
            </>
          )}

          {updated && error && (
            <p style={{ color: "var(--danger)", fontSize: "13px", margin: "18px 0 0" }} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
