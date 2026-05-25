"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { GateEntryListItem } from "@indus/shared";

interface ListResponse { items: GateEntryListItem[]; total: number; page: number; pageSize: number; }

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

export default function GateEntryListPage() {
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/gate-entry`;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (statusFilter !== "all") qs.set("status", statusFilter);
      const res = await api<ListResponse>(`/api/gate-entry?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <>
      <PageHeader
        title="Gate Entries"
        subtitle="Track vehicles & materials at your gate — inward (with POs) and outward movements"
        actions={
          <Link href={`${base}/new`} className="btn btn-primary">
            <Icon name="Plus" /> New Gate Entry
          </Link>
        }
      />

      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {["all", "open", "closed", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-pill text-sm font-medium capitalize transition ${
              statusFilter === s ? "bg-primary text-on-dark shadow-sm" : "text-muted hover:bg-surface hover:text-text-default"
            }`}
          >
            {s}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <input
            className="input !py-2 !pl-9 !w-64 text-sm"
            placeholder="Search by vehicle no..."
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
          <div className="p-12 text-center text-muted">Loading…</div>
        ) : !data?.items.length ? (
          <div className="p-12 text-center">
            <div className="h-14 w-14 rounded-2xl mx-auto grid place-items-center bg-tint-lilac text-tint-lilac-fg mb-4">
              <Icon name="DoorOpen" size={28} />
            </div>
            <h3 className="display text-xl mb-1">No gate entries yet</h3>
            <p className="text-sm text-muted mb-5">Record the next vehicle arrival.</p>
            <Link href={`${base}/new`} className="btn btn-primary"><Icon name="Plus" /> Record entry</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">GE #</th>
                <th className="text-left px-5 py-3 font-semibold">Type</th>
                <th className="text-left px-5 py-3 font-semibold">Vehicle</th>
                <th className="text-left px-5 py-3 font-semibold">Vendor / PO</th>
                <th className="text-left px-5 py-3 font-semibold">Driver</th>
                <th className="text-left px-5 py-3 font-semibold">Items</th>
                <th className="text-left px-5 py-3 font-semibold">Gate-in</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((ge) => (
                <tr
                  key={ge.id}
                  className="border-t border-border hover:bg-surface/50 cursor-pointer select-none"
                  onClick={() => { window.location.href = `${base}/${ge.id}`; }}
                >
                  <td className="px-5 py-3 font-mono text-xs">{ge.gateEntryNumber ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${TYPE_TINT[ge.type] ?? "badge-info"} capitalize`}>{ge.type}</span>
                  </td>
                  <td className="px-5 py-3 font-mono text-sm">{ge.vehicleNumber ?? <span className="text-muted">—</span>}</td>
                  <td className="px-5 py-3">
                    <p className="text-sm">{ge.vendorName ?? <span className="text-muted">—</span>}</p>
                    {ge.poNumber && <p className="text-[11px] font-mono text-muted">{ge.poNumber}</p>}
                  </td>
                  <td className="px-5 py-3 text-muted">{ge.driverName ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">{ge.itemsCount}</td>
                  <td className="px-5 py-3 text-xs text-muted">{timeAgo(ge.gateInAt)}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${STATUS_TINT[ge.status] ?? "badge-info"} capitalize`}>{ge.status}</span>
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
