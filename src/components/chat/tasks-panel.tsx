'use client';

import { useState } from 'react';
import { CheckSquare, Plus, Square, Trash2, X } from 'lucide-react';
import type { Task } from '@/lib/types';

const PRIORITY_DOT: Record<Task['priority'], string> = {
  low: 'bg-slate-500',
  medium: 'bg-amber-400',
  high: 'bg-red-400',
};

type Props = {
  tasks: Task[];
  onAddTask: (content: string) => void;
  onToggleTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onClose: () => void;
};

export function TasksPanel({ tasks, onAddTask, onToggleTask, onDeleteTask, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const openCount = tasks.filter((t) => !t.completedAt).length;

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    onAddTask(trimmed);
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-edge bg-surface shadow-2xl lg:static lg:bg-surface/60 lg:shadow-none">
      <div className="flex items-center justify-between px-4 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <CheckSquare className="h-4 w-4 text-violet-300" /> Tasks
          {openCount > 0 && (
            <span className="rounded-full bg-violet-500/20 px-1.5 text-[10px] text-violet-300">
              {openCount}
            </span>
          )}
        </h2>
        <button
          onClick={onClose}
          className="btn-icon lg:hidden"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-2 px-4 pb-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add a task…"
          className="input-dark !py-2 text-xs"
        />
        <button onClick={add} className="btn-ghost !p-2" aria-label="Add task">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-6">
        {tasks.length === 0 ? (
          <p className="px-2 pt-6 text-center text-xs leading-relaxed text-slate-600">
            No tasks yet. Add one above to keep track of things.
          </p>
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
