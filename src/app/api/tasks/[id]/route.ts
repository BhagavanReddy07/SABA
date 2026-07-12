import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { deleteTask, setTaskCompleted } from '@/server/db';
import { handle, badRequest } from '@/server/http';

type Params = { params: Promise<{ id: string }> };

export const PATCH = handle(async (request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const { completed } = await request.json();

  if (typeof completed !== 'boolean') {
    return badRequest('completed (boolean) is required');
  }

  const task = await setTaskCompleted(id, user.id, completed);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  return NextResponse.json({ task });
});

export const DELETE = handle(async (_request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteTask(id, user.id);
  return NextResponse.json({ ok: true });
});
