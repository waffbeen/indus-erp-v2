# Parallel Build Notes (append-only)

> Shared scratchpad for the 5 parallel tabs. **Append only** — add your section at
> the end under your own heading; never edit or remove another tab's notes. These
> notes are actioned once, during **Consolidation** (deps install, migrations,
> script wiring).

---

## Tab: Testing + CI foundation

### NEEDS DEP
- `vitest` (devDependency at the workspace root — used by both `@indus/api` and
  `@indus/shared`). Suggested: `pnpm add -Dw vitest`. The test files and the two
  `vitest.config.ts` files import from `vitest` / `vitest/config`; they will not
  typecheck until this is installed (expected pre-consolidation).

### package.json / turbo.json script changes to add during consolidation
These were NOT applied (package.json / turbo.json are off-limits during parallel build).
Add them once, by hand, in Consolidation:

1. **`apps/api/package.json`** → `scripts`, add:
   ```json
   "test": "vitest run"
   ```

2. **`packages/shared/package.json`** → `scripts`, add:
   ```json
   "test": "vitest run"
   ```

3. **`turbo.json`** → `tasks`, add a `test` task (no build dependency needed for
   the pure unit suites; keep it simple):
   ```json
   "test": {
     "outputs": []
   }
   ```
   This makes the root `pnpm test` (`turbo run test`) fan out to both packages.

4. After the above exist, in **`.github/workflows/ci.yml`** remove
   `continue-on-error: true` from the **Test** step so failing tests block merges.

### What was built (coverage added)
- `apps/api/vitest.config.ts`, `packages/shared/vitest.config.ts`
  - Tests live in `tests/` (OUTSIDE `src/`) on purpose, so the packages'
    `tsc --noEmit` typecheck (which only compiles `src/**`) is NOT polluted by
    `vitest` imports. Vitest transpiles the TS itself.
- `apps/api/src/lib/po-math.ts` — **new pure helper** extracted from
  `po.service.ts` (`computeLine` / `computeHeaderTotals` / `splitGstRate`). The
  service still has its own inline copy; during consolidation, point
  `po.service.ts` at this module so the GST math has a single source of truth.
- Unit suites (`apps/api/tests/`):
  - `po-math.test.ts` — GST split: CGST+SGST (intrastate) vs IGST (interstate),
    sums-to-total invariant, odd-rate split, discount-before-tax, header totals.
  - `pr-approval.test.ts` — PR approval state machine: valid transitions
    (draft→pending_l1→…→approved, multi-level chain advance) + invalid
    transitions refused.
  - `stock-onhand.test.ts` — signed-movement netting, running balance,
    GRN-accept-then-cancel returns on-hand to prior.
  - `tenant-isolation.test.ts` — `eq(tenantId) AND isNull(deletedAt)` scoping:
    tenant A never sees tenant B rows; soft-deleted rows excluded.
- `packages/shared/tests/schemas.test.ts` — public Zod schema defaults + status
  enums (poCreateSchema / prCreateSchema / status enums / GRN condition).
- `apps/api/tests/pr-po-grn.integration.test.ts` — **keystone**, currently
  `describe.skip` (see env below).

### TODO during consolidation — extract pure helpers
The PR-approval, stock-netting, and tenant-scoping suites currently encode the
service logic as a **pure spec inside the test file** (the real logic is embedded
in DB-bound service functions). To make those tests bind to real code, extract
small pure helpers and import them from both the service and the test:
- `prApprovalMachine` (guards + `advanceApprovalChain`) ← from `pr.service.ts`
- `onHandByKey` / `runningBalance` ← from `stock.service.ts`
- `scopeToTenant(query, tenantId)` helper ← the repeated `and(eq(tenantId), isNull(deletedAt))`
`po-math.ts` is already extracted as the template for this.

### Integration test env
`apps/api/tests/pr-po-grn.integration.test.ts` self-skips unless
`TEST_DATABASE_URL` is set (it falls back to `describe.skip`). To run it:
- Provision a **throwaway Postgres/Neon DB** and apply migrations
  (`pnpm --filter @indus/api db:migrate`) against it.
