import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { createTask, listTasks } from '@/server/db';
import { badRequest, handle, readJson } from '@/server/http';

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ tasks: await listTasks(user.id) });
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const { content, priority, dueAt } = await readJson(request);

  if (typeof content !== 'string' || !content.trim() || content.length > 500) {
    return badRequest('Content is required (max 500 characters)');
  }
  const due = typeof dueAt === 'string' && dueAt ? Date.parse(dueAt) : null;
  if (due !== null && Number.isNaN(due)) return badRequest('dueAt must be an ISO date-time');

  const task = await createTask(user.id, {
    content: content.trim(),
    kind: due !== null ? 'reminder' : 'task',
    priority: priority === 'low' || priority === 'high' ? priority : 'medium',
    dueAt: due !== null ? new Date(due).toISOString() : null,
  });
  return NextResponse.json({ task });
});
