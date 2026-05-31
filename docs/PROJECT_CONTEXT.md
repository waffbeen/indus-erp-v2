# Prathvi's ERP — Project Context (read this first)

**Audience:** any Claude/developer picking up this codebase with zero prior context.
This single file tells you what the project is, how it's built, the conventions you
MUST follow, how to add a feature end-to-end, and how it deploys. Read it fully before
writing code.

---

## 1. What this is
**Prathvi's ERP** (repo: `indus-erp-v2`) is a **multi-tenant Procurement + Inventory SaaS**
for Indian businesses — a ground-up rebuild of a legacy VB.NET/MSSQL ERP (client: Thomson).
Goals: (a) replace the legacy app for the real client, (b) sell as a multi-tenant SaaS,
(c) demo well. India-first: GST-native, ₹/paise money, Hinglish-friendly copy is OK.

- **Live web:** https://prathvis-erp.vercel.app
- **Live API:** https://prathvis-erp.onrender.com  (health: `/api/healthz`)
- **Repo:** github.com/waffbeen/indus-erp-v2  (branch: `main`)

## 2. Stack & layout
- **Monorepo:** pnpm workspaces + Turborepo. Package manager pinned: `pnpm@9.15.0`.
- **apps/web** — Next.js 14 (App Router) + TypeScript + Tailwind. Deploys to **Vercel**.
- **apps/api** — Node 20 + Express 4 + TypeScript (run with `tsx`). Deploys to **Render**.
- **packages/shared** — Zod schemas + TS types shared FE↔BE (`@indus/shared`).
- **packages/ui** — design tokens + `base.css` component classes + Tailwind preset (`@indus/ui`).
- **DB:** PostgreSQL on **Neon**, **Drizzle ORM** (`apps/api/src/db`). Migrations in
  `apps/api/drizzle/` (latest is **0016** — your new migration will be 0017+).

```
apps/
  api/src/
    db/schema/*.ts        # Drizzle tables (one file per table-group) + index.ts barrel
    db/index.ts           # `db` (Neon serverless + drizzle) and `db.transaction(...)`
    services/*.service.ts # business logic (the layer you put real work in)
    routes/*.routes.ts    # Express routers + index.ts barrel that mounts them
    middleware/           # auth.ts (requireAuth), tenant.ts (requireTenant), rbac.ts
    lib/                  # jwt, password (argon2), crypto (AES-GCM), errors, logger
    config/env.ts         # zod-validated env (import { env })
  web/
    app/                  # App Router. Public: /login /signup /pricing. App: /t/[slug]/<module>
    components/           # AppShell, Icon, ListPrimitives, FormSheet, Modal, StatusBadge…
    lib/                  # api.ts (fetch wrapper), auth.ts (zustand), appearance.ts, format.ts, toast.ts
packages/
  shared/src/schemas/*.ts # zod; index.ts barrel. constants/modules.ts + roles.ts. types/
  ui/tokens/porcelain.css # active theme tokens. base.css = .card/.btn/.input/.badge
```

## 3. Non-negotiable conventions (follow these exactly)
1. **Money = paise** (integer). Often stored as `text` for big-int safety. Format on the FE
   with `paiseToINR` / `paiseToCompactINR` (`apps/web/lib/format.ts`). Never store floats.
2. **Quantities = scaled ×1000** (`quantityScaled`). Human qty = `scaled / 1000`.
3. **Every business table has `tenantId` + `deletedAt`** (soft delete). **Every query MUST
   filter `tenantId`** (and usually `isNull(deletedAt)`). This is how tenant isolation works.
4. **Multi-row writes go in `db.transaction(async (tx) => {...})`**. Pass `tx` to inserts.
5. **Shared Zod is the single source of truth** for FE↔BE shapes. Define a schema in
   `packages/shared/src/schemas/<x>.ts`, export from its `index.ts`, use on both sides.
6. **Layering:** `route` parses input (zod) → calls `service` → returns JSON. Services take an
   **`ActorContext { tenantId, userId, isTenantAdmin, ipAddress?, userAgent? }`** as the last arg.
