"use client";
import React, { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { FieldError, fieldClass } from "@/components/FieldError";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR } from "@/lib/format";
import { prCreateSchema, type PrCreateInput, type PrItemInput, type ItemListItem } from "@indus/shared";
import { validate, apiErrorToFormErrors, emptyErrors, type FormErrorState } from "@/lib/form-errors";

interface Company { id: string; name: string; isPrimary: boolean; }
interface Unit { id: string; companyId: string; name: string; code: string | null; }
interface Department { id: string; unitId: string | null; name: string; code: string | null; }
interface TenantUser { id: string; fullName: string; email: string; isTenantAdmin: boolean; roleName: string; }

const PR_TYPES = [
  { key: "stock",        label: "Stock replenishment" },
  { key: "job_specific", label: "Job-specific" },
  { key: "capex",        label: "CAPEX" },
  { key: "amc",          label: "AMC" },
  { key: "maintenance",  label: "Maintenance" },
  { key: "service",      label: "Service" },
  { key: "other",        label: "Other" },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful save. Receives the newly-created PR id. */
  onCreated?: (prId: string) => void;
}

/**
 * Legacy-style PR creation modal — the entire form sits inside a Modal so the
 * user stays on the list view (list visible behind the backdrop). Mirrors the
 * legacy "Purchase Requisition Creation / Updation" dialog.
 */
