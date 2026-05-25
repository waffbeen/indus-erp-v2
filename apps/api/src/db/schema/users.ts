import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

/**
 * Users are GLOBAL identities. The user-to-tenant relationship lives in
 * `memberships` so a single user could (in theory) belong to multiple tenants
 * — useful for consultants, partner orgs, future cross-tenant features.
 *
 * For MVP, each user belongs to exactly one tenant. The constraint is
 * enforced at the membership level, not here.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    avatarUrl: text("avatar_url"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    status: text("status", { enum: ["active", "invited", "suspended", "deleted"] })
      .notNull()
      .default("active"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLoginAttempts: text("failed_login_attempts").notNull().default("0"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("users_status_idx").on(t.status),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/** Tokens for password reset, email verification, magic links. */
export const userTokens = pgTable("user_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose", {
    enum: ["password_reset", "email_verify", "magic_link"],
  }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserToken = typeof userTokens.$inferSelect;
export type NewUserToken = typeof userTokens.$inferInsert;
