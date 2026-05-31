import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { tenantWhatsappSettings } from "../db/schema/tenant_whatsapp_settings";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { logger } from "../lib/logger";
import type {
  WhatsappSettingsUpdate,
  WhatsappSettingsView,
  WhatsappProvider,
} from "@indus/shared";

/**
 * Per-tenant WhatsApp config — the exact analogue of mail-settings.service.
 * Read masked (`hasApiToken` / `hasAppSecret`), write encrypted, and `resolve`
 * the decrypted credentials for actually sending / verifying webhooks.
 */

export interface ResolvedWhatsappConfig {
  provider: WhatsappProvider;
  phoneNumberId: string;
  apiToken: string;
  fromNumber: string | null;
  /** Meta app secret for inbound webhook signature verification (null when unset). */
  appSecret: string | null;
  verifyToken: string | null;
}

/** Decrypted config for sending / inbound handling, or null when not usable. */
export async function resolveTenantWhatsappConfig(
  tenantId: string,
): Promise<ResolvedWhatsappConfig | null> {
  const [row] = await db
    .select()
    .from(tenantWhatsappSettings)
    .where(eq(tenantWhatsappSettings.tenantId, tenantId))
    .limit(1);
  if (!row || !row.isActive || !row.phoneNumberId || !row.apiTokenCipher) return null;

  let apiToken: string;
  try {
    apiToken = decryptSecret(row.apiTokenCipher);
  } catch (err) {
    logger.error({ err, tenantId }, "whatsapp_token_decrypt_failed");
    return null;
  }

  let appSecret: string | null = null;
  if (row.appSecretCipher) {
    try {
      appSecret = decryptSecret(row.appSecretCipher);
    } catch (err) {
      logger.warn({ err, tenantId }, "whatsapp_app_secret_decrypt_failed");
    }
  }

  return {
    provider: (row.provider as WhatsappProvider) || "meta_cloud",
    phoneNumberId: row.phoneNumberId,
    apiToken,
    fromNumber: row.fromNumber,
    appSecret,
    verifyToken: row.verifyToken,
  };
}

export async function getTenantWhatsappSettings(tenantId: string): Promise<WhatsappSettingsView> {
  const [row] = await db
    .select()
    .from(tenantWhatsappSettings)
    .where(eq(tenantWhatsappSettings.tenantId, tenantId))
    .limit(1);
  if (!row) {
    return {
      provider: "meta_cloud",
      phoneNumberId: null,
      fromNumber: null,
      hasApiToken: false,
      hasAppSecret: false,
      verifyToken: null,
      configured: false,
      lastTestedAt: null,
      lastTestOk: null,
    };
  }
  return {
    provider: (row.provider as WhatsappProvider) || "meta_cloud",
    phoneNumberId: row.phoneNumberId,
    fromNumber: row.fromNumber,
    hasApiToken: Boolean(row.apiTokenCipher),
    hasAppSecret: Boolean(row.appSecretCipher),
    verifyToken: row.verifyToken,
    configured: Boolean(row.phoneNumberId && row.apiTokenCipher && row.isActive),
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    lastTestOk: row.lastTestOk,
  };
}

/** Find the tenant that owns a given inbound verify token (webhook GET challenge). */
export async function tenantIdByVerifyToken(verifyToken: string): Promise<string | null> {
  if (!verifyToken) return null;
  const [row] = await db
    .select({ tenantId: tenantWhatsappSettings.tenantId })
    .from(tenantWhatsappSettings)
    .where(eq(tenantWhatsappSettings.verifyToken, verifyToken))
    .limit(1);
  return row?.tenantId ?? null;
}

/** Find the tenant that owns a given Meta Cloud phone-number id (inbound message routing). */
export async function tenantIdByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  if (!phoneNumberId) return null;
  const [row] = await db
    .select({ tenantId: tenantWhatsappSettings.tenantId })
    .from(tenantWhatsappSettings)
    .where(eq(tenantWhatsappSettings.phoneNumberId, phoneNumberId))
    .limit(1);
  return row?.tenantId ?? null;
}

export async function updateTenantWhatsappSettings(
  tenantId: string,
  input: WhatsappSettingsUpdate,
): Promise<WhatsappSettingsView> {
  const set: Record<string, unknown> = {
    provider: input.provider,
    phoneNumberId: input.phoneNumberId.trim(),
    fromNumber: input.fromNumber?.trim() || null,
    verifyToken: input.verifyToken?.trim() || null,
    isActive: true,
    updatedAt: new Date(),
  };
  if (input.apiToken) set.apiTokenCipher = encryptSecret(input.apiToken);
  if (input.appSecret) set.appSecretCipher = encryptSecret(input.appSecret);

  await db
    .insert(tenantWhatsappSettings)
    .values({
      tenantId,
      provider: input.provider,
      phoneNumberId: input.phoneNumberId.trim(),
      fromNumber: input.fromNumber?.trim() || null,
      verifyToken: input.verifyToken?.trim() || null,
      apiTokenCipher: (set.apiTokenCipher as string | undefined) ?? null,
      appSecretCipher: (set.appSecretCipher as string | undefined) ?? null,
    })
    .onConflictDoUpdate({ target: tenantWhatsappSettings.tenantId, set });

  return getTenantWhatsappSettings(tenantId);
}

/** Record a test outcome on the tenant's row (if one exists). */
export async function recordWhatsappTest(tenantId: string, ok: boolean): Promise<void> {
  await db
    .update(tenantWhatsappSettings)
    .set({ lastTestedAt: new Date(), lastTestOk: ok })
    .where(eq(tenantWhatsappSettings.tenantId, tenantId));
}
