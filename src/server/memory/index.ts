// The 3-tier memory engine.
//
//   Tier 1 — Working memory   Redis     rolling window of the live conversation
//   Tier 2 — Episodic memory  Postgres  full history + durable facts about the user
//   Tier 3 — Semantic memory  Pinecone  embeddings for cross-conversation recall
//
// recall() gathers context before generating; remember() persists after.
// Every tier degrades gracefully — a missing service never breaks chat.

import { after } from 'next/server';
import type { Memory, MemoryTrace } from '@/lib/types';
import { listMemories, saveMemory } from '../db';
import { generateJson, hasGeminiKey } from '../gemini';
import { appendToWindow, getWindow, type WorkingMemoryEntry } from './working';
import { searchSimilar, storeEmbedding, type SemanticHit } from './semantic';

const MAX_FACTS_IN_PROMPT = 15;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export type Recall = {
  window: WorkingMemoryEntry[];
  facts: Memory[];
  semantic: SemanticHit[];
  trace: MemoryTrace;
};

export async function recall(
  userId: string,
  conversationId: string,
  query: string
): Promise<Recall> {
  const [window, allFacts, semantic] = await Promise.all([
    getWindow(conversationId),
    listMemories(userId).catch(() => [] as Memory[]),
    // Tier 3 recall is on the critical path before the first token — cap it.
    // Slow embed/Pinecone round-trip → skip semantic recall for this reply
    // instead of making the user wait.
    withTimeout(searchSimilar(userId, query), 2500, [] as SemanticHit[]),
  ]);
  const facts = allFacts.slice(0, MAX_FACTS_IN_PROMPT);

  return {
    window,
    facts,
    semantic,
    trace: {
      workingMemory: window.length,
      episodic: facts.map((f) => f.content),
      semantic: semantic.map((s) => ({
        content: s.content,
        score: Math.round(s.score * 1000) / 1000,
      })),
    },
  };
}

export async function remember(
  userId: string,
  conversationId: string,
  userMessage: { id: string; content: string },
  assistantContent: string
): Promise<void> {
  // Tier 1: extend the working window (Tier 2 rows are saved by the caller).
  await appendToWindow(conversationId, { role: 'user', content: userMessage.content });
  await appendToWindow(conversationId, { role: 'assistant', content: assistantContent });

  // Background work runs via after() so serverless hosts (Vercel) keep the
  // function alive past the response instead of killing fire-and-forget promises.
  // Tier 3: embed the user's message for future cross-conversation recall.
  after(() => storeEmbedding(userMessage.id, userId, userMessage.content, 'message'));

  // Tier 2: extract durable facts from this exchange (async, best-effort).
  after(() =>
    extractFacts(userId, userMessage.content, assistantContent).catch((err) =>
      console.warn('[memory] fact extraction failed:', (err as Error).message)
    )
  );
}

/** Ask the model whether this exchange revealed lasting facts about the user. */
async function extractFacts(
  userId: string,
  userContent: string,
  assistantContent: string
): Promise<void> {
  if (!hasGeminiKey()) return;

  const existing = (await listMemories(userId)).map((m) => m.content);

  const extracted = await generateJson<{ content: string; category: string }[]>(
    `You extract durable facts about a user from a chat exchange for an assistant's long-term memory.
Return ONLY a JSON array (no prose). Each item: {"content": "...", "category": "fact"|"preference"|"goal"}.
Rules:
- Only stable facts about the user's REAL LIFE, worth remembering for months: identity, relationships, location, job, tastes, important dates, long-term personal goals.
- NEVER store facts about the current task or conversation topic: questions they asked, projects being discussed, this assistant/app itself, deployment/coding/testing chatter, or one-off requests. "User asked about X" and "User is interested in <current topic>" are NOT memories.
- Skip small talk and anything already known.
- Write each fact as a short third-person sentence, e.g. "User's name is Priya."
- Return [] if there is nothing new. When unsure, return [].`,
    `ALREADY KNOWN:\n${existing.slice(0, 30).join('\n') || '(nothing)'}\n\nEXCHANGE:\nuser: ${userContent}\nassistant: ${assistantContent}`
  );

  if (!Array.isArray(extracted)) return;
  for (const item of extracted.slice(0, 3)) {
    if (typeof item?.content !== 'string' || !item.content.trim()) continue;
    const category = ['fact', 'preference', 'goal'].includes(item.category)
      ? (item.category as Memory['category'])
      : 'fact';
    const saved = await saveMemory(userId, item.content.trim(), category, 'extracted');
    // Facts are also embedded so Tier 3 can recall them semantically.
    await storeEmbedding(`memory-${saved.id}`, userId, saved.content, 'memory');
  }
}
