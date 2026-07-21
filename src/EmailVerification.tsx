interface EmailVerificationProps {
  status: "success" | "error";
  email: string | null;
  onContinue: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
}

function VerificationIcon({ status }: Pick<EmailVerificationProps, "status">) {
  if (status === "success") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="m5 12.5 4.2 4.2L19.5 6.8"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 7.2v5.4M12 16.7v.1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M10.1 3.7 2.6 17a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.9 3.7a2.2 2.2 0 0 0-3.8 0Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function EmailVerification({
  status,
  email,
  onContinue,
  onSignIn,
  onSignUp,
}: EmailVerificationProps) {
  const success = status === "success";

  return (
    <div className={`verification-page ${success ? "verification-page-success" : "verification-page-error"}`}>
      <div className="verification-glow verification-glow-one" aria-hidden="true" />
      <div className="verification-glow verification-glow-two" aria-hidden="true" />

      <main className="verification-shell" aria-labelledby="verification-title">
        <div className="verification-brand" aria-label="TechFix CIT-U">
          <div className="logo-mark">TF</div>
          <span>TechFix</span>
          <span className="logo-sub">CIT-U</span>
        </div>

        <section className="verification-card" aria-live="polite">
          <div className={`verification-icon ${success ? "verification-icon-success" : "verification-icon-error"}`}>
            <VerificationIcon status={status} />
          </div>

          <p className="verification-kicker">{success ? "Account verified" : "Verification link"}</p>
          <h1 id="verification-title">{success ? "You’re all set." : "This link needs a refresh."}</h1>
          <p className="verification-lead">
            {success
              ? "Your CIT-U email is confirmed and your TechFix account is ready for the lab queue."
              : "This link may have expired or already been used. Request a fresh email and open the newest link once."}
          </p>

          {success && email && (
            <div className="verification-email">
              <span>Verified email</span>
              <strong>{email}</strong>
            </div>
          )}

          {success ? (
            <div className="verification-steps">
              <div className="verification-step">
                <span className="verification-step-icon">01</span>
                <div>
                  <strong>Account active</strong>
                  <span>Your identity is confirmed.</span>
                </div>
              </div>
              <div className="verification-step">
                <span className="verification-step-icon">02</span>
                <div>
                  <strong>Tickets unlocked</strong>
                  <span>Report and track lab issues.</span>
                </div>
              </div>
              <div className="verification-step">
                <span className="verification-step-icon">03</span>
                <div>
                  <strong>Ready for the queue</strong>
                  <span>Let’s get your lab back on track.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="verification-callout">
              <span className="verification-callout-label">Try this</span>
              <p>Return to sign up, submit the same CIT-U email, then use the latest message in your inbox.</p>
            </div>
          )}

          <div className="verification-actions">
            <button className="btn btn-primary" onClick={success ? onContinue : onSignUp}>
              {success ? "Open my dashboard" : "Request a new link"}
            </button>
            <button className="btn btn-ghost" onClick={onSignIn}>
              {success ? "Sign in instead" : "Back to sign in"}
            </button>
          </div>

          <p className="verification-note">TechFix · CIT-U computer lab support</p>
        </section>

        <p className="verification-footnote">Secure account confirmation for the TechFix lab queue.</p>
      </main>
    </div>
  );
}
