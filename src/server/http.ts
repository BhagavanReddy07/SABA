import { NextResponse } from 'next/server';
import { UnauthorizedError } from './auth';
import { hitRateLimit } from './db';

export class RateLimitedError extends Error {
  constructor(public retryAfter: number) {
    super('Too many requests');
  }
}

/** Wraps a route handler: UnauthorizedError → 401, RateLimitedError → 429, anything else → 500. */
export function handle<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse>
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      if (err instanceof RateLimitedError) return tooMany(err.retryAfter);
      console.error('[api]', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function tooMany(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests — please slow down and try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

/** First hop of x-forwarded-for (set by Vercel and most proxies). */
export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}

/** Fixed-window limit: throws RateLimitedError once `key` passes `max` hits per `windowSec`. */
export async function limit(key: string, max: number, windowSec: number): Promise<void> {
  if ((await hitRateLimit(key, windowSec)) > max) throw new RateLimitedError(windowSec);
}

/** Parses a JSON body, treating malformed JSON as an empty object (validated by the caller). */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
