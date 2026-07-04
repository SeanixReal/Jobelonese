import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import TicketCard, { type Ticket } from "./ticketcard";
import type { View } from "./home";
import { signIn } from "./authService";

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

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn(form.email, form.password);
      console.log("Sign in successful:", result);

      const nextView = result?.profile?.role === "student" ? "portal" : "home";
      goTo(nextView);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Sign in failed. Please try again.";
      setError(errorMessage);
      console.error("Sign in error:", err);
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
                <a href="#">Forgot password?</a>
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
            Don't have an account?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                goTo("signup");
              }}
            >
              Sign up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}