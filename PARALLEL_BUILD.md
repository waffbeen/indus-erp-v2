# Parallel Build Plan — 5 simultaneous tabs

This splits the roadmap (`STRATEGY.md`) into **5 independent workstreams** you can run at
the same time in 5 Claude Code tabs, all on this one repo, with **minimal collisions**.

## How to use this file

1. Read **§ Golden Rules** below once (these rules are also embedded in each prompt).
2. Open **5 tabs** in the same project folder.
3. Paste **Prompt 1 → Tab 1**, **Prompt 2 → Tab 2**, … **Prompt 5 → Tab 5**.
4. Let them run. They will create code but **will NOT** install deps, generate migrations,
   or edit the lockfile/seed — those are deferred to avoid conflicts.
5. When all 5 are done, run the **§ Consolidation** steps at the bottom (one time).

### Why this is collision-safe (the key idea)

- Each tab **owns a disjoint set of NEW files** (its own schema/service/route/screen files).
- The only files multiple tabs touch are 3–4 tiny **"registry" barrels** — and they only
  **append one line**, re-reading the file immediately before editing.
- Nobody runs `pnpm install`, `db:generate`, `db:migrate`, or edits `package.json` deps,
  `pnpm-lock.yaml`, or `seed.ts`. All of that is done **once** in Consolidation.

---

## § Golden Rules (every tab obeys these)

```
GLOBAL COORDINATION RULES — this repo is being edited by 5 agents at once.

1. STAY IN YOUR LANE. Only create/edit the files in your "YOU OWN" list. Never edit
   files in another tab's lane or anything in the "DO NOT TOUCH" list.

2. SHARED REGISTRY FILES — append only. These four files may be edited by several tabs:
     - apps/api/src/db/schema/index.ts        (add: export * from "./your_table")
     - apps/api/src/routes/index.ts           (add import + apiRouter.use("/your", yourRoutes))
     - packages/shared/src/schemas/index.ts   (add: export * from "./your-schema")
     - packages/shared/src/constants/modules.ts (only if your task says so)
   Before editing any of these: RE-READ the file, then add ONLY your one/two lines at the
   end of the relevant list. Do not reorder, reformat, or remove other lines. If an Edit
   fails because the file changed, re-read and re-apply just your line.

3. DO NOT RUN any of these (they cause cross-tab conflicts; Consolidation handles them):
     - pnpm install / pnpm add        (do NOT add deps to package.json either)
     - pnpm db:generate / db:migrate / db:push
     - anything that rewrites pnpm-lock.yaml
     - edits to apps/api/src/db/seed.ts
   If your code needs a new npm package, DO NOT install it — just write the import and add a
   line "NEEDS DEP: <pkg>" to the file PARALLEL_BUILD_NOTES.md (create/append, it's append-only).

4. FOLLOW EXISTING PATTERNS. Mirror the style of the example files named in your prompt
   (schema, service, route, screen). Money = paise (integer, often stored as text);
   quantities = scaled ×1000. Every business table has tenantId + soft-delete (deletedAt).
   Every list/query MUST filter by tenantId. Wrap multi-row writes in db.transaction().

5. SELF-CHECK, don't over-verify. You may run: pnpm --filter @indus/api typecheck (or web).
   New-dependency imports may not type-check until Consolidation installs them — that's OK,
   note them per rule 3 and continue. Do NOT run the dev server or migrations.

6. SCOPE DISCIPLINE. Build exactly what your prompt asks. Do not "improve" unrelated code,
   refactor shared files, or touch another lane. Leave a short summary of what you built.
```

---

## Prompt 1 → Tab 1 — Core Hardening & Backend Integrity (Phase 0)

