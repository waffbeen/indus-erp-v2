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
   * domain or their shared sandbox sender (onboarding@resend.dev). Override in
   * production once your domain is verified.
   */
  MAIL_FROM: z.string().default("Indus ERP <onboarding@resend.dev>"),
  /** Used for return links in emails — e.g. "https://prathvis-erp.vercel.app". */
  PUBLIC_WEB_URL: z.string().optional(),
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
