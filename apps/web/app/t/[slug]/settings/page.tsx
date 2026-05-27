"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";

interface TenantSettings {
  grn?: {
    batchMode?: boolean;
  };
  approval?: {
    prLevels?: number;
    poLevels?: number;
  };
}

interface Department { id: string; name: string; code: string | null; unitId: string | null; }
interface Unit { id: string; companyId: string; name: string; code: string | null; }

export default function SettingsPage() {
  const { me } = useAuth();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [saving, setSaving] = useState(false);

  // Departments admin
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptCode, setNewDeptCode] = useState("");
  const [newDeptUnitId, setNewDeptUnitId] = useState("");
  const [addingDept, setAddingDept] = useState(false);

  useEffect(() => {
    api<TenantSettings>("/api/tenant/settings")
      .then(setSettings)
      .catch(() => setSettings({}));
    refreshDepartments();
    api<Unit[]>("/api/tenant/units").then(setUnits).catch(() => setUnits([]));
  }, []);

  function refreshDepartments() {
    api<Department[]>("/api/tenant/departments").then(setDepartments).catch(() => setDepartments([]));
  }

  async function handleAddDept(e: FormEvent) {
    e.preventDefault();
    if (!newDeptName.trim() || addingDept) return;
    setAddingDept(true);
    try {
      await api("/api/tenant/departments", {
        method: "POST",
        body: JSON.stringify({
          name: newDeptName.trim(),
          code: newDeptCode.trim() || undefined,
          unitId: newDeptUnitId || undefined,
        }),
      });
      toast.success("Department added");
      setNewDeptName("");
      setNewDeptCode("");
      refreshDepartments();
    } catch (err) {
      toast.error("Could not add", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setAddingDept(false);
    }
  }

  async function handleDeleteDept(id: string) {
    try {
      await api(`/api/tenant/departments/${id}`, { method: "DELETE" });
      toast.success("Department removed");
      refreshDepartments();
    } catch (err) {
      toast.error("Could not remove", err instanceof ApiError ? err.message : "Try again");
    }
  }

  async function patchSettings(patch: Partial<TenantSettings>) {
    if (!me?.isTenantAdmin) {
      toast.error("Permission needed", "Only tenant admins can change settings.");
      return;
    }
    setSaving(true);
    try {
      const next = await api<TenantSettings>("/api/tenant/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setSettings(next);
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Could not save", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setSaving(false);
    }
  }

  async function setBatchMode(on: boolean) {
    await patchSettings({ grn: { batchMode: on } });
  }

  async function setPrLevels(n: number) {
    await patchSettings({ approval: { prLevels: n } });
  }

  const batchOn = settings?.grn?.batchMode ?? false;
  const prLevels = settings?.approval?.prLevels ?? 1;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="display text-3xl">Settings</h1>
        <p className="text-sm text-muted mt-1">Workspace, profile, and appearance.</p>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-3">Profile</h2>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <dt className="text-muted">Name</dt>
          <dd className="col-span-2 font-medium">{me?.fullName}</dd>
          <dt className="text-muted">Email</dt>
          <dd className="col-span-2 font-medium">{me?.email}</dd>
          <dt className="text-muted">Workspace</dt>
          <dd className="col-span-2 font-medium">{me?.tenantName}</dd>
          <dt className="text-muted">Tenant admin</dt>
          <dd className="col-span-2 font-medium">{me?.isTenantAdmin ? "Yes" : "No"}</dd>
        </dl>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-1">Departments</h2>
        <p className="text-sm text-muted mb-4">
          Departments that can raise requisitions. Used in the "Requesting Department" field on every PR.
        </p>

        {me?.isTenantAdmin && (
          <form onSubmit={handleAddDept} className="flex flex-wrap items-end gap-2 mb-4 pb-4 border-b border-border">
            <div className="flex-1 min-w-[180px]">
              <label className="label">Name</label>
              <input className="input" placeholder="e.g. Production" value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} required />
            </div>
            <div className="w-28">
              <label className="label">Code</label>
              <input className="input font-mono" placeholder="PROD" value={newDeptCode} onChange={(e) => setNewDeptCode(e.target.value)} />
            </div>
            <div className="w-44">
              <label className="label">Unit (optional)</label>
              <select className="input" value={newDeptUnitId} onChange={(e) => setNewDeptUnitId(e.target.value)}>
                <option value="">— Any unit —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!newDeptName.trim() || addingDept}>
              <Icon name="Plus" size={13} /> {addingDept ? "Adding…" : "Add"}
            </button>
          </form>
        )}

        {departments.length === 0 ? (
          <p className="text-[12px] text-muted">No departments yet.</p>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Name</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Code</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Unit</th>
                <th className="text-right px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-medium">{d.name}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{d.code ?? "—"}</td>
                  <td className="px-3 py-1.5 text-[11.5px] text-muted">
                    {d.unitId ? units.find((u) => u.id === d.unitId)?.name ?? "—" : "Any"}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {me?.isTenantAdmin && (
                      <button className="text-[11px] text-muted hover:text-danger-fg" onClick={() => handleDeleteDept(d.id)} title="Remove">
                        <Icon name="Trash2" size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-1">Reference data &amp; masters</h2>
        <p className="text-sm text-muted mb-3">
          HSN codes, UoMs, payment terms, item taxonomy etc. ab dedicated Masters module me hain.
        </p>
        <a
          href={`/t/${me?.tenantSlug ?? ""}/masters`}
          className="btn btn-ghost btn-sm"
        >
          <Icon name="Database" size={14} /> Open Masters
        </a>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-1">Goods Receipt (GRN)</h2>
        <p className="text-sm text-muted mb-4">
          Enterprise teams jo pharma / FMCG / spares mein batch tracking karte hain — yeh on karo.
          Chhote shops jo single-receipt mein kaam karte hain — band rakho.
        </p>

        <label className={`flex items-start gap-3 p-4 rounded-xl border ${batchOn ? "border-primary bg-tint-mint/30" : "border-border bg-surface"} cursor-pointer hover:border-border-strong transition`}>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={batchOn}
            disabled={saving || !me?.isTenantAdmin}
            onChange={(e) => setBatchMode(e.target.checked)}
          />
          <div className="flex-1">
            <p className="font-semibold flex items-center gap-2">
              Batch-wise GRN
              {batchOn && (
                <span className="badge badge-success text-[10px] uppercase">On</span>
              )}
            </p>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              Track <strong className="text-text-default">batch number</strong>, <strong className="text-text-default">manufacturing date</strong>, and{" "}
              <strong className="text-text-default">expiry date</strong> per receipt line. A single PO line can have multiple batches with different dates.
            </p>
            {!me?.isTenantAdmin && (
              <p className="text-xs text-warning-fg mt-2">
                <Icon name="Lock" size={12} className="inline mr-1" />
                Sirf tenant admin yeh setting badal sakta hai.
              </p>
            )}
          </div>
        </label>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-1">Approval workflow</h2>
        <p className="text-sm text-muted mb-4">
          Number of approval levels a Purchase Requisition must pass through before it's
          finalised. Multi-level adds a second / third approver step before final approval.
        </p>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => setPrLevels(n)}
              disabled={saving || !me?.isTenantAdmin}
              className={`btn btn-sm ${prLevels === n ? "btn-primary" : "btn-ghost"}`}
              title={`Require ${n} approval level${n === 1 ? "" : "s"}`}
            >
              {n} level{n === 1 ? "" : "s"}
            </button>
          ))}
          <span className="text-[11.5px] text-muted ml-2">
            Current: <strong className="text-text-default">{prLevels} level{prLevels === 1 ? "" : "s"}</strong>
          </span>
        </div>
        {!me?.isTenantAdmin && (
          <p className="text-xs text-warning-fg mt-3">
            <Icon name="Lock" size={12} className="inline mr-1" />
            Only tenant admins can change this.
          </p>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-1">Appearance</h2>
        <p className="text-sm text-muted mb-4">
          Theme is part of the global design system. Changes apply instantly across every page.
        </p>
        <ThemeSwitcher />
      </div>
    </div>
  );
}
