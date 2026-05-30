"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonRows, EmptyState, FilterBar } from "@/components/ListPrimitives";
import { PaymentRecordBadge } from "@/components/invoices/badges";
import { ApAgingTable, type ApAgingData } from "@/components/invoices/ApAgingTable";
import { api, ApiError } from "@/lib/api";
import { paiseToINR, formatDate } from "@/lib/format";
import type { PaymentListItem } from "@indus/shared";

interface ListResponse { items: PaymentListItem[]; total: number; page: number; pageSize: number; }
type View = "payments" | "aging";

const METHOD_LABEL: Record<string, string> = { neft: "NEFT", rtgs: "RTGS", cheque: "Cheque", upi: "UPI", cash: "Cash" };

export default function PaymentsPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/payments`;

  const [view, setView] = useState<View>("payments");

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [aging, setAging] = useState<ApAgingData | null>(null);
  const [agingLoading, setAgingLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function loadPayments() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (appliedSearch.trim()) qs.set("search", appliedSearch.trim());
      qs.set("pageSize", "100");
      const res = await api<ListResponse>(`/api/payments?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function loadAging() {
    setAgingLoading(true);
    try {
      const res = await api<ApAgingData>("/api/payments/aging");
      setAging(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load ageing");
    } finally {
      setAgingLoading(false);
    }
  }

  useEffect(() => {
    if (view === "payments") loadPayments();
    else loadAging();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, appliedSearch]);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Vendor payouts, allocations and AP ageing"
        actions={
          <Link href={`${base}/new`} className="btn btn-primary btn-sm">
            <Icon name="Plus" size={14} /> Record payment
          </Link>
        }
      />

      <div className="mb-3 flex items-center gap-0.5 border-b border-border">
        {([["payments", "Payments"], ["aging", "AP Ageing"]] as Array<[View, string]>).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={`relative px-3 py-1.5 text-[12px] font-medium transition ${view === k ? "text-text-default" : "text-muted hover:text-text-default"}`}
          >
            {label}
            {view === k && <span className="absolute left-0 right-0 -bottom-px h-0.5" style={{ background: "var(--primary)" }} />}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="AlertTriangle" size={14} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {view === "payments" ? (
        <>
          <FilterBar search={searchInput} onSearch={setSearchInput} placeholder="Search by payment number…" />
          <div className="card overflow-hidden">
            {loading && !data ? (
              <table className="w-full">
                <thead className="bg-surface">
                  <tr>
                    {["Payment #", "Vendor", "Date", "Method", "Amount", "Allocated", "Status"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <SkeletonRows rows={5} cols={7} />
              </table>
            ) : !data?.items.length ? (
              <EmptyState
                icon="IndianRupee"
                iconTint="var(--tint-mint)"
                iconColor="var(--tint-mint-fg)"
                title={appliedSearch ? "No payments match" : "No payments recorded yet"}
                description={appliedSearch ? "Try a different search." : "Record a payment and allocate it to one or more vendor invoices."}
                cta="Record payment"
                ctaHref={`${base}/new`}
              />
            ) : (
              <table className="w-full">
                <thead className="bg-surface">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Payment #</th>
                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Vendor</th>
                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Date</th>
                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Method</th>
                    <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Amount</th>
                    <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Allocated</th>
                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-border hover:bg-surface/60 cursor-pointer select-none transition"
                      onClick={() => { window.location.href = `${base}/${p.id}`; }}
                    >
                      <td className="px-3 py-2 font-mono text-[11px]">{p.paymentNumber ?? "—"}</td>
                      <td className="px-3 py-2 text-muted">{p.vendorName ?? "—"}</td>
                      <td className="px-3 py-2 text-[11px] text-muted">{formatDate(p.paymentDate)}</td>
                      <td className="px-3 py-2 text-xs">{METHOD_LABEL[p.method] ?? p.method}</td>
                      <td className="px-3 py-2 font-semibold tabular-nums text-right">{paiseToINR(p.amountPaise)}</td>
                      <td className="px-3 py-2 tabular-nums text-right text-muted">{paiseToINR(p.allocatedPaise)}</td>
                      <td className="px-3 py-2"><PaymentRecordBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-surface">
                    <td colSpan={7} className="px-3 py-1.5 text-[11px] text-muted">
                      {data.total} {data.total === 1 ? "payment" : "payments"} · click any row to open
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      ) : agingLoading && !aging ? (
        <div className="card p-12 text-center text-muted">Loading ageing…</div>
      ) : aging ? (
        <>
          <p className="mb-2 text-xs text-muted">Outstanding payables as of {formatDate(aging.asOf)} · measured from invoice date.</p>
          <ApAgingTable data={aging} />
        </>
      ) : null}
    </>
  );
}
