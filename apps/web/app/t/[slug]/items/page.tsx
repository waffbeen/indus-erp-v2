"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FieldError, fieldClass } from "@/components/FieldError";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { itemCreateSchema, type ItemListItem, type ItemCreateInput } from "@indus/shared";
import { validate, apiErrorToFormErrors, emptyErrors, type FormErrorState } from "@/lib/form-errors";

interface ListResponse {
  items: ItemListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export default function ItemsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItemListItem | null>(null);

  async function load(searchTerm = search) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (searchTerm) qs.set("search", searchTerm);
      const res = await api<ListResponse>(`/api/items?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/items/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Item removed", `${deleteTarget.name} has been deleted.`);
      setDeleteTarget(null);
      load(search);
    } catch (err) {
      toast.error("Could not delete", err instanceof ApiError ? err.message : "Try again");
    }
  }

  return (
    <>
      <PageHeader
        title="Items"
        subtitle="Master catalog of products and services you buy"
        actions={
          <>
            <div className="relative">
              <input
                className="input !py-2 !pl-9 !w-64 text-sm"
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load(search)}
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" style={{ pointerEvents: "none" }}>
                <Icon name="Search" />
              </span>
            </div>
            <button className="btn btn-primary" onClick={() => { setEditId(null); setShowForm(true); }}>
              <Icon name="Plus" /> New Item
            </button>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-muted">Loading items…</div>
        ) : !data?.items.length ? (
          <EmptyState onAdd={() => { setEditId(null); setShowForm(true); }} />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Code</th>
                <th className="text-left px-5 py-3 font-semibold">Name</th>
                <th className="text-left px-5 py-3 font-semibold">Category</th>
                <th className="text-left px-5 py-3 font-semibold">UOM</th>
                <th className="text-left px-5 py-3 font-semibold">HSN</th>
                <th className="text-left px-5 py-3 font-semibold">Tax %</th>
                <th className="text-left px-5 py-3 font-semibold">Stocked</th>
                <th className="text-right px-5 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr
                  key={it.id}
                  className="border-t border-border hover:bg-surface/50 cursor-pointer select-none group"
                  onDoubleClick={() => { setEditId(it.id); setShowForm(true); }}
                  title="Double-click to edit"
                >
                  <td className="px-5 py-3 font-mono text-xs text-muted">{it.code ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg grid place-items-center bg-tint-mint text-tint-mint-fg shrink-0">
                        <Icon name="Package" />
                      </div>
                      <div>
                        <p className="font-semibold">{it.name}</p>
                        {it.description && <p className="text-[11px] text-muted truncate max-w-md">{it.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">{it.category ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs">{it.uom}</td>
                  <td className="px-5 py-3 font-mono text-xs">{it.hsnCode ?? "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{it.defaultTaxRate}%</td>
                  <td className="px-5 py-3">
                    {it.isStocked
                      ? <span className="badge badge-tint-mint">Stocked</span>
                      : <span className="text-xs text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition">
                      <button
                        className="h-8 w-8 rounded-pill grid place-items-center hover:bg-bg"
                        onClick={(e) => { e.stopPropagation(); setEditId(it.id); setShowForm(true); }}
                        title="Edit"
                      >
                        <Icon name="Pencil" size={16} />
                      </button>
                      <button
                        className="h-8 w-8 rounded-pill grid place-items-center hover:bg-danger-bg hover:text-danger-fg"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(it); }}
                        title="Delete"
                      >
                        <Icon name="Trash2" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.items.length > 0 && (
          <div className="px-5 py-3 border-t border-border text-xs text-muted flex justify-between items-center">
            <span>{data.total} item{data.total === 1 ? "" : "s"} total · double-click a row to edit</span>
            <span>Page {data.page}</span>
          </div>
        )}
      </div>

      <ItemFormModal
        open={showForm}
        editId={editId}
        onClose={() => setShowForm(false)}
        onSaved={(name, wasEdit) => {
          setShowForm(false);
          toast.success(
            wasEdit ? "Item updated" : "Item created",
            wasEdit ? `${name} ke changes save ho gaye.` : `${name} ab aapki item list mein hai.`,
          );
          load(search);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteTarget?.name ?? "item"}?`}
        description={
          <>
            Yeh item hide ho jayega master catalog se. <strong className="text-text-default">Pehle ki PRs/POs untouched rahenge</strong> — historic transactions safe hain.
          </>
        }
        confirmLabel="Yes, delete"
        cancelLabel="Cancel"
        tone="danger"
      />
    </>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="p-12 text-center">
      <div className="h-14 w-14 rounded-2xl mx-auto grid place-items-center bg-tint-mint text-tint-mint-fg mb-4">
        <Icon name="Package" size={28} />
      </div>
      <h3 className="display text-xl mb-1">No items yet</h3>
      <p className="text-sm text-muted mb-5">Add your first item to start raising PRs.</p>
      <button className="btn btn-primary" onClick={onAdd}>
        <Icon name="Plus" /> Add Item
      </button>
    </div>
  );
}

