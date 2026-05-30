"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { PrStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { api, ApiError } from "@/lib/api";
import { paiseToINR, paiseToCompactINR, formatDateTime } from "@/lib/format";

type ReportTab = "pr-aging" | "vendor-spend" | "top-items";

interface PrAgingRow {
  id: string;
  prNumber: string | null;
  title: string;
  status: string;
  priority: string;
  requesterName: string;
  estimatedTotalPaise: string;
  submittedAt: string | null;
  daysPending: number;
}

interface VendorSpendRow {
  vendorId: string;
  vendorName: string;
  vendorCode: string | null;
  gstin: string | null;
  poCount: number;
  totalPaise: string;
  openCount: number;
  closedCount: number;
}

interface TopItemRow {
  itemName: string;
  itemGroupName: string | null;
  hsnCode: string | null;
  uom: string;
  qty: number;
  totalPaise: string;
  lineCount: number;
}

const TABS: Array<{ key: ReportTab; label: string; icon: "Clock" | "Users" | "Package" }> = [
  { key: "pr-aging",     label: "PR Aging",        icon: "Clock" },
  { key: "vendor-spend", label: "Vendor Spend",    icon: "Users" },
  { key: "top-items",    label: "Top Items",       icon: "Package" },
];

export default function ReportsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [tab, setTab] = useState<ReportTab>("pr-aging");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prAging, setPrAging] = useState<PrAgingRow[]>([]);
  const [vendorSpend, setVendorSpend] = useState<VendorSpendRow[]>([]);
  const [topItems, setTopItems] = useState<TopItemRow[]>([]);

  async function loadTab(t: ReportTab) {
    setLoading(true);
    setError(null);
    try {
      if (t === "pr-aging") setPrAging(await api<PrAgingRow[]>("/api/dashboard/reports/pr-aging"));
      else if (t === "vendor-spend") setVendorSpend(await api<VendorSpendRow[]>("/api/dashboard/reports/vendor-spend"));
      else if (t === "top-items") setTopItems(await api<TopItemRow[]>("/api/dashboard/reports/top-items?limit=50"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTab(tab); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Procurement insights — aging, spend, item-wise consumption"
        actions={
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => window.print()}
            title="Print / Save as PDF"
          >
            <Icon name="Printer" size={14} /> Print
          </button>
        }
      />

      {/* Tab strip */}
      <div className="flex items-center gap-1 mb-3 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-3 py-1.5 text-[12px] font-medium flex items-center gap-1.5 transition ${
                active ? "text-text-default" : "text-muted hover:text-text-default"
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5" style={{ background: "var(--primary)" }} />
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* PR Aging */}
      {tab === "pr-aging" && (
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-xs text-muted">Loading…</div>
          ) : prAging.length === 0 ? (
            <div className="p-8 text-center">
              <Icon name="CircleCheckBig" size={20} className="mx-auto mb-1.5 text-muted" />
              <p className="text-xs text-muted">No pending requisitions — inbox zero.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-surface">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">PR #</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Title</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Requester</th>
                  <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Amount</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Priority</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Status</th>
                  <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Days pending</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {prAging.map((r) => {
                  const days = Math.floor(r.daysPending);
                  const tone =
                    days >= 5 ? "text-danger-fg font-semibold" :
                    days >= 2 ? "text-warning-fg font-medium" :
                    "text-text-default";
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-border hover:bg-surface/60 cursor-pointer"
                      onClick={() => { window.location.href = `/t/${slug}/pr/${r.id}`; }}
                    >
                      <td className="px-3 py-1.5 font-mono text-[11px]">{r.prNumber ?? "—"}</td>
                      <td className="px-3 py-1.5 font-medium max-w-xs truncate">{r.title}</td>
                      <td className="px-3 py-1.5 text-muted">{r.requesterName}</td>
                      <td className="px-3 py-1.5 tabular-nums text-right">{paiseToINR(r.estimatedTotalPaise)}</td>
                      <td className="px-3 py-1.5"><PriorityBadge priority={r.priority} /></td>
                      <td className="px-3 py-1.5"><PrStatusBadge status={r.status} /></td>
                      <td className={`px-3 py-1.5 tabular-nums text-right ${tone}`}>{days}</td>
                      <td className="px-3 py-1.5 text-[11px] text-muted">{r.submittedAt ? formatDateTime(r.submittedAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface">
                  <td colSpan={3} className="px-3 py-1.5 font-medium">{prAging.length} requisitions</td>
                  <td className="px-3 py-1.5 tabular-nums text-right font-semibold">
                    {paiseToINR(prAging.reduce((s, r) => s + Number(r.estimatedTotalPaise), 0).toString())}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Vendor Spend */}
      {tab === "vendor-spend" && (
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-xs text-muted">Loading…</div>
          ) : vendorSpend.length === 0 ? (
            <div className="p-8 text-center">
              <Icon name="Users" size={20} className="mx-auto mb-1.5 text-muted" />
              <p className="text-xs text-muted">No PO data yet. Approve some POs to see vendor spend.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-surface">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">#</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Vendor</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Code</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">GSTIN</th>
                  <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">POs</th>
                  <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Open</th>
                  <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Closed</th>
                  <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Total spend</th>
                </tr>
              </thead>
              <tbody>
                {vendorSpend.map((v, i) => (
                  <tr key={v.vendorId} className="border-t border-border hover:bg-surface/60">
                    <td className="px-3 py-1.5 text-muted tabular-nums text-[11px]">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{v.vendorName}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{v.vendorCode ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{v.gstin ?? "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right font-semibold">{v.poCount}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-muted">{v.openCount}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-muted">{v.closedCount}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right font-bold">{paiseToINR(v.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface">
                  <td colSpan={4} className="px-3 py-1.5 font-medium">{vendorSpend.length} vendors</td>
                  <td className="px-3 py-1.5 tabular-nums text-right">
                    {vendorSpend.reduce((s, v) => s + v.poCount, 0)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-right">
                    {vendorSpend.reduce((s, v) => s + v.openCount, 0)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-right">
                    {vendorSpend.reduce((s, v) => s + v.closedCount, 0)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-right font-bold">
                    {paiseToINR(vendorSpend.reduce((s, v) => s + Number(v.totalPaise), 0).toString())}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Top Items */}
      {tab === "top-items" && (
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-xs text-muted">Loading…</div>
          ) : topItems.length === 0 ? (
            <div className="p-8 text-center">
              <Icon name="Package" size={20} className="mx-auto mb-1.5 text-muted" />
              <p className="text-xs text-muted">No purchased items yet.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-surface">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">#</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Item</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Group</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">HSN</th>
                  <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Lines</th>
                  <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Qty</th>
                  <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">UOM</th>
                  <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Total value</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((it, i) => (
                  <tr key={`${it.itemName}-${i}`} className="border-t border-border hover:bg-surface/60">
                    <td className="px-3 py-1.5 text-muted tabular-nums text-[11px]">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium max-w-sm truncate" title={it.itemName}>{it.itemName}</td>
                    <td className="px-3 py-1.5 text-muted text-[11px]">{it.itemGroupName ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{it.hsnCode ?? "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-muted">{it.lineCount}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right font-semibold">{it.qty.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{it.uom}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right font-bold">{paiseToINR(it.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface">
                  <td colSpan={4} className="px-3 py-1.5 font-medium">Top {topItems.length} items</td>
                  <td className="px-3 py-1.5 tabular-nums text-right">
                    {topItems.reduce((s, i) => s + i.lineCount, 0)}
                  </td>
                  <td colSpan={2} />
                  <td className="px-3 py-1.5 tabular-nums text-right font-bold">
                    {paiseToINR(topItems.reduce((s, i) => s + Number(i.totalPaise), 0).toString())}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </>
  );
}
