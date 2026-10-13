-- SABA database schema (idempotent — safe to re-run).
-- Changes are additive only, so it can be applied before deploying new code.

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
-- Covers superseded facts too: re-learning one revives the old row (see saveMemory).
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

-- Email reminders: when the reminder email was last sent (NULL = not yet / re-send after snooze).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
-- IANA timezone captured from the browser, used to format times in reminder emails.
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT;
-- Google sign-in: such accounts have no password; google_id is Google's stable "sub" claim.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;

-- --- Accounts -------------------------------------------------------------
-- Reminder/brief emails only go to verified addresses (Google accounts are verified by Google).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
UPDATE users SET email_verified_at = created_at
  WHERE google_id IS NOT NULL AND email_verified_at IS NULL;
-- Bumped by "sign out everywhere" and password resets; sessions carry the version they were issued with.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 0;
-- SABA Pulse: opt-in morning brief, sent once per local day.
ALTER TABLE users ADD COLUMN IF NOT EXISTS brief_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS brief_sent_on DATE;
-- SABA Sleep: last nightly consolidation and what it did.
ALTER TABLE users ADD COLUMN IF NOT EXISTS consolidated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_consolidation JSONB;
-- SABA Anywhere: Telegram link (one-time code → chat id) and the rolling Telegram conversation.
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_conversation_id UUID;

-- --- Conversations & messages ---------------------------------------------
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS incognito BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summarized_at TIMESTAMPTZ;
-- Per-reply memory trace, tool steps, actions and created tasks — survives reloads.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta JSONB;
-- Full-text search across every chat ('simple' = language-agnostic tokens).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS search TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
CREATE INDEX IF NOT EXISTS idx_messages_search ON messages USING GIN (search);

-- --- SABA Sleep: memories that evolve ---------------------------------------
-- A fact is current while valid_to IS NULL; updates close the old row and point it at its successor.
ALTER TABLE memories ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;
UPDATE memories SET valid_from = created_at WHERE valid_from IS NULL;
ALTER TABLE memories ALTER COLUMN valid_from SET DEFAULT now();
ALTER TABLE memories ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES memories(id) ON DELETE SET NULL;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS importance SMALLINT NOT NULL DEFAULT 5;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS use_count INT NOT NULL DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
-- SABA Sources: the message a fact was learned from ("why do you know this?").
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;
-- SABA Pulse: recurring personal dates ('MM-DD') and SABA Galaxy: people/places a fact mentions.
ALTER TABLE memories ADD COLUMN IF NOT EXISTS event_date TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS entities TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_memories_current ON memories (user_id) WHERE valid_to IS NULL;

-- --- Goals & habits ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS goal_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_id  UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  note       TEXT NOT NULL,
  value      DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goal_logs_memory ON goal_logs (memory_id, created_at DESC);

-- --- Document memory ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INT NOT NULL,
  pages      INT,
  chunks     INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS document_chunks (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idx         INT NOT NULL,
  page        INT,
  content     TEXT NOT NULL,
  search      TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  PRIMARY KEY (document_id, idx)
);
CREATE INDEX IF NOT EXISTS idx_document_chunks_search ON document_chunks USING GIN (search);

-- --- Integrations -------------------------------------------------------------
-- MCP personal access tokens (only the SHA-256 hash is stored).
CREATE TABLE IF NOT EXISTS access_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  token_hash   TEXT UNIQUE NOT NULL,
  prefix       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT UNIQUE NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Google Calendar: refresh token, AES-256-GCM encrypted with a key derived from AUTH_SECRET.
CREATE TABLE IF NOT EXISTS google_tokens (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  scope         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- Operations -----------------------------------------------------------------
-- Fixed-window rate limits (old rows are swept by the cron tick).
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT NOT NULL
);

-- One row per chat turn, aggregate-only (no user id, no content) — powers /stats.
CREATE TABLE IF NOT EXISTS turn_metrics (
  id             BIGSERIAL PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  model          TEXT,
  fallbacks      INT NOT NULL DEFAULT 0,
  t1_ms          INT,
  t2_ms          INT,
  t3_ms          INT,
  first_token_ms INT,
  total_ms       INT,
  tool_calls     INT NOT NULL DEFAULT 0,
  facts          INT NOT NULL DEFAULT 0,
  moments        INT NOT NULL DEFAULT 0,
  prompt_chars   INT,
  reply_chars    INT,
  error          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_turn_metrics_created ON turn_metrics (created_at DESC);

-- Tier 3 without Pinecone: pgvector in this same database, when the extension is available
-- (Neon has it; locally the pgvector/pgvector image does). Skipped silently elsewhere.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
    EXECUTE 'CREATE TABLE IF NOT EXISTS memory_vectors (
      id              TEXT PRIMARY KEY,
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind            TEXT NOT NULL,
      conversation_id UUID,
      document_id     UUID,
      embedding       vector(768) NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )';
    -- ponytail: exact scan per user; add an HNSW index if a single user passes ~100k vectors.
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_memory_vectors_user ON memory_vectors (user_id, kind)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector unavailable, Tier 3 needs Pinecone: %', SQLERRM;
END $$;
