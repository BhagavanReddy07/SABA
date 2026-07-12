import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { deleteConversation, getConversation, listMessages } from '@/server/db';
import { dropWindow } from '@/server/memory/working';
import { handle } from '@/server/http';

type Params = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const conversation = await getConversation(id, user.id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  return NextResponse.json({ conversation, messages: await listMessages(id) });
});

export const DELETE = handle(async (_request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteConversation(id, user.id);
  await dropWindow(id);
  return NextResponse.json({ ok: true });
});
