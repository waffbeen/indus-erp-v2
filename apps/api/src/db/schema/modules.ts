import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Master catalog of modules. Hardcoded list in `@indus/shared/constants/modules`
 * is the source of truth at code level; this table is the runtime mirror that
 * super-admin can edit (e.g. change name, pricing, mark deprecated).
 *
 * Seed script populates this on first run.
 */
export const modules = pgTable(
  "modules",
  {
    key: text("key").primaryKey(), // matches MODULES.key
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon").notNull(),
    group: text("group").notNull(),
    isMvp: boolean("is_mvp").notNull().default(false),
    isGated: boolean("is_gated").notNull().default(false),
    // Default monthly price in paise (₹ × 100). Null = price varies / negotiated.
    monthlyPricePaise: text("monthly_price_paise"),
    isDeprecated: boolean("is_deprecated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;

/**
 * Pricing plans — super admin can create/edit. Placeholder, not enforced yet.
 */
export const pricingPlans = pgTable("pricing_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // e.g. "free", "starter", "business", "enterprise"
  name: text("name").notNull(),
  description: text("description"),
  monthlyPricePaise: text("monthly_price_paise").notNull().default("0"),
  yearlyPricePaise: text("yearly_price_paise"),
  includedModules: jsonb("included_modules").$type<string[]>().notNull().default([]),
  // Limits object — keys like maxUsers, maxCompanies, maxUnits, storageMB
  limits: jsonb("limits").$type<Record<string, number>>().notNull().default({}),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PricingPlan = typeof pricingPlans.$inferSelect;
export type NewPricingPlan = typeof pricingPlans.$inferInsert;

/**
 * Subscription a tenant currently has.
 */
export const tenantSubscriptions = pgTable(
  "tenant_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    planId: uuid("plan_id"),
    status: text("status", { enum: ["trial", "active", "past_due", "cancelled"] })
      .notNull()
      .default("trial"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("tenant_subscriptions_tenant_idx").on(t.tenantId),
  }),
);

export type TenantSubscription = typeof tenantSubscriptions.$inferSelect;
export type NewTenantSubscription = typeof tenantSubscriptions.$inferInsert;
