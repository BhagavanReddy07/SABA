import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { disconnectCalendar } from '@/server/calendar';
import { handle } from '@/server/http';

/** Disconnect Google Calendar: revokes the grant at Google and deletes the stored token. */
export const DELETE = handle(async () => {
  const user = await requireUser();
  await disconnectCalendar(user.id);
  return NextResponse.json({ ok: true });
});
