"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { RfqStatusBadge } from "@/components/rfq/RfqStatusBadge";
import { QuoteCompareTable, type CompareData } from "@/components/rfq/QuoteCompareTable";
import { InviteVendorsModal } from "@/components/rfq/InviteVendorsModal";
import { RecordQuoteModal } from "@/components/rfq/RecordQuoteModal";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, formatDate, formatDateTime } from "@/lib/format";

interface RfqVendor {
  vendorId: string;
  vendorName: string;
  vendorEmail: string | null;
  invitedAt: string | null;
  hasQuoted: boolean;
  responseStatus: string | null;
  responseTotalPaise: string | null;
  responseSubmittedAt: string | null;
  viaPortal: boolean;
}
interface RfqItem {
  id: string;
  itemName: string;
  description: string | null;
  quantity: number;
  uom: string;
}
interface RfqDetail {
  id: string;
  rfqNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  createdByName: string;
  awardedVendorId: string | null;
  awardedPoId: string | null;
  awardedAt: string | null;
  createdAt: string;
  items: RfqItem[];
  vendors: RfqVendor[];
}

export default function RfqDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const router = useRouter();
  const slug = params?.slug ?? "";
  const id = params?.id ?? "";
  const base = `/t/${slug}/rfq`;

  const [rfq, setRfq] = useState<RfqDetail | null>(null);
  const [compare, setCompare] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [quoteVendor, setQuoteVendor] = useState<{ id: string; name: string } | null>(null);
  const [awardingVendorId, setAwardingVendorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        api<RfqDetail>(`/api/rfq/${id}`),
        api<CompareData>(`/api/rfq/${id}/compare`),
      ]);
      setRfq(r);
      setCompare(c);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load RFQ");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function award(vendorId: string) {
    if (awardingVendorId) return;
    if (!confirm("Award this RFQ to the selected vendor? This creates a draft PO from their quote.")) return;
    setAwardingVendorId(vendorId);
    try {
      const res = await api<{ poId: string; vendorName: string }>(`/api/rfq/${id}/award`, {
        method: "POST",
        body: JSON.stringify({ vendorId }),
      });
      toast.success(`Awarded to ${res.vendorName}`, "A draft PO was created — opening it now");
      router.push(`/t/${slug}/po/${res.poId}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't award RFQ");
      setAwardingVendorId(null);
    }
  }

  async function changeStatus(action: "close" | "cancel") {
    const verb = action === "close" ? "close" : "cancel";
    if (!confirm(`Are you sure you want to ${verb} this RFQ?`)) return;
    setBusy(true);
    try {
      await api(`/api/rfq/${id}/${action}`, { method: "POST" });
      toast.success(`RFQ ${action === "close" ? "closed" : "cancelled"}`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Couldn't ${verb} RFQ`);
    } finally {
      setBusy(false);
    }
  }

  async function copyPortalLink(vendorId: string, vendorName: string) {
    try {
      const res = await api<{ url: string }>(`/api/rfq/portal-access/issue`, {
        method: "POST",
        body: JSON.stringify({ vendorId }),
      });
      try {
        await navigator.clipboard.writeText(res.url);
        toast.success("Portal link copied", `Share it with ${vendorName}`);
      } catch {
        toast.info("Portal link", res.url);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create portal link");
    }
  }

  if (loading) {
    return <div className="card p-10 text-center text-xs text-muted">Loading RFQ…</div>;
  }
  if (error || !rfq) {
    return (
      <div className="card p-10 text-center">
        <Icon name="TriangleAlert" size={20} className="mx-auto mb-2 text-muted" />
        <p className="text-[13px]">{error ?? "RFQ not found"}</p>
        <Link href={base} className="btn btn-ghost btn-sm mt-3"><Icon name="ArrowLeft" size={14} /> Back to RFQs</Link>
      </div>
    );
  }

  const canManage = !["awarded", "cancelled"].includes(rfq.status);
  const canAward = ["sent", "closed"].includes(rfq.status);

  return (
    <>
      <PageHeader
        title={rfq.title}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="font-mono text-[11px]">{rfq.rfqNumber ?? "draft"}</span>
            <RfqStatusBadge status={rfq.status} />
          </span>
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Link href={base} className="btn btn-ghost btn-sm"><Icon name="ArrowLeft" size={14} /> Back</Link>
            {canManage && (
              <button className="btn btn-ghost btn-sm" onClick={() => setInviteOpen(true)}>
                <Icon name="UserPlus" size={14} /> Invite vendors
              </button>
            )}
            {canManage && rfq.status !== "draft" && (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => changeStatus("close")}>
                <Icon name="Lock" size={14} /> Close
              </button>
            )}
            {canManage && (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => changeStatus("cancel")}>
                <Icon name="Ban" size={14} /> Cancel
              </button>
            )}
          </div>
        }
      />

      {rfq.awardedPoId && (
        <div className="mb-4 card p-3 flex items-center gap-2.5" style={{ background: "var(--success-bg)" }}>
          <Icon name="Award" size={16} style={{ color: "var(--success)" }} />
          <span className="text-[12.5px] flex-1">
            This RFQ was awarded{rfq.awardedAt ? ` on ${formatDate(rfq.awardedAt)}` : ""}. A draft purchase order was created.
          </span>
          <Link href={`/t/${slug}/po/${rfq.awardedPoId}`} className="btn btn-primary btn-sm">
            View PO <Icon name="ArrowRight" size={13} />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: meta + items */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2.5">Details</h3>
            <dl className="space-y-2 text-[12.5px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Due date</dt>
                <dd>{formatDate(rfq.dueDate)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Created by</dt>
                <dd>{rfq.createdByName}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Created</dt>
                <dd>{formatDate(rfq.createdAt)}</dd>
              </div>
            </dl>
            {rfq.description && (
              <p className="text-[12px] text-muted mt-3 pt-3 border-t border-border leading-relaxed whitespace-pre-wrap">{rfq.description}</p>
            )}
          </div>

          <div className="card p-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2.5">
              Items <span className="text-muted">({rfq.items.length})</span>
            </h3>
            <ul className="space-y-2">
              {rfq.items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-2 text-[12.5px]">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{it.itemName}</div>
                    {it.description && <div className="text-[11px] text-muted truncate">{it.description}</div>}
                  </div>
                  <div className="text-muted whitespace-nowrap tabular-nums">{it.quantity} {it.uom}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right: vendors + comparison */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2.5">
              Invited vendors <span className="text-muted">({rfq.vendors.length})</span>
            </h3>
            {!rfq.vendors.length ? (
              <p className="text-[12px] text-muted py-2">
                No vendors invited yet.{" "}
                {canManage && <button className="text-primary hover:underline" onClick={() => setInviteOpen(true)}>Invite some</button>}
              </p>
            ) : (
              <ul className="divide-y divide-border -my-1">
                {rfq.vendors.map((v) => (
                  <li key={v.vendorId} className="py-2.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium truncate flex items-center gap-1.5">
                        {v.vendorName}
                        {v.vendorId === rfq.awardedVendorId && <span className="badge badge-success text-[10px]">Awarded</span>}
                      </div>
                      <div className="text-[11px] text-muted">
                        {v.hasQuoted ? (
                          <span className="flex items-center gap-1">
                            <Icon name="CircleCheckBig" size={11} style={{ color: "var(--success)" }} />
                            Quoted {paiseToINR(v.responseTotalPaise)}
                            {v.viaPortal && " · via portal"}
                            {v.responseSubmittedAt && ` · ${formatDateTime(v.responseSubmittedAt)}`}
                          </span>
                        ) : (
                          <span>Awaiting quote</span>
                        )}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" title="Copy vendor portal link" onClick={() => copyPortalLink(v.vendorId, v.vendorName)}>
                      <Icon name="Link" size={13} /> Link
                    </button>
                    {canManage && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setQuoteVendor({ id: v.vendorId, name: v.vendorName })}>
                        <Icon name="Pencil" size={13} /> Quote
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2 px-1">Quote comparison</h3>
            {compare && (
              <QuoteCompareTable
                data={compare}
                canAward={canAward}
                awardingVendorId={awardingVendorId}
                onAward={award}
              />
            )}
          </div>
        </div>
      </div>

      {inviteOpen && (
        <InviteVendorsModal
          rfqId={rfq.id}
          alreadyInvited={rfq.vendors.map((v) => v.vendorId)}
          onClose={() => setInviteOpen(false)}
          onInvited={load}
        />
      )}
      {quoteVendor && (
        <RecordQuoteModal
          rfqId={rfq.id}
          vendor={quoteVendor}
          items={rfq.items.map((it) => ({ id: it.id, itemName: it.itemName, quantity: it.quantity, uom: it.uom }))}
          onClose={() => setQuoteVendor(null)}
          onSaved={load}
        />
      )}
    </>
  );
}
