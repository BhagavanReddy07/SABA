import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, hitRateLimit } from '@/server/db';
import { hasEmailKey, resetEmail, resetLink, sendEmail } from '@/server/email';
import { badRequest, clientIp, handle, limit, readJson } from '@/server/http';

/** Always answers the same way, so it can't be used to discover which emails have accounts. */
export const POST = handle(async (request: NextRequest) => {
  if (!hasEmailKey()) {
    return NextResponse.json({ error: 'Password reset by email is not configured on this server' }, { status: 503 });
  }
  await limit(`forgot:${clientIp(request)}`, 5, 3600);
  const { email } = await readJson(request);
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) return badRequest('A valid email is required');

  const user = await getUserByEmail(email);
  if (user && (await hitRateLimit(`forgot:email:${user.id}`, 3600)) <= 3) {
    const origin = request.nextUrl.origin;
    await sendEmail({ email: user.email, name: user.name }, resetEmail(user.name, resetLink(user, origin), origin)).catch(
      (err) => console.error('[forgot] email failed:', (err as Error).message)
    );
  }
  return NextResponse.json({ ok: true });
});
