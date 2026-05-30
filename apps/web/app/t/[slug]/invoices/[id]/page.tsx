"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { ThreeWayMatchPanel, type MatchLine } from "@/components/invoices/ThreeWayMatchPanel";
import { InvoiceStatusBadge, PaymentStatusBadge } from "@/components/invoices/badges";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, quantityScaledToHuman, formatDate } from "@/lib/format";

interface InvoiceItem extends MatchLine {
  taxPaise: string;
  totalPaise: string;
}
interface InvoicePayment {
  id: string;
  paymentId: string;
  paymentNumber: string | null;
  paymentDate: string;
  method: string;
  allocatedPaise: string;
}
interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  status: string;
  matchStatus: string;
  paymentStatus: string;
  poId: string | null;
  grnId: string | null;
  invoiceDate: string;
  subtotalPaise: string;
  taxPaise: string;
  totalPaise: string;
  amountPaidPaise: string;
  outstandingPaise: string;
  remarks: string | null;
  varianceApproved: number;
  approvedAt: string | null;
  createdAt: string;
  items: InvoiceItem[];
  vendor?: { id: string; name: string; gstin: string | null };
  po?: { id: string; poNumber: string | null; title: string; status: string };
  grn?: { id: string; grnNumber: string | null; status: string };
  createdBy?: { id: string; fullName: string };
  payments: InvoicePayment[];
}