```
You are working in the "Prathvi's ERP" monorepo (indus-erp-v2): a multi-tenant procurement
+ inventory SaaS. Stack: Next.js 14 (apps/web) + Express/Drizzle/Postgres (apps/api) +
shared Zod (packages/shared), pnpm + Turborepo. FIRST read STRATEGY.md (§2, §5) and the
"§ Golden Rules" section of PARALLEL_BUILD.md, and OBEY those rules — 4 other agents are
editing this repo at the same time.

YOUR MISSION (Phase 0 — make the existing backend correct, atomic, safe, observable):

A. GRN atomicity + type fix (highest priority)
   - apps/api/src/services/grn.service.ts has a DUPLICATE import of `purchaseOrders`
     (imported on ~line 4 with poItems, and again on ~line 12). Remove the duplicate.
   - Wrap the body of createGrn() in a single db.transaction(): the grns insert, the
     grnItems insert, poService.refreshPoReceivedStatus, stockService.recordGrnAcceptances,
     and the auditLogs insert must all commit or roll back together. (Keep the existing
     stock posting — it already works; you are making it atomic.) Notifications/email may
     stay outside the transaction (a mail failure must not roll back a receipt).
   - Wrap cancelGrn() similarly (status update + reverseGrnMovements + audit) in one tx.

B. Restore type safety
   - Run: pnpm --filter @indus/api typecheck. Fix EVERY error it reports (start with
     auth.service.ts, item.service.ts, vendor.service.ts, grn.service.ts). Do not silence
     with `any` unless truly unavoidable — fix the real type.
   - In apps/web/next.config.mjs, find typescript.ignoreBuildErrors and
     eslint.ignoreDuringBuilds. Leave a clear TODO comment that these should be removed once
     web also type-checks clean, but DO NOT flip them yet (web may not compile until other
     tabs finish). Only remove ignoreBuildErrors if `pnpm --filter @indus/web typecheck`
     is already clean.

C. Email delivery (Resend)
   - Implement apps/api/src/services/mail.service.ts using Resend. RESEND_API_KEY is in
     .env (if missing, read .env.example). Export an async sendMail({to, subject, html})
     that no-ops gracefully (logs a warn) when the key is absent, so dev without a key
     still works. Make all sends fire-and-forget (never throw into the caller).
   - Wire emails at the existing notification points in pr.service.ts and po.service.ts:
     PR submitted -> email approvers; PR/PO approved or rejected -> email the requester;
     PO sent to vendor -> email the PO creator. Reuse the data already gathered there.
     Keep it simple HTML; include the resource number and a link placeholder.

D. Security hardening (apps/api)
   - In app.ts / middleware: tighten CORS to read allowed origins from env (WEB_ORIGIN),
     not a wildcard. Add login rate limiting on POST /auth/login (e.g. express-rate-limit
     style or a small in-memory limiter — NEEDS DEP: express-rate-limit, note it, do not
     install). Ensure any auth cookies use httpOnly + secure + sameSite in production.
   - Add a short SECURITY_TODO.md at repo root listing the ops tasks that can't be done in
     code (rotate Neon password, rotate JWT secrets, change default admin password, split
     prod DB) — these are from MERE_NOTES §11. Do not put secrets in it.

YOU OWN (create/edit only these):
   apps/api/src/services/grn.service.ts, stock.service.ts, mail.service.ts,
   pr.service.ts, po.service.ts, auth.service.ts, item.service.ts, vendor.service.ts
   apps/api/src/app.ts, apps/api/src/middleware/*, apps/api/src/config/env.ts
   apps/web/next.config.mjs
   New files: SECURITY_TODO.md (root)

DO NOT TOUCH: any db/schema files, any NEW domain files (invoices, payments, inventory
   extras, ai), routes/index.ts beyond what already exists, seed.ts, package.json, lockfile.

DONE WHEN: pnpm --filter @indus/api typecheck is clean; createGrn/cancelGrn are
   transactional; mail.service is implemented and wired; CORS+rate-limit+cookie flags done;
   SECURITY_TODO.md written. Summarize what changed and list any NEEDS DEP notes.
```

---

## Prompt 2 → Tab 2 — Tests, CI & DevEx (Phase 0 foundation)

