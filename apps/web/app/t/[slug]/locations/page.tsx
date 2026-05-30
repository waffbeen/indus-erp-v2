"use client";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconProps } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { FilterBar } from "@/components/ListPrimitives";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";

type LocationType = "warehouse" | "zone" | "rack" | "bin";

interface Location {
  id: string;
  unitId: string;
  unitName: string | null;
  code: string | null;
  name: string;
  type: LocationType;
  parentId: string | null;
  parentName: string | null;
  isActive: boolean;
}

interface Unit { id: string; name: string; code: string | null; companyId: string; }

const TYPE_META: Record<LocationType, { label: string; icon: IconProps["name"]; tint: string }> = {
  warehouse: { label: "Warehouse", icon: "Warehouse", tint: "badge-tint-mint" },
  zone:      { label: "Zone",      icon: "LayoutGrid", tint: "badge-info" },
  rack:      { label: "Rack",      icon: "Rows3",     tint: "badge-tint-lilac" },
  bin:       { label: "Bin",       icon: "Box",        tint: "badge-tint-peach" },
};
const TYPE_ORDER: LocationType[] = ["warehouse", "zone", "rack", "bin"];

const emptyForm = { id: "", unitId: "", code: "", name: "", type: "warehouse" as LocationType, parentId: "", isActive: true };

export default function LocationsPage() {
  const me = useAuth((s) => s.me);
  const isAdmin = !!me?.isTenantAdmin;

  const [rows, setRows] = useState<Location[] | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ includeInactive: "true" });
      if (unitFilter) qs.set("unitId", unitFilter);
      const data = await api<Location[]>(`/api/locations?${qs.toString()}`);
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load locations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api<Unit[]>("/api/tenant/units").then(setUnits).catch(() => setUnits([]));
  }, []);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitFilter]);

  function openNew() {
    setForm({ ...emptyForm, unitId: unitFilter || units[0]?.id || "" });
    setModalOpen(true);
  }
  function openEdit(l: Location) {
    setForm({ id: l.id, unitId: l.unitId, code: l.code ?? "", name: l.name, type: l.type, parentId: l.parentId ?? "", isActive: l.isActive });
    setModalOpen(true);
  }

  // Parent options: same unit, not self, sensible parent types (anything above bin).
  const parentOptions = useMemo(() => {
    if (!rows) return [];
    return rows.filter((l) => l.unitId === form.unitId && l.id !== form.id);
  }, [rows, form.unitId, form.id]);

  async function save() {
    if (submitting) return;
    if (!form.name.trim()) { toast.error("Name required", "Enter a location name."); return; }
    if (!form.unitId) { toast.error("Unit required", "Pick a unit / warehouse."); return; }
    setSubmitting(true);
    try {
      const body = {
        id: form.id || undefined,
        unitId: form.unitId,
        code: form.code.trim() || undefined,
        name: form.name.trim(),
        type: form.type,
        parentId: form.parentId || undefined,
        isActive: form.isActive,
      };
      await api("/api/locations", { method: "POST", body: JSON.stringify(body) });
      toast.success("Saved", "Storage location saved.");
      setModalOpen(false);
      void load();
    } catch (err) {
      toast.error("Could not save", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this location? Any child locations will be detached.")) return;
    try {
      await api(`/api/locations/${id}`, { method: "DELETE" });
      toast.success("Removed");
      void load();
    } catch (err) {
      toast.error("Could not remove", err instanceof ApiError ? err.message : "Try again");
    }
  }

  const term = search.trim().toLowerCase();
  const filtered = (rows ?? []).filter(
    (l) => !term || `${l.name} ${l.code ?? ""} ${l.unitName ?? ""}`.toLowerCase().includes(term),
  );

  return (
    <>
      <PageHeader
        title="Storage Locations"
        subtitle="Warehouse → zone → rack → bin hierarchy for each unit. Use these to organise put-away and cycle counts."
        actions={<button className="btn btn-primary btn-sm" onClick={openNew}><Icon name="Plus" size={14} /> New location</button>}
      />

      <FilterBar search={search} onSearch={setSearch} placeholder="Search location name, code or unit…">
        <select className="input sm:w-48" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
          <option value="">All units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
        </select>
      </FilterBar>

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="AlertTriangle" size={14} /><span className="flex-1">{error}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && !rows ? (
          <div className="p-6 text-center text-xs text-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Icon name="MapPin" size={20} className="mx-auto mb-1.5 text-muted" />
            <p className="text-xs text-muted">{term || unitFilter ? "No locations match." : "No storage locations yet. Add your first warehouse / zone / rack / bin."}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Location</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Code</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Type</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Unit</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Parent</th>
                <th className="text-center px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="px-3 py-1.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const meta = TYPE_META[l.type];
                return (
                  <tr key={l.id} className="border-t border-border hover:bg-surface/60">
                    <td className="px-3 py-1.5 font-medium">{l.name}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{l.code ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <span className={`badge ${meta.tint} text-[10px]`}><Icon name={meta.icon} size={11} /> {meta.label}</span>
                    </td>
                    <td className="px-3 py-1.5 text-[11px]">{l.unitName ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[11px] text-muted">{l.parentName ?? "—"}</td>
                    <td className="px-3 py-1.5 text-center">
                      {l.isActive ? <span className="badge badge-tint-mint text-[10px]">Active</span> : <span className="badge badge-info text-[10px]">Inactive</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="h-7 w-7 rounded grid place-items-center text-muted hover:bg-surface hover:text-text-default" onClick={() => openEdit(l)} title="Edit">
                          <Icon name="Pencil" size={13} />
                        </button>
                        {isAdmin && (
                          <button className="h-7 w-7 rounded grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => remove(l.id)} title="Remove">
                            <Icon name="Trash2" size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => !submitting && setModalOpen(false)}
        title={form.id ? "Edit location" : "New storage location"}
        size="md"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={submitting || !form.name || !form.unitId}>
              {submitting ? "Saving…" : "Save location"}
            </button>
          </>
        }
      >
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Unit / Warehouse <span className="text-danger">*</span></label>
              <select className="input" value={form.unitId} onChange={(e) => setForm((s) => ({ ...s, unitId: e.target.value, parentId: "" }))}>
                <option value="">Select…</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value as LocationType }))}>
                {TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Name <span className="text-danger">*</span></label>
              <input className="input" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Zone A / Rack 12" autoFocus />
            </div>
            <div>
              <label className="label">Code</label>
              <input className="input font-mono" value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} placeholder="A-12-03" />
            </div>
          </div>
          <div>
            <label className="label">Parent location</label>
            <select className="input" value={form.parentId} onChange={(e) => setForm((s) => ({ ...s, parentId: e.target.value }))}>
              <option value="">— None (top level) —</option>
              {parentOptions.map((p) => <option key={p.id} value={p.id}>{TYPE_META[p.type].label}: {p.name}</option>)}
            </select>
            <p className="text-[10px] text-muted mt-0.5">Optional — nest this location under a bigger one in the same unit.</p>
          </div>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" className="h-4 w-4" checked={form.isActive} onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))} />
            Active
          </label>
        </div>
      </Modal>
    </>
  );
}
