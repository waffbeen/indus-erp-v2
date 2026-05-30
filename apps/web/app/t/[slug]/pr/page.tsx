"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { PrStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { StatusTabs, SkeletonRows, EmptyState, FilterBar } from "@/components/ListPrimitives";
import { PrCreateModal } from "@/components/forms/PrCreateModal";
import { api, ApiError } from "@/lib/api";
import { paiseToCompactINR, timeAgo } from "@/lib/format";
import type { PrListItem } from "@indus/shared";

interface ListResponse {
  items: PrListItem[];
  total: number;
  page: number;
  pageSize: number;
}

type StatusKey = "all" | "draft" | "pending_l1" | "approved" | "rejected" | "cancelled";

const STATUS_TABS: Array<{ key: StatusKey; label: string }> = [
  { key: "all",        label: "All" },
  { key: "draft",      label: "Drafts" },
  { key: "pending_l1", label: "Pending" },
  { key: "approved",   label: "Approved" },
  { key: "rejected",   label: "Rejected" },
  { key: "cancelled",  label: "Cancelled" },
];

export default function PrListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/pr`;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<StatusKey>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [buyerMine, setBuyerMine] = useState(false);
  /** Cached counts per status — refreshed on each load. */
  const [counts, setCounts] = useState<Partial<Record<StatusKey, number>>>({});
  const [createOpen, setCreateOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (appliedSearch.trim()) qs.set("search", appliedSearch.trim());
      if (status !== "all") qs.set("status", status);
      if (mineOnly) qs.set("mine", "true");
      if (buyerMine) qs.set("buyer", "me");
      qs.set("pageSize", "100");
      const res = await api<ListResponse>(`/api/pr?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load PRs");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Run one cheap-count query per status — keeps tab badges live without
   * loading the full list for every status.
   */
  async function loadCounts() {
    try {
      const wanted: StatusKey[] = ["draft", "pending_l1", "approved", "rejected", "cancelled"];
      const all = await Promise.all(
        wanted.map((s) =>
          api<ListResponse>(`/api/pr?status=${s}&pageSize=1${mineOnly ? "&mine=true" : ""}${buyerMine ? "&buyer=me" : ""}`)
            .then((r) => [s, r.total] as const)
            .catch(() => [s, 0] as const),
        ),
      );
      const map: Partial<Record<StatusKey, number>> = {};
      let totalAll = 0;
      for (const [k, v] of all) { map[k] = v; totalAll += v; }
      map.all = totalAll;
      setCounts(map);
    } catch { /* noop */ }
  }

  useEffect(() => {
    load();
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mineOnly, buyerMine, appliedSearch]);

  const tabsWithCounts = STATUS_TABS.map((t) => ({ ...t, count: counts[t.key] }));

  return (
    <>
      <PageHeader
        title="Purchase Requisition"
        subtitle="Raise requests for materials and services"
        actions={
          <button onClick={() => setCreateOpen(true)} className="btn btn-primary btn-sm">
            <Icon name="Plus" size={14} /> Create
          </button>
        }
      />

      <div className="mb-3">
        <StatusTabs tabs={tabsWithCounts} value={status} onChange={setStatus} />
      </div>

      <FilterBar search={search} onSearch={setSearch} placeholder="Search by title…">
        <label className="flex items-center gap-1.5 text-[11.5px] text-muted whitespace-nowrap px-2 cursor-pointer">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Raised by me
        </label>
        <label className="flex items-center gap-1.5 text-[11.5px] text-muted whitespace-nowrap px-2 cursor-pointer">
          <input
            type="checkbox"
            checked={buyerMine}
            onChange={(e) => setBuyerMine(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Assigned to me
        </label>
      </FilterBar>

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">PR #</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Title</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Requester</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Items</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Amount</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Priority</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Created</th>
              </tr>
            </thead>
            <SkeletonRows rows={6} cols={8} />
          </table>
        ) : !data?.items.length ? (
          <div className="p-10 text-center">
            <div className="h-10 w-10 rounded-md mx-auto grid place-items-center mb-2.5" style={{ background: "var(--tint-teal)", color: "var(--tint-teal-fg)" }}>
              <Icon name="FileText" size={18} />
            </div>
            <h3 className="text-[14px] font-semibold tracking-tight mb-1">
              {appliedSearch || status !== "all" ? "No requisitions match these filters" : "No requisitions yet"}
            </h3>
            <p className="text-[12px] text-muted leading-relaxed max-w-sm mx-auto">
              {appliedSearch || status !== "all"
                ? "Try clearing the search or switching the status tab."
                : "Raise your first request — picks suppliers, gets approved, becomes a PO."}
            </p>
            {!appliedSearch && status === "all" && (
              <button onClick={() => setCreateOpen(true)} className="btn btn-primary btn-sm mt-4">
                <Icon name="Plus" size={13} /> Create requisition
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">PR #</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Title</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Requester</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Items</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Amount</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Priority</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((pr) => (
                <tr
                  key={pr.id}
                  className="border-t border-border hover:bg-surface/60 cursor-pointer select-none transition"
                  onClick={() => { window.location.href = `${base}/${pr.id}`; }}
                  title="Click to open"
                >
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {pr.prNumber ?? <span className="text-muted italic">draft</span>}
                  </td>
                  <td className="px-3 py-2 font-medium max-w-md truncate">{pr.title}</td>
                  <td className="px-3 py-2 text-muted">{pr.requesterName}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-muted">{pr.itemsCount}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-right">{paiseToCompactINR((pr.estimatedTotal ?? 0) * 100)}</td>
                  <td className="px-3 py-2"><PriorityBadge priority={pr.priority} /></td>
                  <td className="px-3 py-2"><PrStatusBadge status={pr.status} /></td>
                  <td className="px-3 py-2 text-[11px] text-muted">{timeAgo(pr.createdAt)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface">
                <td colSpan={8} className="px-3 py-1.5 text-[11px] text-muted">
                  {data.total} {data.total === 1 ? "requisition" : "requisitions"} · click any row to open
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Legacy-style "Purchase Requisition Creation" modal */}
      <PrCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { load(); loadCounts(); }}
      />
    </>
  );
}
