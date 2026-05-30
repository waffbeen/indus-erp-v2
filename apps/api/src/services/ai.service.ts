import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration } from "@google/generative-ai";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import type { AiChatMessage, AiChatResponse, AiSettingsUpdate, AiSettingsView } from "@indus/shared";
import { db } from "../db/index";
import { tenantAiSettings } from "../db/schema/tenant_ai_settings";
import { env } from "../config/env";
import { encryptSecret, decryptSecret, last4 } from "../lib/crypto";
import { logger } from "../lib/logger";
import * as dashboardService from "./dashboard.service";
import * as poService from "./po.service";
import * as prService from "./pr.service";

/**
 * "Ask your ERP" — a natural-language assistant over the caller's OWN tenant data.
 *
 * Provider-agnostic (per STRATEGY §9.1, extended for BYO-key):
 *  - The provider + API key + model are resolved PER TENANT from the database
 *    (`tenant_ai_settings`), so each client can bring their own key and it takes
 *    effect immediately — no env change or redeploy. When a tenant has not set a
 *    key, the service falls back to a platform-level key from the environment.
 *  - Tool-calling over the EXISTING read services. Each tool receives the caller's
 *    tenantId from the SERVER (never the model), so RBAC + tenant isolation hold.
 *  - READ-ONLY. No tool can write/mutate anything.
 *  - Stateless: the client replays the conversation each turn.
 *
 * Supported providers: Google Gemini (default) and Anthropic Claude.
 */

type Provider = "gemini" | "anthropic" | "openai";

/** Hard cap on tool-call rounds per request, so a confused model can't loop forever. */
const MAX_STEPS = 6;
const MAX_OUTPUT_TOKENS = 16000;
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const NOT_CONFIGURED_MSG =
  "The AI assistant isn't set up yet. A workspace admin can add an API key under Settings → AI Assistant (Google Gemini or Anthropic Claude). Everything else in the app works without it.";

/**
 * Frozen system prompt — kept free of per-request/per-tenant values so the
 * tools + system prefix can be prompt-cached. Tenant scoping is enforced in
 * code (tool handlers), not by naming the tenant here.
 */
const SYSTEM_PROMPT = `You are "Ask your ERP", a procurement & inventory analyst assistant embedded in Prathvi's ERP — a multi-tenant procurement and inventory SaaS used by Indian businesses.

Your job: answer the user's questions about THEIR organisation's purchasing and inventory by calling the read-only tools provided, then explaining the results in clear, concise business language.

Rules:
- You can ONLY read data. You have no ability to create, edit, approve, or delete anything. If the user asks you to perform an action (raise a PR, approve a PO, etc.), explain that you can only look things up, and point them to the relevant screen.
- Every tool you call automatically operates on the current user's own tenant. You never choose which company/tenant to look at — it is fixed to the signed-in user.
- Base every factual claim on tool output. Never invent numbers, vendor names, PO numbers, or dates. If you haven't fetched something, fetch it before stating it.
- If a question needs data that none of the tools can provide, say so plainly and offer the closest thing the tools CAN answer. Don't guess.

Units & formatting:
- Monetary fields whose names end in "Paise" are integers in paise. Divide by 100 to get rupees. Always present money in Indian Rupees with Indian digit grouping and lakh/crore where natural (e.g. ₹1,25,000 or ₹1.25 L).
- Quantities returned by the report tools are already in base units (no scaling needed).
- Dates are ISO 8601 strings.

Style: be concise and direct. Lead with the answer, then supporting detail. Use compact tables or short bullet lists when comparing multiple items. Keep it to what was asked.`;

/** Tool definitions for Anthropic. Inputs never include a tenant id — that is
 *  injected server-side. The Gemini declarations are derived from these below. */
