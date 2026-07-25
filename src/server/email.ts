// Reminder emails via Brevo's HTTP API (free tier: 300/day, no card).
// ponytail: plain fetch, no email SDK; HMAC action links reuse AUTH_SECRET like auth.ts.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DueTask } from './db';

const TOKEN_DAYS = 7;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export type TaskAction = 'complete' | 'snooze';

/** Signed, expiring token authorizing one action on one task — safe to put in an email link. */
export function createTaskActionToken(taskId: string, action: TaskAction): string {
  const payload = Buffer.from(
    JSON.stringify({ tid: taskId, act: action, exp: Date.now() + TOKEN_DAYS * 86_400_000 })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyTaskActionToken(
  token: string
): { taskId: string; action: TaskAction } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { tid, act, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (
      typeof tid !== 'string' ||
      !['complete', 'snooze'].includes(act) ||
      typeof exp !== 'number' ||
      Date.now() > exp
    ) {
      return null;
    }
    return { taskId: tid, action: act };
  } catch {
    return null;
  }
}

export function hasEmailKey(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDue(dueAt: string, timezone: string | null): string {
  try {
    return new Date(dueAt).toLocaleString('en-US', {
      timeZone: timezone ?? 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return new Date(dueAt).toUTCString();
  }
}

/** Frosted-glass button: translucent tinted face, light border, soft glow. */
function button(href: string, label: string, tint: string, border: string, text: string): string {
  return `<a href="${href}" style="display:inline-block;padding:14px 22px;margin:5px;border-radius:16px;background:${tint};border:1px solid ${border};border-top:1px solid rgba(255,255,255,0.35);box-shadow:0 8px 24px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.12);color:${text};font-weight:700;font-size:14px;letter-spacing:0.2px;text-decoration:none;text-align:center;white-space:nowrap;">${label}</a>`;
}

function reminderHtml(task: DueTask, baseUrl: string): string {
  const completeUrl = `${baseUrl}/api/tasks/act?token=${createTaskActionToken(task.id, 'complete')}`;
  const snoozeUrl = `${baseUrl}/api/tasks/act?token=${createTaskActionToken(task.id, 'snooze')}`;
  const due = task.dueAt ? formatDue(task.dueAt, task.userTimezone) : '';
  const firstName = escapeHtml(task.userName.split(' ')[0]);

  return `
<div style="margin:0;padding:36px 16px;background:#090914;background-image:radial-gradient(ellipse at top,#1e1b4b 0%,#090914 60%);font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:460px;margin:0 auto;">

    <p style="margin:0 0 18px;text-align:center;font-size:15px;font-weight:800;letter-spacing:3px;color:#a78bfa;">✦ &nbsp;S A B A&nbsp; ✦</p>

    <!-- floating card -->
    <div style="background:linear-gradient(160deg,#1e1b3a 0%,#12122b 100%);border:1px solid rgba(167,139,250,0.35);border-top:1px solid rgba(255,255,255,0.18);border-radius:24px;box-shadow:0 24px 60px rgba(124,58,237,0.35),0 4px 12px rgba(0,0,0,0.6);overflow:hidden;">

      <div style="padding:30px 30px 6px;text-align:center;">
        <div style="display:inline-block;font-size:44px;line-height:1;">⏰</div>
        <p style="margin:12px 0 2px;color:#c4b5fd;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">It's time, ${firstName}</p>
        <p style="margin:10px 0 0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.35;text-shadow:0 2px 12px rgba(168,85,247,0.55);">${escapeHtml(task.content)}</p>
        ${due ? `<p style="margin:14px 0 0;"><span style="display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);color:#c4b5fd;font-size:12px;font-weight:600;">🗓 ${due}</span></p>` : ''}
      </div>

      <div style="text-align:center;padding:22px 24px 26px;">
        ${button(completeUrl, '✓ &nbsp;Done', 'rgba(52,211,153,0.16)', 'rgba(110,231,183,0.45)', '#6ee7b7')}
        ${button(snoozeUrl, '💤 &nbsp;Snooze 15 min', 'rgba(167,139,250,0.14)', 'rgba(196,181,253,0.4)', '#c4b5fd')}
      </div>
    </div>

    <p style="margin:20px 0 0;text-align:center;color:#4c4a6e;font-size:11px;">One tap updates your list in <a href="${baseUrl}" style="color:#a78bfa;text-decoration:none;font-weight:600;">SABA</a> too ✨</p>
  </div>
</div>`;
}

/** Sends one reminder email. Throws on API failure so the caller skips markTaskReminded. */
export async function sendReminderEmail(task: DueTask, baseUrl: string): Promise<void> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'SABA', email: process.env.BREVO_FROM },
      to: [{ email: task.userEmail, name: task.userName }],
      subject: `⏰ Reminder: ${task.content.slice(0, 60)}`,
      htmlContent: reminderHtml(task, baseUrl),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}
