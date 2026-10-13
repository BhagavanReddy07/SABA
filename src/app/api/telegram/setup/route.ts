import { NextRequest, NextResponse } from 'next/server';
import { botUsername, hasTelegram, setWebhook } from '@/server/telegram';

/** One-time setup: open /api/telegram/setup?key=<CRON_SECRET> after setting TELEGRAM_BOT_TOKEN. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.nextUrl.searchParams.get('key') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasTelegram()) return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, { status: 503 });
  try {
    const url = `${request.nextUrl.origin}/api/telegram`;
    await setWebhook(url);
    return NextResponse.json({ ok: true, webhook: url, bot: `@${await botUsername()}` });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
