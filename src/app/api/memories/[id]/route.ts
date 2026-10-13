import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { forgetMemories } from '@/server/memory';
import { handle, isUuid } from '@/server/http';

type Params = { params: Promise<{ id: string }> };

/**
 * Forgets a memory everywhere (Postgres + its Tier 3 vector).
 * `?undo=1` (Undo on an "Updated" toast) also restores the fact this one replaced.
 */
export const DELETE = handle(async (request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
  const undo = request.nextUrl.searchParams.get('undo') === '1';
  await forgetMemories(user.id, [id], undo);
  return NextResponse.json({ ok: true });
});
