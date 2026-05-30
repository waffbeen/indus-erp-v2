# Security TODO (operational)

These are security tasks that **cannot be done in code** — they require rotating
secrets, changing infrastructure, or admin action. Do them before (or immediately
after) the boss demo / first real-customer onboarding.

> ⚠️ Do **not** paste real secrets into this file. It is committed to the repo.
> Use it only as a checklist; keep the actual values in your secret manager / host
> dashboard (Render env vars, Neon console, etc.).

## Credentials to rotate (assume the current ones are compromised)

- [ ] **Rotate the Neon Postgres password.** The connection string in `.env`
      (`DATABASE_URL`) has been shared during development. Generate a new password
      in the Neon console and update `DATABASE_URL` in every environment.
- [ ] **Rotate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.** Generate fresh
      ≥32-char random values (e.g. `openssl rand -base64 48`). Rotating these
      invalidates all existing access/refresh tokens — users will be logged out,
      which is the desired effect if a secret leaked.
- [ ] **Rotate any third-party API keys committed/shared in `.env`**: `RESEND_API_KEY`,
      `GEMINI_API_KEY`, `OPENAI_API_KEY`, `UPSTASH_REDIS_TOKEN` (and the AI lane's
      `ANTHROPIC_API_KEY` once added). Re-issue from each provider's dashboard.

## Default accounts

- [ ] **Change the default admin password `ChangeMe!2026`** (seeded by
      `apps/api/src/db/seed.ts`). Either change it on first login or reset it
      directly. Confirm no production tenant is left using the seed default.
- [ ] Audit seeded/demo users — disable or delete any that shouldn't exist in a
      customer-facing environment.

## Database / environment separation

- [ ] **Provision a dedicated production database**, separate from dev/staging.
      Dev and prod currently risk pointing at the same Neon instance. Give prod its
      own Neon project (or at least its own branch + role) so a dev mistake can't
      touch real customer data.
- [ ] Lock down DB network access where possible (IP allow-list / Neon's allowed
      IPs) and ensure least-privilege DB roles (the app role should not be a
      superuser).
- [ ] Verify `NODE_ENV=production` is set in the production host so cookie/security
      defaults and connection-pool sizing take their production paths.

## Application config to confirm in production (set in code, verify in env)

- [ ] `WEB_ORIGIN` is set to the exact production web origin(s), comma-separated.
      CORS reads this allow-list (`apps/api/src/config/env.ts` → `allowedOrigins`);
      a wildcard is **not** used. Do not add `*`.
- [ ] Login/refresh rate limiting is active (`apps/api/src/routes/auth.routes.ts`,
      `express-rate-limit`: 20 requests / 15 min / IP). Tune the threshold for real
      traffic; consider a stricter limit keyed on email for credential-stuffing.
- [ ] `MAIL_FROM` uses a **verified Resend domain** sender in production (the dev
      default is Resend's shared `onboarding@resend.dev` sandbox sender).

## Cookies (currently N/A — note for the future)

Auth is **token-based**: the API returns `accessToken` / `refreshToken` in the JSON
body and the client sends them via the `Authorization` header. There are **no auth
cookies** today, so there is nothing to harden here right now.

- [ ] **If** session cookies are introduced later (e.g. refresh-token cookie), set
      `httpOnly: true`, `secure: true` (prod), and `sameSite: "lax"` (or `"strict"`),
      scoped to the API path, with a sensible `maxAge`.

## Nice-to-have hardening (follow-ups)

- [ ] Add `@sentry/node` error reporting with PII scrubbing (emails, GSTINs) and a
      `tenantId` tag (see the Testing/Observability notes in `PARALLEL_BUILD_NOTES.md`).
- [ ] Enforce HTTPS-only at the edge and confirm `app.set("trust proxy", 1)` matches
      the actual proxy hop count on the host.
- [ ] Review `express.json({ limit: "2mb" })` against expected payload sizes to bound
      request-body DoS.
