"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { PoStatusBadge } from "@/components/StatusBadge";
import { StatusTabs, SkeletonRows, EmptyState, FilterBar } from "@/components/ListPrimitives";
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

type StatusKey =
  | "all" | "draft" | "pending_approval" | "approved"
  | "sent_to_vendor" | "partially_received" | "received" | "cancelled";

const TABS: Array<{ key: StatusKey; label: string }> = [
  { key: "all",                 label: "All" },
  { key: "draft",               label: "Drafts" },
  { key: "pending_approval",    label: "Pending" },
  { key: "approved",            label: "Approved" },
  { key: "sent_to_vendor",      label: "Sent" },
  { key: "partially_received",  label: "Partial GRN" },
  { key: "received",            label: "Received" },
  { key: "cancelled",           label: "Cancelled" },
];

export default function PoListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/po`;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<StatusKey>("all");
  const [buyerMine, setBuyerMine] = useState(false);
  const [counts, setCounts] = useState<Partial<Record<StatusKey, number>>>({});

  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (appliedSearch.trim()) qs.set("search", appliedSearch.trim());
      if (status !== "all") qs.set("status", status);
      if (buyerMine) qs.set("buyer", "me");
      qs.set("pageSize", "100");
      const res = await api<ListResponse>(`/api/po?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load POs");
    } finally {
      setLoading(false);
    }
  }

  async function loadCounts() {
    try {
      const wanted: StatusKey[] = ["draft", "pending_approval", "approved", "sent_to_vendor", "partially_received", "received", "cancelled"];
      const all = await Promise.all(
        wanted.map((s) =>
          api<ListResponse>(`/api/po?status=${s}&pageSize=1${buyerMine ? "&buyer=me" : ""}`)
            .then((r) => [s, r.total] as const)
            .catch(() => [s, 0] as const),
        ),
      );
      const map: Partial<Record<StatusKey, number>> = {};
      let total = 0;
      for (const [k, v] of all) { map[k] = v; total += v; }
      map.all = total;
      setCounts(map);
    } catch { /* noop */ }
  }

  useEffect(() => {
    load();
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, buyerMine, appliedSearch]);

  const tabsWithCounts = TABS.map((t) => ({ ...t, count: counts[t.key] }));

  return (
    <>
      <PageHeader
        title="Purchase Order"
        subtitle="Orders sent to suppliers — convertible from approved PRs"
        actions={
          <Link href={`${base}/new`} className="btn btn-primary btn-sm">
            <Icon name="Plus" size={14} /> Create
          </Link>
        }
      />

      <div className="mb-3 overflow-x-auto">
        <StatusTabs tabs={tabsWithCounts} value={status} onChange={setStatus} />
      </div>

      <FilterBar search={search} onSearch={setSearch} placeholder="Search by title…">
        <label className="flex items-center gap-1.5 text-[11.5px] text-muted whitespace-nowrap px-2 cursor-pointer">
          <input
            type="checkbox"
            checked={buyerMine}
            onChange={(e) => setBuyerMine(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Assigned to me
        </label>
      </FilterBar>

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">PO #</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Title</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Supplier</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Items</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Total</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Delivery</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Created</th>
              </tr>
            </thead>
            <SkeletonRows rows={6} cols={8} />
          </table>
        ) : !data?.items.length ? (
          <EmptyState
            icon="ShoppingCart"
            iconTint="var(--tint-peach)"
            iconColor="var(--tint-peach-fg)"
            title={appliedSearch || status !== "all" ? "No POs match these filters" : "No purchase orders yet"}
            description={
              appliedSearch || status !== "all"
                ? "Try clearing the search or switching the status tab."
                : "Approve a PR first — then convert it to a PO from its detail page."
            }
          />
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">PO #</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Title</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Supplier</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Items</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Total</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Delivery</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((po) => (
                <tr
                  key={po.id}
                  className="border-t border-border hover:bg-surface/60 cursor-pointer select-none transition"
                  onClick={() => { window.location.href = `${base}/${po.id}`; }}
                >
                  <td className="px-3 py-2 font-mono text-[11px]">{po.poNumber ?? <span className="text-muted italic">draft</span>}</td>
                  <td className="px-3 py-2 font-medium max-w-md truncate">{po.title}</td>
                  <td className="px-3 py-2 text-muted">{po.vendorName}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-muted">{po.itemsCount}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-right">{paiseToCompactINR(po.totalPaise)}</td>
                  <td className="px-3 py-2 text-[11px] text-muted">{formatDate(po.deliveryDate)}</td>
                  <td className="px-3 py-2"><PoStatusBadge status={po.status} /></td>
                  <td className="px-3 py-2 text-[11px] text-muted">{timeAgo(po.createdAt)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface">
                <td colSpan={8} className="px-3 py-1.5 text-[11px] text-muted">
                  {data.total} {data.total === 1 ? "purchase order" : "purchase orders"} · click any row to open
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
