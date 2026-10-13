import { Pool, type PoolClient } from 'pg';
import type {
  AccessToken,
  Consolidation,
  Conversation,
  Doc,
  Goal,
  GoalLog,
  Memory,
  MessageMeta,
  Message,
  SearchHit,
  Task,
  User,
} from '@/lib/types';

// One pool per server process; survives Next.js hot reloads in dev.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForDb.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = pool;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// --- Users ---

export type DbUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  timezone: string | null;
  /** null for accounts created via Google sign-in. */
  passwordHash: string | null;
  googleId: string | null;
  emailVerifiedAt: string | null;
  sessionVersion: number;
  briefEnabled: boolean;
  telegramChatId: string | null;
  telegramConversationId: string | null;
  calendarLinked: boolean;
  lastConsolidation: Consolidation | null;
};

const USER_SELECT = `SELECT u.*, EXISTS (SELECT 1 FROM google_tokens g WHERE g.user_id = u.id) AS calendar_linked
  FROM users u`;

function toUser(row: any): DbUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    timezone: row.timezone ?? null,
    passwordHash: row.password_hash ?? null,
    googleId: row.google_id ?? null,
    emailVerifiedAt: iso(row.email_verified_at),
    sessionVersion: row.session_version ?? 0,
    briefEnabled: Boolean(row.brief_enabled),
    telegramChatId: row.telegram_chat_id ?? null,
    telegramConversationId: row.telegram_conversation_id ?? null,
    calendarLinked: Boolean(row.calendar_linked),
    lastConsolidation: row.last_consolidation ?? null,
  };
}

/** The client-facing shape — no hashes, ids of other systems, or internal flags. */
export function toPublicUser(u: DbUser): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt,
    timezone: u.timezone,
    emailVerified: Boolean(u.emailVerifiedAt),
    hasPassword: Boolean(u.passwordHash),
    briefEnabled: u.briefEnabled,
    telegramLinked: Boolean(u.telegramChatId),
    calendarLinked: u.calendarLinked,
    lastConsolidation: u.lastConsolidation,
  };
}

async function oneUser(where: string, params: unknown[]): Promise<DbUser | null> {
  const { rows } = await pool.query(`${USER_SELECT} WHERE ${where}`, params);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function createUser(email: string, name: string, passwordHash: string): Promise<DbUser> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    [email.toLowerCase(), name, passwordHash]
  );
  return (await getUserById(rows[0].id))!;
}

export const getUserByEmail = (email: string) => oneUser('u.email = $1', [email.toLowerCase()]);
export const getUserById = (id: string) => oneUser('u.id = $1', [id]);
export const getUserByGoogleId = (googleId: string) => oneUser('u.google_id = $1', [googleId]);
export const getUserByTelegramChat = (chatId: string) => oneUser('u.telegram_chat_id = $1', [chatId]);

export async function createGoogleUser(email: string, name: string, googleId: string): Promise<DbUser> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, google_id, email_verified_at) VALUES ($1, $2, $3, now()) RETURNING id`,
    [email.toLowerCase(), name, googleId]
  );
  return (await getUserById(rows[0].id))!;
}

/** Attach a Google ID to an existing account (first Google sign-in) — Google verified the email. */
export async function linkGoogleId(userId: string, googleId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET google_id = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`,
    [userId, googleId]
  );
}

export async function setUserTimezone(id: string, timezone: string): Promise<void> {
  await pool.query(
    `UPDATE users SET timezone = $2 WHERE id = $1 AND timezone IS DISTINCT FROM $2`,
    [id, timezone]
  );
}

export async function updateUserProfile(
  id: string,
  patch: { name?: string; briefEnabled?: boolean }
): Promise<DbUser> {
  await pool.query(
    `UPDATE users SET name = COALESCE($2, name), brief_enabled = COALESCE($3, brief_enabled) WHERE id = $1`,
    [id, patch.name ?? null, patch.briefEnabled ?? null]
  );
  return (await getUserById(id))!;
}

