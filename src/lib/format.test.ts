import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, monthDayFrom, secondPerson } from './format';
import { streakDays } from './goals';

test('secondPerson turns stored facts into "you"', () => {
  assert.equal(secondPerson("User's sister is Ananya."), 'Your sister is Ananya.');
  assert.equal(secondPerson('User is training for a half-marathon.'), "You're training for a half-marathon.");
  assert.equal(secondPerson('User wants to learn Telugu.'), 'You want to learn Telugu.');
  assert.equal(secondPerson('User watches F1 every weekend.'), 'You watch F1 every weekend.');
  assert.equal(secondPerson('User studies at IIT.'), 'You study at IIT.');
  assert.equal(secondPerson('User always runs at 6am.'), 'You always run at 6am.');
  assert.equal(secondPerson('User loves hiking.'), 'You love hiking.');
});

test('daysUntil wraps around the year and handles Feb 29', () => {
  assert.equal(daysUntil('10-13', '2026-10-13'), 0);
  assert.equal(daysUntil('10-14', '2026-10-13'), 1);
  assert.equal(daysUntil('01-01', '2026-12-31'), 1);
  assert.equal(daysUntil('02-29', '2026-02-27'), 2); // → Mar 1 in 2026
  assert.equal(daysUntil('bad', '2026-10-13'), null);
});

test('monthDayFrom reads birthdays and anniversaries only', () => {
  assert.equal(monthDayFrom("User's sister Ananya's birthday is on May 3."), '05-03');
  assert.equal(monthDayFrom('User was born on 21st of September 1994.'), '09-21');
  assert.equal(monthDayFrom("User's wedding anniversary is Dec. 12."), '12-12');
  assert.equal(monthDayFrom('User may move to Pune in 3 months.'), null);
  assert.equal(monthDayFrom("User's birthday is in spring."), null);
});

test('streakDays counts consecutive local days ending today or yesterday', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const days = ['2026-10-13T08:00:00Z', '2026-10-12T08:00:00Z', '2026-10-11T08:00:00Z', '2026-10-09T08:00:00Z'];
  assert.equal(streakDays(days, 'UTC', now), 3);
  assert.equal(streakDays(days.slice(1), 'UTC', now), 2); // nothing today yet — streak still alive
  assert.equal(streakDays(['2026-10-10T08:00:00Z'], 'UTC', now), 0);
});
