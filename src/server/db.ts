import { Pool } from 'pg';
import type { Conversation, Memory, Message, Task, User } from '@/lib/types';

// One pool per server process; survives Next.js hot reloads in dev.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForDb.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = pool;

// --- Users ---

export type DbUser = User & { passwordHash: string };

function toUser(row: any): DbUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    passwordHash: row.password_hash,
  };
}

export async function createUser(
  email: string,
  name: string,
  passwordHash: string
): Promise<DbUser> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *`,
    [email.toLowerCase(), name, passwordHash]
  );
  return toUser(rows[0]);
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function updateUserName(id: string, name: string): Promise<DbUser> {
  const { rows } = await pool.query(
    `UPDATE users SET name = $2 WHERE id = $1 RETURNING *`,
    [id, name]
  );
  return toUser(rows[0]);
}

// --- Conversations ---

function toConversation(row: any): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createConversation(
  userId: string,
  title: string
): Promise<Conversation> {
  const { rows } = await pool.query(
    `INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *`,
    [userId, title]
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

export async function getConversation(
  id: string,
  userId: string
): Promise<Conversation | null> {
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

export async function deleteConversation(id: string, userId: string): Promise<void> {
  await pool.query(`DELETE FROM conversations WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
}

// --- Messages ---

function toMessage(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<Message> {
  const { rows } = await pool.query(
    `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *`,
    [conversationId, role, content]
  );
  return toMessage(rows[0]);
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const { rows } = await pool.query(
    `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId]
  );
  return rows.map(toMessage);
}

export async function listRecentMessages(
  conversationId: string,
  limit: number
): Promise<Message[]> {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT * FROM messages WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT $2
     ) recent ORDER BY created_at ASC`,
    [conversationId, limit]
  );
  return rows.map(toMessage);
}

// --- Memories (Tier 2 — episodic) ---

function toMemory(row: any): Memory {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    source: row.source,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Inserts a fact unless the user already has it (unique index on
 * user_id + content, case/punctuation-insensitive). Returns the existing
 * row on a duplicate so callers always get the canonical memory.
 */
export async function saveMemory(
  userId: string,
  content: string,
  category: Memory['category'],
  source: Memory['source']
): Promise<Memory> {
  const normalized = content.trim().replace(/\s+/g, ' ');
  const { rows } = await pool.query(
    `INSERT INTO memories (user_id, content, category, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, rtrim(lower(content), ' .!')) DO NOTHING
     RETURNING *`,
    [userId, normalized, category, source]
  );
  if (rows[0]) return toMemory(rows[0]);
  const { rows: existing } = await pool.query(
    `SELECT * FROM memories
     WHERE user_id = $1 AND rtrim(lower(content), ' .!') = rtrim(lower($2), ' .!')`,
    [userId, normalized]
  );
  return toMemory(existing[0]);
}

export async function listMemories(userId: string): Promise<Memory[]> {
  const { rows } = await pool.query(
    `SELECT * FROM memories WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(toMemory);
}

export async function deleteMemory(id: string, userId: string): Promise<void> {
  await pool.query(`DELETE FROM memories WHERE id = $1 AND user_id = $2`, [id, userId]);
}

// --- Tasks ---

function toTask(row: any): Task {
  return {
    id: row.id,
    content: row.content,
    kind: row.kind,
    priority: row.priority,
    dueAt: row.due_at ? row.due_at.toISOString() : null,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
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

export async function setTaskCompleted(
  id: string,
  userId: string,
  completed: boolean
): Promise<Task | null> {
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
