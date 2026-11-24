"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { dedupKey } from "@/lib/server/books";
import { MIN_RATED, ratedCount } from "@/lib/server/recommend";
import type { Book, BookInput, LookupResult, Prediction, Suggestion } from "@/lib/types";

function presetFrom(title: string, author: string, book?: LookupResult): Partial<BookInput> {
  return {
    title: book?.title || title,
    author: book?.authors.length ? book.authors.join("、") : author,
    isbn: book?.isbn ?? "",
    cover_url: book?.cover_url ?? "",
    description: book?.description ?? "",
    categories: book?.categories ?? [],
    status: "want",
    finished_at: "",
  };
}

export default function RecommendPanel({
  books,
  onAdd,
}: {
  books: Book[];
  onAdd: (preset: Partial<BookInput>) => void;
}) {
  const rated = ratedCount(books);
  const enabled = rated > MIN_RATED;
  const owned = new Set(books.map((b) => dedupKey(b.title, "")));
  const isOwned = (title: string) => owned.has(dedupKey(title, ""));

  const [query, setQuery] = useState("");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState("");

  const [hint, setHint] = useState("");
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");

  async function runPredict() {
    const q = query.trim();
    if (!q || predicting) return;
    setPredicting(true);
    setPredictError("");
    setPrediction(null);
    try {
      setPrediction(await api.predict(q));
    } catch (e) {
      setPredictError(errorMessage(e));
    } finally {
      setPredicting(false);
    }
  }

  async function runSuggest() {
    if (suggesting) return;
    setSuggesting(true);
    setSuggestError("");
    try {
      const r = await api.suggest(hint.trim());
      setItems(r.items);
      if (!r.items.length) setSuggestError("這次沒有產生推薦，再試一次。");
    } catch (e) {
      setSuggestError(errorMessage(e));
    } finally {
      setSuggesting(false);
    }
  }

  if (!enabled) {
    return (
      <div className="panel">
        <h2>推薦</h2>
        <p className="hint">
          評價超過 {MIN_RATED} 本書後就能使用推薦：推測一本書你會不會喜歡，或從書櫃外推薦新書。
          目前已評價 {rated} 本，再評價 {MIN_RATED + 1 - rated} 本就能啟用。
        </p>
        <div className="bar" aria-hidden>
          <i style={{ width: `${Math.min(100, (rated / (MIN_RATED + 1)) * 100)}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <section>
        <h2>這本我會喜歡嗎？</h2>
        <p className="hint">輸入書名（可以加作者），依照你的評價和心得推測喜歡程度。</p>
        <div className="lookup">
          <input
            type="text"
            className="search"
            placeholder="例如：被討厭的勇氣"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runPredict()}
            aria-label="書名"
          />
          <button className="btn primary" onClick={runPredict} disabled={predicting || !query.trim()}>
            {predicting ? "推測中…" : "推測"}
          </button>
        </div>
        {predicting && <p className="hint">大約需要 10–30 秒。</p>}
        {predictError && <div className="err">{predictError}</div>}
        {prediction &&
          (prediction.known ? (
            <div className="result-box">
              <div className="score">
                <b>{prediction.score}</b>
                <span>
                  《{prediction.title}》{prediction.author && ` · ${prediction.author}`}
                </span>
              </div>
              <div className="bar">
                <i style={{ width: `${prediction.score}%` }} />
              </div>
              <p>{prediction.reason}</p>
              {prediction.based_on.length > 0 && (
                <p className="hint">參考：{prediction.based_on.map((t) => `《${t}》`).join("")}</p>
              )}
              {isOwned(prediction.title) ? (
                <span className="hint">已在書櫃上</span>
              ) : (
                <button className="btn small" onClick={() => onAdd(presetFrom(prediction.title, prediction.author))}>
                  加入想讀
                </button>
              )}
            </div>
          ) : (
            <p className="result-box">找不到這本書的可靠資料，試試加上作者或完整書名。</p>
          ))}
      </section>

      <section>
        <h2>為我推薦</h2>
        <p className="hint">根據你喜歡與不喜歡的書，推薦書櫃上還沒有的書。可以補一句這次想看什麼。</p>
        <div className="lookup">
          <input
            type="text"
            className="search"
            placeholder="選填，例如：輕鬆一點的小說"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSuggest()}
            aria-label="這次想看什麼"
          />
          <button className="btn primary" onClick={runSuggest} disabled={suggesting}>
            {suggesting ? "思考中…" : items ? "再推薦一次" : "產生推薦"}
          </button>
        </div>
        {suggesting && <p className="hint">大約需要 20–40 秒。</p>}
        {suggestError && <div className="err">{suggestError}</div>}
        {items && items.length > 0 && (
          <div className="recs">
            {items.map((it, i) => (
              <div className="rec" key={i}>
                {it.book?.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="cover" src={it.book.cover_url} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="cover ph" aria-hidden>
                    {it.title.slice(0, 1)}
                  </span>
                )}
                <div className="main">
                  <div className="t">
                    《{it.title}》<span className="a"> {it.author}</span>
                  </div>
                  <div className="why">{it.reason}</div>
                  {!it.verified && <div className="why">⚠ 書籍資料庫查不到這本，可能是書名不同或資料庫沒有收錄</div>}
                </div>
                {isOwned(it.title) ? (
                  <span className="hint">已加入</span>
                ) : (
                  <button className="btn small" onClick={() => onAdd(presetFrom(it.title, it.author, it.book))}>
                    加入想讀
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
