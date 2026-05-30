import { z } from "zod";

/**
 * Per-tenant SMTP email settings ("use your own mailbox"). A tenant admin enters
 * SMTP details, can TEST them (verify connection + send a test email) before
 * saving, then saves. Stored server-side with the password ENCRYPTED; the raw
 * password is never returned — only a `hasPassword` flag.
 */

export const mailSettingsUpdateSchema = z.object({
  host: z.string().trim().min(1, "SMTP host is required").max(255),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  username: z.string().trim().max(255).optional().nullable(),
  /** Optional on update — omit to keep the stored password. */
  password: z.string().max(400).optional(),
  fromAddress: z.string().trim().min(3, "A 'From' address is required").max(255),
});
export type MailSettingsUpdate = z.infer<typeof mailSettingsUpdateSchema>;

/** Test uses whatever fields are provided, falling back to stored values. */
export const mailSettingsTestSchema = z.object({
  host: z.string().trim().max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().trim().max(255).optional().nullable(),
  password: z.string().max(400).optional(),
  fromAddress: z.string().trim().max(255).optional(),
  /** Where to send the test email. Defaults server-side to the admin's own email. */
  sendTo: z.string().email("Enter a valid email").optional(),
});
export type MailSettingsTest = z.infer<typeof mailSettingsTestSchema>;

export const mailSettingsViewSchema = z.object({
  host: z.string().nullable(),
  port: z.number(),
  secure: z.boolean(),
  username: z.string().nullable(),
  fromAddress: z.string().nullable(),
  hasPassword: z.boolean(),
  /** True when host + from + active — i.e. the tenant can send via their own SMTP. */
  configured: z.boolean(),
  lastTestedAt: z.string().nullable(),
  lastTestOk: z.boolean().nullable(),
});
export type MailSettingsView = z.infer<typeof mailSettingsViewSchema>;

export const mailTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type MailTestResult = z.infer<typeof mailTestResultSchema>;
