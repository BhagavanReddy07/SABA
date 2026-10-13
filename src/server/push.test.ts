import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { encryptPayload, vapidJwt } from './push';

const hkdf = (ikm: Buffer, salt: Buffer, info: string | Buffer, n: number) =>
  Buffer.from(hkdfSync('sha256', ikm, salt, typeof info === 'string' ? Buffer.from(info) : info, n));

test('aes128gcm payload decrypts the way a browser does it (RFC 8291)', () => {
  const ua = createECDH('prime256v1');
  const uaPublic = ua.generateKeys();
  const auth = randomBytes(16);
  const message = Buffer.from(JSON.stringify({ title: 'Call mom', body: 'Due now' }));

  const record = encryptPayload(message, uaPublic.toString('base64url'), auth.toString('base64url'));

  const salt = record.subarray(0, 16);
  assert.equal(record.readUInt32BE(16), 4096);
  const idlen = record[20];
  const senderPublic = record.subarray(21, 21 + idlen);
  const ciphertext = record.subarray(21 + idlen);
  const ikm = hkdf(ua.computeSecret(senderPublic), auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, senderPublic]), 32);
  const decipher = createDecipheriv(
    'aes-128-gcm',
    hkdf(ikm, salt, 'Content-Encoding: aes128gcm\0', 16),
    hkdf(ikm, salt, 'Content-Encoding: nonce\0', 12)
  );
  decipher.setAuthTag(ciphertext.subarray(-16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2); // last-record padding delimiter
  assert.deepEqual(plain.subarray(0, -1), message);
});

test('VAPID JWT is a valid ES256 signature over its claims', () => {
  const keys = createECDH('prime256v1');
  keys.generateKeys();
  const pub = keys.getPublicKey().toString('base64url');
  const jwt = vapidJwt('https://fcm.googleapis.com', pub, keys.getPrivateKey().toString('base64url'), 'mailto:a@b.c');
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.ok(claims.exp > Date.now() / 1000);
  const raw = Buffer.from(pub, 'base64url');
  const publicKey = createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') },
    format: 'jwk',
  });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});
