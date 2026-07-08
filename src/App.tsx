import { useEffect, useState } from "react";
import Home, { type View as BaseView } from "./home";
import SignIn from "./signin";
import SignUp from "./signup";
import StudentPortal from "./studentportal";
import NasPortal from "./NasPortal";
import ITPortal from "./ITPortal";
import AdminPortal from "./AdminPortal";
import { supabase, getCurrentProfile } from "./lib.ts";
import type { Role } from "./lib.ts";
import "./App.css";

export type View = BaseView | "portal";

function App() {
  const [view, setView] = useState<View>("home");
  const [role, setRole] = useState<Role | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const goTo = (next: View) => {
    setView(next);
    window.scrollTo(0, 0);
  };

  const syncSession = async (hasSession: boolean) => {
    if (!hasSession) {
      setRole(null);
      setView("home");
      return;
    }
    // Session exists — figure out which portal this account should land on.
    try {
      const profile = await getCurrentProfile();
      setRole(profile?.role ?? null);
    } catch {
      setRole(null);
    }
    setView("portal");
  };

  useEffect(() => {
    // On first load, jump straight to the right portal if there's already
    // a signed-in session (e.g. the user refreshed the page).
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await syncSession(!!session);
      setCheckingSession(false);
    });

    // Keep view/role in sync with auth state after that: sign-in anywhere
    // sends you to the right portal, sign-out sends you home.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(!!session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (checkingSession) {
    return <div className="portal-loading">Loading...</div>;
  }

  switch (view) {
    case "signin":
      return <SignIn goTo={goTo} />;
    case "signup":
      return <SignUp goTo={goTo} />;
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