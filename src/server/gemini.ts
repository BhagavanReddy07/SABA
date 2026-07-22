// Minimal LLM REST client — chat generation (Groq first, Gemini fallback) + embeddings.
// No SDK: a few endpoints and a fallback chain don't justify a dependency.
//
// Groq's free tier allows thousands of requests/day vs Gemini's ~20/model,
// so when GROQ_API_KEY is set it handles chat; Gemini stays for embeddings
// (Groq has none) and as the chat fallback.

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GROQ_BASE = 'https://api.groq.com/openai/v1/chat/completions';

// Tried in order; flash-lite first for latency, falling back to fuller models
// if it's rate-limited or unavailable.
const CHAT_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
// Groq: best model first, then the high-quota small one (~14k req/day free).
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

// A hung request shouldn't block the whole fallback chain — fail fast and try the next model.
const CHAT_TIMEOUT_MS = 12_000;
const EMBED_TIMEOUT_MS = 8_000;

export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIM = 768;

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** True when any chat-capable provider is configured. */
export function hasChatKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY) || hasGeminiKey();
}

type GenOptions = { temperature?: number; maxOutputTokens?: number };

function groqRequest(model: string, system: string, user: string, options: GenOptions, stream: boolean) {
  return fetch(GROQ_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxOutputTokens ?? 1024,
      stream,
    }),
    signal: AbortSignal.timeout(stream ? 45_000 : CHAT_TIMEOUT_MS),
  });
}

export async function generateText(
  systemInstruction: string,
  userPrompt: string,
  options: GenOptions = {}
): Promise<string> {
  if (!hasChatKey()) throw new Error('No chat API key set (GROQ_API_KEY or GEMINI_API_KEY)');

  let lastError: unknown;

  if (process.env.GROQ_API_KEY) {
    for (const model of GROQ_MODELS) {
      try {
        const res = await groqRequest(model, systemInstruction, userPrompt, options, false);
        if (!res.ok) {
          lastError = new Error(`groq/${model}: HTTP ${res.status}`);
          continue;
        }
        const data = await res.json();
        const text: string = data?.choices?.[0]?.message?.content ?? '';
        if (text.trim()) return text.trim();
        lastError = new Error(`groq/${model}: empty response`);
      } catch (err) {
        lastError = err;
      }
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw lastError ?? new Error('All chat models failed');

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 1024,
    },
  });

  for (const model of CHAT_MODELS) {
    try {
      const res = await fetch(`${BASE}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body,
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      });
      if (!res.ok) {
        lastError = new Error(`${model}: HTTP ${res.status}`);
        continue; // rate-limited or unavailable — try the next model
      }
      const data = await res.json();
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (text.trim()) return text.trim();
      lastError = new Error(`${model}: empty response`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('All Gemini models failed');
}

/**
 * Streamed generation — yields text chunks as Gemini produces them.
 * Same model fallback chain as generateText: if a model errors before
 * yielding anything, the next one is tried.
 */
export async function* generateTextStream(
  systemInstruction: string,
  userPrompt: string,
  options: GenOptions = {}
): AsyncGenerator<string> {
  if (!hasChatKey()) throw new Error('No chat API key set (GROQ_API_KEY or GEMINI_API_KEY)');

  let lastError: unknown;

  if (process.env.GROQ_API_KEY) {
    for (const model of GROQ_MODELS) {
      let res: Response;
      try {
        res = await groqRequest(model, systemInstruction, userPrompt, options, true);
      } catch (err) {
        lastError = err;
        continue;
      }
      if (!res.ok || !res.body) {
        lastError = new Error(`groq/${model}: HTTP ${res.status}`);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let yielded = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const json = line.slice(5).trim();
            if (!json || json === '[DONE]') continue;
            try {
              const text: string | undefined =
                JSON.parse(json)?.choices?.[0]?.delta?.content;
              if (text) {
                yielded = true;
                yield text;
              }
            } catch {
              // ignore malformed keep-alive chunks
            }
          }
        }
      } catch (err) {
        if (yielded) return; // partial output already sent — stop cleanly
        lastError = err;
        continue;
      }
      if (yielded) return;
      lastError = new Error(`groq/${model}: empty stream`);
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw lastError ?? new Error('All chat models failed');

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 1024,
    },
  });

  for (const model of CHAT_MODELS) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/models/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body,
        // Whole-generation ceiling; also keeps us inside free-tier function limits.
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      lastError = err;
      continue;
    }
    if (!res.ok || !res.body) {
      lastError = new Error(`${model}: HTTP ${res.status}`);
      continue;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let yielded = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            const text: string | undefined =
              JSON.parse(json)?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              yielded = true;
              yield text;
            }
          } catch {
            // ignore malformed keep-alive chunks
          }
        }
      }
    } catch (err) {
      // Mid-stream failure after partial output: stop here, caller keeps partial text.
      if (yielded) return;
      lastError = err;
      continue;
    }
    if (yielded) return;
    lastError = new Error(`${model}: empty stream`);
  }
  throw lastError ?? new Error('All Gemini models failed');
}

/** Ask for JSON and parse it, stripping markdown fences if the model adds them. */
export async function generateJson<T>(
  systemInstruction: string,
  userPrompt: string
): Promise<T> {
  const raw = await generateText(systemInstruction, userPrompt, { temperature: 0.2 });
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned) as T;
}

export async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(`${BASE}/models/${EMBEDDING_MODEL}:embedContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: EMBEDDING_DIM,
    }),
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Embedding failed: HTTP ${res.status}`);
  const data = await res.json();
  const values: number[] | undefined = data?.embedding?.values;
  if (!values?.length) throw new Error('Embedding response had no values');
  return values;
}
