"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api, ApiError } from "@/lib/api";
import { paiseToINR, formatDate, timeAgo } from "@/lib/format";
import type { GrnListItem } from "@indus/shared";

interface ListResponse { items: GrnListItem[]; total: number; page: number; pageSize: number; }

const STATUS_TINT: Record<string, string> = {
  draft: "badge-tint-lilac",
  submitted: "badge-info",
  qc_pending: "badge-warning",
  accepted: "badge-success",
  partially_accepted: "badge-tint-peach",
  rejected: "badge-danger",
  cancelled: "badge-tint-blush",
};

export default function GrnListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/grn`;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api<ListResponse>(`/api/grn`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        title="Goods Receipt Notes"
        subtitle="Materials received against POs — accepted, rejected, and condition tracking"
        actions={
          <p className="text-xs text-muted">
            Tip: GRNs are created from a PO's detail page or a Gate Entry.
          </p>
        }
      />

      {error && <div className="mb-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-muted">Loading…</div>
        ) : !data?.items.length ? (
          <div className="p-12 text-center">
            <div className="h-14 w-14 rounded-2xl mx-auto grid place-items-center bg-tint-peach text-tint-peach-fg mb-4">
              <Icon name="PackageCheck" size={28} />
            </div>
            <h3 className="display text-xl mb-1">No goods receipts yet</h3>
            <p className="text-sm text-muted">Approve a PO, send it to vendor, then open the PO and click "Receive (GRN)".</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">GRN #</th>
                <th className="text-left px-5 py-3 font-semibold">PO</th>
                <th className="text-left px-5 py-3 font-semibold">Vendor</th>
                <th className="text-left px-5 py-3 font-semibold">Invoice</th>
                <th className="text-left px-5 py-3 font-semibold">Amount</th>
                <th className="text-left px-5 py-3 font-semibold">Received</th>
                <th className="text-left px-5 py-3 font-semibold">Items</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((g) => (
                <tr
                  key={g.id}
                  className="border-t border-border hover:bg-surface/50 cursor-pointer select-none"
                  onClick={() => { window.location.href = `${base}/${g.id}`; }}
                >
                  <td className="px-5 py-3 font-mono text-xs">{g.grnNumber ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs">{g.poNumber ?? "—"}</td>
                  <td className="px-5 py-3">{g.vendorName ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs">{g.invoiceNumber ?? "—"}</td>
                  <td className="px-5 py-3 tabular-nums font-semibold">{paiseToINR(g.invoiceAmountPaise)}</td>
                  <td className="px-5 py-3 text-xs">{formatDate(g.receivedDate)}</td>
                  <td className="px-5 py-3 text-muted">{g.itemsCount}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${STATUS_TINT[g.status]} capitalize`}>{g.status.replace("_", " ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
