/**
 * Minimal transactional email sender.
 *
 * Sends via Resend (https://resend.com) when RESEND_API_KEY is set; otherwise
 * logs the message server-side so the flow is observable in dev without keys.
 * Returns whether the message was actually dispatched.
 */
import 'server-only';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}

export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  // onboarding@resend.dev works without domain verification (test sender).
  const from = process.env.ALERT_FROM_EMAIL || 'DealRadar <onboarding@resend.dev>';

  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set — would send "${msg.subject}" → ${msg.to}`);
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html, headers: msg.headers }),
    });
    if (!res.ok) {
      console.error('[email] send failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] send error:', e);
    return false;
  }
}
