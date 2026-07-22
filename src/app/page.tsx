import Link from 'next/link';
import {
  ArrowRight,
  BrainCircuit,
  Database,
  Download,
  Github,
  Layers,
  MessageSquareText,
  Mic,
  Moon,
  Rocket,
  ScanSearch,
  Sparkles,
  Volume2,
  Waypoints,
  Zap,
} from 'lucide-react';
import { NeuralCanvas } from '@/components/landing/neural-canvas';

const TIERS = [
  {
    icon: Zap,
    store: 'Redis',
    title: 'Tier 1 · Working memory',
    body: 'A rolling window of the live conversation kept in Redis. Instant recall on the hot path — no database round-trip while you chat.',
    accent: 'from-cyan-500/20 to-cyan-500/0 text-cyan-300',
  },
  {
    icon: Database,
    store: 'PostgreSQL',
    title: 'Tier 2 · Episodic memory',
    body: 'Every conversation is persisted, and SABA continuously extracts durable facts about you — your name, goals, preferences — into structured storage.',
    accent: 'from-violet-500/20 to-violet-500/0 text-violet-300',
  },
  {
    icon: Waypoints,
    store: 'Pinecone',
    title: 'Tier 3 · Semantic memory',
    body: 'Messages and facts are embedded with Gemini and indexed as vectors. SABA recalls relevant moments from any past conversation by meaning, not keywords.',
    accent: 'from-fuchsia-500/20 to-fuchsia-500/0 text-fuchsia-300',
  },
];

const PIPELINE = [
  {
    icon: BrainCircuit,
    title: 'Recall',
    body: 'All three tiers are queried in parallel before a single token is generated.',
  },
  {
    icon: MessageSquareText,
    title: 'Generate',
    body: 'Gemini streams the answer token by token, with your history, facts, and similar past moments in context.',
  },
  {
    icon: Layers,
    title: 'Remember',
    body: 'The exchange is persisted, embedded, and mined for new facts — asynchronously.',
  },
];

const FEATURES = [
  { icon: Zap, title: 'Streaming replies', body: 'Answers appear word by word, the moment generation starts.' },
  { icon: ScanSearch, title: 'Memory trace', body: 'Every reply shows exactly what was recalled from each tier.' },
  { icon: Rocket, title: 'Smart actions', body: '“Play it on Spotify”, “open the trailer”, “write a mail” — SABA opens the right app for you.' },
  { icon: Mic, title: 'Voice input', body: 'Talk instead of typing — right in the browser, no plugins.' },
  { icon: Volume2, title: 'Read aloud', body: 'Any reply can be spoken back to you with one click.' },
  { icon: Download, title: 'Export chats', body: 'Download any conversation as clean Markdown.' },
  { icon: Moon, title: 'Light & dark', body: 'A theme system that follows your OS — or your mood.' },
];

