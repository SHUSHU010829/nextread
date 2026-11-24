"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { STATUS_LABEL, type ChatMessage, type Suggestion } from "@/lib/types";
import { useApp } from "./AppProvider";
import { Cover, ScoreBadge } from "./BookBits";
import { IconPlus, IconSend } from "./icons";
import { findOwned, wantPreset } from "./recommend-utils";

const STORAGE_KEY = "nextread:chat";
const STARTERS = ["推薦幾本我可能會喜歡的書", "想看輕鬆一點的小說", "跟我超級喜歡的書類似的", "想學點實用的東西"];

function loadChat(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveChat(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
  } catch {
    /* 瀏覽器不允許儲存時就不保留對話 */
  }
}

function SuggestionCard({ item }: { item: Suggestion }) {
  const { books, openEditor } = useApp();
  const owned = books ? findOwned(books, item.title) : undefined;
  return (
    <div className="sugg">
      <Cover src={item.book?.cover_url} title={item.title} size="md" />
      <div className="sugg-main">
        <div className="sugg-head">
          <div>
            <h4>{item.title}</h4>
            <p className="by">{item.author}</p>
          </div>
          <ScoreBadge score={item.score} />
        </div>
        <p className="reason">{item.reason}</p>
        {!item.verified && <p className="warn">書籍資料庫查不到這本，可能是書名不同或沒有收錄</p>}
        <div className="sugg-foot">
          {owned ? (
            <span className="tag-owned">已在書櫃（{STATUS_LABEL[owned.status]}）</span>
          ) : (
            <button
              className="btn accent small"
              onClick={() =>
                openEditor(null, wantPreset({ title: item.title, author: item.author, score: item.score, reason: item.reason }, item.book))
              }
            >
              <IconPlus size={16} /> 加入想讀
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 「幫我挑書」：聊天式推薦，對話保留在這台裝置上。 */
export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMessages(loadChat()), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  async function send(text: string, base: ChatMessage[] = messages) {
    const content = text.trim();
    if (!content || busy) return;
    const next: ChatMessage[] = [...base, { role: "user", content }];
    setMessages(next);
    saveChat(next);
    setInput("");
    setBusy(true);
    setError("");
    try {
      const r = await api.chat(next);
      const done: ChatMessage[] = [...next, { role: "assistant", content: r.message, items: r.items }];
      setMessages(done);
      saveChat(done);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return;
    send(last.content, messages.slice(0, -1));
  }

  function clear() {
    setMessages([]);
    saveChat([]);
    setError("");
  }

  return (
    <div className="chat">
      <div className="chat-log" aria-live="polite">
        <div className="msg assistant">
          <div className="bubble">想找什麼樣的書？我會依照你的評價和心得挑書，也可以直接說這次的心情或主題。</div>
        </div>
        {messages.length === 0 && (
          <div className="starters">
            {STARTERS.map((s) => (
              <button key={s} className="chip action" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content && <div className="bubble">{m.content}</div>}
            {m.items && m.items.length > 0 && (
              <div className="suggs">
                {m.items.map((it, j) => (
                  <SuggestionCard key={j} item={it} />
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <div className="bubble typing">
              <span />
              <span />
              <span />
              <em>挑書中，大約 20–40 秒</em>
            </div>
          </div>
        )}
        {error && (
          <div className="msg assistant">
            <div className="bubble error">
              {error}{" "}
              <button className="link" onClick={retry}>
                重試
              </button>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          type="text"
          placeholder="例如：最近想看溫暖一點的小說"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="訊息"
        />
        <button type="submit" className="btn accent icon" disabled={busy || !input.trim()} aria-label="送出">
          <IconSend />
        </button>
      </form>
      {messages.length > 0 && (
        <button className="link clear" onClick={clear}>
          清除對話
        </button>
      )}
    </div>
  );
}
