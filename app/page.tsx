"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Login from "@/components/Login";
import Shelf from "@/components/Shelf";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) {
    return (
      <div className="login">
        <h1>書櫃</h1>
        <p>尚未設定 Supabase：請在 web/.env.local 填入 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY。</p>
      </div>
    );
  }
  if (!ready) return <div className="state">載入中…</div>;
  if (!session) return <Login />;
  return <Shelf email={session.user.email ?? ""} />;
}
