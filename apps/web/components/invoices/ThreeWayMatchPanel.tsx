"use client";
import { Icon } from "@/components/Icon";
import { paiseToINR, quantityScaledToHuman } from "@/lib/format";
import { MatchBadge } from "./badges";

export interface MatchLine {
  id: string;
  itemName: string;
  uom: string;
  qtyScaled: number;
  unitPricePaise: string;
  poUnitPricePaise: string | null;
  grnAcceptedQtyScaled: number | null;
  lineMatchStatus: string;
}

/**
 * The 3-way match panel — shows, per line, what the invoice billed against what
 * the PO ordered (price) and the GRN accepted (qty), with the per-line verdict.
 * Variance cells are tinted so an approver can eyeball where the mismatch is.
 */
export function ThreeWayMatchPanel({
  matchStatus,
  hasPo,
  items,
}: {
  matchStatus: string;
  hasPo: boolean;
  items: MatchLine[];
}) {
  const summary: Record<string, { tone: string; icon: string; text: string }> = {
    matched: { tone: "text-success-fg", icon: "CheckCircle2", text: "All lines match the PO price and GRN quantity within tolerance." },
    price_variance: { tone: "text-warning-fg", icon: "AlertTriangle", text: "One or more lines are billed above the PO price beyond tolerance." },
    qty_variance: { tone: "text-warning-fg", icon: "AlertTriangle", text: "One or more lines bill more than the GRN accepted quantity." },
    unmatched: { tone: "text-danger-fg", icon: "XCircle", text: hasPo ? "Some lines could not be matched to a PO line." : "No PO linked — this invoice cannot be 3-way matched." },
  };
  const s = summary[matchStatus] ?? summary.unmatched!;

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">3-way match</p>
        <MatchBadge status={matchStatus} />
      </div>

      <div className={`px-6 py-3 flex items-start gap-2 text-sm ${s.tone}`}>
        <Icon name={s.icon as "CheckCircle2"} size={15} className="mt-0.5 shrink-0" />
        <span>{s.text}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
            <tr>
              <th className="text-left px-5 py-3 font-semibold">Item</th>
              <th className="text-right px-5 py-3 font-semibold">Billed qty</th>
              <th className="text-right px-5 py-3 font-semibold">GRN accepted</th>
              <th className="text-right px-5 py-3 font-semibold">Billed price</th>
              <th className="text-right px-5 py-3 font-semibold">PO price</th>
              <th className="text-left px-5 py-3 font-semibold">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const priceOff = it.lineMatchStatus === "price_variance";
              const qtyOff = it.lineMatchStatus === "qty_variance";
              return (
                <tr key={it.id} className="border-t border-border align-top">
                  <td className="px-5 py-3">
                    <p className="font-semibold">{it.itemName}</p>
                    <p className="text-[11px] text-muted">UOM: <span className="font-mono">{it.uom}</span></p>
                  </td>
                  <td className={`px-5 py-3 tabular-nums text-right ${qtyOff ? "text-warning-fg font-semibold" : ""}`}>
                    {quantityScaledToHuman(it.qtyScaled)}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-right text-muted">
                    {it.grnAcceptedQtyScaled !== null ? quantityScaledToHuman(it.grnAcceptedQtyScaled) : "—"}
                  </td>
                  <td className={`px-5 py-3 tabular-nums text-right ${priceOff ? "text-warning-fg font-semibold" : ""}`}>
                    {paiseToINR(it.unitPricePaise)}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-right text-muted">
                    {it.poUnitPricePaise !== null ? paiseToINR(it.poUnitPricePaise) : "—"}
                  </td>
                  <td className="px-5 py-3"><MatchBadge status={it.lineMatchStatus} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
