"use client";

import { useEffect, useState } from "react";
import { api, UNAUTHORIZED_EVENT } from "@/lib/api";
import Login from "@/components/Login";
import Shelf from "@/components/Shelf";

type State = "loading" | "in" | "out";

export default function Home() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    api
      .session()
      .then((s) => setState(s.authenticated ? "in" : "out"))
      .catch(() => setState("out"));
    const onUnauthorized = () => setState("out");
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (state === "loading") return <div className="state">載入中…</div>;
  if (state === "out") return <Login onLogin={() => setState("in")} />;
  return <Shelf onLogout={() => setState("out")} />;
}
