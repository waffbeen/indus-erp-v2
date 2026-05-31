import { eq, and, desc, isNull, sql, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { notifications } from "../db/schema/notifications";
import { memberships } from "../db/schema/memberships";
import { users } from "../db/schema/users";
import { notificationPreferences } from "../db/schema/notification_preferences";
import { sendMail, renderEmail, escapeHtml, isMailConfiguredFor } from "./mail.service";
import { sendWhatsApp, isWhatsAppConfiguredFor } from "./whatsapp.service";
import { appUrl } from "../config/env";
import { logger } from "../lib/logger";

/**
 * Notifications are MULTI-CHANNEL. Every event always creates an in-app
 * notification (the bell badge). On top of that, the same event can fan out to:
 *   - WhatsApp — for users who have a phone number, when the tenant has a
 *     WhatsApp config. This is the headline new channel and is ON by default
 *     (it's purely additive — nothing else in the app sends WhatsApp).
 *   - Email — OFF by default, opt-in per call. The procurement flows
 *     (pr/po/grn/vendor-invoice services) already send their OWN tailored emails
 *     directly via mail.service, so emailing again from here would double-send.
 *     A caller that has no email of its own can set `channels.email = true`.
 *
 * Extra-channel sends are ALWAYS best-effort: they run fire-and-forget AFTER the
 * in-app row is written and can never throw into / block the caller. A WhatsApp
 * or SMTP outage must not affect the in-app notification or the business action.
 *
 * Per-user opt-outs live in `notification_preferences` (default-on; a row with
 * enabled=false suppresses that channel for that user).
 */

interface ChannelToggle {
  /** Default false — existing flows send their own tailored emails. */
  email?: boolean;
  /** Default true — additive, no other code sends WhatsApp. */
  whatsapp?: boolean;
}

interface NotifyInput {
  tenantId: string;
  userIds: string[];
  kind: string;
  title: string;
  body?: string;
  resourceType?: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  /** Optional per-call channel control. */
  channels?: ChannelToggle;
}

/**
 * Fan out a notification to one or more users in a tenant. Caller decides who
 * gets notified — typically all tenant admins for approvals, or a specific
 * user (requester / creator).
 */
export async function notifyUsers(input: NotifyInput) {
  if (input.userIds.length === 0) return;
  const dedup = Array.from(new Set(input.userIds));

  // 1) In-app — the source of truth. Must succeed.
  await db.insert(notifications).values(
    dedup.map((uid) => ({
      tenantId: input.tenantId,
      userId: uid,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ?? {},
    })),
  );

  // 2) Extra channels — best-effort, never blocks or throws.
  fanOutExtraChannels({ ...input, userIds: dedup });
}

/**
 * Convenience: fan out to every active tenant admin (used when the actor
 * doesn't know who specifically approves).
 */
export async function notifyTenantAdmins(input: Omit<NotifyInput, "userIds"> & { excludeUserId?: string }) {
  const admins = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, input.tenantId),
        eq(memberships.isTenantAdmin, true),
        eq(memberships.status, "active"),
        isNull(memberships.deletedAt),
      ),
    );
  const userIds = admins
    .map((a) => a.userId)
    .filter((id) => id !== input.excludeUserId);
  await notifyUsers({ ...input, userIds });
}

// ---------------------------------------------------------------------------
// Multi-channel fan-out (best-effort).
// ---------------------------------------------------------------------------

/** Fire-and-forget wrapper — swallows everything so callers are never affected. */
function fanOutExtraChannels(input: NotifyInput): void {
  const wantEmail = input.channels?.email ?? false;
  const wantWhatsApp = input.channels?.whatsapp ?? true;
  if (!wantEmail && !wantWhatsApp) return;

  void fanOutExtraChannelsAsync(input, wantEmail, wantWhatsApp).catch((err) =>
    logger.warn({ err, kind: input.kind }, "notification_fanout_failed"),
  );
}

