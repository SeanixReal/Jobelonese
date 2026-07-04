import { useEffect, useState } from "react";
import Home, { type View as BaseView } from "./home";
import SignIn from "./signin";
import SignUp from "./signup";
import StudentPortal from "./studentportal";
import { supabase } from "./lib.ts";
import "./App.css";

export type View = BaseView | "portal";

function App() {
  const [view, setView] = useState<View>("home");
  const [checkingSession, setCheckingSession] = useState(true);

  const goTo = (next: View) => {
    setView(next);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    // On first load, jump straight to the portal if there's already a
    // signed-in session (e.g. the user refreshed the page).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setView("portal");
      setCheckingSession(false);
    });

    // Keep view in sync with auth state after that: sign-in anywhere
    // sends you to the portal, sign-out sends you home.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setView(session ? "portal" : "home");
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
      return <StudentPortal />;
    case "home":
    default:
      return <Home goTo={goTo} />;
  }
}

export default App;