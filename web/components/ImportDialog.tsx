"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { ImportResult } from "@/lib/types";

/** 預覽貼上的 JSON 有幾本書；格式錯誤時回傳錯誤訊息。 */
function preview(text: string): { count: number } | { error: string } | null {
  if (!text.trim()) return null;
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : Array.isArray(data?.books) ? data.books : null;
    if (!list) return { error: "需要 JSON 陣列，或 {\"books\": [...]}" };
    return { count: list.length };
  } catch {
    return { error: "JSON 格式錯誤" };
  }
}

export default function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const info = useMemo(() => preview(text), [text]);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setText(await f.text());
  }

  async function submit() {
    if (!info || "error" in info || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.importBooks(text);
      setResult(r);
      onImported();
    } catch (e) {
      setError("匯入失敗：" + errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}>
      <div className="body">
        <h3>匯入書籍</h3>
        {result ? (
          <>
            <p>
              匯入 {result.imported} 本
              {result.skipped.length > 0 && `，略過 ${result.skipped.length} 本已經在書櫃裡的書`}。
            </p>
            {result.errors.length > 0 && (
              <div className="err">
                {result.errors.length} 筆資料有誤沒有匯入：
                <ul>
                  {result.errors.map((e) => (
                    <li key={e.index}>
                      第 {e.index + 1} 筆{e.title ? `《${e.title}》` : ""}：{e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="foot">
              <span />
              <button className="btn primary" onClick={onClose}>
                完成
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint" style={{ fontSize: 13 }}>
              貼上 artifact 書櫃匯出的 JSON（每本書有 title、author、status、rating、finishedAt、note），
              或本系統匯出的 JSON。書名＋作者相同的書會略過，不會重複匯入。
            </p>
            <label htmlFor="importFile">選擇檔案</label>
            <input id="importFile" type="file" accept="application/json,.json" onChange={onFile} />
            <label htmlFor="importText">或直接貼上</label>
            <textarea
              id="importText"
              style={{ minHeight: 180, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='[{"title":"挪威的森林","author":"村上春樹","status":"read","rating":1,"finishedAt":"2026-09-01","note":""}]'
            />
            {info && ("error" in info ? <div className="err">{info.error}</div> : <div className="hint">共 {info.count} 本書</div>)}
            {error && <div className="err">{error}</div>}
            <div className="foot">
              <span />
              <div className="right">
                <button className="btn" onClick={onClose}>
                  取消
                </button>
                <button className="btn primary" onClick={submit} disabled={busy || !info || "error" in info}>
                  {busy ? "匯入中…" : "匯入"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
