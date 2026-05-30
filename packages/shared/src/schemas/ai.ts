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
  /** False when ANTHROPIC_API_KEY is absent — UI shows a friendly "not configured" hint. */
  configured: z.boolean(),
  /** Names of the read-only tools the assistant invoked to answer (for transparency). */
  toolsUsed: z.array(z.string()).default([]),
});
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>;