export async function markEmailVerified(id: string, email: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 AND email = $2`,
    [id, email.toLowerCase()]
  );
  return (rowCount ?? 0) > 0;
}

/** Password reset: new hash, every existing session revoked, and the email counts as verified. */
export async function setPassword(id: string, passwordHash: string): Promise<DbUser> {
  await pool.query(
    `UPDATE users SET password_hash = $2, session_version = session_version + 1,
       email_verified_at = COALESCE(email_verified_at, now())
     WHERE id = $1`,
    [id, passwordHash]
  );
  return (await getUserById(id))!;
}

export async function bumpSessionVersion(id: string): Promise<void> {
  await pool.query(`UPDATE users SET session_version = session_version + 1 WHERE id = $1`, [id]);
}

export async function deleteUser(id: string): Promise<void> {
  await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
}

export async function setConsolidation(id: string, summary: Consolidation): Promise<void> {
  await pool.query(
    `UPDATE users SET consolidated_at = now(), last_consolidation = $2 WHERE id = $1`,
    [id, JSON.stringify(summary)]
  );
}

// --- Telegram linking ---

export async function setTelegramLinkCode(userId: string, code: string): Promise<void> {
  await pool.query(
    `UPDATE users SET telegram_link_code = $2, telegram_link_expires_at = now() + interval '15 minutes'
     WHERE id = $1`,
    [userId, code]
  );
}

/** Redeems a /start code: links this chat to the code's owner (unlinking it from anyone else). */
export async function consumeTelegramLinkCode(code: string, chatId: string): Promise<DbUser | null> {
  const userId = await transaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM users WHERE telegram_link_code = $1 AND telegram_link_expires_at > now() FOR UPDATE`,
      [code]
    );
    if (!rows[0]) return null;
    await client.query(
      `UPDATE users SET telegram_chat_id = NULL, telegram_conversation_id = NULL
       WHERE telegram_chat_id = $1 AND id <> $2`,
      [chatId, rows[0].id]
    );
    await client.query(
      `UPDATE users SET telegram_chat_id = $2, telegram_link_code = NULL, telegram_link_expires_at = NULL
       WHERE id = $1`,
      [rows[0].id, chatId]
    );
    return rows[0].id as string;
  });
  return userId ? getUserById(userId) : null;
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET telegram_chat_id = NULL, telegram_conversation_id = NULL,
       telegram_link_code = NULL, telegram_link_expires_at = NULL
     WHERE id = $1`,
    [userId]
  );
}

export async function setTelegramConversation(userId: string, conversationId: string | null): Promise<void> {
  await pool.query(`UPDATE users SET telegram_conversation_id = $2 WHERE id = $1`, [userId, conversationId]);
}

// --- Conversations ---

function toConversation(row: any): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    incognito: Boolean(row.incognito),
    shared: Boolean(row.shared_at),
  };
}

export async function createConversation(
  userId: string,
  title: string,
  incognito = false
): Promise<Conversation> {
  const { rows } = await pool.query(
    `INSERT INTO conversations (user_id, title, incognito) VALUES ($1, $2, $3) RETURNING *`,
    [userId, title, incognito]
  );
  return toConversation(rows[0]);
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const { rows } = await pool.query(
    `SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  return rows.map(toConversation);
}

export async function getConversation(id: string, userId: string): Promise<Conversation | null> {
  const { rows } = await pool.query(
    `SELECT * FROM conversations WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ? toConversation(rows[0]) : null;
}

export async function renameConversation(
  id: string,
  userId: string,
  title: string
): Promise<Conversation | null> {
  const { rows } = await pool.query(
    `UPDATE conversations SET title = $3 WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, title]
  );
  return rows[0] ? toConversation(rows[0]) : null;
}

export async function touchConversation(id: string): Promise<void> {
  await pool.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [id]);
}

/** Deletes the conversation; returns its user-message ids so their Tier 3 vectors can go too. */
export async function deleteConversation(id: string, userId: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT m.id FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.id = $1 AND c.user_id = $2 AND m.role = 'user'`,
    [id, userId]
  );
  await pool.query(`DELETE FROM conversations WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows.map((r) => r.id);
}

export async function setConversationShared(
  id: string,
  userId: string,
  shared: boolean
): Promise<Conversation | null> {
  const { rows } = await pool.query(
    `UPDATE conversations SET shared_at = CASE WHEN $3 THEN COALESCE(shared_at, now()) ELSE NULL END
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, shared]
  );
  return rows[0] ? toConversation(rows[0]) : null;
}

/** Public read of a shared conversation (null once the owner stops sharing). */
export async function getSharedConversation(
  id: string
): Promise<{ conversation: Conversation; owner: string; messages: Message[] } | null> {
  const { rows } = await pool.query(
    `SELECT c.*, u.name AS owner FROM conversations c JOIN users u ON u.id = c.user_id
     WHERE c.id = $1 AND c.shared_at IS NOT NULL`,
    [id]
  );
  if (!rows[0]) return null;
  return {
    conversation: toConversation(rows[0]),
    owner: rows[0].owner,
    messages: (await listMessages(id)).map(({ meta, ...m }) => m),
  };
}

export async function listConversationsToSummarize(userId: string, limit: number): Promise<Conversation[]> {
  const { rows } = await pool.query(
    `SELECT c.* FROM conversations c
     WHERE c.user_id = $1 AND NOT c.incognito
       AND c.updated_at < now() - interval '6 hours'
       AND (c.summarized_at IS NULL OR c.summarized_at < c.updated_at)
       AND (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) >= 8
     ORDER BY c.updated_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows.map(toConversation);
}

export async function markSummarized(id: string): Promise<void> {
  await pool.query(`UPDATE conversations SET summarized_at = now() WHERE id = $1`, [id]);
}

// --- Messages ---

function toMessage(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at.toISOString(),
    ...(row.meta && { meta: row.meta as MessageMeta }),
  };
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  meta?: MessageMeta
): Promise<Message> {
  const { rows } = await pool.query(
    `INSERT INTO messages (conversation_id, role, content, meta) VALUES ($1, $2, $3, $4)
     RETURNING id, conversation_id, role, content, meta, created_at`,
    [conversationId, role, content, meta ? JSON.stringify(meta) : null]
  );
  return toMessage(rows[0]);
}

