import { NextRequest, NextResponse } from 'next/server';
import { getAiResponse } from '@/app/actions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationId, userId } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const currentConversationId = conversationId || `conv_${Date.now()}`;
    const currentUserId = userId || 'default_user';

    // Use the getAiResponse function from actions.ts which handles database operations
    const result = await getAiResponse(message, currentConversationId, currentUserId);

    return NextResponse.json({
      response: result.response,
      intent: result.intent,
      entities: result.entities,
      task: result.task,
      knowledgeEntries: []
    });

  } catch (error) {
    console.error('Error in AI chat API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
