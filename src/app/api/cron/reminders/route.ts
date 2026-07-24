import { NextRequest, NextResponse } from 'next/server';
import { listDueTasks, markTaskReminded } from '@/server/db';
import { hasEmailKey, sendReminderEmail } from '@/server/email';

// Hit every few minutes by an external free cron (cron-job.org):
//   GET /api/cron/reminders?key=<CRON_SECRET>
// Sends reminder emails for due tasks, then marks them so they aren't re-sent
// (snoozing clears the mark and pushes due_at, so the next run re-sends).

export async function GET(request: NextRequest): Promise<NextResponse> {
  const key = request.nextUrl.searchParams.get('key');
  const bearer = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || (key !== process.env.CRON_SECRET && bearer !== process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasEmailKey()) {
    return NextResponse.json({ error: 'BREVO_API_KEY / BREVO_FROM not configured' }, { status: 503 });
  }

  const baseUrl = request.nextUrl.origin;
  const due = await listDueTasks();
  let sent = 0;
  const errors: string[] = [];

  for (const task of due) {
    try {
      await sendReminderEmail(task, baseUrl);
      await markTaskReminded(task.id);
      sent++;
    } catch (err) {
      errors.push(`${task.id}: ${(err as Error).message}`);
    }
  }

  if (errors.length) console.error('[cron/reminders]', errors);
  return NextResponse.json({ due: due.length, sent, failed: errors.length });
}