function ItemFormModal({
  open,
  editId,
  onClose,
  onSaved,
}: {
  open: boolean;
  editId: string | null;
  onClose: () => void;
  onSaved: (name: string, wasEdit: boolean) => void;
}) {
  const [form, setForm] = useState<ItemCreateInput>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);
  const fe = errors.fields;

  useEffect(() => {
    if (!open) return;
    setErrors(emptyErrors);
    if (editId) {
      (async () => {
        try {
          const it = await api<{
            name: string; description: string | null; category: string | null;
            itemGroupName: string | null; itemSubGroupName: string | null;
            uom: string; stockUnit: string | null; purchaseUnit: string | null;
            conversionFactor: number;
            hsnCode: string | null; defaultTaxRate: number;
            isStocked: boolean; isAsset: boolean; isService: boolean;
          }>(`/api/items/${editId}`);
          setForm({
            name: it.name,
            description: it.description ?? "",
            category: it.category ?? "",
            itemGroupName: it.itemGroupName ?? "",
            itemSubGroupName: it.itemSubGroupName ?? "",
            uom: it.uom,
            stockUnit: it.stockUnit ?? "",
            purchaseUnit: it.purchaseUnit ?? "",
            conversionFactor: it.conversionFactor ?? 1,
            hsnCode: it.hsnCode ?? "",
            defaultTaxRate: it.defaultTaxRate,
            isStocked: it.isStocked,
            isAsset: it.isAsset ?? false,
            isService: it.isService ?? false,
          });
        } catch (err) {
          setErrors({ summary: err instanceof ApiError ? err.message : "Could not load item", fields: {} });
        }
      })();
    } else {
      setForm(emptyForm());
    }
  }, [editId, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const cleaned: ItemCreateInput = { ...form, name: form.name.trim() };
    const result = validate(itemCreateSchema, cleaned);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(emptyErrors);
    setSubmitting(true);
    try {
      if (editId) {
        await api(`/api/items/${editId}`, { method: "PATCH", body: JSON.stringify(result.data) });
      } else {
        await api("/api/items", { method: "POST", body: JSON.stringify(result.data) });
      }
      onSaved(cleaned.name, !!editId);
    } catch (err) {
      setErrors(apiErrorToFormErrors(err));
    } finally {
      setSubmitting(false);
    }
  }

  const set = <K extends keyof ItemCreateInput>(k: K, v: ItemCreateInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (fe[k as string]) setErrors((e) => ({ ...e, fields: { ...e.fields, [k as string]: "" } }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editId ? "Edit item" : "New item"}
      description="Master record — used in PRs, POs, and stock tracking."
      size="xl"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button form="item-form" type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : editId ? "Save changes" : "Create item"}
          </button>
        </>
      }
    >
      <form id="item-form" onSubmit={handleSubmit} className="space-y-5">
        {errors.summary && (
          <div className="rounded-lg p-3 bg-danger-bg text-danger-fg text-sm flex items-start gap-2">
            <Icon name="AlertTriangle" size={16} />
            <span className="flex-1">{errors.summary}</span>
          </div>
        )}

        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Basics</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Item name <span className="text-danger">*</span></label>
            <input
              className={fieldClass(fe.name)}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Bearing 6204-ZZ"
            />
            <FieldError error={fe.name} />
          </div>
          <div>
            <label className="label">Category</label>
            <input
              className="input"
              value={form.category ?? ""}
              onChange={(e) => set("category", e.target.value)}
              placeholder="Bearings"
            />
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            className="input"
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Detailed description, brand, specifications..."
          />
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted pt-2 border-t border-border">Categorization</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Item Group</label>
            <input
              className="input"
              value={form.itemGroupName ?? ""}
              onChange={(e) => set("itemGroupName", e.target.value)}
              placeholder="Raw Material / Spares / Consumables"
            />
          </div>
          <div>
            <label className="label">Sub Group</label>
            <input
              className="input"
              value={form.itemSubGroupName ?? ""}
              onChange={(e) => set("itemSubGroupName", e.target.value)}
              placeholder="Bearings / Belts / Lubricants"
            />
          </div>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted pt-2 border-t border-border">Units & Tax</p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">Primary UOM <span className="text-danger">*</span></label>
            <input
              className={fieldClass(fe.uom)}
              value={form.uom}
              onChange={(e) => set("uom", e.target.value)}
              placeholder="nos, kg, ltr"
            />
            <FieldError error={fe.uom} />
          </div>
          <div>
            <label className="label">Stock Unit</label>
            <input
              className="input font-mono text-xs"
              value={form.stockUnit ?? ""}
              onChange={(e) => set("stockUnit", e.target.value)}
              placeholder="(if different)"
            />
          </div>
          <div>
            <label className="label">Purchase Unit</label>
            <input
              className="input font-mono text-xs"
              value={form.purchaseUnit ?? ""}
              onChange={(e) => set("purchaseUnit", e.target.value)}
              placeholder="box, carton"
            />
          </div>
          <div>
            <label className="label">Conv. factor</label>
            <input
              className="input tabular-nums"
              type="number"
              min="1"
              value={form.conversionFactor ?? 1}
              onChange={(e) => set("conversionFactor", Number(e.target.value))}
              title="1 Purchase Unit = X Stock Units"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">HSN code</label>
            <input
              className="input font-mono"
              value={form.hsnCode ?? ""}
              onChange={(e) => set("hsnCode", e.target.value)}
              placeholder="84821000"
            />
          </div>
          <div>
            <label className="label">Default GST %</label>
            <input
              className="input"
              type="number"
              min="0"
              max="100"
              value={form.defaultTaxRate}
              onChange={(e) => set("defaultTaxRate", Number(e.target.value))}
            />
          </div>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted pt-2 border-t border-border">Type</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="flex items-center gap-3 text-sm p-3 rounded-xl border border-border bg-surface cursor-pointer hover:border-border-strong">
            <input
              type="checkbox"
              checked={form.isStocked}
              onChange={(e) => set("isStocked", e.target.checked)}
              className="rounded h-4 w-4"
            />
            <div className="flex-1">
              <p className="font-medium text-xs">Stocked item</p>
              <p className="text-[11px] text-muted">Tracked in inventory</p>
            </div>
          </label>
          <label className="flex items-center gap-3 text-sm p-3 rounded-xl border border-border bg-surface cursor-pointer hover:border-border-strong">
            <input
              type="checkbox"
              checked={form.isAsset ?? false}
              onChange={(e) => set("isAsset", e.target.checked)}
              className="rounded h-4 w-4"
            />
            <div className="flex-1">
              <p className="font-medium text-xs">Capital asset (CAPEX)</p>
              <p className="text-[11px] text-muted">Goes to fixed assets, not OPEX</p>
            </div>
          </label>
          <label className="flex items-center gap-3 text-sm p-3 rounded-xl border border-border bg-surface cursor-pointer hover:border-border-strong">
            <input
              type="checkbox"
              checked={form.isService ?? false}
              onChange={(e) => set("isService", e.target.checked)}
              className="rounded h-4 w-4"
            />
            <div className="flex-1">
              <p className="font-medium text-xs">Service (not goods)</p>
              <p className="text-[11px] text-muted">SAC code, no physical stock</p>
            </div>
          </label>
        </div>
      </form>
    </Modal>
  );
}

function emptyForm(): ItemCreateInput {
  return {
    name: "",
    description: "",
    category: "",
    itemGroupName: "",
    itemSubGroupName: "",
    uom: "nos",
    stockUnit: "",
    purchaseUnit: "",
    conversionFactor: 1,
    hsnCode: "",
    defaultTaxRate: 18,
    isStocked: false,
    isAsset: false,
    isService: false,
  };
}
