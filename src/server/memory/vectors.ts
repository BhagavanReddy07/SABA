// Tier 3 storage. Pinecone when PINECONE_API_KEY is set, otherwise pgvector in the app's own
// Postgres (memory_vectors) when that extension is installed. Only ids and a little metadata
// live here — text is always re-read from Postgres, so deleted or superseded rows never resurface.
//
// Vector ids: user message uuid · `memory-<uuid>` · `doc-<documentId>-<chunk index>`.

import { Pinecone } from '@pinecone-database/pinecone';
import { pool } from '../db';
import { EMBEDDING_DIM, hasEmbedder } from '../llm';

export type VectorKind = 'message' | 'memory' | 'doc';
export type VectorItem = {
  id: string;
  userId: string;
  kind: VectorKind;
  conversationId?: string;
  documentId?: string;
  values: number[];
};
export type VectorHit = { id: string; score: number };

type Store = {
  name: 'pinecone' | 'pgvector';
  upsert(items: VectorItem[]): Promise<void>;
  query(userId: string, values: number[], topK: number, kinds: VectorKind[]): Promise<VectorHit[]>;
  remove(ids: string[]): Promise<void>;
  fetch(ids: string[]): Promise<Map<string, number[]>>;
  purgeUser(userId: string): Promise<void>;
};

const g = globalThis as unknown as { sabaVectors?: { store: Promise<Store | null>; at: number } };

/** The configured store, or null (Tier 3 off). A failed init is retried after a minute. */
export function vectorStore(): Promise<Store | null> {
  if (!hasEmbedder()) return Promise.resolve(null);
  const cached = g.sabaVectors;
  if (cached && Date.now() - cached.at < 60_000) return cached.store;
  const store = (process.env.PINECONE_API_KEY ? pineconeStore() : pgvectorStore()).catch((err) => {
    console.warn('[memory:vectors] store unavailable:', (err as Error).message);
    return null;
  });
  g.sabaVectors = { store, at: Date.now() };
  // A healthy store is kept for the life of the process.
  void store.then((s) => {
    if (s && g.sabaVectors?.store === store) g.sabaVectors.at = Infinity;
  });
  return store;
}

const chunks = <T>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

async function pineconeStore(): Promise<Store> {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const name = process.env.PINECONE_INDEX || 'saba-memory';
  const existing = await pc.listIndexes();
  if (!existing.indexes?.some((i) => i.name === name)) {
    console.log(`[memory:vectors] creating Pinecone index "${name}"...`);
    await pc.createIndex({
      name,
      dimension: EMBEDDING_DIM,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
      waitUntilReady: true,
    });
  }
  const index = pc.index(name);
  return {
    name: 'pinecone',
    async upsert(items) {
      for (const batch of chunks(items, 100)) {
        await index.upsert(
          batch.map((i) => ({
            id: i.id,
            values: i.values,
            metadata: {
              userId: i.userId,
              kind: i.kind,
              ...(i.conversationId && { conversationId: i.conversationId }),
              ...(i.documentId && { documentId: i.documentId }),
            },
          }))
        );
      }
    },
    async query(userId, values, topK, kinds) {
      const res = await index.query({
        vector: values,
        topK,
        filter: { userId: { $eq: userId }, kind: { $in: kinds } },
      });
      return (res.matches ?? []).map((m) => ({ id: m.id, score: m.score ?? 0 }));
    },
    async remove(ids) {
      for (const batch of chunks(ids, 1000)) await index.deleteMany(batch);
    },
    async fetch(ids) {
      const out = new Map<string, number[]>();
      for (const batch of chunks(ids, 100)) {
        const res = await index.fetch(batch);
        for (const [id, record] of Object.entries(res.records ?? {})) {
          if (record.values?.length) out.set(id, record.values);
        }
      }
      return out;
    },
    // Serverless indexes can't delete by metadata filter, so page through the user's ids
    // (this also catches vectors orphaned by deletions before ids were tracked).
    async purgeUser(userId) {
      const probe = Array.from({ length: EMBEDDING_DIM }, (_, i) => (i === 0 ? 1 : 0));
      for (let round = 0; round < 20; round++) {
        const res = await index.query({ vector: probe, topK: 1000, filter: { userId: { $eq: userId } } });
        const ids = (res.matches ?? []).map((m) => m.id);
        if (!ids.length) return;
        await index.deleteMany(ids);
      }
    },
  };
}

