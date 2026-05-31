"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";

interface VendorRow { id: string; name: string; email: string | null; }
interface LineDraft { itemName: string; quantity: string; uom: string; }

const emptyLine = (): LineDraft => ({ itemName: "", quantity: "", uom: "nos" });

export default function NewRfqPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const base = `/t/${params?.slug ?? ""}/rfq`;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<{ items: VendorRow[] }>("/api/vendors?pageSize=100")
      .then((r) => setVendors(r.items))
      .catch(() => toast.error("Couldn't load vendors"));
  }, []);

  function setLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, emptyLine()]); }
  function removeLine(idx: number) { setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))); }

  function toggleVendor(id: string) {
    setSelectedVendors((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const items = lines
      .map((l) => ({ itemName: l.itemName.trim(), quantity: Number(l.quantity), uom: l.uom.trim() || "nos" }))
      .filter((l) => l.itemName && Number.isFinite(l.quantity) && l.quantity > 0);
    if (title.trim().length < 3) { toast.error("Give the RFQ a title (min 3 chars)"); return; }
    if (!items.length) { toast.error("Add at least one line item with a quantity"); return; }

    setSubmitting(true);
    try {
      const rfq = await api<{ id: string }>("/api/rfq", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          dueDate: dueDate || null,
          vendorIds: Array.from(selectedVendors),
          items,
        }),
      });
      toast.success("RFQ created");
      router.push(`${base}/${rfq.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create RFQ");
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New RFQ"
        subtitle="Request quotations from your vendors"
        actions={<Link href={base} className="btn btn-ghost btn-sm"><Icon name="ArrowLeft" size={14} /> Back</Link>}
      />

      <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
        <div className="card p-4 space-y-3">
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 packaging materials" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Quote due date <span className="text-muted">(optional)</span></label>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Description <span className="text-muted">(optional)</span></label>
            <textarea className="input min-h-[64px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Scope, specs, terms vendors should know…" />
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold">Line items</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}><Icon name="Plus" size={13} /> Add line</button>
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-medium pb-1.5">Item</th>
                <th className="text-right font-medium pb-1.5 w-28">Qty</th>
                <th className="text-left font-medium pb-1.5 w-24 pl-2">UoM</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx} className="border-t border-border">
                  <td className="py-1.5 pr-2">
                    <input className="input" value={l.itemName} onChange={(e) => setLine(idx, { itemName: e.target.value })} placeholder="Item / material name" />
                  </td>
                  <td className="py-1.5">
                    <input type="number" min="0" step="0.001" className="input text-right" value={l.quantity} onChange={(e) => setLine(idx, { quantity: e.target.value })} placeholder="0" />
                  </td>
                  <td className="py-1.5 pl-2">
                    <input className="input" value={l.uom} onChange={(e) => setLine(idx, { uom: e.target.value })} placeholder="nos" />
                  </td>
                  <td className="py-1.5 text-right">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={lines.length === 1} onClick={() => removeLine(idx)}>
                      <Icon name="Trash2" size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-4">
          <h3 className="text-[13px] font-semibold mb-1">Invite vendors <span className="text-muted font-normal">(optional — you can also invite later)</span></h3>
          {!vendors.length ? (
            <p className="text-[12px] text-muted py-2">No vendors yet. Add some in the Vendors module first, or create the RFQ and invite later.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {vendors.map((v) => {
                const sel = selectedVendors.has(v.id);
                return (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => toggleVendor(v.id)}
                    className={`px-2.5 py-1.5 rounded-md text-[12px] border transition flex items-center gap-1.5 ${sel ? "" : "hover:bg-surface/60"}`}
                    style={{
                      borderColor: sel ? "var(--primary)" : "var(--border)",
                      background: sel ? "var(--success-bg)" : "transparent",
                    }}
                  >
                    {sel && <Icon name="Check" size={12} style={{ color: "var(--success)" }} />}
                    {v.name}
                  </button>
                );
              })}
            </div>
          )}
          {selectedVendors.size > 0 && (
            <p className="text-[11px] text-muted mt-2">{selectedVendors.size} vendor{selectedVendors.size === 1 ? "" : "s"} will be invited on create.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link href={base} className="btn btn-ghost btn-sm">Cancel</Link>
          <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
            {submitting ? "Creating…" : <>Create RFQ <Icon name="ArrowRight" size={14} /></>}
          </button>
        </div>
      </form>
    </>
  );
}
