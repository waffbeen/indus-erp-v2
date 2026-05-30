import nodemailer, { type Transporter } from "nodemailer";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { tenantMailSettings } from "../db/schema/tenant_mail_settings";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { logger } from "../lib/logger";
import type { MailSettingsUpdate, MailSettingsTest, MailSettingsView, MailTestResult } from "@indus/shared";

export interface ResolvedMailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  from: string;
}

function buildTransport(cfg: { host: string; port: number; secure: boolean; user?: string | null; pass?: string }): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
  });
}

/** Decrypted SMTP config for actually sending, or null when not usable. */
export async function resolveTenantMailConfig(tenantId: string): Promise<ResolvedMailConfig | null> {
  const [row] = await db
    .select()
    .from(tenantMailSettings)
    .where(eq(tenantMailSettings.tenantId, tenantId))
    .limit(1);
  if (!row || !row.isActive || !row.host || !row.fromAddress) return null;

  let pass: string | undefined;
  if (row.passwordCipher) {
    try {
      pass = decryptSecret(row.passwordCipher);
    } catch (err) {
      logger.error({ err, tenantId }, "mail_password_decrypt_failed");
      return null;
    }
  }
  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    auth: row.username ? { user: row.username, pass: pass ?? "" } : undefined,
    from: row.fromAddress,
  };
}

export async function getTenantMailSettings(tenantId: string): Promise<MailSettingsView> {
  const [row] = await db
    .select()
    .from(tenantMailSettings)
    .where(eq(tenantMailSettings.tenantId, tenantId))
    .limit(1);
  if (!row) {
    return {
      host: null,
      port: 587,
      secure: false,
      username: null,
      fromAddress: null,
      hasPassword: false,
      configured: false,
      lastTestedAt: null,
      lastTestOk: null,
    };
  }
  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    fromAddress: row.fromAddress,
    hasPassword: Boolean(row.passwordCipher),
    configured: Boolean(row.host && row.fromAddress && row.isActive),
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    lastTestOk: row.lastTestOk,
  };
}

export async function updateTenantMailSettings(
  tenantId: string,
  input: MailSettingsUpdate,
): Promise<MailSettingsView> {
  const set: Record<string, unknown> = {
    host: input.host.trim(),
    port: input.port,
    secure: input.secure,
    username: input.username?.trim() || null,
    fromAddress: input.fromAddress.trim(),
    isActive: true,
    updatedAt: new Date(),
  };
  if (input.password) set.passwordCipher = encryptSecret(input.password);

  await db
    .insert(tenantMailSettings)
    .values({
      tenantId,
      host: input.host.trim(),
      port: input.port,
      secure: input.secure,
      username: input.username?.trim() || null,
      fromAddress: input.fromAddress.trim(),
      passwordCipher: (set.passwordCipher as string | undefined) ?? null,
    })
    .onConflictDoUpdate({ target: tenantMailSettings.tenantId, set });

  return getTenantMailSettings(tenantId);
}

/**
 * Verify SMTP settings and send a test email. Uses the provided fields, falling
 * back to stored values (so the admin can test without re-typing the password).
 * Records the outcome on the row when one exists.
 */
export async function testTenantMailSettings(
  tenantId: string,
  input: MailSettingsTest,
  sendTo: string,
): Promise<MailTestResult> {
  const [row] = await db
    .select()
    .from(tenantMailSettings)
    .where(eq(tenantMailSettings.tenantId, tenantId))
    .limit(1);

  const host = (input.host ?? row?.host ?? "").trim();
  const port = input.port ?? row?.port ?? 587;
  const secure = input.secure ?? row?.secure ?? false;
  const username = (input.username ?? row?.username) || null;
  const from = (input.fromAddress ?? row?.fromAddress ?? "").trim();
  let pass = input.password;
  if (!pass && row?.passwordCipher) {
    try {
      pass = decryptSecret(row.passwordCipher);
    } catch {
      /* fall through — verify() will report the auth failure */
    }
  }

  if (!host) return { ok: false, message: "SMTP host is required." };
  if (!from) return { ok: false, message: "A 'From' address is required." };

  const transport = buildTransport({ host, port, secure, user: username, pass });
  let result: MailTestResult;
  try {
    await transport.verify();
    await transport.sendMail({
      from,
      to: sendTo,
      subject: "Indus ERP — test email ✓",
      html: `<div style="font-family:system-ui,Arial,sans-serif;line-height:1.6">
        <h2 style="margin:0 0 8px">SMTP is working 🎉</h2>
        <p>This is a test email from Indus ERP. Your email settings are configured correctly, so notifications will now send through this mailbox.</p>
      </div>`,
    });
    result = { ok: true, message: `Test email sent to ${sendTo}. Check the inbox (and spam) to confirm.` };
  } catch (err) {
    result = { ok: false, message: err instanceof Error ? err.message : "Connection failed." };
  }

  if (row) {
    await db
      .update(tenantMailSettings)
      .set({ lastTestedAt: new Date(), lastTestOk: result.ok })
      .where(eq(tenantMailSettings.tenantId, tenantId));
  }
  return result;
}
