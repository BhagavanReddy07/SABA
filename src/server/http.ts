import { NextResponse } from 'next/server';
import { UnauthorizedError } from './auth';

/** Wraps a route handler: maps UnauthorizedError → 401, anything else → 500. */
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
      console.error('[api]', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}
