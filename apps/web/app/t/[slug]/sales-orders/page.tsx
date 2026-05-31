"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { StatusTabs, SkeletonRows, EmptyState, FilterBar } from "@/components/ListPrimitives";
import { SalesOrderStatusBadge } from "@/components/sales/badges";
import { api, ApiError } from "@/lib/api";
import { paiseToINR, formatDate } from "@/lib/format";
import type { SalesOrderListItem } from "@indus/shared";

interface ListResponse { items: SalesOrderListItem[]; total: number; page: number; pageSize: number; }

type StatusKey = "all" | "draft" | "pending_approval" | "approved" | "partially_fulfilled" | "fulfilled" | "cancelled";

const TABS: Array<{ key: StatusKey; label: string }> = [
  { key: "all",                 label: "All" },
  { key: "draft",               label: "Draft" },
  { key: "pending_approval",    label: "Pending" },
  { key: "approved",            label: "Approved" },
  { key: "partially_fulfilled", label: "Partial" },
  { key: "fulfilled",           label: "Fulfilled" },
  { key: "cancelled",           label: "Cancelled" },
];

export default function SalesOrderListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/sales-orders`;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusKey>("all");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [counts, setCounts] = useState<Partial<Record<StatusKey, number>>>({});

  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status !== "all") qs.set("status", status);
      if (appliedSearch.trim()) qs.set("search", appliedSearch.trim());
      qs.set("pageSize", "100");
      const res = await api<ListResponse>(`/api/sales-orders?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function loadCounts() {
    try {
      const wanted: StatusKey[] = ["draft", "pending_approval", "approved", "partially_fulfilled", "fulfilled", "cancelled"];
      const all = await Promise.all(
        wanted.map((s) =>
          api<ListResponse>(`/api/sales-orders?status=${s}&pageSize=1`)
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
  }, [status, appliedSearch]);

  const tabsWithCounts = TABS.map((t) => ({ ...t, count: counts[t.key] }));

  return (
    <>
      <PageHeader
        title="Sales Orders"
        subtitle="Confirmed orders from customers — approve, then fulfil and invoice"
        actions={
          <Link href={`${base}/new`} className="btn btn-primary btn-sm">
            <Icon name="Plus" size={14} /> New sales order
          </Link>
        }
      />

      <div className="mb-3 overflow-x-auto">
        <StatusTabs tabs={tabsWithCounts} value={status} onChange={setStatus} />
      </div>

      <FilterBar search={searchInput} onSearch={setSearchInput} placeholder="Search by title…" />

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
                {["SO #", "Title", "Customer", "Ship by", "Total", "Items", "Status"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <SkeletonRows rows={5} cols={7} />
          </table>
        ) : !data?.items.length ? (
          <EmptyState
            icon="ShoppingBag"
            iconTint="var(--tint-mint)"
            iconColor="var(--tint-mint-fg)"
            title={status !== "all" || appliedSearch ? "No sales orders match these filters" : "No sales orders yet"}
            description={
              status !== "all" || appliedSearch
                ? "Try clearing the search or switching the status tab."
                : "Raise a sales order against a customer, get it approved, then fulfil and invoice it."
            }
            cta="New sales order"
            ctaHref={`${base}/new`}
          />
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">SO #</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Title</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Customer</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Ship by</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Total</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Items</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((so) => (
                <tr
                  key={so.id}
                  className="border-t border-border hover:bg-surface/60 cursor-pointer select-none transition"
                  onClick={() => { window.location.href = `${base}/${so.id}`; }}
                >
                  <td className="px-3 py-2 font-mono text-[11px]">{so.soNumber ?? "Draft"}</td>
                  <td className="px-3 py-2 font-medium">{so.title}</td>
                  <td className="px-3 py-2 text-muted">{so.customerName}</td>
                  <td className="px-3 py-2 text-[11px] text-muted">{so.expectedShipDate ? formatDate(so.expectedShipDate) : "—"}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-right">{paiseToINR(so.totalPaise)}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-muted">{so.itemsCount}</td>
                  <td className="px-3 py-2"><SalesOrderStatusBadge status={so.status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface">
                <td colSpan={7} className="px-3 py-1.5 text-[11px] text-muted">
                  {data.total} {data.total === 1 ? "order" : "orders"} · click any row to open
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
