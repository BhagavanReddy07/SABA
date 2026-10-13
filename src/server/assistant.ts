// The chat pipeline: recall memory → generate with tools (streamed) → remember.

import { after } from 'next/server';
import type {
  ChatStreamEvent,
  MemorySource,
  MemoryTrace,
  MemoryUpdate,
  MessageImage,
  MessageMeta,
  ToolStep,
} from '@/lib/types';
import {
  createConversation,
  deleteLastTurn,
  getConversation,
  recordTurnMetrics,
  renameConversation,
  saveMessage,
  setMemorySource,
  touchConversation,
  type DbUser,
} from './db';
import { generateText, hasChatKey, streamChat, type ChatMessage, type ToolCall } from './llm';
import { recall, remember, withTimeout, type Defer, type Tiers } from './memory';
import { dropWindow } from './memory/working';
import { removeVectors } from './memory/vectors';
import { describeSource, formatWhen, runTool, toolLabel, toolSpecs, type ToolContext } from './tools';

const MAX_TOOL_ROUNDS = 4;
const MAX_CALLS_PER_ROUND = 6;
/** Messages that clearly ask SABA to *do* something stateful — the first round must call a tool. */
const ACTION_REQUEST =
  /\b(remind me|set (a |an )?(reminder|alarm|timer)|add (a |an )?(task|to-?do|reminder)|put .{1,40} on my (list|calendar)|forget (that|about|my|the|what)|remember (that|this|my)|mark .{1,40} (as )?(done|complete))\b/i;
/** Arithmetic models get wrong in their head (dropped digits) — it goes to the calculator. No bare - or /: dates, phones, ranges. */
const MATH_REQUEST =
  /\d\s*(%|percent)\s*of\s*\d|\d\s*[+*×÷^]\s*\d|\d\s+(times|plus|divided by|multiplied by)\s+\d|\b(calculate|compute|square root)\b.*\d/i;

export type ChatInput = {
  user: DbUser;
  message: string;
  conversationId?: string;
  /** Browser's `new Date().toString()` — local time with offset, for "remind me at 6pm". */
  clientTime?: string;
  images?: MessageImage[];
  /** Only applies when a new conversation is created. */
  incognito?: boolean;
  /** Regenerate / edit-and-resend: drop the last user turn and its reply first. */
  replaceLastTurn?: boolean;
  /** SABA Bench ablations only — which memory tiers recall may read. */
  tiers?: Tiers;
  signal?: AbortSignal;
  /** Where post-response work is registered; defaults to Next's after(). */
  defer?: Defer;
  channel?: 'web' | 'telegram';
};

/** Background work survives the response on serverless hosts (Vercel) via after(). */
const afterDefer: Defer = (work) =>
  after(() => work.catch((err) => console.warn('[deferred]', (err as Error)?.message ?? err)));

/**
 * Runs one chat turn, yielding events the route serializes as SSE:
 *   start → (delta | tool)* → done → title? → memory?     (or error)
 */
