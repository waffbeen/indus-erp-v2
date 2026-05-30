"use client";
import { Icon, type IconProps } from "@/components/Icon";

export interface SummaryTile {
  label: string;
  value: string;
  icon: IconProps["name"];
  /** Optional small caption under the value. */
  hint?: string;
  /** Tailwind text colour class for the value, e.g. "text-danger-fg". */
  tone?: string;
}

/**
 * Compact row of KPI tiles shared by the Phase-2 inventory dashboards
 * (valuation, reorder). Mirrors the on-hand tiles used on the item-ledger
 * screen so the inventory area feels consistent.
 */
export function SummaryTiles({ tiles }: { tiles: SummaryTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-3">
      {tiles.map((t) => (
        <div key={t.label} className="card p-2.5">
          <div className="flex items-center gap-1.5 text-muted">
            <Icon name={t.icon} size={12} />
            <span className="text-[10px] font-semibold uppercase tracking-wider truncate">{t.label}</span>
          </div>
          <div className={`text-base font-bold tabular-nums leading-tight mt-1 ${t.tone ?? ""}`}>{t.value}</div>
          {t.hint && <div className="text-[10.5px] text-muted mt-0.5 truncate">{t.hint}</div>}
        </div>
      ))}
    </div>
  );
}