```
You are in the "Prathvi's ERP" monorepo (indus-erp-v2): Next.js + Express/Drizzle/Postgres
+ shared Zod, pnpm + Turborepo. FIRST read STRATEGY.md (§5.4, §10) and the "§ Golden Rules"
section of PARALLEL_BUILD.md and OBEY them — 4 other agents edit this repo simultaneously.

YOUR MISSION: stand up the testing + CI foundation. Test BEHAVIOR via public function
signatures (other tabs are changing internals, so don't assert on private details).

A. Test runner
   - Add Vitest config for apps/api (vitest.config.ts) and packages/shared (vitest.config.ts).
     NEEDS DEP: vitest (do NOT install — note it per Golden Rule 3). Add a "test" script to
     a NEW file PARALLEL_BUILD_NOTES.md describing the exact package.json script lines you
     want added in Consolidation (since you must not edit package.json). Do not edit
     package.json or turbo.json yourself.

B. Unit tests (packages/shared and apps/api) — create *.test.ts files only:
   - GST split: given line items + isInterstate flag, CGST+SGST (intra) vs IGST (inter)
     compute correctly and sum to the tax total. Find the PO tax/calc logic in
     apps/api/src/services/po.service.ts (or shared) and test it. If the calc is inlined and
     hard to import, extract a PURE helper into a NEW file apps/api/src/lib/po-math.ts and
     have your test cover that helper (do not rewrite po.service — only move/extract math if
     needed, and if it conflicts, instead test through whatever is already exported).
   - PR approval state machine: valid transitions (draft->submitted->pending_l1->...->approved;
     reject/cancel from allowed states) and that invalid transitions are refused.
   - Stock on-hand: feed a sequence of movements (in/out) and assert getStockByItem-style
     aggregation nets correctly (test the pure summation logic; mock or test the helper).
   - Tenant isolation guard: a query scoped to tenant A must never return tenant B rows
     (test the helper/middleware that injects tenantId).

C. Integration test (the keystone): PR -> PO -> GRN -> assert inventory on-hand increased by
   the accepted qty; then cancel GRN -> assert on-hand returns to prior. Use a test DB or an
   in-memory/SQLite-style harness if available; if a live DB is required, write the test and
   mark it describe.skip with a clear comment so CI doesn't need a DB yet. Document in
   PARALLEL_BUILD_NOTES.md what env the integration test needs.

D. CI
   - Create .github/workflows/ci.yml: on pull_request + push to main, run
     corepack enable -> pnpm install --frozen-lockfile -> pnpm typecheck -> pnpm lint ->
     pnpm build (and `pnpm test` once the script exists). Use Node 20, pnpm 9.15.0
     (matches packageManager). Make `test` non-blocking (continue-on-error) for now if you
     are unsure tests pass, with a TODO to make it blocking after Consolidation.

E. Observability note (no install): write a short section in PARALLEL_BUILD_NOTES.md
   recommending Sentry on web+api and an uptime ping for Render's sleeping free tier.

YOU OWN: vitest.config.ts (apps/api, packages/shared), all NEW *.test.ts files,
   apps/api/src/lib/po-math.ts (only if extraction is needed), .github/workflows/ci.yml,
   PARALLEL_BUILD_NOTES.md (append-only, shared with other tabs' notes).

DO NOT TOUCH: service implementations (Tab 1 owns them), schema files, routes, package.json,
   turbo.json, lockfile, any other tab's new files.

DONE WHEN: vitest config + the four unit test suites + the integration test (skipped if it
   needs a DB) + ci.yml exist, and PARALLEL_BUILD_NOTES.md lists the package.json/turbo
   script changes and NEEDS DEP: vitest. Summarize coverage.
```

---

## Prompt 3 → Tab 3 — Procure-to-Pay: Vendor Invoices + 3-way Match + Payments + AP (Phase 1)

