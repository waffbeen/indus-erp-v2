"use client";
import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { FormSheet } from "@/components/FormSheet";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, formatDate } from "@/lib/format";
import { paymentCreateSchema, type PaymentCreateInput } from "@indus/shared";
import { validate, apiErrorToFormErrors, emptyErrors, type FormErrorState } from "@/lib/form-errors";

interface VendorLite { id: string; name: string; }
interface OutstandingInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalPaise: string;
  outstandingPaise: string;
  status: string;
}

const METHODS: Array<{ value: PaymentCreateInput["method"]; label: string }> = [
  { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
];

export default function NewPaymentPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const sp = useSearchParams();
  const base = `/t/${params?.slug ?? ""}/payments`;

  const prefillVendor = sp?.get("vendorId") ?? "";
  const prefillInvoice = sp?.get("invoiceId") ?? "";

  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [vendorId, setVendorId] = useState(prefillVendor);
  const [outstanding, setOutstanding] = useState<OutstandingInvoice[]>([]);
  /** invoiceId -> allocation in rupees */
  const [alloc, setAlloc] = useState<Record<string, number>>({});

  const [form, setForm] = useState<{ paymentDate: string; method: PaymentCreateInput["method"]; amount: number | null; reference: string; remarks: string }>({
    paymentDate: new Date().toISOString().slice(0, 10),
    method: "neft",
    amount: null,
    reference: "",
    remarks: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);

  useEffect(() => {
    (async () => {
      try {
        const resp = await api<{ items: VendorLite[] }>("/api/vendors?pageSize=100");
        setVendors(resp.items);
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load vendors", fields: {} });
      }
    })();
  }, []);

  useEffect(() => {
    if (!vendorId) { setOutstanding([]); setAlloc({}); return; }
    (async () => {
      try {
        const resp = await api<{ items: OutstandingInvoice[] }>(`/api/payments/outstanding/${vendorId}`);
        setOutstanding(resp.items);
        // Pre-allocate the invoice we arrived from (if any) to its full balance.
        if (prefillInvoice) {
          const target = resp.items.find((i) => i.id === prefillInvoice);
          if (target) {
            const rupees = Number(target.outstandingPaise) / 100;
            setAlloc({ [target.id]: rupees });
            setForm((f) => ({ ...f, amount: f.amount ?? rupees }));
          }
        }
      } catch (err) {
        setErrors({ summary: err instanceof ApiError ? err.message : "Could not load outstanding invoices", fields: {} });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const allocatedTotal = useMemo(() => Object.values(alloc).reduce((s, v) => s + (v || 0), 0), [alloc]);
  const amount = form.amount ?? 0;
  const advance = amount - allocatedTotal;

  function setAllocFor(invoiceId: string, value: number) {
    setAlloc((a) => ({ ...a, [invoiceId]: value }));
  }
  function fillInvoice(inv: OutstandingInvoice) {
    setAllocFor(inv.id, Number(inv.outstandingPaise) / 100);
  }

  async function handleSave(e?: FormEvent) {
    e?.preventDefault();
    if (submitting) return;
    if (!vendorId) { setErrors({ summary: "Pick a vendor", fields: {} }); return; }
    if (!form.amount || form.amount <= 0) { setErrors({ summary: "Enter the payment amount", fields: {} }); return; }
    if (allocatedTotal > amount + 1e-6) { setErrors({ summary: "Allocations exceed the payment amount", fields: {} }); return; }

    const allocations = Object.entries(alloc)
      .filter(([, v]) => v && v > 0)
      .map(([vendorInvoiceId, v]) => ({ vendorInvoiceId, poId: null, amount: v }));

    const payload: PaymentCreateInput = {
      companyId: null,
      unitId: null,
      vendorId,
      paymentDate: form.paymentDate,
      method: form.method,
      amount: form.amount,
      reference: form.reference ?? "",
      remarks: form.remarks ?? "",
      allocations,
    };

    const result = validate(paymentCreateSchema, payload);
    if (!result.ok) { setErrors(result.errors); return; }

    setErrors(emptyErrors);
    setSubmitting(true);
    try {
      const pay = await api<{ id: string }>("/api/payments", { method: "POST", body: JSON.stringify(result.data) });
      toast.success("Payment recorded", advance > 0 ? `₹${advance.toFixed(2)} kept as advance / on-account.` : "Allocated to the selected invoices.");
      router.push(`${base}/${pay.id}`);
    } catch (err) {
      setErrors(apiErrorToFormErrors(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormSheet
      title="Record Vendor Payment"
      subtitle="Pay a vendor and allocate it across their open invoices"
      onClose={() => router.push(base)}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push(base)}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSave()} disabled={submitting || !vendorId}>
            {submitting ? "Saving…" : "Record payment"} <Icon name="ArrowRight" size={13} />
          </button>
        </>
      }
    >
      {errors.summary && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} />
          <span className="flex-1">{errors.summary}</span>
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="card p-6 mb-5 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Payment details</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="label">Vendor <span className="text-danger">*</span></label>
              <select className="input" value={vendorId} onChange={(e) => { setVendorId(e.target.value); setAlloc({}); }}>
                <option value="">— Choose vendor —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Payment date <span className="text-danger">*</span></label>
              <input type="date" className="input" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} required />
            </div>
            <div>
              <label className="label">Method <span className="text-danger">*</span></label>
              <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentCreateInput["method"] })}>
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount (₹) <span className="text-danger">*</span></label>
              <input className="input tabular-nums" type="number" step="0.01" min="0" value={form.amount ?? ""} onChange={(e) => setForm({ ...form, amount: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <label className="label">Reference (UTR / cheque no.)</label>
              <input className="input font-mono" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
            <div>
              <label className="label">Remarks</label>
              <input className="input" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-border">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Allocate to invoices</p>
            <p className="text-sm text-muted mt-0.5">Split this payment across the vendor's open bills. Anything left over is kept as an advance.</p>
          </div>
          {!vendorId ? (
            <div className="p-8 text-center text-sm text-muted">Pick a vendor to see their outstanding invoices.</div>
          ) : outstanding.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">No outstanding invoices for this vendor — the full amount will be recorded as an advance.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Invoice</th>
                  <th className="text-left px-5 py-3 font-semibold">Date</th>
                  <th className="text-right px-5 py-3 font-semibold">Outstanding</th>
                  <th className="text-right px-5 py-3 font-semibold w-44">Allocate (₹)</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.map((inv) => {
                  const out = Number(inv.outstandingPaise) / 100;
                  return (
                    <tr key={inv.id} className="border-t border-border">
                      <td className="px-5 py-3 font-mono text-[11px]">{inv.invoiceNumber}</td>
                      <td className="px-5 py-3 text-[11px] text-muted">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-5 py-3 tabular-nums text-right">{paiseToINR(inv.outstandingPaise)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <input
                            className="input !py-1.5 tabular-nums w-28 text-right"
                            type="number"
                            step="0.01"
                            min="0"
                            max={out}
                            value={alloc[inv.id] ?? ""}
                            onChange={(e) => setAllocFor(inv.id, e.target.value ? Number(e.target.value) : 0)}
                          />
                          <button type="button" className="text-[11px] text-primary hover:underline whitespace-nowrap" onClick={() => fillInvoice(inv)}>Full</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface">
                  <td colSpan={2} className="px-5 py-3 text-right font-semibold text-muted">Allocated</td>
                  <td className="px-5 py-3 tabular-nums text-right font-semibold">{paiseToINR(allocatedTotal * 100)}</td>
                  <td className="px-5 py-3" />
                </tr>
                <tr>
                  <td colSpan={2} className={`px-5 py-2 text-right ${advance < -1e-6 ? "text-danger-fg font-semibold" : "text-muted"}`}>
                    {advance < -1e-6 ? "Over-allocated by" : "Advance / on-account"}
                  </td>
                  <td className={`px-5 py-2 tabular-nums text-right ${advance < -1e-6 ? "text-danger-fg font-semibold" : ""}`}>
                    {paiseToINR(Math.abs(advance) * 100)}
                  </td>
                  <td className="px-5 py-2" />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </form>
    </FormSheet>
  );
}