- Export the env the API config requires (`apps/api/src/config/env.ts`):
  `TEST_DATABASE_URL` (the test reads this), plus `DATABASE_URL` pointing at the
  same throwaway DB, and `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (≥32 chars).
  NOTE: importing `../src/config/env` calls `process.exit(1)` on missing vars, so
  the harness must set these before the suite imports any service.
- The test seeds its own tenant/company/unit/vendor/item/users and tears them
  down in `afterAll` (deletes the tenant → cascade, plus the two global users).
- CI wiring: add a `postgres:16` service container to the **Test** job and set
  `TEST_DATABASE_URL`/`DATABASE_URL` + JWT secrets, then un-skip.

### Observability (recommended — no deps installed here)
- **Sentry** on both `apps/web` (`@sentry/nextjs`) and `apps/api`
  (`@sentry/node` + Express request/error handlers). Wire `SENTRY_DSN` via env;
  scrub PII (emails, GSTINs) in `beforeSend`. Tag events with `tenantId` so a
  noisy tenant is easy to spot. NEEDS DEP at consolidation: `@sentry/nextjs`,
  `@sentry/node`.
- **Uptime ping** for Render's free tier: the API sleeps after ~15 min idle and
  cold-starts slowly. Add a lightweight cron (UptimeRobot / cron-job.org /
  GitHub Actions scheduled workflow) hitting `GET /health` every ~10 min to keep
  it warm, and as a basic liveness alert. (A self-ping inside the app does not
  survive the instance sleeping — use an external pinger.)

---

## Tab: AI assistant ("Ask your ERP") + white-label theming

### NEEDS DEP
- `@anthropic-ai/sdk` (dependency of `@indus/api` — used by
  `apps/api/src/services/ai.service.ts`). Suggested: `pnpm add --filter @indus/api @anthropic-ai/sdk`.
  Until installed, `apps/api` typecheck reports the missing module on that single
  import line in `ai.service.ts` — **expected** pre-consolidation; nothing else
  depends on it.

### New env vars (already added to `.env.example`)
- `ANTHROPIC_API_KEY` — enables the assistant. Absent ⇒ the endpoint returns a
  graceful "AI is not configured" reply (no error). Read directly via
  `process.env` in `ai.service.ts`, so **no change to `config/env.ts` needed**.
- `ANTHROPIC_MODEL` — optional override; defaults to `claude-opus-4-8`.

### What was built
- `apps/api/src/services/ai.service.ts` — tenant-scoped, **read-only** tool-calling
  over the existing read services (`dashboard.service`, `po.service` list,
  `pr.service` list). The model never supplies a tenant id; it's injected from
  `req.tenant!.id`. Manual agentic loop (max 6 rounds), adaptive thinking, system
  prompt prompt-cached.
- `apps/api/src/routes/ai.routes.ts` — `POST /ai/chat` + `GET /ai/status`, guarded
  by `requireAuth` + `requireTenant`. Mounted at `/ai` in `routes/index.ts`.
- `packages/shared/src/schemas/ai.ts` — request/response Zod (exported from barrel).
- `apps/api/src/db/schema/ai_conversations.ts` — `ai_conversations` + `ai_messages`
  (exported from barrel). **Not wired into the live path** — chat is stateless;
  these need a migration before any persistence is added. Safe to leave unmigrated.
- `modules.ts` — `ai_assist` flipped to `mvp:true, gated:false` so it appears in the
  sidebar for the demo.
- Web: `apps/web/app/t/[slug]/ai/page.tsx` + `apps/web/components/ai/*` (chat UI),
  calling `POST /api/ai/chat` via `lib/api.ts` (import only).

### White-label theming hook (optional — makes per-tenant branding live)
`apps/web/app/t/[slug]/layout.tsx` now reads optional `theme` / `brandColor` /
`brandColorDark` / `logoUrl` fields off the `/me` payload and applies
`data-theme` + brand CSS vars on `<body>`, with a safe default ("circle", no
override) when absent — so it's a no-op until the backend exposes those fields.
To light it up end-to-end (both already exist on the `tenants` table —
`themeKey`, `metadata`):
- `auth.service.ts` `buildMe()` → return `theme: chosen?.tenant.themeKey`,
  `brandColor: (chosen?.tenant.metadata as any)?.brandColor`,
  `logoUrl: (chosen?.tenant.metadata as any)?.logoUrl`.
- `packages/shared/src/schemas/auth.ts` `meSchema` → add matching optional fields
  (`theme`, `brandColor`, `brandColorDark`, `logoUrl`, all `.optional()`).
No layout change needed once those appear.

---

## Tab: Core hardening (GRN atomicity, type safety, email, security)

### NEEDS DEP
- `resend` (dependency of `@indus/api` — used by `apps/api/src/services/mail.service.ts`).
  Suggested: `pnpm add --filter @indus/api resend`. Until installed, `apps/api`
  typecheck reports the missing module on the single `import { Resend } from "resend"`
  line in `mail.service.ts` — **expected** pre-consolidation; nothing else needs it.
- NOT needed: `express-rate-limit` is already in `apps/api/package.json` and already
  wired in `routes/auth.routes.ts` (login/refresh limiter). No action required.

### New env vars (add to `.env` / `.env.example` during consolidation)
- `RESEND_API_KEY` — already present in the root `.env` / `.env.example`. Added to the
  schema in `apps/api/src/config/env.ts` (optional; absent ⇒ all sends are graceful
  no-ops that log a warning, so dev without a key still works).
- `MAIL_FROM` — optional, defaults to `"Indus ERP <onboarding@resend.dev>"` (Resend's
  shared sandbox sender). Override with a verified-domain sender in production.
- The old `SMTP_*` vars were removed from `config/env.ts` (the SMTP `mail.service`
  was replaced by Resend). `PUBLIC_WEB_URL` is unchanged.

### What was built / changed (all within the core-hardening lane)
- **GRN atomicity** (`grn.service.ts`): removed the duplicate `purchaseOrders` import;
  `createGrn` and `cancelGrn` now run inside a single `db.transaction()` (header +
  line items + `refreshPoReceivedStatus` + stock posting/reversal + audit commit or
  roll back together). Notifications stay OUTSIDE the tx. To support this,
  `po.service.refreshPoReceivedStatus`, `stock.service.recordGrnAcceptances`, and
  `stock.service.reverseGrnMovements` gained an optional trailing `exec` (DB | tx)
  parameter defaulting to `db` — they are only called from the GRN flow.
- **Type safety** (`pnpm --filter @indus/api typecheck`): fixed all errors in this
  lane — `auth.service.ts` (tenantSlug narrowing), `grn.service.ts` (duplicate
  import, dead `"cancelled"` comparison, optional `itemId`), `item.service.ts` +
  `vendor.service.ts` (`...(data as object)` erased types and dropped required
  `name` from the insert → now spread the typed `data`), `po.service.ts`
  (`short_close` cast — `approval_actions.action` is a plain text column; the Drizzle
  `enum` is a TS-only hint with no DB check constraint).
  - Remaining `apps/api` typecheck errors are in OTHER lanes' files and were left
    untouched: `ai.service.ts` (`@anthropic-ai/sdk` NEEDS DEP) and
    `tenant-meta.service.ts:93` (a Drizzle insert-overload error — owner please check).
- **Email** (`mail.service.ts`): reimplemented on Resend. `sendMail({to,subject,html})`
  never throws (fire-and-forget) and no-ops when `RESEND_API_KEY` is absent. Kept the
  `isMailConfigured()` + `MailMessage` API that `po.service` already used. Wired emails
  at existing notification points: PR submitted → approver pool; PR/PO approved or
  rejected → requester/creator; PO sent to vendor → PO creator (separate from the
  existing supplier email).
- **Security** (`config/env.ts`, docs): CORS already reads allowed origins from
  `WEB_ORIGIN` (no wildcard) — left as-is. Login rate-limiting already present in
  `auth.routes.ts` — left as-is. No auth cookies exist (token-based auth via JSON +
  Authorization header), so the cookie-flag hardening is N/A; documented in
  `SECURITY_TODO.md` (new, repo root) for ops follow-up.
- `apps/web/next.config.mjs`: added a `TODO(phase0-cleanup)` to remove
  `ignoreBuildErrors`/`ignoreDuringBuilds` once web typechecks clean. NOT flipped yet
  (web won't compile until other lanes land).
