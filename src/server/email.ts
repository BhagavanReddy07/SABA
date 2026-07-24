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

const PRIORITY_COLOR = { low: '#64748b', medium: '#f59e0b', high: '#ef4444' } as const;

function button(href: string, label: string, bg: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 22px;margin:0 6px;border-radius:10px;background:${bg};color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;">${label}</a>`;
}

function reminderHtml(task: DueTask, baseUrl: string): string {
  const completeUrl = `${baseUrl}/api/tasks/act?token=${createTaskActionToken(task.id, 'complete')}`;
  const snoozeUrl = `${baseUrl}/api/tasks/act?token=${createTaskActionToken(task.id, 'snooze')}`;
  const due = task.dueAt ? formatDue(task.dueAt, task.userTimezone) : '';
  const firstName = escapeHtml(task.userName.split(' ')[0]);

  return `
<div style="margin:0;padding:24px;background:#0f172a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
    <div style="padding:20px 28px;background:linear-gradient(135deg,#7c3aed,#a855f7);">
      <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">⏰ SABA Reminder</p>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 6px;color:#cbd5e1;font-size:15px;">Hey ${firstName} 👋</p>
      <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;">You asked me to remind you about this — it's time!</p>
      <div style="background:#0f172a;border:1px solid #334155;border-left:4px solid ${PRIORITY_COLOR[task.priority]};border-radius:10px;padding:16px 18px;">
        <p style="margin:0;color:#f1f5f9;font-size:16px;font-weight:600;line-height:1.5;">${escapeHtml(task.content)}</p>
        ${due ? `<p style="margin:8px 0 0;color:#94a3b8;font-size:13px;">🗓️ Due: ${due} &nbsp;·&nbsp; ${task.priority} priority</p>` : ''}
      </div>
      <div style="text-align:center;margin:26px 0 8px;">
        ${button(completeUrl, '✅ Mark as done', '#10b981')}
        ${button(snoozeUrl, '💤 Snooze 15 min', '#f59e0b')}
      </div>
      <p style="margin:18px 0 0;text-align:center;color:#64748b;font-size:12px;">
        Snoozing sends this again in 15 minutes. Buttons also update your task list in SABA.
      </p>
    </div>
    <div style="padding:14px 28px;border-top:1px solid #334155;">
      <p style="margin:0;color:#64748b;font-size:12px;">Sent with ❤️ by <a href="${baseUrl}" style="color:#a855f7;text-decoration:none;">SABA</a>, your personal assistant.</p>
    </div>
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
