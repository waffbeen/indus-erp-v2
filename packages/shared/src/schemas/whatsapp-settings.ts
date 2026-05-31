import { z } from "zod";

/**
 * Per-tenant WhatsApp settings ("use your own WhatsApp Business number").
 *
 * The exact analogue of mail-settings: a tenant admin enters provider creds, can
 * TEST them (send a test WhatsApp message) before saving, then saves. The access
 * token and Meta app secret are stored ENCRYPTED and never returned — only
 * `hasApiToken` / `hasAppSecret` flags are surfaced.
 */

export const whatsappProviders = ["meta_cloud", "gupshup", "twilio"] as const;
export type WhatsappProvider = (typeof whatsappProviders)[number];

export const whatsappSettingsUpdateSchema = z.object({
  provider: z.enum(whatsappProviders).default("meta_cloud"),
  /** Meta Cloud phone-number id (or Gupshup app name / Twilio Account SID). */
  phoneNumberId: z.string().trim().min(1, "Phone number ID is required").max(255),
  /** Optional on update — omit to keep the stored token. */
  apiToken: z.string().max(2000).optional(),
  /** Sender number shown to recipients, E.164. */
  fromNumber: z.string().trim().max(40).optional().nullable(),
  /** Optional Meta app secret for inbound webhook signature verification. Omit to keep. */
  appSecret: z.string().max(400).optional(),
  /** Webhook verify token (handshake string also entered in the provider dashboard). */
  verifyToken: z.string().trim().max(255).optional().nullable(),
});
export type WhatsappSettingsUpdate = z.infer<typeof whatsappSettingsUpdateSchema>;

/** Test uses whatever fields are provided, falling back to stored values. */
export const whatsappSettingsTestSchema = z.object({
  provider: z.enum(whatsappProviders).optional(),
  phoneNumberId: z.string().trim().max(255).optional(),
  apiToken: z.string().max(2000).optional(),
  fromNumber: z.string().trim().max(40).optional().nullable(),
  /** WhatsApp number to send the test message to. Falls back to the admin's stored phone. */
  sendTo: z.string().trim().max(40).optional(),
});
export type WhatsappSettingsTest = z.infer<typeof whatsappSettingsTestSchema>;

export const whatsappSettingsViewSchema = z.object({
  provider: z.enum(whatsappProviders),
  phoneNumberId: z.string().nullable(),
  fromNumber: z.string().nullable(),
  hasApiToken: z.boolean(),
  hasAppSecret: z.boolean(),
  /** Echoed back (not a hard secret) so the admin can copy it into the provider dashboard. */
  verifyToken: z.string().nullable(),
  /** True when provider + phoneNumberId + token + active — i.e. the tenant can send. */
  configured: z.boolean(),
  lastTestedAt: z.string().nullable(),
  lastTestOk: z.boolean().nullable(),
});
export type WhatsappSettingsView = z.infer<typeof whatsappSettingsViewSchema>;

export const whatsappTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type WhatsappTestResult = z.infer<typeof whatsappTestResultSchema>;
