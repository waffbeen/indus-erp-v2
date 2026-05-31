# Parallel Build v2 — 5 tabs, 4 new themes

Expands the product with: **India GST Compliance**, **AI Procurement Copilot**,
**Sales/Distribution**, **Vendor Portal + RFQ**, **WhatsApp + multi-channel notifications**.

## How to run
1. Everyone reads **`docs/PROJECT_CONTEXT.md`** first (full codebase context + conventions).
2. Open 5 tabs in this repo. Paste `TAB-1…TAB-5` (one per tab). They run concurrently.
3. They create code but **don't** install deps, generate migrations, or edit the lockfile/seed.
4. When all 5 finish, run **§ Consolidation** below (once).

## Tab map (disjoint ownership)
| Tab | Theme | Owns (new files) |
|---|---|---|
| 1 | India GST Compliance | e_invoices, e_way_bills, gst_returns, gstin_verifications, tenant_gst_settings + services/routes + `/compliance` screen |
| 2 | AI Procurement Copilot + OCR | **ai.service.ts** + copilot/scorecard/anomaly/forecast/ocr services + `/insights` screen |
| 3 | Sales / Distribution | customers, sales_orders, sales_invoices + services/routes + `/customers /sales-orders /sales-invoices` |
| 4 | Vendor Portal + RFQ | rfqs, vendor_portal_access + services/routes + `/rfq` + public `app/portal/[token]` |
| 5 | WhatsApp + notifications | tenant_whatsapp_settings + whatsapp service + **notification.service.ts** + WhatsApp tab in `settings/page.tsx` |

## Shared registries (APPEND-ONLY — re-read before editing)
`apps/api/src/db/schema/index.ts` · `apps/api/src/routes/index.ts` ·
`packages/shared/src/schemas/index.ts` · `packages/shared/src/constants/modules.ts`

Ownership of otherwise-shared files this round: **Tab 2 owns `ai.service.ts` + `ai.routes.ts`**;
**Tab 5 owns `notification.service.ts` + `app/t/[slug]/settings/page.tsx`**. Other tabs must not edit those.

## § Consolidation (run ONCE, after all 5 finish)
1. Review the 4 shared registries — confirm every tab's `export`/mount/module line is present.
2. Install deps from `PARALLEL_BUILD_NOTES_V2.md` "NEEDS DEP" notes (`pnpm --filter @indus/api add …`), then `pnpm install`.
3. `pnpm db:generate` → review SQL → `pnpm db:migrate` (production DB — get explicit approval first). This is migration 0017+.
4. Enable new modules for the demo tenant if needed (modules with `mvp:true` are auto-on).
5. `pnpm --filter @indus/api typecheck && pnpm --filter @indus/web typecheck && pnpm --filter @indus/web build` — fix any cross-tab seams.
6. Commit per-tab, push `main` (auto-deploys), then `npx vercel --prod --yes` if web lags. Verify live.
