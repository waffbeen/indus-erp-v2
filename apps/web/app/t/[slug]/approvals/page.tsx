"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { PrStatusBadge, PoStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { StatusTabs, SkeletonRows, EmptyState } from "@/components/ListPrimitives";
import { api, ApiError } from "@/lib/api";
import { paiseToCompactINR, timeAgo } from "@/lib/format";
import type { PrListItem, PoListItem } from "@indus/shared";

interface PrList { items: PrListItem[]; total: number; }
interface PoList { items: PoListItem[]; total: number; }

type ApprovalRow =
  | { kind: "pr"; id: string; number: string | null; title: string; requester: string; amountPaise: string; status: string; priority: string; createdAt: string }
  | { kind: "po"; id: string; number: string | null; title: string; vendor: string; amountPaise: string; status: string; priority: null; createdAt: string };

type TabKey = "all" | "pr" | "po";

export default function ApprovalsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");

  async function load() {
    setLoading(true);
    try {
      const [prResp, poResp] = await Promise.all([
        api<PrList>("/api/pr?status=pending_l1&pageSize=100"),
        api<PoList>("/api/po?status=pending_approval&pageSize=100"),
      ]);
      const prRows: ApprovalRow[] = prResp.items.map((p) => ({
        kind: "pr", id: p.id, number: p.prNumber, title: p.title,
        requester: p.requesterName,
        amountPaise: String(Math.round((p.estimatedTotal ?? 0) * 100)),
        status: p.status, priority: p.priority, createdAt: p.createdAt,
      }));
      const poRows: ApprovalRow[] = poResp.items.map((p) => ({
        kind: "po", id: p.id, number: p.poNumber, title: p.title,
        vendor: p.vendorName,
        amountPaise: String(Math.round((p.total ?? 0) * 100)),
        status: p.status, priority: null, createdAt: p.createdAt,
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

  useEffect(() => { load(); }, []);

  const filtered = rows?.filter((r) => (tab === "all" ? true : r.kind === tab)) ?? [];
  const prCount = rows?.filter((r) => r.kind === "pr").length ?? 0;
  const poCount = rows?.filter((r) => r.kind === "po").length ?? 0;

  const tabsWithCounts: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "all", label: "All",            count: rows?.length ?? 0 },
    { key: "pr",  label: "Requisitions",   count: prCount },
    { key: "po",  label: "Purchase Orders",count: poCount },
  ];

  return (
    <>
      <PageHeader
        title="Pending Approvals"
        subtitle="Items waiting for your decision — review PRs and POs raised by your team"
        actions={
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <Icon name="RefreshCw" size={13} /> {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="mb-3">
        <StatusTabs tabs={tabsWithCounts} value={tab} onChange={setTab} />
      </div>

      <div className="card overflow-hidden">
        {loading && !rows ? (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted w-16">Type</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Number</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Title</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">By / Supplier</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Amount</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Priority</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Waiting</th>
              </tr>
            </thead>
            <SkeletonRows rows={5} cols={8} />
          </table>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="CircleCheckBig"
            iconTint="var(--tint-mint)"
            iconColor="var(--tint-mint-fg)"
            title={tab === "all" ? "Inbox zero — nothing waiting" : tab === "pr" ? "No pending requisitions" : "No pending purchase orders"}
            description={
              tab === "all"
                ? "No items are waiting for your approval right now. Take a break ☕"
                : tab === "pr"
                  ? "When team raises PRs that need your nod, they'll show up here."
                  : "POs waiting for approval will appear here."
            }
          />
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted w-16">Type</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Number</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Title</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">By / Supplier</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Amount</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Priority</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Waiting</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const href = r.kind === "pr" ? `/t/${slug}/pr/${r.id}` : `/t/${slug}/po/${r.id}`;
                const ageHours = (Date.now() - new Date(r.createdAt).getTime()) / 36e5;
                const urgent = ageHours > 48;
                return (
                  <tr
                    key={`${r.kind}-${r.id}`}
                    className={`border-t border-border hover:bg-surface/60 cursor-pointer select-none transition`}
                    onClick={() => { window.location.href = href; }}
                  >
                    <td className="px-3 py-2">
                      <span className={`badge ${r.kind === "pr" ? "badge-tint-lilac" : "badge-tint-peach"} uppercase tracking-wider text-[10px] font-bold`}>
                        {r.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">{r.number ?? "—"}</td>
                    <td className="px-3 py-2 font-medium max-w-md truncate">{r.title}</td>
                    <td className="px-3 py-2 text-muted">
                      {r.kind === "pr" ? r.requester : r.vendor}
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums text-right">{paiseToCompactINR(r.amountPaise)}</td>
                    <td className="px-3 py-2">
                      {r.priority ? <PriorityBadge priority={r.priority} /> : <span className="text-[11px] text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.kind === "pr" ? <PrStatusBadge status={r.status} /> : <PoStatusBadge status={r.status} />}
                    </td>
                    <td className={`px-3 py-2 text-[11px] ${urgent ? "text-danger-fg font-semibold" : "text-muted"}`}>
                      {urgent && <Icon name="Clock" size={11} className="inline mr-1" />}
                      {timeAgo(r.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface">
                <td colSpan={8} className="px-3 py-1.5 text-[11px] text-muted">
                  {filtered.length} pending · click any row to review and decide
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
