import { NextRequest, NextResponse } from 'next/server';
import { completeTaskById, snoozeTaskById } from '@/server/db';
import { escapeHtml, verifyTaskActionToken } from '@/server/email';

// Landing endpoint for the buttons inside reminder emails. The signed token is
// the authorization — no login needed, works from any mail client.

const SNOOZE_MINUTES = 15;

function page(emoji: string, title: string, detail: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SABA</title></head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0f172a;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<div style="text-align:center;padding:40px;max-width:420px;">
<p style="font-size:56px;margin:0;">${emoji}</p>
<h1 style="color:#f1f5f9;font-size:22px;margin:16px 0 8px;">${title}</h1>
<p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0;">${detail}</p>
<a href="/chat" style="display:inline-block;margin-top:24px;padding:10px 22px;border-radius:10px;background:#7c3aed;color:#fff;font-size:14px;font-weight:600;text-decoration:none;">Open SABA</a>
</div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const parsed = verifyTaskActionToken(token);
  if (!parsed) {
    return page('🔒', 'Link expired or invalid', 'This reminder link is no longer valid. Open SABA to manage your tasks.', 400);
  }

  if (parsed.action === 'complete') {
    const task = await completeTaskById(parsed.taskId);
    return task
      ? page('✅', 'Marked as done!', `“${escapeHtml(task.content)}” is checked off. Nice work!`)
      : page('🤔', 'Task not found', 'It may have been deleted already.', 404);
  }

  const task = await snoozeTaskById(parsed.taskId, SNOOZE_MINUTES);
  return task
    ? page('💤', `Snoozed for ${SNOOZE_MINUTES} minutes`, `I'll email you again about “${escapeHtml(task.content)}” shortly.`)
    : page('🤔', 'Nothing to snooze', 'This task is already completed or was deleted.', 404);
}