async function fanOutExtraChannelsAsync(
  input: NotifyInput,
  wantEmail: boolean,
  wantWhatsApp: boolean,
): Promise<void> {
  // Only do the work for channels the tenant can actually use.
  const [emailReady, whatsappReady] = await Promise.all([
    wantEmail ? isMailConfiguredFor(input.tenantId).catch(() => false) : Promise.resolve(false),
    wantWhatsApp ? isWhatsAppConfiguredFor(input.tenantId).catch(() => false) : Promise.resolve(false),
  ]);
  if (!emailReady && !whatsappReady) return;

  const [contacts, prefs] = await Promise.all([
    db
      .select({ id: users.id, email: users.email, phone: users.phone })
      .from(users)
      .where(inArray(users.id, input.userIds)),
    db
      .select({ userId: notificationPreferences.userId, channel: notificationPreferences.channel, enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.tenantId, input.tenantId),
          inArray(notificationPreferences.userId, input.userIds),
        ),
      ),
  ]);

  // Opt-out set: "<userId>:<channel>" present means the user disabled it.
  const disabled = new Set<string>();
  for (const p of prefs) if (!p.enabled) disabled.add(`${p.userId}:${p.channel}`);

  const ctaUrl =
    input.resourceType && input.resourceId ? appUrl(`${input.resourceType}/${input.resourceId}`) : undefined;
  const whatsappText = buildWhatsAppText(input);

  const jobs: Promise<unknown>[] = [];
  for (const c of contacts) {
    if (emailReady && c.email && !disabled.has(`${c.id}:email`)) {
      jobs.push(
        sendMail({
          tenantId: input.tenantId,
          to: c.email,
          subject: input.title,
          html: renderEmail({
            heading: input.title,
            bodyHtml: input.body ? `<p>${escapeHtml(input.body)}</p>` : "",
            ctaLabel: "Open in Indus ERP",
            ctaUrl,
          }),
        }),
      );
    }
    if (whatsappReady && c.phone && !disabled.has(`${c.id}:whatsapp`)) {
      jobs.push(sendWhatsApp({ tenantId: input.tenantId, to: c.phone, body: whatsappText }));
    }
  }

  // Each job already swallows its own errors; allSettled is belt-and-braces.
  await Promise.allSettled(jobs);
}

/**
 * Build the WhatsApp message text. For approval-request notifications that carry
 * a PR number, append the reply command so an approver can act straight from
 * WhatsApp (handled by the inbound webhook in whatsapp.routes).
 */
function buildWhatsAppText(input: NotifyInput): string {
  const lines = [`*${input.title}*`];
  if (input.body) lines.push(input.body);

  const prNumber = typeof input.metadata?.prNumber === "string" ? (input.metadata.prNumber as string) : null;
  const isApprovalRequest =
    input.resourceType === "pr" && (input.kind.includes("submitted") || input.kind.includes("awaiting"));
  if (prNumber && isApprovalRequest) {
    lines.push(`Reply *APPROVE ${prNumber}* to approve, or *REJECT ${prNumber}* to reject.`);
  }
  return lines.join("\n\n");
}

interface ListOpts { onlyUnread?: boolean; limit?: number; }

export async function listNotifications(tenantId: string, userId: string, opts: ListOpts = {}) {
  const conds = [eq(notifications.tenantId, tenantId), eq(notifications.userId, userId)];
  if (opts.onlyUnread) conds.push(isNull(notifications.readAt));
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit ?? 30);
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    resourceType: n.resourceType,
    resourceId: n.resourceId,
    metadata: n.metadata,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function unreadCount(tenantId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
  return row?.count ?? 0;
}

export async function markRead(tenantId: string, userId: string, ids?: string[]) {
  if (ids && ids.length === 0) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        ...(ids ? [inArray(notifications.id, ids)] : []),
      ),
    );
}
