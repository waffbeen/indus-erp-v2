"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { StatusTabs, SkeletonRows, EmptyState, FilterBar } from "@/components/ListPrimitives";
import { InvoiceStatusBadge, MatchBadge, PaymentStatusBadge } from "@/components/invoices/badges";
import { api, ApiError } from "@/lib/api";
import { paiseToINR, formatDate } from "@/lib/format";
import type { VendorInvoiceListItem } from "@indus/shared";

interface ListResponse { items: VendorInvoiceListItem[]; total: number; page: number; pageSize: number; }

type StatusKey = "all" | "draft" | "matched" | "price_variance" | "qty_variance" | "unmatched" | "approved" | "cancelled";

const TABS: Array<{ key: StatusKey; label: string }> = [
  { key: "all",            label: "All" },
  { key: "matched",        label: "Matched" },
  { key: "price_variance", label: "Price variance" },
  { key: "qty_variance",   label: "Qty variance" },
  { key: "unmatched",      label: "Unmatched" },
  { key: "approved",       label: "Approved" },
  { key: "draft",          label: "Draft" },
  { key: "cancelled",      label: "Cancelled" },
];

export default function InvoiceListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/invoices`;

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
      const res = await api<ListResponse>(`/api/vendor-invoices?${qs.toString()}`);
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
      const wanted: StatusKey[] = ["matched", "price_variance", "qty_variance", "unmatched", "approved", "draft", "cancelled"];
      const all = await Promise.all(
        wanted.map((s) =>
          api<ListResponse>(`/api/vendor-invoices?status=${s}&pageSize=1`)
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
        title="Vendor Invoices"
        subtitle="Supplier bills, 3-way matched against PO price and GRN quantity"
        actions={
          <Link href={`${base}/new`} className="btn btn-primary btn-sm">
            <Icon name="Plus" size={14} /> New invoice
          </Link>
        }
      />

      <div className="mb-3 overflow-x-auto">
        <StatusTabs tabs={tabsWithCounts} value={status} onChange={setStatus} />
      </div>

      <FilterBar
        search={searchInput}
        onSearch={setSearchInput}
        placeholder="Search by invoice number…"
      />

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="AlertTriangle" size={14} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                {["Invoice #", "Vendor", "PO", "Date", "Total", "Match", "Payment", "Status"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <SkeletonRows rows={5} cols={8} />
          </table>
        ) : !data?.items.length ? (
          <EmptyState
            icon="ReceiptText"
            iconTint="var(--tint-mint)"
            iconColor="var(--tint-mint-fg)"
            title={status !== "all" || appliedSearch ? "No invoices match these filters" : "No vendor invoices yet"}
            description={
              status !== "all" || appliedSearch
                ? "Try clearing the search or switching the status tab."
                : "Receive goods against a PO, then capture the supplier's bill to run a 3-way match."
            }
            cta="New invoice"
            ctaHref={`${base}/new`}
          />
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Invoice #</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Vendor</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">PO</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Date</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Total</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Match</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Payment</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-t border-border hover:bg-surface/60 cursor-pointer select-none transition"
                  onClick={() => { window.location.href = `${base}/${inv.id}`; }}
                >
                  <td className="px-3 py-2 font-mono text-[11px]">{inv.invoiceNumber}</td>
                  <td className="px-3 py-2 text-muted">{inv.vendorName ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{inv.poNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-muted">{formatDate(inv.invoiceDate)}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-right">{paiseToINR(inv.totalPaise)}</td>
                  <td className="px-3 py-2"><MatchBadge status={inv.matchStatus} /></td>
                  <td className="px-3 py-2"><PaymentStatusBadge status={inv.paymentStatus} /></td>
                  <td className="px-3 py-2"><InvoiceStatusBadge status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface">
                <td colSpan={8} className="px-3 py-1.5 text-[11px] text-muted">
                  {data.total} {data.total === 1 ? "invoice" : "invoices"} · click any row to open
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
