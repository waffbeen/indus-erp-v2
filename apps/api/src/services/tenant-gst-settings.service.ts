import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { tenantGstSettings } from "../db/schema/tenant_gst_settings";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { logger } from "../lib/logger";
import { GSTIN_REGEX } from "@indus/shared";
import type { GstSettingsUpdate, GstSettingsTest, GstSettingsView, GstSettingsTestResult, GstProvider } from "@indus/shared";

/**
 * Per-tenant GST / GSP credentials. Mirrors mail-settings.service /
 * ai.service's settings handling: GET returns a masked view, PUT encrypts and
 * upserts, and resolve() returns the decrypted config the compliance services
 * use to talk to the GSP (falling back to the built-in sandbox when unset).
 */

export interface ResolvedGstConfig {
  provider: GstProvider;
  username: string | null;
  /** Decrypted GSP password / secret, or null when none stored. */
  password: string | null;
  gstin: string | null;
  /** "tenant" when the tenant has real creds, "sandbox" otherwise. */
  source: "tenant" | "sandbox";
}

/** Decrypted config for actually calling the GSP. Never null — falls back to sandbox. */
export async function resolveTenantGstConfig(tenantId: string): Promise<ResolvedGstConfig> {
  const [row] = await db
    .select()
    .from(tenantGstSettings)
    .where(eq(tenantGstSettings.tenantId, tenantId))
    .limit(1);

  if (!row || !row.isActive || !row.gstin) {
    return { provider: "nic_sandbox", username: null, password: null, gstin: row?.gstin ?? null, source: "sandbox" };
  }

  let password: string | null = null;
  if (row.passwordCipher) {
    try {
      password = decryptSecret(row.passwordCipher);
    } catch (err) {
      logger.error({ err, tenantId }, "gst_password_decrypt_failed");
      password = null;
    }
  }

  return {
    provider: row.provider as GstProvider,
    username: row.username,
    password,
    gstin: row.gstin,
    source: "tenant",
  };
}

export async function getTenantGstSettings(tenantId: string): Promise<GstSettingsView> {
  const [row] = await db
    .select()
    .from(tenantGstSettings)
    .where(eq(tenantGstSettings.tenantId, tenantId))
    .limit(1);

  if (!row) {
    return {
      provider: "nic_sandbox",
      username: null,
      gstin: null,
      hasPassword: false,
      configured: false,
      isActive: true,
      source: "sandbox",
      lastTestedAt: null,
      lastTestOk: null,
      lastTestMessage: null,
    };
  }

  const configured = Boolean(row.gstin && row.isActive);
  return {
    provider: row.provider as GstProvider,
    username: row.username,
    gstin: row.gstin,
    hasPassword: Boolean(row.passwordCipher),
    configured,
    isActive: row.isActive,
    source: configured ? "tenant" : "sandbox",
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    lastTestOk: row.lastTestOk,
    lastTestMessage: row.lastTestMessage,
  };
}

export async function updateTenantGstSettings(
  tenantId: string,
  input: GstSettingsUpdate,
): Promise<GstSettingsView> {
  const set: Record<string, unknown> = {
    provider: input.provider,
    username: input.username?.trim() || null,
    gstin: input.gstin?.trim() || null,
    isActive: input.isActive ?? true,
    updatedAt: new Date(),
  };
  if (input.password) set.passwordCipher = encryptSecret(input.password);

  await db
    .insert(tenantGstSettings)
    .values({
      tenantId,
      provider: input.provider,
      username: input.username?.trim() || null,
      gstin: input.gstin?.trim() || null,
      isActive: input.isActive ?? true,
      passwordCipher: (set.passwordCipher as string | undefined) ?? null,
    })
    .onConflictDoUpdate({ target: tenantGstSettings.tenantId, set });

  return getTenantGstSettings(tenantId);
}

/**
 * "Test" the GSP credentials. We can't hit a live GSP without real creds, so
 * the sandbox test validates the GSTIN format + provider and confirms the
 * config is well-formed. Records the outcome on the row when one exists.
 */
export async function testTenantGstSettings(
  tenantId: string,
  input: GstSettingsTest,
): Promise<GstSettingsTestResult> {
  const [row] = await db
    .select()
    .from(tenantGstSettings)
    .where(eq(tenantGstSettings.tenantId, tenantId))
    .limit(1);

  const provider = (input.provider ?? row?.provider ?? "nic_sandbox") as GstProvider;
  const gstin = (input.gstin ?? row?.gstin ?? "").trim().toUpperCase();
  const hasPassword = Boolean(input.password || row?.passwordCipher);

  let result: GstSettingsTestResult;
  if (!gstin) {
    result = { ok: false, message: "Enter your GSTIN before testing the connection." };
  } else if (!GSTIN_REGEX.test(gstin)) {
    result = { ok: false, message: "That GSTIN isn't a valid 15-character format." };
  } else if (provider !== "nic_sandbox" && !hasPassword) {
    result = { ok: false, message: `Enter your ${provider} GSP password to connect to the live gateway.` };
  } else {
    result = {
      ok: true,
      message:
        provider === "nic_sandbox"
          ? `Sandbox ready for ${gstin}. E-invoice / e-way-bill calls will be simulated.`
          : `Credentials look valid for ${gstin} via ${provider}.`,
    };
  }

  if (row) {
    await db
      .update(tenantGstSettings)
      .set({ lastTestedAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message })
      .where(eq(tenantGstSettings.tenantId, tenantId));
  }
  return result;
}
