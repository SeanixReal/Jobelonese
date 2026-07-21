import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Home, { type View as BaseView } from "./home";
import SignIn from "./signin";
import SignUp from "./signup";
import ResetPassword from "./resetpassword";
import EmailVerification from "./EmailVerification";
import StudentPortal from "./studentportal";
import NasPortal from "./NasPortal";
import ITPortal from "./ITPortal";
import AdminPortal from "./AdminPortal";
import {
  getAuthRedirectState,
  getCurrentProfile,
  getUserFacingErrorMessage,
  signOut,
  supabase,
  type AuthRedirectState,
  type Role,
} from "./lib.ts";
import "./App.css";

export type View = BaseView | "verification-success" | "verification-error";

type VerificationView = "success" | "error" | null;

function App() {
  const [view, setView] = useState<View>("home");
  const [role, setRole] = useState<Role | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [verificationView, setVerificationView] = useState<VerificationView>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const verificationRedirectRef = useRef<AuthRedirectState>(getAuthRedirectState());
  const verificationHandledRef = useRef(false);
  const recoveryMode = useRef(false);

  const goTo = (next: View) => {
    setView(next);
    window.scrollTo(0, 0);
  };

  const syncSession = async (hasSession: boolean) => {
    if (!hasSession) {
      setRole(null);
      setSessionError(null);
      setVerificationView(null);
      setVerificationEmail(null);
      setView("home");
      return;
    }
    // Session exists — figure out which portal this account should land on.
    setSessionError(null);
    try {
      const profile = await getCurrentProfile();
      setRole(profile?.role ?? null);
    } catch (error) {
      setRole(null);
      setSessionError(
        getUserFacingErrorMessage(error, "We couldn't load your account. Please try again.")
      );
    }
    setView("portal");
  };

  const showVerificationSuccess = (session: Session) => {
    verificationHandledRef.current = true;
    verificationRedirectRef.current = null;
    setVerificationView("success");
    setVerificationEmail(session.user.email ?? null);
    setRole(null);
    setSessionError(null);
    setView("verification-success");
    setCheckingSession(false);
  };

  const showVerificationError = () => {
    verificationHandledRef.current = true;
    verificationRedirectRef.current = null;
    setVerificationView("error");
    setVerificationEmail(null);
    setRole(null);
    setSessionError(null);
    setView("verification-error");
    setCheckingSession(false);
  };

  const retrySession = () => {
    void syncSession(true);
  };

  const handleSessionSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      setSessionError(getUserFacingErrorMessage(error, "Could not sign out. Please try again."));
    }
  };

  const continueFromVerification = () => {
    void syncSession(true);
  };

  const returnToSignInFromVerification = async () => {
    try {
      await signOut();
    } finally {
      setVerificationView(null);
      setVerificationEmail(null);
      setView("signin");
    }
  };

  const requestNewVerification = () => {
    setVerificationView(null);
    setVerificationEmail(null);
    setView("signup");
  };

  useEffect(() => {
    // A recovery session must stay on the password form. Supabase emits
    // USER_UPDATED after the new password is saved, so do not route that
    // temporary session into a portal before the user signs in normally.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryMode.current = true;
        setRole(null);
        setView("reset-password");
        setCheckingSession(false);
        return;
      }

      if (recoveryMode.current && event !== "SIGNED_OUT") {
        setCheckingSession(false);
        return;
      }

      if (verificationRedirectRef.current === "error") {
        showVerificationError();
        return;
      }

      if (verificationRedirectRef.current === "verification") {
        if (session) showVerificationSuccess(session);
        else if (event === "SIGNED_IN") showVerificationError();
        return;
      }

      if (event === "SIGNED_OUT") {
        recoveryMode.current = false;
        verificationHandledRef.current = false;
        verificationRedirectRef.current = null;
        void syncSession(false);
        return;
      }

      if (verificationHandledRef.current) {
        setCheckingSession(false);
        return;
      }

      void syncSession(!!session);
    });

    // On first load, jump straight to the right portal if there's already
    // a signed-in session (e.g. the user refreshed the page).
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const recoveryLink =
        typeof window !== "undefined" && window.location.hash.includes("type=recovery");

      if (verificationHandledRef.current) {
        // The auth listener already rendered the verification result.
      } else if (recoveryMode.current || recoveryLink) {
        recoveryMode.current = true;
        setRole(null);
        setView("reset-password");
      } else if (verificationRedirectRef.current === "error") {
        showVerificationError();
      } else if (verificationRedirectRef.current === "verification" && session) {
        showVerificationSuccess(session);
      } else if (verificationRedirectRef.current === "verification") {
        showVerificationError();
      } else {
        await syncSession(!!session);
      }
      setCheckingSession(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (checkingSession) {
    return <div className="portal-loading">Loading...</div>;
  }

  if (view === "portal" && sessionError) {
    return (
      <div className="portal-loading portal-error">
        <div className="portal-error-content">
          <p role="alert">{sessionError}</p>
          <div className="portal-error-actions">
            <button className="btn btn-ghost" onClick={retrySession}>
              Retry
            </button>
            <button className="btn btn-ghost" onClick={() => void handleSessionSignOut()}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "verification-success" && verificationView === "success") {
    return (
      <EmailVerification
        status="success"
        email={verificationEmail}
        onContinue={continueFromVerification}
        onSignIn={() => void returnToSignInFromVerification()}
        onSignUp={requestNewVerification}
      />
    );
  }

  if (view === "verification-error" && verificationView === "error") {
    return (
      <EmailVerification
        status="error"
        email={null}
        onContinue={continueFromVerification}
        onSignIn={() => void returnToSignInFromVerification()}
        onSignUp={requestNewVerification}
      />
    );
  }

  switch (view) {
    case "signin":
      return <SignIn goTo={goTo} />;
    case "signup":
      return <SignUp goTo={goTo} />;
    case "reset-password":
      return <ResetPassword goTo={goTo} />;
    case "portal":
      if (role === "nas") return <NasPortal />;
      if (role === "it") return <ITPortal />;
      if (role === "admin") return <AdminPortal />;
      // student and cpe_faculty both use the student portal — both roles
      // just report and track their own tickets, no queue to manage.
      return <StudentPortal />;
    case "home":
    default:
      return <Home goTo={goTo} />;
  }
}

export default App;
