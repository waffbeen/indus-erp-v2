"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";

interface LineItem {
  id: string;
  itemName: string;
  quantity: number;
  uom: string;
}

/**
 * Buyer-side: record a quote a vendor sent by phone/email/paper so it shows up
 * in the comparison. The vendor portal writes the same shape — this is the
 * internal mirror.
 */
export function RecordQuoteModal({
  rfqId,
  vendor,
  items,
  onClose,
  onSaved,
}: {
  rfqId: string;
  vendor: { id: string; name: string };
  items: LineItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [days, setDays] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const lines = items
      .map((it) => ({ rfqItemId: it.id, unitPrice: Number(prices[it.id]), deliveryDays: days[it.id] ? Number(days[it.id]) : null }))
      .filter((l) => Number.isFinite(l.unitPrice) && l.unitPrice > 0);
    if (!lines.length) {
      toast.error("Enter a price for at least one line");
      return;
    }
    setSubmitting(true);
    try {
      await api(`/api/rfq/${rfqId}/quote`, {
        method: "POST",
        body: JSON.stringify({ vendorId: vendor.id, items: lines, remarks: remarks || null }),
      });
      toast.success(`Quote recorded for ${vendor.name}`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't record quote");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div className="w-full max-w-lg card p-0 overflow-hidden" style={{ boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h2 className="text-[14px] font-semibold tracking-tight">Record quote</h2>
            <p className="text-[11.5px] text-muted">from {vendor.name}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="X" size={15} /></button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-medium pb-1.5">Item</th>
                <th className="text-right font-medium pb-1.5 w-28">Unit price ₹</th>
                <th className="text-right font-medium pb-1.5 w-20">Lead (d)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="py-2 pr-2">
                    <div className="font-medium">{it.itemName}</div>
                    <div className="text-[10.5px] text-muted">{it.quantity} {it.uom}</div>
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input text-right"
                      placeholder="0.00"
                      value={prices[it.id] ?? ""}
                      onChange={(e) => setPrices((p) => ({ ...p, [it.id]: e.target.value }))}
                    />
                  </td>
                  <td className="py-2 pl-2">
                    <input
                      type="number"
                      min="0"
                      className="input text-right"
                      placeholder="—"
                      value={days[it.id] ?? ""}
                      onChange={(e) => setDays((d) => ({ ...d, [it.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3">
            <label className="label">Remarks</label>
            <input className="input" placeholder="Optional note from the vendor" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>
            {submitting ? "Saving…" : "Save quote"}
          </button>
        </div>
      </div>
    </div>
  );
}
