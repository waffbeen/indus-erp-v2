"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PoStatusBadge } from "@/components/StatusBadge";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { paiseToINR, formatDate, formatDateTime } from "@/lib/format";

interface PortalPo {
  id: string;
  poNumber: string | null;
  title: string;
  status: string;
  totalPaise: string;
  itemsCount: number;
  deliveryDate: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
}
interface PortalRfqRow {
  id: string;
  rfqNumber: string | null;
  title: string;
  status: string;
  dueDate: string | null;
  itemsCount: number;
  hasQuoted: boolean;
  responseTotalPaise: string | null;
  responseSubmittedAt: string | null;
  createdAt: string;
}
interface Dashboard {
  vendor: { id: string; name: string; code: string | null; email: string | null };
  buyer: { name: string };
  pos: PortalPo[];
  rfqs: PortalRfqRow[];
}

interface PortalRfqItem {
  id: string;
  itemName: string;
  description: string | null;
  quantity: number;
  uom: string;
  quotedUnitPrice: number | null;
  quotedDeliveryDays: number | null;
  quotedRemarks: string | null;
}
interface PortalRfqDetail {
  id: string;
  rfqNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  canQuote: boolean;
  items: PortalRfqItem[];
  existingQuote: { remarks: string | null; totalPaise: string; submittedAt: string | null } | null;
}