export async function* chatStream(input: ChatInput): AsyncGenerator<ChatStreamEvent> {
  const started = Date.now();
  const { user, signal } = input;
  const defer = input.defer ?? afterDefer;
  const timezone = user.timezone ?? 'UTC';
  const text = input.message.trim();

  let conversation = input.conversationId ? await getConversation(input.conversationId, user.id) : null;
  const isNew = !conversation;
  if (!conversation) {
    const title = text ? (text.length > 48 ? `${text.slice(0, 48)}…` : text) : 'Image';
    conversation = await createConversation(user.id, title, Boolean(input.incognito));
  } else if (input.replaceLastTurn) {
    const removed = await deleteLastTurn(conversation.id);
    await dropWindow(conversation.id); // rebuilt from Postgres on the recall below
    defer(removeVectors(removed));
  }

  const memory = await recall(user.id, conversation.id, text, input.tiers, defer);
  yield { type: 'start', conversation, trace: memory.trace };

  const ctx: ToolContext = {
    userId: user.id,
    timezone,
    sources: memory.sources,
    actions: [],
    tasks: [],
    taskRefs: new Map(),
    learned: [],
    forgotten: [],
    defer,
    calendar: user.calendarLinked,
    incognito: conversation.incognito,
    memorySearch: !input.tiers || (input.tiers.t2 && input.tiers.t3),
    userMessage: text,
    channel: 'chat',
  };
  const steps: ToolStep[] = [];
  const system = buildSystemPrompt(user.name, memory.sources, input.clientTime, timezone, input.channel);
  let reply = '';
  let model: string | undefined;
  let fallbacks = 0;
  let firstToken: number | null = null;
  let failed = false;

  if (hasChatKey()) {
    const messages: ChatMessage[] = [
      ...fitWindow(memory.window),
      { role: 'user', content: text || 'What is in this image?', images: input.images },
    ];
    let tools = toolSpecs({ calendar: user.calendarLinked, incognito: conversation.incognito, memorySearch: ctx.memorySearch });
    let prefer: string | undefined;
    // A clear action request must produce a tool call — models otherwise sometimes just *say* "done" (or do the math themselves).
    const mustAct = ACTION_REQUEST.test(text) || MATH_REQUEST.test(text);
    let nudged = false;
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS && !signal?.aborted; round++) {
        // The last round offers no tools, which forces a written answer.
        const offer = round < MAX_TOOL_ROUNDS - 1 ? tools : [];
        const toolChoice = round === 0 && mustAct && offer.length ? 'required' : 'auto';
        // Not every provider enforces "required" (gpt-oss on Groq can still just answer), so a forced
        // round's text is held back until we know it really skipped the tool.
        const forced = toolChoice === 'required';
        let held = '';
        let roundText = '';
        let calls: ToolCall[] = [];
        try {
          const roundSystem = nudged ? `${system}\n\nThis request needs a tool call: call the right tool now instead of answering.` : system;
          for await (const event of streamChat({ system: roundSystem, messages, tools: offer, signal, prefer, toolChoice })) {
            if (event.type === 'model') {
              if (round === 0) fallbacks = event.fallbacks;
              model ??= event.model;
              prefer = event.model;
            } else if (event.type === 'text') {
              if (forced) {
                held += event.text;
                continue;
              }
              if (!roundText && reply && !reply.endsWith('\n')) {
                reply += '\n\n';
                yield { type: 'delta', text: '\n\n' };
              }
              roundText += event.text;
              reply += event.text;
              firstToken ??= Date.now() - started;
              yield { type: 'delta', text: event.text };
            } else {
              calls = event.calls;
            }
          }
        } catch (err) {
          // Every model rejected the tool-enabled request (e.g. a malformed call) — answer without tools.
          if (offer.length && !roundText && !signal?.aborted) {
            console.warn('[assistant] tool request failed, retrying without tools:', (err as Error).message);
            tools = [];
            round--;
            continue;
          }
          throw err;
        }
        if (forced && !calls.length && !signal?.aborted) {
          if (!nudged) {
            nudged = true; // ask once more, explicitly
            round--;
            continue;
          }
          reply = held; // asked twice and still no tool call: the written answer stands
          firstToken ??= Date.now() - started;
          if (held) yield { type: 'delta', text: held };
        }
        if (!calls.length || signal?.aborted) break;

        messages.push({ role: 'assistant', content: roundText, toolCalls: calls });
        for (const [i, call] of calls.entries()) {
          if (i >= MAX_CALLS_PER_ROUND) {
            messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: 'Skipped: too many calls at once.' });
            continue;
          }
          const step: ToolStep = { id: `${round}-${i}`, name: call.name, label: toolLabel(call), status: 'running' };
          steps.push(step);
          yield { type: 'tool', step: { ...step } };
          const result = await runTool(call, ctx);
          step.status = result.ok ? 'done' : 'error';
          step.summary = result.summary;
          yield { type: 'tool', step: { ...step } };
          messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result.content });
        }
      }
      if (!reply.trim() && !signal?.aborted) {
        reply = steps.some((s) => s.status === 'done') ? 'Done ✓' : "I couldn't come up with a reply — please try again.";
        yield { type: 'delta', text: reply };
      }
    } catch (err) {
      console.error('[assistant] generation failed:', err);
      failed = true;
      const note = "I'm having trouble reaching my language model right now — please try again in a moment.";
      const delta = reply ? `\n\n${note}` : note;
      reply += delta;
      yield { type: 'delta', text: delta };
    }
  } else {
    reply = demoReply(memory.trace);
    yield { type: 'delta', text: reply };
  }

  const stopped = Boolean(signal?.aborted);
  if (stopped && !reply.trim()) reply = '_(stopped)_';

  const meta: MessageMeta = {
    trace: memory.trace,
    ...(ctx.actions.length && { actions: ctx.actions }),
    ...(ctx.tasks.length && { tasks: ctx.tasks }),
    ...(steps.length && { tools: steps }),
    ...(stopped && { notice: 'Stopped' }),
    ...(model && { model }),
  };
  const userMessage = await saveMessage(
    conversation.id,
    'user',
    text,
    input.images?.length ? { images: input.images.length } : undefined
  );
  const assistantMessage = await saveMessage(conversation.id, 'assistant', reply, meta);
  await touchConversation(conversation.id);
  if (ctx.learned.length) {
    await setMemorySource(ctx.learned.map((m) => m.id), userMessage.id);
    for (const m of ctx.learned) Object.assign(m, { sourceMessageId: userMessage.id, sourceConversationId: conversation.id });
  }
  const { update } = await remember({
    userId: user.id,
    conversationId: conversation.id,
    incognito: conversation.incognito,
    userMessage,
    assistantContent: reply,
    defer,
  });

  if (!input.tiers) {
    const facts = memory.sources.filter((s) => s.kind === 'fact').length;
    defer(
      recordTurnMetrics({
        model: model ?? null,
        fallbacks,
        ...memory.timings,
        firstToken,
        total: Date.now() - started,
        toolCalls: steps.length,
        facts,
        moments: memory.sources.length - facts,
        promptChars: system.length + memory.window.reduce((n, m) => n + m.content.length, 0) + text.length,
        replyChars: reply.length,
        error: failed,
      })
    );
  }

  yield { type: 'done', message: assistantMessage, userMessage };

  // The reply is final and the composer free again; the stream stays open briefly for these.
  if (isNew && hasChatKey() && !failed && text) {
    const titling = autoTitle(conversation.id, user.id, text, reply);
    defer(titling);
    const title = await withTimeout(titling, 10_000, null);
    if (title) yield { type: 'title', conversationId: conversation.id, title };
  }
  const learned = await withTimeout(update, 25_000, null);
  const merged: MemoryUpdate = {
    learned: [...ctx.learned, ...(learned?.learned ?? [])],
    updated: learned?.updated ?? [],
    retired: learned?.retired ?? [],
    forgotten: ctx.forgotten,
  };
  if (merged.learned.length || merged.updated.length || merged.retired.length || merged.forgotten.length) {
    yield { type: 'memory', update: merged };
  }
}

