"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/format";

interface StockRow {
  itemId: string;
  unitId: string;
  itemName: string;
  itemCode: string | null;
  itemGroupName: string | null;
  itemSubGroupName: string | null;
  hsnCode: string | null;
  unitName: string;
  unitCode: string | null;
  uom: string;
  qty: number;
  lineCount: number;
  lastMovementAt: string | null;
}

interface Unit { id: string; name: string; code: string | null; companyId: string; }

export default function InventoryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [rows, setRows] = useState<StockRow[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [unitId, setUnitId] = useState<string>("");
  const [nonZeroOnly, setNonZeroOnly] = useState(true);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (appliedSearch.trim()) qs.set("search", appliedSearch.trim());
      if (unitId) qs.set("unitId", unitId);
      if (nonZeroOnly) qs.set("nonZeroOnly", "true");
      const data = await api<StockRow[]>(`/api/stock/by-item${qs.toString() ? `?${qs.toString()}` : ""}`);
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load stock");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api<Unit[]>("/api/tenant/units").then(setUnits).catch(() => setUnits([]));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, unitId, nonZeroOnly]);

  // Group rows by item so we can show "per-item total" with per-warehouse breakdown
  const grouped = (() => {
    const map = new Map<string, { itemId: string; itemName: string; itemCode: string | null; itemGroupName: string | null; hsnCode: string | null; uom: string; total: number; warehouses: StockRow[] }>();
    for (const r of rows) {
      const existing = map.get(r.itemId);
      if (existing) {
        existing.total += r.qty;
        existing.warehouses.push(r);
      } else {
        map.set(r.itemId, {
          itemId: r.itemId,
          itemName: r.itemName,
          itemCode: r.itemCode,
          itemGroupName: r.itemGroupName,
          hsnCode: r.hsnCode,
          uom: r.uom,
          total: r.qty,
          warehouses: [r],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  })();

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Live on-hand stock — incremented from GRN acceptances, decremented from issues. Click an item for ledger + issue/adjust."
      />

      {/* Filters */}
      <div className="card p-2 mb-3 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            className="input pl-7"
            placeholder="Search item name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input sm:w-48" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">All warehouses</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap px-2">
          <input type="checkbox" className="h-3.5 w-3.5" checked={nonZeroOnly} onChange={(e) => setNonZeroOnly(e.target.checked)} />
          Non-zero only
        </label>
      </div>

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="AlertTriangle" size={14} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted">Loading…</div>
        ) : grouped.length === 0 ? (
          <div className="p-8 text-center">
            <Icon name="Warehouse" size={20} className="mx-auto mb-1.5 text-muted" />
            <p className="text-xs text-muted">
              {appliedSearch || unitId ? "No items match these filters." : "No stock yet. Receive a GRN to populate inventory."}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Item</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Code</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Group</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">HSN</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">UOM</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">On hand</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Warehouses</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Last activity</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted"></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => {
                const lastActivity = g.warehouses
                  .map((w) => w.lastMovementAt)
                  .filter((d): d is string => !!d)
                  .sort()
                  .reverse()[0] ?? null;
                return (
                  <tr
                    key={g.itemId}
                    className="border-t border-border hover:bg-surface/60 cursor-pointer"
                    onClick={() => { window.location.href = `/t/${slug}/inventory/${g.itemId}`; }}
                  >
                    <td className="px-3 py-1.5 font-medium">{g.itemName}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{g.itemCode ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[11px] text-muted">{g.itemGroupName ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{g.hsnCode ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{g.uom}</td>
                    <td className={`px-3 py-1.5 tabular-nums text-right font-bold ${g.total < 0 ? "text-danger-fg" : ""}`}>
                      {g.total.toLocaleString("en-IN", { maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-3 py-1.5 text-[11px]">
                      <div className="flex flex-wrap gap-1">
                        {g.warehouses.map((w) => (
                          <span key={`${g.itemId}-${w.unitId}`} className="badge badge-info text-[10px]">
                            {w.unitCode ?? w.unitName}: {w.qty.toLocaleString("en-IN", { maximumFractionDigits: 3 })}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-muted">{lastActivity ? timeAgo(lastActivity) : "—"}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Icon name="ChevronRight" size={14} className="text-muted" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface">
                <td colSpan={5} className="px-3 py-1.5 font-medium">{grouped.length} items · {rows.length} stock positions</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
