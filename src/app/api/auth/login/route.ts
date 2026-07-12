import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { getUserByEmail } from '@/server/db';
import { setSessionCookie } from '@/server/auth';
import { handle, badRequest } from '@/server/http';

export const POST = handle(async (request: NextRequest) => {
  const { email, password } = await request.json();

  if (typeof email !== 'string' || typeof password !== 'string') {
    return badRequest('Email and password are required');
  }

  const user = await getUserByEmail(email);
  const valid = user && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await setSessionCookie(user.id);
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
  });
});
