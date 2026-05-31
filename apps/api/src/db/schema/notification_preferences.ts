import { pgTable, uuid, text, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * Per-user notification channel preferences.
 *
 * The model is OPT-OUT / default-on: the ABSENCE of a row means "send on this
 * channel" (so a brand-new user with a phone number gets WhatsApp + email
 * notifications without any setup). A row with `enabled = false` is an explicit
 * opt-out for that (user, channel).
 *
 * `channel` is one of "inapp" | "email" | "whatsapp". In-app is always created
 * regardless; email + whatsapp fan-out (notification.service) consults this
 * table plus whether the tenant has that channel configured and the user has the
 * needed contact detail (email / phone).
 *
 * Unique on (tenant_id, user_id, channel) — at most one preference row per pair.
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "inapp" | "email" | "whatsapp" */
    channel: text("channel").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("notification_prefs_user_idx").on(t.tenantId, t.userId),
    uniqPair: unique("notification_prefs_unique").on(t.tenantId, t.userId, t.channel),
  }),
);

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
