import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { listCurrentFacts } from '@/server/db';
import { overlap, tokens } from '@/server/memory';
import { fetchVectors } from '@/server/memory/vectors';
import { handle } from '@/server/http';

// SABA Galaxy: current facts as nodes, people/places as hub nodes, and links between facts that
// are close in meaning (cosine of their Tier 3 embeddings; keyword overlap when there are none).

const MAX_NODES = 250;
const NEIGHBOURS = 3;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export const GET = handle(async () => {
  const user = await requireUser();
  const facts = (await listCurrentFacts(user.id))
    .sort((a, b) => b.importance - a.importance || b.useCount - a.useCount)
    .slice(0, MAX_NODES);

  const vectors = await fetchVectors(facts.map((f) => `memory-${f.id}`));
  const words = facts.map((f) => tokens(f.content));
  const similarity = (i: number, j: number) => {
    const a = vectors.get(`memory-${facts[i].id}`);
    const b = vectors.get(`memory-${facts[j].id}`);
    return a && b ? cosine(a, b) : overlap(words[i], words[j]) * 0.9;
  };
  const threshold = vectors.size ? 0.6 : 0.3;

  // Each fact keeps its strongest few neighbours above the threshold — a readable graph, not a hairball.
  const links = new Map<string, { a: string; b: string; weight: number }>();
  facts.forEach((f, i) => {
    facts
      .map((g, j) => ({ j, s: j === i ? -1 : similarity(i, j) }))
      .filter((x) => x.s >= threshold)
      .sort((x, y) => y.s - x.s)
      .slice(0, NEIGHBOURS)
      .forEach(({ j, s }) => {
        const key = [f.id, facts[j].id].sort().join(':');
        if (!links.has(key)) links.set(key, { a: f.id, b: facts[j].id, weight: Math.round(s * 100) / 100 });
      });
  });

  const entities = new Map<string, string[]>();
  for (const f of facts) {
    for (const e of f.entities) {
      const key = e.trim();
      if (key) entities.set(key, [...(entities.get(key) ?? []), f.id]);
    }
  }
  for (const [name, ids] of entities) {
    for (const id of ids) links.set(`e:${name}:${id}`, { a: `e:${name}`, b: id, weight: 1 });
  }

  return NextResponse.json({
    nodes: [
      ...facts.map((f) => ({
        id: f.id,
        kind: 'fact' as const,
        label: f.content,
        category: f.category,
        importance: f.importance,
        useCount: f.useCount,
        sourceConversationId: f.sourceConversationId,
        sourceMessageId: f.sourceMessageId,
      })),
      ...[...entities.keys()].map((name) => ({ id: `e:${name}`, kind: 'entity' as const, label: name })),
    ],
    links: [...links.values()],
    semantic: vectors.size > 0,
  });
});
