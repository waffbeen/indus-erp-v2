"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { SalesInvoiceStatusBadge, ReceiptStatusBadge } from "@/components/sales/badges";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, quantityScaledToHuman, formatDate } from "@/lib/format";

interface InvoiceItem {
  id: string;
  itemName: string;
  hsnCode: string | null;
  uom: string;
  qtyScaled: number;
  unitPricePaise: string;
  taxRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  taxPaise: string;
  totalPaise: string;
}
interface InvoiceReceipt {
  id: string;
  receiptId: string;
  receiptNumber: string | null;
  receiptDate: string;
  method: string;
  allocatedPaise: string;
}
interface InvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  status: string;
  paymentStatus: string;
  soId: string | null;
  isInterstate: boolean;
  invoiceDate: string;
  dueDate: string | null;
  subtotalPaise: string;
  taxableAmountPaise: string;
  cgstTotalPaise: string;
  sgstTotalPaise: string;
  igstTotalPaise: string;
  taxPaise: string;
  totalPaise: string;
  amountPaidPaise: string;
  outstandingPaise: string;
  remarks: string | null;
  createdAt: string;
  items: InvoiceItem[];
  customer?: { id: string; name: string; gstin: string | null };
  so?: { id: string; soNumber: string | null; title: string; status: string };
  createdBy?: { id: string; fullName: string };
  receipts: InvoiceReceipt[];
}

