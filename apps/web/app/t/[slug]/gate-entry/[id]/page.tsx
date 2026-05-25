"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { quantityScaledToHuman, formatDateTime, formatDate, timeAgo } from "@/lib/format";

interface GateItem { id: string; itemName: string; description: string | null; quantityScaled: number; uom: string; notes: string | null; }
interface GateDetail {
  id: string;
  gateEntryNumber: string | null;
  type: string;
  status: string;
  vendorId: string | null;
  poId: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  remarks: string | null;
  gateInAt: string;
  gateOutAt: string | null;
  createdAt: string;
  items: GateItem[];
  vendor?: { id: string; name: string };
  creator?: { id: string; fullName: string };
  po?: { id: string; poNumber: string | null; title: string };
}

const TYPE_TINT: Record<string, string> = {
  inward: "badge-tint-mint",
  outward: "badge-tint-peach",
  service: "badge-tint-lilac",
};
const STATUS_TINT: Record<string, string> = {
  open: "badge-info",
  closed: "badge-success",
  cancelled: "badge-tint-blush",
};

export default function GateEntryDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const base = `/t/${params?.slug ?? ""}/gate-entry`;

  const [ge, setGe] = useState<GateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"close" | "cancel" | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api<GateDetail>(`/api/gate-entry/${params?.id}`);
      setGe(data);
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

  async function performAction(action: "close" | "cancel") {
    if (!ge) return;
    try {
      await api(`/api/gate-entry/${ge.id}/${action}`, { method: "POST", body: JSON.stringify({}) });
      toast.success(
        action === "close" ? "Gate entry closed" : "Gate entry cancelled",
        action === "close" ? "Gate-out time recorded — entry archived." : "Entry marked cancelled.",
      );
      setConfirmAction(null);
      load();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Try again");
    }
  }

  if (loading && !ge) return <div className="p-12 text-center text-muted">Loading…</div>;
  if (error) return <>
    <Link href={base} className="text-sm text-muted hover:text-text-default">← Back</Link>
    <div className="mt-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>
  </>;
  if (!ge) return null;

  return (
    <>
      <div className="flex items-center gap-3 mb-3 text-sm text-muted">
        <Link href={base} className="hover:text-text-default">Gate Entries</Link>
        <Icon name="ChevronRight" size={14} />
        <span className="text-text-default font-medium">{ge.gateEntryNumber}</span>
      </div>

      <PageHeader
        title={ge.gateEntryNumber ?? "Gate entry"}
        subtitle={`${ge.type} · ${ge.vehicleNumber ?? "no vehicle"} · ${ge.vendor?.name ?? "no vendor"}`}
        actions={
          <>
            {ge.po && (
              <Link href={`/t/${params?.slug}/grn/new?fromPo=${ge.po.id}&gateEntryId=${ge.id}`} className="btn btn-primary">
                <Icon name="PackageCheck" /> Receive (GRN)
              </Link>
            )}
            {ge.status === "open" && (
              <button className="btn btn-primary" onClick={() => setConfirmAction("close")}>
                <Icon name="DoorClosed" /> Close entry
              </button>
            )}
            {ge.status === "open" && (
              <button className="h-10 w-10 rounded-pill border border-border grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => setConfirmAction("cancel")} title="Cancel">
                <Icon name="Trash2" size={16} />
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 text-sm">
              <Meta label="Type"><span className={`badge ${TYPE_TINT[ge.type]} capitalize`}>{ge.type}</span></Meta>
              <Meta label="Status"><span className={`badge ${STATUS_TINT[ge.status]} capitalize`}>{ge.status}</span></Meta>
              <Meta label="Vehicle">{ge.vehicleNumber ?? "—"}</Meta>
              <Meta label="Vendor">{ge.vendor?.name ?? "—"}</Meta>
              <Meta label="Linked PO">
                {ge.po
                  ? <Link href={`/t/${params?.slug}/po/${ge.po.id}`} className="text-primary font-medium hover:underline">{ge.po.poNumber}</Link>
                  : "—"}
              </Meta>
              <Meta label="Invoice">{ge.invoiceNumber ?? "—"}{ge.invoiceDate && <span className="text-muted text-xs"> · {formatDate(ge.invoiceDate)}</span>}</Meta>
              <Meta label="Driver">{ge.driverName ?? "—"}</Meta>
              <Meta label="Phone">{ge.driverPhone ?? "—"}</Meta>
              <Meta label="Gate-in">{formatDateTime(ge.gateInAt)}</Meta>
              <Meta label="Gate-out">{ge.gateOutAt ? formatDateTime(ge.gateOutAt) : <span className="text-muted">still inside</span>}</Meta>
              <Meta label="Recorded by">{ge.creator?.fullName ?? "—"}</Meta>
              <Meta label="Time at gate">{ge.gateOutAt ? duration(ge.gateInAt, ge.gateOutAt) : timeAgo(ge.gateInAt)}</Meta>
            </div>
            {ge.remarks && (
              <div className="mt-5 pt-5 border-t border-border">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Remarks</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{ge.remarks}</p>
              </div>
            )}
          </div>

          {ge.items.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Materials at gate</p>
              </div>
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold w-12">#</th>
                    <th className="text-left px-5 py-3 font-semibold">Item</th>
                    <th className="text-left px-5 py-3 font-semibold">Qty</th>
                    <th className="text-left px-5 py-3 font-semibold">UOM</th>
                  </tr>
                </thead>
                <tbody>
                  {ge.items.map((it, idx) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-5 py-3 text-muted text-xs">{idx + 1}</td>
                      <td className="px-5 py-3 font-semibold">{it.itemName}</td>
                      <td className="px-5 py-3 tabular-nums">{quantityScaledToHuman(it.quantityScaled)}</td>
                      <td className="px-5 py-3 font-mono text-xs">{it.uom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction === "close"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => performAction("close")}
        title="Close this gate entry?"
        description="Gate-out timestamp record ho jayega. Closed entries can't be reopened."
        confirmLabel="Close entry"
        tone="success"
      />
      <ConfirmDialog
        open={confirmAction === "cancel"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => performAction("cancel")}
        title="Cancel this gate entry?"
        description="Cancelled status mark hoga — audit trail mein reh jayega."
        confirmLabel="Yes, cancel"
        tone="danger"
      />
    </>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-1.5 text-sm font-medium">{children}</div>
    </div>
  );
}

function duration(start: string, end: string): string {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const mins = Math.floor((e - s) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
