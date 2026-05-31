"use client";
import { Icon } from "@/components/Icon";
import { paiseToINR } from "@/lib/format";

export interface CompareVendor {
  vendorId: string;
  vendorName: string;
  responseId: string;
  totalPaise: string;
  status: string;
  submittedAt: string | null;
  viaPortal: boolean;
  isLowestTotal: boolean;
}

export interface CompareQuote {
  vendorId: string;
  vendorName: string;
  unitPricePaise: string | null;
  lineTotalPaise: string | null;
  deliveryDays: number | null;
  hasQuote: boolean;
  isBest: boolean;
}

export interface CompareItem {
  rfqItemId: string;
  itemName: string;
  quantity: number;
  uom: string;
  bestVendorId: string | null;
  quotes: CompareQuote[];
}

export interface CompareData {
  rfq: { id: string; rfqNumber: string | null; title: string; status: string; awardedVendorId: string | null };
  items: CompareItem[];
  vendors: CompareVendor[];
}

export function QuoteCompareTable({
  data,
  canAward,
  awardingVendorId,
  onAward,
}: {
  data: CompareData;
  canAward: boolean;
  awardingVendorId: string | null;
  onAward: (vendorId: string) => void;
}) {
  if (!data.vendors.length) {
    return (
      <div className="card p-8 text-center">
        <div
          className="h-10 w-10 rounded-md mx-auto grid place-items-center mb-2.5"
          style={{ background: "var(--tint-peach)", color: "var(--tint-peach-fg)" }}
        >
          <Icon name="Inbox" size={18} />
        </div>
        <h3 className="text-[14px] font-semibold tracking-tight mb-1">No quotes yet</h3>
        <p className="text-[12px] text-muted leading-relaxed max-w-sm mx-auto">
          Invite vendors and share their portal link — quotes land here for side-by-side comparison.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="bg-surface">
          <tr>
            <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted sticky left-0 bg-surface z-10">
              Item
            </th>
            {data.vendors.map((v) => (
              <th key={v.vendorId} className="text-right px-3 py-2 font-semibold text-text-default min-w-[140px]">
                <div className="flex items-center justify-end gap-1">
                  <span className="truncate max-w-[120px]">{v.vendorName}</span>
                  {v.viaPortal && <Icon name="Globe" size={11} className="text-muted" />}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.rfqItemId} className="border-t border-border">
              <td className="px-3 py-2 sticky left-0 bg-card z-10">
                <div className="font-medium">{item.itemName}</div>
                <div className="text-[10.5px] text-muted">
                  {item.quantity} {item.uom}
                </div>
              </td>
              {data.vendors.map((v) => {
                const q = item.quotes.find((x) => x.vendorId === v.vendorId);
                if (!q || !q.hasQuote) {
                  return (
                    <td key={v.vendorId} className="px-3 py-2 text-right text-muted">
                      —
                    </td>
                  );
                }
                return (
                  <td
                    key={v.vendorId}
                    className={`px-3 py-2 text-right tabular-nums ${q.isBest ? "font-semibold" : ""}`}
                    style={q.isBest ? { background: "var(--success-bg)", color: "var(--success-fg, var(--text))" } : undefined}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {q.isBest && <Icon name="Check" size={12} style={{ color: "var(--success)" }} />}
                      {paiseToINR(q.unitPricePaise)}
                    </div>
                    {q.deliveryDays != null && (
                      <div className="text-[10px] text-muted">{q.deliveryDays}d lead</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-surface">
            <td className="px-3 py-2 font-semibold sticky left-0 bg-surface z-10">Quote total</td>
            {data.vendors.map((v) => (
              <td
                key={v.vendorId}
                className={`px-3 py-2 text-right tabular-nums font-semibold ${v.isLowestTotal ? "" : "text-text-default"}`}
                style={v.isLowestTotal ? { color: "var(--success)" } : undefined}
              >
                {paiseToINR(v.totalPaise)}
                {v.isLowestTotal && <div className="text-[10px] font-medium">lowest</div>}
              </td>
            ))}
          </tr>
          {canAward && (
            <tr className="border-t border-border">
              <td className="px-3 py-2 sticky left-0 bg-card z-10" />
              {data.vendors.map((v) => (
                <td key={v.vendorId} className="px-3 py-2 text-right">
                  <button
                    className="btn btn-primary btn-sm w-full justify-center"
                    disabled={awardingVendorId !== null}
                    onClick={() => onAward(v.vendorId)}
                  >
                    {awardingVendorId === v.vendorId ? (
                      "Awarding…"
                    ) : (
                      <>
                        <Icon name="Award" size={13} /> Award
                      </>
                    )}
                  </button>
                </td>
              ))}
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}
