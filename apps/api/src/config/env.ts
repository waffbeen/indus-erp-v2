import "dotenv/config";
import { z } from "zod";

/**
 * Render / Railway / Fly.io expose the listen port via `PORT`.
 * Our config calls it `API_PORT`; if only `PORT` is set, treat them as equivalent.
 */
if (process.env.PORT && !process.env.API_PORT) {
  process.env.API_PORT = process.env.PORT;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Neon connection string)"),

  API_PORT: z.coerce.number().int().positive().default(4000),
  API_ORIGIN: z.string().url().default("http://localhost:4000"),
  /** Comma-separated list of allowed origins. Example: "https://erp.acme.com,https://staging.acme.com". */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  /**
   * Transactional email via Resend. When RESEND_API_KEY is absent, all sends
   * are no-ops (logged) so the app still works in dev / pre-config without
   * breaking approval or receipt flows.
   */
  RESEND_API_KEY: z.string().optional(),
  /**
   * From address used on outgoing mail. Resend requires either a verified
   * domain or their shared sandbox sender (onboarding@resend.dev). For SMTP use
   * a real mailbox you own (e.g. "Indus ERP <noreply@yourdomain.com>").
   */
  MAIL_FROM: z.string().default("Indus ERP <onboarding@resend.dev>"),
  /** Used for return links in emails — e.g. "https://prathvis-erp.vercel.app". */
  PUBLIC_WEB_URL: z.string().optional(),

  /**
   * SMTP transport (preferred over Resend when SMTP_HOST is set). Lets you send
   * from an existing mailbox (e.g. the same one the legacy app used). When none
   * of SMTP_HOST / RESEND_API_KEY is configured, mail sends are graceful no-ops.
   */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  /**
   * AI assistant — platform-level fallback keys, used when a tenant has not
   * stored their own key in `tenant_ai_settings`. Each tenant can override these
   * with their own key from the Settings screen (no redeploy needed).
   */
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  /** Default provider when only platform keys are present: gemini | anthropic | openai. */
  AI_DEFAULT_PROVIDER: z.enum(["gemini", "anthropic", "openai"]).optional(),
  GEMINI_MODEL: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  /** Secret used to encrypt stored per-tenant API keys. Falls back to JWT_ACCESS_SECRET. */
  AI_KEY_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

/** Parsed list of CORS-allowed origins. */
export const allowedOrigins = env.WEB_ORIGIN
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Build an absolute link back into the web app — used for "View" links in
 * emails. Prefers PUBLIC_WEB_URL, falling back to the first allowed origin.
 */
export function appUrl(path = ""): string {
  const base = (env.PUBLIC_WEB_URL || allowedOrigins[0] || "").replace(/\/+$/, "");
  if (!base) return path;
  return path ? `${base}/${path.replace(/^\/+/, "")}` : base;
}
