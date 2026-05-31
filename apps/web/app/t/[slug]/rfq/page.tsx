"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { RfqStatusBadge } from "@/components/rfq/RfqStatusBadge";
import { StatusTabs, SkeletonRows, EmptyState, FilterBar } from "@/components/ListPrimitives";
import { api, ApiError } from "@/lib/api";
import { timeAgo, formatDate } from "@/lib/format";

interface RfqRow {
  id: string;
  rfqNumber: string | null;
  title: string;
  status: string;
  dueDate: string | null;
  vendorCount: number;
  responseCount: number;
  itemsCount: number;
  awardedPoId: string | null;
  createdAt: string;
}

interface ListResponse { items: RfqRow[]; total: number; page: number; pageSize: number; }

type StatusKey = "all" | "draft" | "sent" | "closed" | "awarded" | "cancelled";

const TABS: Array<{ key: StatusKey; label: string }> = [
  { key: "all",       label: "All" },
  { key: "draft",     label: "Drafts" },
  { key: "sent",      label: "Sent" },
  { key: "closed",    label: "Closed" },
  { key: "awarded",   label: "Awarded" },
  { key: "cancelled", label: "Cancelled" },
];

export default function RfqListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/rfq`;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<StatusKey>("all");

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
      qs.set("pageSize", "100");
      const res = await api<ListResponse>(`/api/rfq?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load RFQs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, appliedSearch]);

  return (
    <>
      <PageHeader
        title="RFQ / Sourcing"
        subtitle="Float requests for quotation, compare vendor prices, and award the winner into a PO"
        actions={
          <Link href={`${base}/new`} className="btn btn-primary btn-sm">
            <Icon name="Plus" size={14} /> New RFQ
          </Link>
        }
      />

      <div className="mb-3 overflow-x-auto">
        <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      </div>

      <FilterBar search={search} onSearch={setSearch} placeholder="Search by title…" />

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
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">RFQ #</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Title</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Items</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Vendors</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Quotes</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Due</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Created</th>
              </tr>
            </thead>
            <SkeletonRows rows={6} cols={8} />
          </table>
        ) : !data?.items.length ? (
          <EmptyState
            icon="GitCompareArrows"
            iconTint="var(--tint-teal)"
            iconColor="var(--tint-teal-fg)"
            title={appliedSearch || status !== "all" ? "No RFQs match these filters" : "No RFQs yet"}
            description={
              appliedSearch || status !== "all"
                ? "Try clearing the search or switching the status tab."
                : "Create an RFQ, invite a few vendors, and let the quotes roll in for comparison."
            }
            cta="New RFQ"
            ctaHref={`${base}/new`}
          />
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">RFQ #</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Title</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Items</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Vendors</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Quotes</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Due</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((rfq) => (
                <tr
                  key={rfq.id}
                  className="border-t border-border hover:bg-surface/60 cursor-pointer select-none transition"
                  onClick={() => { window.location.href = `${base}/${rfq.id}`; }}
                >
                  <td className="px-3 py-2 font-mono text-[11px]">{rfq.rfqNumber ?? <span className="text-muted italic">draft</span>}</td>
                  <td className="px-3 py-2 font-medium max-w-md truncate">{rfq.title}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-muted">{rfq.itemsCount}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-muted">{rfq.vendorCount}</td>
                  <td className="px-3 py-2 tabular-nums text-right font-semibold">{rfq.responseCount}</td>
                  <td className="px-3 py-2 text-[11px] text-muted">{formatDate(rfq.dueDate)}</td>
                  <td className="px-3 py-2"><RfqStatusBadge status={rfq.status} /></td>
                  <td className="px-3 py-2 text-[11px] text-muted">{timeAgo(rfq.createdAt)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface">
                <td colSpan={8} className="px-3 py-1.5 text-[11px] text-muted">
                  {data.total} {data.total === 1 ? "RFQ" : "RFQs"} · click any row to open
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
