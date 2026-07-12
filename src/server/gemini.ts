// Minimal Gemini REST client — chat generation + embeddings.
// No SDK: two endpoints and a fallback chain don't justify a dependency.

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Tried in order; flash-lite first for latency, falling back to fuller models
// if it's rate-limited or unavailable.
const CHAT_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];

// A hung request shouldn't block the whole fallback chain — fail fast and try the next model.
const CHAT_TIMEOUT_MS = 12_000;
const EMBED_TIMEOUT_MS = 8_000;

export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIM = 768;

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function generateText(
  systemInstruction: string,
  userPrompt: string,
  options: { temperature?: number; maxOutputTokens?: number } = {}
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 1024,
    },
  });

  let lastError: unknown;
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
