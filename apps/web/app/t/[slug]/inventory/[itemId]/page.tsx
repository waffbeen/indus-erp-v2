"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon, type IconProps } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeading } from "@/components/SectionHeading";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, formatDate, formatDateTime } from "@/lib/format";

interface Movement {
  id: string;
  sourceType: string;
  sourceId: string | null;
  sourceRef: string | null;
  unitId: string;
  unitName: string;
  qty: number;
  uom: string;
  unitPricePaise: string;
  batchNumber: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
  remarks: string | null;
  runningBalance: number;
  actorName: string;
  createdAt: string;
}

interface Ledger {
  item: {
    id: string;
    name: string;
    code: string | null;
    itemGroupName: string | null;
    itemSubGroupName: string | null;
    hsnCode: string | null;
    uom: string;
  };
  movements: Movement[];
}

interface Unit { id: string; name: string; code: string | null; companyId: string; }
interface Company { id: string; name: string; isPrimary: boolean; }

type ModalKind = null | "issue" | "adjust-in" | "adjust-out";

const SOURCE_META: Record<string, { icon: IconProps["name"]; tint: string; label: string }> = {
  grn:           { icon: "PackageCheck",   tint: "badge-tint-mint",  label: "GRN" },
  grn_reversal:  { icon: "Undo2",          tint: "badge-tint-blush", label: "GRN reversed" },
  issue:         { icon: "ArrowDownToLine",tint: "badge-tint-peach", label: "Issued" },
  adjustment:    { icon: "SlidersHorizontal",        tint: "badge-tint-lilac", label: "Adjustment" },
  opening:       { icon: "Layers",         tint: "badge-info",       label: "Opening" },
  transfer_in:   { icon: "ArrowDownToLine",tint: "badge-tint-mint",  label: "Transfer in" },
  transfer_out:  { icon: "ArrowUpFromLine",tint: "badge-tint-peach", label: "Transfer out" },
};

