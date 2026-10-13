// Google Calendar for the `calendar` tool. Reuses the Google OAuth client from sign-in with an
// extra scope (incremental authorization); the refresh token is stored sealed (tokens.ts).
// ponytail: access tokens cached per process; a cold start just refreshes once more.

import { deleteGoogleToken, getGoogleToken } from './db';
import { unseal } from './tokens';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export const hasGoogleOAuth = (): boolean =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const cache = globalThis as unknown as { sabaGoogleAccess?: Map<string, { token: string; exp: number }> };
const access = (cache.sabaGoogleAccess ??= new Map());

async function accessToken(userId: string): Promise<string | null> {
  const hit = access.get(userId);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const sealed = await getGoogleToken(userId);
  const refreshToken = sealed && unseal(sealed);
  if (!refreshToken) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 400 || res.status === 401) {
    await deleteGoogleToken(userId); // revoked or expired — the user has to reconnect
    return null;
  }
  if (!res.ok) throw new Error(`Google token refresh failed: HTTP ${res.status}`);
  const data = await res.json();
  access.set(userId, { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}

function when(e: { dateTime?: string; date?: string } | undefined, timezone: string): string {
  if (!e) return '?';
  if (e.date) return `${e.date} (all day)`;
  return new Date(e.dateTime!).toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function listEvents(userId: string, days: number, timezone: string): Promise<string> {
  const token = await accessToken(userId);
  if (!token) return 'Google Calendar is not connected (or access was revoked). Ask the user to connect it in Settings.';
  const now = new Date();
  const until = new Date(now.getTime() + Math.min(Math.max(days, 1), 31) * 86_400_000);
  const res = await fetch(
    `${API}?timeMin=${now.toISOString()}&timeMax=${until.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=25`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) return `Couldn't read the calendar (HTTP ${res.status}).`;
  const items: any[] = (await res.json()).items ?? [];
  if (!items.length) return `No events in the next ${days} day(s).`;
  return items
    .map((e) => `- ${when(e.start, timezone)}: ${e.summary ?? '(untitled)'}${e.location ? ` @ ${e.location}` : ''}`)
    .join('\n');
}

export async function createEvent(
  userId: string,
  event: { title: string; start: string; end?: string; description?: string }
): Promise<string> {
  const token = await accessToken(userId);
  if (!token) return 'Google Calendar is not connected (or access was revoked). Ask the user to connect it in Settings.';
  const start = Date.parse(event.start);
  if (Number.isNaN(start)) return 'start must be an ISO 8601 date-time with the user\'s UTC offset.';
  const end = event.end && !Number.isNaN(Date.parse(event.end)) ? Date.parse(event.end) : start + 30 * 60_000;
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: event.title.slice(0, 200),
      description: event.description?.slice(0, 2000),
      start: { dateTime: new Date(start).toISOString() },
      end: { dateTime: new Date(Math.max(end, start + 60_000)).toISOString() },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return `Couldn't create the event (HTTP ${res.status}).`;
  const created = await res.json();
  return `Added "${created.summary}" to Google Calendar (${created.htmlLink}).`;
}

export async function disconnectCalendar(userId: string): Promise<void> {
  const sealed = await getGoogleToken(userId);
  const refreshToken = sealed && unseal(sealed);
  if (refreshToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
    }).catch(() => {});
  }
  access.delete(userId);
  await deleteGoogleToken(userId);
}
