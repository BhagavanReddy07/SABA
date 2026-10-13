// The 3-tier memory engine.
//
//   Tier 1 — Working memory   Redis               rolling window of the live conversation
//   Tier 2 — Episodic memory  Postgres            full history + durable facts about the user
//   Tier 3 — Semantic memory  Pinecone/pgvector   embeddings for cross-conversation recall
//
// recall() gathers context before generating; remember() persists after.
// Every tier degrades gracefully — a missing service never breaks chat.

import type { Memory, MemoryCategory, MemorySource, MemoryTrace, MemoryUpdate, SourceItem } from '@/lib/types';
import {
  getMemoriesByIds,
  listCurrentFacts,
  resolveDocChunks,
  resolveMessageHits,
  retireMemory,
  saveMemory,
  searchDocChunks,
  searchMessages,
  supersedeMemory,
  deleteMemory,
  touchMemories,
  type MemoryInput,
} from '../db';
import { monthDayFrom } from '@/lib/format';
import { embed, embedMany, generateJson, hasChatKey } from '../llm';
import { appendToWindow, getWindow, type WorkingMemoryEntry } from './working';
import { queryVectors, removeVectors, upsertVectors, vectorStore, type VectorHit } from './vectors';

const MAX_FACTS_IN_PROMPT = 15;
const MAX_MOMENTS = 5;
const MIN_SCORE = 0.5;
export type Defer = (work: Promise<unknown>) => void;
export type Tiers = { t1: boolean; t2: boolean; t3: boolean };
const ALL_TIERS: Tiers = { t1: true, t2: true, t3: true };

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

async function timed<T>(promise: Promise<T>): Promise<[T, number]> {
  const start = Date.now();
  const value = await promise;
  return [value, Date.now() - start];
}

// --- Text relevance (keyword side of hybrid retrieval) ---

const STOPWORDS = new Set(
  'the a an and or but of to in on at for with is are was were be been am i me my you your we our it its this that what who how when where why do does did can could would should will user users has have had not'.split(' ')
);

