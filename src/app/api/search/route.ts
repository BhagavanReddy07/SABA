import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { searchConversationTitles } from '@/server/db';
import { searchChats } from '@/server/memory';
import { handle, limit } from '@/server/http';

/** Sidebar search: titles + every message (Postgres full-text fused with Tier 3 meaning). */
export const GET = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 200);
  if (q.length < 2) return NextResponse.json({ conversations: [], messages: [] });
  await limit(`search:${user.id}`, 60, 60);
  const [conversations, messages] = await Promise.all([searchConversationTitles(user.id, q), searchChats(user.id, q)]);
  return NextResponse.json({ conversations, messages });
});
