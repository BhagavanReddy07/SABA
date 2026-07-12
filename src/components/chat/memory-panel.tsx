'use client';

import { useState } from 'react';
import { Brain, CheckSquare, Plus, Square, Trash2, X } from 'lucide-react';
import type { Memory, MemoryCategory, Task } from '@/lib/types';

const CATEGORY_STYLE: Record<MemoryCategory, string> = {
  fact: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  preference: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  goal: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  summary: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
};

const PRIORITY_DOT: Record<Task['priority'], string> = {
  low: 'bg-slate-500',
  medium: 'bg-amber-400',
  high: 'bg-red-400',
};

type Props = {
  memories: Memory[];
  tasks: Task[];
  onAddMemory: (content: string) => void;
  onDeleteMemory: (id: string) => void;
  onAddTask: (content: string) => void;
  onToggleTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onClose: () => void;
};

export function MemoryPanel({
  memories,
  tasks,
  onAddMemory,
  onDeleteMemory,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'memory' | 'tasks'>('memory');
  const [draft, setDraft] = useState('');

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    if (tab === 'memory') onAddMemory(trimmed);
    else onAddTask(trimmed);
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-edge bg-surface shadow-2xl lg:static lg:bg-surface/60 lg:shadow-none">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="grid flex-1 grid-cols-2 rounded-xl border border-edge bg-white/[0.03] p-1">
          {(
            [
              ['memory', 'Memory', Brain],
              ['tasks', 'Tasks', CheckSquare],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition ${
                tab === key
                  ? 'bg-white/[0.08] text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="ml-2 rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 lg:hidden"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Add form */}
      <div className="flex gap-2 px-4 pb-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={tab === 'memory' ? 'Teach SABA a fact…' : 'Add a task…'}
          className="input-dark !py-2 text-xs"
        />
        <button onClick={add} className="btn-ghost !p-2" aria-label="Add">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-6">
        {tab === 'memory' ? (
          memories.length === 0 ? (
            <EmptyHint text="SABA hasn't learned anything yet. Facts it extracts from your chats appear here." />
          ) : (
            memories.map((m) => (
              <div key={m.id} className="group glass rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_STYLE[m.category]}`}
                  >
                    {m.category}
                    {m.source === 'extracted' && ' · learned'}
                  </span>
                  <button
                    onClick={() => onDeleteMemory(m.id)}
                    className="hidden rounded p-1 text-slate-600 hover:text-red-400 group-hover:block"
                    aria-label="Forget this memory"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{m.content}</p>
              </div>
            ))
          )
        ) : tasks.length === 0 ? (
          <EmptyHint text="No tasks yet. Add one above to keep track of things." />
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="group glass flex items-start gap-2.5 rounded-xl p-3">
              <button
                onClick={() => onToggleTask(t)}
                className="mt-0.5 text-slate-400 hover:text-violet-300"
                aria-label={t.completedAt ? 'Mark incomplete' : 'Mark complete'}
              >
                {t.completedAt ? (
                  <CheckSquare className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-xs leading-relaxed ${
                    t.completedAt ? 'text-slate-600 line-through' : 'text-slate-300'
                  }`}
                >
                  {t.content}
                </p>
              </div>
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} />
              <button
                onClick={() => onDeleteTask(t.id)}
                className="hidden rounded p-1 text-slate-600 hover:text-red-400 group-hover:block"
                aria-label="Delete task"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="px-2 pt-6 text-center text-xs leading-relaxed text-slate-600">{text}</p>;
}