/**
 * The newest turns that fit ~9k characters (long messages clipped) — free-tier models allow only
 * a few thousand tokens per minute, and older context is still reachable through recall.
 */
function fitWindow(window: { role: 'user' | 'assistant'; content: string }[], maxChars = 9000): ChatMessage[] {
  const out: ChatMessage[] = [];
  let total = 0;
  for (const m of [...window].reverse()) {
    const content = m.content.length > 2000 ? `${m.content.slice(0, 2000)}…` : m.content;
    if (total + content.length > maxChars && out.length) break;
    total += content.length;
    out.unshift({ role: m.role, content });
  }
  return out;
}

async function autoTitle(
  conversationId: string,
  userId: string,
  userContent: string,
  assistantContent: string
): Promise<string | null> {
  try {
    const title = await generateText(
      'You name chat conversations. Reply with ONLY a title of 2-5 words — no quotes, no punctuation at the end, no prose.',
      `user: ${userContent.slice(0, 500)}\nassistant: ${assistantContent.slice(0, 500)}`,
      { temperature: 0.3, maxTokens: 30 }
    );
    const cleaned = title.replace(/^["'*#\s]+|["'*.\s]+$/g, '').trim().slice(0, 60);
    if (!cleaned) return null;
    await renameConversation(conversationId, userId, cleaned);
    return cleaned;
  } catch (err) {
    console.warn('[assistant] auto-title failed:', (err as Error).message);
    return null;
  }
}

export function buildSystemPrompt(
  userName: string,
  sources: MemorySource[],
  clientTime: string | undefined,
  timezone: string,
  channel: ChatInput['channel'] = 'web'
): string {
  const now = clientTime || `${formatWhen(new Date().toISOString(), timezone)} (${timezone})`;
  const sections: string[] = [
    `You are SABA, a personal AI assistant with long-term memory. You are talking with ${userName}.
Be warm, concise and concrete. Reply in the language the user writes in.
The user's current local date and time: ${now}.

MEMORY: The sections below come from your memory of this user. Use them naturally and never mention tiers or databases.
If a personal detail isn't in them (or in this conversation), say you don't know it yet — never guess names, dates or facts about the user.
When a sentence relies on one of them, cite its tag right after it, each in its own brackets, like [M2] or [M1][P3] — only tags shown below or returned by search_memory, and never for general knowledge.

TOOLS: Use tools to act (play or open things, draft messages, reminders, tasks, memory, goals${channel === 'telegram' ? '' : ', calendar'}) and for live or exact facts (weather, Wikipedia, web, currency, arithmetic, date math).
- Never take an action the user didn't ask for, and never claim you did something unless a tool result in this turn confirms it; if a tool fails, say so.
- create_reminder only for a NEW request in the user's latest message — not when they ask about, confirm or thank you for an existing one.
- "Play …" means YouTube unless they say Spotify. Make queries specific ("official audio", "official trailer").
- "Forget …" → forget. "Remember that …" → remember. Progress on a goal → log_goal.
- After acting, confirm in one short sentence.`,
  ];
  if (channel === 'telegram') {
    sections.push('You are chatting over Telegram: keep formatting light — short paragraphs, no tables.');
  }

  const facts = sources.filter((s) => s.kind === 'fact' && !s.formerly);
  const former = sources.filter((s) => s.kind === 'fact' && s.formerly);
  const moments = sources.filter((s) => s.kind === 'moment' || s.kind === 'summary');
  const docs = sources.filter((s) => s.kind === 'doc');
  const list = (items: MemorySource[]) => items.map((s) => `[${s.ref}] ${describeSource(s)}`).join('\n');
  if (facts.length) sections.push(`WHAT YOU KNOW ABOUT THE USER:\n${list(facts)}`);
  if (former.length) sections.push(`NO LONGER TRUE (history — use for "before"/"used to" questions):\n${list(former)}`);
  if (moments.length) sections.push(`RELEVANT MOMENTS FROM PAST CONVERSATIONS:\n${list(moments)}`);
  if (docs.length) sections.push(`FROM THE USER'S DOCUMENTS:\n${list(docs)}`);
  return sections.join('\n\n');
}

/** Without an API key the app still works end-to-end for demos. */
function demoReply(trace: MemoryTrace): string {
  const facts = trace.sources.filter((s) => s.kind === 'fact');
  const moments = trace.sources.filter((s) => s.kind !== 'fact');
  const parts = [
    "I'm running in demo mode (no GROQ_API_KEY, GEMINI_API_KEY or OLLAMA_URL configured), so I can't generate a real answer — but my memory system is live:",
    `• Working memory holds ${trace.workingMemory} recent message${trace.workingMemory === 1 ? '' : 's'} from this conversation.`,
    `• I recalled ${facts.length} long-term fact${facts.length === 1 ? '' : 's'} about you.`,
  ];
  if (moments.length) parts.push(`• Semantic recall surfaced: "${moments[0].content.slice(0, 120)}"`);
  parts.push('Add a Groq or Gemini API key to .env to unlock full responses.');
  return parts.join('\n');
}
