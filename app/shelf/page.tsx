"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { BookRow, Cover, ScoreBadge } from "@/components/BookBits";
import { IconPlus } from "@/components/icons";
import Seg from "@/components/Seg";
import {
  applyFilter,
  DEFAULT_FILTER,
  shelfStats,
  wantList,
  type RatingFilter,
  type ShelfFilter,
  type SortKey,
  type StatusFilter,
} from "@/lib/shelf";

const STATUS_OPTS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "read", label: "完讀" },
  { value: "reading", label: "在讀" },
  { value: "want", label: "想讀" },
  { value: "dropped", label: "棄讀" },
];
const RATING_OPTS: { value: RatingFilter; label: string }[] = [
  { value: "all", label: "所有評價" },
  { value: "2", label: "超級喜歡" },
  { value: "1", label: "喜歡" },
  { value: "0", label: "沒想法" },
  { value: "-1", label: "不喜歡" },
  { value: "none", label: "未評價" },
];
const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: "finished", label: "完讀日期" },
  { value: "created", label: "新增時間" },
  { value: "title", label: "書名" },
];

export default function ShelfPage() {
  const { books, loadError, reload, openEditor } = useApp();
  const [filter, setFilter] = useState<ShelfFilter>(DEFAULT_FILTER);
  const visible = useMemo(() => (books ? applyFilter(books, filter) : []), [books, filter]);
  const wants = useMemo(() => (books ? wantList(books) : []), [books]);
  const stats = shelfStats(books ?? []);
  const set = <K extends keyof ShelfFilter>(k: K) => (v: ShelfFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">nextread</p>
          <h1>書櫃</h1>
          <p className="sub">
            {books ? `共 ${stats.total} 本 · 完讀 ${stats.read} · 在讀 ${stats.reading} · 想讀 ${stats.want}` : " "}
          </p>
        </div>
        <button className="btn primary" onClick={() => openEditor(null)}>
          <IconPlus /> 新增書籍
        </button>
      </header>

      <section className="section">
        <div className="section-head">
          <h2>想讀清單</h2>
          <span className="muted">{wants.length} 本 · 依推薦分數排序</span>
        </div>
        {!books ? null : !wants.length ? (
          <div className="empty small">還沒有想讀的書。在推薦頁按「加入想讀」，推薦分數和理由會一起存下來。</div>
        ) : (
          <div className="want-shelf">
            {wants.map((b) => (
              <button key={b.id} className="want-card" onClick={() => openEditor(b)}>
                <div className="want-cover">
                  <Cover src={b.cover_url} title={b.title} size="lg" />
                  {b.rec_score !== null && <ScoreBadge score={b.rec_score} />}
                </div>
                <span className="t">{b.title}</span>
                {b.author && <span className="a">{b.author}</span>}
                {b.rec_reason && <span className="why">{b.rec_reason}</span>}
                {b.rec_at && <span className="when">推薦於 {b.rec_at.slice(0, 10)}</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>全部的書</h2>
        </div>
        <div className="toolbar">
          <input
            className="search"
            placeholder="搜尋書名或作者"
            value={filter.q}
            onChange={(e) => set("q")(e.target.value)}
            aria-label="搜尋書名或作者"
          />
          <Seg label="狀態" options={STATUS_OPTS} value={filter.status} onChange={set("status")} />
        </div>
        <div className="toolbar">
          <Seg label="評價" options={RATING_OPTS} value={filter.rating} onChange={set("rating")} />
          <Seg label="排序" options={SORT_OPTS} value={filter.sort} onChange={set("sort")} />
        </div>
        <div className="list">
          {loadError ? (
            <div className="state">
              {loadError}{" "}
              <button className="link" onClick={reload}>
                重試
              </button>
            </div>
          ) : !books ? (
            <div className="state">載入中…</div>
          ) : !books.length ? (
            <div className="empty">書櫃還是空的，按「新增書籍」開始記錄，或到「我的」匯入資料。</div>
          ) : !visible.length ? (
            <div className="empty">沒有符合條件的書。</div>
          ) : (
            visible.map((b) => <BookRow key={b.id} book={b} onClick={() => openEditor(b)} />)
          )}
        </div>
      </section>
    </div>
  );
}
