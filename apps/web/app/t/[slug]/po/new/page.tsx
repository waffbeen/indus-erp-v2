"use client";
import React, { useEffect, useState, type FormEvent } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { FieldError, fieldClass } from "@/components/FieldError";
import { Modal } from "@/components/Modal";
import { FormSheet } from "@/components/FormSheet";
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

/** Standard payment terms — buyer can also type a custom value. */
const PAYMENT_TERMS_PRESETS = [
  "Net 7 days",
  "Net 15 days",
  "Net 30 days",
  "Net 45 days",
  "Net 60 days",
  "Net 90 days",
  "50% advance + 50% on delivery",
  "100% advance",
  "100% on delivery",
  "Against proforma invoice",
  "LC at sight",
  "Custom (type below)",
] as const;

/**
 * If both company GSTIN and supplier GSTIN are set, derive isInterstate from
 * the leading 2 digits (state code). When either is missing we default to
 * intra-state (CGST+SGST) which is the more common case for SMEs.
 */
function deriveIsInterstate(companyGstin?: string | null, supplierGstin?: string | null): boolean {
  if (!companyGstin || !supplierGstin) return false;
  const a = companyGstin.trim().slice(0, 2);
  const b = supplierGstin.trim().slice(0, 2);
  if (a.length !== 2 || b.length !== 2) return false;
  return a !== b;
}

/** Build a single-line address string from a Company's address fields. */
function formatCompanyAddress(c: Company | undefined): string {
  if (!c) return "";
  return [c.address, c.city, c.state, c.pincode].filter(Boolean).join(", ");
}

