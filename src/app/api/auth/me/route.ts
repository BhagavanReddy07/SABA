import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { updateUserName } from '@/server/db';
import { handle, badRequest } from '@/server/http';

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
  });
});

export const PATCH = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const { name } = await request.json();

  if (typeof name !== 'string' || name.trim().length < 1) {
    return badRequest('Name is required');
  }

  const updated = await updateUserName(user.id, name.trim());
  return NextResponse.json({
    user: { id: updated.id, email: updated.email, name: updated.name, createdAt: updated.createdAt },
  });
});
