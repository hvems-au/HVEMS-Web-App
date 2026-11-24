import "server-only";
import type { EmailContent } from "./render";

/** MailerSend email API (https://developers.mailersend.com/api/v1/email.html). */
const ENDPOINT = "https://api.mailersend.com/v1/email";

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  /** Worth retrying later (rate limit, server error, network). */
  retry: boolean;
}

export function emailConfigured(): boolean {
  return !!process.env.EMAIL_PROVIDER_API_KEY;
}

export async function sendEmail(
  to: { email: string; name: string },
  from: { email: string; name: string },
  content: EmailContent,
): Promise<SendResult> {
  const key = process.env.EMAIL_PROVIDER_API_KEY;
  if (!key) return { ok: false, error: "EMAIL_PROVIDER_API_KEY is not set", retry: true };
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true, messageId: res.headers.get("x-message-id") ?? undefined, retry: false };
    const detail = (await res.text()).slice(0, 500);
    return { ok: false, error: `MailerSend ${res.status}: ${detail}`, retry: res.status === 429 || res.status >= 500 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), retry: true };
  }
}