const ANTHROPIC_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_dashboard_stats",
    description:
      "Headline procurement KPIs for the whole tenant: counts of PRs/POs pending approval, open & overdue POs, this month's PO spend (paise), active vendor count, average PR approval time, goods-received this month, a 6-month PR/PO trend, the top vendors by PO value, PR-aging buckets, and the most recent pending PRs. Call this first for broad 'how are we doing' / overview / 'what's pending' questions.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_purchase_orders",
    description:
      "List purchase orders (most recent first) with PO number, title, status, vendor name, total value (totalPaise), item count and dates. Use for questions about specific POs, POs in a given status, POs for a vendor, or to find/sum POs by value (e.g. 'POs pending approval over 1 lakh' — list pending ones, then filter by totalPaise yourself).",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Optional status filter. One of: draft, pending_approval, approved, sent_to_vendor, partially_received, received, closed, cancelled.",
        },
        search: { type: "string", description: "Optional case-insensitive match on the PO title." },
        limit: { type: "integer", description: "Max rows to return (1-100, default 25)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_purchase_requisitions",
    description:
      "List purchase requisitions (most recent first) with PR number, title, status, priority, requester, estimated value (estimatedTotalPaise) and dates. Use for questions about requisitions, what's awaiting approval, or a requester's requests.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Optional status filter. Common values: draft, pending_l1, pending_l2, escalated, approved, rejected, sent_back, converted_to_po, cancelled.",
        },
        search: { type: "string", description: "Optional case-insensitive match on the PR title." },
        limit: { type: "integer", description: "Max rows to return (1-100, default 25)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_vendor_spend_report",
    description:
      "Per-vendor summary across all finalised POs: PO count, total ordered value (totalPaise), and how many POs are still open vs closed. Use for 'which vendors do we spend the most with', vendor comparisons, or supplier concentration questions.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_top_items_report",
    description:
      "Top purchased items by value across finalised POs: item name, group, HSN, UoM, total quantity, total value (totalPaise) and number of order lines. Use for 'what do we spend the most on', item-level spend, or to find spend on a particular item (e.g. bearings) — match the itemName in the results.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "How many top items to return (1-100, default 25)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_pr_aging_report",
    description:
      "Every purchase requisition currently awaiting approval, with how many days it has been pending (daysPending). Use for 'what's stuck', approval bottlenecks, or oldest-pending questions.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

/** Gemini function declarations, derived from the Anthropic tool list so there is
 *  a single source of truth for the tool surface. */
const GEMINI_TOOLS: FunctionDeclaration[] = ANTHROPIC_TOOLS.map((t) => {
  const props = (t.input_schema.properties ?? {}) as Record<string, { type?: string; description?: string }>;
  return {
    name: t.name,
    description: t.description ?? "",
    parameters: {
      type: SchemaType.OBJECT,
      properties: Object.fromEntries(
        Object.entries(props).map(([key, val]) => [
          key,
          {
            type: val.type === "integer" ? SchemaType.INTEGER : SchemaType.STRING,
            description: val.description,
          },
        ]),
      ),
    },
  } as FunctionDeclaration;
});

/** OpenAI tool schema, derived from the same Anthropic tool list. */
const OPENAI_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = ANTHROPIC_TOOLS.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema as unknown as Record<string, unknown>,
  },
}));

function clampLimit(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), 100);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * Execute one tool call. `tenantId` comes from the authenticated request — the
 * model's `input` can never override it, which keeps the assistant strictly
 * scoped to the caller's tenant.
 */
