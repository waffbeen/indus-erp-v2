"use client";
import { paiseToINR } from "@/lib/format";
import { EmptyState } from "@/components/ListPrimitives";

export interface ArAgingRow {
  customerId: string;
  customerName: string | null;
  bucket0to30Paise: string;
  bucket31to60Paise: string;
  bucket61to90Paise: string;
  bucket90PlusPaise: string;
  totalOutstandingPaise: string;
  invoiceCount: number;
}

export interface ArAgingData {
  asOf: string;
  rows: ArAgingRow[];
  totals: {
    bucket0to30Paise: string;
    bucket31to60Paise: string;
    bucket61to90Paise: string;
    bucket90PlusPaise: string;
    totalOutstandingPaise: string;
  };
}

/** Customer receivables split into ageing buckets — the classic AR-ageing report. */
export function ArAgingTable({ data }: { data: ArAgingData }) {
  if (!data.rows.length) {
    return (
      <div className="card overflow-hidden">
        <EmptyState
          icon="IndianRupee"
          iconTint="var(--tint-mint)"
          iconColor="var(--tint-mint-fg)"
          title="Nothing outstanding"
          description="Every issued invoice is fully collected — no receivables are ageing right now."
        />
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Customer</th>
              <th className="text-right px-4 py-2.5 font-semibold">0–30 days</th>
              <th className="text-right px-4 py-2.5 font-semibold">31–60</th>
              <th className="text-right px-4 py-2.5 font-semibold">61–90</th>
              <th className="text-right px-4 py-2.5 font-semibold">90+</th>
              <th className="text-right px-4 py-2.5 font-semibold">Total due</th>
              <th className="text-right px-4 py-2.5 font-semibold">Bills</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.customerId} className="border-t border-border">
                <td className="px-4 py-2.5 font-medium">{r.customerName ?? "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-right">{paiseToINR(r.bucket0to30Paise)}</td>
                <td className="px-4 py-2.5 tabular-nums text-right">{paiseToINR(r.bucket31to60Paise)}</td>
                <td className="px-4 py-2.5 tabular-nums text-right text-warning-fg">{paiseToINR(r.bucket61to90Paise)}</td>
                <td className="px-4 py-2.5 tabular-nums text-right text-danger-fg font-semibold">{paiseToINR(r.bucket90PlusPaise)}</td>
                <td className="px-4 py-2.5 tabular-nums text-right font-bold">{paiseToINR(r.totalOutstandingPaise)}</td>
                <td className="px-4 py-2.5 tabular-nums text-right text-muted">{r.invoiceCount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface font-semibold">
              <td className="px-4 py-3">All customers</td>
              <td className="px-4 py-3 tabular-nums text-right">{paiseToINR(data.totals.bucket0to30Paise)}</td>
              <td className="px-4 py-3 tabular-nums text-right">{paiseToINR(data.totals.bucket31to60Paise)}</td>
              <td className="px-4 py-3 tabular-nums text-right">{paiseToINR(data.totals.bucket61to90Paise)}</td>
              <td className="px-4 py-3 tabular-nums text-right">{paiseToINR(data.totals.bucket90PlusPaise)}</td>
              <td className="px-4 py-3 tabular-nums text-right">{paiseToINR(data.totals.totalOutstandingPaise)}</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
