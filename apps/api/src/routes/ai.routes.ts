import { Router } from "express";
import { aiChatRequestSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import * as aiService from "../services/ai.service";

export const aiRoutes: Router = Router();

// Same guard chain as every tenant-scoped module: a valid user + an active tenant.
aiRoutes.use(requireAuth, requireTenant);

/**
 * POST /ai/chat — "Ask your ERP" assistant.
 * The tenant id is taken from the verified request (req.tenant!.id) and passed
 * into every tool call, so the assistant can only ever read the caller's own data.
 */
aiRoutes.post("/chat", async (req, res, next) => {
  try {
    const { messages } = aiChatRequestSchema.parse(req.body);
    const result = await aiService.chat({
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      messages,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Lightweight capability probe so the UI can show a "not configured" hint up front. */
aiRoutes.get("/status", (_req, res) => {
  res.json({ configured: aiService.isAiConfigured() });
});
