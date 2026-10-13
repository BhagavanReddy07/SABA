import { cookies } from 'next/headers';
import { getUserById, type DbUser } from './db';
import { signToken, verifyToken } from './tokens';

// Stateless signed session token in an httpOnly cookie. Revocation without a sessions
// table: the token carries users.session_version; bumping it invalidates every session.

const COOKIE = 'saba_session';
const SESSION_DAYS = 7;

export function createSessionToken(user: Pick<DbUser, 'id' | 'sessionVersion'>): string {
  return signToken({ p: 's', uid: user.id, v: user.sessionVersion }, SESSION_DAYS * 86_400_000);
}

/** Accepts pre-versioning tokens ({uid, exp}) as version 0 so nobody is logged out by a deploy. */
export function verifySessionToken(token: string): { userId: string; version: number } | null {
  const payload = verifyToken<{ p?: unknown; uid?: unknown; v?: unknown }>(token);
  if (!payload || (payload.p !== undefined && payload.p !== 's')) return null;
  if (typeof payload.uid !== 'string') return null;
  return { userId: payload.uid, version: typeof payload.v === 'number' ? payload.v : 0 };
}

export async function setSessionCookie(user: Pick<DbUser, 'id' | 'sessionVersion'>): Promise<void> {
  (await cookies()).set(COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 86_400,
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Returns the logged-in user or null. */
export async function getSessionUser(): Promise<DbUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session) return null;
  const user = await getUserById(session.userId);
  return user && user.sessionVersion === session.version ? user : null;
}

/** Returns the logged-in user or throws a 401 the route handlers translate. */
export async function requireUser(): Promise<DbUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Not authenticated');
  }
}
