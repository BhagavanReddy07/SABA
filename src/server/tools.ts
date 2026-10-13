// Native tools the model can call. Each returns plain text for the model plus a short summary for
// the UI step. State-changing tools report what really happened (created, duplicate, nothing
// matched…), so a reply can never claim an action that didn't occur.

import type { DeepLinkAction, Memory, MemoryCategory, MemorySource, SourceItem, Task } from '@/lib/types';
import { streakDays } from '@/lib/goals';
import type { ToolCall, ToolSpec } from './llm';
import { addGoalLog, createTask, listGoals, listTasks, recentSimilarReminders, setTaskCompleted } from './db';
import { addManualMemory, findFacts, forgetMemories, overlap, searchMemory, tokens, type Defer } from './memory';
import { currency, dateMath, math, weather, webSearch, wikipedia } from './lookup';
import { createEvent, listEvents } from './calendar';

export type ToolContext = {
  userId: string;
  timezone: string;
  /** Recalled items the model cites by ref; search_memory appends to it. */
  sources: MemorySource[];
  /** Deep links for the client to open. */
  actions: DeepLinkAction[];
  /** Tasks created or completed by this reply. */
  tasks: Task[];
  taskRefs: Map<string, Task>;
  /** Manual memory changes (merged into the reply's `memory` event). */
  learned: Memory[];
  forgotten: string[];
  defer: Defer;
  calendar: boolean;
  /** Incognito chats never write to memory. */
  incognito: boolean;
  /** search_memory reads Tiers 2+3 directly — off when a SABA Bench ablation disables them. */
  memorySearch: boolean;
  /** The user's message this turn ('' for MCP, whose callers invoke tools explicitly). */
  userMessage: string;
  channel: 'chat' | 'mcp';
};

