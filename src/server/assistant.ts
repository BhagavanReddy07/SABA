// The chat pipeline: recall memory → generate (streamed) → remember.

import { after } from 'next/server';
import type { ChatAction, ChatStreamEvent } from '@/lib/types';
import {
  createConversation,
  getConversation,
  renameConversation,
  saveMessage,
  touchConversation,
} from './db';
import { generateText, generateTextStream, hasChatKey } from './gemini';
import { recall, remember, type Recall } from './memory';

/**
 * Runs one chat turn, yielding events the route serializes as SSE:
 *   start → delta* → done   (or error)
 */
export async function* chatStream(
  userId: string,
  userName: string,
  input: string,
  conversationId?: string
): AsyncGenerator<ChatStreamEvent> {
  // Resolve or create the conversation (title = first message until AI titles it).
  let conversation = conversationId
    ? await getConversation(conversationId, userId)
    : null;
  const isNew = !conversation;
  if (!conversation) {
    const title = input.length > 48 ? `${input.slice(0, 48)}…` : input;
    conversation = await createConversation(userId, title);
  }

  const memory = await recall(userId, conversation.id, input);
  yield {
    type: 'start',
    conversationId: conversation.id,
    title: conversation.title,
    trace: memory.trace,
  };

  let reply = '';
  if (hasChatKey()) {
    try {
      for await (const chunk of generateTextStream(
        buildSystemPrompt(userName, memory),
        input
      )) {
        reply += chunk;
        yield { type: 'delta', text: chunk };
      }
    } catch (err) {
      console.error('[assistant] generation failed:', err);
      reply =
        "I'm having trouble reaching my language model right now — please try again in a moment.";
      yield { type: 'delta', text: reply };
    }
  } else {
    reply = demoReply(memory);
    yield { type: 'delta', text: reply };
  }

  // The model may end its reply with an [[action:{...}]] tag — extract and strip it.
  const { cleaned, action } = extractAction(reply);
  reply = cleaned;

  // Resolve the actual video so the watch page starts playing immediately,
  // instead of dropping the user on a search-results page.
  if (action?.type === 'youtube') {
    action.videoId = await resolveYouTubeVideo(action.query);
  }

  // Tier 2: persist both turns, then update the other tiers.
  const userMessage = await saveMessage(conversation.id, 'user', input);
  const assistantMessage = await saveMessage(conversation.id, 'assistant', reply);
  await touchConversation(conversation.id);
  await remember(userId, conversation.id, userMessage, reply);

  // First exchange of a new conversation → ask Gemini for a proper short title.
  if (isNew && hasChatKey()) {
    const convId = conversation.id;
    after(() =>
      autoTitle(convId, userId, input, reply).catch((err) =>
        console.warn('[assistant] auto-title failed:', (err as Error).message)
      )
    );
  }

  yield {
    type: 'done',
    message: { ...assistantMessage, memoryTrace: memory.trace, action },
  };
}

const ACTION_TYPES = ['youtube', 'spotify', 'maps', 'search', 'mail'] as const;

/**
 * First matching video ID from YouTube's public search page — no API key.
 * Best-effort: on any failure the caller falls back to the search URL.
 */
async function resolveYouTubeVideo(query: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      {
        headers: { 'accept-language': 'en' },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) return undefined;
    const html = await res.text();
    return html.match(/"videoId":"([\w-]{11})"/)?.[1];
  } catch {
    return undefined;
  }
}

