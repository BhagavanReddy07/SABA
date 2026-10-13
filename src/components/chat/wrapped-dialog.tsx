'use client';

import { useEffect, useState, useRef } from 'react';
import { Check, Download, Loader2, RefreshCcw, Share2, Sparkles, X } from 'lucide-react';
import type { Wrapped } from '@/lib/types';
import { secondPerson } from '@/lib/format';

type Props = { open: boolean; onClose: () => void; userName: string };

const PERIODS = [
  ['month', 'This month'],
  ['year', 'This year'],
] as const;

const LABEL = 'text-[11px] font-bold uppercase tracking-[0.25em] text-white/80';

/** "1 day" / "2 days", "memory" → "memories". */
const plural = (n: number, word: string) => (n === 1 ? word : `${word.replace(/([^aeiou])y$/, '$1ie')}s`);

/** What the card says: shared by the on-screen poster, the PNG and the copied summary. */
function describe(w: Wrapped, userName: string) {
  const first = userName.trim().split(/\s+/)[0];
  // `since` is the period's start in UTC; read in local time it can land in the previous month.
  const periodLabel = new Date(w.since).toLocaleDateString(undefined, {
    month: w.period === 'month' ? 'long' : undefined,
    year: 'numeric',
    timeZone: 'UTC',
  });
  const byCategory = Object.entries(w.memoriesByCategory)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, n]) => `${n}\u00a0${plural(n, category)}`) // no-break space: never wrap "5 / goals"
    .join(' · ');
  const hour = w.busiestHour;
  return {
    periodLabel,
    headline: first ? `${first}’s ${periodLabel}` : `Your ${periodLabel}`,
    // Messages always shows; the rest only when there's something to show off.
    tiles: [
      { n: w.messages, label: `${plural(w.messages, 'message')} sent`, hint: `across ${w.conversations} ${plural(w.conversations, 'chat')}` },
      { n: w.activeDays, label: `active ${plural(w.activeDays, 'day')}` },
      { n: w.memoriesLearned, label: `${plural(w.memoriesLearned, 'memory')} learned`, hint: byCategory },
      { n: w.remindersDone, label: `${plural(w.remindersDone, 'reminder')} done` },
      { n: w.goalLogs, label: `goal ${plural(w.goalLogs, 'check-in')}` },
      { n: w.documents, label: `${plural(w.documents, 'document')} added` },
    ]
      .filter((t, i) => i === 0 || t.n > 0)
      .map(({ n, ...t }) => ({ ...t, value: n.toLocaleString() })),
    topics: w.topics,
    busiest: [w.busiestDay && `${w.busiestDay}s`, hour !== null && `around ${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`]
      .filter(Boolean)
      .join(' '),
    memory: w.mostUsedMemory && secondPerson(w.mostUsedMemory),
  };
}

type View = ReturnType<typeof describe>;

// --- PNG (vanilla canvas, system fonts) ---

const W = 1080;
const H = 1350;
const PAD = 80;
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DIM = 'rgba(255, 255, 255, 0.75)';

type TextStyle = { size: number; weight?: number; color?: string; italic?: boolean; spacing?: number; lh?: number };

