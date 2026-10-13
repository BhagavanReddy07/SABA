import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleCalendarUrl, icsFor } from './calendar';

const task = { id: 't1', content: 'Call mom, then; dinner', dueAt: '2026-10-13T12:30:00.000Z' };

test('google calendar template link carries a 30-minute UTC slot', () => {
  const url = new URL(googleCalendarUrl(task)!);
  assert.equal(url.searchParams.get('dates'), '20261013T123000Z/20261013T130000Z');
  assert.equal(url.searchParams.get('text'), task.content);
  assert.equal(googleCalendarUrl({ ...task, dueAt: null }), null);
});

test('ics escapes RFC 5545 specials and uses CRLF', () => {
  const ics = icsFor(task, Date.parse('2026-10-12T00:00:00Z'))!;
  assert.ok(ics.includes('SUMMARY:Call mom\\, then\\; dinner\r\n'));
  assert.ok(ics.includes('DTSTART:20261013T123000Z\r\n'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
});
