import { after, NextRequest, NextResponse } from 'next/server';
import { handleUpdate, hasTelegram, webhookSecret } from '@/server/telegram';

// Telegram webhook. Answers 200 immediately (so Telegram never retries) and does the work in after().

export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasTelegram() || request.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const update = await request.json().catch(() => null);
  if (update) {
    after(() => handleUpdate(update).catch((err) => console.error('[telegram]', (err as Error).message)));
  }
  return NextResponse.json({ ok: true });
}
