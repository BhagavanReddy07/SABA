import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { getConversation, setConversationShared } from '@/server/db';
import { handle, isUuid } from '@/server/http';
import { signToken } from '@/server/tokens';

// Read-only share links. The link is a signed conversation id; it only resolves while
// conversations.shared_at is set, so "Stop sharing" revokes it instantly.

type Params = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

export const POST = handle(async (request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const existing = isUuid(id) ? await getConversation(id, user.id) : null;
  if (!existing) return notFound();
  if (existing.incognito) return NextResponse.json({ error: 'Incognito chats can’t be shared' }, { status: 400 });
  const conversation = await setConversationShared(id, user.id, true);
  const url = `${request.nextUrl.origin}/share/${signToken({ p: 'sh', cid: id })}`;
  return NextResponse.json({ conversation, url });
});

export const DELETE = handle(async (_request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const conversation = isUuid(id) ? await setConversationShared(id, user.id, false) : null;
  return conversation ? NextResponse.json({ conversation }) : notFound();
});
