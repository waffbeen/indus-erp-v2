"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { FilterBar } from "@/components/ListPrimitives";
import { SummaryTiles } from "@/components/inventory/SummaryTiles";
import { api, ApiError } from "@/lib/api";
import { paiseToINR, paiseToCompactINR } from "@/lib/format";

interface ValuationRow {
  itemId: string;
  itemName: string;
  itemCode: string | null;
  itemGroupName: string | null;
  unitId: string;
  unitName: string;
  uom: string;
  onHandQty: number;
  wacUnitCostPaise: number;
  fifoUnitCostPaise: number;
  valuePaise: number;
}

interface ValuationResponse {
  method: "wac" | "fifo";
  rows: ValuationRow[];
  totals: { onHandValuePaise: number; itemCount: number; positions: number };
}

interface Unit { id: string; name: string; code: string | null; companyId: string; }

export default function ValuationPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [data, setData] = useState<ValuationResponse | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [unitId, setUnitId] = useState("");
  const [method, setMethod] = useState<"wac" | "fifo">("wac");

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (unitId) qs.set("unitId", unitId);
      qs.set("method", method);
      const res = await api<ValuationResponse>(`/api/valuation${qs.toString() ? `?${qs.toString()}` : ""}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load valuation");
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
  }, [unitId, method]);

  const term = search.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter(
    (r) => !term || `${r.itemName} ${r.itemCode ?? ""} ${r.itemGroupName ?? ""}`.toLowerCase().includes(term),
  );
  const filteredValuePaise = rows.reduce((s, r) => s + r.valuePaise, 0);

  return (
    <>
      <div className="flex items-center gap-2 mb-2 text-[11px] text-muted">
        <Link href={`/t/${slug}/inventory`} className="hover:text-text-default">Inventory</Link>
        <Icon name="ChevronRight" size={12} />
        <span className="text-text-default font-medium">Valuation</span>
      </div>

      <PageHeader
        title="Stock Valuation"
        subtitle="Closing stock value computed live from the movement ledger. Toggle Weighted-Average vs FIFO costing."
        actions={
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 bg-surface">
            {(["wac", "fifo"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  method === m ? "bg-primary text-on-dark" : "text-muted hover:text-text-default"
                }`}
              >
                {m === "wac" ? "Weighted Avg" : "FIFO"}
              </button>
            ))}
          </div>
        }
      />

      <SummaryTiles
        tiles={[
          { label: "Closing value", value: paiseToINR(data?.totals.onHandValuePaise ?? 0), icon: "IndianRupee", hint: method === "wac" ? "Weighted average" : "FIFO" },
          { label: "Distinct items", value: String(data?.totals.itemCount ?? 0), icon: "Package" },
          { label: "Stock positions", value: String(data?.totals.positions ?? 0), icon: "Warehouse", hint: "item × warehouse" },
          { label: "Filtered value", value: paiseToCompactINR(filteredValuePaise), icon: "Filter", hint: `${rows.length} rows shown` },
        ]}
      />

      <FilterBar search={search} onSearch={setSearch} placeholder="Search item name, code or group…">
        <select className="input sm:w-48" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">All warehouses</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
        </select>
      </FilterBar>

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="p-6 text-center text-xs text-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <Icon name="Calculator" size={20} className="mx-auto mb-1.5 text-muted" />
            <p className="text-xs text-muted">
              {term || unitId ? "No items match these filters." : "No valued stock yet. Receive a GRN to build valuation."}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Item</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Code</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Group</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Warehouse</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">On hand</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Unit cost</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const unitCostPaise = method === "fifo" ? r.fifoUnitCostPaise : r.wacUnitCostPaise;
                return (
                  <tr key={`${r.itemId}-${r.unitId}`} className="border-t border-border hover:bg-surface/60">
                    <td className="px-3 py-1.5 font-medium">{r.itemName}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{r.itemCode ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[11px] text-muted">{r.itemGroupName ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[11px]">{r.unitName}</td>
                    <td className={`px-3 py-1.5 tabular-nums text-right ${r.onHandQty < 0 ? "text-danger-fg" : ""}`}>
                      {r.onHandQty.toLocaleString("en-IN", { maximumFractionDigits: 3 })} <span className="text-[10px] text-muted">{r.uom}</span>
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-muted">{paiseToINR(unitCostPaise)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right font-bold">{paiseToINR(r.valuePaise)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface font-semibold">
                <td colSpan={6} className="px-3 py-1.5 text-right">Total ({method === "fifo" ? "FIFO" : "Weighted Avg"})</td>
                <td className="px-3 py-1.5 tabular-nums text-right">{paiseToINR(filteredValuePaise)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
