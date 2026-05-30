"use client";
import { Icon } from "@/components/Icon";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  pending?: boolean;
}

/** Human labels for the read-only tools the assistant can call. */
const TOOL_LABELS: Record<string, string> = {
  get_dashboard_stats: "Dashboard stats",
  list_purchase_orders: "Purchase orders",
  list_purchase_requisitions: "Requisitions",
  get_vendor_spend_report: "Vendor spend",
  get_top_items_report: "Top items",
  get_pr_aging_report: "PR aging",
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}

export function ChatMessage({ message }: { message: ChatMsg }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className="h-7 w-7 rounded-full grid place-items-center shrink-0 mt-0.5"
        style={
          isUser
            ? { background: "var(--surface-2)", color: "var(--muted)" }
            : { background: "linear-gradient(135deg, var(--primary), var(--primary-hover))", color: "var(--primary-fg)" }
        }
      >
        <Icon name={isUser ? "User" : "Sparkles"} size={14} />
      </div>

      {/* Bubble */}
      <div className={`min-w-0 max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div
          className="rounded-lg px-3 py-2 text-[13px] leading-relaxed"
          style={
            isUser
              ? { background: "var(--primary)", color: "var(--primary-fg)" }
              : { background: "var(--surface)", color: "var(--text)" }
          }
        >
          {message.pending ? (
            <TypingDots />
          ) : (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          )}
        </div>

        {/* Tool chips — what the assistant looked at to answer */}
        {!isUser && !message.pending && message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="flex flex-wrap gap-1 px-0.5">
            {message.toolsUsed.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-medium"
                style={{ background: "var(--tint-lilac)", color: "var(--tint-lilac-fg)" }}
                title={`Read from: ${toolLabel(t)}`}
              >
                <Icon name="Database" size={9} />
                {toolLabel(t)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full animate-bounce"
          style={{ background: "var(--muted-2)", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