export default function VendorPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [data, setData] = useState<Dashboard | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [ackingPo, setAckingPo] = useState<string | null>(null);
  const [quoteRfqId, setQuoteRfqId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Dashboard>(`/api/portal/${token}`);
      setData(d);
      setLoadErr(null);
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : "This portal link is invalid or expired");
    }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  async function ackPo(poId: string) {
    setAckingPo(poId);
    try {
      await api(`/api/portal/${token}/po/${poId}/ack`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Order acknowledged", "Thanks — the buyer has been notified");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't acknowledge");
    } finally {
      setAckingPo(null);
    }
  }

  if (loadErr) {
    return (
      <Shell>
        <div className="w-full max-w-md card p-6 text-center mx-auto mt-20">
          <div className="h-12 w-12 mx-auto mb-3 rounded-md grid place-items-center" style={{ background: "var(--tint-blush)", color: "var(--tint-blush-fg)" }}>
            <Icon name="CircleX" size={22} />
          </div>
          <h1 className="text-[15px] font-semibold mb-1">Portal unavailable</h1>
          <p className="text-[12px] text-muted">{loadErr}</p>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return <Shell><div className="text-center text-xs text-muted mt-20">Loading your portal…</div></Shell>;
  }

  const openPos = data.pos;
  const openRfqs = data.rfqs;

  return (
    <Shell>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Vendor identity */}
        <div className="card p-4 mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Supplier</div>
            <div className="text-[16px] font-semibold tracking-tight">{data.vendor.name}</div>
            {data.vendor.code && <div className="text-[11px] text-muted font-mono">{data.vendor.code}</div>}
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted">Buyer</div>
            <div className="text-[13px] font-medium">{data.buyer.name}</div>
          </div>
        </div>

        {/* RFQs */}
        <section className="mb-6">
          <h2 className="text-[13px] font-semibold tracking-tight mb-2 flex items-center gap-1.5">
            <Icon name="GitCompareArrows" size={15} /> Requests for quotation
            <span className="text-muted font-normal">({openRfqs.length})</span>
          </h2>
          {!openRfqs.length ? (
            <div className="card p-6 text-center text-[12px] text-muted">No open RFQs right now.</div>
          ) : (
            <div className="space-y-2">
              {openRfqs.map((r) => (
                <div key={r.id} className="card p-3.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">{r.title}</div>
                    <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5">
                      <span className="font-mono">{r.rfqNumber}</span>
                      <span>· {r.itemsCount} item{r.itemsCount === 1 ? "" : "s"}</span>
                      {r.dueDate && <span>· due {formatDate(r.dueDate)}</span>}
                    </div>
                  </div>
                  {r.hasQuoted ? (
                    <div className="text-right">
                      <div className="badge badge-success text-[10px] mb-1">Quoted {paiseToINR(r.responseTotalPaise)}</div>
                      <button className="btn btn-ghost btn-sm w-full justify-center" onClick={() => setQuoteRfqId(r.id)}>
                        <Icon name="Pencil" size={12} /> Revise
                      </button>
                    </div>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => setQuoteRfqId(r.id)}>
                      <Icon name="Send" size={13} /> Submit quote
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* POs */}
        <section>
          <h2 className="text-[13px] font-semibold tracking-tight mb-2 flex items-center gap-1.5">
            <Icon name="ShoppingCart" size={15} /> Purchase orders
            <span className="text-muted font-normal">({openPos.length})</span>
          </h2>
          {!openPos.length ? (
            <div className="card p-6 text-center text-[12px] text-muted">No purchase orders yet.</div>
          ) : (
            <div className="space-y-2">
              {openPos.map((p) => (
                <div key={p.id} className="card p-3.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate flex items-center gap-2">
                      {p.title} <PoStatusBadge status={p.status} />
                    </div>
                    <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5">
                      <span className="font-mono">{p.poNumber ?? "—"}</span>
                      <span>· {p.itemsCount} item{p.itemsCount === 1 ? "" : "s"}</span>
                      {p.deliveryDate && <span>· delivery {formatDate(p.deliveryDate)}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-semibold tabular-nums">{paiseToINR(p.totalPaise)}</div>
                    {p.acknowledgedAt ? (
                      <div className="text-[10.5px] text-muted flex items-center gap-1 justify-end mt-0.5">
                        <Icon name="CircleCheckBig" size={11} style={{ color: "var(--success)" }} /> Acknowledged
                      </div>
                    ) : (
                      <button className="btn btn-primary btn-sm mt-1" disabled={ackingPo === p.id} onClick={() => ackPo(p.id)}>
                        {ackingPo === p.id ? "…" : <><Icon name="Check" size={12} /> Acknowledge</>}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-center text-[10.5px] text-muted mt-8">
          Powered by Prathvi&apos;s ERP · This is a private supplier link — please don&apos;t share it.
        </p>
      </div>

      {quoteRfqId && (
        <QuoteModal token={token} rfqId={quoteRfqId} onClose={() => setQuoteRfqId(null)} onSubmitted={async () => { setQuoteRfqId(null); await load(); }} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--frame)" }}>
      <div className="border-b border-border" style={{ background: "var(--surface)" }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <div className="h-7 w-7 rounded-md grid place-items-center" style={{ background: "var(--primary)", color: "var(--primary-fg)" }}>
            <Icon name="Flower2" size={15} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight">Supplier Portal</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function QuoteModal({
  token,
  rfqId,
  onClose,
  onSubmitted,
}: {
  token: string;
  rfqId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [rfq, setRfq] = useState<PortalRfqDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [days, setDays] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<PortalRfqDetail>(`/api/portal/${token}/rfq/${rfqId}`)
      .then((d) => {
        setRfq(d);
        const p: Record<string, string> = {};
        const dd: Record<string, string> = {};
        for (const it of d.items) {
          if (it.quotedUnitPrice != null) p[it.id] = String(it.quotedUnitPrice);
          if (it.quotedDeliveryDays != null) dd[it.id] = String(it.quotedDeliveryDays);
        }
        setPrices(p);
        setDays(dd);
        setRemarks(d.existingQuote?.remarks ?? "");
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Couldn't load RFQ"));
  }, [token, rfqId]);

  async function submit() {
    if (!rfq) return;
    const items = rfq.items
      .map((it) => ({ rfqItemId: it.id, unitPrice: Number(prices[it.id]), deliveryDays: days[it.id] ? Number(days[it.id]) : null }))
      .filter((l) => Number.isFinite(l.unitPrice) && l.unitPrice > 0);
    if (!items.length) { toast.error("Enter a price for at least one line"); return; }
    setSubmitting(true);
    try {
      await api(`/api/portal/${token}/rfq/${rfqId}/quote`, {
        method: "POST",
        body: JSON.stringify({ remarks: remarks || null, items }),
      });
      toast.success("Quote submitted", "Thank you — the buyer can now compare it");
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't submit quote");
      setSubmitting(false);
    }
  }

  const estTotal = rfq
    ? rfq.items.reduce((sum, it) => {
        const p = Number(prices[it.id]);
        return sum + (Number.isFinite(p) && p > 0 ? p * it.quantity : 0);
      }, 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-lg card p-0 overflow-hidden" style={{ boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold tracking-tight truncate">{rfq?.title ?? "Submit quote"}</h2>
            {rfq && <p className="text-[11px] text-muted font-mono">{rfq.rfqNumber}</p>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="X" size={15} /></button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {err ? (
            <div className="text-center py-6 text-[12px]">{err}</div>
          ) : !rfq ? (
            <div className="text-center py-6 text-[12px] text-muted">Loading…</div>
          ) : !rfq.canQuote ? (
            <div className="text-center py-6 text-[12px] text-muted">This RFQ is no longer accepting quotes.</div>
          ) : (
            <>
              {rfq.description && <p className="text-[12px] text-muted mb-3 leading-relaxed">{rfq.description}</p>}
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-muted">
                    <th className="text-left font-medium pb-1.5">Item</th>
                    <th className="text-right font-medium pb-1.5 w-28">Unit price ₹</th>
                    <th className="text-right font-medium pb-1.5 w-20">Lead (d)</th>
                  </tr>
                </thead>
                <tbody>
                  {rfq.items.map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="py-2 pr-2">
                        <div className="font-medium">{it.itemName}</div>
                        <div className="text-[10.5px] text-muted">{it.quantity} {it.uom}</div>
                      </td>
                      <td className="py-2">
                        <input type="number" min="0" step="0.01" className="input text-right" placeholder="0.00"
                          value={prices[it.id] ?? ""} onChange={(e) => setPrices((p) => ({ ...p, [it.id]: e.target.value }))} />
                      </td>
                      <td className="py-2 pl-2">
                        <input type="number" min="0" className="input text-right" placeholder="—"
                          value={days[it.id] ?? ""} onChange={(e) => setDays((d) => ({ ...d, [it.id]: e.target.value }))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3">
                <label className="label">Remarks</label>
                <input className="input" placeholder="Validity, terms, anything the buyer should know…" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
              <div className="mt-3 text-right text-[12px] text-muted">
                Est. quote total: <span className="font-semibold text-text-default tabular-nums">{paiseToINR(Math.round(estTotal * 100))}</span>
              </div>
            </>
          )}
        </div>

        {rfq?.canQuote && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>
              {submitting ? "Submitting…" : <>Submit quote <Icon name="Send" size={13} /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
