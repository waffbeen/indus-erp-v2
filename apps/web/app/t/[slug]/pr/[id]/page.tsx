"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Icon, type IconProps } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeading } from "@/components/SectionHeading";
import { PrStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, quantityScaledToHuman, formatDateTime, formatDate, timeAgo } from "@/lib/format";
import { useAuth } from "@/lib/auth";

interface PrItem {
  id: string;
  itemName: string;
  description: string | null;
  itemGroupName: string | null;
  itemSubGroupName: string | null;
  hsnCode: string | null;
  quantityScaled: number;
  uom: string;
  stockUnit: string | null;
  purchaseUnit: string | null;
  estimatedUnitPricePaise: string | null;
  estimatedTotalPaise: string;
  lastPurchaseRatePaise: string | null;
  lastPurchaseDate: string | null;
  expectedDeliveryDate: string | null;
  itemNarration: string | null;
  notes: string | null;
}

interface TimelineEntry {
  id: string;
  action: string;
  comment: string | null;
  level: number | null;
  actorRoleKey: string | null;
  actorName: string;
  actorEmail: string;
  createdAt: string;
}

interface PrDetail {
  id: string;
  tenantId: string;
  prNumber: string | null;
  title: string;
  description: string | null;
  prType: string;
  referenceNo: string | null;
  buyerUserId: string | null;
  priority: string;
  status: string;
  requesterId: string;
  companyId: string;
  unitId: string;
  estimatedTotalPaise: string;
  currency: string;
  neededBy: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: PrItem[];
  requester: { id: string; fullName: string; email: string } | undefined;
  company: { id: string; name: string } | undefined;
  unit: { id: string; name: string; code: string | null } | undefined;
  timeline: TimelineEntry[];
}

type DecisionAction = "approve" | "reject" | "send_back";

interface RelatedPo {
  id: string;
  poNumber: string | null;
  title: string;
  status: string;
  totalPaise: string;
  vendorName: string;
  createdAt: string;
}