```
You are in the "Prathvi's ERP" monorepo (indus-erp-v2): Next.js (apps/web) + Express/
Drizzle/Postgres (apps/api) + shared Zod (packages/shared). FIRST read STRATEGY.md (§6) and
the "§ Golden Rules" of PARALLEL_BUILD.md and OBEY them — 4 other agents edit this repo now.
Study these as your PATTERN templates before writing anything:
   schema:   apps/api/src/db/schema/grns.ts and po.ts
   service:  apps/api/src/services/grn.service.ts (list/get/create + audit + tenant scoping)
   route:    apps/api/src/routes/grn.routes.ts
   shared:   packages/shared/src/schemas/grn.ts
   screen:   apps/web/app/t/[slug]/grn/ (page.tsx, new/page.tsx, [id]/page.tsx)

YOUR MISSION: build the vendor-invoice → 3-way match → payment → AP-aging flow. All money in
paise (store as text like existing tables), qty scaled ×1000, every table has tenantId +
deletedAt, every query filters tenantId, multi-row writes use db.transaction().

A. DB schema (NEW files only):
   - apps/api/src/db/schema/vendor_invoices.ts: vendorInvoices (FK tenantId, companyId,
     unitId, vendorId, poId nullable, grnId nullable; invoiceNumber, invoiceDate,
     amounts in paise: subtotal/tax/total, status enum
     [draft|matched|price_variance|qty_variance|unmatched|approved|cancelled], matchStatus,
     remarks, soft-delete) + vendorInvoiceItems (FK invoiceId, poItemId nullable, grnItemId
     nullable, itemId nullable, itemName, qtyScaled, uom, unitPricePaise, taxPaise, totalPaise).
   - apps/api/src/db/schema/payments.ts: payments (tenantId, vendorId, paymentDate,
     method enum [neft|rtgs|cheque|upi|cash], amountPaise, reference, status
     [draft|posted|cancelled], remarks, soft-delete) + paymentAllocations (paymentId,
     vendorInvoiceId, allocatedPaise) so one payment can settle many invoices and an invoice
     can be paid in parts. Also support advance payments (allocation may be null / poId-based).
   - Append exports to apps/api/src/db/schema/index.ts (append-only, re-read first).

B. Shared Zod (NEW files): packages/shared/src/schemas/vendor-invoice.ts and payment.ts
   (create/update/list shapes, mirroring grn.ts style). Append both to
   packages/shared/src/schemas/index.ts (append-only).

C. Services (NEW files):
   - vendor-invoice.service.ts: CRUD + 3-WAY MATCH — given an invoice linked to a PO and
     GRN(s), compare invoice qty/price vs PO (ordered price) and GRN (received/accepted qty);
     set matchStatus (matched / price_variance / qty_variance / unmatched) using the PO line
     tolerancePercent. Block "approve" on a variance unless an over-tolerance approval flag
     is passed. Audit every action.
   - payment.service.ts: record payments + allocations (transactional), advance payments,
     and an AP-AGING report function (outstanding per vendor bucketed 0-30/30-60/60-90/90+
     from unpaid invoice balances). Roll payment status up to invoices.

D. Routes (NEW files): vendor-invoice.routes.ts, payment.routes.ts (mirror grn.routes.ts:
   auth + tenant + permission middleware). Append to apps/api/src/routes/index.ts
   (append-only): mount at "/vendor-invoices" and "/payments".

E. Web screens (NEW folders under apps/web/app/t/[slug]/):
   - invoices/ : page.tsx (list with status tabs), new/page.tsx (create, pre-fill from a PO/GRN),
     [id]/page.tsx (detail with the 3-way match panel + approve/cancel).
   - payments/ : page.tsx (list), new/page.tsx (record payment + allocate to invoices).
   - An AP-aging view (a tab on payments page or reports). Use components/ListPrimitives,
     FormSheet, StatusBadge, PageHeader; call the API via lib/api.ts (import only, don't edit it).
   - Put any new components under apps/web/components/invoices/.
   - In packages/shared/src/constants/modules.ts (append-only edit): the "payments" module
     already exists as gated — set it mvp:true, gated:false so it shows in the sidebar for now
     (P3 will re-gate by plan). Add an "invoices" module entry if you want it as its own nav
     item (group:"finance", mvp:true), else surface invoices under payments.

YOU OWN: the new schema/shared/service/route/screen/component files named above.
SHARED (append-only): schema/index.ts, routes/index.ts, shared schemas/index.ts, modules.ts.
DO NOT TOUCH: Tab 1's services (grn/stock/pr/po/auth/item/vendor/mail/app/middleware),
   Tab 4 inventory files, Tab 5 ai files, lib/api.ts, seed.ts, package.json, lockfile.
DO NOT run db:generate/migrate/install — Consolidation does that.

DONE WHEN: schema + shared + services + routes + screens exist and apps/api typecheck is
   clean (ignore errors that come only from other tabs' unfinished shared edits). Summarize
   the entities/endpoints/screens you added.
```

