// SABA Sleep — nightly memory consolidation, run by the cron tick during the user's night:
// merge duplicate facts, retire facts a newer one contradicts, and compress finished
// conversations into `summary` memories (recalled later through Tier 3).
// The per-message reconcile step (index.ts) catches most of this live; this is the sweep.

import type { Consolidation, Memory, MemoryCategory } from '@/lib/types';
import {
  listConversationSummaries,
  listConversationsToSummarize,
  listCurrentFacts,
  listMessages,
  markSummarized,
  retireMemory,
  saveMemory,
  setConsolidation,
  supersedeMemory,
} from '../db';
import { generateJson, generateText, hasChatKey } from '../llm';
import { indexMemories, memoryInput } from './index';

const PROMPT = `You tidy an assistant's long-term memory of a user. Facts are numbered oldest first, with the date each was learned. Return JSON:
{"merges":[{"ids":["F1","F4"],"fact":"one merged sentence starting with \\"User\\"","category":"fact|preference|goal","importance":1-10}],"retire":[{"id":"F2"}]}
- merges: facts saying the same thing, or one a detail of the other → one complete sentence.
- retire: a fact clearly contradicted by a NEWER fact (e.g. an old city after a move). Never retire the newer one.
Only act when clearly redundant or contradicted. Return {"merges":[],"retire":[]} when nothing needs doing.`;

const SUMMARY_PROMPT = `Summarize this conversation for an assistant's long-term memory in 2-3 sentences: what the user wanted, what was decided or recommended, and anything left open. Third person ("User…"), English, no preamble.`;

type Plan = {
  merges?: { ids?: unknown; fact?: unknown; category?: unknown; importance?: unknown }[];
  retire?: { id?: unknown }[];
};

const asCategory = (c: unknown, fallback: MemoryCategory): MemoryCategory =>
  c === 'fact' || c === 'preference' || c === 'goal' ? c : fallback;

export async function consolidateUser(userId: string): Promise<Consolidation> {
  const result: Consolidation = { at: new Date().toISOString(), merged: 0, retired: 0, summarized: 0 };
  if (!hasChatKey()) {
    await setConsolidation(userId, result);
    return result;
  }

  const facts = (await listCurrentFacts(userId)).reverse().slice(-150); // oldest first
  if (facts.length >= 2) {
    const alias = new Map(facts.map((f, i) => [`F${i + 1}`, f]));
    const plan = await generateJson<Plan>(
      PROMPT,
      [...alias].map(([k, f]) => `${k} (${f.createdAt.slice(0, 10)}): ${f.content}`).join('\n')
    ).catch((err) => {
      console.warn('[sleep] plan failed:', (err as Error).message);
      return {} as Plan;
    });
    const touched = new Set<string>();
    const created: Memory[] = [];

    for (const merge of (Array.isArray(plan.merges) ? plan.merges : []).slice(0, 10)) {
      const group = (Array.isArray(merge.ids) ? merge.ids : [])
        .map((id) => alias.get(String(id)))
        .filter((f): f is Memory => Boolean(f) && !touched.has(f!.id));
      if (group.length < 2 || typeof merge.fact !== 'string' || merge.fact.trim().length < 6) continue;
      const saved = await saveMemory(
        userId,
        merge.fact,
        asCategory(merge.category, group[0].category),
        'extracted',
        memoryInput(
          {
            fact: merge.fact,
            importance: Number(merge.importance) || Math.max(...group.map((g) => g.importance)),
            date: group.find((g) => g.eventDate)?.eventDate ?? undefined,
            entities: [...new Set(group.flatMap((g) => g.entities))],
          },
          group[group.length - 1].sourceMessageId
        )
      );
      for (const old of group) {
        if (old.id === saved.memory.id) continue;
        await supersedeMemory(old.id, saved.memory.id, userId);
        touched.add(old.id);
        result.merged++;
      }
      touched.add(saved.memory.id);
      if (saved.status !== 'existing') created.push(saved.memory);
    }

    for (const r of (Array.isArray(plan.retire) ? plan.retire : []).slice(0, 10)) {
      const fact = alias.get(String(r?.id));
      if (!fact || touched.has(fact.id)) continue;
      await retireMemory(fact.id, userId);
      touched.add(fact.id);
      result.retired++;
    }
    await indexMemories(userId, created);
  }

  for (const conversation of await listConversationsToSummarize(userId, 3)) {
    const messages = await listMessages(conversation.id);
    const transcript = messages
      .map((m) => `${m.role}: ${m.content.slice(0, 600)}`)
      .join('\n')
      .slice(-12_000);
    const summary = await generateText(SUMMARY_PROMPT, transcript, { temperature: 0.3, maxTokens: 220 }).catch(() => '');
    if (summary.length > 20) {
      const previous = await listConversationSummaries(userId, conversation.id);
      const month = new Date(conversation.updatedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const saved = await saveMemory(
        userId,
        `Summary of “${conversation.title}” (${month}): ${summary.replace(/\s+/g, ' ')}`,
        'summary',
        'extracted',
        { importance: 4, sourceMessageId: messages[messages.length - 1]?.id ?? null }
      );
      for (const old of previous) if (old.id !== saved.memory.id) await supersedeMemory(old.id, saved.memory.id, userId);
      await indexMemories(userId, [saved.memory]);
      result.summarized++;
    }
    await markSummarized(conversation.id);
  }

  await setConsolidation(userId, result);
  return result;
}
