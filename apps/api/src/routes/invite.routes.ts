import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import * as service from "../services/invite.service";
import { roles } from "../db/schema/roles";
import { db } from "../db/index";
import { eq } from "drizzle-orm";

/** Admin endpoints — require auth + tenant. */
export const inviteRoutes: Router = Router();

inviteRoutes.use(requireAuth, requireTenant);

function ctx(req: any) {
  return {
    tenantId: req.tenant!.id,
    userId: req.auth!.sub,
    isTenantAdmin: req.auth!.ta,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}

const createSchema = z.object({
  email: z.string().email("Enter a valid email"),
  fullName: z.string().trim().max(120).optional().nullable(),
  roleId: z.string().uuid("Pick a role"),
  isTenantAdmin: z.boolean().optional().default(false),
});

inviteRoutes.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const row = await service.createInvite(input, ctx(req));
    res.status(201).json(row);
  } catch (err) { next(err); }
});

inviteRoutes.get("/", async (req, res, next) => {
  try {
    const rows = await service.listInvites(req.tenant!.id);
    res.json(rows);
  } catch (err) { next(err); }
});

inviteRoutes.post("/:id/revoke", async (req, res, next) => {
  try {
    await service.revokeInvite(req.params.id!, ctx(req));
    res.status(204).end();
  } catch (err) { next(err); }
});

// Roles list — for the invite form dropdown
inviteRoutes.get("/roles", async (req, res, next) => {
  try {
    const rows = await db
      .select({ id: roles.id, name: roles.name, key: roles.key })
      .from(roles)
      .where(eq(roles.tenantId, req.tenant!.id));
    res.json(rows);
  } catch (err) { next(err); }
});

// Members of this tenant
inviteRoutes.get("/members", async (req, res, next) => {
  try {
    const rows = await service.listMembers(req.tenant!.id);
    res.json(rows);
  } catch (err) { next(err); }
});

const updateMemberSchema = z.object({
  roleId: z.string().uuid().optional(),
  isTenantAdmin: z.boolean().optional(),
  status: z.enum(["active", "suspended"]).optional(),
});
inviteRoutes.patch("/members/:userId", async (req, res, next) => {
  try {
    const patch = updateMemberSchema.parse(req.body);
    await service.updateMember(req.params.userId!, patch, ctx(req));
    res.status(204).end();
  } catch (err) { next(err); }
});


/** Public — accept invite by token. No auth required. */
export const inviteAcceptRoutes: Router = Router();

const acceptSchema = z.object({
  token: z.string().min(10),
  fullName: z.string().trim().min(2, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

inviteAcceptRoutes.get("/:token", async (req, res, next) => {
  try {
    const data = await service.getInviteByToken(req.params.token!);
    res.json(data);
  } catch (err) { next(err); }
});

inviteAcceptRoutes.post("/:token/accept", async (req, res, next) => {
  try {
    const input = acceptSchema.parse({ ...req.body, token: req.params.token });
    const result = await service.acceptInvite(input);
    res.status(201).json(result);
  } catch (err) { next(err); }
});
