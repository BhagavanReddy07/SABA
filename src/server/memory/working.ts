// Tier 1 — Working memory (Redis).
// A rolling window of the most recent messages per conversation, so the
// hot path never hits Postgres. Falls back to Postgres when Redis is cold.

import { createClient, type RedisClientType } from 'redis';
import { listRecentMessages } from '../db';

const WINDOW_SIZE = 20;
const TTL_SECONDS = 24 * 60 * 60;

export type WorkingMemoryEntry = { role: 'user' | 'assistant'; content: string };

const globalForRedis = globalThis as unknown as {
  redisClient?: RedisClientType;
  redisConnecting?: Promise<RedisClientType | null>;
};

async function getClient(): Promise<RedisClientType | null> {
  if (globalForRedis.redisClient?.isReady) return globalForRedis.redisClient;
  if (!globalForRedis.redisConnecting) {
    globalForRedis.redisConnecting = (async () => {
      try {
        const client = createClient({
          url: process.env.REDIS_URL ?? 'redis://localhost:6380',
          socket: { connectTimeout: 2000, reconnectStrategy: (n) => (n > 3 ? false : 500) },
        }) as RedisClientType;
        client.on('error', () => {}); // logged once below; don't spam per-command
        await client.connect();
        globalForRedis.redisClient = client;
        return client;
      } catch (err) {
        console.warn('[memory:working] Redis unavailable, falling back to Postgres:', (err as Error).message);
        globalForRedis.redisConnecting = undefined; // allow retry later
        return null;
      }
    })();
  }
  return globalForRedis.redisConnecting;
}

const key = (conversationId: string) => `saba:wm:${conversationId}`;

export async function appendToWindow(
  conversationId: string,
  entry: WorkingMemoryEntry
): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const k = key(conversationId);
    await client
      .multi()
      .rPush(k, JSON.stringify(entry))
      .lTrim(k, -WINDOW_SIZE, -1)
      .expire(k, TTL_SECONDS)
      .exec();
  } catch (err) {
    console.warn('[memory:working] append failed:', (err as Error).message);
  }
}

/** Recent turns, oldest first. Reads Redis; rebuilds from Postgres on a cold cache. */
export async function getWindow(conversationId: string): Promise<WorkingMemoryEntry[]> {
  const client = await getClient();
  if (client) {
    try {
      const raw = await client.lRange(key(conversationId), 0, -1);
      if (raw.length > 0) return raw.map((r) => JSON.parse(r));
    } catch (err) {
      console.warn('[memory:working] read failed:', (err as Error).message);
    }
  }

  // Cold cache (or Redis down): rebuild the window from Tier 2.
  const messages = await listRecentMessages(conversationId, WINDOW_SIZE);
  const entries = messages.map((m) => ({ role: m.role, content: m.content }));
  if (client && entries.length > 0) {
    try {
      const k = key(conversationId);
      await client
        .multi()
        .del(k)
        .rPush(k, entries.map((e) => JSON.stringify(e)))
        .expire(k, TTL_SECONDS)
        .exec();
    } catch {
      // cache rebuild is best-effort
    }
  }
  return entries;
}

export async function dropWindow(conversationId: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    await client.del(key(conversationId));
  } catch {
    // best-effort
  }
}
