"use client";

import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { api, errorMessage, EXPORT_URL } from "@/lib/api";
import { shelfStats } from "@/lib/shelf";

/** 我的：閱讀統計，以及匯入、匯出、補資料、登出。 */
export default function MePage() {
  const { books, reload, openImport, logout } = useApp();
  const stats = shelfStats(books ?? []);
  const year = new Date().getFullYear();
  const [notice, setNotice] = useState("");
  const [enriching, setEnriching] = useState(false);

  async function enrichAll() {
    if (enriching) return;
    setEnriching(true);
    setNotice(`正在替 ${stats.missingInfo} 本書查詢資料…`);
    try {
      const r = await api.enrich();
      const notFound = r.results.filter((x) => x.status !== "updated").map((x) => `《${x.title}》`);
      setNotice(
        `補上了 ${r.updated} 本書的資料。` +
          (notFound.length ? `查不到：${notFound.slice(0, 8).join("")}${notFound.length > 8 ? ` 等 ${notFound.length} 本` : ""}，可以打開書手動貼簡介。` : "") +
          (r.remaining ? `還有 ${r.remaining} 本這次沒處理到，再按一次繼續。` : ""),
      );
      await reload();
    } catch (e) {
      setNotice("補資料失敗：" + errorMessage(e));
    } finally {
      setEnriching(false);
    }
  }

  const dist = [
    { key: "r2", label: "超級喜歡", n: stats.superLiked },
    { key: "r1", label: "喜歡", n: stats.liked },
    { key: "r0", label: "沒想法", n: stats.meh },
    { key: "r-1", label: "不喜歡", n: stats.disliked },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">nextread</p>
          <h1>我的閱讀</h1>
          <p className="sub">{year} 年已完讀 {stats.readThisYear} 本</p>
        </div>
      </header>

      <section className="card profile">
        <div className="stat-grid">
          <div>
            <b>{stats.total}</b>
            <span>全部</span>
          </div>
          <div>
            <b>{stats.read}</b>
            <span>完讀</span>
          </div>
          <div>
            <b>{stats.reading}</b>
            <span>在讀</span>
          </div>
          <div>
            <b>{stats.want}</b>
            <span>想讀</span>
          </div>
          <div>
            <b>{stats.dropped}</b>
            <span>棄讀</span>
          </div>
          <div>
            <b>{stats.rated}</b>
            <span>已評價</span>
          </div>
        </div>
        {stats.rated > 0 && (
          <>
            <h2>評價分布</h2>
            <div className="dist" aria-label="評價分布">
              {dist
                .filter((d) => d.n > 0)
                .map((d) => (
                  <i key={d.key} className={d.key} style={{ flexGrow: d.n }} title={`${d.label} ${d.n} 本`} />
                ))}
            </div>
            <div className="dist-legend">
              {dist.map((d) => (
                <span key={d.key}>
                  <i className={d.key} />
                  {d.label} {d.n}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>資料</h2>
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        <div className="action-list">
          <button className="action" onClick={enrichAll} disabled={enriching || stats.missingInfo === 0}>
            <span>
              <b>補資料</b>
              <small>{stats.missingInfo ? `替 ${stats.missingInfo} 本缺少封面或簡介的書查詢資料` : "每本書都有封面和簡介了"}</small>
            </span>
            <span className="go">{enriching ? "處理中…" : "→"}</span>
          </button>
          <button className="action" onClick={openImport}>
            <span>
              <b>匯入</b>
              <small>從 JSON 匯入書籍（artifact 書櫃或本系統的備份）</small>
            </span>
            <span className="go">→</span>
          </button>
          <a className="action" href={EXPORT_URL} download>
            <span>
              <b>匯出 JSON 備份</b>
              <small>下載整個書櫃，可以直接用「匯入」匯回來</small>
            </span>
            <span className="go">↓</span>
          </a>
          <button className="action danger" onClick={logout}>
            <span>
              <b>登出</b>
              <small>這台裝置需要重新輸入密碼</small>
            </span>
            <span className="go">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}
