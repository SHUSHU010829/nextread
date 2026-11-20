"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !email || !password) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg({ text: "登入失敗：" + error.message, error: true });
    setBusy(false);
  }

  async function sendMagicLink() {
    if (!supabase || !email) {
      setMsg({ text: "請先輸入 Email", error: true });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    setMsg(error ? { text: "寄送失敗：" + error.message, error: true } : { text: "登入連結已寄出，請到信箱點開。" });
    setBusy(false);
  }

  return (
    <form className="login" onSubmit={signInWithPassword}>
      <h1>書櫃</h1>
      <p>登入後，書櫃資料會存在雲端，換裝置也能用。</p>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label htmlFor="password">密碼</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="btns">
        <button type="submit" className="btn primary" disabled={busy || !password}>
          登入
        </button>
        <button type="button" className="btn" disabled={busy} onClick={sendMagicLink}>
          寄登入連結
        </button>
      </div>
      {msg && <div className={msg.error ? "err" : "hint"}>{msg.text}</div>}
    </form>
  );
}
