"use client";
import React, { useEffect, useState, type FormEvent } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { FieldError, fieldClass } from "@/components/FieldError";
import { FormSheet } from "@/components/FormSheet";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR } from "@/lib/format";
import { grnCreateSchema, type GrnCreateInput, type GrnItemInput } from "@indus/shared";
import { validate, apiErrorToFormErrors, emptyErrors, type FormErrorState } from "@/lib/form-errors";

interface PoLite { id: string; poNumber: string | null; title: string; vendorId: string; status: string; }
interface DraftFromPo {
  po: { id: string; poNumber: string | null; title: string; companyId: string; unitId: string; vendorId: string };
  items: Array<{
    poItemId: string;
    itemId: string | null;
    itemName: string;
    uom: string;
    orderedQuantity: number;
    alreadyReceivedQuantity: number;
    suggestedReceiveQuantity: number;
    unitPrice: number;
  }>;
}

export default function NewGrnPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const sp = useSearchParams();
  const fromPoId = sp?.get("fromPo") ?? null;
  const gateEntryId = sp?.get("gateEntryId") ?? null;
  const base = `/t/${params?.slug ?? ""}/grn`;

  const [pos, setPos] = useState<PoLite[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<string>(fromPoId ?? "");
  const [draft, setDraft] = useState<DraftFromPo | null>(null);
  /** Tenant-level toggle: when true, GRN form shows batch / mfg / expiry columns. */
  const [batchMode, setBatchMode] = useState(false);

  const [form, setForm] = useState<Omit<GrnCreateInput, "items" | "companyId" | "unitId" | "poId" | "vendorId">>({
    invoiceNumber: "",
    invoiceDate: null,
    invoiceAmount: null,
    receivedDate: new Date().toISOString().slice(0, 10),
    remarks: "",
    gateEntryId: gateEntryId,
  });
  const [items, setItems] = useState<GrnItemInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);
  const fe = errors.fields;

  useEffect(() => {
    (async () => {
      try {
        const [resp, settings] = await Promise.all([
          api<{ items: PoLite[] }>("/api/po?pageSize=100"),
          api<{ grn?: { batchMode?: boolean } }>("/api/tenant/settings").catch(() => ({})),
        ]);
        const receivable = resp.items.filter((p) => ["approved", "sent_to_vendor", "partially_received"].includes(p.status));
        setPos(receivable);
        setBatchMode(!!settings?.grn?.batchMode);
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load POs", fields: {} });
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedPoId) {
      setDraft(null);
      setItems([]);
      return;
    }
    (async () => {
      try {
        const d = await api<DraftFromPo>(`/api/grn/from-po/${selectedPoId}`);
        setDraft(d);
        setItems(
          d.items.map((it) => ({
            poItemId: it.poItemId,
            itemId: it.itemId,
            itemName: it.itemName,
            uom: it.uom,
            orderedQuantity: it.orderedQuantity,
            receivedQuantity: it.suggestedReceiveQuantity,
            acceptedQuantity: it.suggestedReceiveQuantity,
            rejectedQuantity: 0,
            unitPrice: it.unitPrice,
            condition: "good",
            remarks: "",
            batchNumber: "",
            mfgDate: null,
            expiryDate: null,
          })),
        );
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load PO details", fields: {} });
      }
    })();
  }, [selectedPoId]);

  function setItem(idx: number, patch: Partial<GrnItemInput>) {
    setItems((arr) => arr.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  /**
   * Duplicate a row to add another batch against the same PO line. Carries
   * over item id / name / uom / unit price so the line stays attached, but
   * resets qty + batch fields so the user can type fresh values.
   */
  function addBatchFor(srcIdx: number) {
    const src = items[srcIdx];
    if (!src) return;
    setItems((arr) => {
      const next = [...arr];
      next.splice(srcIdx + 1, 0, {
        ...src,
        receivedQuantity: 0,
        acceptedQuantity: 0,
        rejectedQuantity: 0,
        batchNumber: "",
        mfgDate: null,
        expiryDate: null,
      });
      return next;
    });
  }

  function removeRow(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  const computedInvoice = items.reduce((s, it) => s + it.acceptedQuantity * it.unitPrice, 0);

  async function handleSave(e?: FormEvent) {
    e?.preventDefault();
    if (submitting) return;
    if (!draft) {
      setErrors({ summary: "Pick a PO first", fields: {} });
      return;
    }
    if (!items.length || items.every((it) => it.receivedQuantity === 0)) {
      setErrors({ summary: "Enter received quantity for at least one item", fields: {} });
      return;
    }
    const payload: GrnCreateInput = {
      companyId: draft.po.companyId,
      unitId: draft.po.unitId,
      poId: draft.po.id,
      vendorId: draft.po.vendorId,
      gateEntryId: form.gateEntryId ?? null,
      invoiceNumber: form.invoiceNumber ?? "",
      invoiceDate: form.invoiceDate,
      invoiceAmount: form.invoiceAmount ?? computedInvoice,
      receivedDate: form.receivedDate,
      remarks: form.remarks ?? "",
      items: items.filter((it) => it.receivedQuantity > 0),
    };
    const result = validate(grnCreateSchema, payload);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(emptyErrors);
    setSubmitting(true);
    try {
      const grn = await api<{ id: string }>("/api/grn", { method: "POST", body: JSON.stringify(result.data) });
      toast.success("Goods received", "PO status updated automatically based on received qty.");
      router.push(`${base}/${grn.id}`);
    } catch (err) {
      setErrors(apiErrorToFormErrors(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormSheet
      title="Goods Receipt Creation"
      subtitle={draft ? `Against ${draft.po.poNumber ?? draft.po.title}` : "Pick a PO that has items pending receipt"}
      onClose={() => router.push(base)}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push(base)}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSave()} disabled={submitting || !draft}>
            {submitting ? "Saving…" : "Save GRN"} <Icon name="ArrowRight" size={13} />
          </button>
        </>
      }
    >
      {errors.summary && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="AlertTriangle" size={14} />
          <span className="flex-1">{errors.summary}</span>
        </div>
      )}

      {/* PO picker */}
      {!draft && (
        <div className="card p-6 mb-5">
          <label className="label">Select a PO to receive against</label>
          <select className="input" value={selectedPoId} onChange={(e) => setSelectedPoId(e.target.value)}>
            <option value="">— Choose PO —</option>
            {pos.map((p) => (
              <option key={p.id} value={p.id}>{p.poNumber ?? p.title} · {p.status}</option>
            ))}
          </select>
          {pos.length === 0 && <p className="mt-2 text-xs text-muted">No approved/sent POs available. Approve a PO first.</p>}
        </div>
      )}

      {draft && (
        <form onSubmit={handleSave}>
          {/* Header */}
          <div className="card p-6 mb-5 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Invoice & receipt</p>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div>
                <label className="label">Received date <span className="text-danger">*</span></label>
                <input type="date" className="input" value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} required />
              </div>
              <div>
                <label className="label">Invoice number</label>
                <input className="input font-mono" value={form.invoiceNumber ?? ""} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
              </div>
              <div>
                <label className="label">Invoice date</label>
                <input type="date" className="input" value={form.invoiceDate ?? ""} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
              </div>
              <div>
                <label className="label">Invoice amount (₹)</label>
                <input
                  className="input tabular-nums"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={`auto: ₹${computedInvoice.toFixed(2)}`}
                  value={form.invoiceAmount ?? ""}
                  onChange={(e) => setForm({ ...form, invoiceAmount: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>

            <div>
              <label className="label">Remarks</label>
              <textarea className="input" rows={2} value={form.remarks ?? ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Anything special — condition, dock notes..." />
            </div>
          </div>

          {/* Items table */}
          <div className="card overflow-hidden mb-5">
            <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Items being received</p>
                <p className="text-sm text-muted mt-0.5">
                  Edit received/accepted/rejected — leave received=0 to skip an item this time.
                  {batchMode && (
                    <> Click <strong>+ Add batch</strong> to split a line across multiple batches.</>
                  )}
                </p>
              </div>
              {batchMode && (
                <span className="badge badge-info text-[10px] uppercase tracking-wider">Batch mode</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold w-12">#</th>
                    <th className="text-left px-3 py-2 font-semibold min-w-[200px]">Item</th>
                    <th className="text-left px-3 py-2 font-semibold w-24">Ordered</th>
                    <th className="text-left px-3 py-2 font-semibold w-24">Received</th>
                    <th className="text-left px-3 py-2 font-semibold w-24">Accepted</th>
                    <th className="text-left px-3 py-2 font-semibold w-24">Rejected</th>
                    <th className="text-left px-3 py-2 font-semibold w-32">Condition</th>
                    <th className="text-right px-3 py-2 font-semibold w-32">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const value = it.acceptedQuantity * it.unitPrice;
                    // Show "first row of a PO line" vs "subsequent batch row" so the
                    // item name doesn't repeat when we have multiple batches per line.
                    const prev = idx > 0 ? items[idx - 1] : null;
                    const isContinuation = batchMode && prev && prev.poItemId === it.poItemId && prev.poItemId !== null;
                    return (
                      <React.Fragment key={idx}>
                      <tr className={`border-t border-border ${isContinuation ? "border-t-dashed" : ""}`}>
                        <td className="px-3 py-2 text-muted text-xs pt-3.5">{isContinuation ? <span className="opacity-40">↳</span> : idx + 1}</td>
                        <td className="px-3 py-2">
                          {isContinuation ? (
                            <p className="text-[11px] text-muted italic">Same item — next batch</p>
                          ) : (
                            <>
                              <p className="font-semibold">{it.itemName}</p>
                              <p className="text-[11px] text-muted">UOM: <span className="font-mono">{it.uom}</span> · @ {paiseToINR(it.unitPrice * 100)}</p>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted">{isContinuation ? "" : it.orderedQuantity}</td>
                        <td className="px-3 py-2">
                          <input
                            className="input !py-1.5 tabular-nums"
                            type="number"
                            step="0.001"
                            min="0"
                            value={it.receivedQuantity || 0}
                            onChange={(e) => {
                              const r = Number(e.target.value);
                              const acc = Math.min(r, it.acceptedQuantity + it.rejectedQuantity > 0 ? it.acceptedQuantity : r);
                              setItem(idx, { receivedQuantity: r, acceptedQuantity: r === 0 ? 0 : acc || r });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input !py-1.5 tabular-nums"
                            type="number"
                            step="0.001"
                            min="0"
                            max={it.receivedQuantity}
                            value={it.acceptedQuantity || 0}
                            onChange={(e) => {
                              const a = Number(e.target.value);
                              setItem(idx, { acceptedQuantity: a, rejectedQuantity: Math.max(0, it.receivedQuantity - a) });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input !py-1.5 tabular-nums"
                            type="number"
                            step="0.001"
                            min="0"
                            value={it.rejectedQuantity || 0}
                            readOnly
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select className="input !py-1.5 text-xs" value={it.condition} onChange={(e) => setItem(idx, { condition: e.target.value as "good" })}>
                            <option value="good">Good</option>
                            <option value="damaged">Damaged</option>
                            <option value="shortage">Shortage</option>
                            <option value="excess">Excess</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-right pt-3">
                          {value > 0 ? paiseToINR(value * 100) : <span className="text-muted">—</span>}
                        </td>
                      </tr>

                      {/* Batch sub-row — only when batchMode is on and the item is from a PO line */}
                      {batchMode && it.poItemId && (
                        <tr className="border-b border-border" style={{ background: "var(--surface)" }}>
                          <td />
                          <td colSpan={7} className="px-3 pb-2 pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
                                Batch #
                                <input
                                  className="input !py-1 !h-8 w-36 font-mono text-xs"
                                  placeholder="e.g. B-2026-001"
                                  value={it.batchNumber ?? ""}
                                  onChange={(e) => setItem(idx, { batchNumber: e.target.value })}
                                />
                              </label>
                              <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
                                Mfg
                                <input
                                  type="date"
                                  className="input !py-1 !h-8 w-36 text-xs"
                                  value={it.mfgDate ?? ""}
                                  onChange={(e) => setItem(idx, { mfgDate: e.target.value || null })}
                                />
                              </label>
                              <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
                                Expiry
                                <input
                                  type="date"
                                  className="input !py-1 !h-8 w-36 text-xs"
                                  value={it.expiryDate ?? ""}
                                  onChange={(e) => setItem(idx, { expiryDate: e.target.value || null })}
                                />
                              </label>
                              <div className="flex-1" />
                              <button
                                type="button"
                                className="text-[11px] font-medium flex items-center gap-1 text-primary hover:underline whitespace-nowrap"
                                onClick={() => addBatchFor(idx)}
                                title="Split this PO line — add another batch with different mfg/expiry"
                              >
                                <Icon name="Plus" size={14} />
                                Add batch
                              </button>
                              {isContinuation && (
                                <button
                                  type="button"
                                  className="text-[11px] font-medium flex items-center gap-1 text-muted hover:text-danger-fg whitespace-nowrap"
                                  onClick={() => removeRow(idx)}
                                  title="Remove this batch"
                                >
                                  <Icon name="Trash2" size={14} />
                                  Remove
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface">
                    <td colSpan={7} className="px-3 py-3 text-right font-semibold text-muted">Receipt value</td>
                    <td className="px-3 py-3 font-bold tabular-nums text-right">{paiseToINR(computedInvoice * 100)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </form>
      )}
    </FormSheet>
  );
}
