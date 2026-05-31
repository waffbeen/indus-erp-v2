"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";

interface VendorRow {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
}

export function InviteVendorsModal({
  rfqId,
  alreadyInvited,
  onClose,
  onInvited,
}: {
  rfqId: string;
  alreadyInvited: string[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const invitedSet = new Set(alreadyInvited);

  useEffect(() => {
    api<{ items: VendorRow[] }>("/api/vendors?pageSize=100")
      .then((r) => setVendors(r.items))
      .catch(() => toast.error("Couldn't load vendors"))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!selected.size || submitting) return;
    setSubmitting(true);
    try {
      await api(`/api/rfq/${rfqId}/invite`, {
        method: "POST",
        body: JSON.stringify({ vendorIds: Array.from(selected) }),
      });
      toast.success(`Invited ${selected.size} vendor${selected.size === 1 ? "" : "s"}`);
      onInvited();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't invite vendors");
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = vendors.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div className="w-full max-w-md card p-0 overflow-hidden" style={{ boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-[14px] font-semibold tracking-tight">Invite vendors to quote</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="X" size={15} /></button>
        </div>

        <div className="p-4">
          <div className="relative mb-3">
            <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input className="input pl-7" placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="max-h-[320px] overflow-y-auto -mx-1 px-1 space-y-1">
            {loading ? (
              <div className="text-center py-8 text-xs text-muted">Loading vendors…</div>
            ) : !filtered.length ? (
              <div className="text-center py-8 text-xs text-muted">No vendors found. Add vendors in the Vendors module first.</div>
            ) : (
              filtered.map((v) => {
                const isInvited = invitedSet.has(v.id);
                const isSel = selected.has(v.id);
                return (
                  <button
                    key={v.id}
                    disabled={isInvited}
                    onClick={() => toggle(v.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition ${
                      isInvited ? "opacity-50 cursor-not-allowed" : isSel ? "bg-surface" : "hover:bg-surface/60"
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded grid place-items-center shrink-0 border"
                      style={{
                        borderColor: isSel || isInvited ? "var(--primary)" : "var(--border)",
                        background: isSel || isInvited ? "var(--primary)" : "transparent",
                        color: "var(--primary-fg)",
                      }}
                    >
                      {(isSel || isInvited) && <Icon name="Check" size={11} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12.5px] font-medium truncate">{v.name}</span>
                      {v.email && <span className="block text-[10.5px] text-muted truncate">{v.email}</span>}
                    </span>
                    {isInvited && <span className="text-[10px] text-muted">Invited</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={!selected.size || submitting} onClick={submit}>
            {submitting ? "Inviting…" : `Invite ${selected.size || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
