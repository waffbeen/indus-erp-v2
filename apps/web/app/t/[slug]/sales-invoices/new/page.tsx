"use client";
import React, { useEffect, useState, type FormEvent } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { FormSheet } from "@/components/FormSheet";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR } from "@/lib/format";
import { salesInvoiceCreateSchema, type SalesInvoiceCreateInput, type CustomerListItem } from "@indus/shared";
import { validate, apiErrorToFormErrors, emptyErrors, type FormErrorState } from "@/lib/form-errors";

type Mode = "so" | "direct";

interface Company { id: string; name: string; gstin?: string | null; isPrimary: boolean; }
interface Unit { id: string; companyId: string; name: string; code: string | null; }
interface SoLite { id: string; soNumber: string | null; title: string; status: string; customerName?: string | null; }

interface DraftLine {
  soItemId: string | null;
  itemId: string | null;
  itemName: string;
  hsnCode: string | null;
  uom: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
}
interface SoDraftResponse {
  source: { soId: string; soNumber: string | null };
  header: { companyId: string; unitId: string; customerId: string; soId: string; isInterstate: boolean; placeOfSupply: string | null };
  items: DraftLine[];
}

const blankLine = (): DraftLine => ({ soItemId: null, itemId: null, itemName: "", hsnCode: null, uom: "nos", quantity: 1, unitPrice: 0, discountPercent: 0, taxRate: 18 });

