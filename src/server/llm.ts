// LLM client — streamed chat with native tool calling, plus embeddings. Plain REST, no SDK.
//
// Chat fallback chain, tried in order until one produces output:
//   Ollama (OLLAMA_URL — local/private mode) → Groq (GROQ_MODELS) → Gemini (GEMINI_MODELS)
// Groq leads (fast; each model has its own free per-minute budget); Gemini also handles images.
// Model lists are env-overridable: providers retire models, and a retired name must never be
// able to take the app down (it just 404s and the chain moves on).
// Embeddings: Gemini, else Ollama (nomic-embed-text — also 768-d).
// ponytail: don't switch embedding providers on an existing index — the vector spaces differ.

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_EMBED = 'gemini-embedding-001';
export const EMBEDDING_DIM = 768;

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type ChatMessage =
  | { role: 'user'; content: string; images?: { mimeType: string; data: string }[] }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };
/** JSON-schema subset both OpenAI-style and Gemini function calling accept. */
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };
export type ChatEvent =
  | { type: 'model'; model: string; fallbacks: number }
  | { type: 'text'; text: string }
  | { type: 'tool_calls'; calls: ToolCall[] };

export type ChatOptions = {
  system: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  /** "provider/model" to try first — keeps a tool loop on the model that started it. */
  prefer?: string;
  /** 'required' forces a tool call (used when the user clearly asked for an action). */
  toolChoice?: 'auto' | 'required';
};

type Target = { provider: 'ollama' | 'groq' | 'gemini'; model: string; vision: boolean };

const GROQ_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
// Two pinned models plus Google's rolling alias, so retirements can't empty the chain.
const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
const modelList = (env: string | undefined, fallback: string[]) =>
  env?.split(',').map((m) => m.trim()).filter(Boolean) || fallback;

function targets(vision: boolean): Target[] {
  const list: Target[] = [];
  if (process.env.OLLAMA_URL) {
    list.push({ provider: 'ollama', model: process.env.OLLAMA_CHAT_MODEL || 'llama3.1', vision: false });
  }
  if (process.env.GROQ_API_KEY) {
    for (const model of modelList(process.env.GROQ_MODELS, GROQ_MODELS)) list.push({ provider: 'groq', model, vision: false });
  }
  if (process.env.GEMINI_API_KEY) {
    for (const model of modelList(process.env.GEMINI_MODELS, GEMINI_MODELS)) list.push({ provider: 'gemini', model, vision: true });
  }
  return vision ? list.filter((t) => t.vision) : list;
}

/** Reasoning models think before answering: keep it brief, and leave budget for the answer. */
function reasoningParams(model: string, maxTokens: number) {
  if (model.startsWith('openai/gpt-oss')) return { reasoning_effort: 'low', max_tokens: maxTokens + 512 };
  if (model.startsWith('qwen/')) return { reasoning_effort: 'none', max_tokens: maxTokens };
  return { max_tokens: maxTokens };
}

/** True when any chat-capable provider is configured. */
export const hasChatKey = (): boolean => targets(false).length > 0;
export const hasVision = (): boolean => targets(true).length > 0;
export const hasEmbedder = (): boolean => Boolean(process.env.GEMINI_API_KEY || process.env.OLLAMA_URL);

const ollamaBase = () => process.env.OLLAMA_URL!.replace(/\/+$/, '');

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
}

/**
 * Streams one model turn. Falls through the chain while a model fails *before* producing
 * output; after partial output it stops cleanly and the caller keeps what it got.
 */
export async function* streamChat(o: ChatOptions): AsyncGenerator<ChatEvent> {
  const vision = o.messages.some((m) => m.role === 'user' && m.images?.length);
  let list = targets(vision);
  if (!list.length) {
    throw new Error(vision ? 'Image understanding needs GEMINI_API_KEY' : 'No LLM provider configured');
  }
  const preferred = list.findIndex((t) => `${t.provider}/${t.model}` === o.prefer);
  if (preferred > 0) list = [list[preferred], ...list.filter((_, i) => i !== preferred)];

  // Free tiers meter tokens per minute; if *every* model is rate-limited, wait once (as the
  // providers ask, capped) and go round again rather than fail a burst of messages.
  for (let attempt = 0; ; attempt++) {
    const errors: string[] = [];
    let retryAfter = 0;
    let allRateLimited = true;
    for (const [n, target] of list.entries()) {
      if (o.signal?.aborted) return;
      let produced = false;
      try {
        const stream = target.provider === 'gemini' ? geminiStream(target, o) : openAiStream(target, o);
        for await (const event of stream) {
          if (!produced) {
            produced = true;
            yield { type: 'model', model: `${target.provider}/${target.model}`, fallbacks: n };
          }
          yield event;
        }
        if (produced) return;
        allRateLimited = false;
        errors.push(`${target.model}: empty response`);
      } catch (err) {
        if (produced || o.signal?.aborted) return;
        const e = err as HttpError;
        if (e.status === 429) retryAfter = Math.max(retryAfter, e.retryAfter ?? 3);
        else allRateLimited = false;
        errors.push(e.message.replace(/\s+/g, ' ').slice(0, 240));
      }
    }
    if (attempt === 0 && allRateLimited && !o.signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, 8) * 1000));
      continue;
    }
    throw new Error(`All models failed — ${errors.join(' | ')}`);
  }
}

