import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { chat } from '@/server/assistant';
import { handle, badRequest } from '@/server/http';

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const { message, conversationId } = await request.json();

  if (typeof message !== 'string' || !message.trim()) {
    return badRequest('Message is required');
  }
  if (conversationId !== undefined && typeof conversationId !== 'string') {
    return badRequest('conversationId must be a string');
  }

  const result = await chat(user.id, user.name, message.trim(), conversationId);
  return NextResponse.json(result);
});