export default function NewSalesInvoicePage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const sp = useSearchParams();
  const base = `/t/${params?.slug ?? ""}/sales-invoices`;
  const fromSo = sp?.get("fromSo") ?? null;

  const [mode, setMode] = useState<Mode>(fromSo ? "so" : "direct");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [sos, setSos] = useState<SoLite[]>([]);
  const [soId, setSoId] = useState<string>(fromSo ?? "");
  const [headerLocked, setHeaderLocked] = useState(false); // locked when prefilled from an SO

  const [form, setForm] = useState({
    companyId: "",
    unitId: "",
    customerId: "",
    soId: null as string | null,
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "" as string,
    isInterstate: false,
    placeOfSupply: "",
    freightCharges: 0,
    otherCharges: 0,
    roundOff: 0,
    remarks: "",
  });
  const [items, setItems] = useState<DraftLine[]>([blankLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);

  useEffect(() => {
    (async () => {
      try {
        const [comps, us, custs, soResp] = await Promise.all([
          api<Company[]>("/api/tenant/companies"),
          api<Unit[]>("/api/tenant/units"),
          api<{ items: CustomerListItem[] }>("/api/customers?pageSize=100"),
          api<{ items: SoLite[] }>("/api/sales-orders?pageSize=100"),
        ]);
        setCompanies(comps);
        setUnits(us);
        setCustomers(custs.items);
        setSos(soResp.items.filter((s) => ["approved", "partially_fulfilled", "fulfilled"].includes(s.status)));
        const primary = comps.find((c) => c.isPrimary) ?? comps[0];
        if (primary) {
          const firstUnit = us.find((u) => u.companyId === primary.id);
          setForm((f) => ({ ...f, companyId: f.companyId || primary.id, unitId: f.unitId || (firstUnit?.id ?? "") }));
        }
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load", fields: {} });
      }
    })();
  }, []);

  // Prefill from an SO when one is picked (mode === "so").
  useEffect(() => {
    if (mode !== "so" || !soId) return;
    (async () => {
      try {
        const d = await api<SoDraftResponse>(`/api/sales-invoices/from-so/${soId}`);
        setForm((f) => ({
          ...f,
          companyId: d.header.companyId,
          unitId: d.header.unitId,
          customerId: d.header.customerId,
          soId: d.header.soId,
          isInterstate: d.header.isInterstate,
          placeOfSupply: d.header.placeOfSupply ?? "",
        }));
        setItems(d.items.length ? d.items : [blankLine()]);
        setHeaderLocked(true);
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load sales order", fields: {} });
      }
    })();
  }, [soId, mode]);

  const filteredUnits = units.filter((u) => u.companyId === form.companyId);

  function setItem(idx: number, patch: Partial<DraftLine>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addLine() { setItems((arr) => [...arr, blankLine()]); }
  function removeRow(idx: number) { setItems((arr) => arr.filter((_, i) => i !== idx)); }

  function switchMode(m: Mode) {
    setMode(m);
    setSoId("");
    setHeaderLocked(false);
    setForm((f) => ({ ...f, soId: null }));
    if (m === "direct") setItems([blankLine()]);
  }

  /** Live totals with GST split (server recomputes authoritatively). */
  const totals = (() => {
    let taxable = 0, cgst = 0, sgst = 0, igst = 0;
    const isInterstate = form.isInterstate;
    for (const it of items) {
      const sub = (it.quantity || 0) * (it.unitPrice || 0);
      const t = sub - sub * ((it.discountPercent || 0) / 100);
      const rate = it.taxRate || 0;
      const c = isInterstate ? 0 : Math.floor(rate / 2);
      const s = isInterstate ? 0 : rate - c;
      const i = isInterstate ? rate : 0;
      taxable += t;
      cgst += t * (c / 100);
      sgst += t * (s / 100);
      igst += t * (i / 100);
    }
    const tax = cgst + sgst + igst;
    const grand = taxable + tax + (Number(form.freightCharges) || 0) + (Number(form.otherCharges) || 0) + (Number(form.roundOff) || 0);
    return { taxable, cgst, sgst, igst, tax, grand };
  })();

  async function handleSave(e?: FormEvent) {
    e?.preventDefault();
    if (submitting) return;

    const payload: SalesInvoiceCreateInput = {
      companyId: form.companyId,
      unitId: form.unitId,
      customerId: form.customerId,
      soId: form.soId,
      invoiceDate: form.invoiceDate,
      dueDate: form.dueDate || null,
      isInterstate: form.isInterstate,
      placeOfSupply: form.placeOfSupply || null,
      freightCharges: form.freightCharges || 0,
      otherCharges: form.otherCharges || 0,
      roundOff: form.roundOff || 0,
      remarks: form.remarks ?? "",
      items: items
        .filter((it) => it.itemName.trim() !== "" && (it.quantity ?? 0) > 0)
        .map((it) => ({
          soItemId: it.soItemId,
          itemId: it.itemId,
          itemName: it.itemName,
          hsnCode: it.hsnCode,
          uom: it.uom,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discountPercent: it.discountPercent || 0,
          taxRate: it.taxRate,
        })),
    };

    const result = validate(salesInvoiceCreateSchema, payload);
    if (!result.ok) { setErrors(result.errors); toast.error("Form has errors", result.errors.summary ?? "Fix the highlighted fields"); return; }

    setErrors(emptyErrors);
    setSubmitting(true);
    try {
      const inv = await api<{ id: string }>("/api/sales-invoices", { method: "POST", body: JSON.stringify(result.data) });
      toast.success("Invoice created", "Outward GST computed. Issue it when ready.");
      router.push(`${base}/${inv.id}`);
    } catch (err) {
      setErrors(apiErrorToFormErrors(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormSheet
      title="Create Sales Invoice"
      subtitle={form.soId ? `From sales order` : "Outward GST invoice — from a sales order or direct"}
      onClose={() => router.push(base)}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push(base)}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSave()} disabled={submitting}>
            {submitting ? "Saving…" : "Save invoice"} <Icon name="ArrowRight" size={13} />
          </button>
        </>
      }
    >
      {errors.summary && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} />
          <span className="flex-1">{errors.summary}</span>
        </div>
      )}

      <div className="card p-6 mb-5 space-y-4">
        <div>
          <label className="label">Invoice source</label>
          <div className="flex gap-2">
            <button type="button" className={`btn btn-sm ${mode === "so" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchMode("so")}>
              <Icon name="ShoppingBag" size={14} /> From a sales order
            </button>
            <button type="button" className={`btn btn-sm ${mode === "direct" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchMode("direct")}>
              <Icon name="FilePlus" size={14} /> Direct invoice
            </button>
          </div>
        </div>

        {mode === "so" && (
          <div>
            <label className="label">Select an approved sales order</label>
            <select className="input" value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">— Choose —</option>
              {sos.map((s) => <option key={s.id} value={s.id}>{s.soNumber ?? s.title} · {s.customerName ?? ""} · {s.status}</option>)}
            </select>
            {sos.length === 0 && <p className="mt-2 text-xs text-muted">No approved sales orders yet — approve one first, or switch to Direct.</p>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="label">Customer <span className="text-danger">*</span></label>
            <select className="input" value={form.customerId} disabled={headerLocked} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">Select customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Company <span className="text-danger">*</span></label>
            <select className="input" value={form.companyId} disabled={headerLocked} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
              <option value="">Select…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Unit <span className="text-danger">*</span></label>
            <select className="input" value={form.unitId} disabled={headerLocked} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
              <option value="">Select…</option>
              {filteredUnits.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div>
            <label className="label">Invoice date <span className="text-danger">*</span></label>
            <input type="date" className="input" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} required />
          </div>
          <div>
            <label className="label">Due date</label>
            <input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} placeholder="Auto from credit days" />
          </div>
          <label className="flex items-center gap-3 text-sm p-3 rounded-xl border border-border bg-surface cursor-pointer">
            <input type="checkbox" checked={form.isInterstate} onChange={(e) => setForm({ ...form, isInterstate: e.target.checked })} className="rounded h-4 w-4" />
            <span className="text-xs font-medium">Inter-state (IGST)</span>
          </label>
          <div>
            <label className="label">Place of supply</label>
            <input className="input font-mono" placeholder="27" value={form.placeOfSupply} onChange={(e) => setForm({ ...form, placeOfSupply: e.target.value })} />
          </div>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="card overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Billed lines</p>
              <p className="text-sm text-muted mt-0.5">{form.isInterstate ? "IGST" : "CGST + SGST"} · outward GST computed on save · total <strong className="text-text-default">{paiseToINR(totals.grand * 100)}</strong></p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}><Icon name="Plus" /> Add line</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold w-10">#</th>
                  <th className="text-left px-3 py-2 font-semibold min-w-[200px]">Item</th>
                  <th className="text-left px-3 py-2 font-semibold w-24">HSN</th>
                  <th className="text-left px-3 py-2 font-semibold w-24">Qty</th>
                  <th className="text-left px-3 py-2 font-semibold w-16">UOM</th>
                  <th className="text-left px-3 py-2 font-semibold w-28">Unit price (₹)</th>
                  <th className="text-left px-3 py-2 font-semibold w-14">Disc</th>
                  <th className="text-left px-3 py-2 font-semibold w-14">GST</th>
                  <th className="text-right px-3 py-2 font-semibold w-32">Line total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const sub = (it.quantity || 0) * (it.unitPrice || 0);
                  const taxable = sub - sub * ((it.discountPercent || 0) / 100);
                  const lineTotal = taxable + taxable * ((it.taxRate || 0) / 100);
                  return (
                    <tr key={idx} className="border-t border-border align-top">
                      <td className="px-3 py-2 text-muted text-xs pt-3.5">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <input className="input !py-1.5" placeholder="Item name" value={it.itemName} onChange={(e) => setItem(idx, { itemName: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="input !py-1.5 font-mono text-[11px]" placeholder="HSN" value={it.hsnCode ?? ""} onChange={(e) => setItem(idx, { hsnCode: e.target.value || null })} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="input !py-1.5 tabular-nums" type="number" step="0.001" min="0" value={it.quantity || 0} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="input !py-1.5 font-mono text-[11px]" value={it.uom} onChange={(e) => setItem(idx, { uom: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="input !py-1.5 tabular-nums" type="number" step="0.01" min="0" value={it.unitPrice || 0} onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) })} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="input !py-1.5 tabular-nums" type="number" step="0.01" min="0" max="100" value={it.discountPercent ?? 0} onChange={(e) => setItem(idx, { discountPercent: Number(e.target.value) })} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="input !py-1.5 tabular-nums" type="number" step="0.01" min="0" max="100" value={it.taxRate} onChange={(e) => setItem(idx, { taxRate: Number(e.target.value) })} />
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-right pt-3">
                        {sub > 0 ? paiseToINR(lineTotal * 100) : <span className="text-muted">—</span>}
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
                  <td colSpan={8} className="px-3 py-2 text-right text-muted">Taxable</td>
                  <td className="px-3 py-2 tabular-nums text-right">{paiseToINR(totals.taxable * 100)}</td>
                  <td />
                </tr>
                {form.isInterstate ? (
                  <tr><td colSpan={8} className="px-3 py-2 text-right text-muted">IGST</td><td className="px-3 py-2 tabular-nums text-right">{paiseToINR(totals.igst * 100)}</td><td /></tr>
                ) : (
                  <>
                    <tr><td colSpan={8} className="px-3 py-2 text-right text-muted">CGST</td><td className="px-3 py-2 tabular-nums text-right">{paiseToINR(totals.cgst * 100)}</td><td /></tr>
                    <tr><td colSpan={8} className="px-3 py-2 text-right text-muted">SGST</td><td className="px-3 py-2 tabular-nums text-right">{paiseToINR(totals.sgst * 100)}</td><td /></tr>
                  </>
                )}
                <tr className="border-t-2 border-border bg-surface">
                  <td colSpan={8} className="px-3 py-3 text-right font-semibold">Invoice total</td>
                  <td className="px-3 py-3 font-bold tabular-nums text-right">{paiseToINR(totals.grand * 100)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="card p-6 mb-5">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Freight (₹)</label>
              <input className="input tabular-nums" type="number" step="0.01" min="0" value={form.freightCharges || 0} onChange={(e) => setForm({ ...form, freightCharges: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="label">Other charges (₹)</label>
              <input className="input tabular-nums" type="number" step="0.01" min="0" value={form.otherCharges || 0} onChange={(e) => setForm({ ...form, otherCharges: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="label">Round-off (₹)</label>
              <input className="input tabular-nums" type="number" step="0.01" value={form.roundOff || 0} onChange={(e) => setForm({ ...form, roundOff: Number(e.target.value) || 0 })} />
            </div>
            <div className="lg:col-span-1">
              <label className="label">Remarks</label>
              <input className="input" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Notes printed on the invoice" />
            </div>
          </div>
        </div>
      </form>
    </FormSheet>
  );
}
