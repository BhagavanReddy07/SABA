import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { handle } from '@/server/http';

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
  });
});
