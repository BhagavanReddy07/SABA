import { after, NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { createUser, getUserByEmail, toPublicUser } from '@/server/db';
import { setSessionCookie } from '@/server/auth';
import { hasEmailKey, sendEmail, verificationEmail, verifyLink } from '@/server/email';
import { badRequest, clientIp, handle, limit, readJson } from '@/server/http';

export const POST = handle(async (request: NextRequest) => {
  await limit(`signup:${clientIp(request)}`, 5, 3600);
  const { email, name, password } = await readJson(request);

  if (typeof email !== 'string' || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    return badRequest('A valid email is required');
  }
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    return badRequest('Name is required (up to 80 characters)');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return badRequest('Password must be at least 8 characters');
  }

  if (await getUserByEmail(email)) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  const user = await createUser(email, name.trim(), await bcrypt.hash(password, 10));
  await setSessionCookie(user);

  // Reminder emails only go to verified addresses, so ask right away.
  if (hasEmailKey()) {
    const origin = request.nextUrl.origin;
    after(() =>
      sendEmail({ email: user.email, name: user.name }, verificationEmail(user.name, verifyLink(user, origin), origin)).catch(
        (err) => console.warn('[signup] verification email failed:', (err as Error).message)
      )
    );
  }

  return NextResponse.json({ user: toPublicUser(user) });
});
