"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon, type IconProps } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeading } from "@/components/SectionHeading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { SalesOrderStatusBadge } from "@/components/sales/badges";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, quantityScaledToHuman, formatDateTime, formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth";

interface SoItem {
  id: string;
  itemName: string;
  description: string | null;
  hsnCode: string | null;
  quantityScaled: number;
  uom: string;
  unitPricePaise: string;
  discountPercent: number;
  taxRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  taxPaise: string;
  igstPaise: string;
  totalPaise: string;
  fulfilledQtyScaled: number;
  committedDeliveryDate: string | null;
  itemNarration: string | null;
}
interface TimelineEntry { id: string; action: string; comment: string | null; actorName: string; createdAt: string; }
interface SoDetail {
  id: string;
  soNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  customerId: string;
  customerPoNumber: string | null;
  isInterstate: boolean;
  placeOfSupply: string | null;
  subtotalPaise: string;
  discountTotalPaise: string;
  taxableAmountPaise: string;
  cgstTotalPaise: string;
  sgstTotalPaise: string;
  igstTotalPaise: string;
  taxTotalPaise: string;
  freightChargesPaise: string;
  otherChargesPaise: string;
  roundOffPaise: string;
  totalPaise: string;
  expectedShipDate: string | null;
  shippingAddress: string | null;
  deliveryTerms: string | null;
  paymentTerms: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  fulfilledAt: string | null;
  items: SoItem[];
  customer?: { id: string; name: string; gstin: string | null; email: string | null; phone: string | null };
  creator?: { id: string; fullName: string; email: string };
  company?: { id: string; name: string };
  unit?: { id: string; name: string; code: string | null };
  timeline: TimelineEntry[];
}

type Decision = "approve" | "reject";

