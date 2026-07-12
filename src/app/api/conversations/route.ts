import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { listConversations } from '@/server/db';
import { handle } from '@/server/http';

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ conversations: await listConversations(user.id) });
});
