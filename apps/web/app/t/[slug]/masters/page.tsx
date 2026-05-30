"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon, type IconProps } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";

/* ---------------- Master definitions ---------------- */

interface MasterDef {
  key: string;
  label: string;
  icon: IconProps["name"];
  group: "procurement" | "catalog" | "organization";
  endpoint: string;
  /** Columns to render in the table (in order). */
  columns: Array<{ field: string; label: string; type?: "code" | "text" | "ref:item_groups" }>;
  /** Fields for the "add new" row. */
  fields: Array<{ name: string; label: string; required?: boolean; type?: "code" | "text" | "ref:item_groups" }>;
  /** Short helper text under the section header. */
  hint?: string;
}

const MASTERS: MasterDef[] = [
  {
    key: "hsn", label: "HSN / SAC Codes", icon: "Receipt", group: "procurement",
    endpoint: "/api/masters/hsn",
    columns: [
      { field: "code", label: "Code", type: "code" },
      { field: "description", label: "Description" },
      { field: "defaultGstRate", label: "GST %" },
    ],
    fields: [
      { name: "code", label: "Code", required: true, type: "code" },
      { name: "description", label: "Description" },
      { name: "defaultGstRate", label: "GST %" },
    ],
    hint: "HSN/SAC codes used in PR/PO line items. Default GST rate auto-fills line tax %.",
  },
  {
    key: "uoms", label: "Units of Measure", icon: "Ruler", group: "procurement",
    endpoint: "/api/masters/uoms",
    columns: [
      { field: "code", label: "Code", type: "code" },
      { field: "name", label: "Name" },
    ],
    fields: [
      { name: "code", label: "Code", required: true, type: "code" },
      { name: "name", label: "Name" },
    ],
    hint: "Common Indian-procurement UoMs auto-seeded; add custom UoMs anytime.",
  },
  {
    key: "payment-terms", label: "Payment Terms", icon: "CreditCard", group: "procurement",
    endpoint: "/api/masters/payment-terms",
    columns: [{ field: "label", label: "Term" }],
    fields: [{ name: "label", label: "Payment term", required: true }],
    hint: "PO ka payment-terms dropdown yahi se aata hai. \"Net 30 days\", \"50% advance\" jaisi terms add karo.",
  },
  {
    key: "delivery-terms", label: "Delivery Terms (F.O.R.)", icon: "Truck", group: "procurement",
    endpoint: "/api/masters/delivery-terms",
    columns: [
      { field: "code", label: "Code", type: "code" },
      { field: "label", label: "Label" },
    ],
    fields: [
      { name: "code", label: "Code", required: true, type: "code" },
      { name: "label", label: "Label", required: true },
    ],
    hint: "F.O.R. delivery options shown on PO (Ex Works / FOR Plant / CIF / etc.).",
  },
  {
    key: "cancel-reasons", label: "Cancellation Reasons", icon: "CircleX", group: "procurement",
    endpoint: "/api/masters/cancel-reasons",
    columns: [{ field: "label", label: "Reason" }],
    fields: [{ name: "label", label: "Reason", required: true }],
    hint: "PO cancel / short-close dropdown me yeh reasons aate hain.",
  },
  {
    key: "item-groups", label: "Item Groups", icon: "Layers", group: "catalog",
    endpoint: "/api/masters/item-groups",
    columns: [
      { field: "code", label: "Code", type: "code" },
      { field: "name", label: "Name" },
    ],
    fields: [
      { name: "code", label: "Code" },
      { name: "name", label: "Name", required: true },
    ],
    hint: "Top-level item categories — Raw Material, Spares, Consumables, etc.",
  },
  {
    key: "item-sub-groups", label: "Item Sub-Groups", icon: "Layers3", group: "catalog",
    endpoint: "/api/masters/item-sub-groups",
    columns: [
      { field: "code", label: "Code", type: "code" },
      { field: "name", label: "Name" },
      { field: "groupId", label: "Parent Group", type: "ref:item_groups" },
    ],
    fields: [
      { name: "code", label: "Code" },
      { name: "name", label: "Name", required: true },
      { name: "groupId", label: "Parent Group", type: "ref:item_groups" },
    ],
    hint: "Bearings under Spares, Belts under Consumables, etc. Parent group optional.",
  },
  {
    key: "item-categories", label: "Item Categories", icon: "Tag", group: "catalog",
    endpoint: "/api/masters/item-categories",
    columns: [
      { field: "code", label: "Code", type: "code" },
      { field: "name", label: "Name" },
    ],
    fields: [
      { name: "code", label: "Code" },
      { name: "name", label: "Name", required: true },
    ],
    hint: "Business-tag categories — Engineering / Stationery / Safety / etc.",
  },
  {
    key: "brands", label: "Brands / Makes", icon: "Award", group: "catalog",
    endpoint: "/api/masters/brands",
    columns: [{ field: "name", label: "Name" }],
    fields: [{ name: "name", label: "Brand name", required: true }],
    hint: "Brand / make catalogue — typeahead on items, optional tag on PO lines.",
  },
  {
    key: "cost-centers", label: "Cost Centres", icon: "Building2", group: "organization",
    endpoint: "/api/masters/cost-centers",
    columns: [
      { field: "code", label: "Code", type: "code" },
      { field: "name", label: "Name" },
    ],
    fields: [
      { name: "code", label: "Code" },
      { name: "name", label: "Name", required: true },
    ],
    hint: "Cost-centre tags for management accounting (Production / Maintenance / R&D).",
  },
];