/** Greedy word wrap on plain spaces (no-break spaces hold); past `max` lines it cuts with an ellipsis. */
function wrap(ctx: CanvasRenderingContext2D, s: string, width: number, max: number): string[] {
  const lines: string[] = [];
  for (const word of s.split(/ +/).filter(Boolean)) {
    const joined = lines.length ? `${lines[lines.length - 1]} ${word}` : '';
    if (joined && ctx.measureText(joined).width <= width) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  // A cut-off quote still gets its closing mark.
  if (lines.length > max) lines.splice(max - 1, Infinity, `${lines[max - 1]}…${s.endsWith('”') ? '”' : ''}`);
  return lines;
}

/**
 * Draws wrapped text with its top at `y` and returns the y below it. fillText's maxWidth squeezes
 * whatever is still too wide (one giant word, the ellipsis) instead of letting it run off the card.
 */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, width: number, st: TextStyle, max = 1): number {
  ctx.font = `${st.italic ? 'italic ' : ''}${st.weight ?? 400} ${st.size}px ${SANS}`;
  ctx.fillStyle = st.color ?? '#fff';
  ctx.letterSpacing = `${st.spacing ?? 0}px`;
  for (const line of wrap(ctx, s, width, max)) {
    ctx.fillText(line, x, y, width);
    y += st.size * (st.lh ?? 1.25);
  }
  return y;
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * The card as a 1080×1350 PNG (4:5 feed post). Content is laid out on a scratch canvas first so it
 * can be centred on the poster, and shrunk when a long month doesn't fit.
 */
async function renderPng(v: View): Promise<Blob> {
  const scratch = document.createElement('canvas');
  scratch.width = W;
  scratch.height = H * 1.5; // worst case (6 tiles, 5 topics, 3-line quote) is ~1450
  const c = scratch.getContext('2d')!;
  c.textBaseline = 'top';
  const inner = W - PAD * 2;
  const heading: TextStyle = { size: 24, weight: 700, color: DIM, spacing: 5 };

  let y = text(c, 'SABA WRAPPED', PAD, 0, inner, { ...heading, size: 28, spacing: 8 });
  y = text(c, v.headline, PAD, y + 18, inner, { size: 80, weight: 800, lh: 1.1 }, 2) + 44;

  const tw = (inner - 40) / 3; // three tiles a row, 20px gutters
  v.tiles.forEach((t, i) => {
    const x = PAD + (i % 3) * (tw + 20);
    const top = y + Math.floor(i / 3) * 230;
    c.beginPath();
    c.roundRect(x, top, tw, 210, 28);
    c.fillStyle = 'rgba(255, 255, 255, 0.1)';
    c.fill();
    c.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    c.lineWidth = 2;
    c.stroke();
    const below = text(c, t.value, x + 28, top + 28, tw - 56, { size: 64, weight: 800, lh: 1.1 });
    const after = text(c, t.label, x + 28, below + 4, tw - 56, { size: 24, weight: 600 });
    if (t.hint) text(c, t.hint, x + 28, after + 6, tw - 56, { size: 20, color: DIM, lh: 1.3 }, 2);
  });
  y += Math.ceil(v.tiles.length / 3) * 230 - 20;

  if (v.topics.length) {
    y = text(c, 'YOUR TOP TOPICS', PAD, y + 52, inner, heading) + 14;
    v.topics.forEach((topic, i) => {
      text(c, String(i + 1), PAD, y, 48, { size: 34, weight: 800, color: '#f5d0fe' });
      y = text(c, topic, PAD + 56, y, inner - 56, { size: 34, weight: 600, lh: 1.45 });
    });
  }
  if (v.busiest) {
    y = text(c, 'BUSIEST', PAD, y + 40, inner, heading) + 10;
    y = text(c, v.busiest, PAD, y, inner, { size: 36, weight: 700 });
  }
  if (v.memory) {
    y = text(c, 'SABA USES THIS THE MOST', PAD, y + 40, inner, heading) + 10;
    y = text(c, `“${v.memory}”`, PAD, y, inner, { size: 38, weight: 600, italic: true, lh: 1.3 }, 3);
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#6d28d9'); // violet-700
  bg.addColorStop(0.5, '#a21caf'); // fuchsia-700
  bg.addColorStop(1, '#1e1b4b'); // indigo-950
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  glow(ctx, W * 0.92, H * 0.06, 560, '244, 114, 182', 0.45);
  glow(ctx, W * 0.06, H * 0.96, 640, '34, 211, 238', 0.28);
  const scale = Math.min(1, (H - PAD * 2) / y);
  ctx.drawImage(scratch, 0, 0, W, y, (W - W * scale) / 2, (H - y * scale) / 2, W * scale, y * scale);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), 'image/png')
  );
}

