# Prathvi's ERP — Product & Engineering Strategy

**Document owner:** Prathvi / Indus Analytics
**Status:** Active roadmap — supersedes the "MVP scope" note in README
**Last updated:** 2026-05-30
**Horizon:** v0.1 (current) → v1.0 (production-grade, multi-tenant SaaS)

> This is the master plan for expanding scope. It is sequenced so the **Thomson
> production rollout** lands first, **SaaS commercialization** layers on top, and
> **demo-ready polish/AI** rides along the way. Read §0 and §4 for the big picture;
> each phase section is the detailed build plan.

---

## Table of contents

0. [Executive summary](#0-executive-summary)
1. [Vision & positioning](#1-vision--positioning)
2. [Current state — honest assessment](#2-current-state--honest-assessment)
3. [Strategic principles](#3-strategic-principles)
4. [Roadmap at a glance](#4-roadmap-at-a-glance)
5. [Phase 0 — Harden the core](#5-phase-0--harden-the-core)
6. [Phase 1 — Close the Procure-to-Pay loop](#6-phase-1--close-the-procure-to-pay-loop)
7. [Phase 2 — Inventory & Warehouse depth](#7-phase-2--inventory--warehouse-depth)
8. [Phase 3 — SaaS commercialization](#8-phase-3--saas-commercialization)
9. [Phase 4 — AI intelligence layer](#9-phase-4--ai-intelligence-layer)
10. [Cross-cutting foundations](#10-cross-cutting-foundations)
11. [Data model additions](#11-data-model-additions)
12. [Sequencing & milestones](#12-sequencing--milestones)
13. [Success metrics](#13-success-metrics)
14. [Risks & mitigations](#14-risks--mitigations)
15. [Immediate next 10 actions](#15-immediate-next-10-actions)

---

## 0. Executive summary

Prathvi's ERP is already **far past MVP**: a clean monorepo with real multi-tenancy,
fine-grained RBAC, a working PR → approval → PO → GRN procurement spine, 27 built
screens, and a themeable design system. The architecture is professional-grade.

The risk is **the gap between "built" and "finished/correct."** Three things undermine the
core today and must be fixed before anything else:

1. **GRN creation isn't transactional** — header, line items, stock movements, PO-status and
   audit are 5+ separate writes with no `db.transaction()`. A partial failure orphans data.
   (Note: stock posting itself *does* work — `recordGrnAcceptances` is called — it's the
   atomicity and the lack of a test that are the problem.)
2. **Type errors are suppressed in the build** (`ignoreBuildErrors`) — e.g. a duplicate
   `purchaseOrders` import in `grn.service.ts` — hiding real bugs in money/auth-critical code.
3. **No tests, no CI** → every change can silently break GST math, approvals, or tenant isolation.

After hardening, we expand in four themes, sequenced by dependency and business value:

| Wave | Phase | Theme | Primary objective served |
|---|---|---|---|
| Now | **P0** Harden core | Reliability | Thomson + all |
| Wave 1 | **P1** Procure-to-Pay | Invoices, payments, returns, GST recon | Thomson production |
| Wave 1 | **P2** Inventory/WMS | Valuation, bins, reorder, cycle count | Thomson production |
| Wave 2 | **P3** SaaS commercialization | Onboarding, billing, plan limits, white-label | Multi-tenant product |
| Wave 2–3 | **P4** AI intelligence | Assistant, recommendations, anomaly, forecast | Differentiation + demo wow |

AI (P4) is deliberately **late but partially pullable-forward**: a natural-language
"ask your ERP" assistant is the single highest-impact demo feature and can ship a thin
version early, while the heavier AI (forecasting, anomaly detection) needs the richer
data that P1/P2 produce.

---

## 1. Vision & positioning

**What it is:** A modern, AI-assisted **Procurement + Inventory ERP** for Indian SMBs and
enterprises, multi-tenant from day one — replacing slow legacy systems like the VB.NET
Estimo Prime app (Thomson client).

**Who it's for (tiered, same codebase):**
- **Single shop / kirana** — 1 company, 1 unit, simple PR→PO→stock.
- **Growing SMB** — multi-unit, approvals, GST compliance, vendor management.
- **Enterprise** — multiple legal companies per tenant, cost centers, CAPEX/AMC, audit & compliance.

**Wedge / differentiation:**
1. **GST-native** — CGST/SGST/IGST split, HSN, e-invoicing, GSTR reconciliation built in (not bolted on).
2. **AI-assisted** — natural-language queries, smart reorder, vendor scoring, anomaly detection.
3. **White-label multi-tenant SaaS** — per-tenant theme/logo/subdomain; sell to many customers from one deploy.
4. **Fast & modern UX** vs. the legacy WebForms experience it replaces.

**Non-goals (for now):** full double-entry accounting/GL, CRM, HR/payroll, manufacturing MES.
We integrate with Tally/Zoho/accounting later rather than rebuild it. (Re-evaluate at v1.0.)

---

## 2. Current state — honest assessment

### What's strong ✅
- **Architecture:** pnpm + Turborepo monorepo; shared Zod schemas FE↔BE (single source of truth); Drizzle ORM with 14 migrations.
- **Security & tenancy:** JWT access/refresh with hash rotation, session tracking, account lockout; `tenant_id` on every business table; fine-grained RBAC `(resource, action, scope)` with `own < unit < company < tenant < global` scope hierarchy.
- **Procurement spine (real logic, not stubs):** PR multi-level approval state machine; PO with full GST split, amendments, delivery schedules, PR→PO conversion; GRN with accept/reject/partial.
- **Money handled correctly:** amounts in paise, quantities scaled — no float drift.
- **Frontend:** 27 screens built with reusable primitives (`AppShell`, `ListPrimitives`, `FormSheet`, status badges); per-tenant themeable design tokens.
- **Data model anticipates the future:** gated modules (`payments`, `capex`, `amc`, `ai_assistant`, `ai_predictions`) and `pricingPlans` / `tenantSubscriptions` tables already exist (not yet enforced).

### Critical gaps 🔴 (must fix — see Phase 0)
| # | Gap | Impact |
|---|---|---|
| 1 | `createGrn` is **not** wrapped in `db.transaction()` (5+ separate writes: header, items, stock, PO-status, audit) | Partial failure → orphaned / inconsistent records |
| 2 | Real type errors **suppressed** by `ignoreBuildErrors` — confirmed: duplicate `purchaseOrders` import in `grn.service.ts` | Bugs hidden in money/auth-critical code |
| 3 | **No tests, no CI** anywhere in repo | GST math / approvals / tenant isolation / GRN→stock can break silently |
| 4 | `mail.service.ts` is an empty stub | Approvals never email anyone (`RESEND_API_KEY` already provisioned) |
| 5 | Stock-on-hand computed in app code with **no regression test** proving GRN→stock is correct | Can't fully trust inventory numbers until covered by a test |
| 6 | Security TODOs open (per `MERE_NOTES`) | Leaked Neon password, default admin pw `ChangeMe!2026`, dev JWT secrets in prod |

### Notable functional gaps (addressed across P1–P2)
- No **vendor invoice / bill** entity → no 3-way match, no AP ledger.
- No **payments** workflow (module gated but unbuilt).
- No **purchase returns / debit notes** (reverse logistics missing entirely).
- No **inventory valuation** (FIFO / weighted-avg costing) and no **bin/location** within a unit.
- No **reorder / min-max** automation; no **cycle count** / physical stock-take flow.
- Batch tracking exists but **no serial-number** tracking, no **expiry/FEFO** alerts.
- Stock on-hand computed in app code (O(n) accumulate) rather than SQL — fine now, revisit at scale.

### Product/SaaS gaps (addressed in P3)
- Onboarding is **invite-only**; no self-serve tenant signup.
- `pricingPlans` / `tenantSubscriptions` exist but **limits aren't enforced** and **no billing integration**.
- White-label theming is scaffolded but **not wired per-tenant**; no custom subdomains.

---

## 3. Strategic principles

These decide trade-offs when the plan meets reality:

1. **Correctness before breadth.** A working procurement loop beats ten half-features. Phase 0 is non-negotiable.
2. **Every transactional write is atomic and audited.** Use `db.transaction()` + `auditLogs` for any multi-row mutation.
3. **Schema-first, shared-Zod-second.** New entity → Drizzle table → migration → shared Zod schema → service → route → screen. Keep the FE↔BE contract single-sourced.
4. **Gate features by module + permission, not by hard-coding.** Reuse the existing module/RBAC system so SaaS plan-gating is "free."
5. **AI augments, never blocks.** AI suggestions are advisory; the deterministic ERP always works without them.
6. **Ship test coverage with each new money-touching feature.** GST, valuation, payments, approvals must have unit tests.
7. **India-first compliance.** GST, e-invoice, TDS, MSME — treat as first-class, not afterthoughts.

---

## 4. Roadmap at a glance

```
P0  Harden core            ██████                          (foundation — do first)
P1  Procure-to-Pay              ████████████               (Thomson money loop)
P2  Inventory / WMS              ██████████████            (Thomson stock truth)
P3  SaaS commercialization                 ████████████    (sell to many)
P4  AI intelligence                    ████  ████████████  (thin early, deep later)
Cross-cutting (tests/CI/mobile/notifications) ───────────  (continuous)
```

Rough relative sizing (AI-assisted solo/small-team weeks — calibrate to your pace):

| Phase | Size | Indicative effort |
|---|---|---|
| P0 Harden core | M | ~1–1.5 weeks |
| P1 Procure-to-Pay | L | ~3–4 weeks |
| P2 Inventory/WMS | L | ~3–4 weeks |
| P3 SaaS commercialization | L | ~3–4 weeks |
| P4 AI intelligence | M→L | ~1 week (thin) + 3+ weeks (deep) |

---

## 5. Phase 0 — Harden the core

**Goal:** Make the existing procurement loop *correct, atomic, observable, and safe to change.*
**Serves:** Thomson rollout + every later phase. **Exit = green build, real inventory, secrets rotated.**

### 5.1 Make the stock loop atomic & proven (highest priority)
- Stock posting already exists (`grn.service.ts` → `stockService.recordGrnAcceptances`); the gap is **atomicity** and **proof**.
- Wrap the whole of `createGrn` (header + line items + stock movements + PO-status refresh + audit) in a **single `db.transaction()`** so a partial failure rolls back cleanly. Do the same for `cancelGrn` (status update + `reverseGrnMovements`).
- Fix the duplicate `purchaseOrders` import in `grn.service.ts` (and any other suppressed type errors) so this file actually type-checks.
- Add an integration test that **proves** it: `PR → PO → GRN → assert inventory on-hand increased by the accepted qty`, and `cancel GRN → assert on-hand returns to prior`.

### 5.2 Wire email delivery
- Implement `mail.service.ts` on **Resend** (`RESEND_API_KEY` already in `.env`).
- Send on: PR submitted (to approvers), PR/PO approved/rejected (to requester), PO sent to vendor, invite created.
- Templated, tenant-branded (logo/name); queue-friendly so a mail failure never blocks the transaction.

### 5.3 Restore type safety & add CI
- Fix the suppressed type errors in `auth.service`, `item.service`, `vendor.service`; then **remove `ignoreBuildErrors`** and `eslint.ignoreDuringBuilds`.
- Add **GitHub Actions**: on PR → `pnpm install` → `typecheck` → `lint` → `test` → `build`. Block merge on red.
- Add a **smoke test** that boots the API and hits `/api/healthz`.

### 5.4 Testing foundation
- Add **Vitest** to `apps/api` and `packages/shared`.
- First tests (the money/logic that must never break): **GST split** (intra vs interstate), **PO totals rollup**, **PR approval state machine**, **stock on-hand calculation**, **tenant isolation** (user from tenant A cannot read tenant B).

### 5.5 Security hardening (from your own `MERE_NOTES` §11)
- Rotate **Neon DB password** (was exposed in chat) and **JWT access/refresh secrets** (generate prod-only).
- Change default admin password; **force password reset on first login**.
- Tighten CORS to production origin only (drop preview URLs); enable HTTPS-only/secure cookies.
- Revoke the old OpenAI key in the legacy app's `Web.config`.
- Add **rate limiting** on `/auth/login` and refresh.

**Exit criteria:** CI green on every PR; receiving a GRN visibly increases inventory; approval emails arrive; no suppressed build errors; secrets rotated.

---

## 6. Phase 1 — Close the Procure-to-Pay loop

**Goal:** Complete the money flow from PO all the way to *paid*, with Indian tax compliance.
**Serves:** Thomson production (this is what makes it a real procurement system, not just an order tracker).
**Theme:** Procure-to-Pay completion.

### 6.1 Vendor Invoice / Bill + 3-way match ⭐ (the keystone)
- New entities: `vendorInvoices` + `vendorInvoiceItems` (link to `po`, `grn`, `vendor`).
- **3-way match**: compare Invoice ↔ PO (price/terms) ↔ GRN (received qty). Flag mismatches (over-bill, qty variance, rate variance) with tolerance from PO line `tolerancePercent`.
- Match status: `matched / price_variance / qty_variance / unmatched`; require approval to pass a variance.
- Capture TDS, round-off; store all in paise.

### 6.2 Payments & Accounts Payable
- Activate the already-gated `payments` module.
- New entities: `payments`, `paymentAllocations` (a payment can settle multiple invoices; an invoice can be paid in parts).
- Support **advance payments** (against PO before invoice), **retention/hold**, payment methods (NEFT/RTGS/cheque/UPI).
- **AP aging report**: outstanding payables by vendor and bucket (0–30/30–60/60–90/90+).
- Payment status rolls up onto invoice and PO.

### 6.3 Purchase Returns & Debit Notes
- New entities: `purchaseReturns` + items, and `debitNotes`.
- Return flow: against a GRN, select rejected/damaged qty → post **reversing stock movements** → generate debit note to vendor.
- Ties into the GRN `condition` (good/damaged/shortage/excess) already captured.

### 6.4 GST compliance pack
- **GST e-invoicing**: generate IRN/QR payload for POs/invoices (mandatory in India above turnover thresholds). Start with a compliant JSON export; wire to an IRP/GSP later.
- **GSTR-2B reconciliation**: import vendor GST data, match against your `vendorInvoices`, flag mismatched/missing ITC.
- HSN-wise tax summary report.

### 6.5 Documents
- Attach files (vendor invoice PDF, quotation, drawings) to PR/PO/GRN/Invoice. Store in object storage (S3/R2/Supabase storage); keep metadata in a `documents` table with polymorphic `resourceType/resourceId`.

**New screens:** Invoices (list/new/detail/match), Payments (list/new/allocation), Purchase Returns, AP Aging report, GST reconciliation, document attachments on existing detail pages.

**Exit criteria:** A buyer can go PO → GRN → enter vendor invoice → 3-way match → record payment → see it on AP aging, all atomic and audited, with GST captured correctly.

---

## 7. Phase 2 — Inventory & Warehouse depth

**Goal:** Make inventory *trustworthy and actionable* — correct valuation, location-aware, self-replenishing.
**Serves:** Thomson production (stores/warehouse teams), and feeds P4 AI (forecasting needs clean stock history).
**Theme:** Inventory / WMS depth.

### 7.1 Inventory valuation
- Implement **costing methods** per tenant/item: **Weighted Average** (default) and **FIFO**.
- Compute moving average cost on each inbound; value issues/consumption at the chosen method.
- **Stock valuation report** (qty × cost) by item/group/unit; closing stock value for a period.

### 7.2 Bin / location tracking (WMS-lite)
- New entities: `storageLocations` (warehouse → zone → rack → bin under a `unit`).
- Add optional `locationId` to `stockMovements`; track on-hand per (item, unit, location, batch).
- Putaway on GRN; pick location on issue. Keep it optional so the kirana tier ignores it.

### 7.3 Reorder automation
- Per-item **min / max / reorder level / safety stock / lead time** (extend `items` or a `itemStockPolicy` table, scoped per unit).
- **Reorder report**: items below reorder level with suggested order qty.
- One-click **auto-generate draft PR** from the reorder list (closes the loop back to procurement).

### 7.4 Stock operations
- **Stock transfer** between units (schema already has `transfer_in/transfer_out`) — build the workflow + in-transit state.
- **Cycle count / physical stock-take**: count sheet → variance vs system → post adjustment (audited, reason-coded).
- **Opening balance** import (schema has `sourceType: 'opening'`).

### 7.5 Batch / serial / expiry
- **Serial number** tracking for serialized items (new `itemSerials` table; capture on GRN, consume on issue).
- **Expiry / FEFO**: expiry alerts dashboard; suggest First-Expiry-First-Out on issue for batch items.

**New screens:** Valuation report, locations master, reorder dashboard, stock transfer, cycle count, serial/expiry views.

**Exit criteria:** On-hand and stock *value* are correct per costing method; goods can be located to a bin; the system proposes reorders and can raise the PR; cycle counts reconcile.

---

## 8. Phase 3 — SaaS commercialization

**Goal:** Turn a single deployment into a product you can sell to many tenants self-serve.
**Serves:** Multi-tenant SaaS objective.
**Theme:** SaaS commercialization. (Reuses the existing module/RBAC/pricing schema — mostly wiring + enforcement.)

### 8.1 Self-serve onboarding
- Public **signup → create tenant → guided setup wizard** (company, GSTIN, first unit, invite team, pick plan).
- Auto-provision: seed default roles, masters (UOM/HSN/terms), enable MVP modules, start trial.
- Replace "invite-only" as the sole entry; keep invites for adding team members.

### 8.2 Billing & subscriptions
- Integrate **Razorpay** (India-first; Stripe optional for global) — subscriptions + webhooks.
- Wire the existing `pricingPlans` / `tenantSubscriptions` tables: trial → active → past_due → cancelled lifecycle.
- **Dunning**: trial-expiry reminders, failed-payment retries, grace period, then read-only/suspend.

### 8.3 Plan-limit enforcement
- Enforce `pricingPlans.limits` (`maxUsers`, `maxCompanies`, `maxUnits`, `storageMB`) at the service layer with friendly upgrade prompts.
- **Module gating per plan**: free/starter/business/enterprise toggle the gated modules (`payments`, `capex`, `amc`, `ai_*`). The infrastructure already exists — connect plan → `tenantModules`.

### 8.4 White-label & multi-tenant routing
- Per-tenant **theme + logo + brand color** (design tokens already support runtime `data-theme`); store on tenant, apply from session.
- **Custom subdomains** (`acme.prathvis-erp.com`) and/or custom domains; middleware resolves tenant from host.
- Branded emails, branded PR/PO/Invoice PDFs.

### 8.5 Admin & operations
- **Super-admin console**: tenant list, suspend/activate, impersonate (audited), usage metrics, MRR.
- Usage metering and a basic **billing/usage dashboard** per tenant.

**Exit criteria:** A stranger can sign up, complete onboarding, hit a plan limit, upgrade via Razorpay, and see their own brand — with no manual ops from you.

---

## 9. Phase 4 — AI intelligence layer

**Goal:** Deliver the "AI-powered" promise — advisory intelligence on top of clean ERP data.
**Serves:** Differentiation + the single best demo moment. **Thin slice ships early; depth follows P1/P2 data.**
**Theme:** AI intelligence. (Activates gated `ai_assistant` / `ai_predictions` modules.)

### 9.1 "Ask your ERP" assistant ⭐ (pull forward — top demo feature)
- Natural-language Q&A over tenant data: *"What did we spend on bearings last quarter?"*, *"Which POs are pending approval over ₹1L?"*, *"Show vendors with falling on-time delivery."*
- Implement as **tool-calling over your existing read APIs** (NL → structured query against dashboard/report endpoints), **strictly tenant-scoped** — the AI may only call APIs as the current user, so RBAC + tenant isolation are enforced for free.
- Use Claude (Anthropic) with the project's existing patterns; cache aggressively. Ship a thin version in Wave 2 for the demo, expand coverage later.

### 9.2 Vendor recommendation & scoring
- Replace aggregate-only `ratingScaled` with a **vendor scorecard**: on-time delivery %, price competitiveness, quality (GRN accept rate), responsiveness — computed from P1/P2 transactional history.
- On PR/PO, **recommend vendors** for an item based on past price/quality/lead-time.

### 9.3 Purchase anomaly / fraud detection
- Flag unusual patterns: price spikes vs last-purchase, split POs to dodge approval thresholds, duplicate invoices, maverick (off-contract) buying, round-number/just-under-limit amounts.
- Surface as a **risk feed** for approvers/admins.

### 9.4 Demand forecasting → smart reorder
- Forecast consumption per item from stock-movement history (seasonality, trend); feed P2 reorder suggestions with **predicted** rather than static min/max.
- Suggested order quantities with confidence.

### 9.5 Document AI (stretch)
- **Invoice/PO OCR**: extract line items from a vendor invoice PDF to pre-fill the invoice entry form (accelerates P1's 3-way match).

**Exit criteria:** The assistant answers real tenant questions safely; vendor scorecards and anomaly flags appear in the procurement flow; reorder suggestions use forecasts.

---

## 10. Cross-cutting foundations

Run continuously, not as a single phase:

- **Testing:** Vitest (api/shared) from P0; Playwright E2E for the golden path (login → PR → PO → GRN → invoice → payment) by end of P1. Target meaningful coverage on money/permission code, not a vanity %.
- **CI/CD:** GitHub Actions (typecheck/lint/test/build) from P0; preview deploys per PR; migration check in CI.
- **Observability:** structured `pino` logs (present) → ship to a log drain; error tracking (Sentry) on web + api; uptime monitor on `/api/healthz` (Render free tier sleeps — add a warm-up ping or move to paid before Thomson go-live).
- **Notifications:** email (P0) → in-app (exists) → **WhatsApp/SMS** (high value in India) for approvals and delivery alerts; user notification preferences.
- **Mobile:** the app is desktop-first. Either (a) make approvals + gate-entry + stock-issue mobile-responsive, or (b) a thin **React Native** app reusing `packages/shared`. Gate-entry and approvals are the killer mobile use-cases (security guard at the gate, manager approving on phone).
- **Performance & scale:** move stock on-hand to a SQL view/materialized rollup; add pagination to list/report endpoints (currently hard-limited); introduce a job queue (Upstash/QStash — `UPSTASH_REDIS_URL` already reserved) for email, e-invoice, forecasts.
- **PDF/Print:** server-side branded PDFs for PR/PO/Invoice (current print pages are browser-print only).
- **Data migration:** plan the Estimo Prime (MSSQL) → Postgres migration for Thomson (masters first: items, vendors, then open POs/stock balances).
- **Docs:** keep README/DEPLOYMENT current; add an architecture decision log; user-facing help for tenant admins.

---

## 11. Data model additions

New tables introduced by the roadmap (Drizzle + shared Zod, following the existing pattern):

| Phase | New tables | Purpose |
|---|---|---|
| P1 | `vendorInvoices`, `vendorInvoiceItems` | Vendor bills + 3-way match |
| P1 | `payments`, `paymentAllocations` | AP payments, advances, allocations |
| P1 | `purchaseReturns`, `purchaseReturnItems`, `debitNotes` | Reverse logistics |
| P1 | `documents` | Polymorphic file attachments |
| P1 | `gstReconciliation` (or report-only) | GSTR-2B match results |
| P2 | `storageLocations` | Warehouse → zone → rack → bin |
| P2 | `itemStockPolicy` | Per-unit min/max/reorder/lead-time |
| P2 | `itemSerials` | Serial-number tracking |
| P2 | `stockCounts`, `stockCountItems` | Cycle count / physical take |
| P4 | `vendorScorecards` (or computed view) | Vendor performance metrics |
| P4 | `aiConversations`, `aiMessages` | Assistant history (tenant-scoped) |
| P4 | `anomalyFlags`, `demandForecasts` | Risk feed + forecasts |

Most of P3 needs **no new tables** — `pricingPlans`, `tenantSubscriptions`, `tenantModules`, `modules` already exist; the work is enforcement + billing webhooks + onboarding.

---

## 12. Sequencing & milestones

| Milestone | Contents | Marks |
|---|---|---|
| **M0 — Solid core** | P0 complete | Safe to build on; Thomson pilot-ready core |
| **M1 — Procure-to-Pay live** | P1 complete | Real money loop; Thomson can run procurement end-to-end |
| **M2 — Inventory truth** | P2 complete | Correct valuation + locations + reorder; stores team onboarded |
| **M2.5 — Demo AI** | P4 §9.1 thin assistant | "Ask your ERP" wow for boss/sales demos |
| **M3 — SaaS launch** | P3 complete | Self-serve signup + billing; sell to second customer |
| **M4 — Intelligent ERP** | P4 deep (§9.2–9.5) | Scorecards, anomaly, forecasting differentiators |

**Recommended order:** P0 → P1 → P2 → (thin AI assistant for demo) → P3 → deep P4.
Rationale: P1+P2 make it *true* for Thomson; the thin AI assistant is cheap demo leverage you
can show at any point after P0; P3 unlocks selling to others; deep AI needs the data P1/P2 create.

---

## 13. Success metrics

- **Reliability:** CI green rate; zero data-integrity incidents (orphans, stock drift); P95 API latency.
- **Thomson rollout:** % of procurement volume on new system vs legacy; time-to-approve a PR; invoice-to-payment cycle time.
- **Inventory:** stock accuracy (cycle-count variance %); stockout incidents; reorder suggestions accepted.
- **SaaS:** self-serve signups, trial→paid conversion, MRR, churn, active tenants.
- **AI:** assistant queries/week, suggestion acceptance rate, anomalies caught that were real.
- **Quality:** test coverage on money/permission modules; open critical bugs.

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Building features on the broken stock loop | **P0 first**, no exceptions |
| GST/e-invoice rules are complex & change | Start with compliant export; integrate a GSP/IRP vendor rather than hand-rolling IRN |
| Render free tier sleeps / cold starts | Warm-up ping now; move API to paid before Thomson go-live |
| Single shared Neon DB for dev+prod (per notes) | Split prod DB; rotate creds (P0); backups |
| No tests → regressions as scope grows | Test-as-you-go on money/permission code; E2E golden path by M1 |
| AI gives wrong/unsafe answers | AI is advisory only; calls go through RBAC-scoped APIs; never let it write without confirmation |
| Scope creep across 4 themes at once | Strict phase gates; don't start P_n+1 until exit criteria of P_n are met |
| Solo/small-team bandwidth | Lean on AI-assisted dev; ship thin vertical slices; the schema already de-risks much of the modeling |

---

## 15. Immediate next 10 actions

A concrete, ordered backlog to start **today** (all Phase 0):

1. Wrap `createGrn` (and `cancelGrn`) in a single `db.transaction()`; fix the duplicate `purchaseOrders` import in `grn.service.ts`.
2. Add Vitest to `apps/api`; write the PR→PO→GRN→stock integration test that proves on-hand increments (and reverses on cancel).
4. Add unit tests for GST split + PO total rollup.
5. Implement `mail.service.ts` on Resend; send PR-submitted + approval emails.
6. Fix the suppressed type errors in `auth/item/vendor` services; remove `ignoreBuildErrors`.
7. Add GitHub Actions CI (install → typecheck → lint → test → build), block-on-red.
8. Rotate Neon password + JWT secrets; force admin password reset; revoke legacy OpenAI key.
9. Tighten CORS to prod origin; add login rate limiting; enable secure cookies.
10. Split a dedicated **production** Neon database from dev; verify migrations apply cleanly in CI.

> After these ten, M0 is reached and we begin Phase 1 (vendor invoice + 3-way match) — the
> keystone that turns this from an order tracker into a real procurement-to-pay ERP.

---

*This is a living document. Update phase status as milestones land; treat exit criteria as the
definition of done before advancing.*
