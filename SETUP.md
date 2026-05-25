# Setup — step by step (Windows)

## TL;DR — automated path (recommended)

```powershell
# 1. Install Node 20+ from  https://nodejs.org/   (LTS button — one .msi installer)
# 2. Open PowerShell in this folder, then:
.\setup.ps1
```

The script handles everything: pnpm, env files, JWT secrets, install, migrate, seed.

Then:
```powershell
pnpm dev
```

Open <http://localhost:3000>. Login with `ramesh@acme.in` / `Demo!2026`.

---

## Manual path (if you prefer typing every command yourself)

### Pre-requisites

1. **Node.js 20 or newer** — https://nodejs.org/ (download the LTS `.msi`, install with defaults)
2. **A Postgres database** — easiest: free Neon account at https://neon.tech
   - Sign up → "Create project" → accept defaults → on the dashboard, click "Connection details" → copy the **Pooled connection string**
   - Looks like: `postgresql://user:pass@ep-xxxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`

### Commands

Open PowerShell in `d:\25 May\indus-erp-v2`:

```powershell
# Verify Node
node --version          # should print v20.x.x or higher

# Enable pnpm
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version          # should print 9.x.x

# Copy env files
copy .env.example .env
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env

# Generate two JWT secrets (run twice, paste each output into the two slots)
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# Now edit apps\api\.env in any text editor:
#   - DATABASE_URL=<paste the Neon connection string>
#   - JWT_ACCESS_SECRET=<paste first generated secret>
#   - JWT_REFRESH_SECRET=<paste second generated secret>
# Also set DATABASE_URL in the root .env (some tools read it from there).

# Install all workspace deps
pnpm install

# Database setup
pnpm db:generate                          # creates SQL migration files from Drizzle schemas
pnpm db:migrate                           # applies them to Neon
pnpm --filter @indus/api db:seed          # creates super-admin + demo tenant

# Start everything in dev mode (API on :4000, Web on :3000)
pnpm dev
```

Open <http://localhost:3000>.

### Demo credentials (seeded)

| Role | Email | Password |
|---|---|---|
| Tenant admin (Acme demo) | ramesh@acme.in | Demo!2026 |
| Procurement (Acme demo) | suresh@acme.in | Demo!2026 |
| Super admin (you/SaaS owner) | admin@indus.app | ChangeMe!2026 |

**Change all three passwords immediately after first login.**

---

## Troubleshooting

### `argon2` install fails with node-gyp error
This means precompiled Windows binary didn't ship for your Node version. Fix:
```powershell
pnpm add -D -w windows-build-tools     # admin PowerShell
# OR swap argon2 → @node-rs/argon2 (precompiled, no build needed):
pnpm --filter @indus/api remove argon2
pnpm --filter @indus/api add @node-rs/argon2
# Then in apps/api/src/lib/password.ts, change:
#   import argon2 from "argon2";   →   import { hash, verify } from "@node-rs/argon2";
#   argon2.hash(...)               →   hash(...)
#   argon2.verify(...)             →   verify(...)
```

### `pnpm db:migrate` fails with `ENOTFOUND` or SSL error
DATABASE_URL is wrong or missing `?sslmode=require`. Re-copy from Neon.

### Web shows "Failed to fetch" on login
API isn't running. Check the second pane of `pnpm dev` shows `indus_api_listening`.
Or `NEXT_PUBLIC_API_URL` in `apps/web/.env` doesn't match where API is listening.

### Port 3000 / 4000 already in use
```powershell
# Find what's using port 4000
Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
# Kill by PID
Stop-Process -Id <PID> -Force
```
Or change ports in `apps/web/package.json` (next dev -p) and `apps/api/.env` (API_PORT).

---

## Daily dev workflow

```powershell
pnpm dev          # start both apps
# CTRL+C to stop
```

After changing DB schema:
```powershell
pnpm db:generate  # creates new migration
pnpm db:migrate   # applies it
```

After pulling new code:
```powershell
pnpm install      # in case deps changed
pnpm db:migrate   # in case schema changed
```
