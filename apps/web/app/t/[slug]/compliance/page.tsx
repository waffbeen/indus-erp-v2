"use client";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Icon, type IconProps } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, formatDate, formatDateTime } from "@/lib/format";
import type {
  EInvoiceListItem,
  EInvoiceView,
  EWayBillListItem,
  GstSettingsView,
  GstinView,
  GstReturnsSummaryResponse,
  GstTaxBucket,
  Reconcile2bResult,
  Reconcile2bLine,
} from "@indus/shared";

interface PoLite { id: string; poNumber: string | null; title: string; status: string; }
interface PoListResp { items: PoLite[]; total: number; }

type TabKey = "einvoices" | "eway" | "returns" | "gstin" | "settings";

const TABS: { key: TabKey; label: string; icon: IconProps["name"]; adminOnly?: boolean }[] = [
  { key: "einvoices", label: "E-Invoices", icon: "ReceiptIndianRupee" },
  { key: "eway", label: "E-Way Bills", icon: "Truck" },
  { key: "returns", label: "GST Returns", icon: "FileSpreadsheet" },
  { key: "gstin", label: "GSTIN Check", icon: "BadgeCheck" },
  { key: "settings", label: "Settings", icon: "KeyRound", adminOnly: true },
];

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    generated: "badge-success",
    pending: "badge-warning",
    cancelled: "badge-tint-blush",
    failed: "badge-danger",
  };
  return <span className={`badge ${map[status] ?? "badge-info"}`}>{status}</span>;
}

export default function CompliancePage() {
  const { me } = useAuth();
  const isAdmin = !!me?.isTenantAdmin;
  const [tab, setTab] = useState<TabKey>("einvoices");

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <>
      <PageHeader
        title="GST & Compliance"
        subtitle="E-invoicing (IRN/QR), e-way bills, GST returns & GSTR-2B reconciliation, and GSTIN verification."
      />

      <div className="mb-4 flex items-center gap-0.5 border-b border-border overflow-x-auto no-scrollbar">
        {visibleTabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-3 py-2 text-[12.5px] font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
                active ? "text-text-default" : "text-muted hover:text-text-default"
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
              {active && <span className="absolute left-0 right-0 -bottom-px h-0.5" style={{ background: "var(--primary)" }} />}
            </button>
          );
        })}
      </div>

      {tab === "einvoices" && <EInvoicesTab />}
      {tab === "eway" && <EWayTab />}
      {tab === "returns" && <ReturnsTab />}
      {tab === "gstin" && <GstinTab />}
      {tab === "settings" && isAdmin && <SettingsTab />}
    </>
  );
}

/* ----------------------------- shared bits ----------------------------- */

