'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarHeart, Moon, Target } from 'lucide-react';
import type { Goal, Memory, Task, User } from '@/lib/types';
import { daysUntil, inDays, secondPerson } from '@/lib/format';

const SLEEP_SEEN = 'saba-sleep-seen';

type Props = {
  user: User;
  tasks: Task[];
  memories: Memory[];
  goals: Goal[];
  onPrefill: (text: string) => void;
  onOpenTasks: () => void;
  onOpenMemory: () => void;
};

/** SABA Pulse in the app: "Since we last talked…" — at most three things worth a tap. */
export function PulseCards({ user, tasks, memories, goals, onPrefill, onOpenTasks, onOpenMemory }: Props) {
  const [sleepSeen, setSleepSeen] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSleepSeen(localStorage.getItem(SLEEP_SEEN));
    } catch {
      // storage blocked — the card just keeps showing
    }
  }, []);

  const cards = useMemo(() => {
    const out: { key: string; icon: typeof Bell; text: string; onClick: () => void }[] = [];
    const today = new Date().toLocaleDateString('en-CA');
    const now = Date.now();

    const due = tasks.filter(
      (t) => !t.completedAt && t.dueAt && (Date.parse(t.dueAt) < now || new Date(t.dueAt).toLocaleDateString('en-CA') === today)
    );
    if (due.length) {
      const overdue = due.filter((t) => Date.parse(t.dueAt!) < now).length;
      out.push({
        key: 'tasks',
        icon: Bell,
        text: overdue
          ? `${overdue} reminder${overdue === 1 ? ' is' : 's are'} overdue — “${due[0].content}”`
          : `${due.length} reminder${due.length === 1 ? '' : 's'} today — next: “${due[0].content}”`,
        onClick: onOpenTasks,
      });
    }

    const date = memories
      .filter((m) => !m.validTo && m.eventDate)
      .map((m) => ({ m, days: daysUntil(m.eventDate!, today) }))
      .filter((x): x is { m: Memory; days: number } => x.days !== null && x.days <= 7)
      .sort((a, b) => a.days - b.days)[0];
    if (date) {
      out.push({
        key: `date-${date.m.id}`,
        icon: CalendarHeart,
        text: `${secondPerson(date.m.content)} That's ${inDays(date.days)}.`,
        onClick: () => onPrefill(`Help me prepare for this: ${secondPerson(date.m.content)} It's ${inDays(date.days)}.`),
      });
    }

    const goal = [...goals].sort(
      (a, b) => (a.logs[0] ? Date.parse(a.logs[0].createdAt) : 0) - (b.logs[0] ? Date.parse(b.logs[0].createdAt) : 0)
    )[0];
    if (goal) {
      out.push({
        key: `goal-${goal.memory.id}`,
        icon: Target,
        text: `How's it going? ${secondPerson(goal.memory.content)}`,
        onClick: () => onPrefill(`Progress on my goal “${secondPerson(goal.memory.content)}”: `),
      });
    }

    const sleep = user.lastConsolidation;
    const tidied = sleep ? sleep.merged + sleep.retired + sleep.summarized : 0;
    if (sleep && tidied > 0 && sleep.at !== sleepSeen && now - Date.parse(sleep.at) < 3 * 86_400_000) {
      out.push({
        key: 'sleep',
        icon: Moon,
        text: `While you were away I tidied my memory: merged ${sleep.merged}, retired ${sleep.retired}, summarized ${sleep.summarized} chat${sleep.summarized === 1 ? '' : 's'}.`,
        onClick: () => {
          try {
            localStorage.setItem(SLEEP_SEEN, sleep.at);
          } catch {
            // fine
          }
          setSleepSeen(sleep.at);
          onOpenMemory();
        },
      });
    }
    return out.slice(0, 3);
  }, [tasks, memories, goals, user.lastConsolidation, sleepSeen, onPrefill, onOpenTasks, onOpenMemory]);

  if (!cards.length) return null;
  return (
    <div className="mx-auto mt-6 w-full max-w-2xl">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Since we last talked</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {cards.map(({ key, icon: Icon, text, onClick }) => (
          <button
            key={key}
            onClick={onClick}
            className="glass flex items-start gap-2.5 rounded-xl p-3 text-left text-xs leading-relaxed text-slate-300 transition hover:-translate-y-0.5 hover:bg-wash/[0.06]"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
            <span className="line-clamp-3">{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
