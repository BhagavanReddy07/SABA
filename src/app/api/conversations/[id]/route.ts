import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import {
  deleteConversation,
  getConversation,
  listMessages,
  renameConversation,
} from '@/server/db';
import { dropWindow } from '@/server/memory/working';
import { badRequest, handle } from '@/server/http';

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

export const PATCH = handle(async (request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const { title } = await request.json();
  if (typeof title !== 'string' || !title.trim() || title.length > 120) {
    return badRequest('title must be a non-empty string (max 120 chars)');
  }
  const conversation = await renameConversation(id, user.id, title.trim());
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  return NextResponse.json({ conversation });
});

export const DELETE = handle(async (_request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteConversation(id, user.id);
  await dropWindow(id);
  return NextResponse.json({ ok: true });
});
