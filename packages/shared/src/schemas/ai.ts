import { z } from "zod";

/**
 * "Ask your ERP" assistant — request/response contract shared FE↔BE.
 *
 * The chat is stateless from the API's point of view: the client sends the
 * full message history each turn (same pattern as the Anthropic Messages API
 * itself). The backend turns the latest question into tool calls over the
 * caller's OWN tenant data (read-only) and answers from the results.
 */

/** A single turn in the conversation. Only user/assistant roles cross the wire;
 *  tool-calling happens server-side and is never exposed to the client. */
export const aiChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1, "Message cannot be empty").max(8000),
});
export type AiChatMessage = z.infer<typeof aiChatMessageSchema>;

export const aiChatRequestSchema = z.object({
  /** Full conversation so far, oldest first. Last entry should be the user's question. */
  messages: z.array(aiChatMessageSchema).min(1, "Send at least one message").max(50),
});
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;

export const aiChatResponseSchema = z.object({
  /** The assistant's natural-language answer. */
  reply: z.string(),
  /** False when no AI key (tenant or platform) is configured — UI shows a "not configured" hint. */
  configured: z.boolean(),
  /** Names of the read-only tools the assistant invoked to answer (for transparency). */
  toolsUsed: z.array(z.string()).default([]),
});
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>;

/**
 * Per-tenant AI provider settings ("bring your own key"). A tenant admin picks a
 * provider and pastes their API key; it's stored encrypted server-side and used
 * automatically — no env change or redeploy. The raw key never comes back from
 * the server; only a masked last-4 + a `configured` flag do.
 */
export const aiProviderSchema = z.enum(["gemini", "anthropic", "openai"]);
export type AiProvider = z.infer<typeof aiProviderSchema>;

/** Write contract. `apiKey` is optional so an admin can change just the model
 *  without re-entering the key (omit it to keep the stored one). */
export const aiSettingsUpdateSchema = z.object({
  provider: aiProviderSchema,
  apiKey: z.string().trim().min(10, "That key looks too short").max(400).optional(),
  model: z.string().trim().max(100).optional().nullable(),
});
export type AiSettingsUpdate = z.infer<typeof aiSettingsUpdateSchema>;

/** Read contract (safe to send to the browser — no raw key). */
export const aiSettingsViewSchema = z.object({
  provider: aiProviderSchema,
  model: z.string().nullable(),
  /** True when the assistant can run — either a tenant key or a platform fallback exists. */
  configured: z.boolean(),
  /** Where the active key comes from. */
  source: z.enum(["tenant", "platform", "none"]),
  /** Last 4 chars of the tenant's stored key, or null if none stored. */
  last4: z.string().nullable(),
});
export type AiSettingsView = z.infer<typeof aiSettingsViewSchema>;