export default function SalesInvoiceDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const base = `/t/${params?.slug ?? ""}/sales-invoices`;

  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState({ amount: 0, method: "neft", receiptDate: new Date().toISOString().slice(0, 10), reference: "" });

  async function load() {
    setLoading(true);
    try {
      const data = await api<InvoiceDetail>(`/api/sales-invoices/${params?.id}`);
      setInv(data);
      setReceipt((r) => ({ ...r, amount: Number(data.outstandingPaise) / 100 }));
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

  async function handleIssue() {
    if (!inv) return;
    setBusy(true);
    try {
      await api(`/api/sales-invoices/${inv.id}/issue`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Invoice issued", "AR clock started. Now collectable.");
      setConfirmIssue(false);
      load();
    } catch (err) {
      toast.error("Could not issue", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!inv) return;
    try {
      await api(`/api/sales-invoices/${inv.id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Invoice cancelled");
      setConfirmCancel(false);
      load();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Try again");
    }
  }

  async function handleReceipt() {
    if (!inv) return;
    if (!receipt.amount || receipt.amount <= 0) { toast.error("Enter an amount", "Receipt must be greater than zero."); return; }
    setBusy(true);
    try {
      await api("/api/sales-invoices/receipts", {
        method: "POST",
        body: JSON.stringify({
          customerId: inv.customer?.id,
          receiptDate: receipt.receiptDate,
          method: receipt.method,
          amount: receipt.amount,
          reference: receipt.reference || "",
          allocations: [{ salesInvoiceId: inv.id, amount: receipt.amount }],
        }),
      });
      toast.success("Receipt recorded", "Customer payment allocated to this invoice.");
      setReceiptOpen(false);
      load();
    } catch (err) {
      toast.error("Could not record receipt", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !inv) return <div className="p-12 text-center text-muted">Loading…</div>;
  if (error) return <>
    <Link href={base} className="text-sm text-muted hover:text-text-default">← Back</Link>
    <div className="mt-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>
  </>;
  if (!inv) return null;

  const isDraft = inv.status === "draft";
  const isOpen = inv.status !== "cancelled";
  const canCollect = ["issued", "partially_paid"].includes(inv.status);

  return (
    <>
      <div className="flex items-center gap-3 mb-3 text-sm text-muted">
        <Link href={base} className="hover:text-text-default">Sales Invoices</Link>
        <Icon name="ChevronRight" size={14} />
        <span className="text-text-default font-medium font-mono">{inv.invoiceNumber ?? "Draft"}</span>
      </div>

      <PageHeader
        title={inv.invoiceNumber ?? "Draft invoice"}
        subtitle={`Bill to ${inv.customer?.name ?? "customer"}${inv.so?.soNumber ? ` · against ${inv.so.soNumber}` : ""}`}
        actions={
          <div className="flex items-center gap-1.5">
            {isDraft && (
              <button className="btn btn-primary btn-sm" onClick={() => setConfirmIssue(true)}>
                <Icon name="Send" size={14} /> Issue
              </button>
            )}
            {canCollect && (
              <button className="btn btn-primary btn-sm" onClick={() => setReceiptOpen(true)}>
                <Icon name="HandCoins" size={14} /> Record receipt
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
              <Meta label="Status"><SalesInvoiceStatusBadge status={inv.status} /></Meta>
              <Meta label="Payment"><ReceiptStatusBadge status={inv.paymentStatus} /></Meta>
              <Meta label="Invoice total" valueClass="display text-lg !mt-0">{paiseToINR(inv.totalPaise)}</Meta>
              <Meta label="Outstanding" valueClass="display text-lg !mt-0">{paiseToINR(inv.outstandingPaise)}</Meta>
              <Meta label="Invoice date">{formatDate(inv.invoiceDate)}</Meta>
              <Meta label="Due date">{inv.dueDate ? formatDate(inv.dueDate) : "—"}</Meta>
              <Meta label="GST scheme">
                <span className="badge badge-info uppercase text-[10px]">{inv.isInterstate ? "IGST" : "CGST+SGST"}</span>
              </Meta>
              <Meta label="Sales order">
                {inv.so ? <Link href={`/t/${params?.slug}/sales-orders/${inv.so.id}`} className="text-primary font-medium hover:underline">{inv.so.soNumber}</Link> : "—"}
              </Meta>
            </div>
            {inv.remarks && (
              <div className="mt-5 pt-5 border-t border-border">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Remarks</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{inv.remarks}</p>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Billed lines</p>
            </div>
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold w-12">#</th>
                  <th className="text-left px-5 py-3 font-semibold">Item</th>
                  <th className="text-left px-5 py-3 font-semibold">HSN</th>
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
                    <td className="px-5 py-3"><p className="font-semibold">{it.itemName}</p><p className="text-[11px] text-muted">UOM: <span className="font-mono">{it.uom}</span></p></td>
                    <td className="px-5 py-3 font-mono text-xs">{it.hsnCode ?? "—"}</td>
                    <td className="px-5 py-3 tabular-nums text-right">{quantityScaledToHuman(it.qtyScaled)}</td>
                    <td className="px-5 py-3 tabular-nums text-right">{paiseToINR(it.unitPricePaise)}</td>
                    <td className="px-5 py-3 tabular-nums text-right text-muted">
                      {inv.isInterstate ? `IGST ${it.igstRate}%` : `${it.cgstRate}+${it.sgstRate}%`}<br />
                      <span className="text-[11px]">{paiseToINR(it.taxPaise)}</span>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-right font-semibold">{paiseToINR(it.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border"><td colSpan={6} className="px-5 py-2 text-right text-muted">Taxable</td><td className="px-5 py-2 tabular-nums text-right">{paiseToINR(inv.taxableAmountPaise)}</td></tr>
                {inv.isInterstate ? (
                  <tr><td colSpan={6} className="px-5 py-2 text-right text-muted">IGST</td><td className="px-5 py-2 tabular-nums text-right">{paiseToINR(inv.igstTotalPaise)}</td></tr>
                ) : (
                  <>
                    <tr><td colSpan={6} className="px-5 py-2 text-right text-muted">CGST</td><td className="px-5 py-2 tabular-nums text-right">{paiseToINR(inv.cgstTotalPaise)}</td></tr>
                    <tr><td colSpan={6} className="px-5 py-2 text-right text-muted">SGST</td><td className="px-5 py-2 tabular-nums text-right">{paiseToINR(inv.sgstTotalPaise)}</td></tr>
                  </>
                )}
                <tr className="border-t-2 border-border bg-surface"><td colSpan={6} className="px-5 py-3 text-right font-semibold">Total</td><td className="px-5 py-3 font-bold tabular-nums text-right">{paiseToINR(inv.totalPaise)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          {inv.customer && (
            <div className="card p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">Customer</p>
              <p className="font-semibold">{inv.customer.name}</p>
              {inv.customer.gstin && <p className="font-mono text-xs text-muted mt-1">GST: {inv.customer.gstin}</p>}
            </div>
          )}

          <div className="card p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Receipts</p>
              {canCollect && (
                <button className="text-xs text-primary font-medium hover:underline" onClick={() => setReceiptOpen(true)}>Record →</button>
              )}
            </div>
            {inv.receipts.length === 0 ? (
              <p className="text-sm text-muted">No receipts allocated yet.</p>
            ) : (
              <div className="space-y-2">
                {inv.receipts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-[11px]">{p.receiptNumber ?? "receipt"}</span>
                    <span className="text-[11px] text-muted">{formatDate(p.receiptDate)}</span>
                    <span className="tabular-nums font-semibold">{paiseToINR(p.allocatedPaise)}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 flex items-center justify-between text-sm">
                  <span className="text-muted">Collected</span>
                  <span className="tabular-nums font-semibold">{paiseToINR(inv.amountPaidPaise)}</span>
                </div>
              </div>
            )}
          </div>

          {inv.createdBy && (
            <div className="card p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Raised by</p>
              <p className="text-sm font-medium">{inv.createdBy.fullName}</p>
              <p className="text-[11px] text-muted mt-1">{formatDate(inv.createdAt)}</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmIssue}
        onClose={() => !busy && setConfirmIssue(false)}
        onConfirm={handleIssue}
        title="Issue this invoice?"
        description="Issue hone ke baad AR clock chalu ho jayega aur receipts allocate kar sakte ho."
        confirmLabel={busy ? "Working…" : "Yes, issue"}
        tone="success"
      />

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
        title="Cancel this invoice?"
        description="The invoice will be marked cancelled and removed from AR-ageing. Audit log mein record rahega."
        confirmLabel="Yes, cancel"
        tone="danger"
      />

      <Modal
        open={receiptOpen}
        onClose={busy ? () => {} : () => setReceiptOpen(false)}
        title="Record customer receipt"
        description={`Outstanding on this invoice: ${paiseToINR(inv.outstandingPaise)}`}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setReceiptOpen(false)} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleReceipt} disabled={busy}>
              {busy ? "Saving…" : "Record receipt"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount (₹) <span className="text-danger">*</span></label>
              <input className="input tabular-nums" type="number" step="0.01" min="0" value={receipt.amount || 0} onChange={(e) => setReceipt({ ...receipt, amount: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Method</label>
              <select className="input" value={receipt.method} onChange={(e) => setReceipt({ ...receipt, method: e.target.value })}>
                <option value="neft">NEFT</option>
                <option value="rtgs">RTGS</option>
                <option value="cheque">Cheque</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Receipt date</label>
              <input type="date" className="input" value={receipt.receiptDate} onChange={(e) => setReceipt({ ...receipt, receiptDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Reference (UTR / cheque #)</label>
              <input className="input" value={receipt.reference} onChange={(e) => setReceipt({ ...receipt, reference: e.target.value })} />
            </div>
          </div>
        </div>
      </Modal>
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
