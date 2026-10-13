// SABA Bench — measures what each memory tier contributes.
//
//   EVAL_KEY=<same as the server's> BASE_URL=http://localhost:3000 npm run eval
//
// For each persona: sign up a throwaway account, plant facts over several chats (with distractor
// chats and a life update), then ask probe questions in fresh incognito chats with memory tiers
// switched on one at a time (server honours x-saba-tiers only with the matching EVAL_KEY). Prints a
// markdown table and writes scripts/eval/results.md. The account is deleted afterwards.
//
// Scoring is deterministic keyword matching (see scenarios.json); "grounded facts" is a heuristic:
// a stored fact counts as grounded when it shares a content word with something the user said.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const EVAL_KEY = process.env.EVAL_KEY;
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS ?? 1500); // stay inside free-tier per-minute budgets
if (!EVAL_KEY || EVAL_KEY.length < 16) {
  console.error('Set EVAL_KEY (≥16 chars) to the same value the server was started with.');
  process.exit(1);
}

const CONFIGS = [
  { label: 'No memory', tiers: '' },
  { label: 'T1 working only', tiers: 't1' },
  { label: 'T1 + T2 facts', tiers: 't1,t2' },
  { label: 'T1 + T2 + T3 semantic (SABA)', tiers: 't1,t2,t3' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STOP = new Set('the a an and or but of to in on at for with is are was were be my me i you your it this that what who how when where do does did can user users has have had now these days'.split(' '));
const words = (s) => new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOP.has(w)));

async function api(cookie, path, init = {}) {
  return fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', cookie, ...init.headers },
    redirect: 'manual',
  });
}

/** Sends one message and reads the whole SSE stream (reply + memory/title events). */
async function chat(cookie, message, { tiers = 't1,t2,t3', conversationId, incognito = false } = {}) {
  const started = Date.now();
  const res = await api(cookie, '/api/chat', {
    method: 'POST',
    headers: { 'x-saba-eval-key': EVAL_KEY, 'x-saba-tiers': tiers },
    body: JSON.stringify({ message, conversationId, incognito, clientTime: new Date().toString(), timezone: 'Asia/Kolkata' }),
  });
  if (!res.ok) throw new Error(`chat HTTP ${res.status}: ${await res.text()}`);
  // Reading the whole stream measures full reply time (exact first-token latency lives in /stats).
  const text = await res.text();
  const ms = Date.now() - started;
  let reply = '';
  let conversation;
  for (const frame of text.split('\n\n')) {
    const line = frame.split('\n').find((l) => l.startsWith('data:'));
    if (!line) continue;
    const event = JSON.parse(line.slice(5));
    if (event.type === 'start') conversation = event.conversation.id;
    if (event.type === 'done') reply = event.message.content;
    if (event.type === 'error') throw new Error(event.message);
  }
  return { reply, conversation, ms };
}

// Models emit curly quotes, Markdown and exotic spaces (e.g. U+202F in "May 3") — compare plain text.
const plain = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[*_`]/g, '').replace(/\s+/g, ' ');

function score(probe, reply) {
  const r = plain(reply);
  const ok = probe.expect.every((group) => group.some((k) => r.includes(plain(k))));
  const bad = (probe.forbid ?? []).some((k) => r.includes(plain(k)));
  return ok && !bad;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

const { personas } = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'));
const results = CONFIGS.map((c) => ({ ...c, byType: {}, passed: 0, total: 0, ms: [] }));
const facts = { stored: 0, grounded: 0 };
const failures = [];

for (const persona of personas) {
  const email = `bench+${Date.now()}@example.com`;
  const signup = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: persona.name, password: `bench-${Date.now()}` }),
  });
  if (!signup.ok) throw new Error(`signup failed: ${signup.status} ${await signup.text()}`);
  const cookie = signup.headers.get('set-cookie').split(';')[0];
  console.log(`\n▶ ${persona.name}: planting ${persona.sessions.length} sessions…`);

  try {
    const said = [];
    for (const session of persona.sessions) {
      let conversationId;
      for (const message of session) {
        const { conversation } = await chat(cookie, message, { conversationId });
        conversationId = conversation;
        said.push(message);
        await sleep(PAUSE_MS);
      }
    }
    await sleep(4000); // let deferred indexing finish

    const memories = (await (await api(cookie, '/api/memories')).json()).memories ?? [];
    const userWords = words(said.join(' '));
    facts.stored += memories.length;
    facts.grounded += memories.filter((m) => [...words(m.content)].some((w) => userWords.has(w))).length;
    console.log(`  ${memories.length} facts stored:`, memories.map((m) => m.content).join(' | '));

    for (const config of results) {
      for (const probe of persona.probes) {
        const { reply, ms } = await chat(cookie, probe.q, { tiers: config.tiers, incognito: true });
        const pass = score(probe, reply);
        config.total++;
        config.passed += pass ? 1 : 0;
        config.ms.push(ms);
        const t = (config.byType[probe.type] ??= { passed: 0, total: 0 });
        t.total++;
        t.passed += pass ? 1 : 0;
        if (!pass && config.tiers === 't1,t2,t3') failures.push(`${probe.q} → ${reply.replace(/\s+/g, ' ').slice(0, 160)}`);
        process.stdout.write(pass ? '✓' : '·');
        await sleep(PAUSE_MS);
      }
      process.stdout.write(`  ${config.label}\n`);
    }
  } finally {
    await api(cookie, '/api/auth/me', { method: 'DELETE', body: JSON.stringify({ confirm: email }) });
  }
}

const types = ['recall', 'cross', 'update', 'temporal', 'moment', 'abstain'];
const pctOf = (t) => (t && t.total ? `${Math.round((t.passed / t.total) * 100)}%` : '—');
const rows = results.map(
  (r) =>
    `| ${r.label} | **${pctOf(r)}** | ${types.map((t) => pctOf(r.byType[t])).join(' | ')} | ${(median(r.ms) / 1000).toFixed(1)} s |`
);
const table = [
  `| Configuration | Overall | ${types.map((t) => t[0].toUpperCase() + t.slice(1)).join(' | ')} | Median reply time |`,
  `|---|---|${types.map(() => '---').join('|')}|---|`,
  ...rows,
].join('\n');
const report = `# SABA Bench results

Run ${new Date().toISOString().slice(0, 10)} against ${BASE} · ${results[0].total} probes per configuration.

${table}

Facts stored after planting: ${facts.stored} · grounded in what the user said: ${facts.stored ? Math.round((facts.grounded / facts.stored) * 100) : 0}% (heuristic).
${failures.length ? `\nMisses with all tiers on:\n${failures.map((f) => `- ${f}`).join('\n')}\n` : ''}`;

console.log(`\n${report}`);
writeFileSync(join(here, 'results.md'), report);