function Card({ title, subtitle, children, actions }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-[14px]">{title}</h2>
          {subtitle && <p className="text-[12px] text-muted mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function usePos() {
  const [pos, setPos] = useState<PoLite[]>([]);
  useEffect(() => {
    api<PoListResp>("/api/po?pageSize=100")
      .then((r) => setPos(r.items ?? []))
      .catch(() => setPos([]));
  }, []);
  return pos;
}

function poLabel(p: PoLite) {
  return `${p.poNumber ?? "(draft)"} — ${p.title}`;
}

/* ------------------------------- E-Invoices ------------------------------- */

function EInvoicesTab() {
  const pos = usePos();
  const [list, setList] = useState<EInvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [detail, setDetail] = useState<EInvoiceView | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api<{ items: EInvoiceListItem[] }>("/api/compliance/e-invoices");
      setList(r.items);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function doPreview() {
    if (!sourceId) { toast.error("Pick a PO", "Choose a purchase order to build the e-invoice from."); return; }
    setBusy(true);
    try {
      const r = await api<{ payload: Record<string, unknown> }>("/api/compliance/e-invoices/preview", {
        method: "POST",
        body: JSON.stringify({ sourceType: "po", sourceId }),
      });
      setPreview(JSON.stringify(r.payload, null, 2));
    } catch (err) {
      toast.error("Could not build payload", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  async function doGenerate() {
    if (!sourceId) { toast.error("Pick a PO", "Choose a purchase order first."); return; }
    setBusy(true);
    try {
      const r = await api<EInvoiceView>("/api/compliance/e-invoices/generate", {
        method: "POST",
        body: JSON.stringify({ sourceType: "po", sourceId }),
      });
      toast.success("IRN generated", `IRN ${r.irn?.slice(0, 16)}… for ${r.docNumber ?? ""}`);
      setDetail(r);
      setPreview(null);
      void load();
    } catch (err) {
      toast.error("Generation failed", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    try {
      setDetail(await api<EInvoiceView>(`/api/compliance/e-invoices/${id}`));
    } catch (err) {
      toast.error("Could not open", err instanceof ApiError ? err.message : "Try again");
    }
  }

  async function cancel(id: string) {
    const remark = window.prompt("Reason for cancelling this IRN (required):");
    if (!remark) return;
    try {
      const r = await api<EInvoiceView>(`/api/compliance/e-invoices/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "2", remark }),
      });
      toast.success("IRN cancelled");
      setDetail(r);
      void load();
    } catch (err) {
      toast.error("Could not cancel", err instanceof ApiError ? err.message : "Try again");
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Generate e-invoice" subtitle="Build the GST e-invoice JSON (schema v1.1) from a PO and register it to get an IRN + signed QR.">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[260px]">
            <label className="label">Source purchase order</label>
            <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">— Select a PO —</option>
              {pos.map((p) => <option key={p.id} value={p.id}>{poLabel(p)}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => void doPreview()} disabled={busy}>
            <Icon name="FileJson" size={13} /> Preview JSON
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => void doGenerate()} disabled={busy}>
            <Icon name="ReceiptIndianRupee" size={13} /> {busy ? "Working…" : "Generate IRN"}
          </button>
        </div>
        {preview && (
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-border bg-surface p-3 text-[11px] font-mono leading-relaxed">
            {preview}
          </pre>
        )}
      </Card>

      {detail && <EInvoiceDetail inv={detail} onCancel={() => void cancel(detail.id)} onClose={() => setDetail(null)} />}

      <Card title="E-Invoices" subtitle="IRNs registered for this workspace.">
        {loading ? (
          <p className="text-[12px] text-muted">Loading…</p>
        ) : list.length === 0 ? (
          <EmptyHint icon="ReceiptIndianRupee" text="No e-invoices yet. Generate one from a PO above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-surface">
                <tr>
                  {["Doc #", "IRN", "Ack #", "Ack date", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className="border-t border-border hover:bg-surface/60 cursor-pointer" onClick={() => void openDetail(e.id)}>
                    <td className="px-3 py-2 font-mono">{e.docNumber ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted">{e.irn ? `${e.irn.slice(0, 20)}…` : "—"}</td>
                    <td className="px-3 py-2 font-mono">{e.ackNo ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{e.ackDate ? formatDate(e.ackDate) : "—"}</td>
                    <td className="px-3 py-2"><StatusPill status={e.status} /></td>
                    <td className="px-3 py-2 text-right text-muted"><Icon name="ChevronRight" size={14} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function EInvoiceDetail({ inv, onCancel, onClose }: { inv: EInvoiceView; onCancel: () => void; onClose: () => void }) {
  const qr = useMemo(() => {
    if (!inv.signedQrBase64) return null;
    try { return JSON.stringify(JSON.parse(atob(inv.signedQrBase64)), null, 2); } catch { return inv.signedQrBase64; }
  }, [inv.signedQrBase64]);

  return (
    <Card
      title={<span className="flex items-center gap-2"><Icon name="ScanLine" size={15} /> {inv.docNumber ?? "E-Invoice"}</span>}
      subtitle={<>Status <StatusPill status={inv.status} /></>}
      actions={
        <div className="flex items-center gap-1.5">
          {inv.status === "generated" && (
            <button className="btn btn-ghost btn-sm" onClick={onCancel}><Icon name="Ban" size={13} /> Cancel IRN</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="X" size={13} /></button>
        </div>
      }
    >
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
        <Field label="IRN" value={inv.irn} mono />
        <Field label="Ack No" value={inv.ackNo} mono />
        <Field label="Ack Date" value={inv.ackDate ? formatDateTime(inv.ackDate) : null} />
        <Field label="Cancelled" value={inv.cancelledAt ? formatDateTime(inv.cancelledAt) : null} />
      </dl>
      {inv.errorMsg && (
        <div className="mt-3 rounded p-2.5 bg-danger-bg text-danger-fg text-[12px] flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} /><span>{inv.errorMsg}</span>
        </div>
      )}
      {qr && (
        <div className="mt-3">
          <div className="label flex items-center gap-1.5"><Icon name="QrCode" size={13} /> Signed QR payload</div>
          <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-surface p-3 text-[11px] font-mono">{qr}</pre>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------- E-Way Bills ------------------------------- */

function EWayTab() {
  const pos = usePos();
  const [list, setList] = useState<EWayBillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceId, setSourceId] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [distanceKm, setDistanceKm] = useState("120");
  const [transMode, setTransMode] = useState("road");
  const [transporterName, setTransporterName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api<{ items: EWayBillListItem[] }>("/api/compliance/e-way-bills");
      setList(r.items);
    } catch { /* noop */ } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!sourceId || !vehicleNo.trim()) { toast.error("Almost there", "Pick a PO and enter the vehicle number."); return; }
    setBusy(true);
    try {
      const r = await api<EWayBillListItem>("/api/compliance/e-way-bills/generate", {
        method: "POST",
        body: JSON.stringify({
          sourceType: "po",
          sourceId,
          vehicleNo: vehicleNo.trim(),
          distanceKm: Number(distanceKm) || 0,
          transMode,
          transporterName: transporterName.trim() || null,
        }),
      });
      toast.success("E-way bill generated", `EWB ${r.ewbNo}, valid till ${r.validUpto ? formatDate(r.validUpto) : "—"}`);
      setVehicleNo("");
      void load();
    } catch (err) {
      toast.error("Generation failed", err instanceof ApiError ? err.message : "Try again");
    } finally { setBusy(false); }
  }

  async function cancel(id: string) {
    const remark = window.prompt("Reason for cancelling this e-way bill (required):");
    if (!remark) return;
    try {
      await api(`/api/compliance/e-way-bills/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "3", remark }) });
      toast.success("E-way bill cancelled");
      void load();
    } catch (err) {
      toast.error("Could not cancel", err instanceof ApiError ? err.message : "Try again");
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Generate e-way bill" subtitle="Validity is derived from distance (~1 day per 200 km).">
        <form onSubmit={generate} className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[240px]">
              <label className="label">Source purchase order</label>
              <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">— Select a PO —</option>
                {pos.map((p) => <option key={p.id} value={p.id}>{poLabel(p)}</option>)}
              </select>
            </div>
            <div className="w-40">
              <label className="label">Vehicle no.</label>
              <input className="input font-mono" placeholder="MH12AB1234" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
            </div>
            <div className="w-28">
              <label className="label">Distance (km)</label>
              <input className="input font-mono" inputMode="numeric" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
            </div>
            <div className="w-32">
              <label className="label">Mode</label>
              <select className="input" value={transMode} onChange={(e) => setTransMode(e.target.value)}>
                <option value="road">Road</option>
                <option value="rail">Rail</option>
                <option value="air">Air</option>
                <option value="ship">Ship</option>
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="label">Transporter (optional)</label>
              <input className="input" placeholder="Transporter name" value={transporterName} onChange={(e) => setTransporterName(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            <Icon name="Truck" size={13} /> {busy ? "Working…" : "Generate EWB"}
          </button>
        </form>
      </Card>

      <Card title="E-Way Bills" subtitle="Transport documents raised for this workspace.">
        {loading ? (
          <p className="text-[12px] text-muted">Loading…</p>
        ) : list.length === 0 ? (
          <EmptyHint icon="Truck" text="No e-way bills yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-surface">
                <tr>
                  {["EWB #", "Vehicle", "Mode", "Distance", "Valid upto", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{b.ewbNo ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{b.vehicleNo ?? "—"}</td>
                    <td className="px-3 py-2 text-muted capitalize">{b.transMode ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{b.distanceKm} km</td>
                    <td className="px-3 py-2 text-muted">{b.validUpto ? formatDate(b.validUpto) : "—"}</td>
                    <td className="px-3 py-2"><StatusPill status={b.status} /></td>
                    <td className="px-3 py-2 text-right">
                      {b.status === "generated" && (
                        <button className="text-[11px] text-muted hover:text-danger-fg" onClick={() => void cancel(b.id)} title="Cancel">
                          <Icon name="Ban" size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------- Returns -------------------------------- */

function nowPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function bucketTax(b: GstTaxBucket): string {
  // tax = total − taxable (vendor invoice totals are taxable + tax)
  return String(Number(b.totalPaise) - Number(b.taxablePaise));
}

const SAMPLE_2B = JSON.stringify(
  [
    { gstin: "27AAAAA0000A1Z5", invoiceNumber: "INV-001", taxableValue: 100000, taxAmount: 18000, totalValue: 118000 },
    { gstin: "29BBBBB1111B1Z2", invoiceNumber: "INV-002", totalValue: 59000 },
  ],
  null,
  2,
);

function ReturnsTab() {
  const [period, setPeriod] = useState(nowPeriod());
  const [summary, setSummary] = useState<GstReturnsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState("");
  const [recon, setRecon] = useState<Reconcile2bResult | null>(null);
  const [reconBusy, setReconBusy] = useState(false);

  async function loadSummary() {
    setLoading(true);
    try {
      setSummary(await api<GstReturnsSummaryResponse>(`/api/compliance/returns?period=${encodeURIComponent(period)}`));
    } catch (err) {
      toast.error("Could not load returns", err instanceof ApiError ? err.message : "Try again");
    } finally { setLoading(false); }
  }
  useEffect(() => { void loadSummary(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function reconcile() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      toast.error("Invalid JSON", "Paste or upload a valid JSON array of portal rows.");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      toast.error("Nothing to reconcile", "Provide a non-empty JSON array.");
      return;
    }
    setReconBusy(true);
    try {
      const r = await api<Reconcile2bResult>("/api/compliance/returns/reconcile-2b", {
        method: "POST",
        body: JSON.stringify({ period, vendorGstData: parsed }),
      });
      setRecon(r);
      toast.success("Reconciliation complete", `${r.counts.matched} matched, ${r.counts.mismatched} mismatched`);
    } catch (err) {
      toast.error("Reconciliation failed", err instanceof ApiError ? err.message : "Try again");
    } finally { setReconBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Card
        title="GST returns"
        subtitle="Outward (GSTR-1) & summary (GSTR-3B) figures computed from your books for the period."
        actions={
          <div className="flex items-end gap-2">
            <input type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 150 }} />
            <button className="btn btn-primary btn-sm" onClick={() => void loadSummary()} disabled={loading}>
              <Icon name="RefreshCw" size={13} /> {loading ? "Loading…" : "Load"}
            </button>
          </div>
        }
      >
        {!summary ? (
          <p className="text-[12px] text-muted">Pick a period and load.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[12px] font-semibold mb-2">GSTR-1 · Outward supplies</p>
              <BucketRows b={summary.gstr1.outward} />
              {summary.gstr1.note && <p className="text-[11px] text-muted mt-2">{summary.gstr1.note}</p>}
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[12px] font-semibold mb-2">GSTR-3B · Summary</p>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted">Outward tax liability</span>
                <span className="tabular-nums font-medium">{paiseToINR(bucketTax(summary.gstr3b.outwardLiability))}</span>
              </div>
              <div className="flex items-center justify-between text-[12px] mt-1">
                <span className="text-muted">Inward ITC ({summary.gstr3b.inwardItc.count} bills)</span>
                <span className="tabular-nums font-medium text-success-fg">{paiseToINR(bucketTax(summary.gstr3b.inwardItc))}</span>
              </div>
              <div className="flex items-center justify-between text-[12px] mt-1 pt-1 border-t border-border">
                <span className="text-muted">Net tax payable</span>
                <span className="tabular-nums font-semibold">{paiseToINR(summary.gstr3b.netTaxPayablePaise)}</span>
              </div>
              {summary.gstr3b.note && <p className="text-[11px] text-muted mt-2">{summary.gstr3b.note}</p>}
            </div>
          </div>
        )}
      </Card>

      <Card title="GSTR-2B reconciliation" subtitle="Upload the vendor-side data from the portal and match it against your purchase records.">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="btn btn-ghost btn-sm cursor-pointer">
            <Icon name="Upload" size={13} /> Upload JSON
            <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          </label>
          <button className="btn btn-ghost btn-sm" onClick={() => setRaw(SAMPLE_2B)}><Icon name="FileJson" size={13} /> Use sample</button>
          <button className="btn btn-primary btn-sm" onClick={() => void reconcile()} disabled={reconBusy}>
            <Icon name="ClipboardCheck" size={13} /> {reconBusy ? "Matching…" : "Reconcile"}
          </button>
        </div>
        <textarea
          className="input font-mono text-[11px]"
          rows={6}
          placeholder='[{"gstin":"27AAAAA0000A1Z5","invoiceNumber":"INV-001","totalValue":118000}]'
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />

        {recon && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <ReconStat label="Matched" n={recon.counts.matched} tone="badge-success" />
              <ReconStat label="Mismatched" n={recon.counts.mismatched} tone="badge-warning" />
              <ReconStat label="Missing in books" n={recon.counts.missingInBooks} tone="badge-danger" />
              <ReconStat label="Missing in portal" n={recon.counts.missingInPortal} tone="badge-info" />
            </div>
            <ReconTable title="Mismatched (amounts differ)" rows={recon.mismatched} showDiff />
            <ReconTable title="In portal but not in books" rows={recon.missingInBooks} />
            <ReconTable title="In books but not in portal" rows={recon.missingInPortal} />
            <ReconTable title="Matched" rows={recon.matched} />
          </div>
        )}
      </Card>
    </div>
  );
}

function BucketRows({ b }: { b: GstTaxBucket }) {
  return (
    <div className="space-y-1 text-[12px]">
      <Row label="Documents" value={String(b.count)} />
      <Row label="Taxable value" value={paiseToINR(b.taxablePaise)} />
      <Row label="Tax" value={paiseToINR(bucketTax(b))} />
      <Row label="Total" value={paiseToINR(b.totalPaise)} bold />
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function ReconStat({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border p-2.5 text-center">
      <div className="text-lg font-semibold tabular-nums">{n}</div>
      <span className={`badge ${tone} text-[10px] mt-1`}>{label}</span>
    </div>
  );
}

function ReconTable({ title, rows, showDiff }: { title: string; rows: Reconcile2bLine[]; showDiff?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-[12px] font-semibold mb-1">{title} <span className="text-muted font-normal">({rows.length})</span></p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-[11.5px]">
          <thead className="bg-surface">
            <tr>
              {["GSTIN", "Invoice #", "Vendor", "Books", "Portal", ...(showDiff ? ["Diff"] : [])].map((h) => (
                <th key={h} className="text-left px-2.5 py-1.5 font-semibold uppercase tracking-wider text-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.gstin}-${r.invoiceNumber}-${i}`} className="border-t border-border">
                <td className="px-2.5 py-1.5 font-mono text-[10px]">{r.gstin}</td>
                <td className="px-2.5 py-1.5 font-mono">{r.invoiceNumber}</td>
                <td className="px-2.5 py-1.5 text-muted">{r.vendorName ?? "—"}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{r.bookTotalPaise ? paiseToINR(r.bookTotalPaise) : "—"}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{r.portalTotalPaise ? paiseToINR(r.portalTotalPaise) : "—"}</td>
                {showDiff && <td className="px-2.5 py-1.5 tabular-nums text-warning-fg">{r.diffPaise ? paiseToINR(r.diffPaise) : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------------- GSTIN --------------------------------- */

function GstinTab() {
  const [gstin, setGstin] = useState("");
  const [result, setResult] = useState<GstinView | null>(null);
  const [list, setList] = useState<GstinView[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await api<{ items: GstinView[] }>("/api/compliance/gstin");
      setList(r.items);
    } catch { /* noop */ }
  }
  useEffect(() => { void load(); }, []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!gstin.trim()) return;
    setBusy(true);
    try {
      const r = await api<GstinView>("/api/compliance/gstin/verify", { method: "POST", body: JSON.stringify({ gstin: gstin.trim() }) });
      setResult(r);
      if (r.formatValid) void load();
    } catch (err) {
      toast.error("Verification failed", err instanceof ApiError ? err.message : "Try again");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Card title="Verify a GSTIN" subtitle="Format-check and decode the state, PAN and registered name (cached for re-use).">
        <form onSubmit={verify} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[260px]">
            <label className="label">GSTIN</label>
            <input className="input font-mono uppercase" maxLength={15} placeholder="27AAAAA0000A1Z5" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            <Icon name="BadgeCheck" size={13} /> {busy ? "Checking…" : "Verify"}
          </button>
        </form>

        {result && (
          <div className={`mt-3 rounded-lg border p-3 ${result.formatValid ? "border-border" : "border-danger-fg/40 bg-danger-bg"}`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon name={result.formatValid ? "CircleCheckBig" : "CircleX"} size={15} className={result.formatValid ? "text-success-fg" : "text-danger-fg"} />
              <span className="font-mono font-semibold">{result.gstin}</span>
              {result.status && <span className="badge badge-info">{result.status}</span>}
            </div>
            {result.formatValid ? (
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                <Field label="Legal name" value={result.legalName} />
                <Field label="Trade name" value={result.tradeName} />
                <Field label="State" value={result.stateName ? `${result.stateName} (${result.stateCode})` : null} />
                <Field label="PAN" value={result.pan} mono />
                <Field label="Last checked" value={result.lastCheckedAt ? formatDateTime(result.lastCheckedAt) : null} />
              </dl>
            ) : (
              <p className="text-[12px] text-danger-fg">Not a valid 15-character GSTIN format.</p>
            )}
          </div>
        )}
      </Card>

      <Card title="Recent checks" subtitle="GSTINs you've verified before.">
        {list.length === 0 ? (
          <EmptyHint icon="BadgeCheck" text="No GSTINs verified yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-surface">
                <tr>
                  {["GSTIN", "Name", "State", "Status", "Checked"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((g) => (
                  <tr key={g.gstin} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-[10px]">{g.gstin}</td>
                    <td className="px-3 py-2">{g.legalName ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{g.stateName ?? "—"}</td>
                    <td className="px-3 py-2"><span className="badge badge-info">{g.status ?? "—"}</span></td>
                    <td className="px-3 py-2 text-muted">{g.lastCheckedAt ? formatDate(g.lastCheckedAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------- Settings -------------------------------- */

function SettingsTab() {
  const [view, setView] = useState<GstSettingsView | null>(null);
  const [provider, setProvider] = useState("nic_sandbox");
  const [username, setUsername] = useState("");
  const [gstin, setGstin] = useState("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function load() {
    try {
      const v = await api<GstSettingsView>("/api/compliance/settings");
      setView(v);
      setProvider(v.provider);
      setUsername(v.username ?? "");
      setGstin(v.gstin ?? "");
      setIsActive(v.isActive);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setView(null);
    }
  }
  useEffect(() => { void load(); }, []);

  function body() {
    return {
      provider,
      username: username.trim() || null,
      gstin: gstin.trim().toUpperCase() || null,
      isActive,
      ...(password.trim() ? { password: password.trim() } : {}),
    };
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const v = await api<GstSettingsView>("/api/compliance/settings", { method: "PUT", body: JSON.stringify(body()) });
      setView(v);
      setPassword("");
      toast.success("GST settings saved", v.configured ? "Compliance is ready." : undefined);
    } catch (err) {
      toast.error("Could not save", err instanceof ApiError ? err.message : "Try again");
    } finally { setSaving(false); }
  }

  async function test() {
    setTesting(true);
    try {
      const r = await api<{ ok: boolean; message: string }>("/api/compliance/settings/test", {
        method: "POST",
        body: JSON.stringify({ provider, gstin: gstin.trim().toUpperCase() || null, ...(password.trim() ? { password: password.trim() } : {}) }),
      });
      if (r.ok) toast.success("Connection OK ✓", r.message);
      else toast.error("Test failed", r.message);
    } catch (err) {
      toast.error("Test failed", err instanceof ApiError ? err.message : "Try again");
    } finally { setTesting(false); }
  }

  return (
    <Card
      title={<span className="flex items-center gap-2"><Icon name="ShieldCheck" size={15} /> GST / GSP credentials</span>}
      subtitle="Bring your own GST Suvidha Provider account. The password is stored encrypted; the sandbox works without one."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view?.configured ? (
          <span className="badge badge-success text-[11px]">Configured — {view.gstin} ({view.source})</span>
        ) : (
          <span className="badge badge-warning text-[11px]">Sandbox mode — flows are simulated</span>
        )}
        {view?.lastTestedAt && (
          <span className={`badge text-[11px] ${view.lastTestOk ? "badge-success" : "badge-danger"}`}>
            Last test {view.lastTestOk ? "passed" : "failed"}
          </span>
        )}
      </div>

      <form onSubmit={save} className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-52">
            <label className="label">Provider</label>
            <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="nic_sandbox">NIC Sandbox (simulated)</option>
              <option value="masters_india">Masters India</option>
              <option value="cleartax">ClearTax</option>
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="label">GSTIN</label>
            <input className="input font-mono uppercase" maxLength={15} placeholder="27AAAAA0000A1Z5" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="label">GSP username</label>
            <input className="input font-mono" autoComplete="off" placeholder="GSP client / username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="label">GSP password / secret</label>
            <input
              type="password"
              className="input font-mono"
              autoComplete="new-password"
              placeholder={view?.hasPassword ? "•••••••• saved — leave blank to keep" : "Required for live providers"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" className="h-4 w-4" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (use these credentials for compliance calls)
        </label>
        <p className="text-[11px] text-muted">
          Leave the provider on <strong className="text-text-default">NIC Sandbox</strong> to demo e-invoicing &amp; e-way bills without live GSP access —
          IRNs and EWB numbers are generated deterministically and never sent to a real gateway.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void test()} disabled={testing || saving}>
            <Icon name="Send" size={13} /> {testing ? "Testing…" : "Test connection"}
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || testing}>
            <Icon name="Save" size={13} /> {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------ tiny helpers ------------------------------ */

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`${mono ? "font-mono text-[11px]" : "font-medium"} text-right truncate`}>{value || "—"}</dd>
    </div>
  );
}

function EmptyHint({ icon, text }: { icon: IconProps["name"]; text: string }) {
  return (
    <div className="py-8 text-center">
      <div className="h-9 w-9 rounded-md mx-auto grid place-items-center mb-2" style={{ background: "var(--tint-mint)", color: "var(--tint-mint-fg)" }}>
        <Icon name={icon} size={16} />
      </div>
      <p className="text-[12px] text-muted">{text}</p>
    </div>
  );
}
