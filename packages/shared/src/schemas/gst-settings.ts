import { z } from "zod";

/**
 * Per-tenant GST / GSP credentials ("bring your own GSP account"). A tenant
 * admin picks a provider and enters their GSP username + password + the GSTIN
 * they transact under. Stored server-side with the password ENCRYPTED; the raw
 * password is never returned — only a `hasPassword` flag. When no active row
 * exists the compliance services fall back to a built-in sandbox/stub client.
 */

export const gstProviderSchema = z.enum(["nic_sandbox", "masters_india", "cleartax"]);
export type GstProvider = z.infer<typeof gstProviderSchema>;

/** 15-char GSTIN: 2-digit state + 10-char PAN + entity + 'Z' + checksum. */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const gstSettingsUpdateSchema = z.object({
  provider: gstProviderSchema.default("nic_sandbox"),
  username: z.string().trim().max(255).optional().nullable(),
  /** Optional on update — omit to keep the stored password. */
  password: z.string().max(400).optional(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(GSTIN_REGEX, "Enter a valid 15-character GSTIN")
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});
export type GstSettingsUpdate = z.infer<typeof gstSettingsUpdateSchema>;

/** Test uses whatever fields are provided, falling back to stored values. */
export const gstSettingsTestSchema = z.object({
  provider: gstProviderSchema.optional(),
  username: z.string().trim().max(255).optional().nullable(),
  password: z.string().max(400).optional(),
  gstin: z.string().trim().toUpperCase().max(15).optional().nullable(),
});
export type GstSettingsTest = z.infer<typeof gstSettingsTestSchema>;

/** Read contract — safe for the browser (no raw password). */
export const gstSettingsViewSchema = z.object({
  provider: gstProviderSchema,
  username: z.string().nullable(),
  gstin: z.string().nullable(),
  hasPassword: z.boolean(),
  /** True when provider + gstin + active — the tenant can call the GSP. */
  configured: z.boolean(),
  isActive: z.boolean(),
  /** Where the active client comes from — the tenant's GSP or the built-in sandbox. */
  source: z.enum(["tenant", "sandbox"]),
  lastTestedAt: z.string().nullable(),
  lastTestOk: z.boolean().nullable(),
  lastTestMessage: z.string().nullable(),
});
export type GstSettingsView = z.infer<typeof gstSettingsViewSchema>;

export const gstSettingsTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type GstSettingsTestResult = z.infer<typeof gstSettingsTestResultSchema>;
