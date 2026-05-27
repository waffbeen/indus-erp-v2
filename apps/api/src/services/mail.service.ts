import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "../lib/logger";

let cached: Transporter | null = null;

/** Build (or reuse) a transporter from env config. Null when not configured. */
function getTransporter(): Transporter | null {
  if (cached) return cached;
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) return null;
  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return cached;
}

export function isMailConfigured(): boolean {
  return getTransporter() !== null;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  cc?: string;
  replyTo?: string;
}

/**
 * Send an email. When SMTP isn't configured, logs the payload and returns false
 * — letting callers continue (e.g. mark PO as "sent" with an audit note) so the
 * feature is usable in dev without breaking flows in prod-without-SMTP.
 */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    logger.warn({ to: msg.to, subject: msg.subject }, "smtp_not_configured_logging_only");
    return false;
  }
  try {
    const info = await t.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: msg.to,
      cc: msg.cc,
      replyTo: msg.replyTo,
      subject: msg.subject,
      html: msg.html,
    });
    logger.info({ messageId: info.messageId, to: msg.to }, "mail_sent");
    return true;
  } catch (err) {
    logger.error({ err, to: msg.to }, "mail_send_failed");
    throw err;
  }
}
