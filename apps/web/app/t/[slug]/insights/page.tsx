"use client";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusTabs } from "@/components/ListPrimitives";
import { AnomalyFeed } from "@/components/insights/AnomalyFeed";
import { VendorScorecards } from "@/components/insights/VendorScorecards";
import { Forecasts } from "@/components/insights/Forecasts";
import { InvoiceOcr } from "@/components/insights/InvoiceOcr";

type Tab = "anomalies" | "scorecards" | "forecasts" | "ocr";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "anomalies", label: "Anomaly feed" },
  { key: "scorecards", label: "Vendor scorecards" },
  { key: "forecasts", label: "Demand forecasts" },
  { key: "ocr", label: "Invoice OCR" },
];

const SUBTITLE: Record<Tab, string> = {
  anomalies: "Spend-integrity scan — price spikes, split POs, duplicate invoices & threshold gaming.",
  scorecards: "Supplier performance from your PO & GRN history: on-time, quality, price and lead time.",
  forecasts: "Per-item demand projected from stock movements, with suggested reorder quantities.",
  ocr: "Scan a vendor invoice with AI to prefill the bill — part of Document AI.",
};

export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>("anomalies");

  return (
    <div>
      <PageHeader
        title="Insights"
        subtitle={SUBTITLE[tab]}
      />

      <div className="mb-4">
        <StatusTabs<Tab> tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "anomalies" && <AnomalyFeed />}
      {tab === "scorecards" && <VendorScorecards />}
      {tab === "forecasts" && <Forecasts />}
      {tab === "ocr" && <InvoiceOcr />}
    </div>
  );
}