export function tokens(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

/** Share of the fact's words that also appear in the query (0–1). */
export function overlap(query: Set<string>, fact: Set<string>): number {
  if (!query.size || !fact.size) return 0;
  let shared = 0;
  for (const w of fact) if (query.has(w)) shared++;
  return shared / Math.min(fact.size, Math.max(query.size, 1));
}

/** Prefix-matching tsquery from free text: "sister birth" → 'sister:* & birth:*'. */
export function toTsQuery(text: string, mode: '&' | '|' = '&'): string | null {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  return words.length ? words.map((w) => `${w}:*`).join(` ${mode} `) : null;
}

/**
 * Generative-Agents-style ranking: relevance to the message (vector or keyword, whichever is
 * stronger) + importance + recency of use. Replaces "15 newest facts".
 */
export function rankFacts(facts: Memory[], query: string, vectorScores: Map<string, number>, limit: number): Memory[] {
  const q = tokens(query);
  const now = Date.now();
  return facts
    .map((f) => {
      const relevance = Math.max(vectorScores.get(f.id) ?? 0, overlap(q, tokens(f.content)));
      const days = (now - Date.parse(f.lastUsedAt ?? f.createdAt)) / 86_400_000;
      const recency = Math.pow(0.5, Math.max(days, 0) / 30);
      return { f, score: 0.5 * relevance + 0.3 * (f.importance / 10) + 0.2 * recency };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
}

// --- Resolving Tier 3 hits back to live rows ---

type Resolved = {
  factScores: Map<string, number>;
  formerly: { memory: Memory; score: number }[];
  moments: SourceItem[];
};

async function resolveHits(userId: string, hits: VectorHit[], excludeConversationId?: string): Promise<Resolved> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const score = new Map(hits.map((h) => [h.id, h.score]));
  const messageIds = hits.map((h) => h.id).filter((id) => uuid.test(id));
  const memoryIds = hits.filter((h) => h.id.startsWith('memory-')).map((h) => h.id.slice(7)).filter((id) => uuid.test(id));
  const docKeys = hits
    .map((h) => /^doc-([0-9a-f-]{36})-(\d+)$/i.exec(h.id))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => ({ documentId: m[1], idx: Number(m[2]) }));

  const [messages, memories, docs] = await Promise.all([
    resolveMessageHits(userId, messageIds),
    getMemoriesByIds(userId, memoryIds),
    resolveDocChunks(userId, docKeys),
  ]);

  const out: Resolved = { factScores: new Map(), formerly: [], moments: [] };
  for (const m of messages) {
    if (m.conversationId === excludeConversationId) continue; // already in the working window
    const reply = m.reply ? ` | SABA: ${m.reply.slice(0, 280)}` : '';
    out.moments.push({
      kind: 'moment',
      content: `User: ${m.content.slice(0, 400)}${reply}`,
      score: score.get(m.id) ?? 0,
      conversationId: m.conversationId,
      messageId: m.id,
      title: m.title,
      createdAt: m.createdAt,
    });
  }
  for (const mem of memories) {
    const s = score.get(`memory-${mem.id}`) ?? 0;
    if (mem.category === 'summary') {
      if (!mem.validTo) {
        out.moments.push({
          kind: 'summary',
          id: mem.id,
          content: mem.content,
          score: s,
          conversationId: mem.sourceConversationId,
          messageId: mem.sourceMessageId,
        });
      }
    } else if (mem.validTo) {
      out.formerly.push({ memory: mem, score: s });
    } else {
      out.factScores.set(mem.id, s);
    }
  }
  for (const d of docs) {
    out.moments.push({
      kind: 'doc',
      content: d.content.slice(0, 700),
      score: score.get(`doc-${d.documentId}-${d.idx}`) ?? 0,
      documentId: d.documentId,
      name: d.name,
      page: d.page,
    });
  }
  return out;
}

async function semanticRecall(userId: string, query: string, excludeConversationId: string): Promise<Resolved> {
  if (!(await vectorStore())) return { factScores: new Map(), formerly: [], moments: [] };
  const hits = await queryVectors(userId, await embed(query), 14, ['message', 'memory', 'doc']);
  return resolveHits(userId, hits, excludeConversationId);
}

// --- Recall ---

export type Recall = {
  window: WorkingMemoryEntry[];
  sources: MemorySource[];
  trace: MemoryTrace;
  timings: { t1: number; t2: number; t3: number };
};

export async function recall(
  userId: string,
  conversationId: string,
  query: string,
  tiers: Tiers = ALL_TIERS,
  defer?: Defer
): Promise<Recall> {
  // Greetings and acks ("hey", "ok", "thanks") carry nothing worth a cross-conversation lookup.
  const worthSemantic = query.trim().length >= 12;
  const empty: Resolved = { factScores: new Map(), formerly: [], moments: [] };

  const [[window, t1], [facts, t2], [semantic, t3]] = await Promise.all([
    timed(tiers.t1 ? getWindow(conversationId) : Promise.resolve([] as WorkingMemoryEntry[])),
    timed(tiers.t2 ? listCurrentFacts(userId).catch(() => [] as Memory[]) : Promise.resolve([] as Memory[])),
    // Tier 3 is on the critical path before the first token — cap it rather than make the user wait.
    timed(
      tiers.t3 && worthSemantic
        ? withTimeout(semanticRecall(userId, query, conversationId).catch(() => empty), 1500, empty)
        : Promise.resolve(empty)
    ),
  ]);

  const chosen = rankFacts(facts, query, semantic.factScores, MAX_FACTS_IN_PROMPT);
  const sources: MemorySource[] = chosen.map((f, i) => ({
    ref: `M${i + 1}`,
    kind: 'fact',
    id: f.id,
    content: f.content,
    category: f.category,
    conversationId: f.sourceConversationId,
    messageId: f.sourceMessageId,
  }));
  semantic.formerly
    .filter((f) => f.score >= 0.55)
    .slice(0, 3)
    .forEach(({ memory }) =>
      sources.push({
        ref: `M${sources.length + 1}`,
        kind: 'fact',
        id: memory.id,
        content: memory.content,
        category: memory.category,
        formerly: true,
        validTo: memory.validTo,
        conversationId: memory.sourceConversationId,
        messageId: memory.sourceMessageId,
      })
    );
  let p = 0;
  let d = 0;
  semantic.moments
    .filter((m) => 'score' in m && m.score >= MIN_SCORE)
    .sort((a, b) => ('score' in b ? b.score : 0) - ('score' in a ? a.score : 0))
    .slice(0, MAX_MOMENTS)
    .forEach((m) => sources.push({ ...m, ref: m.kind === 'doc' ? `D${++d}` : `P${++p}` } as MemorySource));

  if (chosen.length && defer) defer(touchMemories(chosen.map((f) => f.id)));

  return {
    window,
    sources,
    trace: { workingMemory: window.length, sources },
    timings: { t1, t2, t3 },
  };
}

// --- Remember ---

const FIRST_PERSON = /\b(i|i'm|im|i've|i'd|i'll|my|me|mine|myself|we|our|us)\b/i;

/** Cheap gate in front of the extraction call: facts about a user are almost always first-person. */
export function worthExtracting(text: string): boolean {
  const t = text.trim();
  return t.length >= 12 && (FIRST_PERSON.test(t) || /[^\x00-\x7F]/.test(t));
}

/**
 * Persists one exchange: Tier 1 synchronously, Tier 3 indexing via `defer`, and hands back the
 * Tier 2 fact reconciliation as `update` (also deferred, so it completes even if nobody awaits it).
 */
export async function remember(args: {
  userId: string;
  conversationId: string;
  incognito: boolean;
  userMessage: { id: string; content: string };
  assistantContent: string;
  defer: Defer;
}): Promise<{ update: Promise<MemoryUpdate | null> }> {
  const { userId, conversationId, userMessage, assistantContent, defer } = args;
  const none = { update: Promise.resolve(null) };
  await appendToWindow(conversationId, { role: 'user', content: userMessage.content });
  await appendToWindow(conversationId, { role: 'assistant', content: assistantContent });
  if (args.incognito) return none;

  // Embed the exchange once — it indexes the message and finds related facts for reconciliation.
  const vector: Promise<number[] | null> = vectorStore().then((store) =>
    store ? embed(`${userMessage.content}\n${assistantContent.slice(0, 1500)}`).catch(() => null) : null
  );
  defer(
    vector.then((values) =>
      values ? upsertVectors([{ id: userMessage.id, userId, kind: 'message', conversationId, values }]) : undefined
    )
  );

  if (!hasChatKey() || !worthExtracting(userMessage.content)) return none;
  const update = reconcileFacts(userId, userMessage, assistantContent, vector).catch((err) => {
    console.warn('[memory] fact reconciliation failed:', (err as Error).message);
    return null;
  });
  defer(update);
  return { update };
}

type Op = {
  op?: string;
  id?: string;
  fact?: string;
  category?: string;
  importance?: number;
  date?: string;
  entities?: unknown;
};

const RECONCILE_PROMPT = `You maintain an assistant's long-term memory about a user. Compare the EXCHANGE with KNOWN FACTS and return JSON: {"ops": [...]}.
Op types:
- {"op":"add","fact":"...","category":"fact|preference|goal","importance":1-10,"date":"MM-DD","entities":["..."]}
- {"op":"update","id":"F3","fact":"...","category":"...","importance":1-10,"date":"MM-DD","entities":["..."]} — the user changed something an existing fact says (moved, new job, changed taste). Write the complete new fact.
- {"op":"delete","id":"F2"} — the user said an existing fact is no longer true and gave no replacement.
Rules:
- Only durable facts about the user's real life that the USER stated or clearly implied: identity, relationships, location, work, health, tastes, important dates, long-term goals.
- Never store the current task or topic, questions asked, one-off requests, or anything about this assistant/app, coding, or deployment.
- Each op holds exactly ONE atomic fact. Split compound statements: "I'm Priya, a designer from Pune who loves hiking" → four separate add ops (name, job, city, hobby).
- Write every fact in English as one short third-person sentence starting with "User" (e.g. "User's sister is Ananya."), even when the chat is in another language.
- "date" only for recurring personal dates (birthdays, anniversaries) as MM-DD; omit otherwise. "entities": names of people, places or organisations in the fact.
- importance: 9-10 identity and close relationships, 6-8 work, health, stable preferences and goals, 3-5 minor tastes.
- Skip anything KNOWN FACTS already cover. At most 8 ops. When unsure, return {"ops":[]}.
Example: {"ops":[{"op":"add","fact":"User's sister Ananya's birthday is on May 3.","category":"fact","importance":8,"date":"05-03","entities":["Ananya"]}]}`;

const CATEGORIES = ['fact', 'preference', 'goal'] as const;

export function memoryInput(op: Op, sourceMessageId: string | null): MemoryInput {
  return {
    importance: Math.min(10, Math.max(1, Math.round(Number(op.importance) || 5))),
    eventDate:
      typeof op.date === 'string' && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(op.date)
        ? op.date
        : monthDayFrom(typeof op.fact === 'string' ? op.fact : ''),
    entities: Array.isArray(op.entities)
      ? op.entities.filter((e): e is string => typeof e === 'string' && e.trim().length > 0).map((e) => e.trim().slice(0, 40)).slice(0, 5)
      : [],
    sourceMessageId,
  };
}

const asCategory = (c: unknown): MemoryCategory =>
  CATEGORIES.includes(c as (typeof CATEGORIES)[number]) ? (c as MemoryCategory) : 'fact';

const validFact = (fact: unknown): fact is string =>
  typeof fact === 'string' && fact.trim().length >= 6 && fact.trim().length <= 300;

/** Mem0-style write path: one JSON call decides add / update / delete against what's known. */
async function reconcileFacts(
  userId: string,
  userMessage: { id: string; content: string },
  assistantContent: string,
  vector: Promise<number[] | null>
): Promise<MemoryUpdate | null> {
  const current = await listCurrentFacts(userId);
  let candidates = current;
  if (current.length > 40) {
    const values = await vector;
    const scores = new Map<string, number>();
    if (values) {
      for (const h of await queryVectors(userId, values, 40, ['memory'])) scores.set(h.id.slice(7), h.score);
    }
    candidates = rankFacts(current, userMessage.content, scores, 40);
  }
  const alias = new Map(candidates.map((m, i) => [`F${i + 1}`, m]));

  const result = await generateJson<{ ops?: Op[] }>(
    RECONCILE_PROMPT,
    `KNOWN FACTS:\n${[...alias].map(([k, m]) => `${k}: ${m.content} (${m.category})`).join('\n') || '(none)'}\n\nEXCHANGE:\nuser: ${userMessage.content}\nassistant: ${assistantContent.slice(0, 1200)}`
  );
  const ops = Array.isArray(result?.ops) ? result.ops.slice(0, 8) : [];
  const update: MemoryUpdate = { learned: [], updated: [], retired: [], forgotten: [] };

  for (const op of ops) {
    const existing = typeof op.id === 'string' ? alias.get(op.id) : undefined;
    if (op.op === 'add' && validFact(op.fact)) {
      const saved = await saveMemory(userId, op.fact, asCategory(op.category), 'extracted', memoryInput(op, userMessage.id));
      if (saved.status !== 'existing') update.learned.push(saved.memory);
    } else if (op.op === 'update' && existing && validFact(op.fact)) {
      const saved = await saveMemory(
        userId,
        op.fact,
        asCategory(op.category ?? existing.category),
        'extracted',
        memoryInput(op, userMessage.id)
      );
      if (saved.memory.id !== existing.id) {
        await supersedeMemory(existing.id, saved.memory.id, userId);
        update.updated.push({ from: { ...existing, validTo: new Date().toISOString(), supersededBy: saved.memory.id }, to: saved.memory });
      }
    } else if (op.op === 'delete' && existing) {
      await retireMemory(existing.id, userId);
      update.retired.push({ ...existing, validTo: new Date().toISOString() });
    }
  }

  await indexMemories(userId, [...update.learned, ...update.updated.map((u) => u.to)]);
  return update.learned.length || update.updated.length || update.retired.length ? update : null;
}

/** Embeds facts into Tier 3 so they can be recalled by meaning. */
export async function indexMemories(userId: string, memories: Memory[]): Promise<void> {
  if (!memories.length || !(await vectorStore())) return;
  try {
    const values = await embedMany(memories.map((m) => m.content));
    await upsertVectors(memories.map((m, i) => ({ id: `memory-${m.id}`, userId, kind: 'memory', values: values[i] })));
  } catch (err) {
    console.warn('[memory] indexing facts failed:', (err as Error).message);
  }
}

/** "Remember that…" — from the Memory dialog, the chat tool, or MCP. */
export async function addManualMemory(
  userId: string,
  content: string,
  category: MemoryCategory,
  defer: Defer
): Promise<{ memory: Memory; status: 'inserted' | 'revived' | 'existing' }> {
  const saved = await saveMemory(userId, content, category, 'manual', { importance: 7 });
  if (saved.status !== 'existing') defer(indexMemories(userId, [saved.memory]));
  return saved;
}

/** Hard delete — Postgres row and its Tier 3 vector. */
export async function forgetMemories(userId: string, ids: string[], restorePredecessor = false): Promise<string[]> {
  const gone: string[] = [];
  for (const id of ids) if (await deleteMemory(id, userId, restorePredecessor)) gone.push(id);
  await removeVectors(gone.map((id) => `memory-${id}`));
  return gone;
}

/** Finds current facts matching a description — vector similarity, falling back to keywords. */
export async function findFacts(userId: string, description: string, limit = 3): Promise<Memory[]> {
  const facts = await listCurrentFacts(userId);
  if (!facts.length) return [];
  const q = tokens(description);
  const scores = new Map<string, number>();
  if (await vectorStore()) {
    try {
      for (const h of await queryVectors(userId, await embed(description), 10, ['memory'])) {
        scores.set(h.id.slice(7), h.score);
      }
    } catch {
      // keyword matching below still works
    }
  }
  return facts
    .map((f) => {
      const vec = scores.get(f.id) ?? 0;
      return { f, s: Math.max(vec >= 0.62 ? vec : 0, overlap(q, tokens(f.content)) >= 0.5 ? 0.6 : 0) };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f);
}

// --- Search (hybrid: Postgres full-text + Tier 3 vectors, fused with Reciprocal Rank Fusion) ---

const rrf = (rank: number) => 1 / (60 + rank);

/** Deep memory search for the `search_memory` tool and MCP: messages, facts and documents. */
export async function searchMemory(userId: string, query: string): Promise<SourceItem[]> {
  const tsq = toTsQuery(query, '|');
  const [fts, ftsDocs, facts, semantic] = await Promise.all([
    tsq ? searchMessages(userId, tsq, 10) : Promise.resolve([]),
    tsq ? searchDocChunks(userId, tsq, 5) : Promise.resolve([]),
    listCurrentFacts(userId),
    vectorStore().then(async (store) =>
      store ? resolveHits(userId, await queryVectors(userId, await embed(query), 12, ['message', 'memory', 'doc'])) : null
    ).catch(() => null),
  ]);

  const scored = new Map<string, { item: SourceItem; score: number }>();
  const add = (key: string, item: SourceItem, rank: number) => {
    const entry = scored.get(key);
    if (entry) entry.score += rrf(rank);
    else scored.set(key, { item, score: rrf(rank) });
  };

  fts.filter((h) => h.role === 'user').forEach((h, i) =>
    add(`m:${h.messageId}`, {
      kind: 'moment',
      content: `User: ${h.content.slice(0, 400)}`,
      score: 0,
      conversationId: h.conversationId,
      messageId: h.messageId,
      title: h.conversationTitle,
      createdAt: h.createdAt,
    }, i)
  );
  ftsDocs.forEach((d, i) =>
    add(`d:${d.documentId}:${d.content.slice(0, 40)}`, {
      kind: 'doc', content: d.content.slice(0, 700), score: 0, documentId: d.documentId, name: d.name, page: d.page,
    }, i)
  );
  const momentKey = (m: SourceItem) =>
    m.kind === 'doc' ? `d:${m.documentId}:${m.content.slice(0, 40)}`
      : m.kind === 'moment' ? `m:${m.messageId}`
        : m.kind === 'summary' ? `s:${m.id}` : `f:${m.id}`;
  semantic?.moments.forEach((m, i) => add(momentKey(m), m, i));
  const q = tokens(query);
  facts
    .map((f) => ({ f, s: Math.max(semantic?.factScores.get(f.id) ?? 0, overlap(q, tokens(f.content))) }))
    .filter((x) => x.s >= 0.35)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .forEach(({ f }, i) =>
      add(`f:${f.id}`, {
        kind: 'fact', id: f.id, content: f.content, category: f.category,
        conversationId: f.sourceConversationId, messageId: f.sourceMessageId,
      }, i)
    );

  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 6).map((x) => x.item);
}

/** Sidebar search across every chat — messages only. */
export async function searchChats(userId: string, query: string) {
  const tsq = toTsQuery(query, '&');
  const [fts, semantic] = await Promise.all([
    tsq ? searchMessages(userId, tsq, 20) : Promise.resolve([]),
    query.trim().length >= 4
      ? vectorStore()
          .then(async (store) => (store ? queryVectors(userId, await embed(query), 10, ['message']) : []))
          .then((hits) => resolveMessageHits(userId, hits.filter((h) => h.score >= 0.55).map((h) => h.id)))
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const scored = new Map<string, { hit: (typeof fts)[number]; score: number }>();
  fts.forEach((hit, i) => scored.set(hit.messageId, { hit, score: rrf(i) }));
  semantic.forEach((m, i) => {
    const entry = scored.get(m.id);
    if (entry) entry.score += rrf(i);
    else {
      scored.set(m.id, {
        hit: {
          conversationId: m.conversationId,
          conversationTitle: m.title,
          messageId: m.id,
          role: 'user',
          snippet: m.content.length > 160 ? `${m.content.slice(0, 160)}…` : m.content,
          content: m.content,
          createdAt: m.createdAt,
          rank: 0,
        },
        score: rrf(i),
      });
    }
  });
  return [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(({ hit: { content, rank, ...hit } }) => hit);
}
