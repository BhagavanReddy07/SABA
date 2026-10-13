// Shared types between server and client. All dates travel as ISO strings.

export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  /** IANA timezone captured from the browser; used to format reminder emails. */
  timezone: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  briefEnabled: boolean;
  telegramLinked: boolean;
  calendarLinked: boolean;
  /** What the last nightly memory consolidation did (SABA Sleep). */
  lastConsolidation: Consolidation | null;
};

export type Consolidation = { at: string; merged: number; retired: number; summarized: number };

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** SABA neither learns from nor recalls an incognito chat. */
  incognito: boolean;
  shared: boolean;
};

/** An image attached to a chat message (client → server only; never stored). */
export type MessageImage = { mimeType: string; data: string };

export type ToolStep = {
  id: string;
  name: string;
  label: string;
  status: 'running' | 'done' | 'error';
  summary?: string;
};

export type MessageMeta = {
  /** What the assistant recalled to produce this reply (assistant messages only). */
  trace?: MemoryTrace;
  /** External apps the reply opened (YouTube, Maps, mail, …). */
  actions?: DeepLinkAction[];
  /** Tasks/reminders created by this reply. */
  tasks?: Task[];
  tools?: ToolStep[];
  /** Shown under the message, e.g. "Stopped". */
  notice?: string;
  /** Number of images attached (user messages). */
  images?: number;
  model?: string;
};

export type Message = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  meta?: MessageMeta;
  /** Client-only: data URLs of images attached to a just-sent message. */
  previews?: string[];
};

/** A deep link into an external app — no API keys, opened in the browser. */
export type DeepLinkAction =
  | { type: 'youtube'; query: string; videoId?: string }
  | { type: 'spotify' | 'maps' | 'directions' | 'search' | 'wikipedia'; query: string }
  | { type: 'mail'; to?: string; subject?: string; body?: string }
  | { type: 'whatsapp'; to?: string; body: string }
  | { type: 'sms'; to?: string; body?: string }
  | { type: 'call'; to: string };

export type MemoryCategory = 'fact' | 'preference' | 'goal' | 'summary';

export type Memory = {
  id: string;
  content: string;
  category: MemoryCategory;
  source: 'extracted' | 'manual';
  createdAt: string;
  validFrom: string;
  /** Set when the fact stopped being true (superseded or retired); null = current. */
  validTo: string | null;
  supersededBy: string | null;
  importance: number;
  useCount: number;
  lastUsedAt: string | null;
  /** Recurring personal date as 'MM-DD' (birthdays, anniversaries). */
  eventDate: string | null;
  entities: string[];
  sourceMessageId: string | null;
  sourceConversationId: string | null;
  sourceConversationTitle: string | null;
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

/** One recalled item, tagged with the ref the model cites it by ([M1], [P2], [D1]). */
export type MemorySource =
  | {
      ref: string;
      kind: 'fact';
      id: string;
      content: string;
      category: MemoryCategory;
      /** No longer true (superseded/retired) — recalled for "what did I…before" questions. */
      formerly?: boolean;
      validTo?: string | null;
      conversationId: string | null;
      messageId: string | null;
    }
  | {
      ref: string;
      kind: 'moment';
      content: string;
      score: number;
      conversationId: string;
      messageId: string;
      title: string;
      createdAt: string;
    }
  | {
      ref: string;
      kind: 'summary';
      id: string;
      content: string;
      score: number;
      conversationId: string | null;
      messageId: string | null;
    }
  | {
      ref: string;
      kind: 'doc';
      content: string;
      score: number;
      documentId: string;
      name: string;
      page: number | null;
    };

/** A recalled item before it's given a citation ref (Omit distributed over the union). */
export type SourceItem = MemorySource extends infer S ? (S extends MemorySource ? Omit<S, 'ref'> : never) : never;

/** Per-reply snapshot of what each memory tier contributed. */
export type MemoryTrace = {
  /** Tier 1 — recent messages from the working window. */
  workingMemory: number;
  /** Tier 2 facts + Tier 3 moments/summaries/documents, in prompt order. */
  sources: MemorySource[];
};

/** What one exchange changed in long-term memory. */
export type MemoryUpdate = {
  learned: Memory[];
  updated: { from: Memory; to: Memory }[];
  retired: Memory[];
  /** Ids hard-deleted at the user's request ("forget that…"). */
  forgotten: string[];
};

/** Events streamed from POST /api/chat as server-sent events. */
export type ChatStreamEvent =
  | { type: 'start'; conversation: Conversation; trace: MemoryTrace }
  | { type: 'delta'; text: string }
  | { type: 'tool'; step: ToolStep }
  /** The reply is final; the stream may stay open for `memory` and `title`. */
  | { type: 'done'; message: Message; userMessage: Message }
  | { type: 'memory'; update: MemoryUpdate }
  | { type: 'title'; conversationId: string; title: string }
  | { type: 'error'; message: string };

export type Doc = {
  id: string;
  name: string;
  mime: string;
  size: number;
  pages: number | null;
  chunks: number;
  createdAt: string;
};

export type GoalLog = { id: string; note: string; value: number | null; createdAt: string };
export type Goal = { memory: Memory; logs: GoalLog[] };

export type AccessToken = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type SearchHit = {
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  role: 'user' | 'assistant';
  /** Excerpt with matches wrapped in «…». */
  snippet: string;
  createdAt: string;
};

/** Which optional services are configured — lets the UI hide what can't work. */
export type PublicConfig = {
  llm: boolean;
  vision: boolean;
  google: boolean;
  email: boolean;
  telegram: boolean;
  calendar: boolean;
  webSearch: boolean;
  /** VAPID public key, or null when web push isn't configured. */
  push: string | null;
};

export type Wrapped = {
  period: 'month' | 'year';
  since: string;
  messages: number;
  conversations: number;
  activeDays: number;
  busiestDay: string | null;
  busiestHour: number | null;
  topics: string[];
  memoriesLearned: number;
  memoriesByCategory: Record<string, number>;
  mostUsedMemory: string | null;
  remindersDone: number;
  goalLogs: number;
  documents: number;
};
