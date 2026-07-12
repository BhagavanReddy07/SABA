import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { createTask, listTasks } from '@/server/db';
import { handle, badRequest } from '@/server/http';

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ tasks: await listTasks(user.id) });
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const { content, kind, priority, dueAt } = await request.json();

  if (typeof content !== 'string' || !content.trim()) {
    return badRequest('Content is required');
  }

  const task = await createTask(user.id, {
    content: content.trim(),
    kind: kind === 'reminder' ? 'reminder' : 'task',
    priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
    dueAt: typeof dueAt === 'string' ? dueAt : null,
  });

  return NextResponse.json({ task });
});
