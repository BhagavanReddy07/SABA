import { NextRequest, NextResponse } from 'next/server';
import { taskManager } from '@/lib/task-manager';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default_user';
    const completed = searchParams.get('completed') === 'true';

    const tasks = await taskManager.getTasks({ userId, completed });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, type, time, userId, tags } = body;

    if (!content || !userId) {
      return NextResponse.json(
        { error: 'Content and userId are required' },
        { status: 400 }
      );
    }

    const task = await taskManager.createTask({
      type: type || 'Task',
      content,
      time,
      userId,
      conversationId: `conv_${Date.now()}`,
      priority: 'medium',
      tags
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}
