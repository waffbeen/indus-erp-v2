"use client";
import React, { useEffect, useState, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { FormSheet } from "@/components/FormSheet";
import { FieldError, fieldClass } from "@/components/FieldError";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR } from "@/lib/format";
import { poCreateSchema, type PoCreateInput, type PoItemInput, type VendorListItem } from "@indus/shared";
import { validate, apiErrorToFormErrors, emptyErrors, type FormErrorState } from "@/lib/form-errors";

interface Company {
  id: string;
  name: string;
  legalName?: string | null;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  isPrimary: boolean;
}
interface Unit { id: string; companyId: string; name: string; code: string | null; }
interface TenantUser { id: string; fullName: string; email: string; isTenantAdmin: boolean; roleName: string; }
interface HsnRow { id: string; code: string; description: string | null; defaultGstRate: number | null; }
interface UomRow { id: string; code: string; name: string; }
interface PaymentTermRow { id: string; label: string; isActive: boolean }
interface DeliveryTermRow { id: string; code: string; label: string; isActive: boolean }

const PAYMENT_TERMS_CUSTOM = "Custom (type below)";

function deriveIsInterstate(companyGstin?: string | null, supplierGstin?: string | null): boolean {
  if (!companyGstin || !supplierGstin) return false;
  const a = companyGstin.trim().slice(0, 2);
  const b = supplierGstin.trim().slice(0, 2);
  if (a.length !== 2 || b.length !== 2) return false;
  return a !== b;
}

function formatCompanyAddress(c: Company | undefined): string {
  if (!c) return "";
  return [c.address, c.city, c.state, c.pincode].filter(Boolean).join(", ");
}

interface PoItemRow {
  id: string;
  prItemId: string | null;
  itemId: string | null;
  itemName: string;
  description: string | null;
  itemGroupName: string | null;
  itemSubGroupName: string | null;
  hsnCode: string | null;
  quantityScaled: number;
  uom: string;
  unitPricePaise: string;
  discountPercent: number;
  taxRate: number;
  committedDeliveryDate: string | null;
  itemNarration: string | null;
  notes: string | null;
  lineBuyerUserId: string | null;
  tolerancePercent: number;
  warrantyMonths: number;
  isForStock: number;
  isRecoveryRate: number;
  deliverySchedule: Array<{ qtyScaled: number; deliveryDate: string }>;
  specifications: Record<string, unknown> | null;
}

interface PoDetail {
  id: string;
  status: string;
  title: string;
  description: string | null;
  companyId: string;
  unitId: string;
  vendorId: string;
  prId: string | null;
  isInterstate: boolean;
  placeOfSupply: string | null;
  deliveryDate: string | null;
  validUntil: string | null;
  deliveryAddress: string | null;
  deliveryTerms: string | null;
  paymentTerms: string | null;
  termsAndConditions: string | null;
  freightChargesPaise: string;
  otherChargesPaise: string;
  roundOffPaise: string;
  revisionNo: number;
  revisionRemark: string | null;
  poType: string | null;
  forDelivery: string | null;
  creditPeriodDays: number | null;
  insuranceTerms: string | null;
  penaltyTerms: string | null;
  packingTerms: string | null;
  items: PoItemRow[];
  additionalCharges: Array<{ id: string; label: string; amountPaise: string }>;
}

