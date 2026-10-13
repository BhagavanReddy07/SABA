import { NextRequest, NextResponse } from 'next/server';
import { cronTick } from '@/server/pulse';

// The one scheduler: an external free cron (cron-job.org) calls this every ~5 minutes:
//   GET /api/cron/reminders?key=<CRON_SECRET>      (or Authorization: Bearer <CRON_SECRET>)
// Each tick delivers due reminders (email / Telegram / push), sends morning briefs at the
// user's local 8 AM, and runs nightly memory consolidation — see src/server/pulse.ts.

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const key = request.nextUrl.searchParams.get('key');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const secret = process.env.CRON_SECRET;
  if (!secret || (key !== secret && bearer !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await cronTick(request.nextUrl.origin));
  } catch (err) {
    console.error('[cron]', err);
    return NextResponse.json({ error: 'Tick failed' }, { status: 500 });
  }
}
