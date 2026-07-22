import { NextRequest } from 'next/server';
import { getSessionUser } from '@/server/auth';
import { chatStream } from '@/server/assistant';
import type { ChatStreamEvent } from '@/lib/types';

export const maxDuration = 60; // free-tier function ceiling on Vercel

// Streams the reply as SSE: start → delta* → done (or error).
export async function POST(request: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { message, conversationId } = await request.json();
  if (typeof message !== 'string' || !message.trim()) {
    return Response.json({ error: 'Message is required' }, { status: 400 });
  }
  if (conversationId !== undefined && typeof conversationId !== 'string') {
    return Response.json({ error: 'conversationId must be a string' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of chatStream(
          user.id,
          user.name,
          message.trim(),
          conversationId
        )) {
          send(event);
        }
      } catch (err) {
        console.error('[api/chat]', err);
        send({ type: 'error', message: 'Something went wrong generating a reply.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
