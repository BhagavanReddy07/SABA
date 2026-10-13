'use client';

import { useState } from 'react';
import { Bell, CalendarPlus, CheckSquare, Download, Flame, Plus, Square, Target, Trash2, X } from 'lucide-react';
import type { Goal, Task } from '@/lib/types';
import { downloadIcs, googleCalendarUrl } from '@/lib/calendar';
import { secondPerson } from '@/lib/format';
import { streakDays } from '@/lib/goals';

const PRIORITY_DOT: Record<Task['priority'], string> = {
  low: 'bg-slate-500',
  medium: 'bg-amber-400',
  high: 'bg-red-400',
};

type Props = {
  tasks: Task[];
  goals: Goal[];
  onAddTask: (content: string, dueAt: string | undefined, priority: Task['priority']) => void;
  onToggleTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  /** Prefills the composer with a check-in for this goal. */
  onCheckIn: (goal: Goal) => void;
  onClose: () => void;
};

function formatDue(dueAt: string): string {
  return new Date(dueAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function TasksPanel({ tasks, goals, onAddTask, onToggleTask, onDeleteTask, onCheckIn, onClose }: Props) {
  const [tab, setTab] = useState<'tasks' | 'goals'>('tasks');
  const [draft, setDraft] = useState('');
  const [dueDraft, setDueDraft] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const openCount = tasks.filter((t) => !t.completedAt).length;

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    setDueDraft('');
    onAddTask(trimmed, dueDraft ? new Date(dueDraft).toISOString() : undefined, priority);
  };

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 flex w-80 max-w-[90vw] flex-col border-l border-edge bg-surface shadow-2xl lg:static lg:max-w-none lg:bg-surface/60 lg:shadow-none"
      aria-label="Tasks and goals"
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex gap-1 rounded-xl border border-edge bg-wash/[0.03] p-1" role="tablist">
          {(['tasks', 'goals'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition ${
                tab === t ? 'bg-wash/[0.08] text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'tasks' ? <CheckSquare className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
              {t === 'tasks' ? 'Tasks' : 'Goals'}
              {t === 'tasks' && openCount > 0 && (
                <span className="rounded-full bg-violet-500/20 px-1.5 text-[10px] text-violet-300">{openCount}</span>
              )}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="btn-icon lg:hidden" aria-label="Close panel">
          <X className="h-4 w-4" />
        </button>
      </div>

      {tab === 'tasks' ? (
        <>
          <div className="space-y-2 px-4 pb-3">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder="Add a task…"
                aria-label="New task"
                className="input-dark !py-2 text-xs"
              />
              <button onClick={add} className="btn-ghost !p-2" aria-label="Add task">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={dueDraft}
                onChange={(e) => setDueDraft(e.target.value)}
                className="input-dark !py-1.5 text-xs text-slate-400 [color-scheme:dark]"
                aria-label="Remind me at (optional)"
                title="Optional: get a reminder at this time"
              />
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task['priority'])}
                className="input-dark !w-24 !px-2 !py-1.5 text-xs text-slate-400"
                aria-label="Priority"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-6">
            {tasks.length === 0 ? (
              <p className="px-2 pt-6 text-center text-xs leading-relaxed text-slate-600">
                No tasks yet. Add one above, or just tell SABA “remind me to…”.
              </p>
            ) : (
              tasks.map((t) => {
                const gcal = !t.completedAt && googleCalendarUrl(t);
                return (
                  <div key={t.id} className="group glass flex items-start gap-2.5 rounded-xl p-3">
                    <button
                      onClick={() => onToggleTask(t)}
                      className="mt-0.5 text-slate-400 hover:text-violet-300"
                      aria-label={t.completedAt ? `Mark "${t.content}" incomplete` : `Mark "${t.content}" complete`}
                    >
                      {t.completedAt ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs leading-relaxed ${t.completedAt ? 'text-slate-600 line-through' : 'text-slate-300'}`}>
                        {t.content}
                      </p>
                      {t.dueAt && !t.completedAt && (
                        <p
                          className={`mt-1 flex items-center gap-1 text-[10px] ${
                            Date.parse(t.dueAt) < Date.now() ? 'text-red-300' : 'text-violet-300/80'
                          }`}
                        >
                          <Bell className="h-3 w-3" /> {formatDue(t.dueAt)}
                        </p>
                      )}
                    </div>
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} title={`${t.priority} priority`} />
                    <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                      {gcal && (
                        <>
                          <a href={gcal} target="_blank" rel="noreferrer" className="btn-icon !p-1" aria-label="Add to Google Calendar" title="Add to Google Calendar">
                            <CalendarPlus className="h-3.5 w-3.5" />
                          </a>
                          <button onClick={() => downloadIcs(t)} className="btn-icon !p-1" aria-label="Download calendar file" title="Download .ics">
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => onDeleteTask(t.id)}
                        className="btn-icon !p-1 hover:!text-red-400"
                        aria-label={`Delete "${t.content}"`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-6 pt-2">
          {goals.length === 0 ? (
            <p className="px-2 pt-6 text-center text-xs leading-relaxed text-slate-600">
              No goals yet. Tell SABA what you&apos;re working towards — “I want to run a half-marathon” — and track it here.
            </p>
          ) : (
            goals.map((g) => {
              const streak = streakDays(g.logs.map((l) => l.createdAt));
              const week = g.logs.filter((l) => Date.now() - Date.parse(l.createdAt) < 7 * 86_400_000).length;
              const last = g.logs[0];
              return (
                <div key={g.memory.id} className="glass rounded-xl p-3">
                  <p className="text-xs leading-relaxed text-slate-200">{secondPerson(g.memory.content)}</p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
                    <span className={`flex items-center gap-1 ${streak ? 'text-amber-300' : ''}`}>
                      <Flame className="h-3 w-3" /> {streak}-day streak
                    </span>
                    <span>{week} this week</span>
                  </div>
                  {last && (
                    <p className="mt-1 truncate text-[10px] text-slate-500" title={last.note}>
                      Last: {last.note} · {new Date(last.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  )}
                  <button onClick={() => onCheckIn(g)} className="btn-ghost mt-2 w-full !py-1.5 text-xs">
                    Check in
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </aside>
  );
}