const MESSAGE_COLUMNS = 'id, conversation_id, role, content, meta, created_at';

export async function listMessages(conversationId: string): Promise<Message[]> {
  const { rows } = await pool.query(
    `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId]
  );
  return rows.map(toMessage);
}

export async function listRecentMessages(conversationId: string, limit: number): Promise<Message[]> {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT ${MESSAGE_COLUMNS} FROM messages WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT $2
     ) recent ORDER BY created_at ASC`,
    [conversationId, limit]
  );
  return rows.map(toMessage);
}

/** Regenerate / edit-and-resend: removes the last user message and every reply after it. */
export async function deleteLastTurn(conversationId: string): Promise<string[]> {
  const { rows } = await pool.query(
    `DELETE FROM messages WHERE conversation_id = $1 AND created_at >= (
       SELECT created_at FROM messages WHERE conversation_id = $1 AND role = 'user'
       ORDER BY created_at DESC LIMIT 1)
     RETURNING id, role`,
    [conversationId]
  );
  return rows.filter((r) => r.role === 'user').map((r) => r.id);
}

export type MessageHit = {
  id: string;
  content: string;
  reply: string | null;
  conversationId: string;
  title: string;
  createdAt: string;
};

/** Resolves Tier 3 message ids back to live rows (deleted chats simply don't come back). */
export async function resolveMessageHits(userId: string, ids: string[]): Promise<MessageHit[]> {
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `SELECT m.id, m.content, m.conversation_id, m.created_at, c.title,
       (SELECT a.content FROM messages a
        WHERE a.conversation_id = m.conversation_id AND a.role = 'assistant' AND a.created_at > m.created_at
        ORDER BY a.created_at LIMIT 1) AS reply
     FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE m.id = ANY($1::uuid[]) AND c.user_id = $2 AND NOT c.incognito`,
    [ids, userId]
  );
  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    reply: r.reply ?? null,
    conversationId: r.conversation_id,
    title: r.title,
    createdAt: r.created_at.toISOString(),
  }));
}

/** Full-text search over every message the user has sent or received. */
export async function searchMessages(
  userId: string,
  tsquery: string,
  limit: number
): Promise<(SearchHit & { rank: number; content: string })[]> {
  const { rows } = await pool.query(
    `SELECT m.id, m.conversation_id, m.role, m.content, m.created_at, c.title,
       ts_headline('simple', m.content, q, 'StartSel=«,StopSel=»,MaxWords=24,MinWords=8,MaxFragments=1') AS snippet,
       ts_rank(m.search, q) AS rank
     FROM messages m JOIN conversations c ON c.id = m.conversation_id,
          to_tsquery('simple', $2) q
     WHERE c.user_id = $1 AND m.search @@ q
     ORDER BY rank DESC, m.created_at DESC LIMIT $3`,
    [userId, tsquery, limit]
  );
  return rows.map((r) => ({
    conversationId: r.conversation_id,
    conversationTitle: r.title,
    messageId: r.id,
    role: r.role,
    snippet: r.snippet,
    content: r.content,
    createdAt: r.created_at.toISOString(),
    rank: Number(r.rank),
  }));
}

export async function searchConversationTitles(userId: string, query: string): Promise<Conversation[]> {
  const { rows } = await pool.query(
    `SELECT * FROM conversations WHERE user_id = $1 AND title ILIKE '%' || $2 || '%'
     ORDER BY updated_at DESC LIMIT 8`,
    [userId, query.replace(/[%_\\]/g, (c) => `\\${c}`)]
  );
  return rows.map(toConversation);
}

// --- Memories (Tier 2 — episodic) ---

const MEMORY_SELECT = `SELECT m.*, src.conversation_id AS source_conversation_id, sc.title AS source_conversation_title
  FROM memories m
  LEFT JOIN messages src ON src.id = m.source_message_id
  LEFT JOIN conversations sc ON sc.id = src.conversation_id`;

function toMemory(row: any): Memory {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    source: row.source,
    createdAt: row.created_at.toISOString(),
    validFrom: (row.valid_from ?? row.created_at).toISOString(),
    validTo: iso(row.valid_to),
    supersededBy: row.superseded_by ?? null,
    importance: row.importance ?? 5,
    useCount: row.use_count ?? 0,
    lastUsedAt: iso(row.last_used_at),
    eventDate: row.event_date ?? null,
    entities: row.entities ?? [],
    sourceMessageId: row.source_message_id ?? null,
    sourceConversationId: row.source_conversation_id ?? null,
    sourceConversationTitle: row.source_conversation_title ?? null,
  };
}

export type MemoryInput = {
  importance?: number;
  eventDate?: string | null;
  entities?: string[];
  sourceMessageId?: string | null;
};

/**
 * Inserts a fact unless the user already has it (unique on user_id + normalized content).
 * A matching fact that had been superseded is revived instead. Always returns the canonical row.
 */
