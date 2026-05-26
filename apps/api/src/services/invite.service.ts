import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/index";
import { invites } from "../db/schema/invites";
import { users } from "../db/schema/users";
import { memberships } from "../db/schema/memberships";
import { roles } from "../db/schema/roles";
import { auditLogs } from "../db/schema/audit_logs";
import { hashPassword } from "../lib/password";
import { BadRequest, Forbidden, NotFound } from "../lib/errors";

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

function randomToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Tenant admin creates an invite. We don't send email yet — the admin gets
 * back the token URL to share manually (Slack/WhatsApp). Token URL pattern:
 * /invite/<token>.
 */
export async function createInvite(
  input: { email: string; fullName?: string | null; roleId: string; isTenantAdmin?: boolean },
  ctx: ActorContext,
) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can invite users");

  const cleanEmail = input.email.trim().toLowerCase();
  if (!cleanEmail) throw BadRequest("email_required", "Email is required");

  // Verify role belongs to this tenant
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.tenantId, ctx.tenantId), eq(roles.id, input.roleId)))
    .limit(1);
  if (!role) throw BadRequest("role_invalid", "Role doesn't belong to this tenant");

  // 7-day expiry
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const token = randomToken();

  const [created] = await db
    .insert(invites)
    .values({
      tenantId: ctx.tenantId,
      token,
      email: cleanEmail,
      fullName: input.fullName?.trim() || null,
      roleId: input.roleId,
      isTenantAdmin: input.isTenantAdmin ?? false,
      invitedByUserId: ctx.userId,
      expiresAt,
    })
    .returning();

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "invite",
    resourceType: "invite",
    resourceId: created!.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { email: cleanEmail } as Record<string, unknown>,
  });

  return created!;
}

export async function listInvites(tenantId: string) {
  const rows = await db
    .select({ inv: invites, roleName: roles.name, inviterName: users.fullName })
    .from(invites)
    .leftJoin(roles, eq(invites.roleId, roles.id))
    .leftJoin(users, eq(invites.invitedByUserId, users.id))
    .where(eq(invites.tenantId, tenantId))
    .orderBy(desc(invites.createdAt));
  return rows.map((r) => ({
    id: r.inv.id,
    email: r.inv.email,
    fullName: r.inv.fullName,
    roleName: r.roleName,
    isTenantAdmin: r.inv.isTenantAdmin,
    token: r.inv.token,
    expiresAt: r.inv.expiresAt.toISOString(),
    acceptedAt: r.inv.acceptedAt ? r.inv.acceptedAt.toISOString() : null,
    revokedAt: r.inv.revokedAt ? r.inv.revokedAt.toISOString() : null,
    inviterName: r.inviterName ?? "Unknown",
    createdAt: r.inv.createdAt.toISOString(),
  }));
}

export async function revokeInvite(id: string, ctx: ActorContext) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can revoke invites");
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, id), eq(invites.tenantId, ctx.tenantId)));
}

/** Public — look up by token (used on the accept-invite page). */
export async function getInviteByToken(token: string) {
  const [row] = await db
    .select({ inv: invites, roleName: roles.name })
    .from(invites)
    .leftJoin(roles, eq(invites.roleId, roles.id))
    .where(eq(invites.token, token))
    .limit(1);
  if (!row) throw NotFound("invite_not_found", "Invitation not found");
  if (row.inv.acceptedAt) throw BadRequest("already_accepted", "This invitation has already been accepted");
  if (row.inv.revokedAt) throw BadRequest("revoked", "This invitation has been revoked");
  if (row.inv.expiresAt < new Date()) throw BadRequest("expired", "This invitation has expired");
  return {
    email: row.inv.email,
    fullName: row.inv.fullName,
    roleName: row.roleName,
    isTenantAdmin: row.inv.isTenantAdmin,
    tenantId: row.inv.tenantId,
  };
}

/** Public — accept token + create user + membership. */
export async function acceptInvite(input: { token: string; fullName: string; password: string }) {
  if (input.password.length < 8) throw BadRequest("weak_password", "Password must be at least 8 characters");

  const [row] = await db.select().from(invites).where(eq(invites.token, input.token)).limit(1);
  if (!row) throw NotFound("invite_not_found", "Invitation not found");
  if (row.acceptedAt) throw BadRequest("already_accepted", "This invitation has already been accepted");
  if (row.revokedAt) throw BadRequest("revoked", "This invitation has been revoked");
  if (row.expiresAt < new Date()) throw BadRequest("expired", "This invitation has expired");

  // Check whether a user with that email already exists (across tenants)
  let [existing] = await db.select().from(users).where(eq(users.email, row.email)).limit(1);

  if (!existing) {
    const hashed = await hashPassword(input.password);
    const [created] = await db
      .insert(users)
      .values({
        email: row.email,
        fullName: input.fullName.trim() || row.fullName || row.email.split("@")[0]!,
        passwordHash: hashed,
        isSuperAdmin: false,
      })
      .returning();
    existing = created!;
  }

  // Create membership if not present
  const [memb] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.tenantId, row.tenantId), eq(memberships.userId, existing.id)))
    .limit(1);
  if (!memb) {
    await db.insert(memberships).values({
      tenantId: row.tenantId,
      userId: existing.id,
      roleId: row.roleId,
      isTenantAdmin: row.isTenantAdmin,
      status: "active",
    });
  }

  await db
    .update(invites)
    .set({ acceptedAt: new Date(), acceptedByUserId: existing.id })
    .where(eq(invites.id, row.id));

  return { userId: existing.id, tenantId: row.tenantId };
}

/** List all members of a tenant (with role and last login if available). */
export async function listMembers(tenantId: string) {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      lastLoginAt: users.lastLoginAt,
      memb: memberships,
      roleName: roles.name,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .leftJoin(roles, eq(memberships.roleId, roles.id))
    .where(and(eq(memberships.tenantId, tenantId), isNull(memberships.deletedAt)))
    .orderBy(desc(memberships.createdAt));
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    fullName: r.fullName,
    roleName: r.roleName ?? "—",
    roleId: r.memb.roleId,
    isTenantAdmin: r.memb.isTenantAdmin,
    status: r.memb.status,
    lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    joinedAt: r.memb.createdAt.toISOString(),
  }));
}

/** Tenant admin updates a member's role / admin flag / status. */
export async function updateMember(
  userId: string,
  patch: { roleId?: string; isTenantAdmin?: boolean; status?: "active" | "suspended" },
  ctx: ActorContext,
) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can edit members");
  if (userId === ctx.userId && patch.isTenantAdmin === false) {
    throw BadRequest("self_demote", "You cannot remove your own admin rights — ask another admin");
  }

  if (patch.roleId) {
    const [role] = await db.select({ id: roles.id }).from(roles).where(and(eq(roles.tenantId, ctx.tenantId), eq(roles.id, patch.roleId))).limit(1);
    if (!role) throw BadRequest("role_invalid", "Role doesn't belong to this tenant");
  }

  await db
    .update(memberships)
    .set({
      ...(patch.roleId ? { roleId: patch.roleId } : {}),
      ...(patch.isTenantAdmin !== undefined ? { isTenantAdmin: patch.isTenantAdmin } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, userId)));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "update_member",
    resourceType: "user",
    resourceId: userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: patch as Record<string, unknown>,
  });
}
