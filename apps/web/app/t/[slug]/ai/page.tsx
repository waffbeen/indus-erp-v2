"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ChatMessage, type ChatMsg } from "@/components/ai/ChatMessage";
import { ChatComposer } from "@/components/ai/ChatComposer";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AiChatMessage, AiChatResponse } from "@indus/shared";

const SUGGESTIONS = [
  "How are we doing this month?",
  "Which POs are pending approval over ₹1 lakh?",
  "Who are our top vendors by spend?",
  "What requisitions have been waiting longest for approval?",
  "What do we spend the most on?",
];

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  }
}

export default function AiAssistantPage() {
  const { me } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Capability probe so we can warn up-front if the assistant isn't configured.
  useEffect(() => {
    let cancelled = false;
    api<{ configured: boolean }>("/api/ai/status")
      .then((r) => { if (!cancelled) setConfigured(r.configured); })
      .catch(() => { if (!cancelled) setConfigured(null); });
    return () => { cancelled = true; };
  }, []);

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || loading) return;

    const userMsg: ChatMsg = { id: newId(), role: "user", content: text };
    // Full real history (drop any pending placeholder) + this new turn.
    const history = [...messages.filter((m) => !m.pending), userMsg];
    const pendingId = newId();
    setMessages([...history, { id: pendingId, role: "assistant", content: "", pending: true }]);
    setInput("");
    setLoading(true);

    const reqMessages: AiChatMessage[] = history.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await api<AiChatResponse>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages: reqMessages }),
      });
      setConfigured(res.configured);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { id: pendingId, role: "assistant", content: res.reply, toolsUsed: res.toolsUsed }
            : m,
        ),
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Something went wrong reaching the assistant. Please try again.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId ? { id: pendingId, role: "assistant", content: `⚠️ ${msg}` } : m,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  const firstName = me?.fullName?.split(" ")[0] ?? "there";
  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 116px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="h-9 w-9 rounded-lg grid place-items-center shrink-0"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-hover))", color: "var(--primary-fg)" }}
          >
            <Icon name="Sparkles" size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[16px] font-semibold tracking-tight leading-none">Ask your ERP</h1>
            <p className="text-[11.5px] text-muted mt-1 truncate">
              Natural-language answers about your procurement &amp; inventory — read-only.
            </p>
          </div>
        </div>
        {hasMessages && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setMessages([])}
            disabled={loading}
            title="Start a new conversation"
          >
            <Icon name="RefreshCw" size={13} /> New chat
          </button>
        )}
      </div>

      {configured === false && (
        <div className="rounded p-2.5 text-xs flex items-start gap-2" style={{ background: "var(--warning-bg)", color: "var(--warning-fg)" }}>
          <Icon name="AlertTriangle" size={14} />
          <span className="flex-1">
            The AI assistant isn&apos;t configured on the server yet (missing API key). You can still
            explore the interface — replies will explain this.
          </span>
        </div>
      )}

      {/* Conversation surface */}
      <div className="card flex-1 min-h-0 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {!hasMessages ? (
            <EmptyState firstName={firstName} onPick={(s) => void send(s)} disabled={loading} />
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <ChatMessage key={m.id} message={m} />
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border p-3 bg-bg">
          <ChatComposer value={input} onChange={setInput} onSend={() => void send()} disabled={loading} />
          <p className="text-[10.5px] text-muted mt-1.5 px-0.5">
            The assistant can only read your own organisation&apos;s data and never makes changes. It may be imperfect — verify important figures.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  firstName,
  onPick,
  disabled,
}: {
  firstName: string;
  onPick: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4">
      <div
        className="h-12 w-12 rounded-xl grid place-items-center mb-3"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-hover))", color: "var(--primary-fg)" }}
      >
        <Icon name="Sparkles" size={22} />
      </div>
      <h2 className="text-[15px] font-semibold tracking-tight">Hi {firstName} — what would you like to know?</h2>
      <p className="text-[12px] text-muted mt-1 max-w-md">
        Ask in plain English about purchase orders, requisitions, vendors, spend and pending approvals.
        Try one of these:
      </p>
      <div className="flex flex-wrap gap-2 justify-center mt-4 max-w-xl">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className="rounded-pill border border-border-strong px-3 py-1.5 text-[12px] text-text-default hover:border-primary/50 hover:bg-surface transition disabled:opacity-50"
            onClick={() => onPick(s)}
            disabled={disabled}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
