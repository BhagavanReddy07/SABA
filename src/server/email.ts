// Transactional email via Brevo's HTTP API (free tier: 300/day, no card): reminders, address
// verification, password reset and the SABA Pulse morning brief.
// ponytail: plain fetch, no email SDK; links carry purpose-scoped HMAC tokens (tokens.ts).

import { hmac, signToken, verifyToken } from './tokens';
import type { DbUser, DueTask } from './db';

// --- Account links ---

export function verifyLink(user: Pick<DbUser, 'id' | 'email'>, baseUrl: string): string {
  return `${baseUrl}/api/auth/verify?token=${signToken({ p: 'v', uid: user.id, e: user.email }, 3 * 86_400_000)}`;
}

export function parseVerifyToken(token: string): { userId: string; email: string } | null {
  const p = verifyToken<{ p?: unknown; uid?: unknown; e?: unknown }>(token);
  return p && p.p === 'v' && typeof p.uid === 'string' && typeof p.e === 'string' ? { userId: p.uid, email: p.e } : null;
}

/** Changes whenever the password does, so a reset link works exactly once. */
export const resetFingerprint = (passwordHash: string | null): string => hmac(`reset:${passwordHash ?? 'none'}`).slice(0, 16);

export function resetLink(user: Pick<DbUser, 'id' | 'passwordHash'>, baseUrl: string): string {
  return `${baseUrl}/reset?token=${signToken({ p: 'r', uid: user.id, f: resetFingerprint(user.passwordHash) }, 3_600_000)}`;
}

export function parseResetToken(token: string): { userId: string; fingerprint: string } | null {
  const p = verifyToken<{ p?: unknown; uid?: unknown; f?: unknown }>(token);
  return p && p.p === 'r' && typeof p.uid === 'string' && typeof p.f === 'string' ? { userId: p.uid, fingerprint: p.f } : null;
}

export type TaskAction = 'complete' | 'snooze';

/** Signed, expiring token authorizing one action on one task — safe to put in an email link. */
export function createTaskActionToken(taskId: string, action: TaskAction): string {
  return signToken({ p: 't', tid: taskId, act: action }, 7 * 86_400_000);
}

/** Also accepts pre-purpose tokens ({tid, act, exp}) still sitting in inboxes. */
export function verifyTaskActionToken(token: string): { taskId: string; action: TaskAction } | null {
  const p = verifyToken<{ p?: unknown; tid?: unknown; act?: unknown }>(token);
  if (!p || (p.p !== undefined && p.p !== 't')) return null;
  if (typeof p.tid !== 'string' || (p.act !== 'complete' && p.act !== 'snooze')) return null;
  return { taskId: p.tid, action: p.act };
}

