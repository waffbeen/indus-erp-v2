# Deployment — Indus ERP v2

End-to-end production deploy:

```
   ┌─────────────────┐    HTTPS    ┌──────────────────┐    WSS:443    ┌──────────┐
   │  Vercel         │  ─────────► │  Render          │ ────────────► │  Neon    │
   │  apps/web       │             │  apps/api        │               │ Postgres │
   │  (Next.js 14)   │             │  (Express + tsx) │               │          │
   └─────────────────┘             └──────────────────┘               └──────────┘
```

- **Frontend (Vercel)** — Next.js, serves the UI.
- **Backend (Render)** — Express API, JWT auth, business logic.
- **Database (Neon)** — Serverless Postgres. The API talks to Neon over a WebSocket on port 443 (firewall-friendly).

---

## 0. Prerequisites

| Tool | Why |
|---|---|
| GitHub account | Vercel & Render deploy from a git repo |
| Vercel account | Free hobby tier is fine to start |
| Render account | Free tier works; upgrade if you need always-on |
| Neon project | Already set up — production-grade serverless Postgres |
| Node 20+ locally | For seeding & generating secrets |

---

## 1. Rotate secrets before going live

> **READ FIRST.** During development the dev DB URL was shared in chat and the legacy app had an OpenAI key in `Web.config`. Rotate both before you point the deployed app at production data.

### 1a. Neon — rotate the password

1. Open the Neon console → **Project → Connection details**.
2. Click **Reset password** (or generate a new role).
3. Copy the new connection string. It looks like:
   ```
   postgresql://neondb_owner:<new-password>@ep-XXXX.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
4. Use this value as `DATABASE_URL` in **Render** in §3 — never commit it.

### 1b. Generate fresh JWT secrets

On your local machine:

```powershell
# Each must be at least 32 chars. Use 48-byte URL-safe strings:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

You get two different strings — one becomes `JWT_ACCESS_SECRET`, the other `JWT_REFRESH_SECRET`. **Never reuse the same value for both.**

### 1c. Legacy OpenAI key

The old VB.NET app under `estimoprime.indusanalytics.co.in_Thomson` had an OpenAI API key embedded in `Web.config`. Revoke it at https://platform.openai.com/api-keys — even if you never deploy that folder, the key is exposed in the source tree.

---

## 2. Push the repo to GitHub

From the repo root:

```powershell
git init
git add .
git commit -m "Initial commit — Indus ERP v2"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

> **Verify before pushing:** `git status` should show `apps/api/.env` and `apps/web/.env` as **untracked** (a `.gitignore` is already in place). If you see them in `git status` as tracked, abort and add them to `.gitignore` first.

---

## 3. Deploy the API to Render

Render runs the Express server.

### 3a. Create the service

1. Render dashboard → **New → Web Service** → connect your GitHub repo.
2. Fill in:

| Field | Value |
|---|---|
| **Name** | `indus-erp-api` (anything you like) |
| **Region** | Singapore or Oregon — pick whichever is closer to your Neon region |
| **Branch** | `main` |
| **Root Directory** | *(leave blank — we use the whole monorepo)* |
| **Runtime** | `Node` |
| **Build Command** | `corepack enable && pnpm install --frozen-lockfile` |
| **Start Command** | `pnpm --filter @indus/api start` |
| **Instance Type** | Free is fine for the demo; upgrade to Starter ($7/mo) for always-on |

> `start` runs `tsx src/server.ts` directly — no separate build step is needed. Type-checking is **not** part of the build because it would fail on a few pre-existing legacy types that don't affect runtime; run `pnpm typecheck` locally before merging risky changes.

### 3b. Environment variables (Render → Environment)

Paste these (all required unless noted):

```
DATABASE_URL=<paste rotated Neon connection string from §1a>
JWT_ACCESS_SECRET=<48-byte base64url from §1b — secret #1>
JWT_REFRESH_SECRET=<48-byte base64url from §1b — secret #2>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
WEB_ORIGIN=https://<your-vercel-app>.vercel.app
API_ORIGIN=https://<your-render-service>.onrender.com
NODE_ENV=production
LOG_LEVEL=info
```

Notes:

- `WEB_ORIGIN` is a **comma-separated list** — add multiple frontends if you have staging and prod:
  ```
  WEB_ORIGIN=https://erp.acme.com,https://staging.erp.acme.com
  ```
- Do **not** set `API_PORT` — Render injects `PORT` automatically and the app maps it for you.
- `DATABASE_URL` must end with `sslmode=require`. Neon connection strings include this by default.

### 3c. Deploy & run migrations

1. Click **Create Web Service**. Render builds and starts the API.
2. Watch the **Logs** tab for `[indus-api] listening on …`.
3. Hit `https://<render-url>/api/health` — should return `{ "status": "ok" }`.
4. **Run migrations once** (Render → Shell tab):
   ```bash
   pnpm --filter @indus/api db:migrate
   ```
5. **Seed demo data** (optional, recommended for the boss demo):
   ```bash
   pnpm --filter @indus/api db:seed
   ```
   This creates the demo tenant, an admin user, 5 vendors, 12 items, and the module master.

---

## 4. Deploy the web app to Vercel

### 4a. Import the project

1. Vercel dashboard → **Add New → Project** → import the same GitHub repo.
2. Fill in:

