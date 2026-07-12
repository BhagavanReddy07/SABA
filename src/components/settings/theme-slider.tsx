'use client';

import { useRef, useState } from 'react';
import type { ThemeMode } from '@/lib/use-theme';

const MODES: { key: ThemeMode; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
];

// Literal preview of each mode: solid white, solid near-black, diagonal split.
const THUMB_BG: Record<ThemeMode, string> = {
  light: '#ffffff',
  dark: '#0b0b0c',
  system: 'linear-gradient(135deg, #ffffff 50%, #0b0b0c 50%)',
};

const TRACK_W = 280;
const TRACK_H = 56;
const PAD = 4;
const SEG_W = (TRACK_W - PAD * 2) / 3;
const POS = [0, SEG_W, SEG_W * 2]; // thumb left-offset per mode (max = track width - thumb width)
const CENTERS = POS.map((p) => p + SEG_W / 2); // segment midpoints, for hit-testing
const TRACK_INNER_W = SEG_W * 3; // full hit-test range — wider than POS's max, which is thumb-left-offset-max

export function ThemeModeSlider({ mode, onChange }: { mode: ThemeMode; onChange: (m: ThemeMode) => void }) {
  const index = Math.max(MODES.findIndex((m) => m.key === mode), 0);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const clamp = (v: number) => Math.max(0, Math.min(TRACK_INNER_W, v));
  const closestIndex = (x: number) =>
    CENTERS.reduce((best, c, i) => (Math.abs(c - x) < Math.abs(CENTERS[best] - x) ? i : best), 0);
  const posFromEvent = (e: React.PointerEvent) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return clamp(e.clientX - rect.left - PAD);
  };

  // A plain click still fires pointerdown+pointerup with no pointermove in between, so
  // seeding dragX on pointerdown (not just move) makes click-to-select and drag-to-select
  // the same code path — setPointerCapture below can otherwise swallow the synthetic
  // `click` event before it reaches the label buttons' own onClick.
  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    setIsDragging(true);
    trackRef.current?.setPointerCapture(e.pointerId);
    setDragX(posFromEvent(e));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setDragX(posFromEvent(e));
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    if (dragX !== null) onChange(MODES[closestIndex(dragX)].key);
    setDragX(null);
  };

  const left = dragX !== null ? Math.min(dragX, POS[2]) : POS[index];
  const previewMode = MODES[closestIndex(dragX ?? POS[index])].key;

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      style={{ width: TRACK_W, height: TRACK_H, padding: PAD }}
      className="relative flex select-none items-center rounded-full border border-edge bg-wash/[0.06] shadow-[inset_0_2px_6px_rgba(0,0,0,0.15)] [touch-action:none]"
    >
      <div
        style={{
          left,
          top: PAD,
          width: SEG_W,
          height: TRACK_H - PAD * 2,
          background: THUMB_BG[previewMode],
          transition: isDragging ? 'none' : 'left 0.32s cubic-bezier(.34,1.4,.64,1), background 0.2s ease',
        }}
        className="pointer-events-none absolute rounded-full border border-edge shadow-lg shadow-black/30"
      />

      {MODES.map((m, i) => (
        <button
          key={m.key}
          type="button"
          onClick={() => onChange(m.key)}
          className={`relative z-10 flex-1 text-sm font-semibold tracking-wide transition-colors duration-200 ${
            index === i ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
          }`}
          style={
            index === i
              ? { textShadow: '0 0 4px rgba(0,0,0,0.65), 0 0 4px rgba(255,255,255,0.65)' }
              : undefined
          }
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
