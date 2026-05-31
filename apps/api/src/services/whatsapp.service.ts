import crypto from "node:crypto";
import { logger } from "../lib/logger";
import {
  resolveTenantWhatsappConfig,
  recordWhatsappTest,
  type ResolvedWhatsappConfig,
} from "./whatsapp-settings.service";
import type { WhatsappProvider, WhatsappSettingsTest, WhatsappTestResult } from "@indus/shared";

/**
 * Outbound WhatsApp — the exact analogue of mail.service.sendMail.
 *
 * Design rules (identical contract to sendMail):
 *  - Resolves the tenant's OWN WhatsApp credentials (per-tenant, encrypted).
 *  - When the tenant has none configured, every send is a graceful no-op (warned)
 *    so dev / pre-config workspaces still work end-to-end.
 *  - sendWhatsApp is fire-and-forget: it NEVER throws into the caller. A WhatsApp
 *    failure must not roll back a business action. Callers get a boolean.
 *  - Talks to the provider's REST API directly via `fetch` — no SDK dependency.
 *    Default provider is Meta WhatsApp Cloud API; gupshup / twilio sit behind a
 *    small switch.
 */

/** Can this tenant send WhatsApp messages? */
export async function isWhatsAppConfiguredFor(tenantId: string): Promise<boolean> {
  return Boolean(await resolveTenantWhatsappConfig(tenantId));
}

export interface WhatsAppMessage {
  tenantId: string;
  /** Recipient phone in E.164 (with or without "+"); normalised per provider. */
  to: string;
  body: string;
}

export async function sendWhatsApp(msg: WhatsAppMessage): Promise<boolean> {
  const to = (msg.to ?? "").trim();
  if (!to || !msg.body?.trim()) return false;

  const cfg = await resolveTenantWhatsappConfig(msg.tenantId);
  if (!cfg) {
    logger.warn({ to: maskPhone(to), tenantId: msg.tenantId }, "whatsapp_not_configured_logging_only");
    return false;
  }

  try {
    return await dispatch(cfg, to, msg.body);
  } catch (err) {
    // Never propagate — a WhatsApp failure must not break the calling flow.
    logger.error({ err, to: maskPhone(to), tenantId: msg.tenantId }, "whatsapp_send_error");
    return false;
  }
}

/**
 * Verify + send a test message BEFORE saving. Uses the posted fields, falling
 * back to stored ones, mirroring mail-settings.testTenantMailSettings.
 */
export async function testTenantWhatsappSettings(
  tenantId: string,
  input: WhatsappSettingsTest,
  sendTo: string,
): Promise<WhatsappTestResult> {
  const stored = await resolveTenantWhatsappConfig(tenantId);

  const provider: WhatsappProvider = input.provider ?? stored?.provider ?? "meta_cloud";
  const phoneNumberId = (input.phoneNumberId ?? stored?.phoneNumberId ?? "").trim();
  const apiToken = (input.apiToken ?? stored?.apiToken ?? "").trim();
  const fromNumber = (input.fromNumber ?? stored?.fromNumber ?? null);

  if (!phoneNumberId) return { ok: false, message: "A phone number ID (or app name / account SID) is required." };
  if (!apiToken) return { ok: false, message: "An API token is required to test the connection." };
  if (!sendTo.trim()) return { ok: false, message: "Enter a WhatsApp number to send the test to." };

  const cfg: ResolvedWhatsappConfig = {
    provider,
    phoneNumberId,
    apiToken,
    fromNumber,
    appSecret: null,
    verifyToken: null,
  };

  let result: WhatsappTestResult;
  try {
    const ok = await dispatch(
      cfg,
      sendTo,
      "✅ Indus ERP test message — your WhatsApp settings are working. You'll now get approval & receipt alerts here.",
    );
    result = ok
      ? { ok: true, message: `Test message sent to ${sendTo}. Check WhatsApp to confirm.` }
      : { ok: false, message: "The provider rejected the message. Check the number ID, token and sender number." };
  } catch (err) {
    result = { ok: false, message: err instanceof Error ? err.message : "Connection failed." };
  }

  // Best-effort: record outcome on the row when one exists (no-op otherwise).
  try {
    await recordWhatsappTest(tenantId, result.ok);
  } catch {
    /* ignore — never fail the test on a bookkeeping write */
  }
  return result;
}

/**
 * Verify the X-Hub-Signature-256 header on an inbound Meta webhook POST. Meta
 * signs the RAW request body with the app secret (HMAC-SHA256). Returns false on
 * any mismatch or malformed input. Best-effort: callers treat a failure as
 * "don't act on the inbound command" rather than crash.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader || !appSecret || !rawBody) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Provider dispatch — each returns true on a 2xx provider response.
// ---------------------------------------------------------------------------

async function dispatch(cfg: ResolvedWhatsappConfig, to: string, body: string): Promise<boolean> {
  switch (cfg.provider) {
    case "gupshup":
      return sendGupshup(cfg, to, body);
    case "twilio":
      return sendTwilio(cfg, to, body);
    case "meta_cloud":
    default:
      return sendMetaCloud(cfg, to, body);
  }
}

/** Meta WhatsApp Cloud API — graph.facebook.com/<phoneNumberId>/messages. */
async function sendMetaCloud(cfg: ResolvedWhatsappConfig, to: string, body: string): Promise<boolean> {
  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(cfg.phoneNumberId)}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: digits(to),
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  return okOrLog(res, "meta_cloud", to);
}

/** Gupshup WhatsApp API — api.gupshup.io/wa/api/v1/msg (form-encoded). */
async function sendGupshup(cfg: ResolvedWhatsappConfig, to: string, body: string): Promise<boolean> {
  const form = new URLSearchParams({
    channel: "whatsapp",
    source: digits(cfg.fromNumber ?? ""),
    destination: digits(to),
    message: JSON.stringify({ type: "text", text: body }),
    "src.name": cfg.phoneNumberId, // Gupshup app name
  });
  const res = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
    method: "POST",
    headers: {
      apikey: cfg.apiToken,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  return okOrLog(res, "gupshup", to);
}

/** Twilio WhatsApp — api.twilio.com Messages (basic auth, form-encoded). */
async function sendTwilio(cfg: ResolvedWhatsappConfig, to: string, body: string): Promise<boolean> {
  const accountSid = cfg.phoneNumberId; // reused as Twilio Account SID
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${cfg.apiToken}`).toString("base64");
  const form = new URLSearchParams({
    From: `whatsapp:+${digits(cfg.fromNumber ?? "")}`,
    To: `whatsapp:+${digits(to)}`,
    Body: body,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  return okOrLog(res, "twilio", to);
}

async function okOrLog(res: Response, provider: string, to: string): Promise<boolean> {
  if (res.ok) {
    logger.info({ provider, to: maskPhone(to) }, "whatsapp_sent");
    return true;
  }
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 500);
  } catch {
    /* ignore body read failure */
  }
  logger.error({ provider, status: res.status, detail, to: maskPhone(to) }, "whatsapp_send_failed");
  return false;
}

/** Strip everything but digits (provider APIs want bare E.164 digits, no "+"). */
function digits(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/** Don't log full phone numbers — show only the last 4. */
function maskPhone(phone: string): string {
  const d = digits(phone);
  return d.length <= 4 ? d : `••••${d.slice(-4)}`;
}