export function PrCreateModal({ open, onClose, onCreated }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [itemMaster, setItemMaster] = useState<ItemListItem[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);

  const [form, setForm] = useState<PrCreateInput>(emptyForm());
  const [submitting, setSubmitting] = useState<"draft" | "submit" | null>(null);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);

  // Load lookup data the first time the modal opens
  useEffect(() => {
    if (!open) return;
    // Reset form on each open so it doesn't reuse the previous values
    setForm(emptyForm());
    setErrors(emptyErrors);
    (async () => {
      try {
        const [comps, units, depts, items, usersList] = await Promise.all([
          api<Company[]>("/api/tenant/companies"),
          api<Unit[]>("/api/tenant/units"),
          api<Department[]>("/api/tenant/departments"),
          api<{ items: ItemListItem[] }>("/api/items?pageSize=100"),
          api<TenantUser[]>("/api/tenant/users"),
        ]);
        setCompanies(comps);
        setUnits(units);
        setDepartments(depts);
        setItemMaster(items.items);
        setTenantUsers(usersList);
        const primary = comps.find((c) => c.isPrimary) ?? comps[0];
        if (primary) {
          const firstUnit = units.find((u) => u.companyId === primary.id);
          setForm((f) => ({ ...f, companyId: primary.id, unitId: firstUnit?.id ?? f.unitId }));
        }
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load form data", fields: {} });
      }
    })();
  }, [open]);

  const filteredUnits = units.filter((u) => u.companyId === form.companyId);
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

  function set<K extends keyof PrCreateInput>(k: K, v: PrCreateInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    clearFieldErrors(k as string);
  }

  function setItem(idx: number, patch: Partial<PrItemInput>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
    clearFieldErrors(`items.${idx}`);
  }

  function addItem() {
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        {
          itemId: null, itemName: "", description: "",
          itemGroupName: null, itemSubGroupName: null, hsnCode: null,
          quantity: 1, uom: "nos", stockUnit: null, purchaseUnit: null,
          estimatedUnitPrice: null,
          lastPurchaseRate: null, lastPurchaseDate: null,
          expectedDeliveryDate: null,
          itemNarration: "", notes: "",
          lineBuyerUserId: null, specifications: null,
        },
      ],
    }));
  }

  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
    clearFieldErrors(`items.${idx}`);
  }

  async function pickMasterItem(idx: number, masterItemId: string) {
    const m = itemMaster.find((x) => x.id === masterItemId);
    if (!m) return;
    setItem(idx, {
      itemId: m.id, itemName: m.name, uom: m.uom,
      stockUnit: m.stockUnit ?? null, purchaseUnit: m.purchaseUnit ?? null,
      hsnCode: m.hsnCode ?? null,
      itemGroupName: m.itemGroupName ?? null, itemSubGroupName: m.itemSubGroupName ?? null,
    });
    try {
      const lp = await api<{ ratePaise: string | null; date: string | null }>(
        `/api/items/${masterItemId}/last-purchase`,
      );
      if (lp.ratePaise) {
        const rupees = Number(lp.ratePaise) / 100;
        setItem(idx, {
          lastPurchaseRate: rupees,
          lastPurchaseDate: lp.date ? lp.date.slice(0, 10) : null,
        });
        setForm((f) => ({
          ...f,
          items: f.items.map((row, i) => {
            if (i !== idx) return row;
            if (row.estimatedUnitPrice && row.estimatedUnitPrice > 0) return row;
            return { ...row, estimatedUnitPrice: rupees };
          }),
        }));
      }
    } catch { /* no history */ }
  }

  const totalRupees = form.items.reduce((sum, it) => sum + (it.quantity || 0) * (it.estimatedUnitPrice || 0), 0);

  async function handleSave(action: "draft" | "submit") {
    if (submitting) return;
    const cleaned: PrCreateInput = {
      ...form,
      title: form.title.trim(),
      items: form.items.filter((it) => it.itemName.trim() !== "" && (it.quantity ?? 0) > 0),
    };
    const result = validate(prCreateSchema, cleaned);
    if (!result.ok) {
      setErrors(result.errors);
      toast.error("Form has errors", result.errors.summary ?? "Please fix the highlighted fields and try again");
      setTimeout(() => {
        const firstKey = Object.keys(result.errors.fields)[0];
        if (firstKey) document.querySelector(`[data-field="${firstKey}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setErrors(emptyErrors);
    setSubmitting(action);
    try {
      const created = await api<{ id: string }>("/api/pr", { method: "POST", body: JSON.stringify(result.data) });
      if (action === "submit") {
        await api(`/api/pr/${created.id}/submit`, { method: "POST", body: JSON.stringify({}) });
        toast.success("Requisition sent for approval", "Approver ko notification chala gaya.");
      } else {
        toast.success("Saved as draft", "Returnable from the Drafts tab.");
      }
      onCreated?.(created.id);
      onClose();
    } catch (err) {
      const parsed = apiErrorToFormErrors(err);
      setErrors(parsed);
      toast.error("Could not save", parsed.summary ?? "Server rejected the request");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Purchase Requisition Creation"
      description="Fill in the request, add line items, save or send for approval"
      size="2xl"
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={!!submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleSave("draft")} disabled={!!submitting}>
            {submitting === "draft" ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSave("submit")} disabled={!!submitting}>
            {submitting === "submit" ? "Sending…" : "Send for Approval"}
            <Icon name="ArrowRight" size={13} />
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
        {/* Header card */}
        <div className="card p-4 mb-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted mb-3">Header</p>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-3">
            <div className="lg:col-span-2" data-field="title">
              <label className="label">Title <span className="text-danger">*</span></label>
              <input className={fieldClass(fe.title)} placeholder="e.g. Monthly bearings restock for Q1" value={form.title} onChange={(e) => set("title", e.target.value)} />
              <FieldError error={fe.title} />
            </div>
            <div>
              <label className="label">PR Type</label>
              <select className="input" value={form.prType ?? "stock"} onChange={(e) => set("prType", e.target.value as PrCreateInput["prType"])}>
                {PR_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={(e) => set("priority", e.target.value as PrCreateInput["priority"])}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Reference number</label>
              <input className="input" placeholder="e.g. SO-2026/00134" value={form.referenceNo ?? ""} onChange={(e) => set("referenceNo", e.target.value)} />
            </div>
            <div>
              <label className="label">Buyer (executes the purchase)</label>
              <select className="input" value={form.buyerUserId ?? ""} onChange={(e) => set("buyerUserId", e.target.value || null)}>
                <option value="">— Unassigned —</option>
                {tenantUsers.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.roleName}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-3">
            <div data-field="companyId">
              <label className="label">Company <span className="text-danger">*</span></label>
              <select className={fieldClass(fe.companyId)} value={form.companyId} onChange={(e) => set("companyId", e.target.value)}>
                <option value="">Select…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isPrimary ? " · primary" : ""}</option>)}
              </select>
              <FieldError error={fe.companyId} />
            </div>
            <div data-field="unitId">
              <label className="label">Unit / Plant <span className="text-danger">*</span></label>
              <select className={fieldClass(fe.unitId)} value={form.unitId} onChange={(e) => set("unitId", e.target.value)}>
                <option value="">Select…</option>
                {filteredUnits.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
              </select>
              <FieldError error={fe.unitId} />
            </div>
            <div>
              <label className="label">Department</label>
              <select className="input" value={form.departmentId ?? ""} onChange={(e) => set("departmentId", e.target.value || null)}>
                <option value="">— Unassigned —</option>
                {departments.filter((d) => !d.unitId || d.unitId === form.unitId).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.code ? ` (${d.code})` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Needed by</label>
              <input type="date" className="input" value={form.neededBy ?? ""} onChange={(e) => set("neededBy", e.target.value || null)} />
            </div>
          </div>

          <div>
            <label className="label">Description / business justification</label>
            <textarea className={fieldClass(fe.description)} rows={2} placeholder="Why is this needed? Any context the approver should know?" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
            <FieldError error={fe.description} />
          </div>
        </div>

        {/* Items */}
        <div className="card overflow-hidden mb-3" data-field="items">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">Line items</p>
              <p className="text-[11.5px] text-muted mt-0.5">{form.items.length} {form.items.length === 1 ? "item" : "items"} · estimated {paiseToINR(totalRupees * 100)}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
              <Icon name="Plus" size={13} /> Add line
            </button>
          </div>

          {fe.items && (
            <div className="px-4 py-2 text-xs text-danger-fg bg-danger-bg">{fe.items}</div>
          )}

          {form.items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted text-[12px] mb-2">No line items yet</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={addItem}>
                <Icon name="Plus" size={13} /> Add first item
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-8">#</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted min-w-[240px]">Item</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-24">HSN</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-24">Qty</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-20">UOM</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-32">Est. price (₹)</th>
                    <th className="text-right px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-28">Line total</th>
                    <th className="text-left px-2 py-1.5 font-semibold uppercase tracking-wider text-muted w-32">Needed by</th>
                    <th className="text-right px-2 py-1.5 font-semibold w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, idx) => {
                    const lineTotal = (it.quantity || 0) * (it.estimatedUnitPrice || 0);
                    const nameErr = fe[`items.${idx}.itemName`];
                    const qtyErr = fe[`items.${idx}.quantity`];
                    const uomErr = fe[`items.${idx}.uom`];
                    const priceErr = fe[`items.${idx}.estimatedUnitPrice`];
                    return (
                      <React.Fragment key={idx}>
                        <tr className="border-t border-border align-top">
                          <td className="px-2 py-1.5 text-muted text-[11px] pt-3">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <select className="input !py-1 !h-8 mb-1 text-[11px]" value={it.itemId ?? ""} onChange={(e) => { if (e.target.value) pickMasterItem(idx, e.target.value); else setItem(idx, { itemId: null }); }}>
                              <option value="">— Custom / pick from master —</option>
                              {itemMaster.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.uom})</option>)}
                            </select>
                            <input className={fieldClass(nameErr, "input !py-1 !h-8 text-[12px]")} placeholder="Item name" value={it.itemName} onChange={(e) => setItem(idx, { itemName: e.target.value })} />
                            <FieldError error={nameErr} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input className="input !py-1 !h-8 font-mono text-[11px]" placeholder="HSN" value={it.hsnCode ?? ""} onChange={(e) => setItem(idx, { hsnCode: e.target.value || null })} />
                            {(it.itemGroupName || it.itemSubGroupName) && (
                              <p className="text-[10px] text-muted mt-0.5 truncate">{[it.itemGroupName, it.itemSubGroupName].filter(Boolean).join(" / ")}</p>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <input className={fieldClass(qtyErr, "input !py-1 !h-8 tabular-nums")} type="number" step="0.001" min="0" value={it.quantity || ""} onChange={(e) => setItem(idx, { quantity: e.target.value === "" ? 0 : Number(e.target.value) })} />
                            <FieldError error={qtyErr} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input className={fieldClass(uomErr, "input !py-1 !h-8 font-mono text-[11px]")} value={it.uom} onChange={(e) => setItem(idx, { uom: e.target.value })} />
                            <FieldError error={uomErr} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input className={fieldClass(priceErr, "input !py-1 !h-8 tabular-nums")} type="number" step="0.01" min="0" placeholder="optional" value={it.estimatedUnitPrice ?? ""} onChange={(e) => setItem(idx, { estimatedUnitPrice: e.target.value === "" ? null : Number(e.target.value) })} />
                            <FieldError error={priceErr} />
                            {it.lastPurchaseRate && it.lastPurchaseRate > 0 && (
                              <p className="text-[10px] text-muted mt-0.5 leading-tight">
                                <span className="font-medium">Last: ₹{it.lastPurchaseRate.toFixed(2)}</span>
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-1.5 tabular-nums font-semibold text-right pt-3">
                            {lineTotal > 0 ? paiseToINR(lineTotal * 100) : <span className="text-muted">—</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="date" className="input !py-1 !h-8 text-[11px]" value={it.expectedDeliveryDate ?? ""} onChange={(e) => setItem(idx, { expectedDeliveryDate: e.target.value || null })} />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button type="button" className="h-7 w-7 rounded grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg disabled:opacity-30" onClick={() => removeItem(idx)} disabled={form.items.length === 1} title={form.items.length === 1 ? "At least one line required" : "Remove line"}>
                              <Icon name="Trash2" size={13} />
                            </button>
                          </td>
                        </tr>
                        <tr className="border-b border-border" style={{ background: "var(--surface)" }}>
                          <td />
                          <td colSpan={8} className="px-2 pb-1.5">
                            <input className="input !py-1 !h-7 text-[11px]" placeholder="Item-wise remark (visible on PO)" value={it.itemNarration ?? ""} onChange={(e) => setItem(idx, { itemNarration: e.target.value })} />
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-surface">
                    <td colSpan={6} className="px-2 py-2 text-right font-semibold text-muted">Estimated total</td>
                    <td className="px-2 py-2 font-bold tabular-nums text-right">{paiseToINR(totalRupees * 100)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyForm(): PrCreateInput {
  return {
    companyId: "", unitId: "", departmentId: null,
    title: "", description: "",
    prType: "stock", referenceNo: "", buyerUserId: null,
    priority: "normal", neededBy: todayIso(),
    items: [
      {
        itemId: null, itemName: "", description: "",
        itemGroupName: null, itemSubGroupName: null, hsnCode: null,
        quantity: 1, uom: "nos", stockUnit: null, purchaseUnit: null,
        estimatedUnitPrice: null,
        lastPurchaseRate: null, lastPurchaseDate: null,
        expectedDeliveryDate: null,
        itemNarration: "", notes: "",
        lineBuyerUserId: null, specifications: null,
      },
    ],
  };
}