type HttpError = Error & { status?: number; retryAfter?: number };

async function httpError(label: string, res: Response): Promise<HttpError> {
  const err: HttpError = new Error(`${label}: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
  err.status = res.status;
  const after = Number(res.headers.get('retry-after'));
  if (Number.isFinite(after) && after > 0) err.retryAfter = after;
  return err;
}

/** Groq and Ollama both speak the OpenAI chat-completions protocol. */
async function* openAiStream(t: Target, o: ChatOptions): AsyncGenerator<ChatEvent> {
  const url = t.provider === 'groq' ? GROQ : `${ollamaBase()}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(t.provider === 'groq' && { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }),
    },
    body: JSON.stringify({
      model: t.model,
      messages: toOpenAi(o.system, o.messages),
      temperature: o.temperature ?? 0.7,
      ...(t.provider === 'groq' ? reasoningParams(t.model, o.maxTokens ?? 1024) : { max_tokens: o.maxTokens ?? 1024 }),
      stream: true,
      ...(o.tools?.length && {
        tools: o.tools.map((fn) => ({ type: 'function', function: fn })),
        tool_choice: o.toolChoice ?? 'auto',
      }),
    }),
    signal: withTimeout(o.signal, 45_000),
  });
  if (!res.ok || !res.body) {
    throw await httpError(`${t.provider}/${t.model}`, res);
  }

  const calls: { id: string; name: string; args: string }[] = [];
  for await (const data of sseData(res.body)) {
    if (data === '[DONE]') break;
    const json = parse(data);
    if (!json) continue;
    if (json.error) throw new Error(`${t.model}: ${json.error.message ?? 'stream error'}`);
    const delta = json.choices?.[0]?.delta;
    if (typeof delta?.content === 'string' && delta.content) yield { type: 'text', text: delta.content };
    for (const tc of delta?.tool_calls ?? []) {
      const i = typeof tc.index === 'number' ? tc.index : calls.length;
      const slot = (calls[i] ??= { id: '', name: '', args: '' });
      if (tc.id) slot.id = tc.id;
      if (tc.function?.name) slot.name += tc.function.name;
      if (tc.function?.arguments) slot.args += tc.function.arguments;
    }
  }
  const done = calls.filter((c) => c?.name);
  if (done.length) {
    yield {
      type: 'tool_calls',
      calls: done.map((c, i) => ({ id: c.id || `call_${i}`, name: c.name, args: parseArgs(c.args) })),
    };
  }
}

async function* geminiStream(t: Target, o: ChatOptions): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${GEMINI}/models/${t.model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: o.system }] },
      contents: toGemini(o.messages),
      ...(o.tools?.length && { tools: [{ functionDeclarations: o.tools }] }),
      ...(o.tools?.length && o.toolChoice === 'required' && { toolConfig: { functionCallingConfig: { mode: 'ANY' } } }),
      generationConfig: {
        temperature: o.temperature ?? 0.7,
        maxOutputTokens: o.maxTokens ?? 1024,
        ...(o.json && { responseMimeType: 'application/json' }),
        // Thinking would eat the output budget and add latency; replies here are short.
        ...(t.model.startsWith('gemini-2.5') && { thinkingConfig: { thinkingBudget: 0 } }),
      },
    }),
    signal: withTimeout(o.signal, 45_000),
  });
  if (!res.ok || !res.body) {
    throw await httpError(`gemini/${t.model}`, res);
  }

  const calls: ToolCall[] = [];
  for await (const data of sseData(res.body)) {
    const json = parse(data);
    const candidate = json?.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (part.thought) continue;
      if (typeof part.text === 'string' && part.text) yield { type: 'text', text: part.text };
      if (part.functionCall?.name) {
        calls.push({ id: `call_${calls.length}`, name: part.functionCall.name, args: part.functionCall.args ?? {} });
      }
    }
    if (candidate?.finishReason === 'MALFORMED_FUNCTION_CALL') throw new Error(`${t.model}: malformed tool call`);
  }
  if (calls.length) yield { type: 'tool_calls', calls };
}

