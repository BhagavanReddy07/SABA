import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getUserById, type DbUser } from './db';

// Stateless signed session token (HMAC-SHA256, stdlib) in an httpOnly cookie.
// ponytail: no JWT lib — payload is just userId + expiry, HMAC covers it.

const COOKIE = 'saba_session';
const SESSION_DAYS = 7;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + SESSION_DAYS * 86_400_000 })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof uid !== 'string' || typeof exp !== 'number' || Date.now() > exp) {
      return null;
    }
    return uid;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string): Promise<void> {
  (await cookies()).set(COOKIE, createSessionToken(userId), {
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
  const userId = verifySessionToken(token);
  return userId ? getUserById(userId) : null;
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
