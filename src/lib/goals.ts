// Goal streaks — shared by the log_goal tool (server) and the Goals panel (client).

/** Local calendar date (YYYY-MM-DD) of an instant in `timeZone` (default: the runtime's). */
export function localDay(iso: string, timeZone?: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Consecutive days with at least one log, ending today — or yesterday, so a streak survives until tonight. */
export function streakDays(logDates: string[], timeZone?: string, now = new Date()): number {
  const days = new Set(logDates.map((d) => localDay(d, timeZone)));
  const cursor = new Date(now);
  if (!days.has(localDay(cursor.toISOString(), timeZone))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(localDay(cursor.toISOString(), timeZone))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
