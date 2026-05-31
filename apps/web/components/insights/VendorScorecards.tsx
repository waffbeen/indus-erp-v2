"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { paiseToCompactINR } from "@/lib/format";
import type { VendorScorecard, VendorScorecardsResult } from "@indus/shared";

const GRADE_CLASS: Record<string, string> = {
  A: "badge-success",
  B: "badge-info",
  C: "badge-warning",
  D: "badge-danger",
};

function pct(v: number | null): string {
  return v === null || v === undefined ? "—" : `${v}%`;
}

function priceIndexLabel(idx: number | null): { text: string; tone: string } {
  if (idx === null || idx === undefined) return { text: "—", tone: "var(--muted)" };
  if (idx < 97) return { text: `${idx} · cheaper`, tone: "var(--success-fg, var(--text))" };
  if (idx > 103) return { text: `${idx} · dearer`, tone: "var(--danger-fg, var(--text))" };
  return { text: `${idx} · at market`, tone: "var(--muted)" };
}

function ScoreBar({ score }: { score: number }) {
  const tone = score >= 85 ? "var(--success-bg)" : score >= 70 ? "var(--primary)" : score >= 55 ? "var(--warning-bg)" : "var(--danger-bg)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(4, score)}%`, background: tone }} />
      </div>
      <span className="text-[12px] font-semibold tabular-nums">{score}</span>
    </div>
  );
}

export function VendorScorecards() {
  const [data, setData] = useState<VendorScorecardsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<VendorScorecardsResult>("/api/copilot/scorecards")
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load scorecards");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-[12.5px] text-muted p-4">Crunching vendor history…</p>;
  if (error)
    return (
      <div className="rounded p-2.5 text-xs flex items-start gap-2" style={{ background: "var(--warning-bg)", color: "var(--warning-fg)" }}>
        <Icon name="TriangleAlert" size={14} />
        <span>{error}</span>
      </div>
    );

  const cards = data?.scorecards ?? [];
  if (cards.length === 0)
    return (
      <div className="p-8 text-center">
        <div className="h-10 w-10 rounded-md mx-auto grid place-items-center mb-2.5" style={{ background: "var(--tint-lilac)", color: "var(--tint-lilac-fg)" }}>
          <Icon name="Award" size={18} />
        </div>
        <h3 className="text-[14px] font-semibold tracking-tight mb-1">No vendor history yet</h3>
        <p className="text-[12px] text-muted max-w-sm mx-auto">
          Scorecards appear once you have approved POs and goods receipts. They rank each supplier on
          on-time delivery, quality, price and responsiveness.
        </p>
      </div>
    );

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-surface">
            <tr>
              {["Vendor", "Score", "On-time", "Quality", "Price index", "Lead time", "POs", "Ordered"].map((h, i) => (
                <th key={h} className={`px-3 py-2 font-semibold uppercase tracking-wider text-muted ${i >= 2 && i <= 6 ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cards.map((c: VendorScorecard) => {
              const price = priceIndexLabel(c.priceIndex);
              return (
                <tr key={c.vendorId} className="border-t border-border">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${GRADE_CLASS[c.grade] ?? "badge-info"}`}>{c.grade}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-text-default truncate">{c.vendorName}</div>
                        {c.vendorCode && <div className="text-[11px] text-muted">{c.vendorCode}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><div className="flex justify-end"><ScoreBar score={c.overallScore} /></div></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(c.onTimePct)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(c.qualityPct)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: price.tone }}>{price.text}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.avgLeadTimeDays === null ? "—" : `${c.avgLeadTimeDays}d`}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.poCount}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{paiseToCompactINR(c.totalOrderedPaise)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