---

## Prompt 4 → Tab 4 — Inventory / Warehouse depth (Phase 2)

```
You are in the "Prathvi's ERP" monorepo (indus-erp-v2): Next.js + Express/Drizzle/Postgres +
shared Zod. FIRST read STRATEGY.md (§7) and the "§ Golden Rules" of PARALLEL_BUILD.md and
OBEY them — 4 other agents edit this repo now. PATTERN templates to study first:
   schema:  apps/api/src/db/schema/stock.ts, items.ts
   service: apps/api/src/services/stock.service.ts (READ it to reuse stockMovements; do NOT edit it)
   route:   apps/api/src/routes/stock.routes.ts
   screen:  apps/web/app/t/[slug]/inventory/ (page.tsx, [itemId]/page.tsx)

IMPORTANT: stock.service.ts and grn.service.ts are owned by Tab 1 — DO NOT edit them. Build
everything as NEW files that READ the existing stockMovements ledger.

YOUR MISSION: add inventory depth — valuation, locations, reorder automation, cycle count.
Money paise, qty scaled ×1000, tenantId + deletedAt everywhere, filter tenantId, use
db.transaction() for multi-row writes.

A. DB schema (NEW files); append exports to schema/index.ts (append-only, re-read first):
   - storage_locations.ts: storageLocations (tenantId, unitId, code, name, type
     [warehouse|zone|rack|bin], parentId nullable for hierarchy, isActive, soft-delete).
   - item_stock_policy.ts: itemStockPolicy (tenantId, itemId, unitId, minQtyScaled,
     maxQtyScaled, reorderLevelScaled, safetyStockScaled, leadTimeDays, isActive). Per item+unit.
   - stock_counts.ts: stockCounts (tenantId, companyId, unitId, status
     [draft|in_progress|completed|cancelled], countedByUserId, remarks, soft-delete) +
     stockCountItems (countId, itemId, systemQtyScaled, countedQtyScaled, varianceScaled, uom).

B. Shared Zod (NEW files): location.ts, stock-policy.ts, stock-count.ts in
   packages/shared/src/schemas/ ; append to schemas/index.ts (append-only).

C. Services (NEW files — read stockMovements, never edit stock.service.ts):
   - valuation.service.ts: compute item cost via Weighted Average (default) and FIFO from
     stockMovements (qtyScaled, unitPricePaise). Stock valuation report: qty x cost by
     item/group/unit + closing value.
   - reorder.service.ts: list items whose on-hand (summed from stockMovements per item+unit)
     is at/below itemStockPolicy.reorderLevel; compute suggested order qty (up to max). DO
     NOT create PRs in the backend (that's Tab 1/PR territory) — just return suggestions;
     the frontend's "Create PR" button will navigate to /pr/new prefilled.
   - location.service.ts: CRUD for storageLocations.
   - stock-count.service.ts: create a count sheet (snapshot system qty from the ledger),
     enter counted qty, compute variance, and "post" adjustments by inserting balancing
     stockMovements with sourceType "adjustment" (insert directly following the stock.ts
     schema shape; transactional). Audit everything.

D. Routes (NEW file): inventory-extra.routes.ts mounting valuation/reorder/locations/counts.
   Append to routes/index.ts (append-only) at e.g. "/inventory-extra" (or separate mounts
   /valuation, /reorder, /locations, /stock-counts — your call, keep it under new paths so
   it never clashes with the existing "/stock" route owned by Tab 1).

E. Web screens (NEW folders under apps/web/app/t/[slug]/):
   - inventory/valuation/page.tsx (valuation report),
   - inventory/reorder/page.tsx (reorder dashboard + "Create PR" buttons -> /pr/new),
   - locations/page.tsx (locations master CRUD),
   - stock-count/page.tsx (+ new/[id]) for cycle counts.
   Use ListPrimitives/FormSheet/PageHeader; call API via lib/api.ts (import only).
   New components under apps/web/components/inventory/.
   In modules.ts (append-only): add new module entries (group:"inventory", mvp:true,
   gated:false, showInSidebar:true) for the new screens, OR reuse the existing "inventory"
   module and add sub-links — keep edits to appended lines only.

YOU OWN: the new schema/shared/service/route/screen/component files above.
SHARED (append-only): schema/index.ts, routes/index.ts, shared schemas/index.ts, modules.ts.
DO NOT TOUCH: stock.service.ts, grn.service.ts, pr.service.ts (Tab 1); Tab 3 invoice/payment
   files; Tab 5 ai files; lib/api.ts; seed.ts; package.json; lockfile.
DO NOT run db:generate/migrate/install.

DONE WHEN: schema + shared + services + routes + screens exist and apps/api typecheck is
   clean (ignoring cross-tab unfinished shared edits). Summarize what you added.
```

