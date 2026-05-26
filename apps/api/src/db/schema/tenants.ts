import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "suspended", "trial", "deleted"] })
      .notNull()
      .default("trial"),
    themeKey: text("theme_key").notNull().default("circle"),
    // Future per-tenant custom domain (Enterprise add-on)
    customDomain: text("custom_domain"),
    // Per-tenant DB connection string for Enterprise dedicated-DB tier (else null)
    dedicatedDbUrl: text("dedicated_db_url"),
    // Free-form metadata super-admin can store (logo URL, brand color, etc.)
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    /**
     * Tenant-level feature toggles editable by the tenant admin.
     * Keep the shape stable across releases — add new fields as optional.
     * Each flag should default to "small-shop friendly" off-state so a
     * just-onboarded kirana tenant doesn't see enterprise complexity.
     */
    settings: jsonb("settings").$type<{
      grn?: {
        /** Track batch number / mfg date / expiry per receipt line. */
        batchMode?: boolean;
      };
    }>().notNull().default({}),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("tenants_status_idx").on(t.status),
    deletedIdx: index("tenants_deleted_idx").on(t.deletedAt),
  }),
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

// Per-tenant module activation (super-admin gates premium modules)
export const tenantModules = pgTable(
  "tenant_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(), // matches MODULES.key in shared
    enabled: boolean("enabled").notNull().default(false),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    activatedByUserId: uuid("activated_by_user_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqTenantModule: index("tenant_modules_uniq_idx").on(t.tenantId, t.moduleKey),
  }),
);

export type TenantModule = typeof tenantModules.$inferSelect;
export type NewTenantModule = typeof tenantModules.$inferInsert;
