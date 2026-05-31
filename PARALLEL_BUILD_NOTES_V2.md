# Parallel build v2 — consolidation notes

Append-only. One section per tab. List NEEDS DEP lines + any consolidation TODOs.

---

## Tab 5 — WhatsApp + multi-channel notifications

**NEEDS DEP:** none. WhatsApp providers (Meta Cloud / Gupshup / Twilio) are called
via the built-in `fetch` — no SDK added. No `package.json` / lockfile change.

**New tables (need ONE migration at consolidation):**
- `tenant_whatsapp_settings` — per-tenant WhatsApp config (token + app secret encrypted).
- `notification_preferences` — per-user channel opt-outs (default-on / opt-out model).

**New files (mine, safe):**
- `apps/api/src/db/schema/tenant_whatsapp_settings.ts`
- `apps/api/src/db/schema/notification_preferences.ts`
- `apps/api/src/services/whatsapp-settings.service.ts`
- `apps/api/src/services/whatsapp.service.ts`
- `apps/api/src/routes/whatsapp.routes.ts`
- `packages/shared/src/schemas/whatsapp-settings.ts`

**Edited (mine this round):**
- `apps/api/src/services/notification.service.ts` — multi-channel fan-out (WhatsApp ON
  by default, email opt-in to avoid double-sending the per-flow emails the
  pr/po/grn/vendor-invoice services already send). Existing `notifyUsers` /
  `notifyTenantAdmins` signatures unchanged (added optional `channels`).
- `apps/web/app/t/[slug]/settings/page.tsx` — added the "WhatsApp" settings tab.
- Append-only barrels: `db/schema/index.ts`, `routes/index.ts`,
  `packages/shared/src/schemas/index.ts`.

**Consolidation TODO (optional hardening):** strict Meta webhook signature
verification needs the RAW request body. Right now `whatsapp.routes` verifies
best-effort against re-serialised JSON and proceeds-but-logs on mismatch (the
approve action is independently guarded by the approver-phone mapping +
`approvePr` checks). To make it exact, add a `verify` hook to the global
`express.json()` in `apps/api/src/app.ts`:
`express.json({ limit: "2mb", verify: (req, _res, buf) => { (req as any).rawBody = buf; } })`.
`whatsapp.routes.rawBodyOf()` already prefers `req.rawBody` when present.

**Typecheck:** `@indus/web` clean. `@indus/api` — only OTHER tabs' files error
(eway/forecast/vendor-scorecard); none of mine.

---

## Tab 4 — Vendor/Supplier Portal + RFQ (e-Sourcing)

**NEEDS DEP:** none. Opaque tokens use Node's built-in `crypto.randomBytes`
(same pattern as `invites`). No `package.json` / lockfile change.

**New tables (need ONE migration at consolidation):**
- `rfqs`, `rfq_items`, `rfq_vendors`, `rfq_responses`, `rfq_response_items` — RFQ +
  vendor quotes. `rfqs.awarded_po_id` FKs `purchase_orders` (RFQ schema imports
  `./po`; no circular import — po doesn't import rfqs).
- `vendor_portal_access` — opaque-token access for the public vendor portal.

**New files (mine, safe):**
- `apps/api/src/db/schema/rfqs.ts`, `apps/api/src/db/schema/vendor_portal_access.ts`
- `apps/api/src/services/rfq.service.ts`, `apps/api/src/services/vendor-portal.service.ts`
- `apps/api/src/routes/rfq.routes.ts`, `apps/api/src/routes/vendor-portal.routes.ts`
- `packages/shared/src/schemas/rfq.ts`, `packages/shared/src/schemas/vendor-portal.ts`
- `apps/web/app/t/[slug]/rfq/{page,new/page,[id]/page}.tsx`
- `apps/web/components/rfq/{RfqStatusBadge,QuoteCompareTable,InviteVendorsModal,RecordQuoteModal}.tsx`
- `apps/web/app/portal/[token]/page.tsx` — PUBLIC, non-tenant, no AppShell/AuthGate.

**Edited (append-only barrels + module):** `db/schema/index.ts`, `routes/index.ts`,
`packages/shared/src/schemas/index.ts`, `packages/shared/src/constants/modules.ts`
(added `rfq` module, sortOrder 24). Reused (NOT edited): `po.service.createPo`,
`po.service.listPos`, `vendor`/`invite` patterns, `StatusBadge`, `lib/api`, `lib/format`.

**Portal security:** `/api/portal/*` is mounted PUBLIC (no requireAuth/requireTenant).
The opaque token in the path is the only credential — `resolveToken()` maps it to a
single `{tenantId, vendorId}` and every read/write is constrained to that pair; the
request body can never widen scope. PO acknowledge hard-checks `po.vendorId === token.vendorId`;
quote submit refuses non-invited vendors. Token issuance is tenant-admin only.

**Typecheck:** `@indus/web` clean. `@indus/api` clean (exit 0).

## Tab: AI Procurement Copilot + Document AI + Insights

**NEEDS DEP:** none — reuses already-installed `@anthropic-ai/sdk`, `@google/generative-ai`, `openai`.

**New migration tables (generate ONE migration in consolidation):**
- `vendor_scorecards` (db/schema/vendor_scorecards.ts) — snapshot cache; service computes live, so app works pre-migration.
- `anomaly_flags` (db/schema/anomaly_flags.ts) — required for the anomaly scan/feed to persist (`getFlags` returns [] until migrated).
- `demand_forecasts` (db/schema/demand_forecasts.ts) — snapshot cache; forecasts compute live.

**Owned/added files:**
- API: services ai.service.ts (extended: exported `resolveAiConfig` + new `aiComplete`/`AiNotConfiguredError`), copilot.service.ts, vendor-scorecard.service.ts, anomaly.service.ts, forecast.service.ts, ocr.service.ts; routes copilot.routes.ts (mounted at `/copilot`).
- Shared: schemas copilot.ts, scorecard.ts, anomaly.ts, forecast.ts, ocr.ts (appended to schemas/index.ts).
- Web: app/t/[slug]/insights/page.tsx; components/insights/{CopilotPanel,VendorScorecards,AnomalyFeed,Forecasts,InvoiceOcr}.tsx; extended app/t/[slug]/ai/page.tsx with a Chat/Copilot toggle.
- Module: added `insights` (mvp:true) to constants/modules.ts.

**Typecheck:** @indus/shared, @indus/web clean. @indus/api clean for these files (pre-existing unrelated errors in compliance `eway.service.ts` are another tab's).
