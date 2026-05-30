import { Resend } from "resend";
import { env } from "../config/env";
import { logger } from "../lib/logger";

/**
 * Transactional email on Resend.
 *
 * Design rules:
 *  - When RESEND_API_KEY is absent the service no-ops gracefully (logs a
 *    warning) so dev / pre-config environments still work end-to-end.
 *  - sendMail is fire-and-forget: it NEVER throws into the caller. A mail
 *    failure must not roll back a business action (an approval or a receipt).
 *    Callers get a boolean back if they care, or can `void sendMail(...)`.
 */

let cached: Resend | null = null;

function getClient(): Resend | null {
  if (cached) return cached;
  if (!env.RESEND_API_KEY) return null;
  cached = new Resend(env.RESEND_API_KEY);
  return cached;
}

export function isMailConfigured(): boolean {
  return !!env.RESEND_API_KEY;
}

export interface MailMessage {
  /** Single address or a list — all recipients of one message. */
  to: string | string[];
  subject: string;
  html: string;
  cc?: string | string[];
  replyTo?: string;
}

export async function sendMail(msg: MailMessage): Promise<boolean> {
  const recipients = Array.isArray(msg.to) ? msg.to.filter(Boolean) : msg.to;
  if (!recipients || (Array.isArray(recipients) && recipients.length === 0)) {
    return false;
  }

  const client = getClient();
  if (!client) {
    logger.warn({ to: msg.to, subject: msg.subject }, "resend_not_configured_logging_only");
    return false;
  }

  try {
    const { data, error } = await client.emails.send({
      from: env.MAIL_FROM,
      to: recipients,
      cc: msg.cc,
      replyTo: msg.replyTo,
      subject: msg.subject,
      html: msg.html,
    });
    if (error) {
      // Resend reports delivery problems via `error` rather than throwing.
      logger.error({ err: error, to: msg.to }, "mail_send_failed");
      return false;
    }
    logger.info({ messageId: data?.id, to: msg.to }, "mail_sent");
    return true;
  } catch (err) {
    // Never propagate — a mail failure must not break the calling flow.
    logger.error({ err, to: msg.to }, "mail_send_error");
    return false;
  }
}

/** Escape user-supplied text before interpolating it into email HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wrap body content in a minimal, email-client-safe HTML shell. Keeps inline
 * styles only (no <style> blocks) so it renders consistently across clients.
 */
export function renderEmail(opts: { heading: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string }): string {
  const cta = opts.ctaUrl
    ? `<p style="margin:24px 0"><a href="${opts.ctaUrl}" style="background:#1a56db;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">${opts.ctaLabel ?? "View"}</a></p>`
    : "";
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#1a1a1a;line-height:1.6;max-width:560px;margin:0 auto">
      <h2 style="font-size:18px;margin:0 0 12px">${opts.heading}</h2>
      ${opts.bodyHtml}
      ${cta}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
      <p style="font-size:12px;color:#6b7280;margin:0">Indus ERP — this is an automated notification.</p>
    </div>
  `;
}
