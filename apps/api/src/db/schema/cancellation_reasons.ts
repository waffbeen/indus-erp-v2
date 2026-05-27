import { pgTable, uuid, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Tenant-scoped list of reasons used when cancelling / short-closing a PO
 * or rejecting a PR. Surfaces as a dropdown in those modals.
 */
export const cancellationReasons = pgTable(
  "cancellation_reasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("cancellation_reasons_tenant_idx").on(t.tenantId),
  }),
);

export type CancellationReason = typeof cancellationReasons.$inferSelect;
export type NewCancellationReason = typeof cancellationReasons.$inferInsert;
