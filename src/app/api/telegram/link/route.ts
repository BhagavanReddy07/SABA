import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { setTelegramLinkCode, unlinkTelegram } from '@/server/db';
import { botUsername, hasTelegram } from '@/server/telegram';
import { randomToken } from '@/server/tokens';
import { handle } from '@/server/http';

/** Creates a one-time deep link (valid 15 min): opening it in Telegram links the chat to this account. */
export const POST = handle(async () => {
  const user = await requireUser();
  if (!hasTelegram()) return NextResponse.json({ error: 'Telegram is not configured on this server' }, { status: 503 });
  const code = randomToken(12); // base64url — within Telegram's /start payload rules
  await setTelegramLinkCode(user.id, code);
  return NextResponse.json({ url: `https://t.me/${await botUsername()}?start=${code}` });
});

export const DELETE = handle(async () => {
  const user = await requireUser();
  await unlinkTelegram(user.id);
  return NextResponse.json({ ok: true });
});
