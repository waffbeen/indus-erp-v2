// NOTE: `@anthropic-ai/sdk` is appended to PARALLEL_BUILD_NOTES.md as a NEEDS DEP.
// This import will not type-check until the consolidation step installs it — that
// is expected. Everything else in this file is self-contained.
import Anthropic from "@anthropic-ai/sdk";
import type { AiChatMessage, AiChatResponse } from "@indus/shared";
import * as dashboardService from "./dashboard.service";
import * as poService from "./po.service";
import * as prService from "./pr.service";

/**
 * "Ask your ERP" — a natural-language assistant over the caller's OWN tenant data.
 *
 * Design (per STRATEGY §9.1):
 *  - Tool-calling over the EXISTING read services. Each tool is a thin wrapper that
 *    receives the caller's tenantId from the SERVER (never the model) and forwards it
 *    to the same functions the dashboard/list screens use. RBAC + tenant isolation are
 *    therefore enforced exactly as everywhere else.
 *  - READ-ONLY. There is deliberately no tool that writes/mutates anything. The model
 *    can only ask questions of the data; it can never change it.
 *  - Stateless: the client replays the conversation each turn (Messages-API style).
 *
 * Model: Claude Opus 4.8 (adaptive thinking). Override with ANTHROPIC_MODEL if needed.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
/** Hard cap on tool-call rounds per request, so a confused model can't loop forever. */
const MAX_STEPS = 6;
const MAX_OUTPUT_TOKENS = 16000;

/** True when the server has an Anthropic key configured. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

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
- If a question needs data that none of the tools can provide (for example a precise spend figure for a specific date range, or a breakdown the tools don't expose), say so plainly and offer the closest thing the tools CAN answer. Don't guess.

Units & formatting:
- Monetary fields whose names end in "Paise" are integers in paise. Divide by 100 to get rupees. Always present money to the user in Indian Rupees with Indian digit grouping and lakh/crore where natural (e.g. ₹1,25,000 or ₹1.25 L).
- Quantities returned by the report tools are already in base units (no scaling needed).
- Dates are ISO 8601 strings.

Style: be concise and direct. Lead with the answer, then supporting detail. Use compact tables or short bullet lists when comparing multiple items. Keep it to what was asked.`;

/** Tool definitions exposed to the model. Inputs never include a tenant id —
 *  that is injected server-side. Descriptions are prescriptive about WHEN to call. */
const TOOLS: Anthropic.Tool[] = [
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

/** Clamp a model-supplied limit into the allowed range. */
function clampLimit(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), 100);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Execute one tool call. `tenantId` comes from the authenticated request — the
 * model's `input` can never override it, which is what keeps the assistant
 * strictly scoped to the caller's tenant.
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

export interface ChatInput {
  tenantId: string;
  userId: string;
  messages: AiChatMessage[];
}

/**
 * Run the assistant for one request. Returns a friendly, structured response
 * even when the AI is not configured or an upstream error occurs — the chat UI
 * should never see a raw 500 for these cases.
 */
export async function chat(input: ChatInput): Promise<AiChatResponse> {
  if (!isAiConfigured()) {
    return {
      reply:
        "The AI assistant isn't configured yet. An administrator needs to set the ANTHROPIC_API_KEY on the server to enable 'Ask your ERP'. Everything else in the app works without it.",
      configured: false,
      toolsUsed: [],
    };
  }

  const client = getClient();
  const messages: Anthropic.MessageParam[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const toolsUsed: string[] = [];

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        thinking: { type: "adaptive" },
        // Breakpoint on the system block caches tools + system together (prefix order
        // is tools -> system -> messages). Harmless if the prefix is below the cache
        // minimum; pays off as the tool surface grows.
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        // Terminal turn — assemble the answer from the text blocks.
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();

        if (response.stop_reason === "refusal") {
          return {
            reply:
              text ||
              "I'm sorry, I can't help with that request. Try asking about your purchase orders, requisitions, vendors, or spend.",
            configured: true,
            toolsUsed: unique(toolsUsed),
          };
        }

        return {
          reply:
            text ||
            "I wasn't able to produce an answer for that. Try rephrasing, or ask about your POs, PRs, vendors, or spend.",
          configured: true,
          toolsUsed: unique(toolsUsed),
        };
      }

      // The model wants tool results. Preserve the full assistant turn (including
      // any thinking blocks) — required when adaptive thinking is combined with tools.
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        toolsUsed.push(block.name);
        try {
          const result = await runTool(
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
            input.tenantId,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
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

    // Ran out of tool-call rounds without a final answer.
    return {
      reply:
        "I looked into that but couldn't wrap it up cleanly. Could you narrow the question a little? For example, a specific status, vendor, or time frame.",
      configured: true,
      toolsUsed: unique(toolsUsed),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ai.service] chat failed:", err);
    return {
      reply:
        "Sorry — I couldn't reach the AI service just now. Please try again in a moment.",
      configured: true,
      toolsUsed: unique(toolsUsed),
    };
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
