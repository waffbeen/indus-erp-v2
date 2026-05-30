import { Router } from "express";
import { aiChatRequestSchema, aiSettingsUpdateSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { Forbidden } from "../lib/errors";
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
aiRoutes.get("/status", async (req, res, next) => {
  try {
    res.json(await aiService.getAiStatus(req.tenant!.id));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /ai/settings — current provider/model + masked key status for this tenant.
 * Tenant-admin only (it reveals the configured provider and key source).
 */
aiRoutes.get("/settings", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can view AI settings");
    res.json(await aiService.getTenantAiSettings(req.tenant!.id));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /ai/settings — set this tenant's AI provider, key and model.
 * Bring-your-own-key: stored encrypted and used immediately, no redeploy.
 * The raw key is never echoed back — the response is the masked view.
 */
aiRoutes.put("/settings", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can change AI settings");
    const input = aiSettingsUpdateSchema.parse(req.body ?? {});
    res.json(await aiService.updateTenantAiSettings(req.tenant!.id, input));
  } catch (err) {
    next(err);
  }
});
