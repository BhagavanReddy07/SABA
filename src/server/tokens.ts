// HMAC-SHA256 signed tokens (stdlib only) — sessions, email links, share links.
// ponytail: no JWT lib — payloads are tiny and an HMAC over them is all the integrity needed.
// Every payload carries a purpose `p` so a token minted for one job can't be replayed as another.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}

export function hmac(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

/** Without `ttlMs` the token never expires (share links — those are revoked server-side). */
export function signToken(payload: Record<string, unknown>, ttlMs?: number): string {
  const body = Buffer.from(
    JSON.stringify(ttlMs ? { ...payload, exp: Date.now() + ttlMs } : payload)
  ).toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string): T | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(hmac(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    if (payload.exp !== undefined && (typeof payload.exp !== 'number' || Date.now() > payload.exp)) {
      return null;
    }
    return payload as T;
  } catch {
    return null;
  }
}

/** Opaque random secret for tokens we store hashed (MCP access tokens, Telegram link codes). */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// Secrets at rest (Google refresh tokens): AES-256-GCM, key derived from AUTH_SECRET.
const sealKey = () => createHash('sha256').update(`${secret()}:sealed-secrets`).digest();

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

export function unseal(sealed: string): string | null {
  try {
    const [iv, tag, body] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', sealKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return null; // tampered, or AUTH_SECRET changed
  }
}
