// Web push (RFC 8030) with VAPID auth (RFC 8292) and aes128gcm payload encryption (RFC 8291),
// on node:crypto alone. Generate keys once with `npm run vapid`.

import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';
import type { PushSubscriptionRow } from './db';

export const hasPush = (): boolean => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const vapidPublicKey = (): string | null => (hasPush() ? process.env.VAPID_PUBLIC_KEY! : null);

const b64u = (b: Buffer) => b.toString('base64url');
const hkdf = (ikm: Buffer, salt: Buffer, info: Buffer, length: number) =>
  Buffer.from(hkdfSync('sha256', ikm, salt, info, length));

/** ES256-signed JWT scoped to one push service origin. */
export function vapidJwt(audience: string, publicKey: string, privateKey: string, subject: string): string {
  const pub = Buffer.from(publicKey, 'base64url'); // 0x04 || X (32) || Y (32)
  const d = Buffer.from(privateKey, 'base64url');
  const key = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: b64u(Buffer.concat([Buffer.alloc(32 - d.length), d])),
      x: b64u(pub.subarray(1, 33)),
      y: b64u(pub.subarray(33, 65)),
    },
    format: 'jwk',
  });
  const segment = (o: object) => b64u(Buffer.from(JSON.stringify(o)));
  const unsigned = `${segment({ typ: 'JWT', alg: 'ES256' })}.${segment({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })}`;
  return `${unsigned}.${b64u(sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }))}`;
}

/** One aes128gcm record (fresh sender key per message): salt ‖ rs ‖ idlen ‖ sender key ‖ ciphertext+tag. */
export function encryptPayload(payload: Buffer, p256dh: string, auth: string): Buffer {
  const uaPublic = Buffer.from(p256dh, 'base64url');
  const sender = createECDH('prime256v1');
  const senderPublic = sender.generateKeys();
  const ikm = hkdf(
    sender.computeSecret(uaPublic),
    Buffer.from(auth, 'base64url'),
    Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, senderPublic]),
    32
  );
  const salt = randomBytes(16);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const sealed = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = senderPublic.length;
  return Buffer.concat([header, senderPublic, sealed]);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  /** Notification buttons; `token` is a task-action token POSTed by the service worker. */
  actions?: { action: string; title: string; token: string }[];
};

/** 'gone' means the browser unsubscribed — the caller should delete the subscription. */
export async function sendPush(sub: PushSubscriptionRow, payload: PushPayload): Promise<'ok' | 'gone' | 'error'> {
  if (!hasPush()) return 'error';
  try {
    const subject =
      process.env.VAPID_SUBJECT || (process.env.BREVO_FROM ? `mailto:${process.env.BREVO_FROM}` : 'mailto:saba@localhost');
    const jwt = vapidJwt(new URL(sub.endpoint).origin, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!, subject);
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        TTL: '86400',
        Urgency: 'high',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: `vapid t=${jwt}, k=${process.env.VAPID_PUBLIC_KEY}`,
      },
      body: new Uint8Array(encryptPayload(Buffer.from(JSON.stringify(payload)), sub.p256dh, sub.auth)),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    if (!res.ok) console.warn('[push] HTTP', res.status, (await res.text()).slice(0, 200));
    return res.ok ? 'ok' : 'error';
  } catch (err) {
    console.warn('[push] failed:', (err as Error).message);
    return 'error';
  }
}
