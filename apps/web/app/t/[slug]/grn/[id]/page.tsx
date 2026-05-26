"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, quantityScaledToHuman, formatDate, timeAgo } from "@/lib/format";

interface GrnItem {
  id: string;
  itemName: string;
  uom: string;
  orderedQuantityScaled: number;
  receivedQuantityScaled: number;
  acceptedQuantityScaled: number;
  rejectedQuantityScaled: number;
  unitPricePaise: string;
  condition: string;
  remarks: string | null;
  batchNumber: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
}
interface GrnDetail {
  id: string;
  grnNumber: string | null;
  status: string;
  poId: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceAmountPaise: string | null;
  receivedDate: string;
  remarks: string | null;
  createdAt: string;
  items: GrnItem[];
  vendor?: { id: string; name: string; gstin: string | null };
  po?: { id: string; poNumber: string | null; title: string; status: string };
  receivedBy?: { id: string; fullName: string };
}

const STATUS_TINT: Record<string, string> = {
  draft: "badge-tint-lilac",
  submitted: "badge-info",
  qc_pending: "badge-warning",
  accepted: "badge-success",
  partially_accepted: "badge-tint-peach",
  rejected: "badge-danger",
  cancelled: "badge-tint-blush",
};
const COND_TINT: Record<string, string> = {
  good: "badge-success",
  damaged: "badge-danger",
  shortage: "badge-warning",
  excess: "badge-tint-lilac",
};

export default function GrnDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const base = `/t/${params?.slug ?? ""}/grn`;

  const [grn, setGrn] = useState<GrnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<GrnDetail>(`/api/grn/${params?.id}`);
      setGrn(data);
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
    if (!grn) return;
    try {
      await api(`/api/grn/${grn.id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      toast.success("GRN cancelled", "PO status recalculated automatically.");
      setConfirmCancel(false);
      load();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Try again");
    }
  }

  if (loading && !grn) return <div className="p-12 text-center text-muted">Loading…</div>;
  if (error) return <>
    <Link href={base} className="text-sm text-muted hover:text-text-default">← Back</Link>
    <div className="mt-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>
  </>;
  if (!grn) return null;

  const totalReceiptValue = grn.items.reduce(
    (s, it) => s + (it.acceptedQuantityScaled / 1000) * Number(it.unitPricePaise),
    0,
  );

  return (
    <>
      <div className="flex items-center gap-3 mb-3 text-sm text-muted">
        <Link href={base} className="hover:text-text-default">GRN</Link>
        <Icon name="ChevronRight" size={14} />
        <span className="text-text-default font-medium">{grn.grnNumber}</span>
      </div>

      <PageHeader
        title={grn.grnNumber ?? "GRN"}
        subtitle={`Receipt against ${grn.po?.poNumber ?? "PO"} from ${grn.vendor?.name ?? "vendor"}`}
        actions={
          grn.status !== "cancelled" ? (
            <button className="h-10 w-10 rounded-pill border border-border grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => setConfirmCancel(true)} title="Cancel">
              <Icon name="Trash2" size={16} />
            </button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
              <Meta label="Status"><span className={`badge ${STATUS_TINT[grn.status]} capitalize`}>{grn.status.replace("_", " ")}</span></Meta>
              <Meta label="Receipt value" valueClass="display text-lg !mt-0">{paiseToINR(totalReceiptValue)}</Meta>
              <Meta label="Received on">{formatDate(grn.receivedDate)}</Meta>
              <Meta label="Recorded by">{grn.receivedBy?.fullName ?? "—"}</Meta>
              <Meta label="PO">
                {grn.po
                  ? <Link href={`/t/${params?.slug}/po/${grn.po.id}`} className="text-primary font-medium hover:underline">{grn.po.poNumber}</Link>
                  : "—"}
              </Meta>
              <Meta label="Vendor">{grn.vendor?.name ?? "—"}</Meta>
              <Meta label="Invoice no.">{grn.invoiceNumber ?? "—"}</Meta>
              <Meta label="Invoice date">{formatDate(grn.invoiceDate)}</Meta>
            </div>
            {grn.remarks && (
              <div className="mt-5 pt-5 border-t border-border">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Remarks</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{grn.remarks}</p>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Items received</p>
            </div>
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold w-12">#</th>
                  <th className="text-left px-5 py-3 font-semibold">Item</th>
                  <th className="text-left px-5 py-3 font-semibold">Ordered</th>
                  <th className="text-left px-5 py-3 font-semibold">Received</th>
                  <th className="text-left px-5 py-3 font-semibold">Accepted</th>
                  <th className="text-left px-5 py-3 font-semibold">Rejected</th>
                  <th className="text-left px-5 py-3 font-semibold">Condition</th>
                </tr>
              </thead>
              <tbody>
                {grn.items.map((it, idx) => {
                  const hasBatch = !!(it.batchNumber || it.mfgDate || it.expiryDate);
                  return (
                  <React.Fragment key={it.id}>
                    <tr className="border-t border-border align-top">
                      <td className="px-5 py-3 text-muted text-xs">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <p className="font-semibold">{it.itemName}</p>
                        <p className="text-[11px] text-muted">UOM: <span className="font-mono">{it.uom}</span></p>
                      </td>
                      <td className="px-5 py-3 tabular-nums text-muted">{quantityScaledToHuman(it.orderedQuantityScaled)}</td>
                      <td className="px-5 py-3 tabular-nums">{quantityScaledToHuman(it.receivedQuantityScaled)}</td>
                      <td className="px-5 py-3 tabular-nums font-semibold">{quantityScaledToHuman(it.acceptedQuantityScaled)}</td>
                      <td className="px-5 py-3 tabular-nums">{it.rejectedQuantityScaled > 0 ? quantityScaledToHuman(it.rejectedQuantityScaled) : <span className="text-muted">—</span>}</td>
                      <td className="px-5 py-3"><span className={`badge ${COND_TINT[it.condition] ?? "badge-info"} capitalize`}>{it.condition}</span></td>
                    </tr>
                    {hasBatch && (
                      <tr className="border-t border-border" style={{ background: "var(--surface)" }}>
                        <td />
                        <td colSpan={6} className="px-5 py-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted font-semibold uppercase tracking-wider text-[10px] mr-1">Batch:</span>
                            {it.batchNumber && <span className="badge badge-info text-[10px] font-mono">#{it.batchNumber}</span>}
                            {it.mfgDate && <span className="badge badge-tint-mint text-[10px]">Mfg {formatDate(it.mfgDate)}</span>}
                            {it.expiryDate && <span className="badge badge-tint-peach text-[10px]">Expiry {formatDate(it.expiryDate)}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          {grn.po && (
            <div className="card p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">Source PO</p>
              <p className="font-semibold">{grn.po.poNumber}</p>
              <p className="text-sm text-muted mt-1">{grn.po.title}</p>
              <Link href={`/t/${params?.slug}/po/${grn.po.id}`} className="btn btn-ghost btn-sm mt-3">
                <Icon name="ArrowRight" /> View PO
              </Link>
            </div>
          )}
          {grn.vendor && (
            <div className="card p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">Vendor</p>
              <p className="font-semibold">{grn.vendor.name}</p>
              {grn.vendor.gstin && <p className="font-mono text-xs text-muted mt-1">GST: {grn.vendor.gstin}</p>}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
        title="Cancel this GRN?"
        description="PO ka received quantity recalculate ho jayega. Audit log mein record rahega."
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