export default function SalesOrderDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const base = `/t/${params?.slug ?? ""}/sales-orders`;

  const [so, setSo] = useState<SoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"submit" | "cancel" | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comment, setComment] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [fulfilOpen, setFulfilOpen] = useState(false);
  const [fulfilBusy, setFulfilBusy] = useState(false);
  const { me } = useAuth();

  async function load() {
    setLoading(true);
    try {
      const data = await api<SoDetail>(`/api/sales-orders/${params?.id}`);
      setSo(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load sales order");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  async function performAction(action: "submit" | "cancel") {
    if (!so) return;
    try {
      await api(`/api/sales-orders/${so.id}/${action}`, { method: "POST", body: JSON.stringify({}) });
      toast.success(action === "submit" ? "Sales order submitted" : "Sales order cancelled",
        action === "submit" ? "Approver ko notify ho gaya." : "Order cancelled.");
      setConfirmAction(null);
      load();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Try again");
    }
  }

  async function performDecision() {
    if (!so || !decision) return;
    setDecisionSubmitting(true);
    try {
      await api(`/api/sales-orders/${so.id}/${decision}`, { method: "POST", body: JSON.stringify({ comment: comment || undefined }) });
      toast.success(decision === "approve" ? "Sales order approved" : "Sales order rejected",
        decision === "approve" ? `${so.soNumber ?? "SO"} approved. Ab fulfil & invoice kar sakte ho.` : `${so.soNumber ?? "SO"} rejected.`);
      setDecision(null);
      setComment("");
      load();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setDecisionSubmitting(false);
    }
  }

  async function performFulfil() {
    if (!so) return;
    setFulfilBusy(true);
    try {
      // Empty lines = fulfil all remaining quantity.
      await api(`/api/sales-orders/${so.id}/fulfil`, { method: "POST", body: JSON.stringify({ lines: [] }) });
      toast.success("Order fulfilled", "Remaining quantity marked as shipped.");
      setFulfilOpen(false);
      load();
    } catch (err) {
      toast.error("Could not fulfil", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setFulfilBusy(false);
    }
  }

  if (loading && !so) return <div className="p-12 text-center text-muted">Loading…</div>;
  if (error) return <>
    <Link href={base} className="text-sm text-muted hover:text-text-default">← Back to list</Link>
    <div className="mt-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>
  </>;
  if (!so) return null;

  const isFinalized = ["cancelled", "fulfilled", "closed"].includes(so.status);
  const isPending = so.status === "pending_approval";
  const isDraft = so.status === "draft";
  const canFulfil = ["approved", "partially_fulfilled"].includes(so.status);
  const isCreator = me?.id === so.creator?.id;
  const canDecide = isPending && (me?.isSuperAdmin || me?.isTenantAdmin || !isCreator);

  return (
    <>
      <div className="flex items-center gap-3 mb-3 text-sm text-muted">
        <Link href={base} className="hover:text-text-default">Sales Orders</Link>
        <Icon name="ChevronRight" size={14} />
        <span className="text-text-default font-medium">{so.soNumber ?? "Draft"}</span>
      </div>

      <PageHeader
        title={so.title}
        subtitle={so.soNumber ? `${so.soNumber} · ${so.customer?.name ?? "—"}` : `Draft · ${so.customer?.name ?? "—"}`}
        actions={
          <>
            {isDraft && (isCreator || me?.isTenantAdmin) && (
              <button className="btn btn-primary" onClick={() => setConfirmAction("submit")}>
                <Icon name="Send" /> Send for Approval
              </button>
            )}
            {canDecide && (
              <>
                <button className="btn btn-ghost" onClick={() => { setDecision("reject"); setComment(""); }}>
                  <Icon name="CircleX" /> Reject
                </button>
                <button className="btn btn-primary" onClick={() => { setDecision("approve"); setComment(""); }}>
                  <Icon name="CircleCheckBig" /> Approve
                </button>
              </>
            )}
            {canFulfil && (
              <button className="btn btn-ghost" onClick={() => setFulfilOpen(true)} title="Mark remaining quantity as shipped">
                <Icon name="Truck" /> Fulfil
              </button>
            )}
            {!["draft", "cancelled"].includes(so.status) && (
              <Link href={`/t/${params?.slug}/sales-invoices/new?fromSo=${so.id}`} className="btn btn-primary">
                <Icon name="ReceiptText" /> Create invoice
              </Link>
            )}
            {!isFinalized && (isCreator || me?.isTenantAdmin) && (
              <button
                className="h-10 w-10 rounded-pill border border-border grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg"
                onClick={() => setConfirmAction("cancel")}
                title="Cancel"
              >
                <Icon name="Trash2" size={16} />
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
              <Meta label="Status"><SalesOrderStatusBadge status={so.status} /></Meta>
              <Meta label="Grand total" valueClass="display text-lg !mt-0">{paiseToINR(so.totalPaise)}</Meta>
              <Meta label="GST scheme">
                <span className="badge badge-info uppercase text-[10px]">{so.isInterstate ? "Interstate · IGST" : "Intrastate · CGST+SGST"}</span>
              </Meta>
              <Meta label="Ship by">{formatDate(so.expectedShipDate)}</Meta>
              <Meta label="Customer">{so.customer?.name ?? "—"}</Meta>
              <Meta label="Customer PO">{so.customerPoNumber ?? "—"}</Meta>
              <Meta label="Company">{so.company?.name ?? "—"}</Meta>
              <Meta label="Unit">{so.unit?.name ?? "—"}</Meta>
              <Meta label="Place of supply">{so.placeOfSupply ?? "—"}</Meta>
              <Meta label="Payment terms">{so.paymentTerms ?? "—"}</Meta>
              <Meta label="Delivery terms">{so.deliveryTerms ?? "—"}</Meta>
            </div>

            <div className="mt-6">
              <SectionHeading title="Activity" size="sm" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
                <AuditRow label="Created by" name={so.creator?.fullName} at={so.createdAt} />
                <AuditRow
                  label="Submitted by"
                  name={so.timeline.find((t) => t.action === "submit")?.actorName}
                  at={so.timeline.find((t) => t.action === "submit")?.createdAt ?? null}
                />
                <AuditRow
                  label={so.status === "cancelled" ? "Cancelled by" : "Approved by"}
                  name={so.timeline.find((t) => ["approve", "reject", "cancel"].includes(t.action))?.actorName}
                  at={so.timeline.find((t) => ["approve", "reject", "cancel"].includes(t.action))?.createdAt ?? null}
                />
                {so.fulfilledAt && <AuditRow label="Fulfilled" name={null} at={so.fulfilledAt} />}
              </div>
            </div>
            {so.notes && (
              <div className="mt-6">
                <SectionHeading title="Notes" size="sm" />
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-text-default">{so.notes}</p>
              </div>
            )}
            {so.shippingAddress && (
              <div className="mt-6">
                <SectionHeading title="Shipping Address" size="sm" />
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-text-default">{so.shippingAddress}</p>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-6 pt-5 pb-1">
              <SectionHeading title="Line Items" subtitle={`${so.items.length} ${so.items.length === 1 ? "line" : "lines"}`} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold w-12">#</th>
                    <th className="text-left px-5 py-3 font-semibold">Item</th>
                    <th className="text-left px-5 py-3 font-semibold">HSN</th>
                    <th className="text-left px-5 py-3 font-semibold">Qty</th>
                    <th className="text-left px-5 py-3 font-semibold">Fulfilled</th>
                    <th className="text-left px-5 py-3 font-semibold">Unit price</th>
                    <th className="text-left px-5 py-3 font-semibold">Tax</th>
                    <th className="text-right px-5 py-3 font-semibold">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {so.items.map((it, idx) => (
                    <tr key={it.id} className="border-t border-border align-top">
                      <td className="px-5 py-3 text-muted text-xs">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <p className="font-semibold">{it.itemName}</p>
                        {it.itemNarration && <p className="text-[11px] text-muted mt-0.5">{it.itemNarration}</p>}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">{it.hsnCode ?? "—"}</td>
                      <td className="px-5 py-3 tabular-nums">{quantityScaledToHuman(it.quantityScaled)} <span className="text-muted text-xs">{it.uom}</span></td>
                      <td className="px-5 py-3 tabular-nums text-xs">
                        {it.fulfilledQtyScaled > 0
                          ? <span className={it.fulfilledQtyScaled >= it.quantityScaled ? "text-success-fg font-medium" : "text-warning-fg"}>{quantityScaledToHuman(it.fulfilledQtyScaled)}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-5 py-3 tabular-nums">{paiseToINR(it.unitPricePaise)}</td>
                      <td className="px-5 py-3 text-xs tabular-nums">
                        {so.isInterstate
                          ? <>IGST {it.igstRate}%<br/><span className="text-muted">{paiseToINR(it.igstPaise)}</span></>
                          : <>CGST {it.cgstRate}% + SGST {it.sgstRate}%<br/><span className="text-muted">{paiseToINR(it.taxPaise)}</span></>}
                      </td>
                      <td className="px-5 py-3 tabular-nums font-semibold text-right">{paiseToINR(it.totalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface">
                    <td colSpan={6} />
                    <td className="px-5 py-2 text-right text-muted">Taxable</td>
                    <td className="px-5 py-2 tabular-nums text-right font-medium">{paiseToINR(so.taxableAmountPaise)}</td>
                  </tr>
                  {so.isInterstate ? (
                    <tr className="bg-surface">
                      <td colSpan={6} />
                      <td className="px-5 py-2 text-right text-muted">IGST</td>
                      <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(so.igstTotalPaise)}</td>
                    </tr>
                  ) : (
                    <>
                      <tr className="bg-surface">
                        <td colSpan={6} />
                        <td className="px-5 py-2 text-right text-muted">CGST</td>
                        <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(so.cgstTotalPaise)}</td>
                      </tr>
                      <tr className="bg-surface">
                        <td colSpan={6} />
                        <td className="px-5 py-2 text-right text-muted">SGST</td>
                        <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(so.sgstTotalPaise)}</td>
                      </tr>
                    </>
                  )}
                  {Number(so.freightChargesPaise) > 0 && (
                    <tr className="bg-surface"><td colSpan={6} /><td className="px-5 py-2 text-right text-muted">Freight</td><td className="px-5 py-2 tabular-nums text-right">{paiseToINR(so.freightChargesPaise)}</td></tr>
                  )}
                  {Number(so.otherChargesPaise) > 0 && (
                    <tr className="bg-surface"><td colSpan={6} /><td className="px-5 py-2 text-right text-muted">Other charges</td><td className="px-5 py-2 tabular-nums text-right">{paiseToINR(so.otherChargesPaise)}</td></tr>
                  )}
                  {Number(so.roundOffPaise) !== 0 && (
                    <tr className="bg-surface"><td colSpan={6} /><td className="px-5 py-2 text-right text-muted">Round-off</td><td className="px-5 py-2 tabular-nums text-right">{paiseToINR(so.roundOffPaise)}</td></tr>
                  )}
                  <tr className="bg-surface border-t border-border">
                    <td colSpan={6} />
                    <td className="px-5 py-3 text-right font-semibold">Grand total</td>
                    <td className="px-5 py-3 tabular-nums font-bold text-right text-base">{paiseToINR(so.totalPaise)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-6">
            <SectionHeading title="Timeline" size="sm" />
            {so.timeline.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              <ol className="space-y-4">
                {so.timeline.map((entry, idx) => (
                  <TimelineItem key={entry.id} entry={entry} isLast={idx === so.timeline.length - 1} />
                ))}
              </ol>
            )}
          </div>

          {so.customer && (
            <div className="card p-6">
              <SectionHeading title="Customer" size="sm" />
              <p className="font-semibold">{so.customer.name}</p>
              <div className="mt-2 text-xs text-muted space-y-1">
                {so.customer.gstin && <p className="font-mono">GST: {so.customer.gstin}</p>}
                {so.customer.email && <p>{so.customer.email}</p>}
                {so.customer.phone && <p>{so.customer.phone}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction === "submit"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => performAction("submit")}
        title="Send this sales order for approval?"
        description="Submit hone ke baad approver review karega. Approve hone par fulfil & invoice kar sakte ho."
        confirmLabel="Yes, submit"
        tone="primary"
      />
      <ConfirmDialog
        open={confirmAction === "cancel"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => performAction("cancel")}
        title="Cancel this sales order?"
        description="Audit trail mein record rahega. Customer ko inform karna padega manually."
        confirmLabel="Yes, cancel"
        tone="danger"
      />
      <ConfirmDialog
        open={fulfilOpen}
        onClose={() => !fulfilBusy && setFulfilOpen(false)}
        onConfirm={performFulfil}
        title="Fulfil remaining quantity?"
        description="Saari pending quantity shipped mark ho jayegi. Order partially fulfilled tha toh ab fulfilled ho jayega."
        confirmLabel={fulfilBusy ? "Working…" : "Yes, fulfil"}
        tone="success"
      />

      <Modal
        open={decision !== null}
        onClose={() => !decisionSubmitting && setDecision(null)}
        title={decision === "approve" ? "Approve this sales order?" : "Reject this sales order?"}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDecision(null)} disabled={decisionSubmitting}>Cancel</button>
            <button type="button" className={`btn ${decision === "approve" ? "btn-primary" : "btn-danger"}`} onClick={performDecision} disabled={decisionSubmitting}>
              {decisionSubmitting ? "Working…" : decision === "approve" ? "Confirm approval" : "Confirm rejection"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div
              className="h-12 w-12 rounded-2xl grid place-items-center shrink-0"
              style={{ background: decision === "approve" ? "var(--tint-mint)" : "var(--tint-blush)", color: decision === "approve" ? "var(--tint-mint-fg)" : "var(--tint-blush-fg)" }}
            >
              <Icon name={decision === "approve" ? "CircleCheckBig" : "CircleX"} size={22} />
            </div>
            <div className="flex-1 pt-1 text-sm text-muted leading-relaxed">
              <strong className="text-text-default">{so.soNumber}</strong> — {paiseToINR(so.totalPaise)} for {so.customer?.name}.
              {decision === "approve" ? " Approve hone ke baad order fulfil ke liye ready ho jayega." : " Reject hua toh order cancel ho jayega."}
            </div>
          </div>
          <div>
            <label className="label">Comment {decision === "reject" && <span className="text-muted">(recommended)</span>}</label>
            <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>
      </Modal>
    </>
  );
}

function Meta({ label, children, valueClass }: { label: string; children: React.ReactNode; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: "var(--muted)" }}>{label}</p>
      <div className={valueClass ?? "text-sm font-semibold text-text-default"}>{children}</div>
    </div>
  );
}

function AuditRow({ label, name, at }: { label: string; name?: string | null; at?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] whitespace-nowrap" style={{ color: "var(--muted)" }}>{label}</span>
      <span className="text-sm text-right min-w-0">
        {name ? <span className="font-semibold text-text-default">{name}</span> : <span style={{ color: "var(--muted-2)" }}>—</span>}
        {at && <span className="ml-2 text-xs font-medium" style={{ color: "var(--muted)" }}>· {formatDateTime(at)}</span>}
      </span>
    </div>
  );
}

const ACTION_META: Record<string, { icon: IconProps["name"]; tint: string; tintFg: string; verb: string }> = {
  create:  { icon: "Plus", tint: "var(--surface)", tintFg: "var(--muted)", verb: "created" },
  submit:  { icon: "Send", tint: "var(--tint-lilac)", tintFg: "var(--tint-lilac-fg)", verb: "submitted" },
  approve: { icon: "CircleCheckBig", tint: "var(--tint-mint)", tintFg: "var(--tint-mint-fg)", verb: "approved" },
  reject:  { icon: "CircleX", tint: "var(--tint-blush)", tintFg: "var(--tint-blush-fg)", verb: "rejected" },
  fulfil:  { icon: "Truck", tint: "var(--tint-peach)", tintFg: "var(--tint-peach-fg)", verb: "fulfilled" },
  cancel:  { icon: "Ban", tint: "var(--surface)", tintFg: "var(--muted)", verb: "cancelled" },
  update:  { icon: "Pencil", tint: "var(--surface)", tintFg: "var(--muted)", verb: "edited" },
};

function TimelineItem({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  const meta = ACTION_META[entry.action] ?? ACTION_META.create!;
  return (
    <li className="relative flex gap-3">
      {!isLast && <span className="absolute left-[18px] top-9 bottom-[-12px] w-px bg-border" />}
      <div className="h-9 w-9 rounded-xl grid place-items-center shrink-0" style={{ background: meta.tint, color: meta.tintFg }}>
        <Icon name={meta.icon} size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-semibold">{entry.actorName}</span>
          <span className="text-muted"> {meta.verb}</span>
        </p>
        <p className="text-[11px] text-muted">{formatDateTime(entry.createdAt)}</p>
        {entry.comment && <div className="mt-2 text-sm rounded-lg p-3 bg-surface border border-border whitespace-pre-wrap">{entry.comment}</div>}
      </div>
    </li>
  );
}