async function pgvectorStore(): Promise<Store | null> {
  const { rows } = await pool.query(`SELECT to_regclass('public.memory_vectors') IS NOT NULL AS ok`);
  if (!rows[0]?.ok) return null;
  const literal = (v: number[]) => `[${v.join(',')}]`;
  return {
    name: 'pgvector',
    async upsert(items) {
      if (!items.length) return;
      await pool.query(
        `INSERT INTO memory_vectors (id, user_id, kind, conversation_id, document_id, embedding)
         SELECT * FROM unnest($1::text[], $2::uuid[], $3::text[], $4::uuid[], $5::uuid[], $6::vector[])
         ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding, conversation_id = EXCLUDED.conversation_id`,
        [
          items.map((i) => i.id),
          items.map((i) => i.userId),
          items.map((i) => i.kind),
          items.map((i) => i.conversationId ?? null),
          items.map((i) => i.documentId ?? null),
          items.map((i) => literal(i.values)),
        ]
      );
    },
    async query(userId, values, topK, kinds) {
      const { rows } = await pool.query(
        `SELECT id, 1 - (embedding <=> $2::vector) AS score FROM memory_vectors
         WHERE user_id = $1 AND kind = ANY($3) ORDER BY embedding <=> $2::vector LIMIT $4`,
        [userId, literal(values), kinds, topK]
      );
      return rows.map((r) => ({ id: r.id, score: Number(r.score) }));
    },
    async remove(ids) {
      if (ids.length) await pool.query(`DELETE FROM memory_vectors WHERE id = ANY($1)`, [ids]);
    },
    async fetch(ids) {
      const { rows } = await pool.query(
        `SELECT id, embedding::text AS e FROM memory_vectors WHERE id = ANY($1)`,
        [ids]
      );
      return new Map(rows.map((r) => [r.id as string, JSON.parse(r.e) as number[]]));
    },
    async purgeUser(userId) {
      await pool.query(`DELETE FROM memory_vectors WHERE user_id = $1`, [userId]);
    },
  };
}

// Best-effort wrappers: Tier 3 problems are logged and never break the caller.

export async function upsertVectors(items: VectorItem[]): Promise<void> {
  const store = await vectorStore();
  if (!store || !items.length) return;
  await store.upsert(items).catch((err) => console.warn('[memory:vectors] upsert failed:', (err as Error).message));
}

export async function queryVectors(
  userId: string,
  values: number[],
  topK: number,
  kinds: VectorKind[]
): Promise<VectorHit[]> {
  const store = await vectorStore();
  if (!store) return [];
  return store.query(userId, values, topK, kinds).catch((err) => {
    console.warn('[memory:vectors] query failed:', (err as Error).message);
    return [];
  });
}

export async function removeVectors(ids: string[]): Promise<void> {
  const store = await vectorStore();
  if (!store || !ids.length) return;
  await store.remove(ids).catch((err) => console.warn('[memory:vectors] delete failed:', (err as Error).message));
}

export async function fetchVectors(ids: string[]): Promise<Map<string, number[]>> {
  const store = await vectorStore();
  if (!store || !ids.length) return new Map();
  return store.fetch(ids).catch(() => new Map());
}

/** Account deletion: every vector the user owns, known ids first, then a sweep for strays. */
export async function purgeUserVectors(userId: string, knownIds: string[]): Promise<void> {
  const store = await vectorStore();
  if (!store) return;
  await store.remove(knownIds).catch(() => {});
  await store.purgeUser(userId).catch((err) => console.warn('[memory:vectors] purge failed:', (err as Error).message));
}

export async function vectorBackendName(): Promise<string | null> {
  return (await vectorStore())?.name ?? null;
}
