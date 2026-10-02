"use client";

import { useEffect, useState } from "react";
import { getSession, logout as apiLogout } from "@/lib/api";
import { LoginScreen } from "@/components/LoginScreen";
import { KanbanBoard } from "@/components/KanbanBoard";

type AuthState =
  | { status: "checking" }
  | { status: "loggedOut" }
  | { status: "loggedIn"; username: string };

export const AuthGate = () => {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((session) => {
        if (!cancelled) {
          setAuth({ status: "loggedIn", username: session.username });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuth({ status: "loggedOut" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    await apiLogout();
    setAuth({ status: "loggedOut" });
  };

  if (auth.status === "checking") {
    return null;
  }

  if (auth.status === "loggedOut") {
    return (
      <LoginScreen
        onSuccess={(username) => setAuth({ status: "loggedIn", username })}
      />
    );
  }

  return <KanbanBoard onLogout={handleLogout} />;
};
