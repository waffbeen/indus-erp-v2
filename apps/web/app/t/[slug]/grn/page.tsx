"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { StatusTabs, SkeletonRows, EmptyState, FilterBar } from "@/components/ListPrimitives";
import { api, ApiError } from "@/lib/api";
import { paiseToINR, formatDate, timeAgo } from "@/lib/format";
import type { GrnListItem } from "@indus/shared";

interface ListResponse { items: GrnListItem[]; total: number; page: number; pageSize: number; }

const STATUS_TINT: Record<string, string> = {
  draft: "badge-tint-lilac",
  submitted: "badge-info",
  qc_pending: "badge-warning",
  accepted: "badge-success",
  partially_accepted: "badge-tint-peach",
  rejected: "badge-danger",
  cancelled: "badge-tint-blush",
};

type StatusKey = "all" | "accepted" | "partially_accepted" | "rejected" | "submitted" | "qc_pending" | "cancelled";

const TABS: Array<{ key: StatusKey; label: string }> = [
  { key: "all",                 label: "All" },
  { key: "accepted",            label: "Accepted" },
  { key: "partially_accepted",  label: "Partial" },
  { key: "rejected",            label: "Rejected" },
  { key: "qc_pending",          label: "QC Pending" },
  { key: "submitted",           label: "Submitted" },
  { key: "cancelled",           label: "Cancelled" },
];

export default function GrnListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/grn`;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusKey>("all");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [counts, setCounts] = useState<Partial<Record<StatusKey, number>>>({});

  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status !== "all") qs.set("status", status);
      if (appliedSearch.trim()) qs.set("search", appliedSearch.trim());
      qs.set("pageSize", "100");
      const res = await api<ListResponse>(`/api/grn?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function loadCounts() {
    try {
      const wanted: StatusKey[] = ["accepted", "partially_accepted", "rejected", "qc_pending", "submitted", "cancelled"];
      const all = await Promise.all(
        wanted.map((s) =>
          api<ListResponse>(`/api/grn?status=${s}&pageSize=1`)
            .then((r) => [s, r.total] as const)
            .catch(() => [s, 0] as const),
        ),
      );
      const map: Partial<Record<StatusKey, number>> = {};
      let total = 0;
      for (const [k, v] of all) { map[k] = v; total += v; }
      map.all = total;
      setCounts(map);
    } catch { /* noop */ }
  }

  useEffect(() => {
    load();
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, appliedSearch]);

  const tabsWithCounts = TABS.map((t) => ({ ...t, count: counts[t.key] }));

  return (
    <>
      <PageHeader
        title="Goods Receipt"
        subtitle="Materials received against POs — accepted, rejected, batch tracked"
      />

      <div className="mb-3 overflow-x-auto">
        <StatusTabs tabs={tabsWithCounts} value={status} onChange={setStatus} />
      </div>

      <FilterBar
        search={searchInput}
        onSearch={setSearchInput}
        placeholder="Search by GRN number or invoice number…"
      />

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
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">GRN #</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">PO</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Supplier</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Invoice</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Amount</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Received</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Items</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
              </tr>
            </thead>
            <SkeletonRows rows={5} cols={8} />
          </table>
        ) : !data?.items.length ? (
          <EmptyState
            icon="PackageCheck"
            iconTint="var(--tint-mint)"
            iconColor="var(--tint-mint-fg)"
            title={status !== "all" || appliedSearch ? "No GRNs match these filters" : "No goods receipts yet"}
            description={
              status !== "all" || appliedSearch
                ? "Try clearing the search or switching the status tab."
                : "Approve a PO, send it to supplier, then open the PO and click \"Receive (GRN)\"."
            }
          />
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">GRN #</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">PO</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Supplier</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Invoice</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Amount</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Received</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Items</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((g) => (
                <tr
                  key={g.id}
                  className="border-t border-border hover:bg-surface/60 cursor-pointer select-none transition"
                  onClick={() => { window.location.href = `${base}/${g.id}`; }}
                >
                  <td className="px-3 py-2 font-mono text-[11px]">{g.grnNumber ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{g.poNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{g.vendorName ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{g.invoiceNumber ?? "—"}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-right">{paiseToINR(g.invoiceAmountPaise)}</td>
                  <td className="px-3 py-2 text-[11px] text-muted">{formatDate(g.receivedDate)}</td>
                  <td className="px-3 py-2 text-right text-muted">{g.itemsCount}</td>
                  <td className="px-3 py-2">
                    <span className={`badge ${STATUS_TINT[g.status]} capitalize text-[10px]`}>
                      {g.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface">
                <td colSpan={8} className="px-3 py-1.5 text-[11px] text-muted">
                  {data.total} {data.total === 1 ? "receipt" : "receipts"} · click any row to open
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
