import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { resolveTenantMailConfig } from "./mail-settings.service";

/**
 * Transactional email with two interchangeable transports:
 *  1. SMTP (preferred when SMTP_HOST is set) — send from an existing mailbox,
 *     e.g. the same account the legacy app used.
 *  2. Resend (when RESEND_API_KEY is set and SMTP is not).
 *
 * Design rules:
 *  - When NEITHER is configured, every send is a graceful no-op (logged) so dev
 *    / pre-config environments still work end-to-end.
 *  - sendMail is fire-and-forget: it NEVER throws into the caller. A mail failure
 *    must not roll back a business action (an approval or a receipt). Callers get
 *    a boolean if they care, or can `void sendMail(...)`.
 */

let resendClient: Resend | null = null;
// `undefined` = not yet resolved, `null` = SMTP not configured.
let smtpTransport: Transporter | null | undefined;

function getResend(): Resend | null {
  if (resendClient) return resendClient;
  if (!env.RESEND_API_KEY) return null;
  resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
}

function getSmtp(): Transporter | null {
  if (smtpTransport !== undefined) return smtpTransport;
  if (!env.SMTP_HOST) {
    smtpTransport = null;
    return null;
  }
  smtpTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true for 465; false for 587/STARTTLS
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return smtpTransport;
}

/** Platform-level (env) mail configured? */
export function isMailConfigured(): boolean {
  return Boolean(env.SMTP_HOST || env.RESEND_API_KEY);
}

/** Can this tenant send mail — via their OWN SMTP or the platform fallback? */
export async function isMailConfiguredFor(tenantId?: string): Promise<boolean> {
  if (tenantId && (await resolveTenantMailConfig(tenantId))) return true;
  return isMailConfigured();
}

export interface MailMessage {
  /** Single address or a list — all recipients of one message. */
  to: string | string[];
  subject: string;
  html: string;
  cc?: string | string[];
  replyTo?: string;
  /** When set, the tenant's own SMTP config (if any) is used in preference to the platform transport. */
  tenantId?: string;
}

export async function sendMail(msg: MailMessage): Promise<boolean> {
  const recipients = Array.isArray(msg.to) ? msg.to.filter(Boolean) : msg.to;
  if (!recipients || (Array.isArray(recipients) && recipients.length === 0)) {
    return false;
  }

  // 0) Per-tenant SMTP takes highest precedence when the tenant has configured one.
  if (msg.tenantId) {
    const cfg = await resolveTenantMailConfig(msg.tenantId);
    if (cfg) {
      try {
        const transport = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: cfg.auth,
        });
        const info = await transport.sendMail({
          from: cfg.from,
          to: recipients,
          cc: msg.cc,
          replyTo: msg.replyTo,
          subject: msg.subject,
          html: msg.html,
        });
        logger.info({ messageId: info.messageId, to: msg.to, tenantId: msg.tenantId }, "mail_sent_tenant_smtp");
        return true;
      } catch (err) {
        logger.error({ err, to: msg.to, tenantId: msg.tenantId }, "mail_send_error_tenant_smtp");
        return false;
      }
    }
  }

  // 1) Platform SMTP transport when configured.
  const smtp = getSmtp();
  if (smtp) {
    try {
      const info = await smtp.sendMail({
        from: env.MAIL_FROM,
        to: recipients,
        cc: msg.cc,
        replyTo: msg.replyTo,
        subject: msg.subject,
        html: msg.html,
      });
      logger.info({ messageId: info.messageId, to: msg.to }, "mail_sent_smtp");
      return true;
    } catch (err) {
      logger.error({ err, to: msg.to }, "mail_send_error_smtp");
      return false;
    }
  }

  // 2) Resend fallback.
  const resend = getResend();
  if (!resend) {
    logger.warn({ to: msg.to, subject: msg.subject }, "mail_not_configured_logging_only");
    return false;
  }
  try {
    const { data, error } = await resend.emails.send({
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
    logger.info({ messageId: data?.id, to: msg.to }, "mail_sent_resend");
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