7. **Auth/RBAC:** middleware `requireAuth` then `requireTenant` on tenant routes. In handlers:
   `req.auth` = `{ sub: userId, tid: tenantId, tsl: slug, sa: isSuperAdmin, ta: isTenantAdmin }`,
   `req.tenant` = `{ id, slug, status }`. Admin-only check: `if (!req.auth!.ta) throw Forbidden(...)`.
8. **Audit:** important mutations insert into `auditLogs` (action, resourceType, resourceId, actor).
9. **Icons:** use `<Icon name="..." />` (`components/Icon.tsx`, wraps **lucide-react 0.395**).
   The `name` MUST be a real lucide icon (e.g. `CircleAlert`, `TriangleAlert`, `CircleCheckBig`,
   `CircleX` — NOT the old `AlertCircle/AlertTriangle/CheckCircle2/XCircle`). Unknown names render
   blank. Type-checking is ENFORCED (no `ignoreBuildErrors`), so a wrong name fails the build.
10. **Per-tenant integration config pattern** (use this for any "bring-your-own-key" feature):
    a per-tenant settings table (e.g. `tenant_ai_settings`, `tenant_mail_settings`) storing
    secrets **encrypted** via `apps/api/src/lib/crypto.ts` (`encryptSecret`/`decryptSecret`);
    GET/PUT settings routes (tenant-admin); the service resolves the tenant's config (falling
    back to platform env). Never return raw secrets to the FE — only a masked `last4`/`hasX`.

## 4. The "add a feature" recipe (end-to-end)
1. **DB table** → new `apps/api/src/db/schema/<thing>.ts` (Drizzle). Add `export * from "./<thing>"`
   to `schema/index.ts` (barrel). Include `id` uuid pk, `tenantId` (FK → tenants, cascade),
   timestamps, `deletedAt`.
2. **Shared zod** → `packages/shared/src/schemas/<thing>.ts` (create/update/view + types).
   Add `export * from "./<thing>"` to `schemas/index.ts`.
3. **Service** → `apps/api/src/services/<thing>.service.ts` (list/get/create/update; tenant-scoped;
   transactional; audited). Mirror an existing one (e.g. `vendor-invoice.service.ts`, `grn.service.ts`).
4. **Route** → `apps/api/src/routes/<thing>.routes.ts` (Express Router, `requireAuth`+`requireTenant`,
   zod-parse body). Mount it in `routes/index.ts` (`apiRouter.use("/<thing>", <thing>Routes)`).
5. **Screen** → `apps/web/app/t/[slug]/<thing>/page.tsx` (+ `new`, `[id]`). Use `api<T>()` from
   `lib/api.ts`, `ListPrimitives`/`FormSheet`/`PageHeader`/`StatusBadge`, `toast`, design classes.
6. **Sidebar/module** → add an entry to `packages/shared/src/constants/modules.ts` (the sidebar is
   rendered from `sidebarModulesFor(enabledModules)`; `mvp:true` = on for everyone). `path` is under
   `/t/<slug>`. `icon` must be a valid lucide name. Groups: core|procurement|inventory|finance|intelligence|admin
   (add new groups by also handling them in `AppShell.tsx` GROUP_ORDER/GROUP_LABEL).
7. **DON'T** run `pnpm install`, `db:generate`, `db:migrate`, or edit `seed.ts`/`pnpm-lock.yaml`
   during parallel work — those are done ONCE in consolidation (see §7).

## 5. Frontend specifics
- **API calls:** `import { api, ApiError } from "@/lib/api"` → `await api<T>("/api/<path>", { method, body: JSON.stringify(...) })`.
  Auth token is attached automatically; `/api` is proxied to the API base.
- **Auth:** `useAuth()` (`lib/auth.ts`, zustand) → `me` (id, email, fullName, tenantSlug, tenantName,
  isTenantAdmin, enabledModules…), `login`, `register`, `logout`.
- **Design system:** classes `.card .btn .btn-primary .btn-ghost .btn-sm .input .label .badge
  .badge-success/-warning/-danger/-info .display`. Colors via CSS vars: `var(--bg) --surface
  --border --text --muted --primary --primary-fg --success-bg --danger-fg` etc. Don't hardcode hex.
