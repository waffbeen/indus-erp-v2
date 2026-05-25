import { z } from "zod";

export const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "lowercase letters, digits, hyphens; must start and end alphanumeric");

export const tenantStatusSchema = z.enum(["active", "suspended", "trial", "deleted"]);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

export const tenantSchema = z.object({
  id: z.string().uuid(),
  slug: tenantSlugSchema,
  name: z.string().min(2).max(120),
  status: tenantStatusSchema,
  themeKey: z.string().default("circle"),
  trialEndsAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Tenant = z.infer<typeof tenantSchema>;

/* ------- Company (legal entity within a Tenant) ------- */
export const companySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(2).max(120),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/).optional().nullable(),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  isPrimary: z.boolean().default(false),
});
export type Company = z.infer<typeof companySchema>;

export const companyCreateSchema = companySchema.omit({ id: true, tenantId: true });

/* ------- Unit (plant / branch within a Company) ------- */
export const unitSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string().min(2).max(120),
  code: z.string().trim().toUpperCase().max(20).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  state: z.string().max(80).optional().nullable(),
});
export type Unit = z.infer<typeof unitSchema>;

export const unitCreateSchema = unitSchema.omit({ id: true });
