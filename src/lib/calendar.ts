// "Add to calendar" for reminders — no OAuth needed: a Google Calendar template link, or an .ics
// file any calendar app imports (RFC 5545).

import type { Task } from './types';

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleCalendarUrl(task: Pick<Task, 'content' | 'dueAt'>): string | null {
  if (!task.dueAt) return null;
  const start = Date.parse(task.dueAt);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: task.content,
    dates: `${stamp(start)}/${stamp(start + 30 * 60_000)}`,
    details: 'Reminder from SABA',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const escapeIcs = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function icsFor(task: Pick<Task, 'id' | 'content' | 'dueAt'>, now = Date.now()): string | null {
  if (!task.dueAt) return null;
  const start = Date.parse(task.dueAt);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SABA//Reminders//EN',
    'BEGIN:VEVENT',
    `UID:${task.id}@saba`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(start + 30 * 60_000)}`,
    `SUMMARY:${escapeIcs(task.content)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(task.content)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function downloadIcs(task: Pick<Task, 'id' | 'content' | 'dueAt'>): void {
  const ics = icsFor(task);
  if (!ics) return;
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${task.content.replace(/[^\w\s-]/g, '').trim().slice(0, 40) || 'reminder'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
