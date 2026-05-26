"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { paiseToINR, formatDate } from "@/lib/format";

interface PrItem {
  id: string;
  itemName: string;
  description: string | null;
  hsnCode: string | null;
  quantityScaled: number;
  uom: string;
  estimatedUnitPricePaise: string | null;
  estimatedTotalPaise: string;
  itemNarration: string | null;
}

interface PrDetail {
  id: string;
  prNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  prType: string;
  referenceNo: string | null;
  priority: string;
  estimatedTotalPaise: string;
  neededBy: string | null;
  createdAt: string;
  items: PrItem[];
  requester: { id: string; fullName: string; email: string } | undefined;
  company: { id: string; name: string } | undefined;
  unit: { id: string; name: string; code: string | null } | undefined;
}

export default function PrPrintPage() {
  const params = useParams<{ slug: string; id: string }>();
  const [pr, setPr] = useState<PrDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    api<PrDetail>(`/api/pr/${params.id}`)
      .then((data) => {
        setPr(data);
        setTimeout(() => window.print(), 400);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load"));
  }, [params?.id]);

  if (error) return <div className="p-8 text-center text-sm text-danger-fg">{error}</div>;
  if (!pr) return <div className="p-8 text-center text-sm text-muted">Loading…</div>;

  return (
    <div className="print-doc max-w-[210mm] mx-auto bg-white" style={{ minHeight: "100vh", padding: "16mm 14mm", color: "#111" }}>
      <div className="flex items-start justify-between border-b-2 pb-3 mb-4" style={{ borderColor: "#111" }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 grid place-items-center rounded" style={{ background: "#2F5C68", color: "#fff" }}>
              <span className="text-xs font-bold">P</span>
            </div>
            <div>
              <p className="text-[15px] font-bold leading-tight">{pr.company?.name ?? "Company"}</p>
              {pr.unit && <p className="text-[11px] text-gray-600 leading-tight">{pr.unit.name}{pr.unit.code ? ` · ${pr.unit.code}` : ""}</p>}
            </div>
          </div>
          <p className="text-[10px] text-gray-600">Powered by Prathvi's ERP</p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-bold tracking-tight uppercase">Purchase Requisition</p>
          <p className="text-[12px] font-mono mt-0.5">{pr.prNumber ?? "DRAFT"}</p>
          <p className="text-[10px] text-gray-600 mt-1">
            Dated <strong>{formatDate(pr.createdAt)}</strong>
            {pr.neededBy && <> · Needed by <strong>{formatDate(pr.neededBy)}</strong></>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4 text-[10.5px]">
        <div className="border p-2.5 rounded" style={{ borderColor: "#ddd" }}>
          <p className="text-[9.5px] uppercase tracking-wider text-gray-600 mb-1">Requester</p>
          <p className="font-bold leading-tight">{pr.requester?.fullName ?? "—"}</p>
          {pr.requester?.email && <p className="text-[9.5px] text-gray-700 mt-0.5">{pr.requester.email}</p>}
        </div>
        <div className="border p-2.5 rounded" style={{ borderColor: "#ddd" }}>
          <p className="text-[9.5px] uppercase tracking-wider text-gray-600 mb-1">PR Type</p>
          <p className="font-bold capitalize leading-tight">{(pr.prType || "stock").replace("_", " ")}</p>
          <p className="text-[9.5px] text-gray-700 mt-0.5">Priority: <strong className="capitalize text-black">{pr.priority}</strong></p>
        </div>
        <div className="border p-2.5 rounded" style={{ borderColor: "#ddd" }}>
          <p className="text-[9.5px] uppercase tracking-wider text-gray-600 mb-1">Reference</p>
          <p className="font-bold font-mono leading-tight">{pr.referenceNo ?? "—"}</p>
        </div>
      </div>

      {pr.description && (
        <div className="mb-3">
          <p className="text-[9.5px] uppercase tracking-wider text-gray-600 mb-0.5">Justification</p>
          <p className="text-[10.5px] whitespace-pre-wrap leading-snug">{pr.description}</p>
        </div>
      )}

      <table className="w-full text-[11px] border" style={{ borderColor: "#bbb" }}>
        <thead>
          <tr style={{ background: "#f0f0f0", color: "#222" }}>
            <th className="text-left px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 24 }}>#</th>
            <th className="text-left px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb" }}>Item Description</th>
            <th className="text-left px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 60 }}>HSN</th>
            <th className="text-right px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 50 }}>Qty</th>
            <th className="text-left px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 40 }}>UoM</th>
            <th className="text-right px-1.5 py-1.5 border-r font-bold" style={{ borderColor: "#bbb", width: 80 }}>Est. Rate</th>
            <th className="text-right px-1.5 py-1.5 font-bold" style={{ width: 80 }}>Est. Amount</th>
          </tr>
        </thead>
        <tbody>
          {pr.items.map((it, idx) => (
            <tr key={it.id} className="border-t" style={{ borderColor: "#ddd" }}>
              <td className="px-1.5 py-1 border-r text-gray-600" style={{ borderColor: "#ddd" }}>{idx + 1}</td>
              <td className="px-1.5 py-1 border-r" style={{ borderColor: "#ddd" }}>
                <p className="font-semibold">{it.itemName}</p>
                {it.description && <p className="text-[9.5px] text-gray-600">{it.description}</p>}
                {it.itemNarration && <p className="text-[9.5px] text-gray-600 italic">Note: {it.itemNarration}</p>}
              </td>
              <td className="px-1.5 py-1 border-r font-mono text-[9.5px]" style={{ borderColor: "#ddd" }}>{it.hsnCode ?? "—"}</td>
              <td className="px-1.5 py-1 border-r text-right tabular-nums" style={{ borderColor: "#ddd" }}>{(it.quantityScaled / 1000).toLocaleString("en-IN")}</td>
              <td className="px-1.5 py-1 border-r font-mono text-[9.5px]" style={{ borderColor: "#ddd" }}>{it.uom}</td>
              <td className="px-1.5 py-1 border-r text-right tabular-nums" style={{ borderColor: "#ddd" }}>{it.estimatedUnitPricePaise ? paiseToINR(it.estimatedUnitPricePaise) : "—"}</td>
              <td className="px-1.5 py-1 text-right tabular-nums font-semibold">{paiseToINR(it.estimatedTotalPaise)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-bold" style={{ borderColor: "#bbb", background: "#f0f0f0" }}>
            <td colSpan={6} className="px-1.5 py-1.5 text-right">Estimated Total</td>
            <td className="px-1.5 py-1.5 text-right tabular-nums">{paiseToINR(pr.estimatedTotalPaise)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-10 grid grid-cols-3 gap-6 text-[10px]" style={{ color: "#444" }}>
        <div className="text-center"><div className="border-t pt-1 mt-8" style={{ borderColor: "#333" }}>Requested By</div></div>
        <div className="text-center"><div className="border-t pt-1 mt-8" style={{ borderColor: "#333" }}>Approved By (L1)</div></div>
        <div className="text-center"><div className="border-t pt-1 mt-8" style={{ borderColor: "#333" }}>Approved By (L2)</div></div>
      </div>

      <div className="mt-6 pt-2 border-t text-[9px] text-gray-500 text-center" style={{ borderColor: "#ddd" }}>
        This is a system-generated Purchase Requisition from Prathvi's ERP. {pr.prNumber ?? "Draft"} · {formatDate(pr.createdAt)}
      </div>
    </div>
  );
}
