'use client';

import { useEffect, useRef, useState } from 'react';
import type { Stats } from '@/server/db';
import { formatMs, formatPct } from '@/lib/format';

// Public /stats charts. One series each, so one color (brand violet, validated on the dark card
// surface with the dataviz checks); thin marks, hairline grid, hover/focus tooltips, and a
// table view under every chart so no value depends on hovering.

const SERIES = '#8b5cf6';
const GRID = 'rgba(255,255,255,0.08)';
const BASELINE = 'rgba(255,255,255,0.2)';
const MUTED = 'rgb(var(--slate-500))';

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(Math.round(n)));
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Round up to 1/2/5 × 10^k for clean axis ticks. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function Card({ title, caption, table, children }: { title: string; caption: string; table: [string, string][]; children: React.ReactNode }) {
  return (
    <figure className="glass-deep rounded-2xl p-5">
      <figcaption className="mb-3">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        <p className="text-xs text-slate-500">{caption}</p>
      </figcaption>
      {children}
      <details className="mt-3 text-xs text-slate-400">
        <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-300">Table view</summary>
        <table className="mt-2 w-full border-collapse">
          <tbody>
            {table.map(([k, v]) => (
              <tr key={k} className="border-b border-edge last:border-0">
                <td className="py-1 pr-4">{k}</td>
                <td className="py-1 text-right text-slate-200 [font-variant-numeric:tabular-nums]">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Tooltip({ x, y, value, label }: { x: number; y: number; value: string; label: string }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-center shadow-xl"
      style={{ left: x, top: y - 8 }}
    >
      <p className="text-xs font-semibold text-slate-100">{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

const H = 180;
const PAD = { top: 16, right: 12, bottom: 24, left: 42 };

function Axis({ width, max, format }: { width: number; max: number; format: (n: number) => string }) {
  const plotH = H - PAD.top - PAD.bottom;
  return (
    <g>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = PAD.top + plotH * (1 - f);
        return (
          <g key={f}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} stroke={f === 0 ? BASELINE : GRID} strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {format(max * f)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function XLabels({ days, width, xOf }: { days: string[]; width: number; xOf: (i: number) => number }) {
  const every = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor((width - PAD.left - PAD.right) / 56))));
  return (
    <g>
      {days.map((d, i) =>
        i % every === 0 || i === days.length - 1 ? (
          <text key={d} x={xOf(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={MUTED}>
            {dayLabel(d)}
          </text>
        ) : null
      )}
    </g>
  );
}

export function TurnsPerDay({ daily }: { daily: Stats['daily'] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...daily.map((d) => d.turns), 1));
  const plotH = H - PAD.top - PAD.bottom;
  const band = daily.length ? (width - PAD.left - PAD.right) / daily.length : 0;
  const barW = Math.min(24, band * 0.6);
  const xOf = (i: number) => PAD.left + band * i + band / 2;
  const yOf = (v: number) => PAD.top + plotH * (1 - v / max);

  return (
    <Card title="Chat turns per day" caption="Every reply SABA generated" table={daily.map((d) => [dayLabel(d.day), String(d.turns)])}>
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label="Column chart of chat turns per day">
            <Axis width={width} max={max} format={compact} />
            {daily.map((d, i) => {
              const x = xOf(i) - barW / 2;
              const y = yOf(d.turns);
              const r = Math.min(4, barW / 2, PAD.top + plotH - y);
              const base = PAD.top + plotH;
              return (
                <g key={d.day}>
                  {d.turns > 0 && (
                    <path
                      d={`M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${base} Z`}
                      fill={SERIES}
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  )}
                  {/* The whole band is the hit target, not just the painted column. */}
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${dayLabel(d.day)}: ${d.turns} turns`}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="outline-none"
                  />
                </g>
              );
            })}
            <XLabels days={daily.map((d) => d.day)} width={width} xOf={xOf} />
          </svg>
        )}
        {hover !== null && daily[hover] && (
          <Tooltip x={xOf(hover)} y={yOf(daily[hover].turns)} value={`${daily[hover].turns} turns`} label={dayLabel(daily[hover].day)} />
        )}
      </div>
    </Card>
  );
}

export function FirstTokenTrend({ daily }: { daily: Stats['daily'] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const points = daily.map((d, i) => ({ i, day: d.day, v: d.p50FirstToken })).filter((p): p is { i: number; day: string; v: number } => p.v !== null);
  const max = niceMax(Math.max(...points.map((p) => p.v), 1));
  const plotH = H - PAD.top - PAD.bottom;
  const step = daily.length > 1 ? (width - PAD.left - PAD.right) / (daily.length - 1) : 0;
  const xOf = (i: number) => (daily.length > 1 ? PAD.left + step * i : width / 2);
  const yOf = (v: number) => PAD.top + plotH * (1 - v / max);
  const line = points.map((p, k) => `${k ? 'L' : 'M'}${xOf(p.i)},${yOf(p.v)}`).join(' ');
  const last = points[points.length - 1];
  const nearest = (px: number) =>
    points.reduce((best, p) => (Math.abs(xOf(p.i) - px) < Math.abs(xOf(best.i) - px) ? p : best), points[0]);
  const active = hover !== null ? points.find((p) => p.i === hover) : undefined;

  return (
    <Card
      title="Time to first token"
      caption="Daily median — how long until the reply starts appearing"
      table={points.map((p) => [dayLabel(p.day), formatMs(p.v)])}
    >
      <div ref={ref} className="relative">
        {width > 0 && points.length > 0 && (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label="Line chart of daily median time to first token"
            tabIndex={0}
            className="outline-none focus-visible:ring-1 focus-visible:ring-violet-500/50"
            onPointerMove={(e) => setHover(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left).i)}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              const k = Math.max(0, points.findIndex((p) => p.i === (hover ?? last.i)));
              setHover(points[Math.min(points.length - 1, Math.max(0, k + (e.key === 'ArrowRight' ? 1 : -1)))].i);
            }}
            onBlur={() => setHover(null)}
          >
            {/* One unit per axis: "0s 0.5s 1s…" rather than mixing "500ms" and "1.0s". */}
            <Axis width={width} max={max} format={(n) => (max >= 1000 ? `${+(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`)} />
            <path d={`${line} L${xOf(last.i)},${PAD.top + plotH} L${xOf(points[0].i)},${PAD.top + plotH} Z`} fill={SERIES} opacity={0.1} />
            <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {active && <line x1={xOf(active.i)} x2={xOf(active.i)} y1={PAD.top} y2={PAD.top + plotH} stroke={BASELINE} strokeWidth={1} />}
            {(active ?? last) && (
              <circle cx={xOf((active ?? last).i)} cy={yOf((active ?? last).v)} r={4} fill={SERIES} stroke="rgb(var(--surface))" strokeWidth={2} />
            )}
            {!active && (
              <text x={Math.min(xOf(last.i), width - PAD.right) - 6} y={yOf(last.v) - 10} textAnchor="end" fontSize={11} fill="rgb(var(--slate-200))">
                {formatMs(last.v)}
              </text>
            )}
            <XLabels days={daily.map((d) => d.day)} width={width} xOf={xOf} />
          </svg>
        )}
        {active && <Tooltip x={xOf(active.i)} y={yOf(active.v)} value={formatMs(active.v)} label={`median · ${dayLabel(active.day)}`} />}
      </div>
    </Card>
  );
}

/** Horizontal bars with the value at the tip — every value is labeled, so no tooltip is needed. */
export function BarList({ title, caption, rows, unit }: { title: string; caption: string; rows: { label: string; value: number | null }[]; unit: 'ms' | 'pct' }) {
  const format = unit === 'ms' ? formatMs : formatPct;
  const max = Math.max(...rows.map((r) => r.value ?? 0), 1);
  return (
    <Card title={title} caption={caption} table={rows.map((r) => [r.label, format(r.value)])}>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,11.5rem)_1fr] items-center gap-3 text-xs">
            <span className="truncate text-slate-400" title={r.label}>
              {r.label}
            </span>
            <span className="flex items-center gap-2">
              <span
                className="h-3.5 rounded-r"
                style={{ width: `${Math.max(((r.value ?? 0) / max) * 100, r.value ? 2 : 0)}%`, maxWidth: 'calc(100% - 4rem)', background: SERIES }}
                aria-hidden
              />
              <span className="shrink-0 text-slate-200">{format(r.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
