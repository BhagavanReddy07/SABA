import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { deleteConversation, getConversation, listMessages, renameConversation } from '@/server/db';
import { dropWindow } from '@/server/memory/working';
import { removeVectors } from '@/server/memory/vectors';
import { badRequest, handle, isUuid, readJson } from '@/server/http';

type Params = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

export const GET = handle(async (_request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const conversation = isUuid(id) ? await getConversation(id, user.id) : null;
  if (!conversation) return notFound();
  return NextResponse.json({ conversation, messages: await listMessages(id) });
});

export const PATCH = handle(async (request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const { title } = await readJson(request);
  if (typeof title !== 'string' || !title.trim() || title.length > 120) {
    return badRequest('title must be a non-empty string (max 120 chars)');
  }
  const conversation = isUuid(id) ? await renameConversation(id, user.id, title.trim()) : null;
  return conversation ? NextResponse.json({ conversation }) : notFound();
});

/** Deletes the chat from every tier — Postgres rows, the Redis window and its Tier 3 vectors. */
export const DELETE = handle(async (_request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const messageIds = await deleteConversation(id, user.id);
  await dropWindow(id);
  await removeVectors(messageIds);
  return NextResponse.json({ ok: true });
});