export default function InvoiceDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const base = `/t/${params?.slug ?? ""}/invoices`;

  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [override, setOverride] = useState(false);
  const [approveRemarks, setApproveRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<InvoiceDetail>(`/api/vendor-invoices/${params?.id}`);
      setInv(data);
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

  async function handleApprove() {
    if (!inv) return;
    setBusy(true);
    try {
      await api(`/api/vendor-invoices/${inv.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ overrideVariance: override, remarks: approveRemarks }),
      });
      toast.success("Invoice approved", "Cleared for payment.");
      setApproveOpen(false);
      setOverride(false);
      setApproveRemarks("");
      load();
    } catch (err) {
      toast.error("Approval failed", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!inv) return;
    try {
      await api(`/api/vendor-invoices/${inv.id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Invoice cancelled");
      setConfirmCancel(false);
      load();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Try again");
    }
  }

  async function handleRematch() {
    if (!inv) return;
    try {
      await api(`/api/vendor-invoices/${inv.id}/match`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Match re-run");
      load();
    } catch (err) {
      toast.error("Could not re-match", err instanceof ApiError ? err.message : "Try again");
    }
  }

  if (loading && !inv) return <div className="p-12 text-center text-muted">Loading…</div>;
  if (error) return <>
    <Link href={base} className="text-sm text-muted hover:text-text-default">← Back</Link>
    <div className="mt-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>
  </>;
  if (!inv) return null;

  const isOpen = inv.status !== "approved" && inv.status !== "cancelled";
  const matched = inv.matchStatus === "matched";

  return (
    <>
      <div className="flex items-center gap-3 mb-3 text-sm text-muted">
        <Link href={base} className="hover:text-text-default">Invoices</Link>
        <Icon name="ChevronRight" size={14} />
        <span className="text-text-default font-medium font-mono">{inv.invoiceNumber}</span>
      </div>

      <PageHeader
        title={inv.invoiceNumber}
        subtitle={`Bill from ${inv.vendor?.name ?? "vendor"}${inv.po?.poNumber ? ` · against ${inv.po.poNumber}` : ""}`}
        actions={
          <div className="flex items-center gap-1.5">
            {isOpen && (
              <button className="btn btn-ghost btn-sm" onClick={handleRematch} title="Re-run the 3-way match">
                <Icon name="RefreshCw" size={14} /> Re-match
              </button>
            )}
            {isOpen && (
              <button className="btn btn-primary btn-sm" onClick={() => { setOverride(false); setApproveOpen(true); }}>
                <Icon name="CheckCircle2" size={14} /> Approve
              </button>
            )}
            {isOpen && (
              <button className="h-10 w-10 rounded-pill border border-border grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => setConfirmCancel(true)} title="Cancel">
                <Icon name="Trash2" size={16} />
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
              <Meta label="Status"><InvoiceStatusBadge status={inv.status} /></Meta>
              <Meta label="Payment"><PaymentStatusBadge status={inv.paymentStatus} /></Meta>
              <Meta label="Invoice total" valueClass="display text-lg !mt-0">{paiseToINR(inv.totalPaise)}</Meta>
              <Meta label="Outstanding" valueClass="display text-lg !mt-0">{paiseToINR(inv.outstandingPaise)}</Meta>
              <Meta label="Invoice date">{formatDate(inv.invoiceDate)}</Meta>
              <Meta label="Vendor">{inv.vendor?.name ?? "—"}</Meta>
              <Meta label="PO">
                {inv.po ? <Link href={`/t/${params?.slug}/po/${inv.po.id}`} className="text-primary font-medium hover:underline">{inv.po.poNumber}</Link> : "—"}
              </Meta>
              <Meta label="GRN">
                {inv.grn ? <Link href={`/t/${params?.slug}/grn/${inv.grn.id}`} className="text-primary font-medium hover:underline">{inv.grn.grnNumber}</Link> : "—"}
              </Meta>
            </div>
            {inv.varianceApproved === 1 && (
              <div className="mt-5 pt-5 border-t border-border flex items-start gap-2 text-xs text-warning-fg">
                <Icon name="ShieldAlert" size={14} className="mt-0.5" />
                <span>This invoice was approved with an over-tolerance variance override.</span>
              </div>
            )}
            {inv.remarks && (
              <div className="mt-5 pt-5 border-t border-border">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Remarks</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{inv.remarks}</p>
              </div>
            )}
          </div>

          <ThreeWayMatchPanel matchStatus={inv.matchStatus} hasPo={!!inv.poId} items={inv.items} />

          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Billed lines</p>
            </div>
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold w-12">#</th>
                  <th className="text-left px-5 py-3 font-semibold">Item</th>
                  <th className="text-right px-5 py-3 font-semibold">Qty</th>
                  <th className="text-right px-5 py-3 font-semibold">Unit price</th>
                  <th className="text-right px-5 py-3 font-semibold">Tax</th>
                  <th className="text-right px-5 py-3 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it, idx) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-5 py-3 text-muted text-xs">{idx + 1}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold">{it.itemName}</p>
                      <p className="text-[11px] text-muted">UOM: <span className="font-mono">{it.uom}</span></p>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-right">{quantityScaledToHuman(it.qtyScaled)}</td>
                    <td className="px-5 py-3 tabular-nums text-right">{paiseToINR(it.unitPricePaise)}</td>
                    <td className="px-5 py-3 tabular-nums text-right text-muted">{paiseToINR(it.taxPaise)}</td>
                    <td className="px-5 py-3 tabular-nums text-right font-semibold">{paiseToINR(it.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={5} className="px-5 py-2 text-right text-muted">Subtotal</td>
                  <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(inv.subtotalPaise)}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="px-5 py-2 text-right text-muted">Tax</td>
                  <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(inv.taxPaise)}</td>
                </tr>
                <tr className="border-t-2 border-border bg-surface">
                  <td colSpan={5} className="px-5 py-3 text-right font-semibold">Total</td>
                  <td className="px-5 py-3 font-bold tabular-nums text-right">{paiseToINR(inv.totalPaise)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          {inv.vendor && (
            <div className="card p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">Vendor</p>
              <p className="font-semibold">{inv.vendor.name}</p>
              {inv.vendor.gstin && <p className="font-mono text-xs text-muted mt-1">GST: {inv.vendor.gstin}</p>}
            </div>
          )}

          <div className="card p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Payments</p>
              <Link href={`/t/${params?.slug}/payments/new?vendorId=${inv.vendor?.id ?? ""}&invoiceId=${inv.id}`} className="text-xs text-primary font-medium hover:underline">
                Record →
              </Link>
            </div>
            {inv.payments.length === 0 ? (
              <p className="text-sm text-muted">No payments allocated yet.</p>
            ) : (
              <div className="space-y-2">
                {inv.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <Link href={`/t/${params?.slug}/payments/${p.paymentId}`} className="font-mono text-[11px] text-primary hover:underline">
                      {p.paymentNumber ?? "payment"}
                    </Link>
                    <span className="text-[11px] text-muted">{formatDate(p.paymentDate)}</span>
                    <span className="tabular-nums font-semibold">{paiseToINR(p.allocatedPaise)}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 flex items-center justify-between text-sm">
                  <span className="text-muted">Paid</span>
                  <span className="tabular-nums font-semibold">{paiseToINR(inv.amountPaidPaise)}</span>
                </div>
              </div>
            )}
          </div>

          {inv.createdBy && (
            <div className="card p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Captured by</p>
              <p className="text-sm font-medium">{inv.createdBy.fullName}</p>
              <p className="text-[11px] text-muted mt-1">{formatDate(inv.createdAt)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Approve flow — variance forces an explicit override toggle. */}
      <Modal
        open={approveOpen}
        onClose={busy ? () => {} : () => setApproveOpen(false)}
        title="Approve invoice for payment"
        description={matched ? "This invoice matched cleanly against the PO and GRN." : `This invoice has a ${inv.matchStatus.replace(/_/g, " ")}.`}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setApproveOpen(false)} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleApprove} disabled={busy || (!matched && !override)}>
              {busy ? "Approving…" : "Approve"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {!matched && (
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded p-2.5 bg-warning-bg text-warning-fg">
              <input type="checkbox" className="mt-0.5" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              <span>I understand this exceeds tolerance and approve the over-tolerance variance.</span>
            </label>
          )}
          <div>
            <label className="label">Remarks (optional)</label>
            <textarea className="input" rows={2} value={approveRemarks} onChange={(e) => setApproveRemarks(e.target.value)} placeholder="Reason / approval note…" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
        title="Cancel this invoice?"
        description="The invoice will be marked cancelled. It will be removed from AP-ageing. Audit log mein record rahega."
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
