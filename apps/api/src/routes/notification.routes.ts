import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import * as service from "../services/notification.service";

export const notificationRoutes: Router = Router();

notificationRoutes.use(requireAuth, requireTenant);

notificationRoutes.get("/", async (req, res, next) => {
  try {
    const onlyUnread = req.query.unread === "true";
    const limit = req.query.limit ? Number(req.query.limit) : 30;
    const rows = await service.listNotifications(req.tenant!.id, req.auth!.sub, { onlyUnread, limit });
    res.json(rows);
  } catch (err) { next(err); }
});

notificationRoutes.get("/unread-count", async (req, res, next) => {
  try {
    const count = await service.unreadCount(req.tenant!.id, req.auth!.sub);
    res.json({ count });
  } catch (err) { next(err); }
});

const markReadSchema = z.object({ ids: z.array(z.string().uuid()).optional() });
notificationRoutes.post("/mark-read", async (req, res, next) => {
  try {
    const { ids } = markReadSchema.parse(req.body ?? {});
    await service.markRead(req.tenant!.id, req.auth!.sub, ids);
    res.status(204).end();
  } catch (err) { next(err); }
});
