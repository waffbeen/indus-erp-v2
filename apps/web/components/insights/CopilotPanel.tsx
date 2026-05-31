"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth";
import { paiseToINR } from "@/lib/format";
import type { SuggestedPo, RecommendVendorsResult } from "@indus/shared";

interface PrOption {
  id: string;
  prNumber: string | null;
  title: string;
  status: string;
}

const PRICE_BASIS_LABEL: Record<string, string> = {
  vendor_history: "from vendor history",
  last_purchase: "last purchase rate",
  pr_estimate: "requisition estimate",
  ai: "AI estimate",
  none: "no history — set manually",
};

export function CopilotPanel() {
  const { me } = useAuth();
  const slug = me?.tenantSlug ?? "";
  const [prs, setPrs] = useState<PrOption[]>([]);
  const [prId, setPrId] = useState("");
  const [mode, setMode] = useState<"draft" | "vendors" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SuggestedPo | null>(null);
  const [vendors, setVendors] = useState<RecommendVendorsResult | null>(null);

  useEffect(() => {
    api<{ items: PrOption[] }>("/api/pr?pageSize=50")
      .then((r) => {
        setPrs(r.items);
        if (r.items.length && !prId) setPrId(r.items[0]!.id);
      })
      .catch(() => setPrs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(next: "draft" | "vendors") {
    if (!prId) {
      setError("Pick a requisition first.");
      return;
    }
    setMode(next);
    setLoading(true);
    setError(null);
    setDraft(null);
    setVendors(null);
    try {
      if (next === "draft") {
        setDraft(await api<SuggestedPo>("/api/copilot/draft-po", { method: "POST", body: JSON.stringify({ prId }) }));
      } else {
        setVendors(await api<RecommendVendorsResult>("/api/copilot/recommend-vendors", { method: "POST", body: JSON.stringify({ prId }) }));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="card p-3">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className="label">Requisition</label>
            <select className="input" value={prId} onChange={(e) => setPrId(e.target.value)}>
              {prs.length === 0 && <option value="">No requisitions found</option>}
              {prs.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.prNumber ?? "Draft") + " · " + p.title}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => void run("draft")} disabled={loading || !prId}>
            <Icon name="ShoppingCart" size={13} /> Draft a PO
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => void run("vendors")} disabled={loading || !prId}>
            <Icon name="Award" size={13} /> Recommend vendors
          </button>
        </div>
        <p className="text-[11px] text-muted mt-2">
          The Copilot only suggests — it never raises the PO or picks the vendor for you. Review everything before acting.
        </p>
      </div>

      {error && (
        <div className="rounded p-2.5 text-xs flex items-start gap-2" style={{ background: "var(--warning-bg)", color: "var(--warning-fg)" }}>
          <Icon name="TriangleAlert" size={14} />
          <span>{error}</span>
        </div>
      )}

      {loading && <p className="text-[12.5px] text-muted px-1">Thinking…</p>}

      {mode === "draft" && draft && !loading && <DraftPoCard draft={draft} slug={slug} />}
      {mode === "vendors" && vendors && !loading && <VendorRecs result={vendors} />}
    </div>
  );
}

function DraftPoCard({ draft, slug }: { draft: SuggestedPo; slug: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
        <Icon name="Sparkles" size={15} style={{ color: "var(--primary)" }} />
        <span className="text-[13px] font-semibold">Suggested PO for {draft.prNumber ?? draft.prTitle}</span>
        <span className="badge badge-info ml-1">{draft.aiGenerated ? "AI-assisted" : "from history"}</span>
        <Link href={`/t/${slug}/pr/${draft.prId}`} className="btn btn-ghost btn-sm ml-auto">
          <Icon name="ArrowRight" size={13} /> Open requisition
        </Link>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-muted">Suggested vendor</div>
            <div className="text-[13.5px] font-semibold text-text-default mt-0.5">{draft.vendorName ?? "— no history —"}</div>
            {draft.vendorReason && <p className="text-[11.5px] text-muted mt-0.5 max-w-md">{draft.vendorReason}</p>}
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-muted">Estimated total</div>
            <div className="text-[15px] font-bold text-text-default mt-0.5">{paiseToINR(draft.estimatedTotalPaise)}</div>
          </div>
          {(draft.paymentTerms || draft.deliveryTerms) && (
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-muted">Terms</div>
              <div className="text-[12.5px] text-text-default mt-0.5">
                {[draft.paymentTerms, draft.deliveryTerms].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-[12px]">
            <thead className="bg-surface">
              <tr>
                {["Item", "Qty", "Unit price", "Basis", "Line total"].map((h, i) => (
                  <th key={h} className={`px-3 py-1.5 font-semibold uppercase tracking-wider text-muted ${i === 0 || i === 3 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((l, idx) => (
                <tr key={l.prItemId ?? idx} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{l.itemName}</div>
                    {l.reason && <div className="text-[11px] text-muted">{l.reason}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.quantity} {l.uom}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{paiseToINR(l.suggestedUnitPricePaise)}</td>
                  <td className="px-3 py-1.5 text-[11px] text-muted">{PRICE_BASIS_LABEL[l.priceBasis] ?? l.priceBasis}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{paiseToINR(l.lineTotalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {draft.notes && <p className="text-[12px] text-text-default">{draft.notes}</p>}

        {draft.caveats.length > 0 && (
          <div className="rounded p-2.5 text-[11.5px] space-y-1" style={{ background: "var(--warning-bg)", color: "var(--warning-fg)" }}>
            {draft.caveats.map((c, i) => (
              <div key={i} className="flex items-start gap-1.5"><Icon name="TriangleAlert" size={12} className="mt-0.5 shrink-0" /><span>{c}</span></div>
            ))}
          </div>
        )}

        {!draft.aiConfigured && (
          <p className="text-[11px] text-muted">
            Tip: add an AI key under Settings → AI Assistant for richer, narrated suggestions. These figures come purely from your own history.
          </p>
        )}
      </div>
    </div>
  );
}

function VendorRecs({ result }: { result: RecommendVendorsResult }) {
  if (result.recommendations.length === 0)
    return (
      <div className="card p-6 text-center text-[12.5px] text-muted">
        No purchase history for {result.scope.join(", ") || "these items"} yet — once you order them, ranked vendor suggestions appear here.
      </div>
    );
  return (
    <div className="card overflow-hidden">
      <div className="p-3 border-b border-border flex items-center gap-2">
        <Icon name="Award" size={15} style={{ color: "var(--primary)" }} />
        <span className="text-[13px] font-semibold">Ranked vendors</span>
        <span className="text-[11px] text-muted ml-1 truncate">for {result.scope.join(", ")}</span>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {result.recommendations.map((r) => (
          <div key={r.vendorId} className="p-3 flex items-start gap-3">
            <div className="h-7 w-7 rounded-full grid place-items-center shrink-0 text-[12px] font-bold" style={{ background: r.rank === 1 ? "var(--primary)" : "var(--surface-2)", color: r.rank === 1 ? "var(--primary-fg)" : "var(--muted)" }}>
              {r.rank}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-semibold text-text-default">{r.vendorName}</span>
                <span className="badge badge-info">Score {r.score}</span>
                {r.avgUnitPricePaise && <span className="text-[11.5px] text-muted">~{paiseToINR(r.avgUnitPricePaise)}/unit</span>}
              </div>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                {r.reasons.map((reason, i) => (
                  <li key={i} className="text-[11.5px] text-muted flex items-center gap-1">
                    <Icon name="Check" size={11} style={{ color: "var(--primary)" }} /> {reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
