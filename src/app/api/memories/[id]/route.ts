import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { deleteMemory } from '@/server/db';
import { handle } from '@/server/http';

type Params = { params: Promise<{ id: string }> };

export const DELETE = handle(async (_request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteMemory(id, user.id);
  return NextResponse.json({ ok: true });
});
