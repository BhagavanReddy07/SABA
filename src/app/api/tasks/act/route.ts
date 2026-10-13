import { NextRequest, NextResponse } from 'next/server';
import { completeTaskById, snoozeTaskById } from '@/server/db';
import { escapeHtml, verifyTaskActionToken, type TaskAction } from '@/server/email';

// Landing endpoint for the Done / Snooze buttons in reminder emails and push notifications.
// The signed token is the authorization — no login needed, works from any mail client.
// GET only shows a confirmation page: email security scanners open links automatically, and a
// state change on GET would let them complete or snooze reminders nobody tapped (cf. RFC 8058).

const SNOOZE_MINUTES = 15;

function page(emoji: string, title: string, detail: string, extra = '', status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>SABA</title></head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0f172a;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<div style="text-align:center;padding:40px;max-width:420px;">
<p style="font-size:56px;margin:0;">${emoji}</p>
<h1 style="color:#f1f5f9;font-size:22px;margin:16px 0 8px;">${title}</h1>
<p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0;">${detail}</p>
${extra}
<a href="/chat" style="display:inline-block;margin-top:24px;padding:10px 22px;border-radius:10px;background:#334155;color:#fff;font-size:14px;font-weight:600;text-decoration:none;">Open SABA</a>
</div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
  );
}

const LABEL: Record<TaskAction, string> = { complete: '✓ Mark as done', snooze: `💤 Snooze ${SNOOZE_MINUTES} min` };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const parsed = verifyTaskActionToken(token);
  if (!parsed) {
    return page('🔒', 'Link expired or invalid', 'This reminder link is no longer valid. Open SABA to manage your tasks.', '', 400);
  }
  return page(
    parsed.action === 'complete' ? '✅' : '💤',
    parsed.action === 'complete' ? 'Mark this reminder as done?' : `Snooze for ${SNOOZE_MINUTES} minutes?`,
    'One tap to confirm.',
    `<form method="post" style="margin-top:22px;"><input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit" style="padding:12px 26px;border:0;border-radius:12px;background:#7c3aed;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">${LABEL[parsed.action]}</button></form>`
  );
}

/** Performs the action. Form posts (email page) get HTML; the service worker gets JSON. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const isJson = request.headers.get('content-type')?.includes('application/json');
  let token = '';
  try {
    token = isJson ? String((await request.json()).token ?? '') : String((await request.formData()).get('token') ?? '');
  } catch {
    // fall through to the invalid-token response
  }
  const parsed = verifyTaskActionToken(token);
  if (!parsed) {
    return isJson
      ? NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
      : page('🔒', 'Link expired or invalid', 'This reminder link is no longer valid.', '', 400);
  }

  const task =
    parsed.action === 'complete' ? await completeTaskById(parsed.taskId) : await snoozeTaskById(parsed.taskId, SNOOZE_MINUTES);
  if (isJson) return task ? NextResponse.json({ task }) : NextResponse.json({ error: 'Task not found' }, { status: 404 });

  if (parsed.action === 'complete') {
    return task
      ? page('✅', 'Marked as done!', `“${escapeHtml(task.content)}” is checked off. Nice work!`)
      : page('🤔', 'Task not found', 'It may have been deleted already.', '', 404);
  }
  return task
    ? page('💤', `Snoozed for ${SNOOZE_MINUTES} minutes`, `I'll remind you about “${escapeHtml(task.content)}” again shortly.`)
    : page('🤔', 'Nothing to snooze', 'This task is already completed or was deleted.', '', 404);
}
