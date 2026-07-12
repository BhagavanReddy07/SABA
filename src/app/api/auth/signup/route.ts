import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { createUser, getUserByEmail } from '@/server/db';
import { setSessionCookie } from '@/server/auth';
import { handle, badRequest } from '@/server/http';

export const POST = handle(async (request: NextRequest) => {
  const { email, name, password } = await request.json();

  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) {
    return badRequest('A valid email is required');
  }
  if (typeof name !== 'string' || name.trim().length < 1) {
    return badRequest('Name is required');
  }
  if (typeof password !== 'string' || password.length < 8) {
    return badRequest('Password must be at least 8 characters');
  }

  if (await getUserByEmail(email)) {
    return NextResponse.json(
      { error: 'An account with this email already exists' },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser(email, name.trim(), passwordHash);
  await setSessionCookie(user.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
  });
});