| Field | Value |
|---|---|
| **Framework Preset** | Next.js (auto-detected) |
| **Root Directory** | `apps/web` |
| **Build Command** | *(leave default — Vercel uses `next build`)* |
| **Install Command** | `pnpm install --frozen-lockfile` |
| **Output Directory** | *(leave default — `.next`)* |

> Vercel auto-detects pnpm from `pnpm-lock.yaml`. If it asks, choose **pnpm** as the package manager.

### 4b. Environment variables (Vercel → Settings → Environment Variables)

```
NEXT_PUBLIC_API_URL=https://<your-render-service>.onrender.com
```

That's the only one needed. The frontend doesn't see any secrets — auth is all JWT in `localStorage` against the API.

### 4c. Deploy

1. Click **Deploy**. Vercel builds and hosts.
2. Once green, open the Vercel URL → you should land on the login page.
3. Log in with the seeded admin (default from `db:seed` — check `apps/api/src/db/seed.ts` for credentials, and **change the password immediately** under Profile).

### 4d. Wire CORS back to Vercel

Vercel deploys give you a stable `<project>.vercel.app` URL plus per-PR preview URLs.

- Go back to Render → Environment → update `WEB_ORIGIN` to your real Vercel domain.
- If you want PR previews to work, add a wildcard-style list:
  ```
  WEB_ORIGIN=https://indus-erp.vercel.app,https://indus-erp-git-staging.vercel.app
  ```
  (The CORS check is exact-match on the `Origin` header. Add specific preview URLs as needed — we don't ship a wildcard for safety.)
- Render will redeploy. After ~1 min, the frontend can talk to the API.

---

## 5. Verify the deploy

1. **Health check** — `curl https://<api>/api/health` returns `{"status":"ok"}`.
2. **Login** — frontend login lands you in the dashboard.
3. **Create a PR** — click "New Requisition", fill 1 line item, save draft.
4. **Submit** the PR → it goes to `pending_l1`.
5. **Approve** (as the admin or a second user) → status becomes `approved`.
6. **Convert to PO** — the green "Next step" banner is clickable; the PO form pre-fills line items.

If any step fails, check:
- Render logs (most server-side errors)
- Browser DevTools → Network tab (CORS, 4xx/5xx responses)
- Vercel build logs (TypeScript errors in `apps/web`)

---

## 6. Domain (optional)

### 6a. Custom domain on Vercel

1. Vercel → **Settings → Domains** → add `erp.your-domain.com`.
2. Add the CNAME at your DNS provider as instructed.
3. **Update `WEB_ORIGIN`** on Render to include the new domain — otherwise CORS will block.

### 6b. Custom domain on Render

1. Render → **Settings → Custom Domains** → add `api.your-domain.com`.
2. Add the CNAME at your DNS provider.
3. **Update `NEXT_PUBLIC_API_URL`** on Vercel → redeploy the web app.

---

## 7. Day-2 operations

### Migrations

When you change Drizzle schemas (`apps/api/src/db/schema/*.ts`):

```powershell
# locally
pnpm --filter @indus/api db:generate   # creates a new .sql file under apps/api/drizzle/
git add apps/api/drizzle && git commit -m "migration: <what changed>"
git push
```

Then on Render → Shell:

```bash
pnpm --filter @indus/api db:migrate
```

Render does **not** auto-run migrations on deploy — keep it manual to avoid surprises.

### Logs

- Render → **Logs** tab — last 7 days on free tier.
- Pino outputs JSON; pipe to a log aggregator (Better Stack, Axiom) when traffic grows.

### Scaling

| Bottleneck | What to do |
|---|---|
| Render free tier sleeps | Upgrade to **Starter** ($7/mo) |
| Neon free tier scale-to-zero cold start (~500ms) | Upgrade to a paid Neon compute or use [`@neondatabase/serverless` with connection caching](https://neon.tech/docs/guides/serverless) (already enabled) |
| Frontend slow in India | Vercel Edge regions are global; no change needed |

### Secret rotation cadence

- JWT secrets: rotate every 6 months. **Rolling restart will invalidate all existing tokens** — users get logged out. Schedule for off-hours.
- Neon password: rotate yearly or any time team membership changes.

---

## 8. Troubleshooting

**Render build fails with `Cannot find module '@indus/shared'`**
→ The build command must run from the repo root, not `apps/api`. Verify "Root Directory" is **blank** in Render service settings.

**Vercel build fails with `Cannot resolve './schemas/index.js'`**
→ Make sure `transpilePackages: ["@indus/shared", "@indus/ui"]` is in `apps/web/next.config.mjs`. (It already is, but worth checking after edits.)

**Login works but every API call returns 401**
→ Token-clock skew between Vercel and Render. Confirm both `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are identical on Render (the web app doesn't need them) and that you didn't paste the same value into both.

**CORS error in browser console**
→ The exact `Origin` header sent by the browser must appear in Render's `WEB_ORIGIN`. Match casing and protocol (`https://`). Restart the Render service after changing.

**`ETIMEDOUT` when migrations run locally but Render works fine**
→ Your local network blocks Postgres port 5432. The runtime uses Neon's WebSocket driver over 443, so prod is unaffected. For local migrations, run them from Render's Shell or use a network without the block.

**"Only draft requisitions can be edited" when clicking Edit on a PR**
→ Expected. Once a PR is submitted/approved/rejected it's immutable for audit reasons. Use **Cancel** + create a new PR if you need to change a submitted one.
