"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeading } from "@/components/SectionHeading";
import { SummaryTiles } from "@/components/inventory/SummaryTiles";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/format";

interface CountLine {
  id: string;
  itemId: string | null;
  itemName: string;
  uom: string;
  systemQty: number;
  countedQty: number;
  varianceQty: number;
  remarks: string | null;
}

interface CountDetail {
  id: string;
  countNumber: string | null;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  companyId: string;
  unitId: string;
  unitName: string;
  countedByName: string;
  remarks: string | null;
  postedAt: string | null;
  createdAt: string;
  lines: CountLine[];
}

const STATUS_META: Record<CountDetail["status"], { label: string; tint: string }> = {
  draft:       { label: "Draft",       tint: "badge-info" },
  in_progress: { label: "In progress", tint: "badge-tint-peach" },
  completed:   { label: "Completed",   tint: "badge-tint-mint" },
  cancelled:   { label: "Cancelled",   tint: "badge-tint-blush" },
};

export default function StockCountDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const slug = params?.slug ?? "";
  const id = params?.id ?? "";
  const base = `/t/${slug}/stock-count`;

  const [count, setCount] = useState<CountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Local edit buffer: itemId -> counted qty string
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<CountDetail>(`/api/stock-counts/${id}`);
      setCount(data);
      const buf: Record<string, string> = {};
      for (const l of data.lines) if (l.itemId) buf[l.itemId] = String(l.countedQty);
      setCounted(buf);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load count");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const editable = count?.status === "draft" || count?.status === "in_progress";

  // Live variance preview from the edit buffer.
  const preview = useMemo(() => {
    if (!count) return { lines: [] as Array<CountLine & { liveCounted: number; liveVariance: number }>, variances: 0, netScaled: 0 };
    let variances = 0;
    let net = 0;
    const lines = count.lines.map((l) => {
      const raw = l.itemId ? counted[l.itemId] : undefined;
      const liveCounted = raw === undefined || raw === "" ? l.countedQty : Number(raw);
      const liveVariance = (Number.isFinite(liveCounted) ? liveCounted : l.countedQty) - l.systemQty;
      if (Math.abs(liveVariance) > 1e-9) variances += 1;
      net += liveVariance;
      return { ...l, liveCounted, liveVariance };
    });
    return { lines, variances, netScaled: net };
  }, [count, counted]);

  async function saveEntries() {
    if (!count || saving) return;
    const lines = count.lines
      .filter((l) => l.itemId)
      .map((l) => ({ itemId: l.itemId as string, countedQty: Number(counted[l.itemId as string] ?? l.countedQty) || 0 }));
    setSaving(true);
    try {
      const data = await api<CountDetail>(`/api/stock-counts/${id}/entries`, {
        method: "PUT",
        body: JSON.stringify({ lines }),
      });
      setCount(data);
      toast.success("Saved", "Counted quantities recorded.");
    } catch (err) {
      toast.error("Could not save", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setSaving(false);
    }
  }

  async function post() {
    if (!count || posting) return;
    if (!confirm("Post this count? Variances will be written to the stock ledger as adjustments and the count will be locked.")) return;
    setPosting(true);
    try {
      // Persist any unsaved edits first, then post.
      await saveEntries();
      const res = await api<{ adjustmentsPosted: number }>(`/api/stock-counts/${id}/post`, { method: "POST" });
      toast.success("Count posted", `${res.adjustmentsPosted} adjustment${res.adjustmentsPosted === 1 ? "" : "s"} written to the ledger.`);
      void load();
    } catch (err) {
      toast.error("Could not post", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setPosting(false);
    }
  }

  async function cancel() {
    if (!count) return;
    if (!confirm("Cancel this count? It will be marked cancelled and locked.")) return;
    try {
      await api(`/api/stock-counts/${id}/cancel`, { method: "POST" });
      toast.success("Count cancelled");
      void load();
    } catch (err) {
      toast.error("Could not cancel", err instanceof ApiError ? err.message : "Try again");
    }
  }

  if (loading && !count) return <div className="p-6 text-center text-xs text-muted">Loading…</div>;
  if (error) return (
    <>
      <Link href={base} className="text-[11px] text-muted hover:text-text-default">← Back</Link>
      <div className="mt-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs">{error}</div>
    </>
  );
  if (!count) return null;

  const meta = STATUS_META[count.status];

  return (
    <>
      <div className="flex items-center gap-2 mb-2 text-[11px] text-muted">
        <Link href={base} className="hover:text-text-default">Cycle Counts</Link>
        <Icon name="ChevronRight" size={12} />
        <span className="text-text-default font-medium font-mono">{count.countNumber ?? "Count"}</span>
      </div>

      <PageHeader
        title={count.countNumber ?? "Cycle count"}
        subtitle={
          <>
            {count.unitName} · by {count.countedByName} · {formatDateTime(count.createdAt)}
            {count.postedAt && <> · posted {formatDateTime(count.postedAt)}</>}
          </>
        }
        actions={
          <div className="flex items-center gap-1.5">
            <span className={`badge ${meta.tint} text-[11px]`}>{meta.label}</span>
            {editable && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={cancel}>Cancel count</button>
                <button className="btn btn-ghost btn-sm" onClick={saveEntries} disabled={saving}>
                  <Icon name="Save" size={14} /> {saving ? "Saving…" : "Save"}
                </button>
                <button className="btn btn-primary btn-sm" onClick={post} disabled={posting}>
                  <Icon name="CheckCircle2" size={14} /> {posting ? "Posting…" : "Post adjustments"}
                </button>
              </>
            )}
          </div>
        }
      />

      <SummaryTiles
        tiles={[
          { label: "Lines", value: String(count.lines.length), icon: "List" },
          { label: "With variance", value: String(preview.variances), icon: "AlertTriangle", tone: preview.variances > 0 ? "text-danger-fg" : undefined },
          { label: "Net variance", value: preview.netScaled.toLocaleString("en-IN", { maximumFractionDigits: 3 }), icon: "Scale", tone: preview.netScaled < 0 ? "text-danger-fg" : preview.netScaled > 0 ? "text-success-fg" : undefined },
          { label: "Status", value: meta.label, icon: "ClipboardCheck" },
        ]}
      />

      <div className="card overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <SectionHeading title="Count sheet" size="sm" subtitle={editable ? "Enter the physically counted quantity per item; variance is computed live." : "This count is locked."} />
        </div>
        {count.lines.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted">No stock positions to count in this warehouse.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Item</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">UOM</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">System</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Counted</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Variance</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-medium">{l.itemName}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{l.uom}</td>
                  <td className="px-3 py-1.5 tabular-nums text-right text-muted">{l.systemQty.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</td>
                  <td className="px-3 py-1.5 text-right">
                    {editable && l.itemId ? (
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        className="input tabular-nums text-right !py-1 w-28 ml-auto"
                        value={counted[l.itemId] ?? ""}
                        onChange={(e) => setCounted((s) => ({ ...s, [l.itemId as string]: e.target.value }))}
                      />
                    ) : (
                      <span className="tabular-nums">{l.countedQty.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</span>
                    )}
                  </td>
                  <td className={`px-3 py-1.5 tabular-nums text-right font-semibold ${l.liveVariance < 0 ? "text-danger-fg" : l.liveVariance > 0 ? "text-success-fg" : "text-muted"}`}>
                    {l.liveVariance > 0 ? "+" : ""}{l.liveVariance.toLocaleString("en-IN", { maximumFractionDigits: 3 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {count.remarks && <p className="text-[11px] text-muted mt-3">Remarks: {count.remarks}</p>}
    </>
  );
}
