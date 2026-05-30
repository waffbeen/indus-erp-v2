"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PaymentRecordBadge } from "@/components/invoices/badges";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, formatDate } from "@/lib/format";

interface Allocation {
  id: string;
  vendorInvoiceId: string | null;
  invoiceNumber: string | null;
  poId: string | null;
  allocatedPaise: string;
  kind: string;
}
interface PaymentDetail {
  id: string;
  paymentNumber: string | null;
  status: string;
  method: string;
  paymentDate: string;
  amountPaise: string;
  allocatedPaise: string;
  advancePaise: string;
  reference: string | null;
  remarks: string | null;
  createdAt: string;
  vendor?: { id: string; name: string; gstin: string | null };
  allocations: Allocation[];
}

const METHOD_LABEL: Record<string, string> = { neft: "NEFT", rtgs: "RTGS", cheque: "Cheque", upi: "UPI", cash: "Cash" };
const KIND_LABEL: Record<string, string> = { invoice: "Invoice", po_advance: "PO advance", on_account: "On account" };

export default function PaymentDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const base = `/t/${params?.slug ?? ""}/payments`;

  const [pay, setPay] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<PaymentDetail>(`/api/payments/${params?.id}`);
      setPay(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  async function handleCancel() {
    if (!pay) return;
    try {
      await api(`/api/payments/${pay.id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Payment cancelled", "Allocated invoices' paid status recalculated.");
      setConfirmCancel(false);
      load();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Try again");
    }
  }

  if (loading && !pay) return <div className="p-12 text-center text-muted">Loading…</div>;
  if (error) return <>
    <Link href={base} className="text-sm text-muted hover:text-text-default">← Back</Link>
    <div className="mt-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>
  </>;
  if (!pay) return null;

  return (
    <>
      <div className="flex items-center gap-3 mb-3 text-sm text-muted">
        <Link href={base} className="hover:text-text-default">Payments</Link>
        <Icon name="ChevronRight" size={14} />
        <span className="text-text-default font-medium font-mono">{pay.paymentNumber}</span>
      </div>

      <PageHeader
        title={pay.paymentNumber ?? "Payment"}
        subtitle={`${paiseToINR(pay.amountPaise)} to ${pay.vendor?.name ?? "vendor"} via ${METHOD_LABEL[pay.method] ?? pay.method}`}
        actions={
          pay.status !== "cancelled" ? (
            <button className="h-10 w-10 rounded-pill border border-border grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => setConfirmCancel(true)} title="Cancel payment">
              <Icon name="Trash2" size={16} />
            </button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
              <Meta label="Status"><PaymentRecordBadge status={pay.status} /></Meta>
              <Meta label="Amount" valueClass="display text-lg !mt-0">{paiseToINR(pay.amountPaise)}</Meta>
              <Meta label="Allocated">{paiseToINR(pay.allocatedPaise)}</Meta>
              <Meta label="Advance / on-account">{paiseToINR(pay.advancePaise)}</Meta>
              <Meta label="Date">{formatDate(pay.paymentDate)}</Meta>
              <Meta label="Method">{METHOD_LABEL[pay.method] ?? pay.method}</Meta>
              <Meta label="Reference">{pay.reference ? <span className="font-mono">{pay.reference}</span> : "—"}</Meta>
              <Meta label="Vendor">{pay.vendor?.name ?? "—"}</Meta>
            </div>
            {pay.remarks && (
              <div className="mt-5 pt-5 border-t border-border">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Remarks</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{pay.remarks}</p>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Allocations</p>
            </div>
            {pay.allocations.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">Unallocated — the full amount is an advance.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Type</th>
                    <th className="text-left px-5 py-3 font-semibold">Reference</th>
                    <th className="text-right px-5 py-3 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pay.allocations.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-5 py-3"><span className="badge badge-info text-[10px]">{KIND_LABEL[a.kind] ?? a.kind}</span></td>
                      <td className="px-5 py-3">
                        {a.vendorInvoiceId ? (
                          <Link href={`/t/${params?.slug}/invoices/${a.vendorInvoiceId}`} className="font-mono text-[11px] text-primary hover:underline">
                            {a.invoiceNumber ?? "invoice"}
                          </Link>
                        ) : a.poId ? (
                          <Link href={`/t/${params?.slug}/po/${a.poId}`} className="font-mono text-[11px] text-primary hover:underline">PO advance</Link>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-right font-semibold">{paiseToINR(a.allocatedPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {pay.vendor && (
            <div className="card p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">Vendor</p>
              <p className="font-semibold">{pay.vendor.name}</p>
              {pay.vendor.gstin && <p className="font-mono text-xs text-muted mt-1">GST: {pay.vendor.gstin}</p>}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
        title="Cancel this payment?"
        description="The allocated invoices will revert to their previous paid status. Audit log mein record rahega."
        confirmLabel="Yes, cancel"
        tone="danger"
      />
    </>
  );
}

function Meta({ label, children, valueClass }: { label: string; children: React.ReactNode; valueClass?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className={valueClass ?? "mt-1.5 text-sm font-medium"}>{children}</div>
    </div>
  );
}