export default function ItemLedgerPage() {
  const params = useParams<{ slug: string; itemId: string }>();
  const slug = params?.slug ?? "";
  const base = `/t/${slug}/inventory`;

  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  // Form state for issue / adjust
  const [units, setUnits] = useState<Unit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [qty, setQty] = useState<string>("");
  const [batchNumber, setBatchNumber] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<Ledger>(`/api/stock/ledger/${params?.itemId}`);
      setLedger(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load ledger");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params?.itemId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.itemId]);

  useEffect(() => {
    Promise.all([
      api<Company[]>("/api/tenant/companies"),
      api<Unit[]>("/api/tenant/units"),
    ]).then(([c, u]) => {
      setCompanies(c);
      setUnits(u);
      const primary = c.find((x) => x.isPrimary) ?? c[0];
      if (primary) {
        setCompanyId(primary.id);
        const firstUnit = u.find((x) => x.companyId === primary.id);
        if (firstUnit) setUnitId(firstUnit.id);
      }
    }).catch(() => { /* noop */ });
  }, []);

  function openModal(k: ModalKind) {
    setQty("");
    setBatchNumber("");
    setMfgDate("");
    setExpiryDate("");
    setRemarks("");
    setModal(k);
  }

  async function submitMovement() {
    if (!ledger || submitting) return;
    const numQty = Number(qty);
    if (!Number.isFinite(numQty) || numQty <= 0) {
      toast.error("Invalid quantity", "Enter a number greater than zero.");
      return;
    }
    if (!unitId) {
      toast.error("Warehouse required", "Pick a warehouse.");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        companyId,
        unitId,
        itemId: ledger.item.id,
        qty: numQty,
        uom: ledger.item.uom,
        batchNumber: batchNumber || undefined,
        mfgDate: mfgDate || undefined,
        expiryDate: expiryDate || undefined,
        remarks: remarks || undefined,
      };
      if (modal === "issue") {
        await api(`/api/stock/issue`, { method: "POST", body: JSON.stringify(body) });
        toast.success("Stock issued", `${numQty} ${ledger.item.uom} removed from stock.`);
      } else if (modal === "adjust-in" || modal === "adjust-out") {
        await api(`/api/stock/adjust`, {
          method: "POST",
          body: JSON.stringify({ ...body, direction: modal === "adjust-in" ? "in" : "out" }),
        });
        toast.success("Stock adjusted", `${modal === "adjust-in" ? "+" : "−"}${numQty} ${ledger.item.uom}.`);
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error("Could not save", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !ledger) return <div className="p-6 text-center text-xs text-muted">Loading…</div>;
  if (error) return (
    <>
      <Link href={base} className="text-[11px] text-muted hover:text-text-default">← Back</Link>
      <div className="mt-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs">{error}</div>
    </>
  );
  if (!ledger) return null;

  // Compute current on-hand per warehouse for the meta strip
  const balances = new Map<string, { unitName: string; balance: number }>();
  for (const m of [...ledger.movements].reverse()) {
    // already running in service; just take the LAST (i.e. newest) per unit
  }
  for (const m of ledger.movements) {
    if (!balances.has(m.unitId)) balances.set(m.unitId, { unitName: m.unitName, balance: m.runningBalance });
  }
  const totalOnHand = Array.from(balances.values()).reduce((s, b) => s + b.balance, 0);

  const filteredUnits = units.filter((u) => u.companyId === companyId);

  return (
    <>
      <div className="flex items-center gap-2 mb-2 text-[11px] text-muted">
        <Link href={base} className="hover:text-text-default">Inventory</Link>
        <Icon name="ChevronRight" size={12} />
        <span className="text-text-default font-medium">{ledger.item.name}</span>
      </div>

      <PageHeader
        title={ledger.item.name}
        subtitle={
          <>
            {ledger.item.code && <><span className="font-mono">{ledger.item.code}</span> · </>}
            {ledger.item.itemGroupName ?? "Uncategorised"}
            {ledger.item.hsnCode && <> · HSN <span className="font-mono">{ledger.item.hsnCode}</span></>}
          </>
        }
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => openModal("adjust-in")} title="Add to stock manually">
              <Icon name="Plus" size={14} /> Adjust +
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => openModal("adjust-out")} title="Remove from stock manually">
              <Icon name="Minus" size={14} /> Adjust −
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => openModal("issue")}>
              <Icon name="ArrowDownToLine" size={14} /> Issue stock
            </button>
          </>
        }
      />

      {/* On-hand summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
        <div className="card p-2.5">
          <div className="flex items-center gap-1.5 text-muted">
            <Icon name="Layers" size={12} />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Total on hand</span>
          </div>
          <div className="text-base font-bold tabular-nums leading-tight mt-1">
            {totalOnHand.toLocaleString("en-IN", { maximumFractionDigits: 3 })} <span className="text-[11px] font-normal text-muted">{ledger.item.uom}</span>
          </div>
        </div>
        {Array.from(balances.entries()).map(([uid, b]) => (
          <div key={uid} className="card p-2.5">
            <div className="flex items-center gap-1.5 text-muted">
              <Icon name="Warehouse" size={12} />
              <span className="text-[10px] font-semibold uppercase tracking-wider truncate">{b.unitName}</span>
            </div>
            <div className={`text-base font-bold tabular-nums leading-tight mt-1 ${b.balance < 0 ? "text-danger-fg" : ""}`}>
              {b.balance.toLocaleString("en-IN", { maximumFractionDigits: 3 })}
            </div>
          </div>
        ))}
      </div>

      {/* Ledger table */}
      <div className="card overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <SectionHeading title="Movement ledger" size="sm" subtitle={`${ledger.movements.length} movements (newest first)`} />
        </div>
        {ledger.movements.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs text-muted">No movements yet. Receive a GRN or adjust manually to populate.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">When</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Source</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Reference</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Warehouse</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Qty</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Running balance</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Batch</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">By</th>
              </tr>
            </thead>
            <tbody>
              {ledger.movements.map((m) => {
                const meta = SOURCE_META[m.sourceType] ?? { icon: "Circle" as IconProps["name"], tint: "badge-info", label: m.sourceType };
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-1.5 text-[11px] text-muted whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                    <td className="px-3 py-1.5">
                      <span className={`badge ${meta.tint} text-[10px]`}>
                        <Icon name={meta.icon} size={11} /> {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{m.sourceRef ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[11px]">{m.unitName}</td>
                    <td className={`px-3 py-1.5 tabular-nums text-right font-semibold ${m.qty < 0 ? "text-danger-fg" : "text-success-fg"}`}>
                      {m.qty > 0 ? "+" : ""}{m.qty.toLocaleString("en-IN", { maximumFractionDigits: 3 })}
                    </td>
                    <td className={`px-3 py-1.5 tabular-nums text-right ${m.runningBalance < 0 ? "text-danger-fg" : ""}`}>
                      {m.runningBalance.toLocaleString("en-IN", { maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-3 py-1.5 text-[11px]">
                      {m.batchNumber ? (
                        <div className="flex flex-wrap gap-1">
                          <span className="font-mono">{m.batchNumber}</span>
                          {m.mfgDate && <span className="text-muted">mfg {formatDate(m.mfgDate)}</span>}
                          {m.expiryDate && <span className="text-muted">exp {formatDate(m.expiryDate)}</span>}
                        </div>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-muted">{m.actorName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Issue / adjust modal */}
      <Modal
        open={modal !== null}
        onClose={() => !submitting && setModal(null)}
        title={
          modal === "issue" ? "Issue stock" :
          modal === "adjust-in" ? "Adjust stock (add)" :
          modal === "adjust-out" ? "Adjust stock (remove)" :
          ""
        }
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)} disabled={submitting}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={submitMovement} disabled={submitting || !qty || !unitId}>
              {submitting ? "Saving…" : "Confirm"}
            </button>
          </>
        }
      >
        <div className="space-y-2.5">
          <div className="text-[12px] text-muted leading-relaxed">
            {modal === "issue" && <>Stock will be <strong className="text-danger-fg">reduced</strong> from the chosen warehouse. Use this when material is issued to a department or consumed.</>}
            {modal === "adjust-in" && <>Stock will be <strong className="text-success-fg">increased</strong>. Use for opening balance, found stock, returns from issue, etc.</>}
            {modal === "adjust-out" && <>Stock will be <strong className="text-danger-fg">decreased</strong>. Use for write-offs, damage, missing stock.</>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Company</label>
              <select className="input" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setUnitId(""); }}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Warehouse <span className="text-danger">*</span></label>
              <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Select…</option>
                {filteredUnits.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Quantity ({ledger.item.uom}) <span className="text-danger">*</span></label>
              <input
                type="number"
                step="0.001"
                min="0"
                className="input tabular-nums"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Batch # (optional)</label>
              <input className="input font-mono" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="B-2026-001" />
            </div>
            <div>
              <label className="label">Mfg date</label>
              <input type="date" className="input" value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Expiry date</label>
              <input type="date" className="input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Remarks</label>
            <textarea className="input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Reason / reference for this movement" />
          </div>
        </div>
      </Modal>
    </>
  );
}
