// Live information for the `lookup` tool. Keyless free APIs (Open-Meteo, Wikipedia, Frankfurter)
// plus optional web search (TAVILY_API_KEY or BRAVE_API_KEY). Every result is short plain text
// the model can quote; every failure is a readable sentence, never a throw.

import { evaluate, formatNumber } from './calc';

const UA = { 'User-Agent': 'SABA/1.0 (personal assistant; https://github.com/BhagavanReddy07/SABA)' };

async function getJson(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { ...init, headers: { ...UA, ...init.headers }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const hasWebSearch = (): boolean => Boolean(process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY);

// WMO weather interpretation codes (Open-Meteo).
const WMO: Record<number, string> = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'light showers', 81: 'showers',
  82: 'violent showers', 85: 'snow showers', 86: 'heavy snow showers', 95: 'thunderstorm',
  96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail',
};

export async function weather(place: string): Promise<string> {
  const geo = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`
  );
  const loc = geo?.results?.[0];
  if (!loc) return `No place called "${place}" was found.`;
  const f = await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3'
  );
  const name = [loc.name, loc.admin1, loc.country].filter(Boolean).join(', ');
  const c = f.current;
  const days = (f.daily?.time ?? []).map(
    (day: string, i: number) =>
      `${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : day}: ${WMO[f.daily.weather_code[i]] ?? 'mixed'}, ` +
      `${Math.round(f.daily.temperature_2m_min[i])}–${Math.round(f.daily.temperature_2m_max[i])}°C, ` +
      `rain chance ${f.daily.precipitation_probability_max[i] ?? 0}%`
  );
  return `${name} (local time ${c.time.replace('T', ' ')}): now ${Math.round(c.temperature_2m)}°C, ${WMO[c.weather_code] ?? 'mixed'}, humidity ${c.relative_humidity_2m}%, wind ${Math.round(c.wind_speed_10m)} km/h.\n${days.join('\n')}\nSource: Open-Meteo.`;
}

export async function wikipedia(query: string): Promise<string> {
  const search = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`
  );
  const title: string | undefined = search?.query?.search?.[0]?.title;
  if (!title) return `Wikipedia has no article matching "${query}".`;
  const page = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
  const url = page?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  return `${page?.title ?? title}: ${(page?.extract ?? '').slice(0, 1500)}\nSource: ${url}`;
}

export async function currency(amount: number, from: string, to: string): Promise<string> {
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(f) || !/^[A-Z]{3}$/.test(t)) return 'Currencies must be 3-letter codes like USD, INR, EUR.';
  const data = await getJson(`https://api.frankfurter.dev/v1/latest?amount=${amount}&from=${f}&to=${t}`).catch(() => null);
  const value = data?.rates?.[t];
  if (typeof value !== 'number') return `No exchange rate available for ${f} → ${t}.`;
  return `${formatNumber(amount)} ${f} = ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${t} (European Central Bank rate, ${data.date}). Source: Frankfurter.`;
}

export function math(expression: string): string {
  try {
    return `${expression} = ${formatNumber(evaluate(expression))}`;
  } catch (err) {
    return `Could not evaluate: ${(err as Error).message}`;
  }
}

const DAY = 86_400_000;
const parseDate = (s: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
};
const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** Weekday of `date`; plus `days` added; or the difference to `date2`. Dates are YYYY-MM-DD. */
export function dateMath(date: string, date2?: string, days?: number): string {
  const a = parseDate(date);
  if (a === null) return 'Dates must be YYYY-MM-DD.';
  const parts = [`${date} is a ${fmtDate(a).split(',')[0]}.`];
  if (typeof days === 'number' && Number.isFinite(days)) {
    const r = a + Math.round(days) * DAY;
    parts.push(`${date} ${days >= 0 ? '+' : '−'} ${Math.abs(Math.round(days))} days = ${new Date(r).toISOString().slice(0, 10)} (${fmtDate(r)}).`);
  }
  if (date2) {
    const b = parseDate(date2);
    if (b === null) return 'Dates must be YYYY-MM-DD.';
    const diff = Math.round((b - a) / DAY);
    parts.push(`From ${date} to ${date2} is ${diff} day${Math.abs(diff) === 1 ? '' : 's'} (${(diff / 7).toFixed(1)} weeks).`);
  }
  return parts.join(' ');
}

export async function webSearch(query: string): Promise<string> {
  type Hit = { title: string; url: string; snippet: string };
  let hits: Hit[] = [];
  if (process.env.TAVILY_API_KEY) {
    const data = await getJson('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
      body: JSON.stringify({ query, max_results: 5, search_depth: 'basic' }),
    });
    hits = (data?.results ?? []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content }));
  } else if (process.env.BRAVE_API_KEY) {
    const data = await getJson(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY },
    });
    hits = (data?.web?.results ?? []).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: String(r.description ?? '').replace(/<[^>]+>/g, ''),
    }));
  } else {
    return 'Web search is not configured. Answer from your own knowledge, or offer to open a Google search.';
  }
  if (!hits.length) return `No web results for "${query}".`;
  return hits
    .slice(0, 5)
    .map((h, i) => `${i + 1}. ${h.title} — ${String(h.snippet).slice(0, 300)}\n   ${h.url}`)
    .join('\n');
}
