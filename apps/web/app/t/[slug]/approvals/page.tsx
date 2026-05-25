"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { PrStatusBadge, PoStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { api, ApiError } from "@/lib/api";
import { paiseToCompactINR, timeAgo } from "@/lib/format";
import type { PrListItem, PoListItem } from "@indus/shared";

interface PrList { items: PrListItem[]; total: number; }
interface PoList { items: PoListItem[]; total: number; }

type ApprovalRow =
  | { kind: "pr"; id: string; number: string | null; title: string; requester: string; amountPaise: string; status: string; priority: string; createdAt: string }
  | { kind: "po"; id: string; number: string | null; title: string; vendor: string; amountPaise: string; status: string; priority: null; createdAt: string };

export default function ApprovalsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "pr" | "po">("all");

  async function load() {
    setLoading(true);
    try {
      const [prResp, poResp] = await Promise.all([
        api<PrList>("/api/pr?status=pending_l1&pageSize=100"),
        api<PoList>("/api/po?status=pending_approval&pageSize=100"),
      ]);
      const prRows: ApprovalRow[] = prResp.items.map((p) => ({
        kind: "pr",
        id: p.id,
        number: p.prNumber,
        title: p.title,
        requester: p.requesterName,
        amountPaise: p.estimatedTotalPaise as unknown as string,
        status: p.status,
        priority: p.priority,
        createdAt: p.createdAt,
      }));
      const poRows: ApprovalRow[] = poResp.items.map((p) => ({
        kind: "po",
        id: p.id,
        number: p.poNumber,
        title: p.title,
        vendor: p.vendorName,
        amountPaise: p.totalPaise as unknown as string,
        status: p.status,
        priority: null,
        createdAt: p.createdAt,
      }));
      const combined = [...prRows, ...poRows].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      setRows(combined);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = rows?.filter((r) => (tab === "all" ? true : r.kind === tab)) ?? [];

  const prCount = rows?.filter((r) => r.kind === "pr").length ?? 0;
  const poCount = rows?.filter((r) => r.kind === "po").length ?? 0;

  return (
    <>
      <PageHeader
        title="Pending Approvals"
        subtitle="Items waiting for your decision — review PRs and POs raised by your team"
        actions={
          <button className="btn btn-ghost btn-sm" onClick={load}>
            <Icon name="RefreshCw" /> Refresh
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm flex items-start gap-2">
          <Icon name="AlertTriangle" size={16} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="flex items-center gap-1 mb-4 flex-wrap">
        <TabButton active={tab === "all"} onClick={() => setTab("all")} count={rows?.length ?? 0}>All</TabButton>
        <TabButton active={tab === "pr"} onClick={() => setTab("pr")} count={prCount}>Requisitions</TabButton>
        <TabButton active={tab === "po"} onClick={() => setTab("po")} count={poCount}>Purchase Orders</TabButton>
      </div>

      <div className="card overflow-hidden">
        {loading && !rows ? (
          <div className="p-12 text-center text-muted">Loading approvals…</div>
        ) : filtered.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
              <tr>
                <th className="text-left px-5 py-3 font-semibold w-20">Type</th>
                <th className="text-left px-5 py-3 font-semibold">Number</th>
                <th className="text-left px-5 py-3 font-semibold">Title</th>
                <th className="text-left px-5 py-3 font-semibold">By / Vendor</th>
                <th className="text-left px-5 py-3 font-semibold">Amount</th>
                <th className="text-left px-5 py-3 font-semibold">Priority</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Raised</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const href = r.kind === "pr" ? `/t/${slug}/pr/${r.id}` : `/t/${slug}/po/${r.id}`;
                return (
                  <tr
                    key={`${r.kind}-${r.id}`}
                    className="border-t border-border hover:bg-surface/50 cursor-pointer select-none"
                    onClick={() => { window.location.href = href; }}
                  >
                    <td className="px-5 py-3">
                      <span className={`badge ${r.kind === "pr" ? "badge-tint-lilac" : "badge-tint-peach"} uppercase tracking-wider text-[10px]`}>
                        {r.kind}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{r.number ?? "—"}</td>
                    <td className="px-5 py-3 font-semibold max-w-md truncate">{r.title}</td>
                    <td className="px-5 py-3 text-muted">
                      {r.kind === "pr" ? r.requester : r.vendor}
                    </td>
                    <td className="px-5 py-3 font-semibold tabular-nums">{paiseToCompactINR(r.amountPaise)}</td>
                    <td className="px-5 py-3">
                      {r.priority ? <PriorityBadge priority={r.priority} /> : <span className="text-xs text-muted">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {r.kind === "pr" ? <PrStatusBadge status={r.status} /> : <PoStatusBadge status={r.status} />}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted">{timeAgo(r.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border text-xs text-muted">
            {filtered.length} pending · click any row to review and decide
          </div>
        )}
      </div>
    </>
  );
}

function TabButton({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-pill text-sm font-medium transition flex items-center gap-2 ${
        active ? "bg-primary text-on-dark shadow-sm" : "text-muted hover:bg-surface hover:text-text-default"
      }`}
    >
      <span>{children}</span>
      {count > 0 && (
        <span
          className={`text-[10px] font-bold rounded-full min-w-[20px] px-1.5 py-0.5 ${
            active ? "bg-white/20" : "bg-danger text-on-dark"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function EmptyState({ tab }: { tab: "all" | "pr" | "po" }) {
  const messages = {
    all: { title: "Inbox zero 🎉", body: "No items waiting for your approval right now." },
    pr:  { title: "No pending requisitions", body: "When team raises PRs that need your nod, they show up here." },
    po:  { title: "No pending purchase orders", body: "POs waiting for approval will appear here." },
  } as const;
  const m = messages[tab];
  return (
    <div className="p-12 text-center">
      <div className="h-14 w-14 rounded-2xl mx-auto grid place-items-center bg-tint-mint text-tint-mint-fg mb-4">
        <Icon name="CheckCircle2" size={28} />
      </div>
      <h3 className="display text-xl mb-1">{m.title}</h3>
      <p className="text-sm text-muted">{m.body}</p>
    </div>
  );
}
