// Small text/date helpers shared by the server (briefs) and the client (Pulse cards).

const KEEP = new Set(['always', 'sometimes', 'also', 'perhaps', 'previously', 'plus', 'thus']);

/** "loves" → "love", "watches" → "watch", "studies" → "study". */
function baseForm(verb: string): string {
  if (KEEP.has(verb.toLowerCase())) return verb;
  if (/(ch|sh|x|ss|zz|o)es$/i.test(verb)) return verb.slice(0, -2);
  if (/[^aeiou]ies$/i.test(verb)) return `${verb.slice(0, -3)}y`;
  if (/[^s]s$/i.test(verb)) return verb.slice(0, -1);
  return verb;
}

/** "User's sister is Ananya." → "Your sister is Ananya." (facts are stored in third person). */
export function secondPerson(fact: string): string {
  return fact
    .replace(/^User's\b/i, 'Your')
    .replace(/^User is\b/i, "You're")
    .replace(/^User has\b/i, 'You have')
    .replace(/^User was\b/i, 'You were')
    .replace(/^User does\b/i, 'You do')
    .replace(/^User (\p{L}+)(\s+)(\p{L}+)/iu, (all, first: string, gap: string, next: string) =>
      KEEP.has(first.toLowerCase()) ? `You ${first}${gap}${baseForm(next)}` : `You ${baseForm(first)}${gap}${next}`
    )
    .replace(/^User (\p{L}+)/iu, (_, verb: string) => `You ${baseForm(verb)}`)
    .replace(/\bUser's\b/g, 'your');
}

/** Days from `today` (YYYY-MM-DD) until the next `mmdd` (MM-DD), 0–365. Feb 29 falls back to Mar 1. */
export function daysUntil(mmdd: string, today: string): number | null {
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd);
  if (!m) return null;
  const start = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    let t = Date.UTC(y, Number(m[1]) - 1, Number(m[2]));
    if (new Date(t).getUTCMonth() !== Number(m[1]) - 1) t = Date.UTC(y, 2, 1); // Feb 29 in a non-leap year
    if (t >= start) return Math.round((t - start) / 86_400_000);
  }
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';

/**
 * "…birthday is on May 3" / "…born 3rd of May 1990" → "05-03". Only for birthday/anniversary
 * facts (so "may" the verb never counts) — the backstop when the model omits `date`.
 */
export function monthDayFrom(fact: string): string | null {
  if (!/\b(birthday|anniversary|born)\b/i.test(fact)) return null;
  const a = new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i').exec(fact);
  const b = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}`, 'i').exec(fact);
  const [mon, day] = a ? [a[1], a[2]] : b ? [b[2], b[1]] : [];
  if (!mon) return null;
  const month = MONTHS.indexOf(mon.toLowerCase()) + 1;
  const d = Number(day);
  if (month < 1 || d < 1 || d > 31) return null;
  return `${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function inDays(days: number): string {
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}

/** 820 → "820 ms", 1430 → "1.4 s" (null → "—"). */
export function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/** 0.437 → "44%" (null → "—"). */
export const formatPct = (v: number | null): string => (v === null ? '—' : `${Math.round(v * 100)}%`);
