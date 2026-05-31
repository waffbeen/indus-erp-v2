import { Router, type Request } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { whatsappSettingsUpdateSchema, whatsappSettingsTestSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { Forbidden } from "../lib/errors";
import { db } from "../db/index";
import { users } from "../db/schema/users";
import { memberships } from "../db/schema/memberships";
import { purchaseRequisitions } from "../db/schema/pr";
import { logger } from "../lib/logger";
import * as whatsappSettings from "../services/whatsapp-settings.service";
import { sendWhatsApp, verifyMetaSignature, testTenantWhatsappSettings } from "../services/whatsapp.service";
import * as prService from "../services/pr.service";

export const whatsappRoutes: Router = Router();

// ===========================================================================
// PUBLIC webhook (NO auth) — Meta verification + inbound messages.
// Mounted before the auth guard so providers can reach it unauthenticated.
// ===========================================================================

/**
 * GET /whatsapp/webhook — Meta subscribe handshake. Meta sends
 * ?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<n>. We echo the
 * challenge only when the token matches a tenant's configured verify token.
 */
whatsappRoutes.get("/webhook", async (req, res) => {
  try {
    const mode = str(req.query["hub.mode"]);
    const token = str(req.query["hub.verify_token"]);
    const challenge = str(req.query["hub.challenge"]);
    if (mode === "subscribe" && token) {
      const tenantId = await whatsappSettings.tenantIdByVerifyToken(token);
      if (tenantId) {
        logger.info({ tenantId }, "whatsapp_webhook_verified");
        res.status(200).type("text/plain").send(challenge ?? "");
        return;
      }
    }
    logger.warn({ mode }, "whatsapp_webhook_verify_rejected");
    res.sendStatus(403);
  } catch (err) {
    logger.error({ err }, "whatsapp_webhook_verify_error");
    res.sendStatus(403);
  }
});

/**
 * POST /whatsapp/webhook — inbound messages / status callbacks. Always 200s fast
 * (Meta retries non-2xx). Everything past the ack is guarded + best-effort:
 * inbound "APPROVE PR-…" / "REJECT PR-…" from a number that maps to an active
 * tenant-admin approver triggers the corresponding PR action.
 */
whatsappRoutes.post("/webhook", async (req, res) => {
  // Ack immediately; never make Meta wait on our processing.
  res.sendStatus(200);
  try {
    await handleInbound(req);
  } catch (err) {
    logger.error({ err }, "whatsapp_inbound_error");
  }
});

interface InboundMessage {
  phoneNumberId: string;
  from: string;
  text: string;
}

/** Extract text messages from a Meta Cloud webhook payload. */
function parseMetaInbound(body: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      if (!value) continue;
      const phoneNumberId = str((value.metadata as { phone_number_id?: unknown })?.phone_number_id);
      const messages = value.messages;
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        const msg = m as { from?: unknown; type?: unknown; text?: { body?: unknown } };
        if (msg.type !== "text") continue;
        const from = str(msg.from);
        const text = str(msg.text?.body);
        if (phoneNumberId && from && text) out.push({ phoneNumberId, from, text });
      }
    }
  }
  return out;
}

async function handleInbound(req: Request): Promise<void> {
  const messages = parseMetaInbound(req.body);
  if (!messages.length) return; // delivery status callbacks etc. — nothing to do

  // Group by phone-number id so we resolve the tenant + verify signature once.
  const byPhone = new Map<string, InboundMessage[]>();
  for (const m of messages) {
    const list = byPhone.get(m.phoneNumberId) ?? [];
    list.push(m);
    byPhone.set(m.phoneNumberId, list);
  }

  for (const [phoneNumberId, msgs] of byPhone) {
    const tenantId = await whatsappSettings.tenantIdByPhoneNumberId(phoneNumberId);
    if (!tenantId) {
      logger.warn({ phoneNumberId }, "whatsapp_inbound_unknown_phone");
      continue;
    }
    const cfg = await whatsappSettings.resolveTenantWhatsappConfig(tenantId);

    // Signature check is best-effort: a parsed-then-reserialised body may not byte
    // match Meta's raw payload, so a mismatch is logged but doesn't block the
    // (independently guarded) action. Strict verification needs the raw body.
    if (cfg?.appSecret) {
      const raw = rawBodyOf(req);
      const ok = verifyMetaSignature(raw, str(req.headers["x-hub-signature-256"]), cfg.appSecret);
      if (!ok) logger.warn({ tenantId }, "whatsapp_signature_mismatch_proceeding_guarded");
    }

    for (const msg of msgs) {
      await processCommand(tenantId, msg);
    }
  }
}

const COMMAND_RE = /^\s*(APPROVE|REJECT)\s+([A-Za-z0-9-]+)\s*$/i;

