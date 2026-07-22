// Shared types between server and client. All dates travel as ISO strings.

export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** What the assistant recalled to produce this reply (assistant messages only). */
  memoryTrace?: MemoryTrace;
  /** External action the reply wants to open (Spotify, YouTube, mail, …) — transient, not persisted. */
  action?: ChatAction;
};

/** A deep link into an external app, produced by the assistant when asked to play/open/compose something. */
export type ChatAction =
  | { type: 'youtube'; query: string; videoId?: string }
  | { type: 'spotify' | 'maps' | 'search'; query: string }
  | { type: 'mail'; to?: string; subject?: string; body?: string };

export type MemoryCategory = 'fact' | 'preference' | 'goal' | 'summary';

export type Memory = {
  id: string;
  content: string;
  category: MemoryCategory;
  source: 'extracted' | 'manual';
  createdAt: string;
};

export type Task = {
  id: string;
  content: string;
  kind: 'task' | 'reminder';
  priority: 'low' | 'medium' | 'high';
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

/** Per-reply snapshot of what each memory tier contributed. */
export type MemoryTrace = {
  /** Tier 1 — recent messages pulled from the Redis working window. */
  workingMemory: number;
  /** Tier 2 — durable facts about the user loaded from Postgres. */
  episodic: string[];
  /** Tier 3 — semantically similar past moments found in Pinecone. */
  semantic: { content: string; score: number }[];
};

/** Events streamed from POST /api/chat as server-sent events. */
export type ChatStreamEvent =
  | { type: 'start'; conversationId: string; title: string; trace: MemoryTrace }
  | { type: 'delta'; text: string }
  | { type: 'done'; message: Message }
  | { type: 'error'; message: string };