/** Pulls a trailing [[action:{...}]] tag out of the reply, validating its shape. */
function extractAction(reply: string): { cleaned: string; action?: ChatAction } {
  const match = reply.match(/\[\[action:(\{[\s\S]*?\})\]\]\s*$/);
  if (!match) return { cleaned: reply };
  const cleaned = reply.slice(0, match.index).trimEnd();
  try {
    const parsed = JSON.parse(match[1]);
    if (!ACTION_TYPES.includes(parsed?.type)) return { cleaned };
    if (parsed.type === 'mail') {
      return {
        cleaned,
        action: {
          type: 'mail',
          to: typeof parsed.to === 'string' ? parsed.to : undefined,
          subject: typeof parsed.subject === 'string' ? parsed.subject : undefined,
          body: typeof parsed.body === 'string' ? parsed.body : undefined,
        },
      };
    }
    if (typeof parsed.query !== 'string' || !parsed.query.trim()) return { cleaned };
    return { cleaned, action: { type: parsed.type, query: parsed.query.trim() } };
  } catch {
    return { cleaned };
  }
}

async function autoTitle(
  conversationId: string,
  userId: string,
  userContent: string,
  assistantContent: string
): Promise<void> {
  const title = await generateText(
    'You name chat conversations. Reply with ONLY a title of 2-5 words — no quotes, no punctuation at the end, no prose.',
    `user: ${userContent.slice(0, 500)}\nassistant: ${assistantContent.slice(0, 500)}`,
    { temperature: 0.3, maxOutputTokens: 200 }
  );
  const cleaned = title.replace(/^["']|["']$/g, '').trim().slice(0, 60);
  if (cleaned) await renameConversation(conversationId, userId, cleaned);
}

function buildSystemPrompt(userName: string, memory: Recall): string {
  const sections: string[] = [
    `You are SABA, a personal AI assistant with a layered long-term memory.
You are talking to ${userName}. Be warm, concise, and concrete.
Use the memory sections below naturally — reference past context when relevant,
but never recite memory verbatim or mention "tiers" or "databases".

TAKING ACTIONS:
When the user clearly asks to play, open, find, or send something in an external app —
a song (Spotify), a video or trailer (YouTube), an email, a place or directions (Maps),
or a web search — reply briefly, then end with EXACTLY ONE action tag as the very last
line, in this exact format (raw JSON, no markdown fences):
[[action:{"type":"youtube","query":"Blinding Lights The Weeknd official audio"}]]
Valid types: "youtube" | "spotify" | "maps" | "search" (all take "query"),
and "mail" (takes "to", "subject", "body" — write the complete email in "body").
Routing rules:
- Any "play ..." request — songs, music, videos, trailers — use "youtube" (it starts
  playing instantly). Use "spotify" ONLY when the user explicitly says Spotify.
- Make the query specific: include artist/movie names, add "official audio" for songs
  and "official trailer" for trailers.
Never emit an action tag for ordinary questions or conversation.`,
  ];

  if (memory.facts.length > 0) {
    sections.push(
      `WHAT YOU KNOW ABOUT THE USER:\n${memory.facts.map((f) => `- ${f.content}`).join('\n')}`
    );
  }

  if (memory.semantic.length > 0) {
    sections.push(
      `RELEVANT MOMENTS FROM PAST CONVERSATIONS:\n${memory.semantic
        .map((s) => `- ${s.content}`)
        .join('\n')}`
    );
  }

  if (memory.window.length > 0) {
    sections.push(
      `CURRENT CONVERSATION SO FAR:\n${memory.window
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n')}`
    );
  }

  return sections.join('\n\n');
}

/** Without an API key the app still works end-to-end for demos. */
function demoReply(memory: Recall): string {
  const parts = [
    "I'm running in demo mode (no GROQ_API_KEY or GEMINI_API_KEY configured), so I can't generate a real answer — but my memory system is live:",
    `• Working memory holds ${memory.trace.workingMemory} recent message${memory.trace.workingMemory === 1 ? '' : 's'} from this conversation.`,
    `• I've stored ${memory.trace.episodic.length} long-term fact${memory.trace.episodic.length === 1 ? '' : 's'} about you.`,
  ];
  if (memory.trace.semantic.length > 0) {
    parts.push(
      `• Semantic recall surfaced: "${memory.trace.semantic[0].content.slice(0, 120)}"`
    );
  }
  parts.push('Add a Groq or Gemini API key to .env to unlock full responses.');
  return parts.join('\n');
}
