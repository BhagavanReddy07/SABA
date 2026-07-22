-- SABA database schema (idempotent — safe to re-run).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user
  ON conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, created_at);

-- Tier 2 (episodic): durable facts SABA learns about the user.
CREATE TABLE IF NOT EXISTS memories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'fact'
             CHECK (category IN ('fact', 'preference', 'goal', 'summary')),
  source     TEXT NOT NULL DEFAULT 'extracted'
             CHECK (source IN ('extracted', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_user
  ON memories (user_id, created_at DESC);

-- Remove duplicate facts stored before the unique index existed (keeps the oldest).
DELETE FROM memories a USING memories b
  WHERE a.user_id = b.user_id
    AND rtrim(lower(a.content), ' .!') = rtrim(lower(b.content), ' .!')
    AND (a.created_at > b.created_at
         OR (a.created_at = b.created_at AND a.id > b.id));

-- One copy of each fact per user, ignoring case and trailing punctuation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_user_content_uniq
  ON memories (user_id, rtrim(lower(content), ' .!'));

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'task'
               CHECK (kind IN ('task', 'reminder')),
  priority     TEXT NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('low', 'medium', 'high')),
  due_at       TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user
  ON tasks (user_id, created_at DESC);
