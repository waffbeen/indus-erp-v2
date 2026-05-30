"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
import { StatusTabs } from "@/components/ListPrimitives";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/format";

interface CountRow {
  id: string;
  countNumber: string | null;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  unitId: string;
  unitName: string;
  companyId: string;
  remarks: string | null;
  countedByName: string;
  postedAt: string | null;
  createdAt: string;
  lineCount: number;
}

interface Unit { id: string; name: string; code: string | null; companyId: string; }
interface Company { id: string; name: string; isPrimary: boolean; }

const STATUS_META: Record<CountRow["status"], { label: string; tint: string }> = {
  draft:       { label: "Draft",       tint: "badge-info" },
  in_progress: { label: "In progress", tint: "badge-tint-peach" },
  completed:   { label: "Completed",   tint: "badge-tint-mint" },
  cancelled:   { label: "Cancelled",   tint: "badge-tint-blush" },
};

type StatusTab = "all" | CountRow["status"];

export default function StockCountListPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const router = useRouter();

  const [rows, setRows] = useState<CountRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<StatusTab>("all");

  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<CountRow[]>("/api/stock-counts");
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load counts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    Promise.all([
      api<Company[]>("/api/tenant/companies"),
      api<Unit[]>("/api/tenant/units"),
    ]).then(([c, u]) => {
      setCompanies(c);
      setUnits(u);
      const primary = c.find((x) => x.isPrimary) ?? c[0];
      if (primary) {
        setCompanyId(primary.id);
        const firstUnit = u.find((x) => x.companyId === primary.id);
        if (firstUnit) setUnitId(firstUnit.id);
      }
    }).catch(() => { /* noop */ });
  }, []);

  async function createCount() {
    if (creating) return;
    if (!unitId) { toast.error("Warehouse required", "Pick a warehouse to count."); return; }
    setCreating(true);
    try {
      const row = await api<{ id: string }>("/api/stock-counts", {
        method: "POST",
        body: JSON.stringify({ companyId, unitId, remarks: remarks || undefined }),
      });
      toast.success("Count created", "System quantities snapshotted from the ledger.");
      setModalOpen(false);
      router.push(`/t/${slug}/stock-count/${row.id}`);
    } catch (err) {
      toast.error("Could not create", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setCreating(false);
    }
  }

  const counts: Record<StatusTab, number> = {
    all: rows?.length ?? 0,
    draft: rows?.filter((r) => r.status === "draft").length ?? 0,
    in_progress: rows?.filter((r) => r.status === "in_progress").length ?? 0,
    completed: rows?.filter((r) => r.status === "completed").length ?? 0,
    cancelled: rows?.filter((r) => r.status === "cancelled").length ?? 0,
  };
  const filtered = (rows ?? []).filter((r) => tab === "all" || r.status === tab);
  const filteredUnits = units.filter((u) => u.companyId === companyId);

  return (
    <>
      <PageHeader
        title="Cycle Counts"
        subtitle="Physical stock verification. Create a count, enter what you physically find, then post — variances become balancing ledger adjustments."
        actions={<button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}><Icon name="Plus" size={14} /> New count</button>}
      />

      <div className="mb-3">
        <StatusTabs<StatusTab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: "All", count: counts.all },
            { key: "draft", label: "Draft", count: counts.draft },
            { key: "in_progress", label: "In progress", count: counts.in_progress },
            { key: "completed", label: "Completed", count: counts.completed },
            { key: "cancelled", label: "Cancelled", count: counts.cancelled },
          ]}
        />
      </div>

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} /><span className="flex-1">{error}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && !rows ? (
          <div className="p-6 text-center text-xs text-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Icon name="ClipboardCheck" size={20} className="mx-auto mb-1.5 text-muted" />
            <p className="text-xs text-muted">{tab === "all" ? "No cycle counts yet. Create one to verify physical stock." : "No counts in this state."}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Count #</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Warehouse</th>
                <th className="text-center px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Lines</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">By</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Created</th>
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-surface/60 cursor-pointer" onClick={() => router.push(`/t/${slug}/stock-count/${r.id}`)}>
                    <td className="px-3 py-1.5 font-mono text-[12px] font-medium">{r.countNumber ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[12px]">{r.unitName}</td>
                    <td className="px-3 py-1.5 text-center"><span className={`badge ${meta.tint} text-[10px]`}>{meta.label}</span></td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-muted">{r.lineCount}</td>
                    <td className="px-3 py-1.5 text-[11px] text-muted">{r.countedByName}</td>
                    <td className="px-3 py-1.5 text-[11px] text-muted whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td className="px-3 py-1.5 text-right"><Icon name="ChevronRight" size={14} className="text-muted" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => !creating && setModalOpen(false)}
        title="New cycle count"
        description="We snapshot the current on-hand for every item in the chosen warehouse so you can record what you physically find."
        size="md"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setModalOpen(false)} disabled={creating}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={createCount} disabled={creating || !unitId}>
              {creating ? "Creating…" : "Create & snapshot"}
            </button>
          </>
        }
      >
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Company</label>
              <select className="input" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setUnitId(""); }}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Warehouse <span className="text-danger">*</span></label>
              <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Select…</option>
                {filteredUnits.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Remarks</label>
            <textarea className="input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Quarterly count — Zone A" />
          </div>
        </div>
      </Modal>
    </>
  );
}