const STACK = ['Next.js 15', 'TypeScript', 'PostgreSQL', 'Redis', 'Pinecone', 'Gemini', 'Tailwind CSS'];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="aurora" />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
          <Sparkles className="h-5 w-5 text-violet-400" />
          <span className="text-gradient">SABA</span>
        </div>
        <nav className="flex items-center gap-3">
          <a
            href="https://github.com/BhagavanReddy07"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost !px-3"
            aria-label="GitHub"
          >
            <Github className="h-4 w-4" />
          </a>
          <Link href="/login" className="btn-ghost">
            Sign in
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-10 md:pt-20">
        <div className="grid-floor" aria-hidden />
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <p className="animate-fade-up mb-4 inline-flex items-center gap-2 rounded-full border border-edge bg-wash/[0.04] px-3 py-1 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-emerald-400" />
              3-tier memory · streams live
            </p>
            <h1
              className="animate-fade-up font-display text-4xl font-bold leading-tight tracking-tight md:text-6xl"
              style={{ animationDelay: '80ms' }}
            >
              An AI assistant that <span className="text-gradient">actually remembers</span> you
            </h1>
            <p
              className="animate-fade-up mt-5 max-w-xl text-lg text-slate-400"
              style={{ animationDelay: '160ms' }}
            >
              Most chatbots forget you the moment the tab closes. SABA layers working,
              episodic, and semantic memory — so every conversation builds on the last.
            </p>
            <div
              className="animate-fade-up mt-8 flex flex-wrap gap-3"
              style={{ animationDelay: '240ms' }}
            >
              <Link href="/login" className="btn-primary">
                Start chatting <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#memory" className="btn-ghost">
                How the memory works
              </a>
            </div>
            <div
              className="animate-fade-up mt-10 flex flex-wrap gap-x-8 gap-y-3"
              style={{ animationDelay: '320ms' }}
            >
              {[
                ['3', 'memory tiers'],
                ['∞', 'cross-chat recall'],
                ['$0', 'to run — all free tiers'],
              ].map(([stat, label]) => (
                <div key={label}>
                  <p className="font-display text-2xl font-bold text-slate-100">{stat}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div
            className="animate-fade-up relative h-[340px] md:h-[460px]"
            style={{ animationDelay: '200ms' }}
          >
            {/* Glow ring behind the globe */}
            <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/20 blur-[90px]" />
            <NeuralCanvas className="relative h-full w-full" />
          </div>
        </div>
      </section>

      {/* Memory tiers */}
      <section id="memory" className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Three tiers of memory, <span className="text-gradient">one brain</span>
        </h2>
        <p className="mt-3 max-w-2xl text-slate-400">
          Each tier lives in the storage engine built for its job — and every tier degrades
          gracefully, so the assistant keeps working even if a backend is offline.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div key={tier.title} className="tilt-scene">
              <div className="tilt-card glass-deep h-full rounded-2xl p-6">
                <div className="tilt-pop">
                  <div
                    className={`mb-4 inline-flex rounded-xl bg-gradient-to-br p-3 ${tier.accent}`}
                  >
                    <tier.icon className="h-6 w-6" />
                  </div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {tier.store}
                  </div>
                  <h3 className="font-display text-lg font-semibold">{tier.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{tier.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="glass-deep rounded-3xl p-8 md:p-12">
          <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Every message runs the loop:{' '}
            <span className="text-gradient">recall → generate → remember</span>
          </h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {PIPELINE.map((step, i) => (
              <div
                key={step.title}
                className="animate-float-slow"
                style={{ animationDelay: `${i * 600}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-wash/[0.06] p-2">
                    <step.icon className="h-5 w-5 text-violet-300" />
                  </div>
                  <span className="font-display font-semibold">
                    {i + 1}. {step.title}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Built like a product, <span className="text-gradient">not a demo</span>
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glass rounded-2xl p-5 transition hover:-translate-y-1 hover:bg-wash/[0.06] hover:shadow-xl hover:shadow-violet-900/20"
            >
              <f.icon className="h-5 w-5 text-violet-300" />
              <h3 className="mt-3 font-display text-sm font-semibold text-slate-100">
                {f.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 text-center">
        <div className="glass-deep relative overflow-hidden rounded-3xl px-8 py-14">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-600/25 blur-[100px]" />
          <h2 className="font-display text-3xl font-bold tracking-tight">
            Tell it once. <span className="text-gradient">It remembers forever.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">
            Create an account and introduce yourself — then start a brand-new conversation
            and ask what it remembers.
          </p>
          <Link href="/login" className="btn-primary mt-8">
            Try SABA free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Stack + footer */}
      <footer className="relative z-10 mx-auto max-w-6xl px-6 pb-12">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {STACK.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-edge bg-wash/[0.03] px-3 py-1 text-xs text-slate-400"
            >
              {tech}
            </span>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-slate-600">
          SABA — a personal AI assistant with context retention · Built by Bhagavan Reddy
        </p>
      </footer>
    </div>
  );
}