/** SABA Wrapped: the month or year in numbers, as a poster to download or share. */
export function WrappedDialog({ open, onClose, userName }: Props) {
  const [period, setPeriod] = useState<Wrapped['period']>('month');
  const [data, setData] = useState<Wrapped | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // bumped by "Try again" to re-run the fetch
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Per-period cache for this session — toggling month/year doesn't re-spend the 20/hour budget.
  const cache = useRef(new Map<Wrapped['period'], Wrapped>());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let stale = false; // a newer open/period/retry supersedes this response
    setError(null);
    const cached = cache.current.get(period);
    setData(cached ?? null);
    if (cached) return;
    (async () => {
      try {
        const res = await fetch(`/api/wrapped?period=${period}`);
        const body = await res.json().catch(() => ({}));
        if (stale) return;
        if (res.ok && body.wrapped) {
          cache.current.set(period, body.wrapped);
          setData(body.wrapped);
        }
        else
          setError(
            res.status === 429
              ? "You've opened Wrapped a lot this hour. Try again in a bit."
              : (body.error ?? 'Could not load your Wrapped')
          );
      } catch {
        if (!stale) setError('Could not reach the server');
      }
    })();
    return () => {
      stale = true;
    };
  }, [open, period, attempt]);

  // Render the PNG up front: Safari only lets navigator.share run during the tap itself, so awaiting
  // toBlob inside the click handler would get the share rejected.
  useEffect(() => {
    setFile(null);
    if (!data?.messages) return;
    let stale = false;
    renderPng(describe(data, userName))
      .then((blob) => !stale && setFile(new File([blob], `saba-wrapped-${data.period}.png`, { type: 'image/png' })))
      .catch(() => {}); // no image: Download stays disabled, Share still copies the text summary
    return () => {
      stale = true;
    };
  }, [data, userName]);

  if (!open) return null;

  const view = data?.messages ? describe(data, userName) : null;

  const flash = (message: string) => {
    setNote(message);
    setTimeout(() => setNote(null), 2000);
  };

  const download = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const share = async () => {
    if (!view) return;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My SABA Wrapped' });
        return;
      }
      await navigator.clipboard.writeText(
        [
          `My SABA Wrapped: ${view.periodLabel}`,
          view.tiles.map((t) => `${t.value} ${t.label}`).join(' · '),
          view.topics.length ? `Top topics: ${view.topics.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      );
      flash('Copied!');
    } catch (err) {
      // Dismissing the share sheet rejects with AbortError; that's not a failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) flash('Could not share');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="wrapped-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="animate-fade-up glass-deep relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-surface/95 p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="wrapped-title" className="flex items-center gap-2 font-display text-base font-bold text-slate-100">
            <Sparkles className="h-4 w-4 text-violet-400" /> SABA Wrapped
          </h2>
          <button onClick={onClose} className="btn-icon" aria-label="Close Wrapped" autoFocus>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-xl border border-edge bg-wash/[0.03] p-1" role="group" aria-label="Period">
          {PERIODS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={period === key}
              onClick={() => setPeriod(key)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                period === key ? 'bg-wash/[0.08] text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p role="alert" className="text-sm text-slate-300">
                {error}
              </p>
              <button onClick={() => setAttempt((n) => n + 1)} className="btn-ghost !px-3 !py-2 text-xs">
                <RefreshCcw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          ) : !data ? (
            <div role="status" className="flex flex-col items-center gap-3 py-20 text-xs text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              Wrapping up your {period}…
            </div>
          ) : (
            // Fixed colours (raw white alphas, not theme tokens) on purpose: the card stands in for the
            // shared image, so it looks the same in light and dark mode.
            <div className="animate-fade-up relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-fuchsia-700 to-indigo-950 p-6 text-white">
              <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-pink-400/40 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-cyan-400/25 blur-3xl" aria-hidden />
              <div className="relative">
                <p className={LABEL}>SABA Wrapped</p>
                {view ? (
                  <>
                    <h3 className="mt-2 break-words font-display text-3xl font-bold leading-tight">{view.headline}</h3>
                    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {view.tiles.map((t) => (
                        <div key={t.label} className="rounded-2xl border border-white/15 bg-white/10 p-3">
                          <p className="font-display text-3xl font-bold leading-none">{t.value}</p>
                          <p className="mt-1.5 text-xs font-semibold">{t.label}</p>
                          {t.hint && <p className="mt-1 text-[10px] leading-snug text-white/75">{t.hint}</p>}
                        </div>
                      ))}
                    </div>
                    {view.topics.length > 0 && (
                      <section className="mt-6">
                        <h4 className={LABEL}>Your top topics</h4>
                        <ol className="mt-2 space-y-1.5">
                          {view.topics.map((topic, i) => (
                            <li key={i} className="flex gap-3 text-sm font-semibold">
                              <span className="w-3 shrink-0 font-display font-bold text-fuchsia-200">{i + 1}</span>
                              {topic}
                            </li>
                          ))}
                        </ol>
                      </section>
                    )}
                    {view.busiest && (
                      <section className="mt-5">
                        <h4 className={LABEL}>Busiest</h4>
                        <p className="mt-1 font-display text-lg font-bold">{view.busiest}</p>
                      </section>
                    )}
                    {view.memory && (
                      <section className="mt-5">
                        <h4 className={LABEL}>SABA uses this the most</h4>
                        <blockquote className="mt-1 break-words text-base font-medium italic leading-snug">
                          “{view.memory}”
                        </blockquote>
                      </section>
                    )}
                  </>
                ) : (
                  <>
                    <h3 className="mt-2 font-display text-2xl font-bold">Nothing to wrap yet</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/80">
                      No chats {data.period === 'year' ? 'this year' : 'this month'} so far. Talk to SABA and your
                      recap will fill itself in.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {view && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button onClick={download} disabled={!file} className="btn-ghost flex-1 !px-3">
              <Download className="h-4 w-4" /> Download image
            </button>
            <button onClick={share} className="btn-primary flex-1 !px-3">
              {note === 'Copied!' ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              <span aria-live="polite">{note ?? 'Share'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
