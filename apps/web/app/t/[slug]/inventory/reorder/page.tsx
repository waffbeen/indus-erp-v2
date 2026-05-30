"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { StatusTabs, FilterBar } from "@/components/ListPrimitives";
import { Modal } from "@/components/Modal";
import { SummaryTiles } from "@/components/inventory/SummaryTiles";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { paiseToINR } from "@/lib/format";

interface Suggestion {
  itemId: string;
  itemName: string;
  itemCode: string | null;
  itemGroupName: string | null;
  unitId: string;
  unitName: string;
  uom: string;
  onHandQty: number;
  reorderLevel: number;
  minQty: number;
  maxQty: number;
  safetyStock: number;
  leadTimeDays: number;
  shortfallQty: number;
  suggestedQty: number;
  lastPurchasePricePaise: string | null;
}
interface ReorderResponse { suggestions: Suggestion[]; monitored: number; }

interface Policy {
  id: string;
  itemId: string;
  itemName: string;
  itemCode: string | null;
  unitId: string;
  unitName: string;
  minQty: number;
  maxQty: number;
  reorderLevel: number;
  safetyStock: number;
  leadTimeDays: number;
  isActive: boolean;
}

interface Unit { id: string; name: string; code: string | null; companyId: string; }
interface ItemLite { id: string; name: string; code: string | null; uom: string; }

type Tab = "board" | "policies";

export default function ReorderPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const me = useAuth((s) => s.me);
  const isAdmin = !!me?.isTenantAdmin;

  const [tab, setTab] = useState<Tab>("board");
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState("");

  useEffect(() => {
    api<Unit[]>("/api/tenant/units").then(setUnits).catch(() => setUnits([]));
  }, []);

  return (
    <>
      <div className="flex items-center gap-2 mb-2 text-[11px] text-muted">
        <Link href={`/t/${slug}/inventory`} className="hover:text-text-default">Inventory</Link>
        <Icon name="ChevronRight" size={12} />
        <span className="text-text-default font-medium">Reorder</span>
      </div>

      <PageHeader
        title="Reorder Dashboard"
        subtitle="Items at or below their reorder level, with suggested order quantities. Set min/max/reorder levels under Stocking policies."
      />

      <div className="mb-3">
        <StatusTabs<Tab>
          tabs={[{ key: "board", label: "Reorder board" }, { key: "policies", label: "Stocking policies" }]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "board" ? (
        <ReorderBoard slug={slug} units={units} unitId={unitId} setUnitId={setUnitId} />
      ) : (
        <PoliciesPane units={units} isAdmin={isAdmin} />
      )}
    </>
  );
}

/* ---------------- Reorder board ---------------- */

