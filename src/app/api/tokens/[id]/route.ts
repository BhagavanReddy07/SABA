import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { deleteAccessToken } from '@/server/db';
import { handle, isUuid } from '@/server/http';

type Params = { params: Promise<{ id: string }> };

export const DELETE = handle(async (_request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  if (isUuid(id)) await deleteAccessToken(id, user.id);
  return NextResponse.json({ ok: true });
});