export async function saveMemory(
  userId: string,
  content: string,
  category: Memory['category'],
  source: Memory['source'],
  input: MemoryInput = {}
): Promise<{ memory: Memory; status: 'inserted' | 'revived' | 'existing' }> {
  const normalized = content.trim().replace(/\s+/g, ' ');
  const { rows } = await pool.query(
    `INSERT INTO memories (user_id, content, category, source, importance, event_date, entities, source_message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, rtrim(lower(content), ' .!')) DO UPDATE
       SET valid_to = NULL, superseded_by = NULL, valid_from = now(), updated_at = now(),
           category = EXCLUDED.category,
           importance = GREATEST(memories.importance, EXCLUDED.importance),
           source_message_id = COALESCE(EXCLUDED.source_message_id, memories.source_message_id)
       WHERE memories.valid_to IS NOT NULL
     RETURNING (xmax = 0) AS inserted`,
    [
      userId,
      normalized,
      category,
      source,
      input.importance ?? 5,
      input.eventDate ?? null,
      input.entities ?? [],
      input.sourceMessageId ?? null,
    ]
  );
  const status = !rows[0] ? 'existing' : rows[0].inserted ? 'inserted' : 'revived';
  const { rows: found } = await pool.query(
    `${MEMORY_SELECT} WHERE m.user_id = $1 AND rtrim(lower(m.content), ' .!') = rtrim(lower($2), ' .!')`,
    [userId, normalized]
  );
  return { memory: toMemory(found[0]), status };
}

/** Current memories by default; `history` adds superseded and retired ones. */
export async function listMemories(userId: string, history = false): Promise<Memory[]> {
  const { rows } = await pool.query(
    `${MEMORY_SELECT} WHERE m.user_id = $1 ${history ? '' : 'AND m.valid_to IS NULL'}
     ORDER BY m.created_at DESC`,
    [userId]
  );
  return rows.map(toMemory);
}

/** Current facts eligible for the prompt (summaries surface through Tier 3 instead). */
export async function listCurrentFacts(userId: string): Promise<Memory[]> {
  const { rows } = await pool.query(
    `${MEMORY_SELECT} WHERE m.user_id = $1 AND m.valid_to IS NULL AND m.category <> 'summary'
     ORDER BY m.created_at DESC`,
    [userId]
  );
  return rows.map(toMemory);
}

export async function getMemoriesByIds(userId: string, ids: string[]): Promise<Memory[]> {
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `${MEMORY_SELECT} WHERE m.user_id = $1 AND m.id = ANY($2::uuid[])`,
    [userId, ids]
  );
  return rows.map(toMemory);
}

/** Current summary memories learned from a conversation (replaced when it's re-summarized). */
export async function listConversationSummaries(userId: string, conversationId: string): Promise<Memory[]> {
  const { rows } = await pool.query(
    `${MEMORY_SELECT} WHERE m.user_id = $1 AND m.category = 'summary' AND m.valid_to IS NULL
       AND src.conversation_id = $2`,
    [userId, conversationId]
  );
  return rows.map(toMemory);
}

export async function supersedeMemory(oldId: string, newId: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE memories SET valid_to = now(), superseded_by = $2, updated_at = now()
     WHERE id = $1 AND user_id = $3 AND id <> $2`,
    [oldId, newId, userId]
  );
}

export async function retireMemory(id: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE memories SET valid_to = now(), updated_at = now()
     WHERE id = $1 AND user_id = $2 AND valid_to IS NULL`,
    [id, userId]
  );
}

/**
 * Hard delete. With `restorePredecessor` (Undo of an update) the fact it replaced becomes current again.
 * Returns whether a row was deleted.
 */
export async function deleteMemory(id: string, userId: string, restorePredecessor = false): Promise<boolean> {
  if (restorePredecessor) {
    await pool.query(
      `UPDATE memories SET valid_to = NULL, superseded_by = NULL, updated_at = now()
       WHERE superseded_by = $1 AND user_id = $2`,
      [id, userId]
    );
  }
  const { rowCount } = await pool.query(`DELETE FROM memories WHERE id = $1 AND user_id = $2`, [id, userId]);
  return (rowCount ?? 0) > 0;
}

/** Facts saved by a tool mid-reply get their source once the user message is stored. */
export async function setMemorySource(ids: string[], messageId: string): Promise<void> {
  if (!ids.length) return;
  await pool.query(
    `UPDATE memories SET source_message_id = $2 WHERE id = ANY($1::uuid[]) AND source_message_id IS NULL`,
    [ids, messageId]
  );
}

export async function touchMemories(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await pool.query(
    `UPDATE memories SET use_count = use_count + 1, last_used_at = now() WHERE id = ANY($1::uuid[])`,
    [ids]
  );
}

// --- Goals ---

function toGoalLog(row: any): GoalLog {
  return {
    id: row.id,
    note: row.note,
    value: row.value === null ? null : Number(row.value),
    createdAt: row.created_at.toISOString(),
  };
}

export async function listGoals(userId: string): Promise<Goal[]> {
  const [{ rows: goals }, { rows: logs }] = await Promise.all([
    pool.query(
      `${MEMORY_SELECT} WHERE m.user_id = $1 AND m.valid_to IS NULL AND m.category = 'goal'
       ORDER BY m.created_at DESC`,
      [userId]
    ),
    pool.query(
      `SELECT * FROM goal_logs WHERE user_id = $1 AND created_at > now() - interval '90 days'
       ORDER BY created_at DESC`,
      [userId]
    ),
  ]);
  return goals.map((g) => ({
    memory: toMemory(g),
    logs: logs.filter((l) => l.memory_id === g.id).map(toGoalLog),
  }));
}

