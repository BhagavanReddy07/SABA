import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/server/auth';
import { handle } from '@/server/http';

export const POST = handle(async () => {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
