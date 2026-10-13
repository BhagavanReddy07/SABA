import { NextResponse } from 'next/server';
import { clearSessionCookie, requireUser } from '@/server/auth';
import { bumpSessionVersion } from '@/server/db';
import { handle } from '@/server/http';

/** "Sign out of all devices": every issued session token carries the old version and stops working. */
export const DELETE = handle(async () => {
  const user = await requireUser();
  await bumpSessionVersion(user.id);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