export async function addGoalLog(
  userId: string,
  memoryId: string,
  note: string,
  value: number | null
): Promise<GoalLog> {
  const { rows } = await pool.query(
    `INSERT INTO goal_logs (user_id, memory_id, note, value) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, memoryId, note, value]
  );
  return toGoalLog(rows[0]);
}

// --- Tasks ---

function toTask(row: any): Task {
  return {
    id: row.id,
    content: row.content,
    kind: row.kind,
    priority: row.priority,
    dueAt: iso(row.due_at),
    completedAt: iso(row.completed_at),
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Reminders created in the last 10 minutes, still open, due within 2 minutes of `dueAt`
 * (or both undated) — candidates for "the model asked twice for the same thing".
 * The caller compares wording, so different reminders at the same time are never merged.
 */
export async function recentSimilarReminders(userId: string, dueAt: string | null): Promise<Task[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tasks
     WHERE user_id = $1 AND completed_at IS NULL AND created_at > now() - interval '10 minutes'
       AND (($2::timestamptz IS NULL AND due_at IS NULL)
            OR abs(extract(epoch FROM (due_at - $2::timestamptz))) < 120)`,
    [userId, dueAt]
  );
  return rows.map(toTask);
}

export async function createTask(
  userId: string,
  task: { content: string; kind?: Task['kind']; priority?: Task['priority']; dueAt?: string | null }
): Promise<Task> {
  const { rows } = await pool.query(
    `INSERT INTO tasks (user_id, content, kind, priority, due_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, task.content, task.kind ?? 'task', task.priority ?? 'medium', task.dueAt ?? null]
  );
  return toTask(rows[0]);
}

export async function listTasks(userId: string): Promise<Task[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tasks WHERE user_id = $1
     ORDER BY (completed_at IS NOT NULL), created_at DESC`,
    [userId]
  );
  return rows.map(toTask);
}

export async function setTaskCompleted(id: string, userId: string, completed: boolean): Promise<Task | null> {
  const { rows } = await pool.query(
    `UPDATE tasks SET completed_at = CASE WHEN $3 THEN now() ELSE NULL END
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, completed]
  );
  return rows[0] ? toTask(rows[0]) : null;
}

export async function deleteTask(id: string, userId: string): Promise<void> {
  await pool.query(`DELETE FROM tasks WHERE id = $1 AND user_id = $2`, [id, userId]);
}

// --- Reminder delivery ---

export type DueTask = Task & {
  userId: string;
  userEmail: string;
  userName: string;
  userTimezone: string | null;
  emailVerified: boolean;
  telegramChatId: string | null;
};

/** Uncompleted tasks whose due time has passed and no reminder sent yet. */
export async function listDueTasks(): Promise<DueTask[]> {
  const { rows } = await pool.query(
    `SELECT t.*, u.email AS user_email, u.name AS user_name, u.timezone AS user_timezone,
       u.email_verified_at IS NOT NULL AS email_verified, u.telegram_chat_id
     FROM tasks t JOIN users u ON u.id = t.user_id
     WHERE t.due_at <= now() AND t.completed_at IS NULL AND t.reminded_at IS NULL
     ORDER BY t.due_at ASC LIMIT 50`
  );
  return rows.map((row) => ({
    ...toTask(row),
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    userTimezone: row.user_timezone ?? null,
    emailVerified: row.email_verified,
    telegramChatId: row.telegram_chat_id ?? null,
  }));
}

export async function markTaskReminded(id: string): Promise<void> {
  await pool.query(`UPDATE tasks SET reminded_at = now() WHERE id = $1`, [id]);
}

/** Reminder emails sent to this user in the last 24 h — the per-user daily cap. */
export async function countRemindersSentToday(userId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM tasks WHERE user_id = $1 AND reminded_at > now() - interval '1 day'`,
    [userId]
  );
  return rows[0].n;
}

/** Email/push/Telegram button action — the signed token (or linked chat) is the authorization. */
export async function completeTaskById(id: string): Promise<Task | null> {
  const { rows } = await pool.query(
    `UPDATE tasks SET completed_at = COALESCE(completed_at, now()) WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] ? toTask(rows[0]) : null;
}

/** Push the task `minutes` out and re-arm its reminder. */
export async function snoozeTaskById(id: string, minutes: number): Promise<Task | null> {
  const { rows } = await pool.query(
    `UPDATE tasks
     SET due_at = now() + make_interval(mins => $2), reminded_at = NULL
     WHERE id = $1 AND completed_at IS NULL RETURNING *`,
    [id, minutes]
  );
  return rows[0] ? toTask(rows[0]) : null;
}

export async function getTaskOwner(id: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT user_id FROM tasks WHERE id = $1`, [id]);
  return rows[0]?.user_id ?? null;
}

// --- Documents ---