function toOpenAi(system: string, messages: ChatMessage[]) {
  return [
    { role: 'system', content: system },
    ...messages.map((m) => {
      if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
      if (m.role === 'assistant') {
        return {
          role: 'assistant',
          content: m.content || (m.toolCalls?.length ? null : ''),
          ...(m.toolCalls?.length && {
            tool_calls: m.toolCalls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
          }),
        };
      }
      return { role: 'user', content: m.content };
    }),
  ];
}

function toGemini(messages: ChatMessage[]) {
  const out: { role: 'user' | 'model'; parts: unknown[] }[] = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts =
      m.role === 'tool'
        ? [{ functionResponse: { name: m.name, response: { result: m.content } } }]
        : m.role === 'assistant'
          ? [
              ...(m.content ? [{ text: m.content }] : []),
              ...(m.toolCalls ?? []).map((c) => ({ functionCall: { name: c.name, args: c.args } })),
            ]
          : [
              { text: m.content || ' ' },
              ...(m.images ?? []).map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.data } })),
            ];
    if (!parts.length || (!out.length && role === 'model')) continue; // Gemini wants a user turn first
    const last = out[out.length - 1];
    if (last?.role === role) last.parts.push(...parts);
    else out.push({ role, parts });
  }
  return out;
}

/** Yields the payload of each `data:` line of a server-sent-events body. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const data = line.startsWith('data:') ? line.slice(5).trim() : '';
        if (data) yield data;
      }
    }
    const tail = buffer.startsWith('data:') ? buffer.slice(5).trim() : '';
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function parse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null; // keep-alive or malformed chunk
  }
}

function parseArgs(text: string): Record<string, unknown> {
  const value = parse(text || '{}');
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** One-shot generation (internal jobs: titles, extraction, summaries) — same chain, no tools. */
export async function generateText(
  system: string,
  prompt: string,
  options: { temperature?: number; maxTokens?: number; json?: boolean; signal?: AbortSignal } = {}
): Promise<string> {
  let text = '';
  for await (const event of streamChat({ system, messages: [{ role: 'user', content: prompt }], ...options })) {
    if (event.type === 'text') text += event.text;
  }
  return text.trim();
}

/** Asks for JSON and parses it leniently (code fences, prose around the object). */
export async function generateJson<T>(system: string, prompt: string): Promise<T> {
  return parseJsonLoose<T>(await generateText(system, prompt, { temperature: 0.2, json: true }));
}

export function parseJsonLoose<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start === -1 || end <= start) throw new Error('No JSON in model output');
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }
}

export async function embed(text: string): Promise<number[]> {
  return (await embedMany([text]))[0];
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const inputs = texts.map((t) => t.slice(0, 8000) || ' ');
  let vectors: number[][] = [];

  if (process.env.GEMINI_API_KEY) {
    for (let i = 0; i < inputs.length; i += 100) {
      const res = await fetch(`${GEMINI}/models/${GEMINI_EMBED}:batchEmbedContents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          requests: inputs.slice(i, i + 100).map((text) => ({
            model: `models/${GEMINI_EMBED}`,
            content: { parts: [{ text }] },
            outputDimensionality: EMBEDDING_DIM,
          })),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Embedding failed: HTTP ${res.status}`);
      const data = await res.json();
      vectors.push(...(data?.embeddings ?? []).map((e: { values: number[] }) => e.values));
    }
  } else if (process.env.OLLAMA_URL) {
    const res = await fetch(`${ollamaBase()}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text', input: inputs }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Embedding failed: HTTP ${res.status}`);
    vectors = (await res.json())?.embeddings ?? [];
  } else {
    throw new Error('No embedding provider (GEMINI_API_KEY or OLLAMA_URL)');
  }

  if (vectors.length !== inputs.length || vectors.some((v) => v?.length !== EMBEDDING_DIM)) {
    throw new Error(`Embedding response malformed (expected ${inputs.length}×${EMBEDDING_DIM})`);
  }
  return vectors;
}