function ReorderBoard({
  slug, units, unitId, setUnitId,
}: { slug: string; units: Unit[]; unitId: string; setUnitId: (v: string) => void }) {
  const [data, setData] = useState<ReorderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const qs = unitId ? `?unitId=${unitId}` : "";
      const res = await api<ReorderResponse>(`/api/reorder${qs}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load reorder board");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const term = search.trim().toLowerCase();
  const rows = (data?.suggestions ?? []).filter(
    (r) => !term || `${r.itemName} ${r.itemCode ?? ""}`.toLowerCase().includes(term),
  );

  const estValuePaise = rows.reduce((s, r) => {
    const rate = Number(r.lastPurchasePricePaise ?? 0);
    return s + Math.round(r.suggestedQty * rate);
  }, 0);

  return (
    <>
      <SummaryTiles
        tiles={[
          { label: "Items to reorder", value: String(data?.suggestions.length ?? 0), icon: "TriangleAlert", tone: (data?.suggestions.length ?? 0) > 0 ? "text-danger-fg" : undefined },
          { label: "Monitored", value: String(data?.monitored ?? 0), icon: "Eye", hint: "active policies" },
          { label: "Est. order value", value: paiseToINR(estValuePaise), icon: "IndianRupee", hint: "@ last purchase price" },
          { label: "Filtered", value: String(rows.length), icon: "Filter", hint: "rows shown" },
        ]}
      />

      <FilterBar search={search} onSearch={setSearch} placeholder="Search item name or code…">
        <select className="input sm:w-48" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">All warehouses</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
        </select>
      </FilterBar>

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} /><span className="flex-1">{error}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="p-6 text-center text-xs text-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <Icon name="CircleCheckBig" size={20} className="mx-auto mb-1.5 text-success-fg" />
            <p className="text-xs text-muted">
              {term ? "No items match." : (data?.monitored ?? 0) === 0
                ? "No stocking policies yet. Add min/max/reorder levels under the Stocking policies tab to drive this board."
                : "Nothing to reorder — every monitored item is above its reorder level."}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Item</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Warehouse</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">On hand</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Reorder @</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Max</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Suggested</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Lead time</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                // Forward-compatible prefill hint for the PR form.
                const prHref = `/t/${slug}/pr/new?itemId=${r.itemId}&qty=${r.suggestedQty}&unitId=${r.unitId}`;
                return (
                  <tr key={`${r.itemId}-${r.unitId}`} className="border-t border-border hover:bg-surface/60">
                    <td className="px-3 py-1.5">
                      <div className="font-medium">{r.itemName}</div>
                      {r.itemCode && <div className="font-mono text-[10px] text-muted">{r.itemCode}</div>}
                    </td>
                    <td className="px-3 py-1.5 text-[11px]">{r.unitName}</td>
                    <td className={`px-3 py-1.5 tabular-nums text-right font-semibold ${r.onHandQty <= 0 ? "text-danger-fg" : ""}`}>
                      {r.onHandQty.toLocaleString("en-IN", { maximumFractionDigits: 3 })} <span className="text-[10px] text-muted">{r.uom}</span>
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-muted">{r.reorderLevel.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-muted">{r.maxQty > 0 ? r.maxQty.toLocaleString("en-IN", { maximumFractionDigits: 3 }) : "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right font-bold text-primary">{r.suggestedQty.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-[11px] text-muted">{r.leadTimeDays > 0 ? `${r.leadTimeDays}d` : "—"}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Link href={prHref} className="btn btn-primary btn-sm whitespace-nowrap">
                        <Icon name="FileText" size={13} /> Create PR
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ---------------- Stocking policies ---------------- */

const emptyForm = { id: "", itemId: "", unitId: "", minQty: "", maxQty: "", reorderLevel: "", safetyStock: "", leadTimeDays: "", isActive: true };

function PoliciesPane({ units, isAdmin }: { units: Unit[]; isAdmin: boolean }) {
  const [rows, setRows] = useState<Policy[] | null>(null);
  const [items, setItems] = useState<ItemLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<Policy[]>("/api/reorder/policies");
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load policies");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    api<{ items: ItemLite[] }>("/api/items?pageSize=100").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);

  function openNew() {
    setForm({ ...emptyForm, unitId: units[0]?.id ?? "" });
    setModalOpen(true);
  }
  function openEdit(p: Policy) {
    setForm({
      id: p.id, itemId: p.itemId, unitId: p.unitId,
      minQty: String(p.minQty), maxQty: String(p.maxQty), reorderLevel: String(p.reorderLevel),
      safetyStock: String(p.safetyStock), leadTimeDays: String(p.leadTimeDays), isActive: p.isActive,
    });
    setModalOpen(true);
  }

  async function save() {
    if (submitting) return;
    if (!form.itemId) { toast.error("Item required", "Pick an item."); return; }
    if (!form.unitId) { toast.error("Warehouse required", "Pick a warehouse."); return; }
    setSubmitting(true);
    try {
      const body = {
        id: form.id || undefined,
        itemId: form.itemId,
        unitId: form.unitId,
        minQty: Number(form.minQty) || 0,
        maxQty: Number(form.maxQty) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        safetyStock: Number(form.safetyStock) || 0,
        leadTimeDays: Number(form.leadTimeDays) || 0,
        isActive: form.isActive,
      };
      await api("/api/reorder/policies", { method: "POST", body: JSON.stringify(body) });
      toast.success("Saved", "Stocking policy updated.");
      setModalOpen(false);
      void load();
    } catch (err) {
      toast.error("Could not save", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this stocking policy? The item will stop appearing on the reorder board.")) return;
    try {
      await api(`/api/reorder/policies/${id}`, { method: "DELETE" });
      toast.success("Removed");
      void load();
    } catch (err) {
      toast.error("Could not remove", err instanceof ApiError ? err.message : "Try again");
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Stocking policies</p>
          <p className="text-xs text-muted mt-0.5">Per item + warehouse min / max / reorder levels that drive the reorder board.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew}><Icon name="Plus" size={14} /> New policy</button>
      </div>

      {error && <div className="px-4 py-3 text-xs bg-danger-bg text-danger-fg">{error}</div>}
      {loading && !rows ? (
        <div className="p-8 text-center text-muted text-sm">Loading…</div>
      ) : !rows?.length ? (
        <div className="p-8 text-center text-muted text-sm">No policies yet. Add one to start monitoring reorder levels.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Item</th>
                <th className="text-left px-4 py-2 font-semibold">Warehouse</th>
                <th className="text-right px-4 py-2 font-semibold">Min</th>
                <th className="text-right px-4 py-2 font-semibold">Reorder</th>
                <th className="text-right px-4 py-2 font-semibold">Max</th>
                <th className="text-right px-4 py-2 font-semibold">Safety</th>
                <th className="text-right px-4 py-2 font-semibold">Lead</th>
                <th className="text-center px-4 py-2 font-semibold">Active</th>
                <th className="px-4 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <div className="font-medium">{p.itemName}</div>
                    {p.itemCode && <div className="font-mono text-[10px] text-muted">{p.itemCode}</div>}
                  </td>
                  <td className="px-4 py-2 text-[12px]">{p.unitName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.minQty.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{p.reorderLevel.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.maxQty.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{p.safetyStock.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{p.leadTimeDays > 0 ? `${p.leadTimeDays}d` : "—"}</td>
                  <td className="px-4 py-2 text-center">
                    {p.isActive
                      ? <span className="badge badge-tint-mint text-[10px]">Active</span>
                      : <span className="badge badge-info text-[10px]">Off</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="h-7 w-7 rounded grid place-items-center text-muted hover:bg-surface hover:text-text-default" onClick={() => openEdit(p)} title="Edit">
                        <Icon name="Pencil" size={13} />
                      </button>
                      {isAdmin && (
                        <button className="h-7 w-7 rounded grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => remove(p.id)} title="Remove">
                          <Icon name="Trash2" size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => !submitting && setModalOpen(false)}
        title={form.id ? "Edit stocking policy" : "New stocking policy"}
        size="md"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={submitting || !form.itemId || !form.unitId}>
              {submitting ? "Saving…" : "Save policy"}
            </button>
          </>
        }
      >
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Item <span className="text-danger">*</span></label>
              <select className="input" value={form.itemId} onChange={(e) => setForm((s) => ({ ...s, itemId: e.target.value }))} disabled={!!form.id}>
                <option value="">Select item…</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.code ? ` (${i.code})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Warehouse <span className="text-danger">*</span></label>
              <select className="input" value={form.unitId} onChange={(e) => setForm((s) => ({ ...s, unitId: e.target.value }))} disabled={!!form.id}>
                <option value="">Select…</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Min level" value={form.minQty} onChange={(v) => setForm((s) => ({ ...s, minQty: v }))} />
            <NumberField label="Reorder level" value={form.reorderLevel} onChange={(v) => setForm((s) => ({ ...s, reorderLevel: v }))} />
            <NumberField label="Max level" value={form.maxQty} onChange={(v) => setForm((s) => ({ ...s, maxQty: v }))} hint="Suggested qty tops up to here" />
            <NumberField label="Safety stock" value={form.safetyStock} onChange={(v) => setForm((s) => ({ ...s, safetyStock: v }))} />
            <NumberField label="Lead time (days)" value={form.leadTimeDays} onChange={(v) => setForm((s) => ({ ...s, leadTimeDays: v }))} step="1" />
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-[12px] pb-2">
                <input type="checkbox" className="h-4 w-4" checked={form.isActive} onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))} />
                Active (monitor on reorder board)
              </label>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function NumberField({ label, value, onChange, hint, step = "0.001" }: { label: string; value: string; onChange: (v: string) => void; hint?: string; step?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" min="0" step={step} className="input tabular-nums" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-[10px] text-muted mt-0.5">{hint}</p>}
    </div>
  );
}
