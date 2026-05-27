"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Icon, type IconProps } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeading } from "@/components/SectionHeading";
import { PoStatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, quantityScaledToHuman, formatDateTime, formatDate, timeAgo } from "@/lib/format";
import { useAuth } from "@/lib/auth";

interface PoItem {
  id: string;
  itemName: string;
  description: string | null;
  itemGroupName: string | null;
  itemSubGroupName: string | null;
  hsnCode: string | null;
  quantityScaled: number;
  uom: string;
  unitPricePaise: string;
  discountPercent: number;
  discountAmountPaise: string;
  taxRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  subtotalPaise: string;
  taxableAmountPaise: string;
  taxPaise: string;
  cgstPaise: string;
  sgstPaise: string;
  igstPaise: string;
  totalPaise: string;
  committedDeliveryDate: string | null;
  itemNarration: string | null;
  lineBuyerUserId: string | null;
  tolerancePercent: number;
  warrantyMonths: number;
  isForStock: number;
  isRecoveryRate: number;
  deliverySchedule: Array<{ qtyScaled: number; deliveryDate: string }>;
}
interface TenantUser { id: string; fullName: string; email: string; isTenantAdmin: boolean; roleName: string; }
interface TimelineEntry { id: string; action: string; comment: string | null; level: number | null; actorName: string; createdAt: string; }
interface Amendment {
  id: string;
  amendmentNo: number;
  summary: string;
  remark: string | null;
  actorName: string;
  createdAt: string;
}

interface PoDetail {
  id: string;
  poNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  vendorId: string;
  prId: string | null;
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
  currency: string;
  deliveryDate: string | null;
  validUntil: string | null;
  deliveryAddress: string | null;
  deliveryTerms: string | null;
  paymentTerms: string | null;
  termsAndConditions: string | null;
  revisionNo: number;
  revisionRemark: string | null;
  sentToVendorAt: string | null;
  createdAt: string;
  /** Legacy parity — header polish. */
  poType: string | null;
  forDelivery: string | null;
  creditPeriodDays: number | null;
  insuranceTerms: string | null;
  penaltyTerms: string | null;
  packingTerms: string | null;
  items: PoItem[];
  vendor?: { id: string; name: string; gstin: string | null; email: string | null; phone: string | null };
  creator?: { id: string; fullName: string; email: string };
  company?: { id: string; name: string };
  unit?: { id: string; name: string; code: string | null };
  timeline: TimelineEntry[];
  amendments: Amendment[];
  amendmentCount: number;
  additionalCharges: Array<{ id: string; label: string; amountPaise: string }>;
}

const FOR_LABEL: Record<string, string> = {
  ex_works: "Ex Works",
  for_plant: "FOR Plant / Site",
  cif: "CIF",
  annexure: "Annexure",
  upto_destination: "Upto Destination",
};

type Decision = "approve" | "reject";