export default function EditPoPage() {
  const router = useRouter();
  const params = useParams<{ slug: string; id: string }>();
  const base = `/t/${params?.slug ?? ""}/po`;
  const poId = params?.id ?? "";

  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [hsnList, setHsnList] = useState<HsnRow[]>([]);
  const [uomList, setUomList] = useState<UomRow[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTermRow[]>([]);
  const [deliveryTermsList, setDeliveryTermsList] = useState<DeliveryTermRow[]>([]);

  const [form, setForm] = useState<PoCreateInput | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"save" | "submit" | null>(null);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);

  // Bulk-buyer + common-discount mirror the new page UX
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [bulkBuyerOpen, setBulkBuyerOpen] = useState(false);
  const [bulkBuyerPick, setBulkBuyerPick] = useState<string>("");
  const [commonDiscount, setCommonDiscount] = useState<string>("");

  useEffect(() => {
    if (!poId) return;
    (async () => {
      try {
        const [po, comps, units, vens, usersList, hsnRows, uomRows, payRows, delRows] = await Promise.all([
          api<PoDetail>(`/api/po/${poId}`),
          api<Company[]>("/api/tenant/companies"),
          api<Unit[]>("/api/tenant/units"),
          api<{ items: VendorListItem[] }>("/api/vendors?pageSize=100"),
          api<TenantUser[]>("/api/tenant/users"),
          api<HsnRow[]>("/api/masters/hsn"),
          api<UomRow[]>("/api/masters/uoms"),
          api<PaymentTermRow[]>("/api/masters/payment-terms"),
          api<DeliveryTermRow[]>("/api/masters/delivery-terms"),
        ]);
        setPaymentTermsList(payRows.filter((p) => p.isActive));
        setDeliveryTermsList(delRows.filter((d) => d.isActive));
        if (po.status !== "draft") {
          setLoadError("Only draft POs can be edited. Submitted/approved POs need an Amendment instead.");
          return;
        }
        setCompanies(comps);
        setUnits(units);
        setVendors(vens.items);
        setTenantUsers(usersList);
        setHsnList(hsnRows);
        setUomList(uomRows);
        setForm(rowToForm(po));
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "Could not load PO");
      }
    })();
  }, [poId]);

  const filteredUnits = form ? units.filter((u) => u.companyId === form.companyId) : [];
  const selectedCompany = form ? companies.find((c) => c.id === form.companyId) : undefined;
  const selectedVendor = form ? vendors.find((v) => v.id === form.vendorId) : undefined;
  const fe = errors.fields;

  // Auto-derive isInterstate from company.gstin vs supplier.gstin on either change.
  useEffect(() => {
    if (!form || !selectedCompany?.gstin || !selectedVendor?.gstin) return;
    const next = deriveIsInterstate(selectedCompany.gstin, selectedVendor.gstin);
    setForm((f) => (!f || f.isInterstate === next ? f : { ...f, isInterstate: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.vendorId, form?.companyId]);

  function isHsnUnsaved(code: string | null | undefined): boolean {
    if (!code) return false;
    const trimmed = code.trim();
    if (trimmed.length < 2) return false;
    return !hsnList.some((h) => h.code.toLowerCase() === trimmed.toLowerCase());
  }

  async function saveHsnToMaster(idx: number) {
    if (!form) return;
    const it = form.items[idx];
    const code = it?.hsnCode?.trim();
    if (!code) return;
    try {
      const created = await api<HsnRow>("/api/masters/hsn", {
        method: "POST",
        body: JSON.stringify({ code, defaultGstRate: it?.taxRate ?? null }),
      });
      setHsnList((prev) => {
        const without = prev.filter((h) => h.code.toLowerCase() !== created.code.toLowerCase());
        return [...without, created].sort((a, b) => a.code.localeCompare(b.code));
      });
      toast.success("HSN saved to master", `${created.code} ab dropdown me available hai.`);
    } catch (err) {
      toast.error("Could not save HSN", err instanceof ApiError ? err.message : "Try again.");
    }
  }

  function onHsnChange(idx: number, raw: string) {
    if (!form) return;
    const code = raw.trim();
    setItem(idx, { hsnCode: code || null });
    if (!code) return;
    const match = hsnList.find((h) => h.code.toLowerCase() === code.toLowerCase());
    if (match?.defaultGstRate != null) {
      const line = form.items[idx];
      if (line && line.taxRate === 18) {
        setItem(idx, { taxRate: match.defaultGstRate });
      }
    }
  }

  function clearFieldErrors(prefix: string) {
    setErrors((e) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(e.fields)) {
        if (k !== prefix && !k.startsWith(prefix + ".")) next[k] = v;
      }
      return { summary: Object.keys(next).length ? e.summary : null, fields: next };
    });
  }

  function set<K extends keyof PoCreateInput>(k: K, v: PoCreateInput[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    clearFieldErrors(k as string);
  }

  function setItem(idx: number, patch: Partial<PoItemInput>) {
    setForm((f) => (f ? { ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) } : f));
    clearFieldErrors(`items.${idx}`);
  }

  function addItem() {
    setForm((f) => (f ? {
      ...f,
      items: [
        ...f.items,
        {
          prItemId: null, itemId: null, itemName: "", description: "",
          itemGroupName: null, itemSubGroupName: null, hsnCode: null,
          quantity: 1, uom: "nos", unitPrice: 0,
          discountPercent: 0, taxRate: 18,
          committedDeliveryDate: null,
          itemNarration: "", notes: "", specifications: null,
          lineBuyerUserId: null,
          tolerancePercent: 0, warrantyMonths: 0,
          isForStock: false, isRecoveryRate: false,
          deliverySchedule: [],
        },
      ],
    } : f));
  }

  function removeItem(idx: number) {
    setForm((f) => (f ? { ...f, items: f.items.filter((_, i) => i !== idx) } : f));
    setSelectedLines((s) => {
      const next = new Set<number>();
      for (const i of s) if (i < idx) next.add(i); else if (i > idx) next.add(i - 1);
      return next;
    });
  }

  function toggleLine(idx: number) {
    setSelectedLines((s) => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  }
  function toggleAllLines() {
    if (!form) return;
    setSelectedLines((s) => s.size === form.items.length ? new Set() : new Set(form.items.map((_, i) => i)));
  }
  function applyBulkBuyer() {
    if (!form) return;
    const picked = bulkBuyerPick || null;
    setForm({ ...form, items: form.items.map((it, i) => selectedLines.has(i) ? { ...it, lineBuyerUserId: picked } : it) });
    toast.success(picked ? "Buyer assigned" : "Buyer cleared", `${selectedLines.size} lines updated.`);
    setBulkBuyerOpen(false);
    setBulkBuyerPick("");
    setSelectedLines(new Set());
  }
  function applyCommonDiscount() {
    if (!form) return;
    const pct = Number(commonDiscount);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Invalid discount", "Enter a value between 0 and 100.");
      return;
    }
    setForm({ ...form, items: form.items.map((it) => ({ ...it, discountPercent: pct })) });
    toast.success("Discount applied", `${pct}% set on all ${form.items.length} lines.`);
  }

  // Additional charges grid
  function addCharge() {
    if (!form) return;
    setForm({ ...form, additionalCharges: [...(form.additionalCharges ?? []), { label: "", amount: 0 }] });
  }
  function removeCharge(idx: number) {
    if (!form) return;
    setForm({ ...form, additionalCharges: (form.additionalCharges ?? []).filter((_, i) => i !== idx) });
  }
  function setCharge(idx: number, patch: Partial<{ label: string; amount: number }>) {
    if (!form) return;
    setForm({
      ...form,
      additionalCharges: (form.additionalCharges ?? []).map((c, i) => i === idx ? { ...c, ...patch } : c),
    });
  }

  // Live totals
  const totals = (() => {
    if (!form) return { sub: 0, disc: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, freight: 0, other: 0, roundOff: 0, addlSum: 0, grand: 0 };
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
    const addlSum = (form.additionalCharges ?? []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return { sub, disc, taxable, cgst, sgst, igst, tax, freight, other, roundOff, addlSum, grand: taxable + tax + freight + other + roundOff + addlSum };
  })();

  async function handleSave(action: "save" | "submit") {
    if (!form || submitting) return;

    const cleaned: PoCreateInput = {
      ...form,
      title: form.title.trim(),
      items: form.items.filter((it) => it.itemName.trim() !== "" && (it.quantity ?? 0) > 0 && (it.unitPrice ?? 0) > 0),
    };

    const result = validate(poCreateSchema, cleaned);
    if (!result.ok) {
      setErrors(result.errors);
      toast.error("Form has errors", result.errors.summary ?? "Please fix the highlighted fields and try again");
      return;
    }
    setErrors(emptyErrors);
    setSubmitting(action);
    try {
      await api(`/api/po/${poId}`, { method: "PATCH", body: JSON.stringify(result.data) });
      if (action === "submit") {
        await api(`/api/po/${poId}/submit`, { method: "POST", body: JSON.stringify({}) });
        toast.success("PO submitted", "Approver ko bhej diya.");
      } else {
        toast.success("Draft updated", "Changes saved.");
      }
      router.push(`${base}/${poId}`);
    } catch (err) {
      const parsed = apiErrorToFormErrors(err);
      setErrors(parsed);
      toast.error("Could not save", parsed.summary ?? "Server rejected the request");
    } finally {
      setSubmitting(null);
    }
  }

  if (loadError) {
    return (
      <>
        <div className="flex items-center gap-3 mb-3 text-sm text-muted">
          <Link href={base} className="hover:text-text-default">Purchase Orders</Link>
          <Icon name="ChevronRight" size={14} />
          <span className="text-text-default font-medium">Edit</span>
        </div>
        <div className="card p-6">
          <div className="rounded-lg p-3 bg-danger-bg text-danger-fg text-sm flex items-start gap-2">
            <Icon name="TriangleAlert" size={16} />
            <span className="flex-1">{loadError}</span>
          </div>
          <div className="mt-4">
            <Link href={`${base}/${poId}`} className="btn btn-ghost">
              <Icon name="ArrowLeft" /> Back to PO
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (!form) {
    return <div className="p-12 text-center text-muted">Loading…</div>;
  }

  return (
    <FormSheet
      title="Purchase Order Updation"
      subtitle="Update draft, then save or send for approval"
      onClose={() => router.push(`${base}/${poId}`)}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push(`${base}/${poId}`)}>Cancel</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleSave("save")} disabled={!!submitting}>
            {submitting === "save" ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSave("submit")} disabled={!!submitting}>
            {submitting === "submit" ? "Sending…" : "Save & Send for Approval"} <Icon name="ArrowRight" size={13} />
          </button>
        </>
      }
    >
      {errors.summary && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={16} />
          <span className="flex-1">{errors.summary}</span>
        </div>
      )}

      <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleSave("submit"); }}>
        {/* HEADER CARD */}
        <div className="card p-6 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-4">Header</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-2" data-field="title">
              <label className="label">Title <span className="text-danger">*</span></label>
              <input className={fieldClass(fe.title)} value={form.title} onChange={(e) => set("title", e.target.value)} />
              <FieldError error={fe.title} />
            </div>
            <div data-field="vendorId">
              <label className="label">Vendor <span className="text-danger">*</span></label>
              <select className={fieldClass(fe.vendorId)} value={form.vendorId} onChange={(e) => set("vendorId", e.target.value)}>
                <option value="">Select vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.code ? ` (${v.code})` : ""}</option>)}
              </select>
              <FieldError error={fe.vendorId} />
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
              <label className="label">Expected delivery</label>
              <input type="date" className="input" value={form.deliveryDate ?? ""} onChange={(e) => set("deliveryDate", e.target.value || null)} />
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3 mt-2 pt-3 border-t border-border">Tax & GST</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <label className="flex items-center gap-3 text-sm p-3 rounded-xl border border-border bg-surface cursor-pointer hover:border-border-strong">
              <input type="checkbox" checked={form.isInterstate ?? false} onChange={(e) => set("isInterstate", e.target.checked)} className="rounded h-4 w-4" />
              <div className="flex-1">
                <p className="font-medium text-xs">Inter-state (apply IGST)</p>
                <p className="text-[11px] text-muted">Unchecked = intra-state (CGST + SGST split)</p>
              </div>
            </label>
            <div>
              <label className="label">Place of supply</label>
              <input className="input font-mono" value={form.placeOfSupply ?? ""} onChange={(e) => set("placeOfSupply", e.target.value)} />
            </div>
            <div>
              <label className="label">Valid until</label>
              <input type="date" className="input" value={form.validUntil ?? ""} onChange={(e) => set("validUntil", e.target.value || null)} />
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3 mt-2 pt-3 border-t border-border">PO classification</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="label">PO type</label>
              <select className="input" value={form.poType ?? ""} onChange={(e) => set("poType", (e.target.value || null) as PoCreateInput["poType"])}>
                <option value="">— Select —</option>
                <option value="capex">CAPEX</option>
                <option value="opex">OPEX</option>
                <option value="amc">AMC</option>
                <option value="service">Service</option>
                <option value="trading">Trading</option>
                <option value="import">Import</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label">F.O.R. delivery</label>
              <select className="input" value={form.forDelivery ?? ""} onChange={(e) => set("forDelivery", (e.target.value || null) as PoCreateInput["forDelivery"])}>
                <option value="">— Select —</option>
                {deliveryTermsList.map((d) => (
                  <option key={d.id} value={d.code}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Credit period (days)</label>
              <input type="number" min="0" max="720" className="input tabular-nums" value={form.creditPeriodDays ?? ""} onChange={(e) => set("creditPeriodDays", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3 mt-2 pt-3 border-t border-border">Terms & delivery</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Payment terms</label>
              <div className="flex gap-2">
                <select
                  className="input w-44 shrink-0"
                  value={paymentTermsList.some((p) => p.label === form.paymentTerms) ? form.paymentTerms ?? "" : (form.paymentTerms ? PAYMENT_TERMS_CUSTOM : "")}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === PAYMENT_TERMS_CUSTOM) set("paymentTerms", "");
                    else set("paymentTerms", v);
                  }}
                >
                  <option value="">— Pick a preset —</option>
                  {paymentTermsList.map((p) => <option key={p.id} value={p.label}>{p.label}</option>)}
                  <option value={PAYMENT_TERMS_CUSTOM}>{PAYMENT_TERMS_CUSTOM}</option>
                </select>
                <input
                  className="input flex-1"
                  placeholder="Or type custom terms..."
                  value={form.paymentTerms ?? ""}
                  onChange={(e) => set("paymentTerms", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="label">Delivery terms</label>
              <input className="input" value={form.deliveryTerms ?? ""} onChange={(e) => set("deliveryTerms", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 mb-4">
            <div>
              <label className="label">
                Delivery address
                {selectedCompany && (
                  <button
                    type="button"
                    className="ml-2 text-[11px] text-primary hover:underline"
                    onClick={() => set("deliveryAddress", formatCompanyAddress(selectedCompany))}
                    title="Reload address from selected company"
                  >
                    Use company address
                  </button>
                )}
              </label>
              <input className="input" value={form.deliveryAddress ?? ""} onChange={(e) => set("deliveryAddress", e.target.value)} />
            </div>
            <div>
              <label className="label">Notes / vendor instructions</label>
              <input className="input" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div>
              <label className="label">Terms &amp; conditions</label>
              <textarea className="input" rows={2} value={form.termsAndConditions ?? ""} onChange={(e) => set("termsAndConditions", e.target.value)} />
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3 mt-2 pt-3 border-t border-border">Printable clauses</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="label">Insurance</label>
              <textarea className="input" rows={2} value={form.insuranceTerms ?? ""} onChange={(e) => set("insuranceTerms", e.target.value)} />
            </div>
            <div>
              <label className="label">Penalty / LD</label>
              <textarea className="input" rows={2} value={form.penaltyTerms ?? ""} onChange={(e) => set("penaltyTerms", e.target.value)} />
            </div>
            <div>
              <label className="label">Packing</label>
              <textarea className="input" rows={2} value={form.packingTerms ?? ""} onChange={(e) => set("packingTerms", e.target.value)} />
            </div>
          </div>
        </div>

        {/* LINE ITEMS */}
        <div className="card overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Line items</p>
              <p className="text-sm text-muted mt-0.5">
                {form.items.length} {form.items.length === 1 ? "item" : "items"} · {form.isInterstate ? "IGST" : "CGST + SGST"} ·
                grand total <strong className="text-text-default">{paiseToINR(totals.grand * 100)}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedLines.size > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setBulkBuyerPick(""); setBulkBuyerOpen(true); }}>
                  <Icon name="UserCog" /> Update buyer · {selectedLines.size}
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <input type="number" step="0.01" min="0" max="100" className="input !py-1.5 !h-9 w-24 tabular-nums text-sm" placeholder="Disc %" value={commonDiscount} onChange={(e) => setCommonDiscount(e.target.value)} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={applyCommonDiscount} disabled={!commonDiscount || !form.items.length}>
                  <Icon name="Percent" /> Apply
                </button>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}><Icon name="Plus" /> Add line</button>
            </div>
          </div>

          {form.items.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-muted text-sm mb-3">No line items</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={addItem}><Icon name="Plus" /> Add first item</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold w-10">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={form.items.length > 0 && selectedLines.size === form.items.length}
                        ref={(el) => { if (el) el.indeterminate = selectedLines.size > 0 && selectedLines.size < form.items.length; }}
                        onChange={toggleAllLines}
                      />
                    </th>
                    <th className="text-left px-3 py-2 font-semibold w-8">#</th>
                    <th className="text-left px-3 py-2 font-semibold min-w-[200px]">Item</th>
                    <th className="text-left px-3 py-2 font-semibold w-24">HSN</th>
                    <th className="text-left px-3 py-2 font-semibold w-24">Qty</th>
                    <th className="text-left px-3 py-2 font-semibold w-20">UOM</th>
                    <th className="text-left px-3 py-2 font-semibold w-28">Unit price (₹)</th>
                    <th className="text-left px-3 py-2 font-semibold w-20">Disc %</th>
                    <th className="text-left px-3 py-2 font-semibold w-20">GST %</th>
                    <th className="text-left px-3 py-2 font-semibold w-44">Buyer</th>
                    <th className="text-left px-3 py-2 font-semibold w-36">Committed</th>
                    <th className="text-right px-3 py-2 font-semibold w-32">Line total</th>
                    <th className="text-right px-3 py-2 font-semibold w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, idx) => {
                    const sub = (it.quantity || 0) * (it.unitPrice || 0);
                    const disc = sub * ((it.discountPercent || 0) / 100);
                    const taxable = sub - disc;
                    const tax = taxable * ((it.taxRate || 0) / 100);
                    const lineTotal = taxable + tax;
                    return (
                      <React.Fragment key={idx}>
                      <tr className={`border-t border-border align-top ${selectedLines.has(idx) ? "bg-tint-lilac/20" : ""}`}>
                        <td className="px-3 py-2 pt-3.5">
                          <input type="checkbox" className="h-4 w-4" checked={selectedLines.has(idx)} onChange={() => toggleLine(idx)} />
                        </td>
                        <td className="px-3 py-2 text-muted text-xs pt-3.5">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 text-sm" value={it.itemName} onChange={(e) => setItem(idx, { itemName: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input !py-1.5 font-mono text-xs"
                            list="po-edit-hsn-master"
                            value={it.hsnCode ?? ""}
                            onChange={(e) => onHsnChange(idx, e.target.value)}
                          />
                          {isHsnUnsaved(it.hsnCode) && (
                            <button
                              type="button"
                              className="text-[10px] text-primary hover:underline mt-0.5 whitespace-nowrap"
                              onClick={() => saveHsnToMaster(idx)}
                            >
                              + Save to master
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 tabular-nums" type="number" step="0.001" min="0" value={it.quantity || ""} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input !py-1.5 font-mono text-xs"
                            list="po-edit-uom-master"
                            value={it.uom}
                            onChange={(e) => setItem(idx, { uom: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 tabular-nums" type="number" step="0.01" min="0" value={it.unitPrice || ""} onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 tabular-nums" type="number" step="0.01" min="0" max="100" value={it.discountPercent ?? 0} onChange={(e) => setItem(idx, { discountPercent: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 tabular-nums" type="number" step="0.01" min="0" max="100" value={it.taxRate} onChange={(e) => setItem(idx, { taxRate: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2">
                          <select className={`input !py-1.5 text-xs ${!it.lineBuyerUserId ? "!border-warning-bg" : ""}`} value={it.lineBuyerUserId ?? ""} onChange={(e) => setItem(idx, { lineBuyerUserId: e.target.value || null })}>
                            <option value="">— Pick buyer —</option>
                            {tenantUsers.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.roleName}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="date" className="input !py-1.5 text-xs" value={it.committedDeliveryDate ?? ""} onChange={(e) => setItem(idx, { committedDeliveryDate: e.target.value || null })} />
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-right pt-3">{sub > 0 ? paiseToINR(lineTotal * 100) : <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" className="h-8 w-8 rounded-pill grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => removeItem(idx)}>
                            <Icon name="Trash2" size={16} />
                          </button>
                        </td>
                      </tr>
                      <tr className="border-b border-border" style={{ background: "var(--surface)" }}>
                        <td />
                        <td />
                        <td colSpan={11} className="px-3 pb-2">
                          <input className="input !py-1.5 text-xs" placeholder="Item-wise remark" value={it.itemNarration ?? ""} onChange={(e) => setItem(idx, { itemNarration: e.target.value })} />
                        </td>
                      </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Additional charges */}
        <div className="card overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Additional charges</p>
              <p className="text-sm text-muted mt-0.5">
                {(form.additionalCharges ?? []).length === 0 ? "Freight, insurance, packing, etc." : `${(form.additionalCharges ?? []).length} charges · ${paiseToINR(totals.addlSum * 100)}`}
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addCharge}><Icon name="Plus" /> Add charge</button>
          </div>
          {(form.additionalCharges ?? []).length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold w-12">#</th>
                  <th className="text-left px-3 py-2 font-semibold">Label</th>
                  <th className="text-right px-3 py-2 font-semibold w-40">Amount (₹)</th>
                  <th className="text-right px-3 py-2 font-semibold w-12"></th>
                </tr>
              </thead>
              <tbody>
                {(form.additionalCharges ?? []).map((c, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-3 py-2 text-muted text-xs">{idx + 1}</td>
                    <td className="px-3 py-2"><input className="input !py-1.5 text-sm" value={c.label} onChange={(e) => setCharge(idx, { label: e.target.value })} /></td>
                    <td className="px-3 py-2"><input className="input !py-1.5 tabular-nums text-right" type="number" step="0.01" min="0" value={c.amount || ""} onChange={(e) => setCharge(idx, { amount: Number(e.target.value) || 0 })} /></td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="h-8 w-8 rounded-pill grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => removeCharge(idx)}>
                        <Icon name="Trash2" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Header + summary */}
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
              {form.isInterstate
                ? <Row label="IGST" value={paiseToINR(totals.igst * 100)} />
                : <><Row label="CGST" value={paiseToINR(totals.cgst * 100)} /><Row label="SGST" value={paiseToINR(totals.sgst * 100)} /></>}
              {totals.freight > 0 && <Row label="Freight" value={paiseToINR(totals.freight * 100)} />}
              {totals.other > 0 && <Row label="Other charges" value={paiseToINR(totals.other * 100)} />}
              {(form.additionalCharges ?? []).map((c, idx) =>
                (c.label || c.amount > 0) && <Row key={idx} label={c.label || "(unnamed)"} value={paiseToINR(c.amount * 100)} />,
              )}
              {totals.roundOff !== 0 && <Row label="Round-off" value={paiseToINR(totals.roundOff * 100)} tone="muted" />}
              <div className="border-t border-border pt-2 mt-2">
                <Row label="Grand total" value={paiseToINR(totals.grand * 100)} bold size="lg" />
              </div>
            </dl>
          </div>
        </div>
      </form>

      {/* Bulk buyer modal */}
      <Modal
        open={bulkBuyerOpen}
        onClose={() => setBulkBuyerOpen(false)}
        title="Update buyer on selected lines"
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setBulkBuyerOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setBulkBuyerPick(""); applyBulkBuyer(); }}>
              <Icon name="UserMinus" /> Clear buyer
            </button>
            <button type="button" className="btn btn-primary" onClick={applyBulkBuyer} disabled={!bulkBuyerPick}>
              <Icon name="UserCheck" /> Apply
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            <strong className="text-text-default">{selectedLines.size}</strong> {selectedLines.size === 1 ? "line" : "lines"} selected. Pick a buyer below and click Apply.
          </p>
          <div>
            <label className="label">Buyer</label>
            <select className="input" value={bulkBuyerPick} onChange={(e) => setBulkBuyerPick(e.target.value)}>
              <option value="">— Pick buyer —</option>
              {tenantUsers.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.roleName}</option>)}
            </select>
          </div>
        </div>
      </Modal>

      <datalist id="po-edit-hsn-master">
        {hsnList.map((h) => (
          <option key={h.id} value={h.code}>
            {h.description ?? ""}{h.defaultGstRate != null ? ` · ${h.defaultGstRate}% GST` : ""}
          </option>
        ))}
      </datalist>
      <datalist id="po-edit-uom-master">
        {uomList.map((u) => (
          <option key={u.id} value={u.code}>{u.name}</option>
        ))}
      </datalist>
    </FormSheet>
  );
}

function Row({ label, value, bold, size, tone }: { label: string; value: string; bold?: boolean; size?: "lg"; tone?: "muted" }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={tone === "muted" ? "text-muted" : ""}>{label}</dt>
      <dd className={`tabular-nums ${bold ? "font-bold" : "font-medium"} ${size === "lg" ? "text-lg" : ""}`}>{value}</dd>
    </div>
  );
}

/** Convert a server-side PoDetail into the PoCreateInput shape the form uses. */
function rowToForm(po: PoDetail): PoCreateInput {
  return {
    companyId: po.companyId,
    unitId: po.unitId,
    vendorId: po.vendorId,
    prId: po.prId,
    title: po.title,
    description: po.description ?? "",
    isInterstate: po.isInterstate,
    placeOfSupply: po.placeOfSupply ?? "",
    deliveryDate: po.deliveryDate ? po.deliveryDate.slice(0, 10) : null,
    validUntil: po.validUntil ? po.validUntil.slice(0, 10) : null,
    deliveryAddress: po.deliveryAddress ?? "",
    deliveryTerms: po.deliveryTerms ?? "",
    paymentTerms: po.paymentTerms ?? "",
    termsAndConditions: po.termsAndConditions ?? "",
    freightCharges: Number(po.freightChargesPaise) / 100,
    otherCharges: Number(po.otherChargesPaise) / 100 - po.additionalCharges.reduce((s, c) => s + Number(c.amountPaise) / 100, 0),
    roundOff: Number(po.roundOffPaise) / 100,
    revisionNo: po.revisionNo,
    revisionRemark: po.revisionRemark ?? "",
    poType: (po.poType ?? null) as PoCreateInput["poType"],
    forDelivery: (po.forDelivery ?? null) as PoCreateInput["forDelivery"],
    creditPeriodDays: po.creditPeriodDays,
    insuranceTerms: po.insuranceTerms ?? "",
    penaltyTerms: po.penaltyTerms ?? "",
    packingTerms: po.packingTerms ?? "",
    additionalCharges: po.additionalCharges.map((c) => ({ label: c.label, amount: Number(c.amountPaise) / 100 })),
    items: po.items.map((it) => ({
      prItemId: it.prItemId,
      itemId: it.itemId,
      itemName: it.itemName,
      description: it.description ?? "",
      itemGroupName: it.itemGroupName,
      itemSubGroupName: it.itemSubGroupName,
      hsnCode: it.hsnCode,
      quantity: it.quantityScaled / 1000,
      uom: it.uom,
      unitPrice: Number(it.unitPricePaise) / 100,
      discountPercent: it.discountPercent,
      taxRate: it.taxRate,
      committedDeliveryDate: it.committedDeliveryDate ? it.committedDeliveryDate.slice(0, 10) : null,
      itemNarration: it.itemNarration ?? "",
      notes: it.notes ?? "",
      specifications: it.specifications,
      lineBuyerUserId: it.lineBuyerUserId,
      tolerancePercent: it.tolerancePercent ?? 0,
      warrantyMonths: it.warrantyMonths ?? 0,
      isForStock: Number(it.isForStock) === 1,
      isRecoveryRate: Number(it.isRecoveryRate) === 1,
      deliverySchedule: (it.deliverySchedule ?? []).map((s) => ({ qty: s.qtyScaled / 1000, deliveryDate: s.deliveryDate })),
    })),
  };
}
