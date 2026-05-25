import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email();

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  tenantSlug: z.string().min(1).max(64).optional(), // optional — backend can look up by email if 1:1
  keepSignedIn: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: emailSchema,
  organizationName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional(),
  message: z.string().trim().max(500).optional(),
});
export type SignupRequestInput = z.infer<typeof signupRequestSchema>;

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(10),
  newPassword: passwordSchema,
});
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

/** Public-facing user info — never includes hashes or sensitive fields. */
export const meSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  fullName: z.string(),
  tenantId: z.string().uuid(),
  tenantSlug: z.string(),
  tenantName: z.string(),
  isSuperAdmin: z.boolean(),
  isTenantAdmin: z.boolean(),
  roleIds: z.array(z.string().uuid()),
  enabledModules: z.array(z.string()), // module keys this user can see
});
export type Me = z.infer<typeof meSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessExpiresAt: z.string().datetime(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;