export function hasEmailKey(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDue(dueAt: string, timezone: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  try {
    return new Date(dueAt).toLocaleString('en-US', { ...opts, timeZone: timezone ?? 'UTC' });
  } catch {
    return new Date(dueAt).toUTCString();
  }
}

/** Frosted-glass button: translucent tinted face, light border, soft glow. */
function button(href: string, label: string, tint: string, border: string, text: string): string {
  return `<a href="${href}" style="display:inline-block;padding:14px 22px;margin:5px;border-radius:16px;background:${tint};border:1px solid ${border};border-top:1px solid rgba(255,255,255,0.35);box-shadow:0 8px 24px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.12);color:${text};font-weight:700;font-size:14px;letter-spacing:0.2px;text-decoration:none;text-align:center;white-space:nowrap;">${label}</a>`;
}

const violetButton = (href: string, label: string) =>
  button(href, label, 'rgba(167,139,250,0.14)', 'rgba(196,181,253,0.4)', '#c4b5fd');

/** The shared dark card every SABA email uses. */
function layout(baseUrl: string, inner: string): string {
  return `
<div style="margin:0;padding:36px 16px;background:#090914;background-image:radial-gradient(ellipse at top,#1e1b4b 0%,#090914 60%);font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:460px;margin:0 auto;">
    <p style="margin:0 0 18px;text-align:center;font-size:15px;font-weight:800;letter-spacing:3px;color:#a78bfa;">✦ &nbsp;S A B A&nbsp; ✦</p>
    <div style="background:linear-gradient(160deg,#1e1b3a 0%,#12122b 100%);border:1px solid rgba(167,139,250,0.35);border-top:1px solid rgba(255,255,255,0.18);border-radius:24px;box-shadow:0 24px 60px rgba(124,58,237,0.35),0 4px 12px rgba(0,0,0,0.6);overflow:hidden;">
      ${inner}
    </div>
    <p style="margin:20px 0 0;text-align:center;color:#4c4a6e;font-size:11px;">Sent by <a href="${baseUrl}" style="color:#a78bfa;text-decoration:none;font-weight:600;">SABA</a> ✨</p>
  </div>
</div>`;
}

const heading = (emoji: string, kicker: string, title: string) => `
  <div style="padding:30px 30px 6px;text-align:center;">
    <div style="display:inline-block;font-size:44px;line-height:1;">${emoji}</div>
    <p style="margin:12px 0 2px;color:#c4b5fd;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">${kicker}</p>
    <p style="margin:10px 0 0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.35;text-shadow:0 2px 12px rgba(168,85,247,0.55);">${title}</p>
  </div>`;

const firstName = (name: string) => escapeHtml(name.split(' ')[0] || name);

export function reminderEmail(task: DueTask, baseUrl: string): { subject: string; html: string } {
  const completeUrl = `${baseUrl}/api/tasks/act?token=${createTaskActionToken(task.id, 'complete')}`;
  const snoozeUrl = `${baseUrl}/api/tasks/act?token=${createTaskActionToken(task.id, 'snooze')}`;
  const due = task.dueAt ? formatDue(task.dueAt, task.userTimezone) : '';
  return {
    subject: `⏰ Reminder: ${task.content.slice(0, 60)}`,
    html: layout(
      baseUrl,
      `${heading('⏰', `It's time, ${firstName(task.userName)}`, escapeHtml(task.content))}
      ${due ? `<p style="margin:14px 0 0;text-align:center;"><span style="display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);color:#c4b5fd;font-size:12px;font-weight:600;">🗓 ${due}</span></p>` : ''}
      <div style="text-align:center;padding:22px 24px 26px;">
        ${button(completeUrl, '✓ &nbsp;Done', 'rgba(52,211,153,0.16)', 'rgba(110,231,183,0.45)', '#6ee7b7')}
        ${violetButton(snoozeUrl, '💤 &nbsp;Snooze 15 min')}
      </div>`
    ),
  };
}

export function verificationEmail(name: string, link: string, baseUrl: string): { subject: string; html: string } {
  return {
    subject: 'Verify your email for SABA',
    html: layout(
      baseUrl,
      `${heading('✉️', `Hi ${firstName(name)}`, 'Confirm your email')}
      <p style="margin:12px 30px 0;color:#a5a3c8;font-size:14px;line-height:1.6;text-align:center;">So SABA can send your reminders and morning brief here. The link works for 3 days.</p>
      <div style="text-align:center;padding:22px 24px 26px;">${violetButton(link, '✓ &nbsp;Verify email')}</div>`
    ),
  };
}

export function resetEmail(name: string, link: string, baseUrl: string): { subject: string; html: string } {
  return {
    subject: 'Reset your SABA password',
    html: layout(
      baseUrl,
      `${heading('🔑', `Hi ${firstName(name)}`, 'Reset your password')}
      <p style="margin:12px 30px 0;color:#a5a3c8;font-size:14px;line-height:1.6;text-align:center;">This link works for 1 hour and only once. If you didn't ask for it, ignore this email — nothing changes.</p>
      <div style="text-align:center;padding:22px 24px 26px;">${violetButton(link, 'Choose a new password')}</div>`
    ),
  };
}

export type Brief = {
  name: string;
  today: { content: string; when: string; overdue: boolean }[];
  dates: { label: string; when: string; prompt: string }[];
  goal: { text: string; prompt: string } | null;
};

export function briefEmail(brief: Brief, baseUrl: string): { subject: string; html: string } {
  const ask = (prompt: string) => `${baseUrl}/chat?q=${encodeURIComponent(prompt)}`;
  const section = (title: string, rows: string) =>
    `<p style="margin:18px 30px 6px;color:#c4b5fd;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${title}</p>${rows}`;
  const row = (text: string, sub = '', link = '') =>
    `<p style="margin:0 30px 8px;color:#e5e4f7;font-size:14px;line-height:1.5;">• ${text}${sub ? ` <span style="color:#8b89b3;">— ${sub}</span>` : ''}${link}</p>`;
  const linkTo = (href: string, label: string) =>
    ` <a href="${href}" style="color:#a78bfa;font-weight:600;text-decoration:none;">${label} →</a>`;

  let body = heading('☀️', `Good morning, ${firstName(brief.name)}`, 'Your day with SABA');
  body += section(
    'Today',
    brief.today.length
      ? brief.today.map((t) => row(escapeHtml(t.content), `${t.overdue ? 'overdue · ' : ''}${t.when}`)).join('')
      : row('Nothing scheduled — a clear day.')
  );
  if (brief.dates.length) {
    body += section('Coming up', brief.dates.map((d) => row(escapeHtml(d.label), d.when, linkTo(ask(d.prompt), 'Plan it'))).join(''));
  }
  if (brief.goal) body += section('Check-in', row(escapeHtml(brief.goal.text), '', linkTo(ask(brief.goal.prompt), 'Reply')));
  body += `<div style="text-align:center;padding:22px 24px 26px;">${violetButton(`${baseUrl}/chat`, 'Open SABA')}</div>`;
  return { subject: `☀️ Your SABA brief${brief.today.length ? ` — ${brief.today.length} thing${brief.today.length === 1 ? '' : 's'} today` : ''}`, html: layout(baseUrl, body) };
}

/** Sends one email. Throws on API failure so callers don't mark it as sent. */
export async function sendEmail(to: { email: string; name: string }, message: { subject: string; html: string }): Promise<void> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'SABA', email: process.env.BREVO_FROM },
      to: [{ email: to.email, name: to.name }],
      subject: message.subject,
      htmlContent: message.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
