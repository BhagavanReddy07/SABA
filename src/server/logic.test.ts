import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { seal, signToken, unseal, verifyToken } from './tokens';
import { createSessionToken, verifySessionToken } from './auth';
import { createTaskActionToken, parseVerifyToken, verifyLink, verifyTaskActionToken } from './email';
import { sameWording } from './tools';
import { chunkPages } from './documents';
import { memoryInput, rankFacts, toTsQuery, worthExtracting } from './memory';
import { toTelegramHtml } from './telegram';
import { parseJsonLoose } from './llm';

// Every module reads AUTH_SECRET lazily, at call time.
process.env.AUTH_SECRET = 'test-secret-for-unit-tests-only';

/** Token in the pre-purpose format ({...payload}.hmac) that older emails/cookies still carry. */
function legacyToken(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', process.env.AUTH_SECRET!).update(body).digest('base64url')}`;
}

test('signed tokens reject tampering and expiry', () => {
  const token = signToken({ p: 'x', n: 1 }, 60_000);
  assert.equal(verifyToken<{ n: number }>(token)?.n, 1);
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ p: 'x', n: 2, exp: Date.now() + 60_000 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${sig}`), null);
  assert.equal(verifyToken(`${body}.${sig}x`), null);
  assert.equal(verifyToken(signToken({ p: 'x' }, -1)), null);
  assert.equal(verifyToken('garbage'), null);
});

test('sessions: versioned, purpose-checked, and pre-upgrade cookies stay valid', () => {
  const s = verifySessionToken(createSessionToken({ id: 'u1', sessionVersion: 3 }));
  assert.deepEqual(s, { userId: 'u1', version: 3 });
  assert.deepEqual(verifySessionToken(legacyToken({ uid: 'u2', exp: Date.now() + 60_000 })), { userId: 'u2', version: 0 });
  // A verification-link token must never work as a session cookie.
  const verify = new URL(verifyLink({ id: 'u1', email: 'a@b.c' }, 'http://x')).searchParams.get('token')!;
  assert.equal(verifySessionToken(verify), null);
  assert.deepEqual(parseVerifyToken(verify), { userId: 'u1', email: 'a@b.c' });
});

test('task-action tokens: new and legacy formats, nothing else', () => {
  assert.deepEqual(verifyTaskActionToken(createTaskActionToken('t1', 'snooze')), { taskId: 't1', action: 'snooze' });
  assert.deepEqual(verifyTaskActionToken(legacyToken({ tid: 't2', act: 'complete', exp: Date.now() + 60_000 })), {
    taskId: 't2',
    action: 'complete',
  });
  assert.equal(verifyTaskActionToken(createSessionToken({ id: 'u1', sessionVersion: 0 })), null);
  assert.equal(verifyTaskActionToken(signToken({ p: 't', tid: 't3', act: 'delete' })), null);
});

test('sealed secrets round-trip and detect tampering', () => {
  const sealed = seal('1//refresh-token');
  assert.equal(unseal(sealed), '1//refresh-token');
  assert.equal(unseal(sealed.slice(0, -2) + 'AA'), null);
});

test('reminder dedupe compares wording, not just time (the old bug)', () => {
  assert.ok(sameWording('Call mom', 'call Mom'));
  assert.ok(sameWording('Call mom', 'Call my mom'));
  assert.ok(!sameWording('Call mom', 'Take vitamins'));
  assert.ok(!sameWording('Submit report', 'Book dentist appointment'));
});

test('document chunking keeps pages and overlaps', () => {
  const page = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about the lease terms.`).join(' ');
  const chunks = chunkPages([page, 'Short second page with enough text to keep.']);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((c) => c.content.length <= 1300));
  assert.equal(chunks[chunks.length - 1].page, 2);
  assert.deepEqual(chunkPages(['   ']), []);
});

test('memory gate, ranking and full-text query building', () => {
  assert.ok(worthExtracting('I moved to Pune last month'));
  assert.ok(worthExtracting('నా పేరు ప్రియ')); // non-English → let the model decide
  assert.ok(!worthExtracting('What is the capital of France?'));
  assert.ok(!worthExtracting('ok thanks'));

  const now = new Date().toISOString();
  const fact = (id: string, content: string, importance: number) =>
    ({ id, content, importance, createdAt: now, lastUsedAt: null }) as Parameters<typeof rankFacts>[0][number];
  const ranked = rankFacts(
    [fact('a', 'User likes jazz.', 4), fact('b', 'User is allergic to peanuts.', 9), fact('c', 'User has a cat named Miso.', 5)],
    'Can my cat eat this?',
    new Map(),
    2
  );
  assert.deepEqual(ranked.map((f) => f.id), ['c', 'b']); // relevant first, then the important one

  assert.equal(toTsQuery('sister birthday'), 'sister:* & birthday:*');
  assert.equal(toTsQuery("it's ok", '|'), 'it:* | s:* | ok:*');
  assert.equal(toTsQuery('!!!'), null);
  assert.equal(memoryInput({ fact: "User's sister's birthday is on May 3." }, null).eventDate, '05-03');
});

test('telegram html escapes user text and strips citations', () => {
  assert.equal(toTelegramHtml('**Done** <script> [M1]'), '<b>Done</b> &lt;script&gt;');
  assert.equal(toTelegramHtml('[docs](https://example.com/a?b=1&c=2)'), '<a href="https://example.com/a?b=1&amp;c=2">docs</a>');
  assert.equal(toTelegramHtml('```\nx < y\n```'), '<pre>x &lt; y</pre>');
});

test('lenient JSON parsing survives fences and prose', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"ops":[]}\n```'), { ops: [] });
  assert.deepEqual(parseJsonLoose('Here you go: {"ops":[{"op":"add"}]} hope that helps'), { ops: [{ op: 'add' }] });
  assert.throws(() => parseJsonLoose('no json here'));
});
