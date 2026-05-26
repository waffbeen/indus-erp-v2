"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { paiseToINR, formatDate } from "@/lib/format";

interface PoItem {
  id: string;
  itemName: string;
  description: string | null;
  hsnCode: string | null;
  quantityScaled: number;
  uom: string;
  unitPricePaise: string;
  discountPercent: number;
  taxRate: number;
  totalPaise: string;
}

interface PoDetail {
  id: string;
  poNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  isInterstate: boolean;
  placeOfSupply: string | null;
  subtotalPaise: string;
  discountTotalPaise: string;
  taxableAmountPaise: string;
  cgstTotalPaise: string;
  sgstTotalPaise: string;
  igstTotalPaise: string;
  freightChargesPaise: string;
  otherChargesPaise: string;
  roundOffPaise: string;
  totalPaise: string;
  deliveryDate: string | null;
  validUntil: string | null;
  deliveryAddress: string | null;
  deliveryTerms: string | null;
  paymentTerms: string | null;
  termsAndConditions: string | null;
  poType: string | null;
  creditPeriodDays: number | null;
  insuranceTerms: string | null;
  penaltyTerms: string | null;
  packingTerms: string | null;
  createdAt: string;
  items: PoItem[];
  vendor?: { id: string; name: string; gstin: string | null; email: string | null; phone: string | null };
  company?: { id: string; name: string };
  unit?: { id: string; name: string; code: string | null };
  additionalCharges: Array<{ id: string; label: string; amountPaise: string }>;
}

