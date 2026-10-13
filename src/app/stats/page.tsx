import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, Sparkles } from 'lucide-react';
import { getStats, type Stats } from '@/server/db';
import { BarList, FirstTokenTrend, TurnsPerDay } from '@/components/stats/charts';
import { formatMs, formatPct as pct } from '@/lib/format';

// Public, aggregate-only observability (no user ids, no content): how fast SABA answers,
// how often long-term memory helps, which models serve replies.

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Under the hood — SABA',
  description: 'Live latency, memory-recall and model stats for SABA.',
};


function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="glass-deep rounded-2xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
      {detail && <p className="mt-0.5 text-[11px] text-slate-500">{detail}</p>}
    </div>
  );
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = (await searchParams).days === '30' ? 30 : 7;
  let stats: Stats | null = null;
  try {
    stats = await getStats(days);
  } catch (err) {
    console.error('[stats]', err);
  }

  return (
    <div className="relative min-h-screen">
      <div className="aurora" />
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <Sparkles className="h-5 w-5 text-violet-400" />
          <span className="text-gradient">SABA</span>
        </Link>
        <Link href="/login" className="btn-ghost !px-4 !py-2 text-xs">
          Try SABA
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-20">
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight">
          <Activity className="h-6 w-6 text-violet-300" /> Under the <span className="text-gradient">hood</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Live numbers from every chat turn: how fast replies start, how often long-term memory contributes, and which
          model answered. Aggregates only — no conversations or user data are recorded here.
        </p>

        {/* One filter row, scoping everything below it. */}
        <nav className="mt-6 flex gap-2 text-xs" aria-label="Time range">
          {[7, 30].map((d) => (
            <Link
              key={d}
              href={`/stats?days=${d}`}
              aria-current={d === days ? 'page' : undefined}
              className={`rounded-full border px-3 py-1.5 transition ${
                d === days ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-edge text-slate-400 hover:text-slate-200'
              }`}
            >
              Last {d} days
            </Link>
          ))}
        </nav>

        {!stats ? (
          <p className="mt-10 text-sm text-slate-400">Stats are unavailable right now.</p>
        ) : stats.turns === 0 ? (
          <p className="mt-10 text-sm text-slate-400">No chat turns recorded in the last {days} days yet.</p>
        ) : (
          <>
            <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Key numbers">
              <Tile label="Chat turns" value={stats.turns.toLocaleString('en-US')} detail={`last ${days} days`} />
              <Tile label="First token (median)" value={formatMs(stats.p50FirstToken)} detail={`p95 ${formatMs(stats.p95FirstToken)}`} />
              <Tile label="Full reply (median)" value={formatMs(stats.p50Total)} />
              <Tile label="Used long-term recall" value={pct(stats.semanticRate)} detail="replies with Tier 3 hits" />
              <Tile label="Used a tool" value={pct(stats.toolRate)} detail="reminders, lookups, memory…" />
              <Tile label="Model fallbacks" value={pct(stats.fallbackRate)} detail={`errors ${pct(stats.errorRate)}`} />
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              <TurnsPerDay daily={stats.daily} />
              <FirstTokenTrend daily={stats.daily} />
              <BarList
                title="Recall latency by memory tier"
                caption="Median time each tier takes before generation starts (they run in parallel)"
                rows={[
                  { label: 'Tier 1 · Working (Redis)', value: stats.p50Tier.t1 },
                  { label: 'Tier 2 · Episodic (Postgres)', value: stats.p50Tier.t2 },
                  { label: 'Tier 3 · Semantic (vectors)', value: stats.p50Tier.t3 },
                ]}
                unit="ms"
              />
              <BarList
                title="Which model answered"
                caption="Share of replies per model in the fallback chain"
                rows={stats.models.map((m) => ({ label: m.model.replace(/^(groq|gemini|ollama)\//, ''), value: m.turns / stats!.turns }))}
                unit="pct"
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
