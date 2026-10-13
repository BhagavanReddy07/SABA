import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { removeDocument } from '@/server/documents';
import { handle, isUuid } from '@/server/http';

type Params = { params: Promise<{ id: string }> };

export const DELETE = handle(async (_request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const removed = isUuid(id) && (await removeDocument(user.id, id));
  return removed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Document not found' }, { status: 404 });
});