export default function PoPrintPage() {
  const params = useParams<{ slug: string; id: string }>();
  const [po, setPo] = useState<PoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    api<PoDetail>(`/api/po/${params.id}`)
      .then((data) => {
        setPo(data);
        // Auto-trigger print dialog after a short delay so the page renders first
        setTimeout(() => window.print(), 400);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load"));
  }, [params?.id]);

  if (error) return <div className="p-8 text-center text-sm text-danger-fg">{error}</div>;
  if (!po) return <div className="p-8 text-center text-sm text-muted">Loading…</div>;

  return (
    <div className="print-doc max-w-[210mm] mx-auto bg-white" style={{ minHeight: "100vh", padding: "16mm 14mm", color: "#111" }}>
      {/* LETTERHEAD */}
      <div className="flex items-start justify-between border-b-2 pb-3 mb-4" style={{ borderColor: "#111" }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 grid place-items-center rounded" style={{ background: "#2F5C68", color: "#fff" }}>
              <span className="text-xs font-bold">P</span>
            </div>
            <div>
              <p className="text-[15px] font-bold leading-tight">{po.company?.name ?? "Company"}</p>
              {po.unit && <p className="text-[11px] text-gray-600 leading-tight">{po.unit.name}{po.unit.code ? ` · ${po.unit.code}` : ""}</p>}
            </div>
          </div>
          <p className="text-[10px] text-gray-600">Powered by Prathvi's ERP</p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-bold tracking-tight uppercase">Purchase Order</p>
          <p className="text-[12px] font-mono mt-0.5">{po.poNumber ?? "DRAFT"}</p>
          <p className="text-[10px] text-gray-600 mt-1">
            Dated <strong>{formatDate(po.createdAt)}</strong>
            {po.validUntil && <> · Valid till <strong>{formatDate(po.validUntil)}</strong></>}
          </p>
        </div>
      </div>

      {/* SUPPLIER + DELIVERY */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border p-2.5 rounded" style={{ borderColor: "#ddd" }}>
          <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Supplier</p>
          <p className="text-[13px] font-bold leading-tight">{po.vendor?.name ?? "—"}</p>
          {po.vendor?.gstin && <p className="text-[10px] font-mono text-gray-700 mt-0.5">GSTIN: {po.vendor.gstin}</p>}
          {po.vendor?.phone && <p className="text-[10px] text-gray-700">Tel: {po.vendor.phone}</p>}
          {po.vendor?.email && <p className="text-[10px] text-gray-700">{po.vendor.email}</p>}
        </div>
        <div className="border p-2.5 rounded" style={{ borderColor: "#ddd" }}>
          <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Ship to</p>
          <p className="text-[12.5px] font-semibold leading-tight">{po.unit?.name ?? po.company?.name}</p>
          {po.deliveryAddress && <p className="text-[10.5px] text-gray-700 leading-snug mt-0.5">{po.deliveryAddress}</p>}
          <p className="text-[10px] text-gray-700 mt-1">
            {po.deliveryDate && <>Expected: <strong>{formatDate(po.deliveryDate)}</strong></>}
            {po.placeOfSupply && <> · Place of supply: <strong>{po.placeOfSupply}</strong></>}
          </p>
        </div>
      </div>

      {/* META BAR */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[10.5px]" style={{ color: "#444" }}>
        {po.poType && <span>PO Type: <strong className="text-black">{po.poType.replace("_", " ")}</strong></span>}
        {po.paymentTerms && <span>Payment: <strong className="text-black">{po.paymentTerms}</strong></span>}
        {po.deliveryTerms && <span>Delivery: <strong className="text-black">{po.deliveryTerms}</strong></span>}
        {po.creditPeriodDays != null && <span>Credit: <strong className="text-black">{po.creditPeriodDays} days</strong></span>}
        <span>GST: <strong className="text-black">{po.isInterstate ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"}</strong></span>
      </div>

      {/* ITEMS TABLE */}
      <table className="w-full text-[11px] border" style={{ borderColor: "#bbb" }}>
        <thead>
          <tr style={{ background: "#f0f0f0", color: "#222" }}>
            <th className="text-left px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 24 }}>#</th>
            <th className="text-left px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb" }}>Item Description</th>
            <th className="text-left px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 60 }}>HSN</th>
            <th className="text-right px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 50 }}>Qty</th>
            <th className="text-left px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 40 }}>UoM</th>
            <th className="text-right px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 70 }}>Rate</th>
            <th className="text-right px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 40 }}>Disc%</th>
            <th className="text-right px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 40 }}>GST%</th>
            <th className="text-right px-1.5 py-1.5 font-bold" style={{ width: 80 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {po.items.map((it, idx) => (
            <tr key={it.id} className="border-t" style={{ borderColor: "#ddd" }}>
              <td className="px-1.5 py-1 border-r text-gray-600" style={{ borderColor: "#ddd" }}>{idx + 1}</td>
              <td className="px-1.5 py-1 border-r" style={{ borderColor: "#ddd" }}>
                <p className="font-semibold">{it.itemName}</p>
                {it.description && <p className="text-[9.5px] text-gray-600">{it.description}</p>}
              </td>
              <td className="px-1.5 py-1 border-r font-mono text-[9.5px]" style={{ borderColor: "#ddd" }}>{it.hsnCode ?? "—"}</td>
              <td className="px-1.5 py-1 border-r text-right tabular-nums" style={{ borderColor: "#ddd" }}>{(it.quantityScaled / 1000).toLocaleString("en-IN")}</td>
              <td className="px-1.5 py-1 border-r font-mono text-[9.5px]" style={{ borderColor: "#ddd" }}>{it.uom}</td>
              <td className="px-1.5 py-1 border-r text-right tabular-nums" style={{ borderColor: "#ddd" }}>{paiseToINR(it.unitPricePaise)}</td>
              <td className="px-1.5 py-1 border-r text-right tabular-nums" style={{ borderColor: "#ddd" }}>{it.discountPercent || "—"}</td>
              <td className="px-1.5 py-1 border-r text-right tabular-nums" style={{ borderColor: "#ddd" }}>{it.taxRate}%</td>
              <td className="px-1.5 py-1 text-right tabular-nums font-semibold">{paiseToINR(it.totalPaise)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2" style={{ borderColor: "#bbb" }}>
            <td colSpan={8} className="px-1.5 py-1 text-right">Subtotal</td>
            <td className="px-1.5 py-1 text-right tabular-nums">{paiseToINR(po.subtotalPaise)}</td>
          </tr>
          {Number(po.discountTotalPaise) > 0 && (
            <tr><td colSpan={8} className="px-1.5 py-1 text-right">Less: Discount</td><td className="px-1.5 py-1 text-right tabular-nums">− {paiseToINR(po.discountTotalPaise)}</td></tr>
          )}
          <tr><td colSpan={8} className="px-1.5 py-1 text-right">Taxable Amount</td><td className="px-1.5 py-1 text-right tabular-nums font-semibold">{paiseToINR(po.taxableAmountPaise)}</td></tr>
          {po.isInterstate ? (
            <tr><td colSpan={8} className="px-1.5 py-1 text-right">IGST</td><td className="px-1.5 py-1 text-right tabular-nums">{paiseToINR(po.igstTotalPaise)}</td></tr>
          ) : (
            <>
              <tr><td colSpan={8} className="px-1.5 py-1 text-right">CGST</td><td className="px-1.5 py-1 text-right tabular-nums">{paiseToINR(po.cgstTotalPaise)}</td></tr>
              <tr><td colSpan={8} className="px-1.5 py-1 text-right">SGST</td><td className="px-1.5 py-1 text-right tabular-nums">{paiseToINR(po.sgstTotalPaise)}</td></tr>
            </>
          )}
          {Number(po.freightChargesPaise) > 0 && <tr><td colSpan={8} className="px-1.5 py-1 text-right">Freight</td><td className="px-1.5 py-1 text-right tabular-nums">{paiseToINR(po.freightChargesPaise)}</td></tr>}
          {Number(po.otherChargesPaise) > 0 && <tr><td colSpan={8} className="px-1.5 py-1 text-right">Other Charges</td><td className="px-1.5 py-1 text-right tabular-nums">{paiseToINR(po.otherChargesPaise)}</td></tr>}
          {po.additionalCharges.map((c) => (
            <tr key={c.id}><td colSpan={8} className="px-1.5 py-1 text-right">{c.label}</td><td className="px-1.5 py-1 text-right tabular-nums">{paiseToINR(c.amountPaise)}</td></tr>
          ))}
          {Number(po.roundOffPaise) !== 0 && <tr><td colSpan={8} className="px-1.5 py-1 text-right">Round-off</td><td className="px-1.5 py-1 text-right tabular-nums">{paiseToINR(po.roundOffPaise)}</td></tr>}
          <tr style={{ background: "#f0f0f0" }} className="border-t-2 font-bold" >
            <td colSpan={8} className="px-1.5 py-1.5 text-right">Grand Total</td>
            <td className="px-1.5 py-1.5 text-right tabular-nums">{paiseToINR(po.totalPaise)}</td>
          </tr>
        </tfoot>
      </table>

      {/* CLAUSES */}
      {(po.insuranceTerms || po.penaltyTerms || po.packingTerms || po.termsAndConditions) && (
        <div className="mt-4 text-[10px] space-y-1.5 leading-snug">
          {po.insuranceTerms && (<p><strong>Insurance:</strong> <span style={{ color: "#444" }}>{po.insuranceTerms}</span></p>)}
          {po.penaltyTerms && (<p><strong>Penalty / LD:</strong> <span style={{ color: "#444" }}>{po.penaltyTerms}</span></p>)}
          {po.packingTerms && (<p><strong>Packing:</strong> <span style={{ color: "#444" }}>{po.packingTerms}</span></p>)}
          {po.termsAndConditions && (<p className="whitespace-pre-wrap"><strong>Terms & Conditions:</strong> <span style={{ color: "#444" }}>{po.termsAndConditions}</span></p>)}
        </div>
      )}

      {/* SIGNATURE */}
      <div className="mt-10 grid grid-cols-3 gap-6 text-[10px]" style={{ color: "#444" }}>
        <div className="text-center">
          <div className="border-t pt-1 mt-8" style={{ borderColor: "#333" }}>Prepared By</div>
        </div>
        <div className="text-center">
          <div className="border-t pt-1 mt-8" style={{ borderColor: "#333" }}>Checked By</div>
        </div>
        <div className="text-center">
          <div className="border-t pt-1 mt-8" style={{ borderColor: "#333" }}>Authorised Signatory</div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="mt-6 pt-2 border-t text-[9px] text-gray-500 text-center" style={{ borderColor: "#ddd" }}>
        This is a system-generated Purchase Order from Prathvi's ERP. {po.poNumber ?? "Draft"} · {formatDate(po.createdAt)}
      </div>
    </div>
  );
}
