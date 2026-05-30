import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * Persisted "Ask your ERP" chat history. Tenant- AND user-scoped: a user only
 * ever sees their own conversations within their tenant. Optional — the chat
 * works statelessly (the client replays history each turn), so these tables are
 * a convenience for "recent chats" and are only populated once a migration
 * creates them. Follows the standard pattern: tenantId + soft-delete on every row.
 */
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Short label derived from the first question. */
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantUserIdx: index("ai_conversations_tenant_user_idx").on(t.tenantId, t.userId),
    createdIdx: index("ai_conversations_created_idx").on(t.createdAt),
  }),
);

export type AiConversation = typeof aiConversations.$inferSelect;
export type NewAiConversation = typeof aiConversations.$inferInsert;

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    /** "user" | "assistant" — tool traffic is server-side only, never persisted as a turn. */
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** Optional record of which read-only tools the assistant used to answer. */
    toolCalls: jsonb("tool_calls").$type<Array<{ name: string }>>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    conversationIdx: index("ai_messages_conversation_idx").on(t.conversationId, t.createdAt),
    tenantIdx: index("ai_messages_tenant_idx").on(t.tenantId),
  }),
);

export type AiMessage = typeof aiMessages.$inferSelect;
export type NewAiMessage = typeof aiMessages.$inferInsert;