---

## Prompt 5 → Tab 5 — AI "Ask your ERP" Assistant + White-label polish (Phase 4 thin slice + Phase 3 start)

```
You are in the "Prathvi's ERP" monorepo (indus-erp-v2): Next.js (apps/web) + Express/
Drizzle/Postgres (apps/api) + shared Zod. FIRST read STRATEGY.md (§8.4, §9.1) and the
"§ Golden Rules" of PARALLEL_BUILD.md and OBEY them — 4 other agents edit this repo now.
PATTERN templates: any apps/api/src/routes/*.routes.ts + services/*.service.ts for the
backend shape; apps/web/app/t/[slug]/dashboard/page.tsx for a data-driven screen;
apps/web/components/AppShell.tsx and app/t/[slug]/layout.tsx for where tenant context loads.

YOUR MISSION: (1) a natural-language "Ask your ERP" assistant — the top demo feature — and
(2) per-tenant white-label theming. Everything tenant-scoped; the AI may only read data for
the current user's tenant.

PART 1 — AI Assistant (apps/api + apps/web)
A. Service (NEW): apps/api/src/services/ai.service.ts using Anthropic (Claude).
   NEEDS DEP: @anthropic-ai/sdk (do NOT install — note it in PARALLEL_BUILD_NOTES.md).
   Use ANTHROPIC_API_KEY (add to .env.example a placeholder line if absent; do not put a
   real key). Implement TOOL-CALLING where the tools are thin wrappers over EXISTING read
   logic, each receiving and enforcing the caller's tenantId:
     - getDashboardStats(tenantId)         -> reuse dashboard.service
     - listPurchaseOrders(tenantId, filt)  -> reuse po.service list
     - listPurchaseRequisitions(...)       -> reuse pr.service list
     - vendorSpend / topItems / prAging    -> reuse dashboard report fns
   The model turns a question ("what did we spend on bearings last quarter?", "which POs are
   pending approval over 1 lakh?") into tool calls, then answers from the results. NEVER let
   it write/mutate. If a question needs data you have no tool for, say so. Gracefully no-op
   (return a friendly "AI is not configured" message) when ANTHROPIC_API_KEY is absent.
B. Route (NEW): apps/api/src/routes/ai.routes.ts — POST /ai/chat { messages } guarded by
   auth+tenant middleware; passes req.auth.tid into every tool. Append to routes/index.ts
   (append-only) mounting at "/ai".
C. (Optional) schema (NEW): apps/api/src/db/schema/ai_conversations.ts (aiConversations +
   aiMessages, tenantId + userId scoped) to persist chat history; append to schema/index.ts
   (append-only). Shared Zod (NEW): packages/shared/src/schemas/ai.ts; append to
   schemas/index.ts.
D. Web screen (NEW): apps/web/app/t/[slug]/ai/page.tsx — a chat UI (message list + input,
   streaming or simple request/response). New components under apps/web/components/ai/.
   Call POST /ai/chat via lib/api.ts (import only). In modules.ts (append-only) the
   "ai_assist" module already exists as gated — set mvp:true, gated:false so it shows in the
   sidebar for the demo.

PART 2 — White-label theming (apps/web only)
E. The design system already supports runtime theming via <body data-theme="..."> and CSS
   tokens (packages/ui). Wire per-tenant branding: in apps/web/app/t/[slug]/layout.tsx, read
   the tenant's theme/brand (from the existing /me or tenant settings payload — inspect
   lib/auth.ts and the Me type) and apply data-theme + brand color/logo via a CSS variable.
   Provide a sensible default when none is set. Keep it additive; DO NOT edit AppShell's
   structure (only read tenant context). Branded login is a nice-to-have if time permits.

YOU OWN: ai.service.ts, ai.routes.ts, ai_conversations.ts, schemas/ai.ts, app/t/[slug]/ai/*,
   components/ai/*, and the theming additions in app/t/[slug]/layout.tsx (additive only).
SHARED (append-only): routes/index.ts, schema/index.ts, shared schemas/index.ts, modules.ts,
   .env.example (one placeholder line), PARALLEL_BUILD_NOTES.md (NEEDS DEP note).
DO NOT TOUCH: Tab 1 backend services/app/middleware; Tab 3 invoice/payment files; Tab 4
   inventory files; lib/api.ts; AppShell.tsx structure; seed.ts; package.json; lockfile.
DO NOT run install/db:generate/migrate.

DONE WHEN: /ai/chat endpoint + ai.service (tenant-scoped tool-calling) + /ai chat screen
   exist; ai_assist module is visible; per-tenant theming is wired with a safe default.
   apps/web typecheck passes except for the @anthropic-ai/sdk import (note it). Summarize.
```

