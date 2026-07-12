// Tier 3 — Semantic memory (Pinecone).
// Every message and extracted fact is embedded (Gemini text-embedding-004)
// and upserted; recall is a cosine-similarity query filtered to the user.
// Content is stored in vector metadata so recall returns readable text.

import { Pinecone, type Index } from '@pinecone-database/pinecone';
import { embed, hasGeminiKey, EMBEDDING_DIM } from '../gemini';

export type SemanticHit = { content: string; score: number };

const globalForPinecone = globalThis as unknown as {
  pineconeIndex?: Index | null;
  pineconeInit?: Promise<Index | null>;
};

function available(): boolean {
  return Boolean(process.env.PINECONE_API_KEY) && hasGeminiKey();
}

async function getIndex(): Promise<Index | null> {
  if (!available()) return null;
  if (globalForPinecone.pineconeIndex !== undefined) return globalForPinecone.pineconeIndex;
  if (!globalForPinecone.pineconeInit) {
    globalForPinecone.pineconeInit = (async () => {
      try {
        const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
        const name = process.env.PINECONE_INDEX ?? 'saba-memory';
        const existing = await pc.listIndexes();
        if (!existing.indexes?.some((i) => i.name === name)) {
          console.log(`[memory:semantic] creating Pinecone index "${name}"...`);
          await pc.createIndex({
            name,
            dimension: EMBEDDING_DIM,
            metric: 'cosine',
            spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
            waitUntilReady: true,
          });
        }
        globalForPinecone.pineconeIndex = pc.index(name);
        return globalForPinecone.pineconeIndex;
      } catch (err) {
        console.warn('[memory:semantic] Pinecone unavailable:', (err as Error).message);
        globalForPinecone.pineconeIndex = null;
        return null;
      }
    })();
  }
  return globalForPinecone.pineconeInit;
}

export async function storeEmbedding(
  id: string,
  userId: string,
  content: string,
  kind: 'message' | 'memory'
): Promise<void> {
  const index = await getIndex();
  if (!index) return;
  try {
    const values = await embed(content);
    await index.upsert([
      { id, values, metadata: { userId, kind, content: content.slice(0, 2000) } },
    ]);
  } catch (err) {
    console.warn('[memory:semantic] upsert failed:', (err as Error).message);
  }
}

/** Most similar past moments for this user, best first. */
export async function searchSimilar(
  userId: string,
  query: string,
  topK = 5,
  minScore = 0.5
): Promise<SemanticHit[]> {
  const index = await getIndex();
  if (!index) return [];
  try {
    const vector = await embed(query);
    const res = await index.query({
      vector,
      topK,
      filter: { userId },
      includeMetadata: true,
    });
    return (res.matches ?? [])
      .filter((m) => (m.score ?? 0) >= minScore && m.metadata?.content)
      .map((m) => ({
        content: String(m.metadata!.content),
        score: m.score ?? 0,
      }));
  } catch (err) {
    console.warn('[memory:semantic] query failed:', (err as Error).message);
    return [];
  }
}