export default function PrDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const router = useRouter();
  const base = `/t/${params?.slug ?? ""}/pr`;

  const [pr, setPr] = useState<PrDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"submit" | "cancel" | null>(null);
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [relatedPos, setRelatedPos] = useState<RelatedPo[]>([]);

  const { me } = useAuth();

  async function load() {
    setLoading(true);
    try {
      const data = await api<PrDetail>(`/api/pr/${params?.id}`);
      setPr(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load requisition");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  useEffect(() => {
    if (!params?.id) return;
    api<RelatedPo[]>(`/api/pr/${params.id}/related-pos`)
      .then(setRelatedPos)
      .catch(() => setRelatedPos([]));
  }, [params?.id]);

  async function handleClone() {
    if (!pr || cloning) return;
    setCloning(true);
    try {
      const cloned = await api<{ id: string }>(`/api/pr/${pr.id}/clone`, { method: "POST", body: JSON.stringify({}) });
      toast.success("PR cloned", "Editing the new draft now.");
      router.push(`${base}/${cloned.id}`);
    } catch (err) {
      toast.error("Clone failed", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setCloning(false);
    }
  }

  async function performAction(action: "submit" | "cancel") {
    if (!pr) return;
    try {
      await api(`/api/pr/${pr.id}/${action}`, { method: "POST", body: JSON.stringify({}) });
      toast.success(
        action === "submit" ? "Requisition submitted" : "Requisition cancelled",
        action === "submit" ? "Approver ko notification chala gaya." : "PR cancelled — record kept for audit.",
      );
      setConfirmAction(null);
      load();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Try again");
    }
  }

  async function performDecision() {
    if (!pr || !decisionAction) return;
    if (decisionAction === "send_back" && !decisionComment.trim()) {
      toast.error("Comment required", "Tell the requester what to revise.");
      return;
    }
    setDecisionSubmitting(true);
    try {
      // Backend routes: /approve, /reject, /send-back  (action is the URL slug)
      const path = decisionAction === "send_back" ? "send-back" : decisionAction;
      await api(`/api/pr/${pr.id}/${path}`, {
        method: "POST",
        body: JSON.stringify({ comment: decisionComment || undefined }),
      });
      const toastTitle =
        decisionAction === "approve" ? "PR approved" :
        decisionAction === "send_back" ? "Sent back for revision" :
        "PR rejected";
      const toastBody =
        decisionAction === "approve"
          ? `${pr.prNumber ?? "Request"} approved. Ab PO ban sakta hai.`
          : decisionAction === "send_back"
            ? `${pr.prNumber ?? "Request"} requester ke draft mein wapas chala gaya. Woh edit karke resubmit kar sakta hai.`
            : `${pr.prNumber ?? "Request"} rejected. Requester ko notify ho gaya.`;
      toast.success(toastTitle, toastBody);
      setDecisionAction(null);
      setDecisionComment("");
      load();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setDecisionSubmitting(false);
    }
  }

  if (loading && !pr) {
    return <div className="p-12 text-center text-muted">Loading…</div>;
  }
  if (error) {
    return (
      <>
        <Link href={base} className="text-sm text-muted hover:text-text-default">← Back to list</Link>
        <div className="mt-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>
      </>
    );
  }
  if (!pr) return null;

  const isOwner = me?.id === pr.requesterId;
  const isFinalized = ["approved", "rejected", "cancelled", "converted_to_po"].includes(pr.status);
  const isPending = ["pending_l1", "pending_l2", "escalated"].includes(pr.status);
  const isDraft = pr.status === "draft";

  // Approve/reject visibility:
  //   - Tenant admins / super admins can approve any PR (including their own — matches backend rule)
  //   - Others see Approve only on PRs they did NOT raise (backend still enforces permission)
  const canDecide = isPending && (me?.isSuperAdmin || me?.isTenantAdmin || !isOwner);

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-3 text-sm text-muted">
        <Link href={base} className="hover:text-text-default">Requisitions</Link>
        <Icon name="ChevronRight" size={14} />
        <span className="text-text-default font-medium">{pr.prNumber ?? "Draft"}</span>
      </div>

      <PageHeader
        title={pr.title}
        subtitle={pr.prNumber ? `${pr.prNumber} · ${pr.requester?.fullName ?? "—"}` : `Draft · ${pr.requester?.fullName ?? "—"}`}
        actions={
          <>
            {isDraft && (isOwner || me?.isTenantAdmin) && (
              <>
                <Link href={`${base}/${pr.id}/edit`} className="btn btn-ghost">
                  <Icon name="Pencil" /> Edit
                </Link>
                <button className="btn btn-primary" onClick={() => setConfirmAction("submit")}>
                  <Icon name="Send" /> Send for Approval
                </button>
              </>
            )}
            {canDecide && (
              <>
                <button className="btn btn-ghost" onClick={() => { setDecisionAction("send_back"); setDecisionComment(""); }} title="Send back to requester for revision">
                  <Icon name="Undo2" /> Send Back
                </button>
                <button className="btn btn-ghost" onClick={() => { setDecisionAction("reject"); setDecisionComment(""); }}>
                  <Icon name="XCircle" /> Reject
                </button>
                <button className="btn btn-primary" onClick={() => { setDecisionAction("approve"); setDecisionComment(""); }}>
                  <Icon name="CheckCircle2" /> Approve
                </button>
              </>
            )}
            {pr.status === "approved" && (
              <Link href={`/t/${params?.slug}/po/new?fromPr=${pr.id}`} className="btn btn-primary">
                <Icon name="ShoppingCart" /> Convert to PO
              </Link>
            )}
            <button className="btn btn-ghost" onClick={handleClone} disabled={cloning} title="Create a new draft PR with the same details">
              <Icon name="Copy" /> {cloning ? "Cloning…" : "Save As"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => window.open(`/t/${params?.slug}/pr/${pr.id}/print`, "_blank")}
              title="Open a print-friendly view (browser opens PDF dialog)"
            >
              <Icon name="Printer" /> Print
            </button>
            {!isFinalized && (isOwner || me?.isTenantAdmin) && (
              <button
                className="h-10 w-10 rounded-pill border border-border grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg"
                onClick={() => setConfirmAction("cancel")}
                title="Cancel requisition"
              >
                <Icon name="Trash2" size={16} />
              </button>
            )}
          </>
        }
      />

      {pr.status === "approved" && (
        <div className="card p-5 mb-5 flex items-center gap-4" style={{ background: "var(--tint-mint)" }}>
          <div className="h-12 w-12 rounded-2xl grid place-items-center shrink-0" style={{ background: "rgba(255,255,255,0.6)", color: "var(--tint-mint-fg)" }}>
            <Icon name="CheckCircle2" size={24} />
          </div>
          <div className="flex-1">
            <p className="font-bold" style={{ color: "var(--tint-mint-fg)" }}>Approved — next step: create the Purchase Order</p>
            <p className="text-sm mt-0.5" style={{ color: "var(--tint-mint-fg)", opacity: 0.85 }}>
              Click below to convert this PR into a PO. Line items will be pre-filled — just pick a vendor and set unit prices.
            </p>
          </div>
          <Link href={`/t/${params?.slug}/po/new?fromPr=${pr.id}`} className="btn btn-primary btn-lg">
            <Icon name="ShoppingCart" /> Convert to PO
          </Link>
        </div>
      )}

      {pr.status === "converted_to_po" && (
        <div className="card p-5 mb-5 flex items-center gap-4" style={{ background: "var(--tint-lilac)" }}>
          <div className="h-12 w-12 rounded-2xl grid place-items-center shrink-0" style={{ background: "rgba(255,255,255,0.6)", color: "var(--tint-lilac-fg)" }}>
            <Icon name="ShoppingCart" size={24} />
          </div>
          <div className="flex-1">
            <p className="font-bold" style={{ color: "var(--tint-lilac-fg)" }}>Converted to Purchase Order</p>
            <p className="text-sm mt-0.5" style={{ color: "var(--tint-lilac-fg)", opacity: 0.85 }}>
              This PR has been converted to a PO. Check the PO list to track delivery.
            </p>
          </div>
          <Link href={`/t/${params?.slug}/po`} className="btn btn-primary">
            <Icon name="ArrowRight" /> View POs
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* MAIN */}
        <div className="lg:col-span-2 space-y-5">
          {/* Header card */}
          <div className="card p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
              <Meta label="Status"><PrStatusBadge status={pr.status} /></Meta>
              <Meta label="PR Type">
                <span className="text-sm font-medium capitalize">{(pr.prType ?? "stock").replace("_", " ")}</span>
              </Meta>
              <Meta label="Priority"><PriorityBadge priority={pr.priority} /></Meta>
              <Meta label="Estimated total" valueClass="display text-lg !mt-0">
                {paiseToINR(pr.estimatedTotalPaise)}
              </Meta>
              <Meta label="Needed by">{formatDate(pr.neededBy)}</Meta>
              <Meta label="Reference">{pr.referenceNo ?? <span className="text-muted">—</span>}</Meta>
              <Meta label="Company">{pr.company?.name ?? "—"}</Meta>
              <Meta label="Unit / Plant">
                {pr.unit?.name ?? "—"}{pr.unit?.code ? <span className="text-muted"> ({pr.unit.code})</span> : null}
              </Meta>
              <Meta label="Buyer">{pr.buyerUserId ? <span className="font-mono text-xs">{pr.buyerUserId.slice(0, 8)}…</span> : <span className="text-muted">unassigned</span>}</Meta>
            </div>

            {pr.description && (
              <div className="mt-6">
                <SectionHeading title="Description" size="sm" />
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-text-default">{pr.description}</p>
              </div>
            )}

            {/* Audit trail summary */}
            <div className="mt-6">
              <SectionHeading title="Activity" size="sm" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
                <AuditRow label="Created by"   name={pr.requester?.fullName} at={pr.createdAt} />
                <AuditRow label="Last modified" name={null} at={pr.updatedAt} />
                <AuditRow
                  label="Submitted by"
                  name={pr.timeline.find((t) => t.action === "submit")?.actorName}
                  at={pr.submittedAt}
                />
                <AuditRow
                  label={pr.status === "rejected" ? "Rejected by" : pr.status === "cancelled" ? "Cancelled by" : "Approved by"}
                  name={pr.timeline.find((t) => ["approve", "reject", "cancel"].includes(t.action))?.actorName}
                  at={pr.decidedAt}
                />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="card overflow-hidden">
            <div className="px-6 pt-5 pb-1">
              <SectionHeading
                title="Line Items"
                subtitle={`${pr.items.length} ${pr.items.length === 1 ? "item" : "items"} · estimated ${paiseToINR(pr.estimatedTotalPaise)}`}
              />
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
                    <th className="text-left px-5 py-3 font-semibold">Last bought</th>
                    <th className="text-right px-5 py-3 font-semibold">Line total</th>
                    <th className="text-left px-5 py-3 font-semibold">Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {pr.items.map((it, idx) => (
                    <React.Fragment key={it.id}>
                    <tr className="border-t border-border align-top">
                      <td className="px-5 py-3 text-muted text-xs">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <p className="font-semibold">{it.itemName}</p>
                        {(it.itemGroupName || it.itemSubGroupName) && (
                          <p className="text-[11px] text-muted mt-0.5">{[it.itemGroupName, it.itemSubGroupName].filter(Boolean).join(" / ")}</p>
                        )}
                        {it.description && <p className="text-xs text-muted mt-0.5 max-w-md truncate">{it.description}</p>}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">{it.hsnCode ?? "—"}</td>
                      <td className="px-5 py-3 tabular-nums">{quantityScaledToHuman(it.quantityScaled)}</td>
                      <td className="px-5 py-3 font-mono text-xs">{it.uom}</td>
                      <td className="px-5 py-3 tabular-nums">{paiseToINR(it.estimatedUnitPricePaise)}</td>
                      <td className="px-5 py-3 text-xs text-muted">
                        {it.lastPurchaseRatePaise
                          ? <><span className="font-semibold text-text-default">{paiseToINR(it.lastPurchaseRatePaise)}</span><br/>{formatDate(it.lastPurchaseDate)}</>
                          : "—"}
                      </td>
                      <td className="px-5 py-3 tabular-nums font-semibold text-right">{paiseToINR(it.estimatedTotalPaise)}</td>
                      <td className="px-5 py-3 text-xs text-muted">{formatDate(it.expectedDeliveryDate)}</td>
                    </tr>
                    {it.itemNarration && (
                      <tr className="border-t border-border" style={{ background: "var(--surface)" }}>
                        <td />
                        <td colSpan={8} className="px-5 py-2 text-xs">
                          <span className="text-muted font-semibold uppercase tracking-wider text-[10px] mr-2">Remark:</span>
                          {it.itemNarration}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface">
                    <td colSpan={7} className="px-5 py-3 text-right font-semibold text-muted">Estimated total</td>
                    <td className="px-5 py-3 font-bold tabular-nums text-right">{paiseToINR(pr.estimatedTotalPaise)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-5">
          {/* Related POs — shows what got procured against this PR */}
          {relatedPos.length > 0 && (
            <div className="card p-6">
              <SectionHeading title="Related Purchase Orders" size="sm" subtitle={`${relatedPos.length} PO${relatedPos.length === 1 ? "" : "s"} raised against this requisition`} />
              <ul className="space-y-2 mt-3">
                {relatedPos.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/t/${params?.slug}/po/${p.id}`}
                      className="block rounded-xl border border-border p-3 hover:bg-surface transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold">{p.poNumber ?? "Draft PO"}</span>
                        <span className="badge badge-info uppercase text-[10px]">{p.status.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-sm font-medium mt-1 truncate">{p.title}</p>
                      <div className="flex items-center justify-between text-[11px] text-muted mt-1">
                        <span>{p.vendorName}</span>
                        <span className="tabular-nums font-semibold text-text-default">{paiseToINR(p.totalPaise)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-6">
            <SectionHeading title="Timeline" size="sm" />
            {pr.timeline.length === 0 ? (
              <p className="text-sm text-muted">No activity yet. Once submitted, approver actions appear here.</p>
            ) : (
              <ol className="space-y-4">
                {pr.timeline.map((entry, idx) => (
                  <TimelineItem key={entry.id} entry={entry} isLast={idx === pr.timeline.length - 1} />
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      {/* Confirm: submit / cancel */}
      <ConfirmDialog
        open={confirmAction === "submit"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => performAction("submit")}
        title="Send this requisition for approval?"
        description={
          <>
            Submit hone ke baad PR <strong className="text-text-default">edit nahi kar paaoge</strong>.
            Approver review karega — approve hote hi PO banaya ja sakta hai.
          </>
        }
        confirmLabel="Yes, submit"
        tone="primary"
      />
      <ConfirmDialog
        open={confirmAction === "cancel"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => performAction("cancel")}
        title="Cancel this requisition?"
        description={
          <>
            Yeh PR cancelled mark ho jayega — list mein dikhega but koi action allowed nahi hoga.
            Audit trail mein cancellation record rahega.
          </>
        }
        confirmLabel="Yes, cancel"
        tone="danger"
      />

      {/* Approve / Reject / Send Back modal */}
      <Modal
        open={decisionAction !== null}
        onClose={() => !decisionSubmitting && setDecisionAction(null)}
        title={
          decisionAction === "approve" ? "Approve this requisition?" :
          decisionAction === "send_back" ? "Send this requisition back for revision?" :
          "Reject this requisition?"
        }
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDecisionAction(null)} disabled={decisionSubmitting}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${decisionAction === "approve" ? "btn-primary" : decisionAction === "send_back" ? "btn-primary" : "btn-danger"}`}
              onClick={performDecision}
              disabled={decisionSubmitting}
            >
              {decisionSubmitting ? "Working…"
                : decisionAction === "approve" ? "Confirm approval"
                : decisionAction === "send_back" ? "Send back"
                : "Confirm rejection"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div
              className="h-12 w-12 rounded-2xl grid place-items-center shrink-0"
              style={{
                background:
                  decisionAction === "approve" ? "var(--tint-mint)" :
                  decisionAction === "send_back" ? "var(--tint-peach)" :
                  "var(--tint-blush)",
                color:
                  decisionAction === "approve" ? "var(--tint-mint-fg)" :
                  decisionAction === "send_back" ? "var(--tint-peach-fg)" :
                  "var(--tint-blush-fg)",
              }}
            >
              <Icon
                name={decisionAction === "approve" ? "CheckCircle2" : decisionAction === "send_back" ? "Undo2" : "XCircle"}
                size={22}
              />
            </div>
            <div className="flex-1 pt-1 text-sm text-muted leading-relaxed">
              {decisionAction === "approve" && (
                <><strong className="text-text-default">{pr.prNumber}</strong> ko approve kar rahe ho — {paiseToINR(pr.estimatedTotalPaise)} ka spend authorized hoga. Iske baad PO ban sakta hai.</>
              )}
              {decisionAction === "send_back" && (
                <><strong className="text-text-default">{pr.prNumber}</strong> wapas requester ke draft mein chala jayega — woh edit karke resubmit kar sakta hai. Reason batana <strong>mandatory</strong> hai.</>
              )}
              {decisionAction === "reject" && (
                <><strong className="text-text-default">{pr.prNumber}</strong> ko reject kar rahe ho. Requester ko notification chala jayega; reason batana helpful hoga.</>
              )}
            </div>
          </div>
          <div>
            <label className="label">
              Comment{" "}
              {decisionAction === "send_back" && <span className="text-danger">*</span>}
              {decisionAction === "reject" && <span className="text-muted">(recommended)</span>}
            </label>
            <textarea
              className="input"
              rows={3}
              placeholder={
                decisionAction === "approve" ? "Optional approver note..." :
                decisionAction === "send_back" ? "Kya theek karna hai? Specific batao..." :
                "Why is this being rejected?"
              }
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
            />
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
  submit:          { icon: "Send",          tint: "var(--tint-lilac)", tintFg: "var(--tint-lilac-fg)", verb: "submitted" },
  approve:         { icon: "CheckCircle2",  tint: "var(--tint-mint)",  tintFg: "var(--tint-mint-fg)",  verb: "approved" },
  reject:          { icon: "XCircle",       tint: "var(--tint-blush)", tintFg: "var(--tint-blush-fg)", verb: "rejected" },
  request_changes: { icon: "AlertCircle",   tint: "var(--tint-peach)", tintFg: "var(--tint-peach-fg)", verb: "requested changes on" },
  escalate:        { icon: "AlertTriangle", tint: "var(--tint-peach)", tintFg: "var(--tint-peach-fg)", verb: "escalated" },
  cancel:          { icon: "Ban",           tint: "var(--surface)",    tintFg: "var(--muted)",         verb: "cancelled" },
};

function TimelineItem({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  const meta = ACTION_META[entry.action] ?? ACTION_META.submit!;
  return (
    <li className="relative flex gap-3">
      {!isLast && <span className="absolute left-[18px] top-9 bottom-[-12px] w-px bg-border" />}
      <div
        className="h-9 w-9 rounded-xl grid place-items-center shrink-0"
        style={{ background: meta.tint, color: meta.tintFg }}
      >
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
          <div className="mt-2 text-sm rounded-lg p-3 bg-surface border border-border whitespace-pre-wrap">
            {entry.comment}
          </div>
        )}
      </div>
    </li>
  );
}