---

## § Consolidation (run ONCE, after all 5 tabs finish)

Do these in order, in a single tab (you can ask me to do it):

1. **Review shared registries** — open and sanity-check that all appended lines are present
   and de-duplicated:
   - `apps/api/src/db/schema/index.ts` (new: vendor_invoices, payments, storage_locations,
     item_stock_policy, stock_counts, ai_conversations)
   - `apps/api/src/routes/index.ts` (new mounts: /vendor-invoices, /payments,
     inventory-extra mounts, /ai)
   - `packages/shared/src/schemas/index.ts` (new: vendor-invoice, payment, location,
     stock-policy, stock-count, ai)
   - `packages/shared/src/constants/modules.ts` (payments + ai_assist set visible; any new
     inventory/invoice modules)

2. **Install all new deps** (from each tab's "NEEDS DEP" notes in `PARALLEL_BUILD_NOTES.md`):
   ```
   pnpm --filter @indus/api add resend @anthropic-ai/sdk express-rate-limit
   pnpm --filter @indus/api add -D vitest
   pnpm --filter @indus/shared add -D vitest
   ```
   (adjust to whatever the notes actually list), then `pnpm install`.

3. **Add scripts** the test tab requested (per PARALLEL_BUILD_NOTES.md): a `"test": "vitest run"`
   in `apps/api/package.json` and `packages/shared/package.json`, and a `test` task in `turbo.json`.

4. **Generate ONE migration** for all the new tables, then apply it:
   ```
   pnpm db:generate
   pnpm db:migrate
   ```
   Review the generated SQL before migrating. This is the only place migrations are created —
   doing it once avoids the parallel-migration conflicts.

5. **Enable new modules for the demo tenant** in `apps/api/src/db/seed.ts` (or via the
   settings UI) so they appear in the sidebar.

6. **Typecheck + build the whole repo**:
   ```
   pnpm typecheck
   pnpm build
   ```
   Fix any remaining cross-tab integration errors (usually a missing import in a shared barrel
   or a type mismatch where two tabs met).

7. **Run tests**: `pnpm test`. Un-skip the integration test once a test DB is configured.

8. **Commit** in logical chunks (one commit per tab's area is fine), then push so Vercel +
   Render redeploy. Verify the live app.

> Tip for next time: if you want zero chance of collisions, run each tab in its own **git
> worktree** (5 isolated copies) and merge at the end. The plan above is tuned so you can
> skip that and work in one folder, as long as every tab obeys the Golden Rules.
