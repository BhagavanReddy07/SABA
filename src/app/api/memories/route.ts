import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { listMemories, saveMemory } from '@/server/db';
import { storeEmbedding } from '@/server/memory/semantic';
import { handle, badRequest } from '@/server/http';

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ memories: await listMemories(user.id) });
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const { content, category } = await request.json();

  if (typeof content !== 'string' || !content.trim()) {
    return badRequest('Content is required');
  }
  const validCategory = ['fact', 'preference', 'goal'].includes(category)
    ? category
    : 'fact';

  const memory = await saveMemory(user.id, content.trim(), validCategory, 'manual');
  // Manual memories join Tier 3 too, so semantic recall can surface them.
  void storeEmbedding(`memory-${memory.id}`, user.id, memory.content, 'memory');

  return NextResponse.json({ memory });
});
