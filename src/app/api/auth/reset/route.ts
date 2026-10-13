import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { getUserById, setPassword, toPublicUser } from '@/server/db';
import { setSessionCookie } from '@/server/auth';
import { parseResetToken, resetFingerprint } from '@/server/email';
import { badRequest, clientIp, handle, limit, readJson } from '@/server/http';

/** Sets a new password from a reset link; signs out every other session and signs this one in. */
export const POST = handle(async (request: NextRequest) => {
  await limit(`reset:${clientIp(request)}`, 10, 3600);
  const { token, password } = await readJson(request);
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return badRequest('Password must be at least 8 characters');
  }
  const parsed = typeof token === 'string' ? parseResetToken(token) : null;
  const user = parsed && (await getUserById(parsed.userId));
  if (!parsed || !user || resetFingerprint(user.passwordHash) !== parsed.fingerprint) {
    return badRequest('This reset link is invalid, expired, or already used. Request a new one.');
  }
  const updated = await setPassword(user.id, await bcrypt.hash(password, 10));
  await setSessionCookie(updated);
  return NextResponse.json({ user: toPublicUser(updated) });
});
