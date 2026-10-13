import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, requireUser } from '@/server/auth';
import { deleteUser, listUserVectorIds, toPublicUser, updateUserProfile } from '@/server/db';
import { disconnectCalendar } from '@/server/calendar';
import { purgeUserVectors } from '@/server/memory/vectors';
import { badRequest, handle, readJson } from '@/server/http';

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ user: toPublicUser(user) });
});

export const PATCH = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const { name, briefEnabled } = await readJson(request);

  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 80)) {
    return badRequest('Name must be 1–80 characters');
  }
  if (briefEnabled !== undefined && typeof briefEnabled !== 'boolean') {
    return badRequest('briefEnabled must be a boolean');
  }

  const updated = await updateUserProfile(user.id, {
    name: typeof name === 'string' ? name.trim() : undefined,
    briefEnabled: briefEnabled as boolean | undefined,
  });
  return NextResponse.json({ user: toPublicUser(updated) });
});

/** Deletes the account and everything in it — including Tier 3 vectors and the Google grant. */
export const DELETE = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const { confirm } = await readJson(request);
  if (typeof confirm !== 'string' || confirm.trim().toLowerCase() !== user.email) {
    return badRequest('Type your email address to confirm');
  }
  await purgeUserVectors(user.id, await listUserVectorIds(user.id));
  if (user.calendarLinked) await disconnectCalendar(user.id).catch(() => {});
  await deleteUser(user.id); // everything else cascades
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
