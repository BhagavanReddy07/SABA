import { NextRequest } from 'next/server';
import { getSessionUser } from '@/server/auth';
import { chatStream } from '@/server/assistant';
import { hitRateLimit, setUserTimezone } from '@/server/db';
import { isUuid, readJson } from '@/server/http';
import type { Tiers } from '@/server/memory';
import type { ChatStreamEvent, MessageImage } from '@/lib/types';

export const maxDuration = 60; // free-tier function ceiling on Vercel

const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/;
const MAX_IMAGE_B64 = 2_800_000; // ~2 MB decoded; the client downsizes before sending

const json = (body: unknown, status: number) => Response.json(body, { status });

/** SABA Bench ablations: tiers can be switched off only with the server's EVAL_KEY. */
function evalTiers(request: NextRequest): Tiers | undefined {
  const key = process.env.EVAL_KEY;
  if (!key || key.length < 16 || request.headers.get('x-saba-eval-key') !== key) return undefined;
  const on = new Set((request.headers.get('x-saba-tiers') ?? '').split(',').map((t) => t.trim()));
  return { t1: on.has('t1'), t2: on.has('t2'), t3: on.has('t3') };
}

// Streams the reply as SSE: start → (delta | tool)* → done → title? → memory?   (or error)
export async function POST(request: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const body = await readJson(request);
  const message = typeof body.message === 'string' ? body.message : '';
  const images: MessageImage[] = Array.isArray(body.images) ? body.images : [];
  if (message.length > 8000) return json({ error: 'Message is too long (8,000 characters max)' }, 400);
  if (images.length > 3) return json({ error: 'Up to 3 images per message' }, 400);
  for (const img of images) {
    if (!img || typeof img.mimeType !== 'string' || !IMAGE_TYPES.test(img.mimeType) || typeof img.data !== 'string' || img.data.length > MAX_IMAGE_B64) {
      return json({ error: 'Images must be PNG, JPEG, WebP or GIF under 2 MB' }, 400);
    }
  }
  if (!message.trim() && !images.length) return json({ error: 'Message is required' }, 400);
  if (body.conversationId !== undefined && !isUuid(body.conversationId)) {
    return json({ error: 'conversationId must be a UUID' }, 400);
  }

  const tiers = evalTiers(request); // benchmark runs (server-held EVAL_KEY) aren't rate limited
  if (!tiers && ((await hitRateLimit(`chat:${user.id}`, 300)) > 40 || (await hitRateLimit(`chat-day:${user.id}`, 86_400)) > 600)) {
    return json({ error: "You're sending messages very quickly — please wait a minute and try again." }, 429);
  }

  // Remember the browser's timezone so reminder emails show times the user recognizes.
  const timezone = body.timezone;
  if (typeof timezone === 'string' && timezone.length <= 64 && timezone !== user.timezone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }); // throws on an unknown zone
      await setUserTimezone(user.id, timezone);
      user.timezone = timezone;
    } catch {
      // ignore bogus zones
    }
  }

  // Stop button / closed tab → abort generation; the turn is still saved with what was produced.
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort());
  const encoder = new TextEncoder();
  const turn = chatStream({
    user,
    message: message.slice(0, 8000),
    conversationId: body.conversationId as string | undefined,
    clientTime: typeof body.clientTime === 'string' ? body.clientTime.slice(0, 80) : undefined,
    images,
    incognito: body.incognito === true,
    replaceLastTurn: body.replaceLastTurn === true,
    tiers,
    signal: abort.signal,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ChatStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false; // client went away — keep draining so the turn is saved
        }
      };
      try {
        for await (const event of turn) send(event);
      } catch (err) {
        console.error('[api/chat]', err);
        send({ type: 'error', message: 'Something went wrong generating a reply.' });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
