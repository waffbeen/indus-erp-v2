"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
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

const STATUS_OPTIONS = [
  { value: "",                  label: "All statuses" },
  { value: "accepted",          label: "Accepted" },
  { value: "partially_accepted",label: "Partially accepted" },
  { value: "rejected",          label: "Rejected" },
  { value: "submitted",         label: "Submitted (legacy)" },
  { value: "qc_pending",        label: "QC pending" },
  { value: "cancelled",         label: "Cancelled" },
];

export default function GrnListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/grn`;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (appliedSearch.trim()) qs.set("search", appliedSearch.trim());
      const url = qs.toString() ? `/api/grn?${qs.toString()}` : "/api/grn";
      const res = await api<ListResponse>(url);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // Debounce search input so we don't fire on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, appliedSearch]);

  return (
    <>
      <PageHeader
        title="Goods Receipt Notes"
        subtitle="Materials received against POs — accepted, rejected, and condition tracking"
        actions={
          <p className="text-xs text-muted">
            Tip: GRNs are created from a PO's detail page or a Gate Entry.
          </p>
        }
      />

      {error && <div className="mb-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>}

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search by GRN number or invoice number..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <select
          className="input sm:w-56"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-muted">Loading…</div>
        ) : !data?.items.length ? (
          <div className="p-12 text-center">
            <div className="h-14 w-14 rounded-2xl mx-auto grid place-items-center bg-tint-peach text-tint-peach-fg mb-4">
              <Icon name="PackageCheck" size={28} />
            </div>
            <h3 className="display text-xl mb-1">
              {statusFilter || appliedSearch ? "No GRNs match these filters" : "No goods receipts yet"}
            </h3>
            <p className="text-sm text-muted">
              {statusFilter || appliedSearch
                ? "Try clearing the search or status filter."
                : "Approve a PO, send it to vendor, then open the PO and click \"Receive (GRN)\"."}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">GRN #</th>
                <th className="text-left px-5 py-3 font-semibold">PO</th>
                <th className="text-left px-5 py-3 font-semibold">Vendor</th>
                <th className="text-left px-5 py-3 font-semibold">Invoice</th>
                <th className="text-left px-5 py-3 font-semibold">Amount</th>
                <th className="text-left px-5 py-3 font-semibold">Received</th>
                <th className="text-left px-5 py-3 font-semibold">Items</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((g) => (
                <tr
                  key={g.id}
                  className="border-t border-border hover:bg-surface/50 cursor-pointer select-none"
                  onClick={() => { window.location.href = `${base}/${g.id}`; }}
                >
                  <td className="px-5 py-3 font-mono text-xs">{g.grnNumber ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs">{g.poNumber ?? "—"}</td>
                  <td className="px-5 py-3">{g.vendorName ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs">{g.invoiceNumber ?? "—"}</td>
                  <td className="px-5 py-3 tabular-nums font-semibold">{paiseToINR(g.invoiceAmountPaise)}</td>
                  <td className="px-5 py-3 text-xs">{formatDate(g.receivedDate)}</td>
                  <td className="px-5 py-3 text-muted">{g.itemsCount}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${STATUS_TINT[g.status]} capitalize`}>{g.status.replace("_", " ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