export default function PoDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const router = useRouter();
  const base = `/t/${params?.slug ?? ""}/po`;

  const [po, setPo] = useState<PoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"submit" | "send" | "cancel" | "short_close" | null>(null);
  const [shortCloseComment, setShortCloseComment] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comment, setComment] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [amendOpen, setAmendOpen] = useState<"add" | "list" | null>(null);
  const [amendSummary, setAmendSummary] = useState("");
  const [amendRemark, setAmendRemark] = useState("");
  const [amendSubmitting, setAmendSubmitting] = useState(false);
  const { me } = useAuth();

  /** Build a user-id -> "Name · Role" map so per-line buyer chips render readably. */
  const userMap = React.useMemo(
    () => new Map(tenantUsers.map((u) => [u.id, `${u.fullName} · ${u.roleName}`])),
    [tenantUsers],
  );

  async function load() {
    setLoading(true);
    try {
      const data = await api<PoDetail>(`/api/po/${params?.id}`);
      setPo(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load PO");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  useEffect(() => {
    // Fetch once, used to resolve per-line buyer IDs into readable names
    api<TenantUser[]>("/api/tenant/users").then(setTenantUsers).catch(() => setTenantUsers([]));
  }, []);

  async function handleClone() {
    if (!po || cloning) return;
    setCloning(true);
    try {
      const cloned = await api<{ id: string }>(`/api/po/${po.id}/clone`, { method: "POST", body: JSON.stringify({}) });
      toast.success("PO cloned", "Editing the new draft now.");
      router.push(`${base}/${cloned.id}`);
    } catch (err) {
      toast.error("Clone failed", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setCloning(false);
    }
  }

  async function submitAmendment() {
    if (!po || amendSubmitting) return;
    if (!amendSummary.trim()) {
      toast.error("Summary required", "Tell us what changed in 1 line.");
      return;
    }
    setAmendSubmitting(true);
    try {
      await api(`/api/po/${po.id}/amend`, {
        method: "POST",
        body: JSON.stringify({ summary: amendSummary, remark: amendRemark || undefined }),
      });
      toast.success("Amendment recorded", "Visible in the history badge.");
      setAmendOpen(null);
      setAmendSummary("");
      setAmendRemark("");
      load();
    } catch (err) {
      toast.error("Could not record amendment", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setAmendSubmitting(false);
    }
  }

  async function performAction(action: "submit" | "send" | "cancel" | "short_close") {
    if (!po) return;
    if (action === "short_close" && !shortCloseComment.trim()) {
      toast.error("Comment required", "Short Close needs a reason for the audit trail.");
      return;
    }
    try {
      // Backend route slug: short-close (with hyphen). Other actions match the verb.
      const path = action === "short_close" ? "short-close" : action;
      const body = action === "short_close" ? { comment: shortCloseComment } : {};
      const resp = await api<{ emailStatus?: string; vendorEmail?: string | null }>(
        `/api/po/${po.id}/${path}`,
        { method: "POST", body: JSON.stringify(body) },
      ).catch((e) => { throw e; });
      const title =
        action === "submit" ? "PO submitted" :
        action === "send" ? "PO sent to vendor" :
        action === "short_close" ? "PO short-closed" :
        "PO cancelled";
      // For "send" we surface whether the email actually went out.
      let desc =
        action === "submit" ? "Approver ko notify ho gaya." :
        action === "send" ? "Vendor ko chala gaya — ab GRN raise ho sakta hai." :
        action === "short_close" ? "Status closed. Aur GRN raise nahi honge against iss PO ke." :
        "PO cancelled.";
      if (action === "send" && resp?.emailStatus) {
        if (resp.emailStatus === "sent") {
          desc = `Email vendor ko send ho gaya (${resp.vendorEmail ?? "supplier"}).`;
        } else if (resp.emailStatus === "no_email") {
          desc = "PO status updated. Supplier ka email vendor master me set nahi hai — email skip kiya.";
        } else if (resp.emailStatus === "smtp_not_configured") {
          desc = "PO status updated. SMTP configure nahi hai server pe — admin se setup karwao.";
        } else if (resp.emailStatus === "failed") {
          desc = "PO status updated, lekin email bhejne me fail ho gaya. Logs check karo.";
        }
      }
      toast.success(title, desc);
      setConfirmAction(null);
      setShortCloseComment("");
      load();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Try again");
    }
  }

  async function performDecision() {
    if (!po || !decision) return;
    setDecisionSubmitting(true);
    try {
      await api(`/api/po/${po.id}/${decision}`, { method: "POST", body: JSON.stringify({ comment: comment || undefined }) });
      toast.success(
        decision === "approve" ? "PO approved" : "PO rejected",
        decision === "approve" ? `${po.poNumber ?? "PO"} approved. Now ready to send to vendor.` : `${po.poNumber ?? "PO"} rejected.`,
      );
      setDecision(null);
      setComment("");
      load();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setDecisionSubmitting(false);
    }
  }

  if (loading && !po) return <div className="p-12 text-center text-muted">Loading…</div>;
  if (error) return <>
    <Link href={base} className="text-sm text-muted hover:text-text-default">← Back to list</Link>
    <div className="mt-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>
  </>;
  if (!po) return null;

  const isFinalized = ["cancelled", "received", "closed"].includes(po.status);
  const isPending = po.status === "pending_approval";
  const isDraft = po.status === "draft";
  const isApproved = po.status === "approved";
  const canReceive = ["approved", "sent_to_vendor", "partially_received"].includes(po.status);
  const isCreator = me?.id === po.creator?.id;
  // Tenant admins can approve their own POs; everyone else needs to be a different user.
  const canDecide = isPending && (me?.isSuperAdmin || me?.isTenantAdmin || !isCreator);

  return (
    <>
      <div className="flex items-center gap-3 mb-3 text-sm text-muted">
        <Link href={base} className="hover:text-text-default">Purchase Orders</Link>
        <Icon name="ChevronRight" size={14} />
        <span className="text-text-default font-medium">{po.poNumber ?? "Draft"}</span>
      </div>

      <PageHeader
        title={po.title}
        subtitle={po.poNumber ? `${po.poNumber} · ${po.vendor?.name ?? "—"}` : `Draft · ${po.vendor?.name ?? "—"}`}
        actions={
          <>
            {isDraft && (isCreator || me?.isTenantAdmin) && (
              <>
                <Link href={`${base}/${po.id}/edit`} className="btn btn-ghost">
                  <Icon name="Pencil" /> Edit draft
                </Link>
                <button className="btn btn-primary" onClick={() => setConfirmAction("submit")}>
                  <Icon name="Send" /> Send for Approval
                </button>
              </>
            )}
            {canDecide && (
              <>
                <button className="btn btn-ghost" onClick={() => { setDecision("reject"); setComment(""); }}>
                  <Icon name="XCircle" /> Reject
                </button>
                <button className="btn btn-primary" onClick={() => { setDecision("approve"); setComment(""); }}>
                  <Icon name="CheckCircle2" /> Approve
                </button>
              </>
            )}
            {isApproved && (me?.isTenantAdmin || isCreator) && (
              <button className="btn btn-primary" onClick={() => setConfirmAction("send")}>
                <Icon name="Truck" /> Send to Supplier
              </button>
            )}
            {canReceive && (
              <Link href={`/t/${params?.slug}/grn/new?fromPo=${po.id}`} className="btn btn-primary">
                <Icon name="PackageCheck" /> Receive (GRN)
              </Link>
            )}
            {canReceive && (isCreator || me?.isTenantAdmin) && (
              <button
                className="btn btn-ghost"
                onClick={() => { setShortCloseComment(""); setConfirmAction("short_close"); }}
                title="Close the PO without waiting for full receipt"
              >
                <Icon name="XSquare" /> Short Close
              </button>
            )}
            {po.amendmentCount > 0 && (
              <button
                className="btn btn-ghost"
                onClick={() => setAmendOpen("list")}
                title="View amendment history"
              >
                <Icon name="History" /> Amendments
                <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-pill text-[10px] font-bold" style={{ background: "var(--tint-peach)", color: "var(--tint-peach-fg)" }}>
                  {po.amendmentCount}
                </span>
              </button>
            )}
            {!isDraft && !isPending && !isFinalized && (isCreator || me?.isTenantAdmin) && (
              <button
                className="btn btn-ghost"
                onClick={() => { setAmendSummary(""); setAmendRemark(""); setAmendOpen("add"); }}
                title="Record an amendment on this PO"
              >
                <Icon name="FilePen" /> Amend
              </button>
            )}
            <button className="btn btn-ghost" onClick={handleClone} disabled={cloning} title="Create a new draft PO with the same details">
              <Icon name="Copy" /> {cloning ? "Cloning…" : "Save As"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => window.open(`/t/${params?.slug}/po/${po.id}/print`, "_blank")}
              title="Open a print-friendly view (browser opens PDF dialog)"
            >
              <Icon name="Printer" /> Print
            </button>
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
              <Meta label="Status"><PoStatusBadge status={po.status} /></Meta>
              <Meta label="Grand total" valueClass="display text-lg !mt-0">{paiseToINR(po.totalPaise)}</Meta>
              <Meta label="GST scheme">
                <span className="badge badge-info uppercase text-[10px]">{po.isInterstate ? "Interstate · IGST" : "Intrastate · CGST+SGST"}</span>
              </Meta>
              <Meta label="Delivery date">{formatDate(po.deliveryDate)}</Meta>
              <Meta label="Valid until">{formatDate(po.validUntil)}</Meta>
              <Meta label="Vendor">{po.vendor?.name ?? "—"}</Meta>
              <Meta label="Company">{po.company?.name ?? "—"}</Meta>
              <Meta label="Unit">{po.unit?.name ?? "—"}</Meta>
              <Meta label="Place of supply">{po.placeOfSupply ?? "—"}</Meta>
              <Meta label="Payment terms">{po.paymentTerms ?? "—"}</Meta>
              <Meta label="Delivery terms">{po.deliveryTerms ?? "—"}</Meta>
              <Meta label="PO type">
                {po.poType
                  ? <span className="capitalize">{po.poType.replace("_", " ")}</span>
                  : <span className="text-muted">—</span>}
              </Meta>
              <Meta label="F.O.R.">{po.forDelivery ? (FOR_LABEL[po.forDelivery] ?? po.forDelivery) : "—"}</Meta>
              <Meta label="Credit period">
                {po.creditPeriodDays != null
                  ? <><span className="tabular-nums">{po.creditPeriodDays}</span> <span className="text-muted text-xs">days</span></>
                  : <span className="text-muted">—</span>}
              </Meta>
              {po.revisionNo > 0 && (
                <Meta label={`Revision ${po.revisionNo}`}>
                  <span className="text-sm">{po.revisionRemark ?? <span className="text-muted">No remark</span>}</span>
                </Meta>
              )}
            </div>

            {(po.insuranceTerms || po.penaltyTerms || po.packingTerms) && (
              <div className="mt-5 pt-5 border-t border-border grid grid-cols-1 lg:grid-cols-3 gap-5">
                {po.insuranceTerms && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: "var(--muted)" }}>Insurance</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{po.insuranceTerms}</p>
                  </div>
                )}
                {po.penaltyTerms && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: "var(--muted)" }}>Penalty / LD</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{po.penaltyTerms}</p>
                  </div>
                )}
                {po.packingTerms && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: "var(--muted)" }}>Packing</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{po.packingTerms}</p>
                  </div>
                )}
              </div>
            )}

            {/* Audit trail summary */}
            <div className="mt-6">
              <SectionHeading title="Activity" size="sm" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
                <AuditRow label="Created by"   name={po.creator?.fullName} at={po.createdAt} />
                <AuditRow label="Last modified" name={null} at={po.updatedAt} />
                <AuditRow
                  label="Submitted by"
                  name={po.timeline.find((t) => t.action === "submit")?.actorName}
                  at={po.timeline.find((t) => t.action === "submit")?.createdAt ?? null}
                />
                <AuditRow
                  label={po.status === "cancelled" ? "Cancelled by" : "Approved by"}
                  name={po.timeline.find((t) => ["approve", "reject", "cancel"].includes(t.action))?.actorName}
                  at={po.timeline.find((t) => ["approve", "reject", "cancel"].includes(t.action))?.createdAt ?? null}
                />
                {po.sentToVendorAt && (
                  <AuditRow label="Sent to vendor" name={null} at={po.sentToVendorAt} />
                )}
              </div>
            </div>
            {po.description && (
              <div className="mt-6">
                <SectionHeading title="Notes" size="sm" />
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-text-default">{po.description}</p>
              </div>
            )}
            {po.deliveryAddress && (
              <div className="mt-6">
                <SectionHeading title="Delivery Address" size="sm" />
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-text-default">{po.deliveryAddress}</p>
              </div>
            )}
            {po.termsAndConditions && (
              <div className="mt-6">
                <SectionHeading title="Terms & Conditions" size="sm" />
                <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--muted)" }}>{po.termsAndConditions}</p>
              </div>
            )}
            {po.prId && (
              <div className="mt-3 text-xs text-muted">
                Converted from PR · <Link href={`/t/${params?.slug}/pr/${po.prId}`} className="text-primary font-medium hover:underline">View source PR</Link>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-6 pt-5 pb-1">
              <SectionHeading title="Line Items" subtitle={`${po.items.length} ${po.items.length === 1 ? "line" : "lines"}`} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold w-12">#</th>
                    <th className="text-left px-5 py-3 font-semibold">Item</th>
                    <th className="text-left px-5 py-3 font-semibold">HSN</th>
                    <th className="text-left px-5 py-3 font-semibold">Qty</th>
                    <th className="text-left px-5 py-3 font-semibold">UOM</th>
                    <th className="text-left px-5 py-3 font-semibold">Unit price</th>
                    <th className="text-left px-5 py-3 font-semibold">Disc</th>
                    <th className="text-left px-5 py-3 font-semibold">Tax</th>
                    <th className="text-left px-5 py-3 font-semibold">Buyer</th>
                    <th className="text-left px-5 py-3 font-semibold">Committed</th>
                    <th className="text-right px-5 py-3 font-semibold">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((it, idx) => (
                    <React.Fragment key={it.id}>
                    <tr className="border-t border-border align-top">
                      <td className="px-5 py-3 text-muted text-xs">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <p className="font-semibold">{it.itemName}</p>
                        {(it.itemGroupName || it.itemSubGroupName) && (
                          <p className="text-[11px] text-muted mt-0.5">{[it.itemGroupName, it.itemSubGroupName].filter(Boolean).join(" / ")}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">{it.hsnCode ?? "—"}</td>
                      <td className="px-5 py-3 tabular-nums">{quantityScaledToHuman(it.quantityScaled)}</td>
                      <td className="px-5 py-3 font-mono text-xs">{it.uom}</td>
                      <td className="px-5 py-3 tabular-nums">{paiseToINR(it.unitPricePaise)}</td>
                      <td className="px-5 py-3 text-xs tabular-nums">
                        {it.discountPercent > 0
                          ? <><span>{it.discountPercent}%</span><br/><span className="text-muted">{paiseToINR(it.discountAmountPaise)}</span></>
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-xs tabular-nums">
                        {po.isInterstate
                          ? <>IGST {it.igstRate}%<br/><span className="text-muted">{paiseToINR(it.igstPaise)}</span></>
                          : <>CGST {it.cgstRate}% + SGST {it.sgstRate}%<br/><span className="text-muted">{paiseToINR(it.taxPaise)}</span></>
                        }
                      </td>
                      <td className="px-5 py-3 text-xs">
                        {it.lineBuyerUserId
                          ? <span className="font-medium">{userMap.get(it.lineBuyerUserId) ?? `${it.lineBuyerUserId.slice(0, 8)}…`}</span>
                          : <span className="text-muted italic">unassigned</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted">{formatDate(it.committedDeliveryDate)}</td>
                      <td className="px-5 py-3 tabular-nums font-semibold text-right">{paiseToINR(it.totalPaise)}</td>
                    </tr>
                    {(it.itemNarration || it.tolerancePercent > 0 || it.warrantyMonths > 0 || it.isForStock || it.isRecoveryRate || (it.deliverySchedule?.length ?? 0) > 0) && (
                      <tr className="border-t border-border" style={{ background: "var(--surface)" }}>
                        <td />
                        <td colSpan={10} className="px-5 py-2 text-xs">
                          {it.itemNarration && (
                            <div className="mb-1.5">
                              <span className="text-muted font-semibold uppercase tracking-wider text-[10px] mr-2">Remark:</span>
                              {it.itemNarration}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {it.tolerancePercent > 0 && <span className="badge badge-info text-[10px]">Tolerance ±{it.tolerancePercent}%</span>}
                            {it.warrantyMonths > 0 && <span className="badge badge-info text-[10px]">Warranty {it.warrantyMonths} mo</span>}
                            {Number(it.isForStock) === 1 && <span className="badge badge-tint-mint text-[10px]">For Stock</span>}
                            {Number(it.isRecoveryRate) === 1 && <span className="badge badge-tint-peach text-[10px]">Recovery rate</span>}
                          </div>
                          {(it.deliverySchedule?.length ?? 0) > 0 && (
                            <div className="mt-2 pt-2 border-t border-border">
                              <span className="text-muted font-semibold uppercase tracking-wider text-[10px] mr-2">Schedule:</span>
                              <div className="inline-flex flex-wrap gap-1.5 mt-1">
                                {it.deliverySchedule.map((s, sidx) => (
                                  <span key={sidx} className="badge badge-tint-lilac text-[10px]">
                                    {(s.qtyScaled / 1000).toLocaleString("en-IN")} {it.uom} · {formatDate(s.deliveryDate)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface">
                    <td colSpan={9} />
                    <td className="px-5 py-2 text-right text-muted">Subtotal</td>
                    <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(po.subtotalPaise)}</td>
                  </tr>
                  {Number(po.discountTotalPaise) > 0 && (
                    <tr className="bg-surface">
                      <td colSpan={9} />
                      <td className="px-5 py-2 text-right text-muted">Less: Discount</td>
                      <td className="px-5 py-2 tabular-nums text-right">− {paiseToINR(po.discountTotalPaise)}</td>
                    </tr>
                  )}
                  <tr className="bg-surface">
                    <td colSpan={9} />
                    <td className="px-5 py-2 text-right text-muted">Taxable amount</td>
                    <td className="px-5 py-2 tabular-nums text-right font-medium">{paiseToINR(po.taxableAmountPaise)}</td>
                  </tr>
                  {po.isInterstate ? (
                    <tr className="bg-surface">
                      <td colSpan={9} />
                      <td className="px-5 py-2 text-right text-muted">IGST</td>
                      <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(po.igstTotalPaise)}</td>
                    </tr>
                  ) : (
                    <>
                      <tr className="bg-surface">
                        <td colSpan={9} />
                        <td className="px-5 py-2 text-right text-muted">CGST</td>
                        <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(po.cgstTotalPaise)}</td>
                      </tr>
                      <tr className="bg-surface">
                        <td colSpan={9} />
                        <td className="px-5 py-2 text-right text-muted">SGST</td>
                        <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(po.sgstTotalPaise)}</td>
                      </tr>
                    </>
                  )}
                  {Number(po.freightChargesPaise) > 0 && (
                    <tr className="bg-surface">
                      <td colSpan={9} />
                      <td className="px-5 py-2 text-right text-muted">Freight</td>
                      <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(po.freightChargesPaise)}</td>
                    </tr>
                  )}
                  {Number(po.otherChargesPaise) > 0 && (
                    <tr className="bg-surface">
                      <td colSpan={9} />
                      <td className="px-5 py-2 text-right text-muted">Other charges</td>
                      <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(po.otherChargesPaise)}</td>
                    </tr>
                  )}
                  {po.additionalCharges.map((c) => (
                    <tr key={c.id} className="bg-surface">
                      <td colSpan={9} />
                      <td className="px-5 py-2 text-right text-muted">{c.label}</td>
                      <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(c.amountPaise)}</td>
                    </tr>
                  ))}
                  {Number(po.roundOffPaise) !== 0 && (
                    <tr className="bg-surface">
                      <td colSpan={9} />
                      <td className="px-5 py-2 text-right text-muted">Round-off</td>
                      <td className="px-5 py-2 tabular-nums text-right">{paiseToINR(po.roundOffPaise)}</td>
                    </tr>
                  )}
                  <tr className="bg-surface border-t border-border">
                    <td colSpan={9} />
                    <td className="px-5 py-3 text-right font-semibold">Grand total</td>
                    <td className="px-5 py-3 tabular-nums font-bold text-right text-base">{paiseToINR(po.totalPaise)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-6">
            <SectionHeading title="Timeline" size="sm" />
            {po.timeline.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              <ol className="space-y-4">
                {po.timeline.map((entry, idx) => (
                  <TimelineItem key={entry.id} entry={entry} isLast={idx === po.timeline.length - 1} />
                ))}
              </ol>
            )}
          </div>

          {po.vendor && (
            <div className="card p-6">
              <SectionHeading title="Vendor" size="sm" />
              <p className="font-semibold">{po.vendor.name}</p>
              <div className="mt-2 text-xs text-muted space-y-1">
                {po.vendor.gstin && <p className="font-mono">GST: {po.vendor.gstin}</p>}
                {po.vendor.email && <p>{po.vendor.email}</p>}
                {po.vendor.phone && <p>{po.vendor.phone}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction === "submit"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => performAction("submit")}
        title="Send this PO for approval?"
        description="Submit hone ke baad edit nahi kar paaoge. Approver review karega."
        confirmLabel="Yes, submit"
        tone="primary"
      />
      <ConfirmDialog
        open={confirmAction === "send"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => performAction("send")}
        title="Send PO to Supplier?"
        description="Vendor ko official PO chala jayega. Goods aane par GRN raise kar sakte ho."
        confirmLabel="Yes, send"
        tone="success"
      />
      <ConfirmDialog
        open={confirmAction === "cancel"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => performAction("cancel")}
        title="Cancel this PO?"
        description="Audit trail mein record rahega. Vendor ko inform karna padega manually."
        confirmLabel="Yes, cancel"
        tone="danger"
      />

      {/* Amend modal — record what changed */}
      <Modal
        open={amendOpen === "add"}
        onClose={() => !amendSubmitting && setAmendOpen(null)}
        title="Record a PO amendment"
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setAmendOpen(null)} disabled={amendSubmitting}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={submitAmendment} disabled={amendSubmitting || !amendSummary.trim()}>
              {amendSubmitting ? "Saving…" : "Record amendment"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-2xl grid place-items-center shrink-0" style={{ background: "var(--tint-lilac)", color: "var(--tint-lilac-fg)" }}>
              <Icon name="FilePen" size={22} />
            </div>
            <div className="flex-1 pt-1 text-sm text-muted leading-relaxed">
              Approval ke baad jab kuch badle (rate, qty, delivery, terms) — uska reason yahan log karo.
              Audit trail mein dikhega aur PO header pe badge counter update hoga.
            </div>
          </div>
          <div>
            <label className="label">Summary <span className="text-danger">*</span></label>
            <input
              className="input"
              maxLength={120}
              placeholder="e.g. Rate revised for line 3 after vendor counter"
              value={amendSummary}
              onChange={(e) => setAmendSummary(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Detailed remark <span className="text-muted">(optional)</span></label>
            <textarea
              className="input"
              rows={3}
              placeholder="Background, approvals taken, vendor email reference, etc."
              value={amendRemark}
              onChange={(e) => setAmendRemark(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* Amendment history list */}
      <Modal
        open={amendOpen === "list"}
        onClose={() => setAmendOpen(null)}
        title={`Amendment history (${po.amendmentCount})`}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setAmendOpen(null)}>Close</button>
            {!isDraft && !isPending && !isFinalized && (isCreator || me?.isTenantAdmin) && (
              <button type="button" className="btn btn-primary" onClick={() => { setAmendSummary(""); setAmendRemark(""); setAmendOpen("add"); }}>
                <Icon name="Plus" /> New amendment
              </button>
            )}
          </>
        }
      >
        {po.amendments.length === 0 ? (
          <p className="text-sm text-muted p-4 text-center">No amendments recorded yet.</p>
        ) : (
          <ol className="space-y-3">
            {po.amendments.map((a) => (
              <li key={a.id} className="rounded-xl border border-border p-4">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <p className="font-semibold">
                    <span className="font-mono text-xs mr-2" style={{ color: "var(--tint-peach-fg)" }}>#{a.amendmentNo}</span>
                    {a.summary}
                  </p>
                  <span className="text-xs text-muted whitespace-nowrap">{formatDateTime(a.createdAt)}</span>
                </div>
                <p className="text-xs text-muted">By <strong className="text-text-default">{a.actorName}</strong></p>
                {a.remark && <p className="text-sm mt-2 whitespace-pre-wrap leading-relaxed">{a.remark}</p>}
              </li>
            ))}
          </ol>
        )}
      </Modal>

      <Modal
        open={confirmAction === "short_close"}
        onClose={() => setConfirmAction(null)}
        title="Short Close this PO?"
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmAction(null)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => performAction("short_close")}
              disabled={!shortCloseComment.trim()}
            >
              <Icon name="XSquare" /> Short close
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-2xl grid place-items-center shrink-0" style={{ background: "var(--tint-peach)", color: "var(--tint-peach-fg)" }}>
              <Icon name="XSquare" size={22} />
            </div>
            <div className="flex-1 pt-1 text-sm text-muted leading-relaxed">
              PO ko <strong className="text-text-default">closed</strong> mark kar denge — baki ka delivery wait nahi karenge.
              Iske baad iss PO ke against aur GRN nahi raise hoga. Audit ke liye reason batana <strong>mandatory</strong> hai.
            </div>
          </div>
          <div>
            <label className="label">Reason <span className="text-danger">*</span></label>
            <textarea
              className="input"
              rows={3}
              placeholder="Why are we short-closing? e.g. vendor short-shipped, item discontinued, budget revised..."
              value={shortCloseComment}
              onChange={(e) => setShortCloseComment(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={decision !== null}
        onClose={() => !decisionSubmitting && setDecision(null)}
        title={decision === "approve" ? "Approve this PO?" : "Reject this PO?"}
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
              <Icon name={decision === "approve" ? "CheckCircle2" : "XCircle"} size={22} />
            </div>
            <div className="flex-1 pt-1 text-sm text-muted leading-relaxed">
              <strong className="text-text-default">{po.poNumber}</strong> — {paiseToINR(po.totalPaise)} to {po.vendor?.name}.
              {decision === "approve" ? " Approve hone ke baad PO send-to-vendor ke liye ready ho jayega." : " Reject hua toh PO cancel ho jayega."}
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
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <div className={valueClass ?? "text-sm font-semibold text-text-default"}>{children}</div>
    </div>
  );
}

function AuditRow({ label, name, at }: { label: string; name?: string | null; at?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] whitespace-nowrap" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <span className="text-sm text-right min-w-0">
        {name ? (
          <span className="font-semibold text-text-default">{name}</span>
        ) : (
          <span style={{ color: "var(--muted-2)" }}>—</span>
        )}
        {at && (
          <span className="ml-2 text-xs font-medium" style={{ color: "var(--muted)" }}>
            · {formatDateTime(at)}
          </span>
        )}
      </span>
    </div>
  );
}

const ACTION_META: Record<string, { icon: IconProps["name"]; tint: string; tintFg: string; verb: string }> = {
  submit:  { icon: "Send", tint: "var(--tint-lilac)", tintFg: "var(--tint-lilac-fg)", verb: "submitted" },
  approve: { icon: "CheckCircle2", tint: "var(--tint-mint)", tintFg: "var(--tint-mint-fg)", verb: "approved" },
  reject:  { icon: "XCircle", tint: "var(--tint-blush)", tintFg: "var(--tint-blush-fg)", verb: "rejected" },
  cancel:  { icon: "Ban", tint: "var(--surface)", tintFg: "var(--muted)", verb: "cancelled" },
};

function TimelineItem({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  const meta = ACTION_META[entry.action] ?? ACTION_META.submit!;
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
          {entry.level !== null && <span className="text-muted"> at L{entry.level}</span>}
        </p>
        <p className="text-[11px] text-muted">{formatDateTime(entry.createdAt)}</p>
        {entry.comment && (
          <div className="mt-2 text-sm rounded-lg p-3 bg-surface border border-border whitespace-pre-wrap">{entry.comment}</div>
        )}
      </div>
    </li>
  );
}
