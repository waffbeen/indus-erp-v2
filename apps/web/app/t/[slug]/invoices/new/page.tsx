"use client";
import React, { useEffect, useState, type FormEvent } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { FormSheet } from "@/components/FormSheet";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR } from "@/lib/format";
import { vendorInvoiceCreateSchema, type VendorInvoiceCreateInput } from "@indus/shared";
import { validate, apiErrorToFormErrors, emptyErrors, type FormErrorState } from "@/lib/form-errors";

type SourceType = "grn" | "po";

interface GrnLite { id: string; grnNumber: string | null; vendorName: string | null; poNumber: string | null; status: string; }
interface PoLite { id: string; poNumber: string | null; title: string; status: string; }

interface DraftLine {
  poItemId: string | null;
  grnItemId: string | null;
  itemId: string | null;
  itemName: string;
  uom: string;
  quantity: number;
  unitPrice: number;
}
interface DraftResponse {
  source: { type: SourceType; poId: string | null; poNumber: string | null; grnId: string | null; grnNumber?: string | null };
  header: { companyId: string; unitId: string; vendorId: string; poId: string | null; grnId: string | null };
  items: DraftLine[];
}

interface FormLine extends DraftLine { tax: number; }

export default function NewInvoicePage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const sp = useSearchParams();
  const base = `/t/${params?.slug ?? ""}/invoices`;

  const initialFromPo = sp?.get("fromPo") ?? null;
  const initialFromGrn = sp?.get("fromGrn") ?? null;

  const [sourceType, setSourceType] = useState<SourceType>(initialFromPo && !initialFromGrn ? "po" : "grn");
  const [grns, setGrns] = useState<GrnLite[]>([]);
  const [pos, setPos] = useState<PoLite[]>([]);
  const [sourceId, setSourceId] = useState<string>(initialFromGrn ?? initialFromPo ?? "");
  const [draft, setDraft] = useState<DraftResponse | null>(null);

  const [form, setForm] = useState({
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    remarks: "",
  });
  const [items, setItems] = useState<FormLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);

  useEffect(() => {
    (async () => {
      try {
        const [grnResp, poResp] = await Promise.all([
          api<{ items: GrnLite[] }>("/api/grn?pageSize=100"),
          api<{ items: PoLite[] }>("/api/po?pageSize=100"),
        ]);
        setGrns(grnResp.items.filter((g) => ["accepted", "partially_accepted"].includes(g.status)));
        setPos(poResp.items.filter((p) => ["approved", "sent_to_vendor", "partially_received", "received"].includes(p.status)));
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load sources", fields: {} });
      }
    })();
  }, []);

  useEffect(() => {
    if (!sourceId) { setDraft(null); setItems([]); return; }
    (async () => {
      try {
        const path = sourceType === "grn"
          ? `/api/vendor-invoices/from-grn/${sourceId}`
          : `/api/vendor-invoices/from-po/${sourceId}`;
        const d = await api<DraftResponse>(path);
        setDraft(d);
        setItems(d.items.map((it) => ({ ...it, tax: 0 })));
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load source details", fields: {} });
      }
    })();
  }, [sourceId, sourceType]);

  function setItem(idx: number, patch: Partial<FormLine>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeRow(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  function switchSource(t: SourceType) {
    setSourceType(t);
    setSourceId("");
    setDraft(null);
    setItems([]);
  }

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const taxTotal = items.reduce((s, it) => s + (it.tax || 0), 0);
  const grandTotal = subtotal + taxTotal;

  async function handleSave(e?: FormEvent) {
    e?.preventDefault();
    if (submitting) return;
    if (!draft) { setErrors({ summary: "Pick a source GRN or PO first", fields: {} }); return; }
    if (!items.length) { setErrors({ summary: "Add at least one line", fields: {} }); return; }

    const payload: VendorInvoiceCreateInput = {
      companyId: draft.header.companyId,
      unitId: draft.header.unitId,
      vendorId: draft.header.vendorId,
      poId: draft.header.poId,
      grnId: draft.header.grnId,
      invoiceNumber: form.invoiceNumber,
      invoiceDate: form.invoiceDate,
      remarks: form.remarks ?? "",
      items: items.map((it) => ({
        poItemId: it.poItemId,
        grnItemId: it.grnItemId,
        itemId: it.itemId,
        itemName: it.itemName,
        uom: it.uom,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        tax: it.tax || 0,
      })),
    };

    const result = validate(vendorInvoiceCreateSchema, payload);
    if (!result.ok) { setErrors(result.errors); return; }

    setErrors(emptyErrors);
    setSubmitting(true);
    try {
      const inv = await api<{ id: string }>("/api/vendor-invoices", { method: "POST", body: JSON.stringify(result.data) });
      toast.success("Invoice captured", "3-way match has been run against the PO and GRN.");
      router.push(`${base}/${inv.id}`);
    } catch (err) {
      setErrors(apiErrorToFormErrors(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormSheet
      title="Capture Vendor Invoice"
      subtitle={draft ? `From ${draft.source.type === "grn" ? draft.source.grnNumber ?? "GRN" : draft.source.poNumber ?? "PO"}` : "Pre-fill from a GRN (recommended) or a PO"}
      onClose={() => router.push(base)}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push(base)}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSave()} disabled={submitting || !draft}>
            {submitting ? "Saving…" : "Save & match"} <Icon name="ArrowRight" size={13} />
          </button>
        </>
      }
    >
      {errors.summary && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="AlertTriangle" size={14} />
          <span className="flex-1">{errors.summary}</span>
        </div>
      )}

      {/* Source picker */}
      {!draft && (
        <div className="card p-6 mb-5 space-y-4">
          <div>
            <label className="label">Invoice against</label>
            <div className="flex gap-2">
              <button type="button" className={`btn btn-sm ${sourceType === "grn" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchSource("grn")}>
                <Icon name="PackageCheck" size={14} /> A GRN (receipt)
              </button>
              <button type="button" className={`btn btn-sm ${sourceType === "po" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchSource("po")}>
                <Icon name="ShoppingCart" size={14} /> A PO (order)
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Matching against a GRN gives the strongest 3-way check (PO price × received qty). A PO-only invoice matches on price and flags qty not yet received.
            </p>
          </div>

          <div>
            <label className="label">{sourceType === "grn" ? "Select a GRN" : "Select a PO"}</label>
            <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">— Choose —</option>
              {sourceType === "grn"
                ? grns.map((g) => <option key={g.id} value={g.id}>{g.grnNumber ?? g.id} · {g.vendorName ?? ""} {g.poNumber ? `· ${g.poNumber}` : ""}</option>)
                : pos.map((p) => <option key={p.id} value={p.id}>{p.poNumber ?? p.title} · {p.status}</option>)}
            </select>
            {sourceType === "grn" && grns.length === 0 && <p className="mt-2 text-xs text-muted">No accepted GRNs available. Receive goods against a PO first.</p>}
            {sourceType === "po" && pos.length === 0 && <p className="mt-2 text-xs text-muted">No approved/sent POs available.</p>}
          </div>
        </div>
      )}

      {draft && (
        <form onSubmit={handleSave}>
          <div className="card p-6 mb-5 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Invoice header</p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <label className="label">Vendor invoice number <span className="text-danger">*</span></label>
                <input className="input font-mono" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="e.g. INV/2026/0042" required />
              </div>
              <div>
                <label className="label">Invoice date <span className="text-danger">*</span></label>
                <input type="date" className="input" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} required />
              </div>
              <div className="flex items-end">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchSource(sourceType)}>
                  <Icon name="RotateCcw" size={13} /> Change source
                </button>
              </div>
            </div>
            <div>
              <label className="label">Remarks</label>
              <textarea className="input" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Notes for the approver…" />
            </div>
          </div>

          <div className="card overflow-hidden mb-5">
            <div className="px-6 py-4 border-b border-border">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Billed lines</p>
              <p className="text-sm text-muted mt-0.5">Edit quantity, price and tax to match the supplier's bill. The 3-way match runs when you save.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold w-12">#</th>
                    <th className="text-left px-3 py-2 font-semibold min-w-[200px]">Item</th>
                    <th className="text-left px-3 py-2 font-semibold w-28">Qty</th>
                    <th className="text-left px-3 py-2 font-semibold w-32">Unit price (₹)</th>
                    <th className="text-left px-3 py-2 font-semibold w-28">Tax (₹)</th>
                    <th className="text-right px-3 py-2 font-semibold w-32">Line total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const lineTotal = it.quantity * it.unitPrice + (it.tax || 0);
                    return (
                      <tr key={idx} className="border-t border-border align-top">
                        <td className="px-3 py-2 text-muted text-xs pt-3.5">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <p className="font-semibold">{it.itemName}</p>
                          <p className="text-[11px] text-muted">UOM: <span className="font-mono">{it.uom}</span></p>
                        </td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 tabular-nums" type="number" step="0.001" min="0" value={it.quantity || 0}
                            onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 tabular-nums" type="number" step="0.01" min="0" value={it.unitPrice || 0}
                            onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 tabular-nums" type="number" step="0.01" min="0" value={it.tax || 0}
                            onChange={(e) => setItem(idx, { tax: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-right pt-3">
                          {lineTotal > 0 ? paiseToINR(lineTotal * 100) : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 pt-3">
                          <button type="button" className="text-muted hover:text-danger-fg" onClick={() => removeRow(idx)} title="Remove line">
                            <Icon name="Trash2" size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td colSpan={5} className="px-3 py-2 text-right text-muted">Subtotal</td>
                    <td className="px-3 py-2 tabular-nums text-right">{paiseToINR(subtotal * 100)}</td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right text-muted">Tax</td>
                    <td className="px-3 py-2 tabular-nums text-right">{paiseToINR(taxTotal * 100)}</td>
                    <td />
                  </tr>
                  <tr className="border-t-2 border-border bg-surface">
                    <td colSpan={5} className="px-3 py-3 text-right font-semibold">Invoice total</td>
                    <td className="px-3 py-3 font-bold tabular-nums text-right">{paiseToINR(grandTotal * 100)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </form>
      )}
    </FormSheet>
  );
}
