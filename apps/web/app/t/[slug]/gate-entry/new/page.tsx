"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { FieldError, fieldClass } from "@/components/FieldError";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { gateEntryCreateSchema, type GateEntryCreateInput, type GateEntryItemInput, type VendorListItem } from "@indus/shared";
import { validate, apiErrorToFormErrors, emptyErrors, type FormErrorState } from "@/lib/form-errors";

interface Company { id: string; name: string; isPrimary: boolean; }
interface Unit { id: string; companyId: string; name: string; code: string | null; }
interface PoLite { id: string; poNumber: string | null; title: string; vendorId: string; }

export default function NewGateEntryPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const base = `/t/${params?.slug ?? ""}/gate-entry`;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [pos, setPos] = useState<PoLite[]>([]);

  const [form, setForm] = useState<GateEntryCreateInput>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);
  const fe = errors.fields;

  useEffect(() => {
    (async () => {
      try {
        const [comps, units, vens, posResp] = await Promise.all([
          api<Company[]>("/api/tenant/companies"),
          api<Unit[]>("/api/tenant/units"),
          api<{ items: VendorListItem[] }>("/api/vendors?pageSize=100"),
          api<{ items: PoLite[] }>("/api/po?pageSize=100"),
        ]);
        setCompanies(comps);
        setUnits(units);
        setVendors(vens.items);
        setPos(posResp.items);
        const primary = comps.find((c) => c.isPrimary) ?? comps[0];
        if (primary) {
          const firstUnit = units.find((u) => u.companyId === primary.id);
          setForm((f) => ({ ...f, companyId: primary.id, unitId: firstUnit?.id ?? f.unitId }));
        }
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load", fields: {} });
      }
    })();
  }, []);

  const filteredUnits = units.filter((u) => u.companyId === form.companyId);

  function set<K extends keyof GateEntryCreateInput>(k: K, v: GateEntryCreateInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function setItem(idx: number, patch: Partial<GateEntryItemInput>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  }
  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, { itemId: null, itemName: "", description: "", quantity: 1, uom: "nos", notes: "" }] }));
  }
  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  function handlePoChange(poId: string) {
    set("poId", poId || null);
    if (poId) {
      const po = pos.find((p) => p.id === poId);
      if (po) set("vendorId", po.vendorId);
    }
  }

  async function handleSave(e?: FormEvent) {
    e?.preventDefault();
    if (submitting) return;

    const cleaned: GateEntryCreateInput = {
      ...form,
      items: form.items.filter((it) => it.itemName.trim() !== "" && (it.quantity ?? 0) > 0),
    };

    const result = validate(gateEntryCreateSchema, cleaned);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(emptyErrors);
    setSubmitting(true);
    try {
      const ge = await api<{ id: string }>("/api/gate-entry", { method: "POST", body: JSON.stringify(result.data) });
      toast.success("Gate entry recorded", "Status: open — close it after goods are received.");
      router.push(`${base}/${ge.id}`);
    } catch (err) {
      setErrors(apiErrorToFormErrors(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-3 text-sm text-muted">
        <Link href={base} className="hover:text-text-default">Gate Entries</Link>
        <Icon name="ChevronRight" size={14} />
        <span className="text-text-default font-medium">New entry</span>
      </div>

      <PageHeader
        title="New Gate Entry"
        subtitle="Record vehicle + materials at gate. Link to a PO for inward goods."
        actions={
          <>
            <Link href={base} className="btn btn-ghost">Cancel</Link>
            <button type="button" className="btn btn-primary" onClick={() => handleSave()} disabled={submitting}>
              {submitting ? "Saving…" : "Save entry"}
              <Icon name="ArrowRight" />
            </button>
          </>
        }
      />

      {errors.summary && (
        <div className="mb-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm flex items-start gap-2">
          <Icon name="TriangleAlert" size={16} />
          <span className="flex-1">{errors.summary}</span>
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="card p-6 mb-5 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Entry details</p>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={(e) => set("type", e.target.value as "inward")}>
                <option value="inward">Inward (goods in)</option>
                <option value="outward">Outward (goods out)</option>
                <option value="service">Service / visitor</option>
              </select>
            </div>
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
              <label className="label">Linked PO {form.type === "inward" && <span className="text-muted">(recommended)</span>}</label>
              <select className="input" value={form.poId ?? ""} onChange={(e) => handlePoChange(e.target.value)}>
                <option value="">— None / direct —</option>
                {pos.map((p) => <option key={p.id} value={p.id}>{p.poNumber ?? p.title}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="label">Vendor</label>
              <select className="input" value={form.vendorId ?? ""} onChange={(e) => set("vendorId", e.target.value || null)}>
                <option value="">— None —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Vehicle number</label>
              <input className="input font-mono uppercase" placeholder="MH-12-AB-1234" value={form.vehicleNumber ?? ""} onChange={(e) => set("vehicleNumber", e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="label">Driver name</label>
              <input className="input" value={form.driverName ?? ""} onChange={(e) => set("driverName", e.target.value)} />
            </div>
            <div>
              <label className="label">Driver phone</label>
              <input className="input" value={form.driverPhone ?? ""} onChange={(e) => set("driverPhone", e.target.value)} />
            </div>
            <div>
              <label className="label">Invoice number</label>
              <input className="input font-mono" value={form.invoiceNumber ?? ""} onChange={(e) => set("invoiceNumber", e.target.value)} />
            </div>
            <div>
              <label className="label">Invoice date</label>
              <input type="date" className="input" value={form.invoiceDate ?? ""} onChange={(e) => set("invoiceDate", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Remarks</label>
            <textarea className="input" rows={2} value={form.remarks ?? ""} onChange={(e) => set("remarks", e.target.value)} placeholder="Anything noteworthy about this entry..." />
          </div>
        </div>

        <div className="card overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Materials at gate (optional)</p>
              <p className="text-sm text-muted mt-0.5">Brief inventory check — GRN will record exact accepted qty later</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}><Icon name="Plus" /> Add item</button>
          </div>
          {form.items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">No items added — that's OK for service/visitor entries.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold w-12">#</th>
                  <th className="text-left px-3 py-2 font-semibold">Item</th>
                  <th className="text-left px-3 py-2 font-semibold w-28">Qty</th>
                  <th className="text-left px-3 py-2 font-semibold w-24">UOM</th>
                  <th className="text-right px-3 py-2 font-semibold w-12"></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((it, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-3 py-2 text-muted text-xs">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <input className="input !py-1.5 text-sm" placeholder="Item name" value={it.itemName} onChange={(e) => setItem(idx, { itemName: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <input className="input !py-1.5 tabular-nums" type="number" step="0.001" min="0" value={it.quantity || ""} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                    </td>
                    <td className="px-3 py-2">
                      <input className="input !py-1.5 font-mono text-xs" value={it.uom} onChange={(e) => setItem(idx, { uom: e.target.value })} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="h-8 w-8 rounded-pill grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => removeItem(idx)}>
                        <Icon name="Trash2" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </form>
    </>
  );
}

function emptyForm(): GateEntryCreateInput {
  return {
    companyId: "",
    unitId: "",
    type: "inward",
    vendorId: null,
    poId: null,
    vehicleNumber: "",
    driverName: "",
    driverPhone: "",
    invoiceNumber: "",
    invoiceDate: null,
    remarks: "",
    items: [],
  };
}
