import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { EmailContent } from "./render";

/**
 * Sends notification emails through MailerSend.
 *  - SMTP (default; the same MailerSend SMTP user as Supabase Auth): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
 *  - or the MailerSend email API when EMAIL_PROVIDER_API_KEY is set instead.
 */
const API_ENDPOINT = "https://api.mailersend.com/v1/email";

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  /** Worth retrying later (rate limit, server error, network). */
  retry: boolean;
}

const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

export function emailConfigured(): boolean {
  return smtpConfigured() || !!process.env.EMAIL_PROVIDER_API_KEY;
}

let transporter: Transporter | null = null;
function smtp(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 587 upgrades with STARTTLS
      requireTLS: port !== 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

async function sendSmtp(to: { email: string; name: string }, from: { email: string; name: string }, content: EmailContent): Promise<SendResult> {
  try {
    const info = await smtp().sendMail({
      from: { address: from.email, name: from.name },
      to: { address: to.email, name: to.name },
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    if (info.rejected?.length) return { ok: false, error: `Rejected: ${info.rejected.join(", ")}`, retry: false };
    return { ok: true, messageId: info.messageId, retry: false };
  } catch (e) {
    const err = e as { responseCode?: number; message?: string };
    // 5xx SMTP replies (bad address, refused sender) won't succeed on retry; 4xx and network errors might.
    const permanent = typeof err.responseCode === "number" && err.responseCode >= 500 && err.responseCode !== 554;
    return { ok: false, error: (err.message ?? String(e)).slice(0, 500), retry: !permanent };
  }
}

async function sendApi(to: { email: string; name: string }, from: { email: string; name: string }, content: EmailContent): Promise<SendResult> {
  try {
    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.EMAIL_PROVIDER_API_KEY}`, "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ from, to: [to], subject: content.subject, html: content.html, text: content.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true, messageId: res.headers.get("x-message-id") ?? undefined, retry: false };
    const detail = (await res.text()).slice(0, 500);
    return { ok: false, error: `MailerSend ${res.status}: ${detail}`, retry: res.status === 429 || res.status >= 500 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), retry: true };
  }
}

export async function sendEmail(to: { email: string; name: string }, from: { email: string; name: string }, content: EmailContent): Promise<SendResult> {
  if (smtpConfigured()) return sendSmtp(to, from, content);
  if (process.env.EMAIL_PROVIDER_API_KEY) return sendApi(to, from, content);
  return { ok: false, error: "Email is not configured (SMTP_HOST / SMTP_USER / SMTP_PASSWORD)", retry: true };
}
