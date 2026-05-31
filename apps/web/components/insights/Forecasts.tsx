"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Icon } from "@/components/Icon";
import type { DemandForecast, DemandForecastsResult } from "@indus/shared";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(n);
}

function Trend({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined) return <span className="text-muted">—</span>;
  const up = pct > 0;
  const flat = Math.abs(pct) < 1;
  const tone = flat ? "var(--muted)" : up ? "var(--danger-fg, var(--text))" : "var(--success-fg, var(--text))";
  const arrow = flat ? "→" : up ? "▲" : "▼";
  return (
    <span style={{ color: tone }} className="tabular-nums font-medium">
      {arrow} {Math.abs(pct)}%
    </span>
  );
}

export function Forecasts() {
  const [data, setData] = useState<DemandForecastsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<DemandForecastsResult>("/api/copilot/forecasts")
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load forecasts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-[12.5px] text-muted p-4">Modelling consumption…</p>;
  if (error)
    return (
      <div className="rounded p-2.5 text-xs flex items-start gap-2" style={{ background: "var(--warning-bg)", color: "var(--warning-fg)" }}>
        <Icon name="TriangleAlert" size={14} />
        <span>{error}</span>
      </div>
    );

  const rows = data?.forecasts ?? [];
  if (rows.length === 0)
    return (
      <div className="p-8 text-center">
        <div className="h-10 w-10 rounded-md mx-auto grid place-items-center mb-2.5" style={{ background: "var(--tint-mint, var(--surface-2))", color: "var(--tint-mint-fg, var(--text))" }}>
          <Icon name="Package" size={18} />
        </div>
        <h3 className="text-[14px] font-semibold tracking-tight mb-1">Not enough movement history</h3>
        <p className="text-[12px] text-muted max-w-sm mx-auto">
          Demand forecasts appear once items have been issued/consumed from stock. They project next
          month&apos;s demand and suggest reorder quantities.
        </p>
      </div>
    );

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-surface">
            <tr>
              {["Item", "Avg / mo", "Forecast (next mo)", "Trend", "On-hand", "Cover", "Suggested reorder"].map((h, i) => (
                <th key={h} className={`px-3 py-2 font-semibold uppercase tracking-wider text-muted ${i === 0 ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((f: DemandForecast) => (
              <tr key={f.itemId} className="border-t border-border">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-text-default truncate max-w-[260px]">{f.itemName}</div>
                  <div className="text-[11px] text-muted">
                    {f.uom} · {f.method === "trend" ? "trend-adjusted" : "moving avg"} · {f.historyMonths}mo
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(f.avgMonthlyConsumption)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtQty(f.forecastNextMonth)}</td>
                <td className="px-3 py-2.5 text-right"><Trend pct={f.trendPct} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(f.onHand)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {f.coverMonths === null ? "—" : (
                    <span style={{ color: f.coverMonths < 1 ? "var(--danger-fg, var(--text))" : f.coverMonths < 2 ? "var(--warning-fg, var(--text))" : "var(--muted)" }}>
                      {f.coverMonths} mo
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {f.suggestedReorderQty > 0 ? (
                    <span className="badge badge-warning">{fmtQty(f.suggestedReorderQty)} {f.uom}</span>
                  ) : (
                    <span className="text-muted">OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