function toDoc(row: any): Doc {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: row.size,
    pages: row.pages ?? null,
    chunks: row.chunks,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createDocument(
  userId: string,
  doc: { name: string; mime: string; size: number; pages: number | null },
  chunks: { page: number | null; content: string }[]
): Promise<Doc> {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO documents (user_id, name, mime, size, pages, chunks)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, doc.name, doc.mime, doc.size, doc.pages, chunks.length]
    );
    await client.query(
      `INSERT INTO document_chunks (document_id, idx, page, content)
       SELECT $1, i - 1, p, c FROM unnest($2::int[], $3::text[]) WITH ORDINALITY AS t(p, c, i)`,
      [rows[0].id, chunks.map((c) => c.page), chunks.map((c) => c.content)]
    );
    return toDoc(rows[0]);
  });
}

export async function listDocuments(userId: string): Promise<Doc[]> {
  const { rows } = await pool.query(
    `SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(toDoc);
}

/** Deletes the document (chunks cascade); returns its chunk count so the vectors can go too. */
export async function deleteDocument(id: string, userId: string): Promise<number | null> {
  const { rows } = await pool.query(
    `DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING chunks`,
    [id, userId]
  );
  return rows[0] ? rows[0].chunks : null;
}

export type ChunkHit = { documentId: string; idx: number; page: number | null; content: string; name: string };

export async function resolveDocChunks(
  userId: string,
  keys: { documentId: string; idx: number }[]
): Promise<ChunkHit[]> {
  if (!keys.length) return [];
  const { rows } = await pool.query(
    `SELECT dc.document_id, dc.idx, dc.page, dc.content, d.name
     FROM document_chunks dc JOIN documents d ON d.id = dc.document_id
     JOIN unnest($2::uuid[], $3::int[]) AS k(doc, idx) ON k.doc = dc.document_id AND k.idx = dc.idx
     WHERE d.user_id = $1`,
    [userId, keys.map((k) => k.documentId), keys.map((k) => k.idx)]
  );
  return rows.map((r) => ({ documentId: r.document_id, idx: r.idx, page: r.page, content: r.content, name: r.name }));
}

export async function searchDocChunks(userId: string, tsquery: string, limit: number): Promise<ChunkHit[]> {
  const { rows } = await pool.query(
    `SELECT dc.document_id, dc.idx, dc.page, dc.content, d.name
     FROM document_chunks dc JOIN documents d ON d.id = dc.document_id, to_tsquery('simple', $2) q
     WHERE d.user_id = $1 AND dc.search @@ q
     ORDER BY ts_rank(dc.search, q) DESC LIMIT $3`,
    [userId, tsquery, limit]
  );
  return rows.map((r) => ({ documentId: r.document_id, idx: r.idx, page: r.page, content: r.content, name: r.name }));
}

// --- MCP access tokens ---

function toAccessToken(row: any): AccessToken {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: iso(row.last_used_at),
  };
}

export async function createAccessToken(
  userId: string,
  name: string,
  tokenHash: string,
  prefix: string
): Promise<AccessToken> {
  const { rows } = await pool.query(
    `INSERT INTO access_tokens (user_id, name, token_hash, prefix) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, name, tokenHash, prefix]
  );
  return toAccessToken(rows[0]);
}

export async function listAccessTokens(userId: string): Promise<AccessToken[]> {
  const { rows } = await pool.query(
    `SELECT * FROM access_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(toAccessToken);
}

export async function deleteAccessToken(id: string, userId: string): Promise<void> {
  await pool.query(`DELETE FROM access_tokens WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function getUserByAccessTokenHash(tokenHash: string): Promise<DbUser | null> {
  const { rows } = await pool.query(
    `UPDATE access_tokens SET last_used_at = now() WHERE token_hash = $1 RETURNING user_id`,
    [tokenHash]
  );
  return rows[0] ? getUserById(rows[0].user_id) : null;
}

// --- Web push subscriptions ---

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };

export async function savePushSubscription(userId: string, sub: PushSubscriptionRow): Promise<void> {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
    [userId, sub.endpoint, sub.p256dh, sub.auth]
  );
}

export async function deletePushSubscription(endpoint: string, userId?: string): Promise<void> {
  await pool.query(
    `DELETE FROM push_subscriptions WHERE endpoint = $1 AND ($2::uuid IS NULL OR user_id = $2)`,
    [endpoint, userId ?? null]
  );
}

export async function listPushSubscriptions(userId: string): Promise<PushSubscriptionRow[]> {
  const { rows } = await pool.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );
  return rows;
}

// --- Google Calendar tokens ---

export async function saveGoogleToken(userId: string, encryptedRefreshToken: string, scope: string): Promise<void> {
  await pool.query(
    `INSERT INTO google_tokens (user_id, refresh_token, scope) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET refresh_token = $2, scope = $3, created_at = now()`,
    [userId, encryptedRefreshToken, scope]
  );
}