const GROUP_LABEL: Record<MasterDef["group"], string> = {
  procurement: "Procurement",
  catalog: "Item Catalog",
  organization: "Organization",
};

/* ---------------- Page ---------------- */

export default function MastersPage() {
  const { me } = useAuth();
  const isAdmin = !!me?.isTenantAdmin;
  const [activeKey, setActiveKey] = useState<string>(MASTERS[0]!.key);
  const active = MASTERS.find((m) => m.key === activeKey)!;

  // Group definitions for the sidebar
  const grouped = useMemo(() => {
    const out: Record<string, MasterDef[]> = {};
    for (const m of MASTERS) {
      if (!out[m.group]) out[m.group] = [];
      out[m.group]!.push(m);
    }
    return out;
  }, []);

  return (
    <>
      <PageHeader
        title="Masters"
        subtitle="Tenant-scoped reference data — HSN, UoM, payment terms, item taxonomy, cost centres."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        {/* Sidebar */}
        <aside className="card p-2 self-start lg:sticky lg:top-[68px]">
          {Object.entries(grouped).map(([group, list]) => (
            <div key={group} className="mb-2 last:mb-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-2 py-1.5">
                {GROUP_LABEL[group as MasterDef["group"]]}
              </p>
              {list.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setActiveKey(m.key)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] transition mb-0.5 ${
                    activeKey === m.key
                      ? "bg-surface text-text-default font-semibold"
                      : "text-muted hover:bg-surface/60 hover:text-text-default"
                  }`}
                >
                  <Icon name={m.icon} size={14} />
                  <span className="truncate">{m.label}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Active master pane */}
        <MasterPane key={active.key} def={active} isAdmin={isAdmin} />
      </div>
    </>
  );
}

/* ---------------- Master pane (list + add + delete) ---------------- */

function MasterPane({ def, isAdmin }: { def: MasterDef; isAdmin: boolean }) {
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // For refs (e.g. groupId → item_groups), load the lookup data once per pane mount.
  const [refData, setRefData] = useState<Record<string, Array<{ id: string; name: string }>>>({});

  async function load() {
    setLoading(true);
    try {
      const data = await api<Record<string, any>[]>(def.endpoint);
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Preload any referenced masters
    const refs = new Set<string>();
    for (const c of def.columns) if (c.type?.startsWith("ref:")) refs.add(c.type.split(":")[1]!);
    for (const f of def.fields) if (f.type?.startsWith("ref:")) refs.add(f.type.split(":")[1]!);
    void (async () => {
      const collected: Record<string, Array<{ id: string; name: string }>> = {};
      for (const refKey of refs) {
        try {
          const endpoint = refKey === "item_groups" ? "/api/masters/item-groups" : null;
          if (!endpoint) continue;
          const data = await api<Array<{ id: string; name: string }>>(endpoint);
          collected[refKey] = data;
        } catch { /* ignore */ }
      }
      setRefData(collected);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.key]);

  async function handleAdd() {
    if (submitting) return;
    // Validate required
    for (const f of def.fields) {
      if (f.required && !form[f.name]?.trim()) {
        toast.error("Missing field", `${f.label} chahiye`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const body: Record<string, any> = {};
      for (const f of def.fields) {
        const v = form[f.name];
        if (v == null || v === "") continue;
        if (f.name === "defaultGstRate") body[f.name] = Number(v);
        else body[f.name] = v;
      }
      await api(def.endpoint, { method: "POST", body: JSON.stringify(body) });
      toast.success("Saved", `${def.label} entry added.`);
      setForm({});
      void load();
    } catch (err) {
      toast.error("Could not save", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!isAdmin) {
      toast.error("Admin only", "Sirf tenant admin remove kar sakte hain.");
      return;
    }
    if (!confirm("Remove this entry? Existing references stay untouched.")) return;
    try {
      await api(`${def.endpoint}/${id}`, { method: "DELETE" });
      toast.success("Removed");
      void load();
    } catch (err) {
      toast.error("Could not remove", err instanceof ApiError ? err.message : "Try again");
    }
  }

  function renderCell(row: Record<string, any>, field: string, type?: string): ReactNode {
    const value = row[field];
    if (value == null || value === "") return <span className="text-muted">—</span>;
    if (type?.startsWith("ref:")) {
      const refKey = type.split(":")[1]!;
      const opts = refData[refKey] ?? [];
      const ref = opts.find((o) => o.id === value);
      return ref?.name ?? <span className="text-muted text-[11px]">(missing)</span>;
    }
    if (type === "code") return <span className="font-mono text-xs">{value}</span>;
    return String(value);
  }

  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{def.label}</p>
        {def.hint && <p className="text-xs text-muted mt-0.5">{def.hint}</p>}
      </div>

      {/* Add row */}
      <div className="px-5 py-3 border-b border-border bg-surface/40">
        <div className="flex flex-wrap items-end gap-2">
          {def.fields.map((f) => (
            <div key={f.name} className="flex-1 min-w-[140px]">
              <label className="label">
                {f.label}
                {f.required && <span className="text-danger"> *</span>}
              </label>
              {f.type?.startsWith("ref:") ? (
                <select
                  className="input !py-1.5 text-sm"
                  value={form[f.name] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                >
                  <option value="">— None —</option>
                  {(refData[f.type.split(":")[1]!] ?? []).map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  className={`input !py-1.5 text-sm ${f.type === "code" ? "font-mono" : ""}`}
                  value={form[f.name] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                  type={f.name === "defaultGstRate" ? "number" : "text"}
                />
              )}
            </div>
          ))}
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={submitting}>
            <Icon name="Plus" size={14} /> {submitting ? "Saving…" : "Add"}
          </button>
        </div>
      </div>

      {/* Table */}
      {error && <div className="px-5 py-3 text-xs bg-danger-bg text-danger-fg">{error}</div>}
      {loading && !rows ? (
        <div className="p-8 text-center text-muted text-sm">Loading…</div>
      ) : !rows?.length ? (
        <div className="p-8 text-center text-muted text-sm">No entries yet. Add the first one above.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
              <tr>
                {def.columns.map((c) => (
                  <th key={c.field} className="text-left px-4 py-2 font-semibold">{c.label}</th>
                ))}
                <th className="text-right px-4 py-2 font-semibold w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  {def.columns.map((c) => (
                    <td key={c.field} className="px-4 py-2">{renderCell(row, c.field, c.type)}</td>
                  ))}
                  <td className="px-4 py-2 text-right">
                    {isAdmin && (
                      <button
                        className="h-7 w-7 rounded-pill grid place-items-center text-muted hover:bg-danger-bg hover:text-danger-fg"
                        onClick={() => handleDelete(row.id)}
                        title="Remove"
                      >
                        <Icon name="Trash2" size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
