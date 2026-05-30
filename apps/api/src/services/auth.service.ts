import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "../db/index";
import { users } from "../db/schema/users";
import { tenants, tenantModules } from "../db/schema/tenants";
import { tenantSubscriptions } from "../db/schema/modules";
import { companies } from "../db/schema/companies";
import { units } from "../db/schema/units";
import { memberships } from "../db/schema/memberships";
import { roles } from "../db/schema/roles";
import { sessions } from "../db/schema/sessions";
import { auditLogs } from "../db/schema/audit_logs";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} from "../lib/jwt";
import { BadRequest, Forbidden, Unauthorized } from "../lib/errors";
import type { LoginInput, Me, RegisterInput } from "@indus/shared";
import { MODULES, SYSTEM_ROLES } from "@indus/shared";
import { logger } from "../lib/logger";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  me: Me;
}

export async function login(input: LoginInput, ctx: LoginContext = {}): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  if (!user) {
    // Generic message to avoid email enumeration
    throw Unauthorized("invalid_credentials", "Email or password is incorrect");
  }

  if (user.status === "suspended") {
    throw Forbidden("user_suspended", "This account is suspended. Contact your admin.");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw Forbidden("account_locked", "Account temporarily locked. Try again in a few minutes.");
  }

  const isPasswordValid = await verifyPassword(user.passwordHash, input.password);
  if (!isPasswordValid) {
    const attempts = Number(user.failedLoginAttempts) + 1;
    const updates: Partial<typeof users.$inferInsert> = {
      failedLoginAttempts: String(attempts),
      updatedAt: new Date(),
    };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      updates.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      updates.failedLoginAttempts = "0";
    }
    await db.update(users).set(updates).where(eq(users.id, user.id));
    throw Unauthorized("invalid_credentials", "Email or password is incorrect");
  }

  // Find tenant membership. For MVP each user has exactly one membership.
  // If tenantSlug provided, prefer that one; else pick the first active.
  const membershipQuery = db
    .select({
      membership: memberships,
      tenant: tenants,
      role: roles,
    })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.status, "active"),
        isNull(memberships.deletedAt),
        isNull(tenants.deletedAt),
      ),
    );

  const allMemberships = await membershipQuery;

  const wantedSlug = input.tenantSlug?.toLowerCase();
  const chosen = wantedSlug
    ? allMemberships.find((m) => m.tenant.slug === wantedSlug)
    : allMemberships[0];

  if (!chosen && !user.isSuperAdmin) {
    throw Forbidden("no_membership", "You don't belong to any workspace yet. Ask your admin to invite you.");
  }

  const tenant = chosen?.tenant;
  if (tenant && tenant.status === "suspended") {
    throw Forbidden("tenant_suspended", "This workspace is suspended.");
  }

  // Reset failed attempts + record successful login
  await db
    .update(users)
    .set({ failedLoginAttempts: "0", lastLoginAt: new Date(), lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // Issue tokens
  const tenantId = tenant?.id ?? "00000000-0000-0000-0000-000000000000";
  const tenantSlug = tenant?.slug ?? "system";

  const refreshTtl = input.keepSignedIn ? "30d" : undefined; // honor "keep me signed in"

  const access = signAccessToken({
    sub: user.id,
    tid: tenantId,
    tsl: tenantSlug,
    sa: user.isSuperAdmin,
    ta: chosen?.membership.isTenantAdmin ?? false,
  });

  // Pre-create session row, then sign refresh referencing it
  const [session] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      refreshTokenHash: "pending", // placeholder, updated immediately below
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // updated next
    })
    .returning({ id: sessions.id });

  if (!session) throw new Error("Failed to create session");

  const refresh = signRefreshToken({ sub: user.id, sid: session.id });
  await db
    .update(sessions)
    .set({
      refreshTokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
      lastUsedAt: new Date(),
    })
    .where(eq(sessions.id, session.id));

  // Audit log
  await db.insert(auditLogs).values({
    tenantId: tenant?.id,
    actorUserId: user.id,
    actorEmail: user.email,
    action: "login",
    resourceType: "session",
    resourceId: session.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  logger.info({ userId: user.id, tenantId: tenant?.id, sessionId: session.id }, "user_logged_in");

  const me = await buildMe(user, chosen);

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessExpiresAt: access.expiresAt.toISOString(),
    me,
  };
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

const RESERVED_SLUGS = new Set(["system", "admin", "api", "app", "www", "login", "signup", "t", "static"]);

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  let candidate = RESERVED_SLUGS.has(root) ? `${root}-1` : root;
  for (let i = 0; i < 200; i++) {
    const [hit] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, candidate)).limit(1);
    if (!hit) return candidate;
    candidate = `${root}-${i + 2}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/**
 * Self-serve registration: provisions a brand-new workspace (tenant + trial
 * subscription + MVP modules + system roles + a company + a unit) and an admin
 * user, all in one transaction, then auto-logs the user in (same result shape as
 * login). No invite required.
 */
export async function register(input: RegisterInput, ctx: LoginContext = {}): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    throw BadRequest("email_taken", "An account with this email already exists. Try signing in instead.");
  }

  const slug = await uniqueSlug(input.organizationName);
  const passwordHash = await hashPassword(input.password);
  const mvpModuleKeys = MODULES.filter((m) => m.mvp).map((m) => m.key);
  const orgName = input.organizationName.trim();

  const provisioned = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ slug, name: orgName, status: "trial" })
      .returning();
    if (!tenant) throw new Error("tenant_create_failed");

    await tx.insert(tenantSubscriptions).values({
      tenantId: tenant.id,
      status: "trial",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    for (const key of mvpModuleKeys) {
      await tx.insert(tenantModules).values({ tenantId: tenant.id, moduleKey: key, enabled: true, activatedAt: new Date() });
    }

    let adminRole: typeof roles.$inferSelect | undefined;
    for (const r of SYSTEM_ROLES) {
      const [created] = await tx
        .insert(roles)
        .values({
          tenantId: tenant.id,
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: true,
          permissions: r.permissions,
          moduleKeys: mvpModuleKeys,
        })
        .returning();
      if (created && r.key === "tenant_admin") adminRole = created;
    }
    if (!adminRole) throw new Error("admin_role_missing");

    const [company] = await tx
      .insert(companies)
      .values({ tenantId: tenant.id, name: orgName, country: "IN", isPrimary: true })
      .returning({ id: companies.id });
    if (!company) throw new Error("company_create_failed");

    const [unit] = await tx
      .insert(units)
      .values({ tenantId: tenant.id, companyId: company.id, name: "Head Office", code: "HO-01", type: "office" })
      .returning({ id: units.id });
    if (!unit) throw new Error("unit_create_failed");

    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash, fullName: input.fullName.trim(), status: "active", emailVerifiedAt: new Date() })
      .returning();
    if (!user) throw new Error("user_create_failed");

    const [membership] = await tx
      .insert(memberships)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        roleId: adminRole.id,
        companyId: company.id,
        unitId: unit.id,
        isTenantAdmin: true,
        status: "active",
        acceptedAt: new Date(),
      })
      .returning();
    if (!membership) throw new Error("membership_create_failed");

    return { tenant, role: adminRole, membership, user };
  });

  const { tenant, role, membership, user } = provisioned;

  const access = signAccessToken({ sub: user.id, tid: tenant.id, tsl: tenant.slug, sa: false, ta: true });

  const [session] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      refreshTokenHash: "pending",
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: sessions.id });
  if (!session) throw new Error("Failed to create session");

  const refresh = signRefreshToken({ sub: user.id, sid: session.id });
  await db
    .update(sessions)
    .set({ refreshTokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt, lastUsedAt: new Date() })
    .where(eq(sessions.id, session.id));

  await db.insert(auditLogs).values({
    tenantId: tenant.id,
    actorUserId: user.id,
    actorEmail: user.email,
    action: "register",
    resourceType: "tenant",
    resourceId: tenant.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  logger.info({ userId: user.id, tenantId: tenant.id, slug: tenant.slug }, "tenant_registered");

  const me = await buildMe(user, { membership, tenant, role });

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessExpiresAt: access.expiresAt.toISOString(),
    me,
  };
}

export async function refresh(refreshTokenRaw: string): Promise<AuthResult> {
  const payload = verifyRefreshToken(refreshTokenRaw);
  const hash = hashRefreshToken(refreshTokenRaw);

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, payload.sid),
        eq(sessions.refreshTokenHash, hash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session) {
    throw Unauthorized("invalid_refresh", "Refresh token is invalid, revoked, or expired");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, payload.sub), isNull(users.deletedAt)))
    .limit(1);
  if (!user || user.status !== "active") {
    throw Unauthorized("user_inactive", "User is no longer active");
  }

  // Pick the current primary membership (same logic as login)
  const [chosen] = await db
    .select({ membership: memberships, tenant: tenants, role: roles })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.status, "active"),
        isNull(memberships.deletedAt),
      ),
    )
    .limit(1);

  const tenantId = chosen?.tenant.id ?? "00000000-0000-0000-0000-000000000000";
  const tenantSlug = chosen?.tenant.slug ?? "system";

  const access = signAccessToken({
    sub: user.id,
    tid: tenantId,
    tsl: tenantSlug,
    sa: user.isSuperAdmin,
    ta: chosen?.membership.isTenantAdmin ?? false,
  });

  // Rotate refresh token (best practice — invalidates old one)
  const newRefresh = signRefreshToken({ sub: user.id, sid: session.id });
  await db
    .update(sessions)
    .set({
      refreshTokenHash: newRefresh.tokenHash,
      expiresAt: newRefresh.expiresAt,
      lastUsedAt: new Date(),
    })
    .where(eq(sessions.id, session.id));

  const me = await buildMe(user, chosen);

  return {
    accessToken: access.token,
    refreshToken: newRefresh.token,
    accessExpiresAt: access.expiresAt.toISOString(),
    me,
  };
}

export async function logout(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: "user_logout" })
    .where(eq(sessions.id, sessionId));
}

export async function getMe(userId: string): Promise<Me> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  if (!user) throw Unauthorized();

  const [chosen] = await db
    .select({ membership: memberships, tenant: tenants, role: roles })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.status, "active"),
        isNull(memberships.deletedAt),
      ),
    )
    .limit(1);

  return buildMe(user, chosen);
}

async function buildMe(
  user: typeof users.$inferSelect,
  chosen: { membership: typeof memberships.$inferSelect; tenant: typeof tenants.$inferSelect; role: typeof roles.$inferSelect } | undefined,
): Promise<Me> {
  // MVP modules are always visible — they're the free baseline. The role /
  // membership lists ADD premium modules on top (CAPEX, AMC, AI Assist, etc).
  // Earlier logic REPLACED the default with role.moduleKeys, which meant any
  // role row written before a new MVP module was added (e.g. GRN) would hide
  // that module forever. UNION semantics avoid the regression.
  const mvpKeys = MODULES.filter((m) => m.mvp).map((m) => m.key);
  const extras: string[] = chosen
    ? [
        ...(chosen.role.moduleKeys ?? []),
        ...(chosen.membership.enabledModules ?? []),
      ]
    : [];
  const enabledModules = Array.from(new Set([...mvpKeys, ...extras]));

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    tenantId: chosen?.tenant.id ?? "00000000-0000-0000-0000-000000000000",
    tenantSlug: chosen?.tenant.slug ?? "system",
    tenantName: chosen?.tenant.name ?? "System",
    isSuperAdmin: user.isSuperAdmin,
    isTenantAdmin: chosen?.membership.isTenantAdmin ?? false,
    roleIds: chosen ? [chosen.role.id] : [],
    enabledModules,
  };
}

/** Utility used by the signup script and tests. */
export async function hashUserPassword(plain: string): Promise<string> {
  return hashPassword(plain);
}
