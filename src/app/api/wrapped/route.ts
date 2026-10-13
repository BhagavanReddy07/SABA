import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { wrappedStats } from '@/server/db';
import { generateJson, hasChatKey } from '@/server/llm';
import { tokens } from '@/server/memory';
import { handle, limit } from '@/server/http';
import type { Wrapped } from '@/lib/types';

// Words chat titles are full of that never make a topic on their own.
const FILLER = new Set('ideas idea planning plan help tips tip question questions chat conversation summary new recap overview guide advice info details quick'.split(' '));

/** Most frequent meaningful words across conversation titles — the no-LLM fallback for topics. */
function keywordTopics(titles: string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of titles) for (const w of tokens(t)) if (!FILLER.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w[0].toUpperCase() + w.slice(1));
}

/** SABA Wrapped: a month or year in numbers (plus up to five topics, named by the LLM when available). */
export const GET = handle(async (request: NextRequest) => {
  const user = await requireUser();
  await limit(`wrapped:${user.id}`, 20, 3600);
  const period = request.nextUrl.searchParams.get('period') === 'year' ? 'year' : 'month';
  const now = new Date();
  const since = new Date(period === 'year' ? Date.UTC(now.getUTCFullYear(), 0, 1) : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let timezone = 'UTC';
  try {
    if (user.timezone) {
      new Intl.DateTimeFormat('en-US', { timeZone: user.timezone });
      timezone = user.timezone;
    }
  } catch {
    // keep UTC
  }

  const { titles, ...stats } = await wrappedStats(user.id, since.toISOString(), timezone);
  let topics = keywordTopics(titles);
  if (hasChatKey() && titles.length >= 3) {
    try {
      const out = await generateJson<{ topics?: unknown }>(
        'Group these chat titles into at most 5 short topics (1–3 words each, Title Case, each starting with one fitting emoji). Return JSON: {"topics": ["🏃 Running", "..."]}',
        titles.join('\n')
      );
      if (Array.isArray(out.topics)) {
        topics = out.topics.filter((t): t is string => typeof t === 'string' && t.length <= 40).slice(0, 5);
      }
    } catch {
      // keyword topics stand
    }
  }

  const wrapped: Wrapped = { period, since: since.toISOString(), topics, ...stats };
  return NextResponse.json({ wrapped });
});
