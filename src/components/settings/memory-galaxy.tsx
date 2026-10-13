'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, RotateCw, Trash2, X } from 'lucide-react';
import { fibonacciSphere, fitCanvas, projector, type Point3 } from '@/components/landing/neural-canvas';

// Canvas colours ("r g b") and their Tailwind twins: the Memory dialog's category palette.
const CATEGORY = {
  fact: { rgb: '34 211 238', dot: 'bg-cyan-400', chip: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' },
  preference: { rgb: '167 139 250', dot: 'bg-violet-400', chip: 'bg-violet-500/10 text-violet-300 border-violet-500/20' },
  goal: { rgb: '52 211 153', dot: 'bg-emerald-400', chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
};
const ENTITY_DOT = 'bg-wash/90 ring-2 ring-wash/20';
const TAU = Math.PI * 2;

type Fact = {
  id: string;
  kind: 'fact';
  label: string;
  category: keyof typeof CATEGORY;
  importance: number;
  useCount: number;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
};
/** A person or place mentioned by facts; ids start with "e:". */
type Entity = { id: string; kind: 'entity'; label: string };
type Link = { a: string; b: string; weight: number };
/** A node plus its fixed spot on the unit sphere. */
type GalaxyNode = (Fact | Entity) & Point3;
type Graph = { nodes: GalaxyNode[]; links: Link[]; semantic: boolean };
type Projected = { n: GalaxyNode; sx: number; sy: number; depth: number; front: number; r: number };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Jump to the conversation (and message, when known) where a fact was learned. */
  onOpenSource: (conversationId: string, messageId: string | null) => void;
  /** Permanently forget a fact (the parent calls the API and updates its own state). */
  onForget: (id: string) => Promise<void> | void;
};

const dotClass = (n: Fact | Entity) => (n.kind === 'fact' ? CATEGORY[n.category].dot : ENTITY_DOT);

// Importance 1–10 → 2.5–7px, plus a little for facts SABA keeps recalling; hubs are the biggest.
const radius = (n: Fact | Entity) =>
  n.kind === 'entity' ? 8 : 2.5 + (Math.min(Math.max(n.importance, 1), 10) - 1) * 0.5 + Math.min(n.useCount, 10) * 0.15;

// Walks the links breadth-first, each node taking the free lattice point nearest the node that led
// to it, so a person/place, its facts and related facts end up side by side on the sphere.
// ponytail: O(n²) nearest-point scan, fine for the API's 250-fact cap; a force layout if that grows.
function layout(nodes: (Fact | Entity)[], links: Link[]): GalaxyNode[] {
  const points = fibonacciSphere(nodes.length);
  const free = new Set(points.keys());
  const near = new Map<string, string[]>();
  for (const { a, b } of links) {
    near.set(a, [...(near.get(a) ?? []), b]);
    near.set(b, [...(near.get(b) ?? []), a]);
  }
  const at = new Map<string, Point3>();
  const claim = (id: string, from?: Point3) => {
    let best = -1;
    let bestDist = Infinity;
    for (const i of free) {
      const p = points[i];
      // No neighbour to sit next to: take the top-most free point.
      const d = from ? (p.x - from.x) ** 2 + (p.y - from.y) ** 2 + (p.z - from.z) ** 2 : i;
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    }
    free.delete(best);
    at.set(id, points[best]);
  };
  // People/places go first, each seeding its own cluster from evenly spread anchors; any fact
  // still unplaced after that (index past the anchors) starts from the top-most free point.
  const entities = nodes.filter((n) => n.kind === 'entity');
  const anchors = fibonacciSphere(entities.length);
  for (const [k, root] of [...entities, ...nodes.filter((n) => n.kind === 'fact')].entries()) {
    if (at.has(root.id)) continue;
    claim(root.id, anchors[k]);
    const queue = [root.id];
    for (let i = 0; i < queue.length; i++) {
      for (const next of near.get(queue[i]) ?? []) {
        if (at.has(next)) continue;
        claim(next, at.get(queue[i]));
        queue.push(next);
      }
    }
  }
  return nodes.map((n) => ({ ...n, ...at.get(n.id)! }));
}

/** SABA Galaxy: long-term memory as a rotating 3D graph, with a list twin for keyboards and screen readers. */
export function MemoryGalaxy({ open, onClose, onOpenSource, onForget }: Props) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forgetStep, setForgetStep] = useState<'confirm' | 'busy' | 'failed' | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The draw loop runs outside React renders; it reads the latest graph and selection from here.
  const view = useRef({ graph, selectedId });
  useEffect(() => {
    view.current = { graph, selectedId };
  });

  // A fresh graph every time the dialog opens (or on retry); `live` drops a stale response.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setGraph(null);
    setError(false);
    setSelectedId(null);
    fetch('/api/memories/graph')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((g: { nodes: (Fact | Entity)[]; links: Link[]; semantic: boolean }) => {
        if (live) setGraph({ ...g, nodes: layout(g.nodes, g.links) });
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [open, attempt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus moves into the dialog, and back to whatever opened it on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus();
  }, [open]);

  useEffect(() => {
    setForgetStep(null);
  }, [selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const tip = tipRef.current;
    if (!open || !canvas || !ctx || !tip) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The theme's white/black, so hubs and highlights flip with light mode.
    const wash = getComputedStyle(canvas).getPropertyValue('--wash').trim() || '255 255 255';
    let width = 0;
    let height = 0;
    const observer = new ResizeObserver(() => {
      ({ width, height } = fitCanvas(canvas, ctx));
    });
    observer.observe(canvas);

    let yaw = 0;
    let pitch = 0.35;
    let aim: { yaw: number; pitch: number } | null = null;
    let aimedAt: string | null = null;
    let hoverId: string | null = null;
    let drag: { x: number; y: number; moved: boolean } | null = null;
    let frame: Projected[] = [];
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, width, height);
      const { graph, selectedId } = view.current;
      if (!graph) return;

      // Turn a newly selected node to face the viewer; dragging cancels the turn.
      if (selectedId !== aimedAt) {
        aimedAt = selectedId;
        const n = graph.nodes.find((m) => m.id === selectedId);
        aim = n ? { yaw: Math.atan2(n.x, -n.z), pitch: Math.atan2(-n.y, Math.hypot(n.x, n.z)) } : null;
      }
      if (aim) {
        const ease = reduced ? 1 : 0.08;
        const turn = aim.yaw - yaw;
        yaw += (turn - TAU * Math.round(turn / TAU)) * ease; // the short way round
        pitch += (aim.pitch - pitch) * ease;
      } else if (!reduced && !drag && !hoverId && !selectedId) {
        yaw += 0.0022; // the landing globe's pace; holds still while you point at something
      }

      const project = projector(yaw, pitch, width / 2, height / 2, Math.min(width, height) * 0.38);
      frame = graph.nodes
        .map((n) => {
          const p = project(n);
          const front = (1 - p.depth) / 2; // 1 = nearest the viewer
          return { ...p, n, front, r: radius(n) * (0.8 + 0.4 * front) };
        })
        .sort((p, q) => q.depth - p.depth); // far side first, so nearer nodes paint over it
      const at = new Map(frame.map((p) => [p.n.id, p] as const));
      const lit = (id: string) => id === hoverId || id === selectedId;

      for (const l of graph.links) {
        const a = at.get(l.a);
        const b = at.get(l.b);
        if (!a || !b) continue;
        const hot = lit(l.a) || lit(l.b);
        ctx.strokeStyle = hot
          ? `rgb(${wash} / 0.8)`
          : `rgb(129 140 248 / ${(0.08 + l.weight * 0.32) * Math.max(0.15, (a.front + b.front) / 2)})`;
        ctx.lineWidth = hot ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }

      for (const p of frame) {
        const alpha = 0.3 + p.front * 0.7;
        ctx.fillStyle = p.n.kind === 'entity' ? `rgb(${wash} / ${alpha * 0.85})` : `rgb(${CATEGORY[p.n.category].rgb} / ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, p.r, 0, TAU);
        ctx.fill();
        // People/places wear a faint ring; the hovered/selected node a bright one.
        const on = lit(p.n.id);
        if (on || p.n.kind === 'entity') {
          ctx.strokeStyle = `rgb(${wash} / ${on ? 0.9 : alpha * 0.35})`;
          ctx.lineWidth = on ? 1.5 : 1;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, p.r + (on ? 4 : 3), 0, TAU);
          ctx.stroke();
        }
      }

      const hovered = hoverId && at.get(hoverId);
      if (hovered) {
        // Keep the label inside the canvas: clamp sideways, sit below nodes in the top half.
        const x = Math.min(Math.max(hovered.sx, 128), width - 128);
        const below = hovered.sy < height / 2;
        tip.style.transform = `translate(${x}px, ${hovered.sy}px) translate(-50%, ${below ? '14px' : 'calc(-100% - 14px)'})`;
      }
    };

    // Nearest node within its radius + 6px.
    const pick = (e: PointerEvent) => {
      let best: Projected | null = null;
      let bestDist = Infinity;
      for (const p of frame) {
        const d = Math.hypot(p.sx - e.offsetX, p.sy - e.offsetY);
        if (d <= p.r + 6 && d < bestDist) {
          best = p;
          bestDist = d;
        }
      }
      return best;
    };
    const hover = (p: Projected | null) => {
      if (p && p.n.id !== hoverId) tip.textContent = p.n.label.length > 90 ? `${p.n.label.slice(0, 89)}…` : p.n.label;
      hoverId = p?.n.id ?? null;
      tip.hidden = !p;
      canvas.style.cursor = p ? 'pointer' : 'grab';
    };

    const listeners = new AbortController();
    const opts = { signal: listeners.signal };
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, moved: false };
        canvas.setPointerCapture(e.pointerId);
      },
      opts
    );
    canvas.addEventListener(
      'pointermove',
      (e) => {
        if (!drag) {
          hover(pick(e));
          return;
        }
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return; // still a click
        drag = { x: e.clientX, y: e.clientY, moved: true };
        aim = null;
        hover(null);
        canvas.style.cursor = 'grabbing';
        yaw -= dx * 0.006;
        pitch = Math.min(1.4, Math.max(-1.4, pitch + dy * 0.006));
      },
      opts
    );
    canvas.addEventListener(
      'pointerup',
      (e) => {
        const click = drag && !drag.moved;
        if (click) setSelectedId(pick(e)?.n.id ?? null);
        drag = null;
        // A click hands the label over to the side card (the node turns away); touch has no hover.
        hover(click || e.pointerType === 'touch' ? null : pick(e));
      },
      opts
    );
    canvas.addEventListener(
      'pointercancel',
      () => {
        drag = null;
      },
      opts
    );
    canvas.addEventListener('pointerleave', () => hover(null), opts);

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      listeners.abort();
    };
  }, [open]);

  if (!open) return null;

  const nodes = graph?.nodes ?? [];
  const links = graph?.links ?? [];
  const selected = nodes.find((n) => n.id === selectedId);
  const linked =
    selected?.kind === 'entity'
      ? nodes.filter((n) => links.some((l) => (l.a === selected.id && l.b === n.id) || (l.b === selected.id && l.a === n.id)))
      : [];

  const forget = async (id: string) => {
    setForgetStep('busy');
    try {
      await onForget(id);
    } catch {
      setForgetStep('failed');
      return;
    }
    setSelectedId(null);
    setGraph((g) => {
      if (!g) return g;
      const kept = g.links.filter((l) => l.a !== id && l.b !== id);
      // A person/place left without facts goes too.
      const orphan = (n: GalaxyNode) => n.kind === 'entity' && !kept.some((l) => l.a === n.id || l.b === n.id);
      return { ...g, links: kept, nodes: g.nodes.filter((n) => n.id !== id && !orphan(n)) };
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="galaxy-title">
      <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="animate-fade-up glass-deep relative flex h-[85vh] w-[92vw] max-w-[1200px] flex-col overflow-hidden rounded-2xl bg-surface/95">
        <header className="flex items-start gap-3 border-b border-edge px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div>
              <h2 id="galaxy-title" className="font-display text-lg font-bold">
                Memory <span className="text-gradient">Galaxy</span>
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Every dot is something SABA knows about you. Lines connect memories that are related
                {graph?.semantic && ' by meaning'}.
              </p>
            </div>
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400" aria-label="Legend">
              {(Object.keys(CATEGORY) as Fact['category'][]).map((c) => (
                <li key={c} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${CATEGORY[c].dot}`} />
                  {c}
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${ENTITY_DOT}`} />
                person / place
              </li>
            </ul>
          </div>
          <button ref={closeRef} onClick={onClose} className="btn-icon" aria-label="Close memory galaxy">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
          {/* The canvas is invisible to keyboards and screen readers; this list reaches every node too. */}
          {nodes.length > 0 && (
            <ul
              aria-label="Memories"
              className="h-32 shrink-0 space-y-0.5 overflow-y-auto border-t border-edge p-2 md:h-auto md:w-64 md:border-r md:border-t-0"
            >
              {nodes.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setSelectedId(n.id)}
                    aria-pressed={n.id === selectedId}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-wash/[0.06] ${
                      n.id === selectedId ? 'bg-wash/[0.08] text-slate-100' : 'text-slate-400'
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass(n)}`} />
                    <span className="truncate">{n.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="relative min-h-0 flex-1">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/15 blur-[90px]" />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab touch-none select-none" aria-hidden="true" />
            {/* Text and position come from the draw loop, not React. */}
            <div
              ref={tipRef}
              hidden
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 max-w-[16rem] rounded-lg border border-edge bg-surface/95 px-2.5 py-1.5 text-xs leading-snug text-slate-200 shadow-lg"
            />

            {error ? (
              <div className="absolute inset-0 grid place-items-center p-6 text-center">
                <div>
                  <p role="alert" className="text-sm text-slate-400">
                    Couldn&apos;t load your memory galaxy.
                  </p>
                  <button onClick={() => setAttempt((n) => n + 1)} className="btn-ghost mt-3 !px-3 !py-1.5 text-xs">
                    <RotateCw className="h-3.5 w-3.5" /> Try again
                  </button>
                </div>
              </div>
            ) : !graph ? (
              <div role="status" className="absolute inset-0 grid place-items-center">
                <Loader2 className="h-6 w-6 animate-spin text-violet-300" />
                <span className="sr-only">Loading your memories…</span>
              </div>
            ) : nodes.length === 0 ? (
              <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-500">
                No memories yet — tell SABA about yourself and they&apos;ll appear here.
              </p>
            ) : null}

            {selected && (
              <aside
                aria-label="Memory details"
                className="animate-fade-up glass-deep absolute inset-x-2 bottom-2 max-h-[45%] overflow-y-auto rounded-2xl bg-surface/95 p-4 md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:max-h-[calc(100%-2rem)] md:w-80"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      selected.kind === 'fact' ? CATEGORY[selected.category].chip : 'border-edge bg-wash/[0.06] text-slate-300'
                    }`}
                  >
                    {selected.kind === 'fact' ? selected.category : 'person / place'}
                  </span>
                  <button onClick={() => setSelectedId(null)} className="btn-icon !p-1" aria-label="Close details">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-slate-200">{selected.label}</p>

                {selected.kind === 'fact' ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {selected.sourceConversationId && (
                      <button
                        onClick={() => onOpenSource(selected.sourceConversationId!, selected.sourceMessageId)}
                        className="btn-ghost !px-3 !py-1.5 text-xs"
                      >
                        Learned in a conversation →
                      </button>
                    )}
                    {forgetStep ? (
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">
                          {forgetStep === 'failed' ? 'That didn’t work. Try again?' : 'Forget this for good?'}
                        </span>
                        <button
                          onClick={() => forget(selected.id)}
                          disabled={forgetStep === 'busy'}
                          autoFocus
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {forgetStep === 'busy' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Forget'}
                        </button>
                        <button
                          onClick={() => setForgetStep(null)}
                          className="rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:text-slate-200"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setForgetStep('confirm')} className="btn-ghost !px-3 !py-1.5 text-xs hover:!text-red-300">
                        <Trash2 className="h-3.5 w-3.5" /> Forget
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Linked memories</p>
                    <ul className="space-y-0.5">
                      {linked.map((n) => (
                        <li key={n.id}>
                          <button
                            onClick={() => setSelectedId(n.id)}
                            className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs leading-relaxed text-slate-400 transition hover:bg-wash/[0.06] hover:text-slate-200"
                          >
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass(n)}`} />
                            {n.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </aside>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
