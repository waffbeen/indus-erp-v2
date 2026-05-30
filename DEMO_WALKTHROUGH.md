# Demo Walkthrough — "the chain" (ye aise chal raha hai)

A 5–7 minute script showing the full procurement-to-pay chain running end to end.
Live app: **https://prathvis-erp.vercel.app**

> Tip: before the demo, log in as an admin → **Settings → Profile → "Load sample
> data"**. This fills the workspace with realistic vendors, items, and a live
> PR → PO chain so every screen has data. (A fresh signup starts empty by design.)

---

## 0. Sign up (the SaaS story) — 30s
- Open **/signup** (incognito). Enter name, workspace, email, password → **Create workspace**.
- *Talking point:* "A new customer self-provisions a complete workspace in seconds —
  company, unit, roles, a 14-day trial, all set up automatically. No onboarding call."

## 1. The chain — Requisition → Approval — 1 min
- Sidebar → **Requisitions**. Show the list (draft / pending / approved).
- Open an approved PR → show line items, the **approval timeline**, who approved.
- *Talking point:* "Anyone raises a requisition; it routes through multi-level
  approval based on amount and role. Full audit trail."

## 2. Purchase Order (GST-native) — 1.5 min
- Sidebar → **Purchase Orders** → open one.
- Show the **CGST/SGST/IGST split**, line items, totals, delivery terms.
- *Talking point:* "Approved PRs convert to POs in two clicks. GST is computed
  correctly — intrastate splits into CGST+SGST, interstate uses IGST. Send to the
  vendor by email straight from here."

## 3. Receive goods (GRN) → Inventory updates — 1 min
- Sidebar → **Goods Receipt** → open / create a GRN against a sent PO.
- Then sidebar → **Inventory** → show stock went up for the received items.
- *Talking point:* "When goods arrive, the GRN posts to the stock ledger
  automatically — inventory is always live, not a spreadsheet."

## 4. Vendor Invoice → 3-way match → Payment — 1.5 min
- Sidebar → **Invoices** → create/open an invoice → show the **3-way match**
  (Invoice ↔ PO ↔ GRN) flagging any price/qty variance.
- Sidebar → **Payments** → record a payment → show **AP aging**.
- *Talking point:* "The invoice is matched against the PO and the receipt before
  payment — catches over-billing and short deliveries. Then it flows to payments
  and accounts-payable aging."

## 5. Insights + AI — 1 min
- Sidebar → **Dashboard**: spend trend, pending approvals, top vendors, KPIs.
- Sidebar → **AI Assistant** → ask *"What did we spend this month and which vendors
  are the biggest?"*
- *Talking point:* "Real-time spend and an AI assistant that answers plain-English
  questions over your own data — read-only and tenant-isolated."

## 6. Make it theirs — 30s
- **Settings → Appearance**: switch layout (Editorial / Floating / Top nav), accent
  colour, light/dark.
- *Talking point:* "Per-workspace look and feel — white-label ready for resellers."

---

### The chain in one line
**Signup → Setup → Masters → PR → Approve → PO → Send → GRN → Stock → Invoice (3-way
match) → Payment → Reports/AI.** Every link is live and connected today.

### Closing
- Multi-tenant SaaS, GST-native, AI-assisted — replacing the legacy VB.NET ERP.
- Pricing: **/pricing** (Free → Starter ₹1,499 → Business ₹4,999 → Enterprise custom).