- **Appearance:** theme is `<html data-mode=light|dark data-accent=emerald|plum|clay|ink
  data-layout=editorial|floating|topnav>` driven by `lib/appearance.ts` + Settings → Appearance.
- **Settings page:** `app/t/[slug]/settings/page.tsx` is a tabbed page (Profile/AI/Email/Receiving/
  Approvals/Departments/Appearance). New per-tenant integration UIs add a tab here.

## 6. Current feature inventory (what already exists — don't rebuild)
- **Auth:** JWT access(15m)+refresh(7d) w/ sessions, login, **self-serve `/signup`**
  (`auth.service.register` provisions tenant+company+unit+roles+admin), `/me`, logout.
- **Procurement:** PR (create/submit/multi-level approve/reject) → PO (GST CGST/SGST/IGST,
  amendments, send-to-vendor email) → Gate entry → GRN (posts stock, transactional).
- **Inventory:** stock ledger, valuation (FIFO/avg), storage locations, reorder, stock counts.
- **Finance (P1):** vendor invoices + **3-way match**, payments + **AP aging**.
- **Masters:** vendors, items, HSN, UoM, payment/delivery terms, taxonomy, departments.
- **AI assistant** (`ai.service.ts`): per-tenant key (Gemini default / OpenAI / Anthropic),
  read-only tool-calling over dashboard/PO/PR. Routes `/ai` (chat, status, settings).
- **Email** (`mail.service.ts` + `mail-settings.service.ts`): per-tenant SMTP (test+save) or
  platform Resend. `sendMail({...,tenantId})` prefers tenant SMTP.
- **SaaS:** modules/pricing-plans/subscriptions tables; public `/pricing`; "Load sample data"
  (`POST /tenant/sample-data`) seeds a real PR→PO chain. Billing (Razorpay) NOT built yet.
- **Schema barrel** (`db/schema/index.ts`), **routes barrel** (`routes/index.ts`), **shared
  schema barrel** (`schemas/index.ts`), **modules** (`constants/modules.ts`) are the SHARED
  registries you append to.

## 7. Build, migrate & deploy
- **Local dev:** `pnpm dev` (api :4000 + web :3000). Typecheck: `pnpm --filter @indus/api typecheck`
  / `--filter @indus/web typecheck`. Build web: `pnpm --filter @indus/web build`.
- **Migrations:** after adding schema files, generate ONE migration with `pnpm db:generate`, then
  `pnpm db:migrate` (runs against the live Neon DB — dev==prod today). **Production DB migrations
  require explicit human approval** each time. Do migrations ONCE during consolidation, not per-tab.
- **Deploy:** push to `main` → **Render** auto-deploys the API, **Vercel** auto-deploys the web.
  If web looks stale, force it: `npx vercel --prod --yes` (CLI is authed as `waffbeen`). Render is
  a free tier that sleeps ~15 min idle (first request cold-starts ~slow).
- **Verify live:** `curl -s -o /dev/null -w "%{http_code}" https://prathvis-erp.vercel.app/<route>`
  and `https://prathvis-erp.onrender.com/api/healthz`.

## 8. Parallel-build coordination (when multiple agents work at once)
- **Own a disjoint set of NEW files.** Only **append** to the shared registries (schema/index.ts,
  routes/index.ts, schemas/index.ts, constants/modules.ts) — re-read before editing, add only your
  lines, never reorder/remove others'.
- **Do NOT** run `pnpm install`/`add`, `db:generate`/`db:migrate`, or edit `seed.ts`/`pnpm-lock.yaml`.
  Need a new dep? write the import and append `NEEDS DEP: <pkg>` to `PARALLEL_BUILD_NOTES_V2.md`.
- **Do NOT** edit another tab's owned files. Self-check with `typecheck` (new-dep imports may not
  type-check until consolidation — that's fine; note them).
- Consolidation (run once at the end): install deps → generate ONE migration → migrate (with
  approval) → typecheck/build → run → commit/push/deploy.
