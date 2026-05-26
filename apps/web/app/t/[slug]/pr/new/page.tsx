"use client";
import React, { useEffect, useState, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
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

export default function NewPrPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/pr`;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [itemMaster, setItemMaster] = useState<ItemListItem[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);

  const [form, setForm] = useState<PrCreateInput>(emptyForm());
  const [submitting, setSubmitting] = useState<"draft" | "submit" | null>(null);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);

  useEffect(() => {
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
  }, []);

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
      itemId: m.id,
      itemName: m.name,
      uom: m.uom,
      stockUnit: m.stockUnit ?? null,
      purchaseUnit: m.purchaseUnit ?? null,
      hsnCode: m.hsnCode ?? null,
      itemGroupName: m.itemGroupName ?? null,
      itemSubGroupName: m.itemSubGroupName ?? null,
    });
    // Async — fetch last purchase info to help requester estimate price
    try {
      const lp = await api<{ ratePaise: string | null; date: string | null; vendorName: string | null; poNumber: string | null }>(
        `/api/items/${masterItemId}/last-purchase`,
      );
      if (lp.ratePaise) {
        const rupees = Number(lp.ratePaise) / 100;
        setItem(idx, {
          lastPurchaseRate: rupees,
          lastPurchaseDate: lp.date ? lp.date.slice(0, 10) : null,
          // pre-fill estimated price if empty
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
    } catch {
      /* no history — that's fine */
    }
  }

  const totalRupees = form.items.reduce((sum, it) => sum + (it.quantity || 0) * (it.estimatedUnitPrice || 0), 0);

  async function handleSave(action: "draft" | "submit") {
    if (submitting) return;

    // Strip empty placeholder rows so a starter row doesn't block submission
    const cleaned: PrCreateInput = {
      ...form,
      title: form.title.trim(),
      items: form.items.filter((it) => it.itemName.trim() !== "" && (it.quantity ?? 0) > 0),
    };

    const result = validate(prCreateSchema, cleaned);
    if (!result.ok) {
      setErrors(result.errors);
      toast.error(
        "Form has errors",
        result.errors.summary ?? "Please fix the highlighted fields and try again",
      );
      setTimeout(() => {
        const firstKey = Object.keys(result.errors.fields)[0];
        if (firstKey) {
          const el = document.querySelector(`[data-field="${firstKey}"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
      return;
    }
    setErrors(emptyErrors);
    setSubmitting(action);
    try {
      const created = await api<{ id: string }>("/api/pr", {
        method: "POST",
        body: JSON.stringify(result.data),
      });
      if (action === "submit") {
        await api(`/api/pr/${created.id}/submit`, { method: "POST", body: JSON.stringify({}) });
        toast.success("Requisition submitted", "Sent for approval. You'll be notified when a decision is made.");
      } else {
        toast.success("Saved as draft", "Returnable from the Drafts tab.");
      }
      router.push(`${base}/${created.id}`);
    } catch (err) {
      const parsed = apiErrorToFormErrors(err);
      setErrors(parsed);
      toast.error("Could not save", parsed.summary ?? "Server rejected the request");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-3 text-sm text-muted">
        <Link href={base} className="hover:text-text-default">Requisitions</Link>
        <Icon name="ChevronRight" size={14} />
        <span className="text-text-default font-medium">Create</span>
      </div>

      <PageHeader
        title="Purchase Requisition Creation"
        subtitle="Fill in the request, add line items, save or send for approval"
        actions={
          <>
            <Link href={base} className="btn btn-ghost">Cancel</Link>
            <button type="button" className="btn btn-ghost" onClick={() => handleSave("draft")} disabled={!!submitting}>
              {submitting === "draft" ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => handleSave("submit")} disabled={!!submitting}>
              {submitting === "submit" ? "Sending…" : "Send for Approval"}
              <Icon name="ArrowRight" />
            </button>
          </>
        }
      />

      {errors.summary && (
        <div className="mb-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm flex items-start gap-2">
          <Icon name="AlertTriangle" size={16} />
          <span className="flex-1">{errors.summary}</span>
        </div>
      )}

      <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleSave("submit"); }}>
        <div className="card p-6 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-4">Header</p>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
            <div className="lg:col-span-2" data-field="title">
              <label className="label">Title <span className="text-danger">*</span></label>
              <input
                className={fieldClass(fe.title)}
                placeholder="e.g. Monthly bearings restock for Q1"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Reference number <span className="text-muted text-xs">(client PO / work order / external ref)</span></label>
              <input
                className="input"
                placeholder="e.g. SO-2026/00134 or external ref"
                value={form.referenceNo ?? ""}
                onChange={(e) => set("referenceNo", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Buyer <span className="text-muted text-xs">(executes the purchase)</span></label>
              <select
                className="input"
                value={form.buyerUserId ?? ""}
                onChange={(e) => set("buyerUserId", e.target.value || null)}
              >
                <option value="">— Unassigned —</option>
                {tenantUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} · {u.roleName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
            <div data-field="companyId">
              <label className="label">Company <span className="text-danger">*</span></label>
              <select className={fieldClass(fe.companyId)} value={form.companyId} onChange={(e) => set("companyId", e.target.value)}>
                <option value="">Select company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.isPrimary ? " · primary" : ""}</option>
                ))}
              </select>
              <FieldError error={fe.companyId} />
            </div>
            <div data-field="unitId">
              <label className="label">Unit / Plant <span className="text-danger">*</span></label>
              <select className={fieldClass(fe.unitId)} value={form.unitId} onChange={(e) => set("unitId", e.target.value)}>
                <option value="">Select unit…</option>
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>
                ))}
              </select>
              <FieldError error={fe.unitId} />
            </div>
            <div>
              <label className="label">Department <span className="text-muted text-xs">(requesting team)</span></label>
              <select
                className="input"
                value={form.departmentId ?? ""}
                onChange={(e) => set("departmentId", e.target.value || null)}
              >
                <option value="">— Unassigned —</option>
                {departments
                  .filter((d) => !d.unitId || d.unitId === form.unitId)
                  .map((d) => (
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
            <textarea
              className={fieldClass(fe.description)}
              rows={2}
              placeholder="Why is this needed? Any context the approver should know?"
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
            <FieldError error={fe.description} />
          </div>
        </div>

        <div className="card overflow-hidden mb-5" data-field="items">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Line items</p>
              <p className="text-sm text-muted mt-0.5">{form.items.length} {form.items.length === 1 ? "item" : "items"} · estimated {paiseToINR(totalRupees * 100)}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
              <Icon name="Plus" /> Add line
            </button>
          </div>

          {fe.items && (
            <div className="px-6 py-2 text-xs text-danger-fg bg-danger-bg">{fe.items}</div>
          )}

          {form.items.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-muted text-sm mb-3">No line items yet</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={addItem}>
                <Icon name="Plus" /> Add first item
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold w-12">#</th>
                    <th className="text-left px-3 py-2 font-semibold min-w-[280px]">Item</th>
                    <th className="text-left px-3 py-2 font-semibold w-28">HSN</th>
                    <th className="text-left px-3 py-2 font-semibold w-28">Qty</th>
                    <th className="text-left px-3 py-2 font-semibold w-24">UOM</th>
                    <th className="text-left px-3 py-2 font-semibold w-36">Est. price (₹)</th>
                    <th className="text-left px-3 py-2 font-semibold w-32">Line total</th>
                    <th className="text-left px-3 py-2 font-semibold w-40">Needed by</th>
                    <th className="text-right px-3 py-2 font-semibold w-12"></th>
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
                        <td className="px-3 py-2 text-muted text-xs pt-4">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <select
                            className="input !py-1.5 mb-1.5 text-xs"
                            value={it.itemId ?? ""}
                            onChange={(e) => {
                              if (e.target.value) pickMasterItem(idx, e.target.value);
                              else setItem(idx, { itemId: null });
                            }}
                          >
                            <option value="">— Custom / pick from master —</option>
                            {itemMaster.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.uom})</option>)}
                          </select>
                          <input
                            className={fieldClass(nameErr, "input !py-1.5 text-sm")}
                            placeholder="Item name"
                            value={it.itemName}
                            onChange={(e) => setItem(idx, { itemName: e.target.value })}
                          />
                          <FieldError error={nameErr} />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input !py-1.5 font-mono text-xs"
                            placeholder="HSN"
                            value={it.hsnCode ?? ""}
                            onChange={(e) => setItem(idx, { hsnCode: e.target.value || null })}
                          />
                          {(it.itemGroupName || it.itemSubGroupName) && (
                            <p className="text-[10px] text-muted mt-1 truncate">
                              {[it.itemGroupName, it.itemSubGroupName].filter(Boolean).join(" / ")}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={fieldClass(qtyErr, "input !py-1.5 tabular-nums")}
                            type="number"
                            step="0.001"
                            min="0"
                            value={it.quantity || ""}
                            onChange={(e) => setItem(idx, { quantity: e.target.value === "" ? 0 : Number(e.target.value) })}
                          />
                          <FieldError error={qtyErr} />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={fieldClass(uomErr, "input !py-1.5 font-mono text-xs")}
                            value={it.uom}
                            onChange={(e) => setItem(idx, { uom: e.target.value })}
                          />
                          <FieldError error={uomErr} />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={fieldClass(priceErr, "input !py-1.5 tabular-nums")}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="optional"
                            value={it.estimatedUnitPrice ?? ""}
                            onChange={(e) => setItem(idx, { estimatedUnitPrice: e.target.value === "" ? null : Number(e.target.value) })}
                          />
                          <FieldError error={priceErr} />
                          {it.lastPurchaseRate && it.lastPurchaseRate > 0 && (
                            <p className="text-[10px] text-muted mt-1 leading-tight">
                              <span className="font-medium">Last: ₹{it.lastPurchaseRate.toFixed(2)}</span>
                              {it.lastPurchaseDate && <span className="opacity-70"> · {new Date(it.lastPurchaseDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</span>}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums font-semibold pt-3">
                          {lineTotal > 0 ? paiseToINR(lineTotal * 100) : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            className="input !py-1.5 text-xs"
                            value={it.expectedDeliveryDate ?? ""}
                            onChange={(e) => setItem(idx, { expectedDeliveryDate: e.target.value || null })}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="h-8 w-8 rounded-pill grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg disabled:opacity-30 disabled:cursor-not-allowed"
                            onClick={() => removeItem(idx)}
                            disabled={form.items.length === 1}
                            title={form.items.length === 1 ? "At least one line required" : "Remove line"}
                          >
                            <Icon name="Trash2" size={16} />
                          </button>
                        </td>
                      </tr>
                      <tr className="border-b border-border" style={{ background: "var(--surface)" }}>
                        <td />
                        <td colSpan={8} className="px-3 pb-2">
                          <input
                            className="input !py-1.5 text-xs"
                            placeholder="Item-wise remark / special instruction (visible on PO)"
                            value={it.itemNarration ?? ""}
                            onChange={(e) => setItem(idx, { itemNarration: e.target.value })}
                          />
                        </td>
                      </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface">
                    <td colSpan={6} className="px-3 py-3 text-right font-semibold text-muted">Estimated total</td>
                    <td className="px-3 py-3 font-bold tabular-nums">{paiseToINR(totalRupees * 100)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </form>
    </>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyForm(): PrCreateInput {
  return {
    companyId: "",
    unitId: "",
    departmentId: null,
    title: "",
    description: "",
    prType: "stock",
    referenceNo: "",
    buyerUserId: null,
    priority: "normal",
    neededBy: todayIso(),
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
