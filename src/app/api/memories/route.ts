import { after, NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { listMemories } from '@/server/db';
import { addManualMemory } from '@/server/memory';
import { badRequest, handle, readJson } from '@/server/http';

/** Current memories; `?history=1` adds superseded/retired ones (for the per-fact history view). */
export const GET = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const history = request.nextUrl.searchParams.get('history') === '1';
  return NextResponse.json({ memories: await listMemories(user.id, history) });
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const { content, category } = await readJson(request);
  if (typeof content !== 'string' || !content.trim() || content.length > 500) {
    return badRequest('Content is required (max 500 characters)');
  }
  const validCategory = category === 'preference' || category === 'goal' ? category : 'fact';
  // Manual memories join Tier 3 too (via after(), so the embedding survives the response).
  const { memory } = await addManualMemory(user.id, content.trim(), validCategory, (work) =>
    after(() => work.catch(() => {}))
  );
  return NextResponse.json({ memory });
});
