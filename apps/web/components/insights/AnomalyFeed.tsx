"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { paiseToINR } from "@/lib/format";
import type { AnomalyFlag, AnomalyScanResult } from "@indus/shared";

const KIND_LABEL: Record<string, string> = {
  price_spike: "Price spike",
  split_po: "Split PO",
  duplicate_invoice: "Duplicate invoice",
  round_amount: "Threshold / round amount",
};

const SEVERITY_CLASS: Record<string, string> = {
  high: "badge-danger",
  medium: "badge-warning",
  low: "badge-info",
};

function paise(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return paiseToINR(String(v));
}

/** Pull the human-relevant facts out of a flag's detail blob, per kind. */
function FlagFacts({ flag }: { flag: AnomalyFlag }) {
  const d = flag.detail as Record<string, unknown>;
  const rows: Array<[string, string]> = [];
  switch (flag.kind) {
    case "price_spike":
      rows.push(["Item", String(d.itemName ?? "—")]);
      rows.push(["Was → now", `${paise(d.previousUnitPricePaise)} → ${paise(d.currentUnitPricePaise)}`]);
      if (d.vendorName) rows.push(["Vendor", String(d.vendorName)]);
      if (d.poNumber) rows.push(["On PO", String(d.poNumber)]);
      break;
    case "split_po":
      if (d.vendorName) rows.push(["Vendor", String(d.vendorName)]);
      rows.push(["Combined", paise(d.combinedTotalPaise)]);
      rows.push(["Limit", paise(d.approvalThresholdPaise)]);
      if (Array.isArray(d.poNumbers)) rows.push(["POs", (d.poNumbers as string[]).join(", ")]);
      break;
    case "duplicate_invoice":
      if (d.vendorName) rows.push(["Vendor", String(d.vendorName)]);
      rows.push(["Invoice #", String(d.invoiceNumber ?? "—")]);
      rows.push(["Amount", paise(d.amountPaise)]);
      rows.push(["Seen", `${d.occurrences ?? 2}×`]);
      break;
    case "round_amount":
      if (d.poNumber) rows.push(["PO", String(d.poNumber)]);
      rows.push(["Total", paise(d.totalPaise)]);
      if (d.pctOfThreshold) rows.push(["% of limit", `${d.pctOfThreshold}%`]);
      break;
  }
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5">
      {rows.map(([k, v]) => (
        <span key={k} className="text-[11.5px]">
          <span className="text-muted">{k}: </span>
          <span className="text-text-default font-medium">{v}</span>
        </span>
      ))}
    </div>
  );
}

export function AnomalyFeed() {
  const [result, setResult] = useState<AnomalyScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api<AnomalyScanResult>("/api/copilot/anomalies")
      .then((r) => {
        setResult(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load anomalies"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const r = await api<AnomalyScanResult>("/api/copilot/anomalies/scan", { method: "POST" });
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function dismiss(id: string) {
    // optimistic remove
    setResult((prev) => (prev ? { ...prev, flags: prev.flags.filter((f) => f.id !== id) } : prev));
    try {
      await api(`/api/copilot/anomalies/${id}`, { method: "PATCH", body: JSON.stringify({ status: "dismissed" }) });
    } catch {
      load(); // restore on failure
    }
  }

  const flags = result?.flags ?? [];
  const counts = result?.countsByKind ?? {};

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(KIND_LABEL).map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-medium"
              style={{ background: "var(--surface)", color: "var(--text)" }}
            >
              {KIND_LABEL[k]}
              <span className="tabular-nums font-bold" style={{ color: counts[k] ? "var(--danger-fg, var(--text))" : "var(--muted)" }}>
                {counts[k] ?? 0}
              </span>
            </span>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => void runScan()} disabled={scanning}>
          <Icon name="RefreshCw" size={13} className={scanning ? "animate-spin" : undefined} />
          {scanning ? "Scanning…" : "Run scan"}
        </button>
      </div>

      {error && (
        <div className="rounded p-2.5 text-xs flex items-start gap-2" style={{ background: "var(--warning-bg)", color: "var(--warning-fg)" }}>
          <Icon name="TriangleAlert" size={14} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <p className="text-[12.5px] text-muted p-4">Loading flags…</p>
      ) : flags.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="h-10 w-10 rounded-md mx-auto grid place-items-center mb-2.5" style={{ background: "var(--success-bg)", color: "var(--success-fg)" }}>
            <Icon name="ShieldCheck" size={18} />
          </div>
          <h3 className="text-[14px] font-semibold tracking-tight mb-1">No anomalies flagged</h3>
          <p className="text-[12px] text-muted max-w-sm mx-auto">
            Run a scan to check recent purchasing for price spikes, split POs, duplicate invoices and
            amounts that sit just under approval limits.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map((f) => (
            <div key={f.id} className="card p-3 flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg grid place-items-center shrink-0 mt-0.5" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                <Icon name={f.kind === "duplicate_invoice" ? "Copy" : f.kind === "split_po" ? "GitCompareArrows" : "ShieldAlert"} size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`badge ${SEVERITY_CLASS[f.severity] ?? "badge-info"}`}>{f.severity}</span>
                  <span className="text-[11px] text-muted font-medium uppercase tracking-wide">{KIND_LABEL[f.kind] ?? f.kind}</span>
                </div>
                <p className="text-[13px] font-medium text-text-default mt-1 leading-snug">{f.title}</p>
                <FlagFacts flag={f} />
              </div>
              <button className="btn btn-ghost btn-sm shrink-0" onClick={() => void dismiss(f.id)} title="Dismiss this flag">
                <Icon name="Ban" size={13} /> Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