export default function NewPoPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const sp = useSearchParams();
  const fromPrId = sp?.get("fromPr") ?? null;
  const base = `/t/${params?.slug ?? ""}/po`;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [sourcePr, setSourcePr] = useState<{ prNumber: string | null; title: string } | null>(null);

  const [form, setForm] = useState<PoCreateInput>(emptyForm());
  const [submitting, setSubmitting] = useState<"draft" | "submit" | null>(null);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);

  // Bulk buyer update — track which lines are selected via row checkboxes
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [bulkBuyerOpen, setBulkBuyerOpen] = useState(false);
  const [bulkBuyerPick, setBulkBuyerPick] = useState<string>("");

  // Common discount % at header — typed once, applied to all lines on demand
  const [commonDiscount, setCommonDiscount] = useState<string>("");

  // Per-line delivery schedule modal — splits qty across multiple dates
  const [scheduleLineIdx, setScheduleLineIdx] = useState<number | null>(null);
  const scheduleLine = scheduleLineIdx != null ? form.items[scheduleLineIdx] : null;
  const scheduleSum = (scheduleLine?.deliverySchedule ?? []).reduce((s, e) => s + (Number(e.qty) || 0), 0);
  const scheduleRemainder = scheduleLine ? (scheduleLine.quantity || 0) - scheduleSum : 0;

  function addScheduleEntry() {
    if (scheduleLineIdx == null) return;
    setItem(scheduleLineIdx, {
      deliverySchedule: [
        ...(form.items[scheduleLineIdx]!.deliverySchedule ?? []),
        { qty: Math.max(0, scheduleRemainder), deliveryDate: "" },
      ],
    });
  }
  function removeScheduleEntry(rowIdx: number) {
    if (scheduleLineIdx == null) return;
    const current = form.items[scheduleLineIdx]!.deliverySchedule ?? [];
    setItem(scheduleLineIdx, { deliverySchedule: current.filter((_, i) => i !== rowIdx) });
  }
  function patchScheduleEntry(rowIdx: number, patch: Partial<{ qty: number; deliveryDate: string }>) {
    if (scheduleLineIdx == null) return;
    const current = form.items[scheduleLineIdx]!.deliverySchedule ?? [];
    setItem(scheduleLineIdx, {
      deliverySchedule: current.map((e, i) => i === rowIdx ? { ...e, ...patch } : e),
    });
  }

  // Additional charges grid — labelled extra costs (freight, insurance, etc.)
  function addCharge() {
    setForm((f) => ({ ...f, additionalCharges: [...(f.additionalCharges ?? []), { label: "", amount: 0 }] }));
  }
  function removeCharge(idx: number) {
    setForm((f) => ({ ...f, additionalCharges: (f.additionalCharges ?? []).filter((_, i) => i !== idx) }));
  }
  function setCharge(idx: number, patch: Partial<{ label: string; amount: number }>) {
    setForm((f) => ({
      ...f,
      additionalCharges: (f.additionalCharges ?? []).map((c, i) => i === idx ? { ...c, ...patch } : c),
    }));
  }

  useEffect(() => {
    (async () => {
      try {
        const [comps, units, vens, usersList] = await Promise.all([
          api<Company[]>("/api/tenant/companies"),
          api<Unit[]>("/api/tenant/units"),
          api<{ items: VendorListItem[] }>("/api/vendors?pageSize=100"),
          api<TenantUser[]>("/api/tenant/users"),
        ]);
        setCompanies(comps);
        setUnits(units);
        setVendors(vens.items);
        setTenantUsers(usersList);

        if (fromPrId) {
          const draft = await api<{
            pr: { id: string; prNumber: string | null; title: string; companyId: string; unitId: string };
            items: Array<{
              prItemId: string; itemId: string | null; itemName: string;
              description: string | null; itemGroupName: string | null;
              itemSubGroupName: string | null; hsnCode: string | null;
              uom: string; quantity: number; estimatedUnitPrice: number;
              itemNarration: string | null;
              specifications: Record<string, unknown> | null;
              lineBuyerUserId: string | null;
              committedDeliveryDate: string | null;
            }>;
            suggestedBuyerUserId: string | null;
            suggestedPoType: string | null;
            suggestedDeliveryDate: string | null;
          }>(`/api/po/from-pr/${fromPrId}`);
          setSourcePr({ prNumber: draft.pr.prNumber, title: draft.pr.title });
          // Default delivery address from the PR's company (auto-fill so the
          // buyer doesn't have to retype it for every PO).
          const draftCompany = comps.find((c) => c.id === draft.pr.companyId);
          const defaultAddress = formatCompanyAddress(draftCompany);
          setForm((f) => ({
            ...f,
            companyId: draft.pr.companyId,
            unitId: draft.pr.unitId,
            prId: draft.pr.id,
            title: draft.pr.title,
            deliveryAddress: f.deliveryAddress || defaultAddress,
            // Pre-fill from PR — buyer can override either field
            poType: (draft.suggestedPoType ?? null) as typeof f.poType,
            deliveryDate: draft.suggestedDeliveryDate ?? f.deliveryDate,
            items: draft.items.map((it) => ({
              prItemId: it.prItemId,
              itemId: it.itemId,
              itemName: it.itemName,
              description: it.description ?? "",
              itemGroupName: it.itemGroupName,
              itemSubGroupName: it.itemSubGroupName,
              hsnCode: it.hsnCode,
              quantity: it.quantity,
              uom: it.uom,
              unitPrice: it.estimatedUnitPrice,
              discountPercent: 0,
              taxRate: 18,
              committedDeliveryDate: it.committedDeliveryDate,
              itemNarration: it.itemNarration ?? "",
              notes: "",
              specifications: it.specifications ?? null,
              lineBuyerUserId: it.lineBuyerUserId ?? draft.suggestedBuyerUserId ?? null,
              tolerancePercent: 0,
              warrantyMonths: 0,
              isForStock: false,
              isRecoveryRate: false,
              deliverySchedule: [],
            })),
          }));
        } else {
          const primary = comps.find((c) => c.isPrimary) ?? comps[0];
          if (primary) {
            const firstUnit = units.find((u) => u.companyId === primary.id);
            const defaultAddress = formatCompanyAddress(primary);
            setForm((f) => ({
              ...f,
              companyId: primary.id,
              unitId: firstUnit?.id ?? f.unitId,
              deliveryAddress: f.deliveryAddress || defaultAddress,
            }));
          }
        }
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load", fields: {} });
      }
    })();
  }, [fromPrId]);

  const filteredUnits = units.filter((u) => u.companyId === form.companyId);
  const selectedCompany = companies.find((c) => c.id === form.companyId);
  const selectedVendor = vendors.find((v) => v.id === form.vendorId);

  // Auto-fill delivery address when company changes (only if user hasn't typed one).
  // We guard via a ref so user edits are never overwritten silently.
  const lastAutoAddressRef = React.useRef<string>("");
  useEffect(() => {
    const next = formatCompanyAddress(selectedCompany);
    if (!next) return;
    setForm((f) => {
      // Only overwrite if address is empty or matches a previous auto-fill
      if (!f.deliveryAddress || f.deliveryAddress === lastAutoAddressRef.current) {
        lastAutoAddressRef.current = next;
        return { ...f, deliveryAddress: next };
      }
      return f;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.companyId]);

  // Auto-derive isInterstate from company.gstin vs supplier.gstin. The buyer
  // can still override the IGST toggle manually.
  useEffect(() => {
    if (!selectedCompany?.gstin || !selectedVendor?.gstin) return;
    const next = deriveIsInterstate(selectedCompany.gstin, selectedVendor.gstin);
    setForm((f) => (f.isInterstate === next ? f : { ...f, isInterstate: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vendorId, form.companyId]);

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

  function set<K extends keyof PoCreateInput>(k: K, v: PoCreateInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    clearFieldErrors(k as string);
  }

  function setItem(idx: number, patch: Partial<PoItemInput>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
    clearFieldErrors(`items.${idx}`);
  }

  function addItem() {
    setForm((f) => ({
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
    }));
  }

  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
    setSelectedLines((s) => {
      const next = new Set<number>();
      for (const i of s) if (i < idx) next.add(i); else if (i > idx) next.add(i - 1);
      return next;
    });
  }

  function toggleLine(idx: number) {
    setSelectedLines((s) => {
      const next = new Set(s);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function toggleAllLines() {
    setSelectedLines((s) =>
      s.size === form.items.length ? new Set() : new Set(form.items.map((_, i) => i)),
    );
  }

  /** Apply the picked buyer to every selected line; or clear if no buyer chosen. */
  function applyBulkBuyer() {
    const picked = bulkBuyerPick || null;
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) =>
        selectedLines.has(i) ? { ...it, lineBuyerUserId: picked } : it,
      ),
    }));
    const count = selectedLines.size;
    toast.success(
      picked ? "Buyer assigned" : "Buyer cleared",
      `${count} ${count === 1 ? "line" : "lines"} updated.`,
    );
    setBulkBuyerOpen(false);
    setBulkBuyerPick("");
    setSelectedLines(new Set());
  }

  /** Common-discount apply — copies the header value to every line's discountPercent. */
  function applyCommonDiscount() {
    const pct = Number(commonDiscount);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Invalid discount", "Enter a value between 0 and 100.");
      return;
    }
    setForm((f) => ({ ...f, items: f.items.map((it) => ({ ...it, discountPercent: pct })) }));
    toast.success("Discount applied", `${pct}% set on all ${form.items.length} lines.`);
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
      sub += lineSub;
      disc += lineDisc;
      taxable += lineTaxable;
      cgst += lineTaxable * (c / 100);
      sgst += lineTaxable * (s / 100);
      igst += lineTaxable * (i / 100);
    }
    const tax = cgst + sgst + igst;
    const freight = Number(form.freightCharges) || 0;
    const other = Number(form.otherCharges) || 0;
    const roundOff = Number(form.roundOff) || 0;
    const addlSum = (form.additionalCharges ?? []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const grand = taxable + tax + freight + other + roundOff + addlSum;
    return { sub, disc, taxable, cgst, sgst, igst, tax, freight, other, roundOff, addlSum, grand };
  })();

  async function handleSave(action: "draft" | "submit") {
    if (submitting) return;

    const cleaned: PoCreateInput = {
      ...form,
      title: form.title.trim(),
      items: form.items.filter((it) => it.itemName.trim() !== "" && (it.quantity ?? 0) > 0 && (it.unitPrice ?? 0) > 0),
    };

    const result = validate(poCreateSchema, cleaned);
    if (!result.ok) {
      setErrors(result.errors);
      toast.error(
        "Form has errors",
        result.errors.summary ?? "Please fix the highlighted fields and try again",
      );
      setTimeout(() => {
        const firstKey = Object.keys(result.errors.fields)[0];
        if (firstKey) document.querySelector(`[data-field="${firstKey}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setErrors(emptyErrors);
    setSubmitting(action);
    try {
      const po = await api<{ id: string }>("/api/po", { method: "POST", body: JSON.stringify(result.data) });
      if (action === "submit") {
        await api(`/api/po/${po.id}/submit`, { method: "POST", body: JSON.stringify({}) });
        toast.success("PO submitted", "Approver review ke baad vendor ko bheja ja sakta hai.");
      } else {
        toast.success("Saved as draft", "Returnable from Drafts tab.");
      }
      router.push(`${base}/${po.id}`);
    } catch (err) {
      const parsed = apiErrorToFormErrors(err);
      setErrors(parsed);
      toast.error("Could not save PO", parsed.summary ?? "Server rejected the request — see banner for details");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <FormSheet
      title={sourcePr ? `Convert ${sourcePr.prNumber ?? "PR"} → PO` : "Purchase Order Creation"}
      subtitle={sourcePr ? `Sourced from "${sourcePr.title}" — adjust prices & supplier, then send for approval` : "Create a purchase order — send for approval, then to supplier"}
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
          <Icon name="AlertTriangle" size={14} />
          <span className="flex-1">{errors.summary}</span>
        </div>
      )}

      <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleSave("submit"); }}>
        <div className="card p-6 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-4">Header</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-2" data-field="title">
              <label className="label">Title <span className="text-danger">*</span></label>
              <input className={fieldClass(fe.title)} placeholder="e.g. PO for Bearings Q1" value={form.title} onChange={(e) => set("title", e.target.value)} />
              <FieldError error={fe.title} />
            </div>
            <div data-field="vendorId">
              <label className="label">Supplier Name <span className="text-danger">*</span></label>
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
              <input type="date" className="input" value={form.deliveryDate ?? ""} onChange={(e) => set("deliveryDate", e.target.value)} />
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3 mt-2 pt-3 border-t border-border">Tax & GST</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <label className="flex items-center gap-3 text-sm p-3 rounded-xl border border-border bg-surface cursor-pointer hover:border-border-strong">
              <input
                type="checkbox"
                checked={form.isInterstate ?? false}
                onChange={(e) => set("isInterstate", e.target.checked)}
                className="rounded h-4 w-4"
              />
              <div className="flex-1">
                <p className="font-medium text-xs">Inter-state purchase (apply IGST)</p>
                <p className="text-[11px] text-muted">Unchecked = intra-state (CGST + SGST split)</p>
              </div>
            </label>
            <div>
              <label className="label">Place of supply (state code)</label>
              <input
                className="input font-mono"
                placeholder="27 (Maharashtra)"
                value={form.placeOfSupply ?? ""}
                onChange={(e) => set("placeOfSupply", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Valid until</label>
              <input
                type="date"
                className="input"
                value={form.validUntil ?? ""}
                onChange={(e) => set("validUntil", e.target.value || null)}
              />
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3 mt-2 pt-3 border-t border-border">PO classification</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="label">PO type</label>
              <select className="input" value={form.poType ?? ""} onChange={(e) => set("poType", (e.target.value || null) as PoCreateInput["poType"])}>
                <option value="">— Select —</option>
                <option value="capex">CAPEX (capital expenditure)</option>
                <option value="opex">OPEX (operating expenses)</option>
                <option value="amc">AMC (annual maintenance)</option>
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
                <option value="ex_works">Ex Works</option>
                <option value="for_plant">FOR Plant / Site</option>
                <option value="cif">CIF (Cost + Insurance + Freight)</option>
                <option value="annexure">Annexure</option>
                <option value="upto_destination">Upto Destination</option>
              </select>
            </div>
            <div>
              <label className="label">Credit period (days)</label>
              <input
                type="number"
                min="0"
                max="720"
                className="input tabular-nums"
                placeholder="30"
                value={form.creditPeriodDays ?? ""}
                onChange={(e) => set("creditPeriodDays", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3 mt-2 pt-3 border-t border-border">Terms & delivery</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Payment terms</label>
              {/* Dropdown of common Indian-procurement payment terms + free-text override.
                  "Custom" makes the input editable; other options pre-fill the text input. */}
              <div className="flex gap-2">
                <select
                  className="input w-44 shrink-0"
                  value={PAYMENT_TERMS_PRESETS.includes(form.paymentTerms as typeof PAYMENT_TERMS_PRESETS[number]) ? form.paymentTerms ?? "" : "Custom (type below)"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "Custom (type below)") set("paymentTerms", "");
                    else set("paymentTerms", v);
                  }}
                >
                  <option value="">— Pick a preset —</option>
                  {PAYMENT_TERMS_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
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
              <input className="input" placeholder="FOR Mumbai / Ex-works / CIF Nhava Sheva" value={form.deliveryTerms ?? ""} onChange={(e) => set("deliveryTerms", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 mb-4">
            <div>
              <label className="label">Delivery address</label>
              <input className="input" value={form.deliveryAddress ?? ""} onChange={(e) => set("deliveryAddress", e.target.value)} placeholder="Full delivery address (defaults to unit address if blank)" />
            </div>
            <div>
              <label className="label">Notes / vendor instructions</label>
              <input className="input" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Brief instructions visible on PO" />
            </div>
            <div>
              <label className="label">Terms &amp; conditions</label>
              <textarea
                className="input"
                rows={2}
                value={form.termsAndConditions ?? ""}
                onChange={(e) => set("termsAndConditions", e.target.value)}
                placeholder="Standard T&C printed on the PO (warranty, returns, jurisdiction, etc.)"
              />
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3 mt-2 pt-3 border-t border-border">Printable clauses (optional)</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="label">Insurance</label>
              <textarea
                className="input"
                rows={2}
                value={form.insuranceTerms ?? ""}
                onChange={(e) => set("insuranceTerms", e.target.value)}
                placeholder="e.g. To be borne by vendor up to FOR destination..."
              />
            </div>
            <div>
              <label className="label">Penalty / LD</label>
              <textarea
                className="input"
                rows={2}
                value={form.penaltyTerms ?? ""}
                onChange={(e) => set("penaltyTerms", e.target.value)}
                placeholder="e.g. 0.5% per week of delay, max 5%..."
              />
            </div>
            <div>
              <label className="label">Packing</label>
              <textarea
                className="input"
                rows={2}
                value={form.packingTerms ?? ""}
                onChange={(e) => set("packingTerms", e.target.value)}
                placeholder="e.g. Wooden crates, sea-worthy packing..."
              />
            </div>
          </div>

          {(form.revisionNo ?? 0) > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-border">
              <div>
                <label className="label">Revision number</label>
                <input className="input" disabled value={`Rev ${form.revisionNo ?? 0}`} />
              </div>
              <div>
                <label className="label">Revision remark</label>
                <input className="input" value={form.revisionRemark ?? ""} onChange={(e) => set("revisionRemark", e.target.value)} placeholder="Why this revision was needed" />
              </div>
            </div>
          )}
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
            <div className="flex items-center gap-2 flex-wrap">
              {selectedLines.size > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setBulkBuyerPick(""); setBulkBuyerOpen(true); }}
                  title="Assign / clear buyer on selected lines"
                >
                  <Icon name="UserCog" />
                  Update buyer · {selectedLines.size}
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="input !py-1.5 !h-9 w-24 tabular-nums text-sm"
                  placeholder="Disc %"
                  value={commonDiscount}
                  onChange={(e) => setCommonDiscount(e.target.value)}
                  title="Common discount % to apply on all lines"
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={applyCommonDiscount}
                  disabled={!commonDiscount || !form.items.length}
                  title="Apply this % to all lines' Discount column"
                >
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
                        title="Select all lines"
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
                    <th className="text-left px-3 py-2 font-semibold w-44">
                      Buyer <span className="text-danger">*</span>
                    </th>
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
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={selectedLines.has(idx)}
                            onChange={() => toggleLine(idx)}
                          />
                        </td>
                        <td className="px-3 py-2 text-muted text-xs pt-3.5">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 text-sm" placeholder="Item name" value={it.itemName} onChange={(e) => setItem(idx, { itemName: e.target.value })} />
                          {(it.itemGroupName || it.itemSubGroupName) && (
                            <p className="text-[10px] text-muted mt-1 truncate">{[it.itemGroupName, it.itemSubGroupName].filter(Boolean).join(" / ")}</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 font-mono text-xs" placeholder="HSN" value={it.hsnCode ?? ""} onChange={(e) => setItem(idx, { hsnCode: e.target.value || null })} />
                        </td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 tabular-nums" type="number" step="0.001" min="0" value={it.quantity || ""} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2">
                          <input className="input !py-1.5 font-mono text-xs" value={it.uom} onChange={(e) => setItem(idx, { uom: e.target.value })} />
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
                          <select
                            className={`input !py-1.5 text-xs ${!it.lineBuyerUserId ? "!border-warning-bg" : ""}`}
                            value={it.lineBuyerUserId ?? ""}
                            onChange={(e) => setItem(idx, { lineBuyerUserId: e.target.value || null })}
                            title={!it.lineBuyerUserId ? "Assign a buyer before submitting" : ""}
                          >
                            <option value="">— Pick buyer —</option>
                            {tenantUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.fullName} · {u.roleName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="date" className="input !py-1.5 text-xs" value={it.committedDeliveryDate ?? ""} onChange={(e) => setItem(idx, { committedDeliveryDate: e.target.value || null })} />
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-right pt-3">
                          {sub > 0 ? paiseToINR(lineTotal * 100) : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" className="h-8 w-8 rounded-pill grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => removeItem(idx)} title="Remove">
                            <Icon name="Trash2" size={16} />
                          </button>
                        </td>
                      </tr>
                      <tr className="border-b border-border" style={{ background: "var(--surface)" }}>
                        <td />
                        <td />
                        <td colSpan={11} className="px-3 pb-2 pt-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              className="input !py-1.5 text-xs flex-1 min-w-[280px]"
                              placeholder="Item-wise remark / special instruction (appears on the PO sent to vendor)"
                              value={it.itemNarration ?? ""}
                              onChange={(e) => setItem(idx, { itemNarration: e.target.value })}
                            />
                            <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
                              Tolerance
                              <input
                                className="input !py-1 !h-8 w-16 tabular-nums text-xs"
                                type="number"
                                step="0.5"
                                min="0"
                                max="50"
                                value={it.tolerancePercent ?? 0}
                                onChange={(e) => setItem(idx, { tolerancePercent: Number(e.target.value) })}
                                title="Acceptable ± receipt variance (%)"
                              />
                              %
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
                              Warranty
                              <input
                                className="input !py-1 !h-8 w-16 tabular-nums text-xs"
                                type="number"
                                step="1"
                                min="0"
                                max="120"
                                value={it.warrantyMonths ?? 0}
                                onChange={(e) => setItem(idx, { warrantyMonths: Number(e.target.value) })}
                                title="Vendor warranty in months"
                              />
                              mo
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap select-none cursor-pointer">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={it.isForStock ?? false}
                                onChange={(e) => setItem(idx, { isForStock: e.target.checked })}
                              />
                              For Stock
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap select-none cursor-pointer">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={it.isRecoveryRate ?? false}
                                onChange={(e) => setItem(idx, { isRecoveryRate: e.target.checked })}
                              />
                              Recovery
                            </label>
                            <button
                              type="button"
                              className="text-[11px] font-medium flex items-center gap-1 text-primary hover:underline whitespace-nowrap"
                              onClick={() => setScheduleLineIdx(idx)}
                              title={(it.deliverySchedule ?? []).length > 0 ? `${(it.deliverySchedule ?? []).length} delivery drops scheduled` : "Split this line across multiple delivery dates"}
                            >
                              <Icon name="CalendarDays" size={14} />
                              Schedule{(it.deliverySchedule ?? []).length > 0 ? ` · ${(it.deliverySchedule ?? []).length}` : ""}
                            </button>
                          </div>
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

        {/* Additional charges grid — multi-row labelled costs */}
        <div className="card overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Additional charges</p>
              <p className="text-sm text-muted mt-0.5">
                {(form.additionalCharges ?? []).length === 0
                  ? "Itemised header costs — freight, insurance, packing, loading, etc."
                  : `${(form.additionalCharges ?? []).length} ${(form.additionalCharges ?? []).length === 1 ? "charge" : "charges"} · ${paiseToINR(totals.addlSum * 100)}`}
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addCharge}>
              <Icon name="Plus" /> Add charge
            </button>
          </div>
          {(form.additionalCharges ?? []).length > 0 && (
            <div className="overflow-x-auto">
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
                      <td className="px-3 py-2">
                        <input
                          className="input !py-1.5 text-sm"
                          placeholder="e.g. Freight to plant / Insurance / Packing"
                          value={c.label}
                          onChange={(e) => setCharge(idx, { label: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input !py-1.5 tabular-nums text-right"
                          type="number"
                          step="0.01"
                          min="0"
                          value={c.amount || ""}
                          onChange={(e) => setCharge(idx, { amount: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" className="h-8 w-8 rounded-pill grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => removeCharge(idx)} title="Remove charge">
                          <Icon name="Trash2" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Financial breakup card */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 mb-5">
          <div className="card p-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-4">Header charges</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Freight (₹)</label>
                <input
                  className="input tabular-nums"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.freightCharges || 0}
                  onChange={(e) => set("freightCharges", Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="label">Other charges (₹)</label>
                <input
                  className="input tabular-nums"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.otherCharges || 0}
                  onChange={(e) => set("otherCharges", Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="label">Round-off (₹)</label>
                <input
                  className="input tabular-nums"
                  type="number"
                  step="0.01"
                  value={form.roundOff || 0}
                  onChange={(e) => set("roundOff", Number(e.target.value) || 0)}
                  title="Manual round-off — can be negative"
                />
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
              {(form.additionalCharges ?? []).map((c, idx) => (
                (c.label || c.amount > 0) && <Row key={idx} label={c.label || "(unnamed)"} value={paiseToINR(c.amount * 100)} />
              ))}
              {totals.roundOff !== 0 && <Row label="Round-off" value={paiseToINR(totals.roundOff * 100)} tone="muted" />}
              <div className="border-t border-border pt-2 mt-2">
                <Row label="Grand total" value={paiseToINR(totals.grand * 100)} bold size="lg" />
              </div>
            </dl>
          </div>
        </div>
      </form>

      {/* Delivery schedule modal — split a line's qty across dates */}
      <Modal
        open={scheduleLineIdx != null}
        onClose={() => setScheduleLineIdx(null)}
        title={scheduleLine ? `Delivery schedule · ${scheduleLine.itemName || `Line ${(scheduleLineIdx ?? 0) + 1}`}` : "Delivery schedule"}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addScheduleEntry}>
              <Icon name="Plus" /> Add drop
            </button>
            <div className="flex-1" />
            <button type="button" className="btn btn-primary" onClick={() => setScheduleLineIdx(null)}>
              Done
            </button>
          </>
        }
      >
        {scheduleLine && (
          <div className="space-y-3">
            <div className="rounded-xl p-3 bg-surface border border-border text-sm flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">Line qty</p>
                <p className="font-bold tabular-nums">{scheduleLine.quantity} {scheduleLine.uom}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">Scheduled</p>
                <p className="font-bold tabular-nums">{scheduleSum} {scheduleLine.uom}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">Remaining</p>
                <p className={`font-bold tabular-nums ${scheduleRemainder < 0 ? "text-danger" : scheduleRemainder === 0 ? "text-success" : ""}`}>
                  {scheduleRemainder} {scheduleLine.uom}
                </p>
              </div>
              {scheduleRemainder !== 0 && (scheduleLine.deliverySchedule?.length ?? 0) > 0 && (
                <div className="basis-full">
                  <p className="text-[11px] text-warning-fg">
                    Tip: Scheduled sum should match the line qty. Right now it&apos;s {scheduleRemainder < 0 ? "over" : "under"} by {Math.abs(scheduleRemainder)} {scheduleLine.uom}.
                  </p>
                </div>
              )}
            </div>

            {(scheduleLine.deliverySchedule?.length ?? 0) === 0 ? (
              <div className="p-8 text-center text-muted text-sm rounded-xl border border-dashed border-border">
                <Icon name="CalendarDays" size={28} className="mx-auto mb-2 opacity-50" />
                <p>No schedule yet — line will use the committed delivery date as a single drop.</p>
                <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={addScheduleEntry}>
                  <Icon name="Plus" /> Add first drop
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold w-12">#</th>
                    <th className="text-left px-3 py-2 font-semibold w-40">Qty</th>
                    <th className="text-left px-3 py-2 font-semibold">Delivery date</th>
                    <th className="text-right px-3 py-2 font-semibold w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {(scheduleLine.deliverySchedule ?? []).map((entry, rowIdx) => (
                    <tr key={rowIdx} className="border-t border-border">
                      <td className="px-3 py-2 text-muted text-xs">{rowIdx + 1}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          className="input !py-1.5 tabular-nums"
                          value={entry.qty || ""}
                          onChange={(e) => patchScheduleEntry(rowIdx, { qty: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          className="input !py-1.5"
                          value={entry.deliveryDate ?? ""}
                          onChange={(e) => patchScheduleEntry(rowIdx, { deliveryDate: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="h-8 w-8 rounded-pill grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg"
                          onClick={() => removeScheduleEntry(rowIdx)}
                          title="Remove drop"
                        >
                          <Icon name="Trash2" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Modal>

      {/* Bulk buyer update modal */}
      <Modal
        open={bulkBuyerOpen}
        onClose={() => setBulkBuyerOpen(false)}
        title="Update buyer on selected lines"
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setBulkBuyerOpen(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setBulkBuyerPick(""); applyBulkBuyer(); }}
              title="Clear the buyer field on these lines"
            >
              <Icon name="UserMinus" /> Clear buyer
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={applyBulkBuyer}
              disabled={!bulkBuyerPick}
            >
              <Icon name="UserCheck" /> Apply
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-2xl grid place-items-center shrink-0" style={{ background: "var(--tint-lilac)", color: "var(--tint-lilac-fg)" }}>
              <Icon name="UserCog" size={22} />
            </div>
            <div className="flex-1 text-sm text-muted leading-relaxed">
              <strong className="text-text-default">{selectedLines.size}</strong> {selectedLines.size === 1 ? "line is" : "lines are"} selected.
              Pick a buyer below and click <strong>Apply</strong> — the choice will be set on every selected line.
              Use <strong>Clear buyer</strong> to remove the buyer assignment instead.
            </div>
          </div>
          <div>
            <label className="label">Buyer</label>
            <select className="input" value={bulkBuyerPick} onChange={(e) => setBulkBuyerPick(e.target.value)}>
              <option value="">— Pick buyer —</option>
              {tenantUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName} · {u.roleName}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
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

function emptyForm(): PoCreateInput {
  return {
    companyId: "",
    unitId: "",
    vendorId: "",
    prId: null,
    title: "",
    description: "",
    isInterstate: false,
    placeOfSupply: "",
    deliveryDate: null,
    validUntil: null,
    deliveryAddress: "",
    deliveryTerms: "",
    paymentTerms: "",
    termsAndConditions: "",
    freightCharges: 0,
    otherCharges: 0,
    roundOff: 0,
    revisionNo: 0,
    revisionRemark: "",
    poType: null,
    forDelivery: null,
    creditPeriodDays: null,
    insuranceTerms: "",
    penaltyTerms: "",
    packingTerms: "",
    additionalCharges: [],
    items: [
      {
        prItemId: null, itemId: null, itemName: "", description: "",
        itemGroupName: null, itemSubGroupName: null, hsnCode: null,
        quantity: 1, uom: "nos", unitPrice: 0,
        discountPercent: 0, taxRate: 18,
        committedDeliveryDate: null,
        itemNarration: "", notes: "", specifications: null,
        lineBuyerUserId: null,
      },
    ],
  };
}
