# Indus ERP v2

Modern AI-powered Procurement & Inventory SaaS — a ground-up rebuild of the legacy VB.NET/MSSQL ERP (Estimo Prime). Multi-tenant from Day 1. Built for users from a single-shop kirana to a multi-company enterprise.

> **Status:** Foundation in progress. Design system locked (Variant 07 "Circle"). MVP scope = Auth + Tenant onboarding + PR + PO + Dashboard shell.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind | SSR + RSC, single deploy target (Vercel) |
| Design system | `packages/ui` (CSS variables + Tailwind preset) | Single source of truth, theme-swappable |
| Backend | Node 20 + Express 4 + TypeScript | Familiar, fast, deployable to Render free tier |
| Database | PostgreSQL (Neon) + Drizzle ORM | Relational ERP joins + Row-Level Security capable |
| Auth | Custom JWT (access 15min + refresh 7d) | Multi-tenant + custom roles need full control |
| Validation | Zod (shared `packages/shared`) | Single schema, both frontend & backend |
| Repo | pnpm workspaces + Turborepo | Atomic FE+BE changes, fast builds |

## Folder layout

```
indus-erp-v2/
├── apps/
│   ├── api/                    # Express + Drizzle API server (deploys to Render)
│   └── web/                    # Next.js app (deploys to Vercel)
├── packages/
│   ├── ui/                     # 🎨 Design system — CSS tokens, Tailwind preset, primitives
│   └── shared/                 # Zod schemas + TS types shared FE↔BE
├── app-preview/                # Static HTML previews of pages (no build needed)
└── design-exploration/         # Original 8 variants explored during design phase
```

## Getting started

### Prerequisites
1. **Node.js 20+** — download from [nodejs.org](https://nodejs.org/) (LTS recommended).
2. **pnpm 9+** — after Node is installed, run:
   ```sh
   corepack enable
   corepack prepare pnpm@latest --activate
   ```
3. **PostgreSQL database** — easiest: create a free [Neon](https://neon.tech) project, copy the pooled connection string.

### Install & run

```sh
# from repo root
pnpm install                    # one-time, installs all workspaces
cp .env.example .env            # fill in DATABASE_URL + JWT_ACCESS_SECRET + JWT_REFRESH_SECRET
pnpm db:generate                # generate migration files from Drizzle schemas
pnpm db:migrate                 # apply migrations to your Neon DB
pnpm dev                        # starts API on :4000 and Web on :3000 in parallel
```

Open <http://localhost:3000> — login screen appears.

### Without Node? View static previews

Even without installing anything, you can open `design-exploration/index.html` or `app-preview/index.html` directly in a browser to view the design.

## Design system — global theming

The user requirement: **"make global things so we can change after time"**. Implemented as:

- All design tokens (colors, radii, fonts, shadows) live in `packages/ui/tokens/<theme>.css` as CSS custom properties.
- The active theme is selected by `packages/ui/tokens/index.css` via a single `@import`.
- Components use `var(--token)` or Tailwind utility classes (`bg-primary`, `kpi-peach`) — **never** hex codes.
- To swap themes: change one `@import` line and rebuild. Or use `<body data-theme="starline">` at runtime.

See [`packages/ui/README.md`](./packages/ui/README.md) for full architecture.

## Deployment

Full step-by-step guide: **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

Quick view:

| Piece | Where | Build | Start |
|---|---|---|---|
| `apps/web` | Vercel — root dir `apps/web` | *(auto)* `next build` | *(auto)* `next start` |
| `apps/api` | Render — root dir blank | `corepack enable && pnpm install --frozen-lockfile` | `pnpm --filter @indus/api start` |
| Database | Neon (serverless Postgres, WebSocket over :443) | — | — |

**Vercel env vars** — `NEXT_PUBLIC_API_URL=https://<render-url>`

**Render env vars** — `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `WEB_ORIGIN`, `NODE_ENV=production`. Render injects `PORT` automatically; the API maps it.

> Before deploying production: **rotate the Neon password and generate fresh JWT secrets** — see [DEPLOYMENT.md §1](./DEPLOYMENT.md#1-rotate-secrets-before-going-live). The dev DB URL shared during development must not be the production URL.

## Migrating from the legacy ERP

The legacy VB.NET WebForms app (`d:\25 May\estimoprime.indusanalytics.co.in_Thomson\`) is **not touched**. It runs side-by-side during the cutover. Data migration plan is post-MVP.

## License

Proprietary — © Indus Analytics. Not for redistribution.