// Explicit "remember" intent. Implicit facts are learned by reconcile after the reply, so a model
// eagerly calling remember on its own adds nothing but run-on, unsourced memories.
const EXPLICIT_REMEMBER = /(remember|don'?t forget|note (that|this|down)|save (this|that)|keep in mind|make a note)/i;

export type ToolResult = { ok: boolean; content: string; summary?: string };
type Args = Record<string, unknown>;
type Tool = ToolSpec & { label: (args: Args) => string; run: (args: Args, ctx: ToolContext) => Promise<ToolResult> };

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function formatWhen(iso: string, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  try {
    return new Date(iso).toLocaleString('en-US', { ...opts, timeZone });
  } catch {
    return new Date(iso).toLocaleString('en-US', { ...opts, timeZone: 'UTC' }) + ' UTC';
  }
}

/** Same reminder worded slightly differently ("Call mom" / "call my mom")? */
export function sameWording(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
  const y = b.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const wx = new Set(x.split(/\s+/));
  const wy = new Set(y.split(/\s+/));
  const shared = [...wx].filter((w) => wy.has(w)).length;
  return shared / new Set([...wx, ...wy]).size >= 0.5;
}

/** First video id from YouTube's public results page — no API key; falls back to a search link. */
async function resolveYouTubeVideo(query: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: { 'accept-language': 'en' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return undefined;
    return (await res.text()).match(/"videoId":"([\w-]{11})"/)?.[1];
  } catch {
    return undefined;
  }
}

const APPS = {
  youtube: 'YouTube',
  spotify: 'Spotify',
  maps: 'Maps',
  directions: 'Maps directions',
  google: 'Google',
  wikipedia: 'Wikipedia',
} as const;

const LOOKUPS: Record<string, string> = {
  weather: 'Checking the weather',
  wikipedia: 'Reading Wikipedia',
  web: 'Searching the web',
  currency: 'Converting currency',
  math: 'Calculating',
  date: 'Working out dates',
};

function nextRef(sources: MemorySource[], kind: MemorySource['kind']): string {
  const prefix = kind === 'fact' ? 'M' : kind === 'doc' ? 'D' : 'P';
  return `${prefix}${sources.filter((s) => s.ref.startsWith(prefix)).length + 1}`;
}

function sameSource(a: SourceItem, b: SourceItem): boolean {
  if (a.kind !== b.kind) return false;
  if ((a.kind === 'fact' || a.kind === 'summary') && 'id' in b) return a.id === b.id;
  if (a.kind === 'moment' && b.kind === 'moment') return a.messageId === b.messageId;
  return a.content === b.content;
}

export function describeSource(s: MemorySource): string {
  switch (s.kind) {
    case 'fact':
      return s.formerly ? `${s.content} (no longer true${s.validTo ? ` since ${s.validTo.slice(0, 10)}` : ''})` : s.content;
    case 'moment':
      return `(${s.createdAt.slice(0, 10)}, "${s.title}") ${s.content}`;
    case 'summary':
      return s.content;
    case 'doc':
      return `(${s.name}${s.page ? `, p.${s.page}` : ''}) ${s.content}`;
  }
}

const TOOLS: Tool[] = [
  {
    name: 'open_link',
    description:
      'Open in a new tab: play a song/video (youtube; spotify only if asked), a place (maps), directions, a Google search, or a Wikipedia article.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', enum: Object.keys(APPS) },
        query: {
          type: 'string',
          description: 'Specific, e.g. "Take Five Dave Brubeck official audio" or a place',
        },
      },
      required: ['app', 'query'],
    },
    label: (a) => `Opening ${APPS[a.app as keyof typeof APPS] ?? 'a link'}`,
    async run(a, ctx) {
      const app = str(a.app) as keyof typeof APPS;
      const query = str(a.query, 300);
      if (!(app in APPS) || !query) return { ok: false, content: 'Need a valid app and a query.' };
      const action: DeepLinkAction =
        app === 'youtube'
          ? { type: 'youtube', query, videoId: await resolveYouTubeVideo(query) }
          : { type: app === 'google' ? 'search' : app, query };
      ctx.actions.push(action);
      return { ok: true, content: `Opened ${APPS[app]} for "${query}" in a new tab.`, summary: query };
    },
  },
  {
    name: 'compose',
    description:
      'Draft an email, WhatsApp or SMS for the user to send, or start a call. Full message in body.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['email', 'whatsapp', 'sms', 'call'] },
        to: { type: 'string', description: 'Email, or phone with country code' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['channel'],
    },
    label: (a) =>
      a.channel === 'call' ? 'Starting a call' : a.channel === 'email' ? 'Drafting an email' : 'Drafting a message',
    async run(a, ctx) {
      const to = str(a.to, 200);
      const body = str(a.body, 4000);
      const phone = to.replace(/[^\d+]/g, '');
      let action: DeepLinkAction;
      switch (str(a.channel)) {
        case 'email':
          action = { type: 'mail', to: to || undefined, subject: str(a.subject, 200) || undefined, body: body || undefined };
          break;
        case 'whatsapp':
          if (!body) return { ok: false, content: 'A WhatsApp message needs a body.' };
          action = { type: 'whatsapp', to: phone || undefined, body };
          break;
        case 'sms':
          action = { type: 'sms', to: phone || undefined, body: body || undefined };
          break;
        case 'call':
          if (phone.replace('+', '').length < 5) return { ok: false, content: 'A call needs a phone number — ask the user for it.' };
          action = { type: 'call', to: phone };
          break;
        default:
          return { ok: false, content: 'channel must be email, whatsapp, sms or call.' };
      }
      ctx.actions.push(action);
      return { ok: true, content: `Opened the ${str(a.channel)} draft for the user to review and send.`, summary: to || undefined };
    },
  },
  {
    name: 'create_reminder',
    description:
      "Only when the user asks to be reminded or to add a task/to-do — never on your own initiative (dates they mention are tracked automatically). due_at: ISO 8601 with the user's UTC offset from their local time; omit if no time given.",
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Short imperative, e.g. "Call mom"' },
        due_at: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['content'],
    },
    label: () => 'Setting a reminder',
    async run(a, ctx) {
      const content = str(a.content, 200);
      if (!content) return { ok: false, content: 'content is required.' };
      let dueAt: string | null = null;
      if (str(a.due_at)) {
        const t = Date.parse(str(a.due_at));
        if (Number.isNaN(t)) return { ok: false, content: 'due_at is not a valid ISO 8601 date-time. Recompute it.' };
        if (t < Date.now() - 60_000) {
          return {
            ok: false,
            content: `due_at ${str(a.due_at)} is in the past (it is now ${formatWhen(new Date().toISOString(), ctx.timezone)}). If you miscalculated, fix it; if the time the user asked for has already passed, ask them for a new time — never pick one yourself.`,
          };
        }
        if (t > Date.now() + 5 * 365 * 86_400_000) return { ok: false, content: 'due_at is over 5 years away — double-check it.' };
        dueAt = new Date(t).toISOString();
      }
      const dupe = (await recentSimilarReminders(ctx.userId, dueAt)).find((t) => sameWording(t.content, content));
      if (dupe) {
        return {
          ok: true,
          content: `Already set: "${dupe.content}"${dupe.dueAt ? ` for ${formatWhen(dupe.dueAt, ctx.timezone)}` : ''}. No duplicate created.`,
          summary: 'already set',
        };
      }
      const priority = (['low', 'medium', 'high'] as const).find((p) => p === a.priority) ?? 'medium';
      const task = await createTask(ctx.userId, { content, kind: dueAt ? 'reminder' : 'task', priority, dueAt });
      ctx.tasks.push(task);
      return dueAt
        ? { ok: true, content: `Reminder "${content}" set for ${formatWhen(dueAt, ctx.timezone)}; the user gets notified then.`, summary: formatWhen(dueAt, ctx.timezone) }
        : { ok: true, content: `Task "${content}" added to the list (no time given, so no notification).`, summary: 'added' };
    },
  },
  {
    name: 'list_tasks',
    description: "List the user's tasks with refs (T1…).",
    parameters: { type: 'object', properties: { include_completed: { type: 'boolean' } } },
    label: () => 'Checking your tasks',
    async run(a, ctx) {
      const list = (await listTasks(ctx.userId)).filter((t) => a.include_completed === true || !t.completedAt).slice(0, 30);
      if (!list.length) return { ok: true, content: 'The user has no open tasks.', summary: 'none open' };
      const now = Date.now();
      const lines = list.map((t, i) => {
        ctx.taskRefs.set(`T${i + 1}`, t);
        const due = t.dueAt ? ` — due ${formatWhen(t.dueAt, ctx.timezone)}${!t.completedAt && Date.parse(t.dueAt) < now ? ' (overdue)' : ''}` : '';
        return `T${i + 1}: ${t.content}${due}${t.completedAt ? ' [done]' : ''}${t.priority === 'high' ? ' [high priority]' : ''}`;
      });
      return { ok: true, content: lines.join('\n'), summary: `${list.length} task${list.length === 1 ? '' : 's'}` };
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task done by ref (T2) or description.',
    parameters: { type: 'object', properties: { ref: { type: 'string' }, description: { type: 'string' } } },
    label: () => 'Completing a task',
    async run(a, ctx) {
      let task = ctx.taskRefs.get(str(a.ref).replace(/[[\]]/g, '').toUpperCase());
      if (!task && str(a.description)) {
        const q = tokens(str(a.description));
        const best = (await listTasks(ctx.userId))
          .filter((t) => !t.completedAt)
          .map((t) => ({ t, s: overlap(q, tokens(t.content)) }))
          .sort((x, y) => y.s - x.s)[0];
        if (best && best.s >= 0.5) task = best.t;
      }
      if (!task) return { ok: false, content: 'No matching open task — call list_tasks and use a ref.' };
      const done = await setTaskCompleted(task.id, ctx.userId, true);
      if (!done) return { ok: false, content: 'That task no longer exists.' };
      ctx.tasks.push(done);
      return { ok: true, content: `Marked "${done.content}" as done.`, summary: done.content };
    },
  },
  {
    name: 'remember',
    description: 'Only when the user explicitly says to remember something. (Facts mentioned in passing are saved automatically — never call this for those.)',
    parameters: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description: 'English, third person, starts with "User"',
        },
        category: { type: 'string', enum: ['fact', 'preference', 'goal'] },
      },
      required: ['fact'],
    },
    label: () => 'Saving to memory',
    async run(a, ctx) {
      if (ctx.incognito) return { ok: false, content: 'This is an incognito chat — nothing is saved to memory. Tell the user.' };
      if (ctx.channel === 'chat' && !EXPLICIT_REMEMBER.test(ctx.userMessage) && !/[^ -]/.test(ctx.userMessage)) {
        return { ok: false, content: 'Not saved: only use remember when the user explicitly asks. Facts they mention are learned automatically — do not mention saving.' };
      }
      const fact = str(a.fact, 300);
      if (fact.length < 6) return { ok: false, content: 'fact is required.' };
      const category = (['fact', 'preference', 'goal'] as MemoryCategory[]).find((c) => c === a.category) ?? 'fact';
      const { memory, status } = await addManualMemory(ctx.userId, fact, category, ctx.defer);
      if (status !== 'existing') ctx.learned.push(memory);
      return {
        ok: true,
        content: status === 'existing' ? `Already in memory: "${memory.content}".` : `Saved to memory: "${memory.content}".`,
        summary: memory.content,
      };
    },
  },
  {
    name: 'forget',
    description:
      'Delete memories the user asks you to forget: [M#] refs, or a description.',
    parameters: {
      type: 'object',
      properties: { refs: { type: 'array', items: { type: 'string' } }, description: { type: 'string' } },
    },
    label: () => 'Forgetting',
    async run(a, ctx) {
      const refs = Array.isArray(a.refs) ? a.refs.map((r) => String(r).replace(/[[\]]/g, '').toUpperCase()) : [];
      let targets = ctx.sources
        .filter((s): s is Extract<MemorySource, { kind: 'fact' }> => s.kind === 'fact' && refs.includes(s.ref))
        .map((s) => ({ id: s.id, content: s.content }));
      if (!targets.length && str(a.description)) {
        targets = (await findFacts(ctx.userId, str(a.description))).map((m) => ({ id: m.id, content: m.content }));
      }
      if (!targets.length) {
        return { ok: false, content: 'No matching memory found — nothing was deleted. Tell the user so (they can also check Settings → Memory).' };
      }
      const gone = await forgetMemories(ctx.userId, targets.map((t) => t.id));
      ctx.forgotten.push(...gone);
      const forgotten = targets.filter((t) => gone.includes(t.id));
      return {
        ok: true,
        content: forgotten.length
          ? `Permanently deleted: ${forgotten.map((t) => `"${t.content}"`).join('; ')}.`
          : 'Those memories were already gone.',
        summary: `${forgotten.length} forgotten`,
      };
    },
  },
  {
    name: 'search_memory',
    description:
      "Search past chats, saved facts and documents when the context above isn't enough.",
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    label: () => 'Searching memory',
    async run(a, ctx) {
      const items = await searchMemory(ctx.userId, str(a.query, 300));
      if (!items.length) return { ok: true, content: 'Nothing relevant found in memory.', summary: 'no results' };
      const lines = items.map((item) => {
        let source = ctx.sources.find((s) => sameSource(s, item));
        if (!source) {
          source = { ...item, ref: nextRef(ctx.sources, item.kind) } as MemorySource;
          ctx.sources.push(source);
        }
        return `[${source.ref}] ${describeSource(source)}`;
      });
      return { ok: true, content: `${lines.join('\n')}\nCite these refs when you use them.`, summary: `${items.length} found` };
    },
  },
  {
    name: 'log_goal',
    description: "Log progress on one of the user's goals (e.g. \"ran 5k\").",
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: '[M#] ref or description' },
        note: { type: 'string' },
        value: { type: 'number' },
      },
      required: ['goal', 'note'],
    },
    label: () => 'Logging progress',
    async run(a, ctx) {
      const goals = await listGoals(ctx.userId);
      if (!goals.length) {
        return { ok: false, content: 'The user has no saved goals. Offer to save this as a goal (remember with category "goal").' };
      }
      const ref = str(a.goal).replace(/[[\]]/g, '').toUpperCase();
      const cited = ctx.sources.find((s) => s.ref === ref && s.kind === 'fact');
      let goal = cited && 'id' in cited ? goals.find((g) => g.memory.id === cited.id) : undefined;
      if (!goal) {
        const q = tokens(`${str(a.goal)} ${str(a.note)}`);
        goal = goals
          .map((g) => ({ g, s: overlap(q, tokens(g.memory.content)) }))
          .filter((x) => x.s > 0)
          .sort((x, y) => y.s - x.s)[0]?.g;
        if (!goal && goals.length === 1) goal = goals[0];
      }
      if (!goal) return { ok: false, content: `Unclear which goal. Goals: ${goals.map((g) => g.memory.content).join('; ')}` };
      const value = typeof a.value === 'number' && Number.isFinite(a.value) ? a.value : null;
      const log = await addGoalLog(ctx.userId, goal.memory.id, str(a.note, 300) || 'Progress', value);
      const streak = streakDays([log, ...goal.logs].map((l) => l.createdAt), ctx.timezone);
      return {
        ok: true,
        content: `Logged on "${goal.memory.content}": ${log.note}. Streak: ${streak} day${streak === 1 ? '' : 's'}.`,
        summary: `${streak}-day streak`,
      };
    },
  },
  {
    name: 'lookup',
    description:
      'Live/exact info: weather, Wikipedia, web search, currency, exact math, date math (weekday, add days, days between).',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: Object.keys(LOOKUPS) },
        query: { type: 'string', description: 'place, search terms, or math ("23.5% of 1847.25")' },
        amount: { type: 'number' },
        from: { type: 'string', description: 'e.g. USD' },
        to: { type: 'string', description: 'e.g. INR' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        date2: { type: 'string', description: 'YYYY-MM-DD, for a difference' },
        days: { type: 'number', description: 'to add' },
      },
      required: ['kind'],
    },
    label: (a) => LOOKUPS[str(a.kind)] ?? 'Looking it up',
    async run(a) {
      const q = str(a.query, 300);
      let text: string;
      switch (str(a.kind)) {
        case 'weather':
          text = q ? await weather(q) : 'Which place?';
          break;
        case 'wikipedia':
          text = q ? await wikipedia(q) : 'What topic?';
          break;
        case 'web':
          text = q ? await webSearch(q) : 'What to search for?';
          break;
        case 'currency':
          text = await currency(typeof a.amount === 'number' ? a.amount : 1, str(a.from), str(a.to));
          break;
        case 'math':
          text = q ? math(q) : 'Which expression?';
          break;
        case 'date':
          text = dateMath(str(a.date), str(a.date2) || undefined, typeof a.days === 'number' ? a.days : undefined);
          break;
        default:
          return { ok: false, content: `kind must be one of: ${Object.keys(LOOKUPS).join(', ')}.` };
      }
      return { ok: true, content: text, summary: q || undefined };
    },
  },
  {
    name: 'calendar',
    description: "Read or add Google Calendar events.",
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add'] },
        days: { type: 'number', description: 'list: days ahead' },
        title: { type: 'string' },
        start: { type: 'string', description: 'ISO 8601 with offset' },
        end: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['action'],
    },
    label: (a) => (a.action === 'add' ? 'Adding to your calendar' : 'Checking your calendar'),
    async run(a, ctx) {
      if (a.action === 'add') {
        if (!str(a.title) || !str(a.start)) return { ok: false, content: 'add needs title and start.' };
        const text = await createEvent(ctx.userId, {
          title: str(a.title, 200),
          start: str(a.start),
          end: str(a.end) || undefined,
          description: str(a.description, 2000) || undefined,
        });
        return { ok: text.startsWith('Added'), content: text, summary: str(a.title, 80) };
      }
      const days = typeof a.days === 'number' && a.days > 0 ? Math.round(a.days) : 7;
      return { ok: true, content: await listEvents(ctx.userId, days, ctx.timezone), summary: `next ${days} days` };
    },
  },
];

/** Tool specs offered to the model this turn. */
export function toolSpecs(options: { calendar: boolean; incognito?: boolean; memorySearch?: boolean }): ToolSpec[] {
  return TOOLS.filter(
    (t) =>
      (t.name !== 'calendar' || options.calendar) &&
      (t.name !== 'remember' || !options.incognito) &&
      (t.name !== 'search_memory' || options.memorySearch !== false)
  ).map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
}

export function toolLabel(call: ToolCall): string {
  return TOOLS.find((t) => t.name === call.name)?.label(call.args) ?? 'Working';
}

/** Runs one tool call; never throws (a failure becomes a result the model can react to). */
export async function runTool(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === call.name);
  if (!tool || (tool.name === 'calendar' && !ctx.calendar) || (tool.name === 'search_memory' && !ctx.memorySearch)) {
    return { ok: false, content: `Unknown tool "${call.name}".` };
  }
  try {
    return await tool.run(call.args ?? {}, ctx);
  } catch (err) {
    console.warn(`[tools] ${call.name} failed:`, (err as Error).message);
    return { ok: false, content: `The ${call.name} tool failed: ${(err as Error).message}. Tell the user briefly.` };
  }
}
