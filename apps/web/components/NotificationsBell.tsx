"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Icon, type IconProps } from "./Icon";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  resourceType: string | null;
  resourceId: string | null;
  readAt: string | null;
  createdAt: string;
}

const KIND_ICON: Record<string, IconProps["name"]> = {
  pr_submitted:    "Inbox",
  pr_approved:     "CheckCircle2",
  pr_rejected:     "XCircle",
  pr_sent_back:    "Undo2",
  po_submitted:    "Inbox",
  po_approved:     "CheckCircle2",
  po_rejected:     "XCircle",
  po_sent_to_vendor: "Truck",
  grn_raised:      "PackageCheck",
  grn_cancelled:   "PackageX",
  user_invited:    "UserPlus",
  amendment_recorded: "FilePen",
};

const KIND_TINT: Record<string, { bg: string; fg: string }> = {
  pr_submitted:    { bg: "var(--tint-peach)", fg: "var(--tint-peach-fg)" },
  pr_approved:     { bg: "var(--tint-mint)",  fg: "var(--tint-mint-fg)"  },
  pr_rejected:     { bg: "var(--tint-blush)", fg: "var(--tint-blush-fg)" },
  pr_sent_back:    { bg: "var(--tint-peach)", fg: "var(--tint-peach-fg)" },
  po_submitted:    { bg: "var(--tint-peach)", fg: "var(--tint-peach-fg)" },
  po_approved:     { bg: "var(--tint-mint)",  fg: "var(--tint-mint-fg)"  },
  po_rejected:     { bg: "var(--tint-blush)", fg: "var(--tint-blush-fg)" },
  po_sent_to_vendor: { bg: "var(--tint-teal)", fg: "var(--tint-teal-fg)" },
  grn_raised:      { bg: "var(--tint-mint)",  fg: "var(--tint-mint-fg)"  },
  grn_cancelled:   { bg: "var(--tint-blush)", fg: "var(--tint-blush-fg)" },
  user_invited:    { bg: "var(--tint-lilac)", fg: "var(--tint-lilac-fg)" },
  amendment_recorded: { bg: "var(--tint-lilac)", fg: "var(--tint-lilac-fg)" },
};

export function NotificationsBell() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? "";

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const data = await api<{ count: number }>("/api/notifications/unread-count");
      setCount(data.count);
    } catch { /* swallow */ }
  }, []);

  // Initial poll + 60s refresh — keeps the bell live without sockets
  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 60_000);
    return () => clearInterval(t);
  }, [refreshCount]);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function loadItems() {
    setLoading(true);
    try {
      const data = await api<NotificationRow[]>("/api/notifications?limit=15");
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen() {
    if (!open) {
      setOpen(true);
      await loadItems();
    } else {
      setOpen(false);
    }
  }

  async function handleClickRow(n: NotificationRow) {
    // Mark this one read, then navigate
    try {
      await api(`/api/notifications/mark-read`, { method: "POST", body: JSON.stringify({ ids: [n.id] }) });
    } catch { /* noop */ }
    setOpen(false);
    refreshCount();
    if (n.resourceType && n.resourceId) {
      const path =
        n.resourceType === "pr" ? `/t/${slug}/pr/${n.resourceId}` :
        n.resourceType === "po" ? `/t/${slug}/po/${n.resourceId}` :
        n.resourceType === "grn" ? `/t/${slug}/grn/${n.resourceId}` :
        null;
      if (path) router.push(path);
    }
  }

  async function markAllRead() {
    try {
      await api(`/api/notifications/mark-read`, { method: "POST", body: JSON.stringify({}) });
    } catch { /* noop */ }
    setCount(0);
    setItems((arr) => arr.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        onClick={handleOpen}
        className="h-8 w-8 rounded-md grid place-items-center text-muted hover:text-text-default hover:bg-surface border border-transparent hover:border-border-strong relative"
        aria-label="Notifications"
      >
        <Icon name="Bell" size={16} />
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold grid place-items-center"
            style={{ background: "var(--danger)", color: "#fff" }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 card overflow-hidden z-50" style={{ boxShadow: "var(--shadow-lg)" }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-[12px] font-semibold">Notifications</p>
            {count > 0 && (
              <button onClick={markAllRead} className="text-[11px] text-primary font-medium hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted">Loading…</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center">
                <div className="h-10 w-10 mx-auto mb-2 rounded-md grid place-items-center" style={{ background: "var(--tint-mint)", color: "var(--tint-mint-fg)" }}>
                  <Icon name="CheckCircle2" size={18} />
                </div>
                <p className="text-xs text-muted">All caught up.</p>
              </div>
            ) : (
              <ul>
                {items.map((n) => {
                  const tint = KIND_TINT[n.kind] ?? { bg: "var(--surface)", fg: "var(--muted)" };
                  const icon = KIND_ICON[n.kind] ?? "Bell";
                  const isUnread = !n.readAt;
                  return (
                    <li
                      key={n.id}
                      onClick={() => handleClickRow(n)}
                      className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-border last:border-b-0 cursor-pointer hover:bg-surface/60 transition ${isUnread ? "bg-surface/40" : ""}`}
                    >
                      <div className="h-7 w-7 rounded-md grid place-items-center shrink-0 mt-0.5" style={{ background: tint.bg, color: tint.fg }}>
                        <Icon name={icon} size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] leading-snug ${isUnread ? "font-semibold text-text-default" : "text-muted"}`}>
                          {n.title}
                        </p>
                        {n.body && <p className="text-[11px] text-muted leading-snug mt-0.5 truncate">{n.body}</p>}
                        <p className="text-[10px] text-muted mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                      {isUnread && (
                        <span className="h-1.5 w-1.5 rounded-full mt-2 shrink-0" style={{ background: "var(--primary)" }} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