async function runTool(name: string, input: Record<string, unknown>, tenantId: string): Promise<unknown> {
  switch (name) {
    case "get_dashboard_stats":
      return dashboardService.getDashboardStats(tenantId);
    case "list_purchase_orders":
      return poService.listPos(tenantId, {
        status: asString(input.status),
        search: asString(input.search),
        page: 1,
        pageSize: clampLimit(input.limit, 25),
      });
    case "list_purchase_requisitions":
      return prService.listPrs(tenantId, {
        status: asString(input.status),
        search: asString(input.search),
        page: 1,
        pageSize: clampLimit(input.limit, 25),
      });
    case "get_vendor_spend_report":
      return dashboardService.getVendorSpendReport(tenantId);
    case "get_top_items_report":
      return dashboardService.getTopItemsReport(tenantId, clampLimit(input.limit, 25));
    case "get_pr_aging_report":
      return dashboardService.getPrAgingReport(tenantId);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Config resolution — per-tenant key (DB) first, platform env key as fallback.
// ---------------------------------------------------------------------------

interface AiConfig {
  provider: Provider;
  apiKey: string;
  model: string | null;
  source: "tenant" | "platform";
}

/** Platform-level fallback derived from environment variables. */
function platformConfig(): AiConfig | null {
  const gemini = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  const anthropic = env.ANTHROPIC_API_KEY;
  const openai = env.OPENAI_API_KEY;
  const prefer = env.AI_DEFAULT_PROVIDER;

  if (prefer === "gemini" && gemini)
    return { provider: "gemini", apiKey: gemini, model: env.GEMINI_MODEL ?? null, source: "platform" };
  if (prefer === "anthropic" && anthropic)
    return { provider: "anthropic", apiKey: anthropic, model: env.ANTHROPIC_MODEL ?? null, source: "platform" };
  if (prefer === "openai" && openai)
    return { provider: "openai", apiKey: openai, model: null, source: "platform" };

  if (gemini) return { provider: "gemini", apiKey: gemini, model: env.GEMINI_MODEL ?? null, source: "platform" };
  if (anthropic)
    return { provider: "anthropic", apiKey: anthropic, model: env.ANTHROPIC_MODEL ?? null, source: "platform" };
  if (openai) return { provider: "openai", apiKey: openai, model: null, source: "platform" };
  return null;
}

async function resolveAiConfig(tenantId: string): Promise<AiConfig | null> {
  const [row] = await db
    .select()
    .from(tenantAiSettings)
    .where(eq(tenantAiSettings.tenantId, tenantId))
    .limit(1);

  if (row?.isActive && row.apiKeyCipher) {
    try {
      return {
        provider: (row.provider as Provider) || "gemini",
        apiKey: decryptSecret(row.apiKeyCipher),
        model: row.model ?? null,
        source: "tenant",
      };
    } catch (err) {
      logger.error({ err, tenantId }, "ai_tenant_key_decrypt_failed_falling_back");
    }
  }
  return platformConfig();
}

// ---------------------------------------------------------------------------
// Settings (read masked / write encrypted) — used by the Settings screen.
// ---------------------------------------------------------------------------

export async function getTenantAiSettings(tenantId: string): Promise<AiSettingsView> {
  const [row] = await db
    .select()
    .from(tenantAiSettings)
    .where(eq(tenantAiSettings.tenantId, tenantId))
    .limit(1);
  const platform = platformConfig();

  if (row) {
    const hasTenantKey = Boolean(row.apiKeyCipher);
    return {
      provider: (row.provider as Provider) || "gemini",
      model: row.model ?? null,
      configured: hasTenantKey || Boolean(platform),
      source: hasTenantKey ? "tenant" : platform ? "platform" : "none",
      last4: row.apiKeyLast4 ?? null,
    };
  }
  return {
    provider: platform?.provider ?? "gemini",
    model: null,
    configured: Boolean(platform),
    source: platform ? "platform" : "none",
    last4: null,
  };
}

export async function updateTenantAiSettings(
  tenantId: string,
  input: AiSettingsUpdate,
): Promise<AiSettingsView> {
  const model = input.model?.trim() ? input.model.trim() : null;
  const set: Record<string, unknown> = {
    provider: input.provider,
    model,
    isActive: true,
    updatedAt: new Date(),
  };
  if (input.apiKey) {
    set.apiKeyCipher = encryptSecret(input.apiKey);
    set.apiKeyLast4 = last4(input.apiKey);
  }

  await db
    .insert(tenantAiSettings)
    .values({
      tenantId,
      provider: input.provider,
      model,
      apiKeyCipher: (set.apiKeyCipher as string | undefined) ?? null,
      apiKeyLast4: (set.apiKeyLast4 as string | undefined) ?? null,
    })
    .onConflictDoUpdate({ target: tenantAiSettings.tenantId, set });

  return getTenantAiSettings(tenantId);
}

/** Capability probe for the UI — does the assistant have a usable key for this tenant? */
export async function getAiStatus(
  tenantId: string,
): Promise<{ configured: boolean; provider: Provider | null; source: "tenant" | "platform" | "none" }> {
  const cfg = await resolveAiConfig(tenantId);
  return { configured: Boolean(cfg), provider: cfg?.provider ?? null, source: cfg?.source ?? "none" };
}

// ---------------------------------------------------------------------------
// Chat — provider dispatch.
// ---------------------------------------------------------------------------

export interface ChatInput {
  tenantId: string;
  userId: string;
  messages: AiChatMessage[];
}

export async function chat(input: ChatInput): Promise<AiChatResponse> {
  const cfg = await resolveAiConfig(input.tenantId);
  if (!cfg) {
    return { reply: NOT_CONFIGURED_MSG, configured: false, toolsUsed: [] };
  }

  const toolsUsed: string[] = [];
  try {
    if (cfg.provider === "gemini") return await chatGemini(cfg, input, toolsUsed);
    if (cfg.provider === "anthropic") return await chatAnthropic(cfg, input, toolsUsed);
    if (cfg.provider === "openai") return await chatOpenAI(cfg, input, toolsUsed);
    return {
      reply: `The '${cfg.provider}' provider isn't supported yet. Pick Google Gemini, OpenAI, or Anthropic Claude under Settings → AI Assistant.`,
      configured: true,
      toolsUsed: [],
    };
  } catch (err) {
    logger.error({ err, provider: cfg.provider }, "ai_chat_failed");
    return {
      reply:
        "Sorry — I couldn't reach the AI service just now. Please check the API key under Settings → AI Assistant, or try again in a moment.",
      configured: true,
      toolsUsed: unique(toolsUsed),
    };
  }
}

const ROUNDS_FALLBACK =
  "I looked into that but couldn't wrap it up cleanly. Could you narrow the question a little — for example, a specific status, vendor, or time frame?";
const EMPTY_FALLBACK =
  "I wasn't able to produce an answer for that. Try rephrasing, or ask about your POs, PRs, vendors, or spend.";

async function chatGemini(cfg: AiConfig, input: ChatInput, toolsUsed: string[]): Promise<AiChatResponse> {
  const genAI = new GoogleGenerativeAI(cfg.apiKey);
  const model = genAI.getGenerativeModel({
    model: cfg.model || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: GEMINI_TOOLS }],
  });

  const msgs = input.messages;
  // Gemini history must start with a user turn and alternate; the UI guarantees this.
  const history = msgs.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));
  const lastUser = msgs[msgs.length - 1]?.content ?? "";

  const session = model.startChat({ history });
  let result = await session.sendMessage(lastUser);

  for (let step = 0; step < MAX_STEPS; step++) {
    const calls = result.response.functionCalls();
    if (!calls || calls.length === 0) {
      const text = (result.response.text() || "").trim();
      return { reply: text || EMPTY_FALLBACK, configured: true, toolsUsed: unique(toolsUsed) };
    }

    const responseParts = [];
    for (const call of calls) {
      toolsUsed.push(call.name);
      let out: unknown;
      try {
        out = await runTool(call.name, (call.args ?? {}) as Record<string, unknown>, input.tenantId);
      } catch (err) {
        out = { error: err instanceof Error ? err.message : "unknown error" };
      }
      responseParts.push({ functionResponse: { name: call.name, response: { result: out } } });
    }
    result = await session.sendMessage(responseParts);
  }

  return { reply: ROUNDS_FALLBACK, configured: true, toolsUsed: unique(toolsUsed) };
}