export async function getGoogleToken(userId: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT refresh_token FROM google_tokens WHERE user_id = $1`, [userId]);
  return rows[0]?.refresh_token ?? null;
}

export async function deleteGoogleToken(userId: string): Promise<void> {
  await pool.query(`DELETE FROM google_tokens WHERE user_id = $1`, [userId]);
}

// --- Rate limits ---

/** Counts one hit against `key` in a fixed window and returns the count so far. */
export async function hitRateLimit(key: string, windowSec: number): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1
                    ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now()
                           ELSE rate_limits.window_start END
     RETURNING count`,
    [key, windowSec]
  );
  return rows[0].count;
}

export async function cleanupRateLimits(): Promise<void> {
  await pool.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
}

// --- Turn metrics (/stats) ---

export type TurnMetrics = {
  model: string | null;
  fallbacks: number;
  t1: number;
  t2: number;
  t3: number;
  firstToken: number | null;
  total: number;
  toolCalls: number;
  facts: number;
  moments: number;
  promptChars: number;
  replyChars: number;
  error: boolean;
};

export async function recordTurnMetrics(m: TurnMetrics): Promise<void> {
  await pool.query(
    `INSERT INTO turn_metrics (model, fallbacks, t1_ms, t2_ms, t3_ms, first_token_ms, total_ms,
       tool_calls, facts, moments, prompt_chars, reply_chars, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [m.model, m.fallbacks, m.t1, m.t2, m.t3, m.firstToken, m.total, m.toolCalls, m.facts, m.moments,
      m.promptChars, m.replyChars, m.error]
  );
}

export type Stats = {
  days: number;
  turns: number;
  p50FirstToken: number | null;
  p95FirstToken: number | null;
  p50Total: number | null;
  p50Tier: { t1: number | null; t2: number | null; t3: number | null };
  semanticRate: number | null;
  fallbackRate: number | null;
  errorRate: number | null;
  toolRate: number | null;
  models: { model: string; turns: number }[];
  daily: { day: string; turns: number; p50FirstToken: number | null }[];
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function getStats(days: number): Promise<Stats> {
  const window = `created_at > now() - make_interval(days => $1)`;
  const [summary, models, daily] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS turns,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY first_token_ms) AS p50_first,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY first_token_ms) AS p95_first,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) AS p50_total,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY t1_ms) AS p50_t1,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY t2_ms) AS p50_t2,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY t3_ms) AS p50_t3,
         avg((moments > 0)::int) AS semantic_rate,
         avg((fallbacks > 0)::int) AS fallback_rate,
         avg(error::int) AS error_rate,
         avg((tool_calls > 0)::int) AS tool_rate
       FROM turn_metrics WHERE ${window}`,
      [days]
    ),
    pool.query(
      `SELECT coalesce(model, 'demo') AS model, count(*)::int AS turns FROM turn_metrics
       WHERE ${window} GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
      [days]
    ),
    pool.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS turns,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY first_token_ms) AS p50
       FROM turn_metrics WHERE ${window} GROUP BY 1 ORDER BY 1`,
      [days]
    ),
  ]);
  const s = summary.rows[0];
  return {
    days,
    turns: s.turns,
    p50FirstToken: num(s.p50_first),
    p95FirstToken: num(s.p95_first),
    p50Total: num(s.p50_total),
    p50Tier: { t1: num(s.p50_t1), t2: num(s.p50_t2), t3: num(s.p50_t3) },
    semanticRate: num(s.semantic_rate),
    fallbackRate: num(s.fallback_rate),
    errorRate: num(s.error_rate),
    toolRate: num(s.tool_rate),
    models: models.rows,
    daily: daily.rows.map((r) => ({ day: r.day, turns: r.turns, p50FirstToken: num(r.p50) })),
  };
}

// --- Scheduled jobs (cron tick) ---

// Guards `AT TIME ZONE` against zones Postgres doesn't know: CASE only evaluates the
// branch whose condition held, so a bad value never reaches the conversion.
const LOCAL_TIME = (col: string) => `CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = ${col})
  THEN now() AT TIME ZONE ${col} END`;

/** Users whose local time is 8–9 AM and who haven't had today's brief. */
export async function listBriefCandidates(limit: number): Promise<(DbUser & { localDate: string })[]> {
  const local = LOCAL_TIME('u.timezone');
  const { rows } = await pool.query(
    `SELECT *, to_char(x.local_ts, 'YYYY-MM-DD') AS local_date FROM (
       SELECT u.*, EXISTS (SELECT 1 FROM google_tokens g WHERE g.user_id = u.id) AS calendar_linked,
         ${local} AS local_ts
       FROM users u WHERE u.brief_enabled AND u.timezone IS NOT NULL
     ) x
     WHERE x.local_ts IS NOT NULL AND extract(hour FROM x.local_ts) = 8
       AND (x.brief_sent_on IS NULL OR x.brief_sent_on < x.local_ts::date)
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ ...toUser(r), localDate: r.local_date }));
}

export async function markBriefSent(userId: string, localDate: string): Promise<void> {
  await pool.query(`UPDATE users SET brief_sent_on = $2 WHERE id = $1`, [userId, localDate]);
}

/** Users with new activity since their last consolidation, preferably during their night. */
export async function listConsolidationCandidates(limit: number): Promise<DbUser[]> {
  const local = LOCAL_TIME('u.timezone');
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT u.*, EXISTS (SELECT 1 FROM google_tokens g WHERE g.user_id = u.id) AS calendar_linked,
         ${local} AS local_ts
       FROM users u
       WHERE (u.consolidated_at IS NULL OR u.consolidated_at < now() - interval '20 hours')
         AND EXISTS (SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id
                     WHERE c.user_id = u.id AND m.created_at > coalesce(u.consolidated_at, '-infinity'))
     ) x
     WHERE x.local_ts IS NULL OR extract(hour FROM x.local_ts) BETWEEN 2 AND 5
        OR x.consolidated_at < now() - interval '48 hours'
     ORDER BY x.consolidated_at NULLS FIRST
     LIMIT $1`,
    [limit]
  );
  return rows.map(toUser);
}

