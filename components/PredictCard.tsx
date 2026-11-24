"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { STATUS_LABEL, type Prediction } from "@/lib/types";
import { useApp } from "./AppProvider";
import { IconPlus } from "./icons";
import { findOwned, wantPreset, withRecommendation } from "./recommend-utils";

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" aria-label={`推測喜歡程度 ${score} 分`}>
      <svg viewBox="0 0 80 80" aria-hidden>
        <circle cx="40" cy="40" r={r} className="ring-bg" />
        <circle cx="40" cy="40" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <b>{score}</b>
      <span>分</span>
    </div>
  );
}

/** 「這本我會喜歡嗎？」：輸入書名，推測喜歡程度。 */
export default function PredictCard() {
  const { books, openEditor, upsert } = useApp();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function run() {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setSaved(false);
    try {
      setResult(await api.predict(q));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const owned = result && books ? findOwned(books, result.title) : undefined;

  async function saveScore() {
    if (!owned || !result) return;
    try {
      upsert(await api.updateBook(owned.id, withRecommendation(owned, result.score, result.reason)));
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="predict">
      <div className="ask">
        <input
          type="text"
          placeholder="輸入書名，可以加作者"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          aria-label="書名"
        />
        <button className="btn accent" onClick={run} disabled={busy || !query.trim()}>
          {busy ? "推測中…" : "推測"}
        </button>
      </div>
      {busy && <p className="hint">正在對照你的評價和心得，大約 10–30 秒。</p>}
      {error && <div className="err">{error}</div>}

      {result && !result.known && (
        <div className="predict-result">
          <p>找不到這本書的可靠資料，試試加上作者或完整書名。</p>
        </div>
      )}

      {result && result.known && (
        <div className="predict-result">
          <div className="predict-head">
            <ScoreRing score={result.score} />
            <div className="predict-title">
              <h3>{result.title}</h3>
              {result.original_title && <p className="orig">{result.original_title}</p>}
              {result.author && <p className="by">{result.author}</p>}
            </div>
          </div>
          <p className="reason">{result.reason}</p>
          <div className="predict-foot">
            {result.based_on.length > 0 ? (
              <div className="chips">
                <span className="muted">參考</span>
                {result.based_on.map((t) => (
                  <span key={t} className="chip">
                    《{t}》
                  </span>
                ))}
              </div>
            ) : (
              <span />
            )}
            {!owned ? (
              <button
                className="btn accent"
                onClick={() => openEditor(null, wantPreset({ title: result.title, author: result.author, score: result.score, reason: result.reason }))}
              >
                <IconPlus /> 加入想讀
              </button>
            ) : owned.status === "want" ? (
              <button className="btn accent" onClick={saveScore} disabled={saved}>
                {saved ? "已更新想讀的分數" : "更新想讀的推薦分數"}
              </button>
            ) : (
              <span className="tag-owned">已在書櫃（{STATUS_LABEL[owned.status]}）</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
