'use client';

import { useEffect, useState } from 'react';
import { Brain, Plus, Trash2, X } from 'lucide-react';
import type { Memory, MemoryCategory } from '@/lib/types';

const CATEGORY_STYLE: Record<MemoryCategory, string> = {
  fact: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  preference: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  goal: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  summary: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
};

const FILTERS = ['all', 'fact', 'preference', 'goal'] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  memories: Memory[];
  onAddMemory: (content: string) => void;
  onDeleteMemory: (id: string) => void;
};

/** Centered dialog: everything SABA knows about the user, opened from Settings → Memory. */
export function MemoryDialog({ open, onClose, memories, onAddMemory, onDeleteMemory }: Props) {
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    onAddMemory(trimmed);
  };

  const visible = filter === 'all' ? memories : memories.filter((m) => m.category === filter);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="animate-fade-up glass-deep relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-surface/95 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-base font-bold">
            <Brain className="h-4 w-4 text-violet-300" />
            SABA&apos;s memory of you
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-300">
              {memories.length}
            </span>
          </h2>
          <button onClick={onClose} className="btn-icon" aria-label="Close memory">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Teach SABA a fact about you…"
            className="input-dark !py-2 text-xs"
          />
          <button onClick={add} className="btn-primary !px-3 !py-2" aria-label="Add memory">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                filter === f
                  ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                  : 'border-edge text-slate-500 hover:text-slate-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {visible.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs leading-relaxed text-slate-600">
              {memories.length === 0
                ? "SABA hasn't learned anything yet. Facts it extracts from your chats appear here."
                : 'Nothing in this category yet.'}
            </p>
          ) : (
            visible.map((m) => (
              <div key={m.id} className="group glass flex items-start gap-3 rounded-xl p-3">
                <div className="min-w-0 flex-1">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_STYLE[m.category]}`}
                  >
                    {m.category}
                    {m.source === 'extracted' && ' · learned'}
                  </span>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{m.content}</p>
                </div>
                <button
                  onClick={() => onDeleteMemory(m.id)}
                  className="btn-icon !p-1 opacity-0 hover:!text-red-400 group-hover:opacity-100"
                  aria-label="Forget this memory"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
