"use client";
import React, { useEffect, useState, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { FieldError, fieldClass } from "@/components/FieldError";
import { FormSheet } from "@/components/FormSheet";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR } from "@/lib/format";
import { salesOrderCreateSchema, type SalesOrderCreateInput, type SalesOrderItemInput, type CustomerListItem } from "@indus/shared";
import { validate, apiErrorToFormErrors, emptyErrors, type FormErrorState } from "@/lib/form-errors";

interface Company { id: string; name: string; gstin?: string | null; address?: string | null; city?: string | null; state?: string | null; pincode?: string | null; isPrimary: boolean; }
interface Unit { id: string; companyId: string; name: string; code: string | null; }
interface CustomerLite extends CustomerListItem { shippingAddress?: string | null; billingAddress?: string | null; }

/** Derive inter-state from the leading 2 digits (state code) of both GSTINs. */
function deriveIsInterstate(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const sa = a.trim().slice(0, 2);
  const sb = b.trim().slice(0, 2);
  if (sa.length !== 2 || sb.length !== 2) return false;
  return sa !== sb;
}

export default function NewSalesOrderPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/sales-orders`;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);

  const [form, setForm] = useState<SalesOrderCreateInput>(emptyForm());
  const [submitting, setSubmitting] = useState<"draft" | "submit" | null>(null);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);

  useEffect(() => {
    (async () => {
      try {
        const [comps, us, custs] = await Promise.all([
          api<Company[]>("/api/tenant/companies"),
          api<Unit[]>("/api/tenant/units"),
          api<{ items: CustomerLite[] }>("/api/customers?pageSize=100"),
        ]);
        setCompanies(comps);
        setUnits(us);
        setCustomers(custs.items);
        const primary = comps.find((c) => c.isPrimary) ?? comps[0];
        if (primary) {
          const firstUnit = us.find((u) => u.companyId === primary.id);
          setForm((f) => ({ ...f, companyId: primary.id, unitId: firstUnit?.id ?? f.unitId }));
        }
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load", fields: {} });
      }
    })();
  }, []);

  const filteredUnits = units.filter((u) => u.companyId === form.companyId);
  const selectedCompany = companies.find((c) => c.id === form.companyId);
  const selectedCustomer = customers.find((c) => c.id === form.customerId);

  // Auto-derive isInterstate from company vs customer GSTIN; buyer can still override.
  useEffect(() => {
    if (!selectedCompany?.gstin || !selectedCustomer?.gstin) return;
    const next = deriveIsInterstate(selectedCompany.gstin, selectedCustomer.gstin);
    setForm((f) => (f.isInterstate === next ? f : { ...f, isInterstate: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.customerId, form.companyId]);

  // Default the shipping address from the customer when one isn't typed yet.
  useEffect(() => {
    if (!selectedCustomer) return;
    setForm((f) => ({
      ...f,
      shippingAddress: f.shippingAddress || selectedCustomer.shippingAddress || "",
      billingAddress: f.billingAddress || selectedCustomer.billingAddress || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.customerId]);

  const fe = errors.fields;

  function clearFieldErrors(prefix: string) {
    setErrors((e) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(e.fields)) {
        if (k !== prefix && !k.startsWith(prefix + ".")) next[k] = v;
      }
      return { summary: Object.keys(next).length ? e.summary : null, fields: next };
    });
  }

  function set<K extends keyof SalesOrderCreateInput>(k: K, v: SalesOrderCreateInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    clearFieldErrors(k as string);
  }

  function setItem(idx: number, patch: Partial<SalesOrderItemInput>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
    clearFieldErrors(`items.${idx}`);
  }

  function addItem() {
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { itemId: null, itemName: "", description: "", itemGroupName: null, itemSubGroupName: null, hsnCode: null, quantity: 1, uom: "nos", unitPrice: 0, discountPercent: 0, taxRate: 18, committedDeliveryDate: null, itemNarration: "", notes: "", specifications: null },
      ],
    }));
  }

  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  /** Live totals with GST split. */
  const totals = (() => {
    let sub = 0, disc = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0;
    const isInterstate = form.isInterstate ?? false;
    for (const it of form.items) {
      const lineSub = (it.quantity || 0) * (it.unitPrice || 0);
      const lineDisc = lineSub * ((it.discountPercent || 0) / 100);
      const lineTaxable = lineSub - lineDisc;
      const rate = it.taxRate || 0;
      const c = isInterstate ? 0 : Math.floor(rate / 2);
      const s = isInterstate ? 0 : rate - c;
      const i = isInterstate ? rate : 0;
      sub += lineSub; disc += lineDisc; taxable += lineTaxable;
      cgst += lineTaxable * (c / 100);
      sgst += lineTaxable * (s / 100);
      igst += lineTaxable * (i / 100);
    }
    const tax = cgst + sgst + igst;
    const freight = Number(form.freightCharges) || 0;
    const other = Number(form.otherCharges) || 0;
    const roundOff = Number(form.roundOff) || 0;
    const grand = taxable + tax + freight + other + roundOff;
    return { sub, disc, taxable, cgst, sgst, igst, tax, freight, other, roundOff, grand };
  })();

  async function handleSave(action: "draft" | "submit") {
    if (submitting) return;
    const cleaned: SalesOrderCreateInput = {
      ...form,
      title: form.title.trim(),
      items: form.items.filter((it) => it.itemName.trim() !== "" && (it.quantity ?? 0) > 0 && (it.unitPrice ?? 0) > 0),
    };
    const result = validate(salesOrderCreateSchema, cleaned);
    if (!result.ok) {
      setErrors(result.errors);
      toast.error("Form has errors", result.errors.summary ?? "Please fix the highlighted fields");
      setTimeout(() => {
        const firstKey = Object.keys(result.errors.fields)[0];
        if (firstKey) document.querySelector(`[data-field="${firstKey}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setErrors(emptyErrors);
    setSubmitting(action);
    try {
      const so = await api<{ id: string }>("/api/sales-orders", { method: "POST", body: JSON.stringify(result.data) });
      if (action === "submit") {
        await api(`/api/sales-orders/${so.id}/submit`, { method: "POST", body: JSON.stringify({}) });
        toast.success("Sales order submitted", "Approver review ke baad fulfil kiya ja sakta hai.");
      } else {
        toast.success("Saved as draft", "Returnable from the Drafts tab.");
      }
      router.push(`${base}/${so.id}`);
    } catch (err) {
      const parsed = apiErrorToFormErrors(err);
      setErrors(parsed);
      toast.error("Could not save", parsed.summary ?? "Server rejected the request");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <FormSheet
      title="Sales Order Creation"
      subtitle="Confirm a customer order — send for approval, then fulfil & invoice"
      onClose={() => router.push(base)}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push(base)}>Cancel</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleSave("draft")} disabled={!!submitting}>
            {submitting === "draft" ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSave("submit")} disabled={!!submitting}>
            {submitting === "submit" ? "Sending…" : "Send for Approval"} <Icon name="ArrowRight" size={13} />
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

      <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleSave("submit"); }}>
        <div className="card p-6 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-4">Header</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-2" data-field="title">
              <label className="label">Title <span className="text-danger">*</span></label>
              <input className={fieldClass(fe.title)} placeholder="e.g. SO for Bearings — Acme Industries" value={form.title} onChange={(e) => set("title", e.target.value)} />
              <FieldError error={fe.title} />
            </div>
            <div data-field="customerId">
              <label className="label">Customer <span className="text-danger">*</span></label>
              <select className={fieldClass(fe.customerId)} value={form.customerId} onChange={(e) => set("customerId", e.target.value)}>
                <option value="">Select customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
              </select>
              <FieldError error={fe.customerId} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div data-field="companyId">
              <label className="label">Company <span className="text-danger">*</span></label>
              <select className={fieldClass(fe.companyId)} value={form.companyId} onChange={(e) => set("companyId", e.target.value)}>
                <option value="">Select…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <FieldError error={fe.companyId} />
            </div>
            <div data-field="unitId">
              <label className="label">Unit <span className="text-danger">*</span></label>
              <select className={fieldClass(fe.unitId)} value={form.unitId} onChange={(e) => set("unitId", e.target.value)}>
                <option value="">Select…</option>
                {filteredUnits.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
              </select>
              <FieldError error={fe.unitId} />
            </div>
            <div>
              <label className="label">Customer PO #</label>
              <input className="input" value={form.customerPoNumber ?? ""} onChange={(e) => set("customerPoNumber", e.target.value)} placeholder="Buyer's reference" />
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3 mt-2 pt-3 border-t border-border">Tax & dates</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <label className="flex items-center gap-3 text-sm p-3 rounded-xl border border-border bg-surface cursor-pointer hover:border-border-strong">
              <input type="checkbox" checked={form.isInterstate ?? false} onChange={(e) => set("isInterstate", e.target.checked)} className="rounded h-4 w-4" />
              <div className="flex-1">
                <p className="font-medium text-xs">Inter-state sale (apply IGST)</p>
                <p className="text-[11px] text-muted">Unchecked = intra-state (CGST + SGST split)</p>
              </div>
            </label>
            <div>
              <label className="label">Place of supply (state code)</label>
              <input className="input font-mono" placeholder="27 (Maharashtra)" value={form.placeOfSupply ?? ""} onChange={(e) => set("placeOfSupply", e.target.value)} />
            </div>
            <div>
              <label className="label">Expected ship date</label>
              <input type="date" className="input" value={form.expectedShipDate ?? ""} onChange={(e) => set("expectedShipDate", e.target.value || null)} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Payment terms</label>
              <input className="input" placeholder="Net 30 / 50% advance" value={form.paymentTerms ?? ""} onChange={(e) => set("paymentTerms", e.target.value)} />
            </div>
            <div>
              <label className="label">Delivery terms</label>
              <input className="input" placeholder="FOR Mumbai / Ex-works / CIF" value={form.deliveryTerms ?? ""} onChange={(e) => set("deliveryTerms", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="label">Shipping address</label>
              <textarea className="input" rows={2} value={form.shippingAddress ?? ""} onChange={(e) => set("shippingAddress", e.target.value)} placeholder="Where the goods ship to" />
            </div>
            <div>
              <label className="label">Notes / instructions</label>
              <textarea className="input" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Visible on the order" />
            </div>
          </div>
        </div>

        <div className="card overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Line items</p>
              <p className="text-sm text-muted mt-0.5">
                {form.items.length} {form.items.length === 1 ? "item" : "items"} · {form.isInterstate ? "IGST" : "CGST + SGST"} ·
                grand total <strong className="text-text-default">{paiseToINR(totals.grand * 100)}</strong>
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}><Icon name="Plus" /> Add line</button>
          </div>

          {form.items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted text-xs mb-2">No line items</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={addItem}><Icon name="Plus" size={13} /> Add first item</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-7">#</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted min-w-[200px]">Item</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-24">HSN</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-20">Qty</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-16">UOM</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-24">Rate (₹)</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-14">Disc</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-14">GST</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-32">Committed</th>
                    <th className="text-right px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-28">Line total</th>
                    <th className="w-7" />
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, idx) => {
                    const sub = (it.quantity || 0) * (it.unitPrice || 0);
                    const disc = sub * ((it.discountPercent || 0) / 100);
                    const taxable = sub - disc;
                    const lineTotal = taxable + taxable * ((it.taxRate || 0) / 100);
                    return (
                      <tr key={idx} className="border-t border-border align-top">
                        <td className="px-2 py-1.5 text-muted text-[11px] pt-2.5">{idx + 1}</td>
                        <td className="px-2 py-1.5">
                          <input className="input !py-1 !h-8 text-[12px]" placeholder="Item name" value={it.itemName} onChange={(e) => setItem(idx, { itemName: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="input !py-1 !h-8 font-mono text-[11px]" placeholder="HSN" value={it.hsnCode ?? ""} onChange={(e) => setItem(idx, { hsnCode: e.target.value || null })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="input !py-1 !h-8 tabular-nums text-[12px]" type="number" step="0.001" min="0" value={it.quantity || ""} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="input !py-1 !h-8 font-mono text-[11px]" value={it.uom} onChange={(e) => setItem(idx, { uom: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="input !py-1 !h-8 tabular-nums text-[12px]" type="number" step="0.01" min="0" value={it.unitPrice || ""} onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="input !py-1 !h-8 tabular-nums text-[12px]" type="number" step="0.01" min="0" max="100" value={it.discountPercent ?? 0} onChange={(e) => setItem(idx, { discountPercent: Number(e.target.value) })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="input !py-1 !h-8 tabular-nums text-[12px]" type="number" step="0.01" min="0" max="100" value={it.taxRate} onChange={(e) => setItem(idx, { taxRate: Number(e.target.value) })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="date" className="input !py-1 !h-8 text-[11px]" value={it.committedDeliveryDate ?? ""} onChange={(e) => setItem(idx, { committedDeliveryDate: e.target.value || null })} />
                        </td>
                        <td className="px-2 py-1.5 font-semibold tabular-nums text-right pt-2.5 text-[12px]">
                          {sub > 0 ? paiseToINR(lineTotal * 100) : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button type="button" className="h-7 w-7 rounded grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => removeItem(idx)} title="Remove">
                            <Icon name="Trash2" size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 mb-5">
          <div className="card p-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-4">Header charges</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Freight (₹)</label>
                <input className="input tabular-nums" type="number" step="0.01" min="0" value={form.freightCharges || 0} onChange={(e) => set("freightCharges", Number(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label">Other charges (₹)</label>
                <input className="input tabular-nums" type="number" step="0.01" min="0" value={form.otherCharges || 0} onChange={(e) => set("otherCharges", Number(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label">Round-off (₹)</label>
                <input className="input tabular-nums" type="number" step="0.01" value={form.roundOff || 0} onChange={(e) => set("roundOff", Number(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          <div className="card p-6" style={{ background: "var(--surface)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">Order summary</p>
            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={paiseToINR(totals.sub * 100)} />
              {totals.disc > 0 && <Row label="Less: Discount" value={`− ${paiseToINR(totals.disc * 100)}`} tone="muted" />}
              <Row label="Taxable amount" value={paiseToINR(totals.taxable * 100)} bold />
              {form.isInterstate ? (
                <Row label="IGST" value={paiseToINR(totals.igst * 100)} />
              ) : (
                <>
                  <Row label="CGST" value={paiseToINR(totals.cgst * 100)} />
                  <Row label="SGST" value={paiseToINR(totals.sgst * 100)} />
                </>
              )}
              {totals.freight > 0 && <Row label="Freight" value={paiseToINR(totals.freight * 100)} />}
              {totals.other > 0 && <Row label="Other charges" value={paiseToINR(totals.other * 100)} />}
              {totals.roundOff !== 0 && <Row label="Round-off" value={paiseToINR(totals.roundOff * 100)} tone="muted" />}
              <div className="border-t border-border pt-2 mt-2">
                <Row label="Grand total" value={paiseToINR(totals.grand * 100)} bold size="lg" />
              </div>
            </dl>
          </div>
        </div>
      </form>
    </FormSheet>
  );
}

function Row({ label, value, bold, size, tone }: { label: string; value: string; bold?: boolean; size?: "lg"; tone?: "muted" }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={`${tone === "muted" ? "text-muted" : ""}`}>{label}</dt>
      <dd className={`tabular-nums ${bold ? "font-bold" : "font-medium"} ${size === "lg" ? "text-lg" : ""}`}>{value}</dd>
    </div>
  );
}

function emptyForm(): SalesOrderCreateInput {
  return {
    companyId: "",
    unitId: "",
    customerId: "",
    title: "",
    description: "",
    customerPoNumber: "",
    isInterstate: false,
    placeOfSupply: "",
    expectedShipDate: null,
    validUntil: null,
    shippingAddress: "",
    billingAddress: "",
    deliveryTerms: "",
    paymentTerms: "",
    termsAndConditions: "",
    notes: "",
    freightCharges: 0,
    otherCharges: 0,
    roundOff: 0,
    items: [
      { itemId: null, itemName: "", description: "", itemGroupName: null, itemSubGroupName: null, hsnCode: null, quantity: 1, uom: "nos", unitPrice: 0, discountPercent: 0, taxRate: 18, committedDeliveryDate: null, itemNarration: "", notes: "", specifications: null },
    ],
  };
}