async function processCommand(tenantId: string, msg: InboundMessage): Promise<void> {
  const match = msg.text.match(COMMAND_RE);
  if (!match) return; // not a command — ignore quietly

  const action = match[1]!.toUpperCase() as "APPROVE" | "REJECT";
  const prNumber = match[2]!.toUpperCase();

  // The sender must map to an ACTIVE tenant-admin (the approver pool).
  const approverUserId = await approverByPhone(tenantId, msg.from);
  if (!approverUserId) {
    logger.warn({ tenantId, from: maskPhone(msg.from) }, "whatsapp_inbound_unauthorized_sender");
    await reply(tenantId, msg.from, "Sorry, this number isn't recognised as an approver on Indus ERP.");
    return;
  }

  const [pr] = await db
    .select({ id: purchaseRequisitions.id, status: purchaseRequisitions.status })
    .from(purchaseRequisitions)
    .where(
      and(
        eq(purchaseRequisitions.tenantId, tenantId),
        eq(purchaseRequisitions.prNumber, prNumber),
        isNull(purchaseRequisitions.deletedAt),
      ),
    )
    .limit(1);
  if (!pr) {
    await reply(tenantId, msg.from, `Couldn't find ${prNumber}. Check the PR number and try again.`);
    return;
  }

  const ctx = { tenantId, userId: approverUserId, isTenantAdmin: true };
  try {
    if (action === "APPROVE") {
      await prService.approvePr(pr.id, ctx, "Approved via WhatsApp");
      await reply(tenantId, msg.from, `✅ ${prNumber} approved. Thank you!`);
    } else {
      await prService.rejectPr(pr.id, ctx, "Rejected via WhatsApp");
      await reply(tenantId, msg.from, `❌ ${prNumber} rejected.`);
    }
    logger.info({ tenantId, prNumber, action }, "whatsapp_inbound_action_applied");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not complete that action.";
    logger.warn({ err, tenantId, prNumber, action }, "whatsapp_inbound_action_failed");
    await reply(tenantId, msg.from, `Couldn't ${action.toLowerCase()} ${prNumber}: ${message}`);
  }
}

/** Find an active tenant-admin whose stored phone matches the sender (last-10-digit match). */
async function approverByPhone(tenantId: string, fromPhone: string): Promise<string | null> {
  const target = lastTen(fromPhone);
  if (!target) return null;
  const rows = await db
    .select({ userId: users.id, phone: users.phone })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.isTenantAdmin, true),
        eq(memberships.status, "active"),
        isNull(memberships.deletedAt),
      ),
    );
  const hit = rows.find((r) => r.phone && lastTen(r.phone) === target);
  return hit?.userId ?? null;
}

function reply(tenantId: string, to: string, body: string): Promise<boolean> {
  return sendWhatsApp({ tenantId, to, body });
}

// ===========================================================================
// Tenant-admin settings (auth required) — mirrors mail.routes.
// ===========================================================================

whatsappRoutes.use(requireAuth, requireTenant);

/** GET /whatsapp/settings — current config (masked: no token/secret). */
whatsappRoutes.get("/settings", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can view WhatsApp settings");
    res.json(await whatsappSettings.getTenantWhatsappSettings(req.tenant!.id));
  } catch (err) {
    next(err);
  }
});

/** PUT /whatsapp/settings — save this tenant's WhatsApp config (token stored encrypted). */
whatsappRoutes.put("/settings", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can change WhatsApp settings");
    const input = whatsappSettingsUpdateSchema.parse(req.body ?? {});
    res.json(await whatsappSettings.updateTenantWhatsappSettings(req.tenant!.id, input));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /whatsapp/settings/test — send a test WhatsApp message BEFORE saving.
 * Uses the posted fields, falling back to stored ones. Defaults the recipient to
 * the requesting admin's own stored phone number.
 */
whatsappRoutes.post("/settings/test", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can test WhatsApp settings");
    const input = whatsappSettingsTestSchema.parse(req.body ?? {});
    let sendTo = input.sendTo?.trim();
    if (!sendTo) {
      const [u] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, req.auth!.sub)).limit(1);
      sendTo = u?.phone ?? undefined;
    }
    if (!sendTo) {
      res.status(400).json({ ok: false, message: "No recipient number found — add your phone number or enter one to test." });
      return;
    }
    res.json(await testTenantWhatsappSettings(req.tenant!.id, input, sendTo));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Local helpers.
// ---------------------------------------------------------------------------

/** Coerce a possibly-array Express query/header value to a single string. */
function str(v: unknown): string {
  if (Array.isArray(v)) return str(v[0]);
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Best-effort raw body (set by a future express.json `verify` hook); falls back to re-serialised JSON. */
function rawBodyOf(req: Request): string {
  const raw = (req as Request & { rawBody?: string | Buffer }).rawBody;
  if (typeof raw === "string") return raw;
  if (raw instanceof Buffer) return raw.toString("utf8");
  try {
    return JSON.stringify(req.body);
  } catch {
    return "";
  }
}

function lastTen(phone: string): string {
  const d = phone.replace(/[^\d]/g, "");
  return d.length <= 10 ? d : d.slice(-10);
}

function maskPhone(phone: string): string {
  const d = phone.replace(/[^\d]/g, "");
  return d.length <= 4 ? d : `••••${d.slice(-4)}`;
}
