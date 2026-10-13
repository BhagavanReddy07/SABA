import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { deletePushSubscription, savePushSubscription } from '@/server/db';
import { hasPush } from '@/server/push';
import { badRequest, handle, limit, readJson } from '@/server/http';

const B64URL = /^[A-Za-z0-9_-]+=*$/;

/** Save this browser's push subscription (from PushManager.subscribe). */
export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  if (!hasPush()) return NextResponse.json({ error: 'Push is not configured on this server' }, { status: 503 });
  await limit(`push:${user.id}`, 20, 3600);
  const { endpoint, keys } = await readJson(request);
  const p256dh = (keys as { p256dh?: unknown })?.p256dh;
  const auth = (keys as { auth?: unknown })?.auth;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 1000) {
    return badRequest('A valid https push endpoint is required');
  }
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !B64URL.test(p256dh) || !B64URL.test(auth)) {
    return badRequest('Subscription keys are missing');
  }
  await savePushSubscription(user.id, { endpoint, p256dh, auth });
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const { endpoint } = await readJson(request);
  if (typeof endpoint === 'string') await deletePushSubscription(endpoint, user.id);
  return NextResponse.json({ ok: true });
});
