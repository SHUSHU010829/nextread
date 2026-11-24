"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Cover, RatingPill } from "@/components/BookBits";
import ChatPanel from "@/components/ChatPanel";
import { IconPlus } from "@/components/icons";
import PredictCard from "@/components/PredictCard";
import Seg from "@/components/Seg";
import { MIN_RATED, ratedCount } from "@/lib/server/recommend";
import { ratedList, type RatingFilter } from "@/lib/shelf";

const RATING_OPTS: { value: RatingFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "2", label: "超級喜歡" },
  { value: "1", label: "喜歡" },
  { value: "0", label: "沒想法" },
  { value: "-1", label: "不喜歡" },
];

type Tab = "predict" | "chat";

/** 首頁：推薦。上方是推薦主區塊，下方是評價過的書。 */
export default function RecommendPage() {
  const { books, loadError, reload, openEditor } = useApp();
  const [tab, setTab] = useState<Tab>("chat");
  const [rating, setRating] = useState<RatingFilter>("all");

  const rated = books ? ratedCount(books) : 0;
  const enabled = rated > MIN_RATED;
  const list = useMemo(() => (books ? ratedList(books, rating) : []), [books, rating]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">nextread</p>
          <h1>今天想讀什麼？</h1>
          <p className="sub">{books ? `已評價 ${rated} 本，推薦會跟著你的口味越來越準。` : " "}</p>
        </div>
        <button className="btn primary" onClick={() => openEditor(null)}>
          <IconPlus /> 新增書籍
        </button>
      </header>

      <section className="hero">
        {!books ? (
          <p className="hint">{loadError || "載入中…"}</p>
        ) : !enabled ? (
          <div className="locked">
            <h2>評價超過 {MIN_RATED} 本書，就能開始推薦</h2>
            <p>
              目前已評價 {rated} 本，再評價 {MIN_RATED + 1 - rated} 本就能推測一本書你會不會喜歡，或從書櫃外幫你挑書。
            </p>
            <div className="bar" aria-hidden>
              <i style={{ width: `${Math.min(100, (rated / (MIN_RATED + 1)) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <>
            <div className="hero-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "chat"} className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>
                幫我挑書
              </button>
              <button
                role="tab"
                aria-selected={tab === "predict"}
                className={tab === "predict" ? "on" : ""}
                onClick={() => setTab("predict")}
              >
                這本我會喜歡嗎？
              </button>
            </div>
            {/* 兩個分頁都保持掛載，切換時不會清掉進行中的結果 */}
            <div hidden={tab !== "chat"}>
              <ChatPanel />
            </div>
            <div hidden={tab !== "predict"}>
              <PredictCard />
            </div>
          </>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>評價過的書</h2>
          <Seg label="依評價篩選" options={RATING_OPTS} value={rating} onChange={setRating} />
        </div>
        {loadError ? (
          <div className="state">
            {loadError}{" "}
            <button className="link" onClick={reload}>
              重試
            </button>
          </div>
        ) : !books ? (
          <div className="state">載入中…</div>
        ) : !list.length ? (
          <div className="empty">{rated ? "沒有符合條件的書。" : "還沒有評價過的書。完讀或棄讀的書可以評價。"}</div>
        ) : (
          <div className="cover-grid">
            {list.map((b) => (
              <button key={b.id} className="cover-card" onClick={() => openEditor(b)}>
                <Cover src={b.cover_url} title={b.title} size="lg" />
                <span className="t">{b.title}</span>
                <span className="meta">
                  <RatingPill rating={b.rating} />
                  {b.status === "dropped" && <span className="tag dropped">棄讀</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
