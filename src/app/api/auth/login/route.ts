import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { getUserByEmail, toPublicUser } from '@/server/db';
import { setSessionCookie } from '@/server/auth';
import { badRequest, clientIp, handle, limit, readJson } from '@/server/http';

export const POST = handle(async (request: NextRequest) => {
  const { email, password } = await readJson(request);
  if (typeof email !== 'string' || typeof password !== 'string') {
    return badRequest('Email and password are required');
  }
  // Per IP and per account, so neither a single attacker nor a botnet can grind one password.
  await limit(`login:ip:${clientIp(request)}`, 20, 900);
  await limit(`login:email:${email.toLowerCase()}`, 10, 900);

  const user = await getUserByEmail(email);
  if (user && !user.passwordHash) {
    return NextResponse.json(
      { error: 'This account uses Google sign-in — use the Google button below (or reset your password to add one)' },
      { status: 401 }
    );
  }
  const valid = user?.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await setSessionCookie(user);
  return NextResponse.json({ user: toPublicUser(user) });
});
