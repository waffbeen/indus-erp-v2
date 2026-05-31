"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { StatusTabs, SkeletonRows, EmptyState, FilterBar } from "@/components/ListPrimitives";
import { SalesInvoiceStatusBadge, ReceiptStatusBadge } from "@/components/sales/badges";
import { ArAgingTable, type ArAgingData } from "@/components/sales/ArAgingTable";
import { api, ApiError } from "@/lib/api";
import { paiseToINR, formatDate } from "@/lib/format";
import type { SalesInvoiceListItem } from "@indus/shared";

interface ListResponse { items: SalesInvoiceListItem[]; total: number; page: number; pageSize: number; }

type View = "invoices" | "aging";
type StatusKey = "all" | "draft" | "issued" | "partially_paid" | "paid" | "cancelled";

const TABS: Array<{ key: StatusKey; label: string }> = [
  { key: "all",            label: "All" },
  { key: "draft",          label: "Draft" },
  { key: "issued",         label: "Issued" },
  { key: "partially_paid", label: "Part-paid" },
  { key: "paid",           label: "Paid" },
  { key: "cancelled",      label: "Cancelled" },
];

export default function SalesInvoiceListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/sales-invoices`;

  const [view, setView] = useState<View>("invoices");
  const [data, setData] = useState<ListResponse | null>(null);
  const [aging, setAging] = useState<ArAgingData | null>(null);
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
      const res = await api<ListResponse>(`/api/sales-invoices?${qs.toString()}`);
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
      const wanted: StatusKey[] = ["draft", "issued", "partially_paid", "paid", "cancelled"];
      const all = await Promise.all(
        wanted.map((s) =>
          api<ListResponse>(`/api/sales-invoices?status=${s}&pageSize=1`)
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

  async function loadAging() {
    setLoading(true);
    try {
      const res = await api<ArAgingData>("/api/sales-invoices/ar-aging");
      setAging(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load AR ageing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (view === "invoices") { load(); loadCounts(); }
    else loadAging();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, status, appliedSearch]);

  const tabsWithCounts = TABS.map((t) => ({ ...t, count: counts[t.key] }));

  return (
    <>
      <PageHeader
        title="Sales Invoices"
        subtitle="Outward GST invoices on customers, with receipts and AR ageing"
        actions={
          <Link href={`${base}/new`} className="btn btn-primary btn-sm">
            <Icon name="Plus" size={14} /> New invoice
          </Link>
        }
      />

      {/* View toggle: Invoices ↔ AR Ageing */}
      <div className="mb-3 flex items-center gap-1">
        <button
          className={`btn btn-sm ${view === "invoices" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setView("invoices")}
        >
          <Icon name="ReceiptText" size={14} /> Invoices
        </button>
        <button
          className={`btn btn-sm ${view === "aging" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setView("aging")}
        >
          <Icon name="BarChart3" size={14} /> AR Ageing
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {view === "aging" ? (
        loading && !aging ? (
          <div className="card p-12 text-center text-muted">Loading AR ageing…</div>
        ) : aging ? (
          <>
            <p className="text-xs text-muted mb-2">
              Outstanding receivables as of {formatDate(aging.asOf)} ·
              total due <strong className="text-text-default">{paiseToINR(aging.totals.totalOutstandingPaise)}</strong>
            </p>
            <ArAgingTable data={aging} />
          </>
        ) : null
      ) : (
        <>
          <div className="mb-3 overflow-x-auto">
            <StatusTabs tabs={tabsWithCounts} value={status} onChange={setStatus} />
          </div>

          <FilterBar search={searchInput} onSearch={setSearchInput} placeholder="Search by invoice number…" />

          <div className="card overflow-hidden">
            {loading && !data ? (
              <table className="w-full">
                <thead className="bg-surface">
                  <tr>
                    {["Invoice #", "Customer", "SO", "Date", "Due", "Total", "Payment", "Status"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <SkeletonRows rows={5} cols={8} />
              </table>
            ) : !data?.items.length ? (
              <EmptyState
                icon="FileText"
                iconTint="var(--tint-mint)"
                iconColor="var(--tint-mint-fg)"
                title={status !== "all" || appliedSearch ? "No invoices match these filters" : "No sales invoices yet"}
                description={
                  status !== "all" || appliedSearch
                    ? "Try clearing the search or switching the status tab."
                    : "Raise an outward GST invoice from a sales order, or directly on a customer."
                }
                cta="New invoice"
                ctaHref={`${base}/new`}
              />
            ) : (
              <table className="w-full">
                <thead className="bg-surface">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Invoice #</th>
                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Customer</th>
                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">SO</th>
                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Date</th>
                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Due</th>
                    <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Total</th>
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
                      <td className="px-3 py-2 font-mono text-[11px]">{inv.invoiceNumber ?? "Draft"}</td>
                      <td className="px-3 py-2 text-muted">{inv.customerName ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{inv.soNumber ?? "—"}</td>
                      <td className="px-3 py-2 text-[11px] text-muted">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-3 py-2 text-[11px] text-muted">{inv.dueDate ? formatDate(inv.dueDate) : "—"}</td>
                      <td className="px-3 py-2 font-semibold tabular-nums text-right">{paiseToINR(inv.totalPaise)}</td>
                      <td className="px-3 py-2"><ReceiptStatusBadge status={inv.paymentStatus} /></td>
                      <td className="px-3 py-2"><SalesInvoiceStatusBadge status={inv.status} /></td>
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
      )}
    </>
  );
}