// --- Wrapped ---

export async function wrappedStats(userId: string, since: string, timezone: string) {
  const [activity, day, hour, titles, learned, mostUsed, tasks, goals, docs] = await Promise.all([
    pool.query(
      `SELECT count(*) FILTER (WHERE m.role = 'user')::int AS messages,
         count(DISTINCT m.conversation_id)::int AS conversations,
         count(DISTINCT (m.created_at AT TIME ZONE $3)::date)::int AS active_days
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = $1 AND m.created_at >= $2`,
      [userId, since, timezone]
    ),
    pool.query(
      `SELECT to_char(m.created_at AT TIME ZONE $3, 'FMDay') AS day FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = $1 AND m.created_at >= $2 AND m.role = 'user'
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`,
      [userId, since, timezone]
    ),
    pool.query(
      `SELECT extract(hour FROM m.created_at AT TIME ZONE $3)::int AS hour FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = $1 AND m.created_at >= $2 AND m.role = 'user'
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`,
      [userId, since, timezone]
    ),
    pool.query(
      `SELECT title FROM conversations WHERE user_id = $1 AND updated_at >= $2 AND NOT incognito
       ORDER BY updated_at DESC LIMIT 60`,
      [userId, since]
    ),
    pool.query(
      `SELECT category, count(*)::int AS n FROM memories WHERE user_id = $1 AND created_at >= $2
       GROUP BY category`,
      [userId, since]
    ),
    pool.query(
      `SELECT content FROM memories WHERE user_id = $1 AND valid_to IS NULL AND use_count > 0
       ORDER BY use_count DESC LIMIT 1`,
      [userId]
    ),
    pool.query(`SELECT count(*)::int AS n FROM tasks WHERE user_id = $1 AND completed_at >= $2`, [userId, since]),
    pool.query(`SELECT count(*)::int AS n FROM goal_logs WHERE user_id = $1 AND created_at >= $2`, [userId, since]),
    pool.query(`SELECT count(*)::int AS n FROM documents WHERE user_id = $1 AND created_at >= $2`, [userId, since]),
  ]);
  const byCategory: Record<string, number> = {};
  for (const r of learned.rows) byCategory[r.category] = r.n;
  return {
    messages: activity.rows[0].messages as number,
    conversations: activity.rows[0].conversations as number,
    activeDays: activity.rows[0].active_days as number,
    busiestDay: (day.rows[0]?.day as string) ?? null,
    busiestHour: (hour.rows[0]?.hour as number) ?? null,
    titles: titles.rows.map((r) => r.title as string),
    memoriesLearned: Object.values(byCategory).reduce((a, b) => a + b, 0),
    memoriesByCategory: byCategory,
    mostUsedMemory: (mostUsed.rows[0]?.content as string) ?? null,
    remindersDone: tasks.rows[0].n as number,
    goalLogs: goals.rows[0].n as number,
    documents: docs.rows[0].n as number,
  };
}

// --- Data export ---

export async function exportUserData(userId: string) {
  const user = await getUserById(userId);
  const [conversations, messages, memories, tasks, documents, goalLogs] = await Promise.all([
    listConversations(userId),
    pool.query(
      `SELECT m.id, m.conversation_id, m.role, m.content, m.created_at FROM messages m
       JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1 ORDER BY m.created_at`,
      [userId]
    ),
    listMemories(userId, true),
    listTasks(userId),
    listDocuments(userId),
    pool.query(`SELECT * FROM goal_logs WHERE user_id = $1 ORDER BY created_at`, [userId]),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    user: user && toPublicUser(user),
    conversations: conversations.map((c) => ({
      ...c,
      messages: messages.rows
        .filter((m) => m.conversation_id === c.id)
        .map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at.toISOString() })),
    })),
    memories,
    tasks,
    documents,
    goalLogs: goalLogs.rows.map((r) => ({ ...toGoalLog(r), goalId: r.memory_id })),
  };
}

/** Every Tier 3 vector id that belongs to the user (account deletion). */
export async function listUserVectorIds(userId: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT m.id::text AS id FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = $1 AND m.role = 'user'
     UNION ALL SELECT 'memory-' || id FROM memories WHERE user_id = $1
     UNION ALL SELECT 'doc-' || d.id || '-' || i FROM documents d, generate_series(0, d.chunks - 1) AS i
       WHERE d.user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.id);
}
