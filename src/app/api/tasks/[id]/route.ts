import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { deleteTask, setTaskCompleted } from '@/server/db';
import { badRequest, handle, isUuid, readJson } from '@/server/http';

type Params = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: 'Task not found' }, { status: 404 });

export const PATCH = handle(async (request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const { completed } = await readJson(request);
  if (typeof completed !== 'boolean') return badRequest('completed (boolean) is required');
  const task = isUuid(id) ? await setTaskCompleted(id, user.id, completed) : null;
  return task ? NextResponse.json({ task }) : notFound();
});

export const DELETE = handle(async (_request: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  if (isUuid(id)) await deleteTask(id, user.id);
  return NextResponse.json({ ok: true });
});
