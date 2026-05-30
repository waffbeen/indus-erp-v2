import { Router } from "express";
import { eq } from "drizzle-orm";
import { mailSettingsUpdateSchema, mailSettingsTestSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { Forbidden } from "../lib/errors";
import { db } from "../db/index";
import { users } from "../db/schema/users";
import * as mailSettings from "../services/mail-settings.service";

export const mailRoutes: Router = Router();

mailRoutes.use(requireAuth, requireTenant);

/** GET /mail/settings — current SMTP config (masked: no password) for this tenant. */
mailRoutes.get("/settings", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can view email settings");
    res.json(await mailSettings.getTenantMailSettings(req.tenant!.id));
  } catch (err) {
    next(err);
  }
});

/** PUT /mail/settings — save this tenant's SMTP config (password stored encrypted). */
mailRoutes.put("/settings", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can change email settings");
    const input = mailSettingsUpdateSchema.parse(req.body ?? {});
    res.json(await mailSettings.updateTenantMailSettings(req.tenant!.id, input));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /mail/settings/test — verify the connection and send a test email BEFORE
 * saving. Uses the posted fields, falling back to stored ones. Defaults the
 * recipient to the requesting admin's own email.
 */
mailRoutes.post("/settings/test", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can test email settings");
    const input = mailSettingsTestSchema.parse(req.body ?? {});
    let sendTo = input.sendTo;
    if (!sendTo) {
      const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.auth!.sub)).limit(1);
      sendTo = u?.email;
    }
    if (!sendTo) {
      res.status(400).json({ ok: false, message: "No recipient email found — provide one to test." });
      return;
    }
    res.json(await mailSettings.testTenantMailSettings(req.tenant!.id, input, sendTo));
  } catch (err) {
    next(err);
  }
});
