"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.login(password);
      onLogin();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>nextread</h1>
      <p>下一本，讀什麼？輸入密碼開啟你的書櫃。</p>
      {/* 隱藏的帳號欄位讓密碼管理器可以記住這組密碼 */}
      <input type="text" name="username" autoComplete="username" defaultValue="nextread" hidden readOnly />
      <label htmlFor="password">密碼</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="btns">
        <button type="submit" className="btn primary" disabled={busy || !password}>
          {busy ? "登入中…" : "登入"}
        </button>
      </div>
      {error && <div className="err">{error}</div>}
    </form>
  );
}
