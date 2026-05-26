"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { PrStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { api, ApiError } from "@/lib/api";
import { paiseToCompactINR, timeAgo } from "@/lib/format";
import type { PrListItem } from "@indus/shared";

interface ListResponse {
  items: PrListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUS_TABS = [
  { key: "all",        label: "All" },
  { key: "draft",      label: "Drafts" },
  { key: "pending_l1", label: "Pending" },
  { key: "approved",   label: "Approved" },
  { key: "rejected",   label: "Rejected" },
  { key: "cancelled",  label: "Cancelled" },
] as const;

export default function PrListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/pr`;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [buyerMine, setBuyerMine] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (status !== "all") qs.set("status", status);
      if (mineOnly) qs.set("mine", "true");
      if (buyerMine) qs.set("buyer", "me");
      const res = await api<ListResponse>(`/api/pr?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load PRs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mineOnly, buyerMine]);

  return (
    <>
      <PageHeader
        title="Purchase Requisitions"
        subtitle="Raise requests for materials and services"
        actions={
          <Link href={`${base}/new`} className="btn btn-primary">
            <Icon name="Plus" /> New Requisition
          </Link>
        }
      />

      {/* Status tabs */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-4 py-1.5 rounded-pill text-sm font-medium transition ${
              status === t.key
                ? "bg-primary text-on-dark shadow-sm"
                : "text-muted hover:bg-surface hover:text-text-default"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-sm text-muted px-3">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="rounded"
          />
          Raised by me
        </label>
        <label className="flex items-center gap-2 text-sm text-muted px-3">
          <input
            type="checkbox"
            checked={buyerMine}
            onChange={(e) => setBuyerMine(e.target.checked)}
            className="rounded"
          />
          Assigned to me <span className="text-[10px] text-muted">(as buyer)</span>
        </label>
        <div className="relative">
          <input
            className="input !py-2 !pl-9 !w-64 text-sm"
            placeholder="Search by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" style={{ pointerEvents: "none" }}>
            <Icon name="Search" />
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-muted">Loading requisitions…</div>
        ) : !data?.items.length ? (
          <EmptyState base={base} />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">PR #</th>
                <th className="text-left px-5 py-3 font-semibold">Title</th>
                <th className="text-left px-5 py-3 font-semibold">Requester</th>
                <th className="text-left px-5 py-3 font-semibold">Items</th>
                <th className="text-left px-5 py-3 font-semibold">Amount</th>
                <th className="text-left px-5 py-3 font-semibold">Priority</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((pr) => (
                <tr
                  key={pr.id}
                  className="border-t border-border hover:bg-surface/50 cursor-pointer select-none"
                  onClick={() => { window.location.href = `${base}/${pr.id}`; }}
                  title="Click to open"
                >
                  <td className="px-5 py-3 font-mono text-xs">{pr.prNumber ?? <span className="text-muted">draft</span>}</td>
                  <td className="px-5 py-3 font-semibold">{pr.title}</td>
                  <td className="px-5 py-3 text-muted">{pr.requesterName}</td>
                  <td className="px-5 py-3 text-muted">{pr.itemsCount}</td>
                  <td className="px-5 py-3 font-semibold tabular-nums">{paiseToCompactINR(pr.estimatedTotalPaise as unknown as string)}</td>
                  <td className="px-5 py-3"><PriorityBadge priority={pr.priority} /></td>
                  <td className="px-5 py-3"><PrStatusBadge status={pr.status} /></td>
                  <td className="px-5 py-3 text-xs text-muted">{timeAgo(pr.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.items.length > 0 && (
          <div className="px-5 py-3 border-t border-border text-xs text-muted flex justify-between items-center">
            <span>{data.total} requisition{data.total === 1 ? "" : "s"} · click row to open</span>
            <span>Page {data.page}</span>
          </div>
        )}
      </div>
    </>
  );
}

function EmptyState({ base }: { base: string }) {
  return (
    <div className="p-12 text-center">
      <div className="h-14 w-14 rounded-2xl mx-auto grid place-items-center bg-tint-teal text-tint-teal-fg mb-4">
        <Icon name="FileText" size={28} />
      </div>
      <h3 className="display text-xl mb-1">No requisitions yet</h3>
      <p className="text-sm text-muted mb-5">Raise your first request — picks vendors, gets approved, becomes a PO.</p>
      <Link href={`${base}/new`} className="btn btn-primary">
        <Icon name="Plus" /> Create requisition
      </Link>
    </div>
  );
}
