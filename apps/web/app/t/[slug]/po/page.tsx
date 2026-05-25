"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { PoStatusBadge } from "@/components/StatusBadge";
import { api, ApiError } from "@/lib/api";
import { paiseToCompactINR, timeAgo, formatDate } from "@/lib/format";

interface PoItem {
  id: string;
  poNumber: string | null;
  title: string;
  status: string;
  vendorId: string;
  vendorName: string;
  prId: string | null;
  totalPaise: string;
  currency: string;
  itemsCount: number;
  createdAt: string;
  deliveryDate: string | null;
}

interface ListResponse { items: PoItem[]; total: number; page: number; pageSize: number; }

const TABS = [
  { key: "all",              label: "All" },
  { key: "draft",            label: "Drafts" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved",         label: "Approved" },
  { key: "sent_to_vendor",   label: "Sent" },
  { key: "partially_received", label: "Partial GRN" },
  { key: "received",         label: "Received" },
  { key: "cancelled",        label: "Cancelled" },
] as const;

export default function PoListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/po`;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (status !== "all") qs.set("status", status);
      const res = await api<ListResponse>(`/api/po?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load POs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Orders sent to vendors — convertible from approved PRs"
      />

      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-4 py-1.5 rounded-pill text-sm font-medium transition ${
              status === t.key ? "bg-primary text-on-dark shadow-sm" : "text-muted hover:bg-surface hover:text-text-default"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <input
            className="input !py-2 !pl-9 !w-64 text-sm"
            placeholder="Search by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" style={{ pointerEvents: "none" }}>
            <Icon name="Search" />
          </span>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-muted">Loading purchase orders…</div>
        ) : !data?.items.length ? (
          <div className="p-12 text-center">
            <div className="h-14 w-14 rounded-2xl mx-auto grid place-items-center bg-tint-peach text-tint-peach-fg mb-4">
              <Icon name="ShoppingCart" size={28} />
            </div>
            <h3 className="display text-xl mb-1">No purchase orders yet</h3>
            <p className="text-sm text-muted">Approve a PR first — then convert it to a PO from its detail page.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">PO #</th>
                <th className="text-left px-5 py-3 font-semibold">Title</th>
                <th className="text-left px-5 py-3 font-semibold">Vendor</th>
                <th className="text-left px-5 py-3 font-semibold">Items</th>
                <th className="text-left px-5 py-3 font-semibold">Total</th>
                <th className="text-left px-5 py-3 font-semibold">Delivery</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((po) => (
                <tr
                  key={po.id}
                  className="border-t border-border hover:bg-surface/50 cursor-pointer select-none"
                  onClick={() => { window.location.href = `${base}/${po.id}`; }}
                >
                  <td className="px-5 py-3 font-mono text-xs">{po.poNumber ?? <span className="text-muted">draft</span>}</td>
                  <td className="px-5 py-3 font-semibold">{po.title}</td>
                  <td className="px-5 py-3 text-muted">{po.vendorName}</td>
                  <td className="px-5 py-3 text-muted">{po.itemsCount}</td>
                  <td className="px-5 py-3 font-semibold tabular-nums">{paiseToCompactINR(po.totalPaise)}</td>
                  <td className="px-5 py-3 text-xs text-muted">{formatDate(po.deliveryDate)}</td>
                  <td className="px-5 py-3"><PoStatusBadge status={po.status} /></td>
                  <td className="px-5 py-3 text-xs text-muted">{timeAgo(po.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.items.length > 0 && (
          <div className="px-5 py-3 border-t border-border text-xs text-muted flex justify-between items-center">
            <span>{data.total} purchase order{data.total === 1 ? "" : "s"} · click row to open</span>
            <span>Page {data.page}</span>
          </div>
        )}
      </div>
    </>
  );
}