async function chatAnthropic(cfg: AiConfig, input: ChatInput, toolsUsed: string[]): Promise<AiChatResponse> {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const messages: Anthropic.MessageParam[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.messages.create({
      model: cfg.model || env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: ANTHROPIC_TOOLS,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: text || EMPTY_FALLBACK, configured: true, toolsUsed: unique(toolsUsed) };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      toolsUsed.push(block.name);
      try {
        const result = await runTool(block.name, (block.input ?? {}) as Record<string, unknown>, input.tenantId);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error running ${block.name}: ${err instanceof Error ? err.message : "unknown error"}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { reply: ROUNDS_FALLBACK, configured: true, toolsUsed: unique(toolsUsed) };
}

async function chatOpenAI(cfg: AiConfig, input: ChatInput, toolsUsed: string[]): Promise<AiChatResponse> {
  const client = new OpenAI({ apiKey: cfg.apiKey });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...input.messages.map(
      (m): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({ role: m.role, content: m.content }),
    ),
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const resp = await client.chat.completions.create({
      model: cfg.model || DEFAULT_OPENAI_MODEL,
      messages,
      tools: OPENAI_TOOLS,
    });
    const choice = resp.choices[0]?.message;
    if (!choice) return { reply: EMPTY_FALLBACK, configured: true, toolsUsed: unique(toolsUsed) };

    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      return {
        reply: (choice.content || "").trim() || EMPTY_FALLBACK,
        configured: true,
        toolsUsed: unique(toolsUsed),
      };
    }

    messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });

    for (const call of choice.tool_calls) {
      if (call.type !== "function") continue;
      toolsUsed.push(call.function.name);
      let out: unknown;
      try {
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        out = await runTool(call.function.name, args as Record<string, unknown>, input.tenantId);
      } catch (err) {
        out = { error: err instanceof Error ? err.message : "unknown error" };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out) });
    }
  }

  return { reply: ROUNDS_FALLBACK, configured: true, toolsUsed: unique(toolsUsed) };
}
