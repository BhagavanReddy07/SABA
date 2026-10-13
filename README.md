# SABA — the AI assistant whose memory you can see

[![CI](https://github.com/BhagavanReddy07/SABA/actions/workflows/ci.yml/badge.svg)](https://github.com/BhagavanReddy07/SABA/actions/workflows/ci.yml)

**🚀 Try it live: [saba-assistant.vercel.app](https://saba-assistant.vercel.app)** · **📈 [Live stats](https://saba-assistant.vercel.app/stats)**

Most assistants with memory keep it in a black box. SABA remembers you across every
conversation — and shows its work. Every reply **cites the memories it used**, every fact
**links back to the moment it was learned**, facts **update when your life changes** (with the
history kept), and the whole memory can be explored as a **3D galaxy**.

```
                         every message runs the loop
            ┌──────────────────────────────────────────────────────┐
            │   recall  →  generate (with tools)  →  remember      │
            └──────────────────────────────────────────────────────┘

  Tier 1 · Working memory    Redis               the live conversation window
  Tier 2 · Episodic memory   PostgreSQL          full history + evolving facts about you
  Tier 3 · Semantic memory   Pinecone / pgvector meaning-based recall across chats and documents
```

## What makes it different

- **Answers cite your past.** When SABA uses something it knows about you, the reply carries a
  chip like `M2` or `P1` — click it to see the fact, or jump to the exact earlier message it came from.
- **Memory that evolves, not just grows.** Each message is reconciled against what SABA already
  knows (add / update / delete). Say *"I just moved to Pune"* and "lives in Bengaluru" is
  superseded — kept as history, so *"where did I live before?"* still works. A nightly
  **sleep cycle** merges duplicates, retires contradicted facts and compresses finished chats into
  summaries.
- **A glass-box memory.** A memory trace under every reply (what each tier recalled, with
  similarity scores); a Memory panel with provenance ("learned in …"), per-fact history, importance
  and dates; and the **Memory Galaxy** — your memories as a living 3D map of related facts and people.
- **It acts — truthfully.** Native tool calling plays music, drafts emails/WhatsApps, gets
  directions, sets reminders, checks the weather, converts currency and does exact math. Confirmations
  come from tool results, so SABA can't say "done" when nothing happened.
- **It reaches out first.** Reminders arrive by email, Telegram or push notification with
  **Done / Snooze** buttons; an opt-in **morning brief** at 8 AM your time covers today's tasks,
  birthdays coming up and a goal check-in.
- **Your memory, everywhere.** Talk to the same SABA on **Telegram**, plug your memory into
  **Claude Desktop, Cursor or VS Code via MCP**, and install it as an app (PWA).
- **Measured, not claimed.** [SABA Bench](#saba-bench) ablates the memory tiers one at a time;
  [`/stats`](https://saba-assistant.vercel.app/stats) shows live latency per tier.
- **Private by design.** Incognito chats, forget anything (including its search vectors), export
  everything, delete the account in one step, sign out of all devices.

## SABA Bench

One persona (Priya) lives five sessions with SABA — identity, family, diet, a new hobby, two
unrelated questions, and a move to a new city and job — then gets **12 probe questions in fresh
incognito chats**, with the memory tiers switched on one at a time
(`scripts/eval`, run against a local build with Groq's `gpt-oss-120b`):

| Configuration | Overall | Recall | Cross | Update | Temporal | Moment | Abstain | Median reply time |
|---|---|---|---|---|---|---|---|---|
| No memory | **17%** | 0% | 50% | 0% | 0% | 0% | 100% | 1.0 s |
| T1 working only | **17%** | 0% | 50% | 0% | 0% | 0% | 100% | 1.2 s |
| T1 + T2 facts | **75%** | 100% | 100% | 100% | 0% | 0% | 100% | 1.1 s |
| T1 + T2 + T3 semantic (SABA) | **100%** | 100% | 100% | 100% | 100% | 100% | 100% | 1.8 s |

- **Facts (Tier 2) carry recall and updates** — reconcile turned "moved from Bengaluru to Pune" into
  an update, so "where do I live now?" is right without any search.
- **Semantic memory (Tier 3) adds history and past conversations** — "where did I live before?" and
  "which retirement account did you explain?" only work with it.
- **No hallucination without memory:** every configuration declines the "brother's name" probe
  (abstain 100%); the prompt forbids guessing personal details.
- 11 facts stored from 5 sessions, all grounded in what the user said.

Reproduce: start the server with `EVAL_KEY` set, then `EVAL_KEY=… BASE_URL=http://localhost:3000 npm run eval`.
Scoring is deterministic keyword matching on a single persona — a small, honest benchmark, not a
leaderboard. Latency is full-reply time on free tiers.

## All features

| Area | Features |
| --- | --- |
| **Chat** | Streaming replies · stop, regenerate, edit-and-resend · image understanding · Markdown · share a read-only link · export to Markdown · search every message (full-text + meaning, fused with Reciprocal Rank Fusion) · Ctrl+K · mobile drawer · light/dark/system themes |
| **Voice** | Voice input · read-aloud · **Talk mode** (hands-free loop with barge-in and an audio-reactive orb) · 15 languages incl. Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati — memories are stored in English, so what you say in one language is recalled in all |
| **Memory** | 3 tiers with graceful degradation · reconcile (add/update/delete) with history · scored recall (relevance + importance + recency) · nightly consolidation + conversation summaries · citations with provenance · memory trace · Memory panel · Memory Galaxy · "remember that…" / "forget that…" in chat · undo on every "🧠 Learned" toast · incognito chats |
| **Documents** | Drop in a PDF, notes, Markdown, CSV or JSON — chunked by page, full-text indexed and embedded; answers cite the document and page |
| **Tools** | `open_link` (YouTube autoplay, Spotify, Maps, directions, Google, Wikipedia) · `compose` (email, WhatsApp, SMS, call) · reminders & tasks (create, list, complete) · `remember` / `forget` / `search_memory` · `log_goal` · `lookup` (weather, Wikipedia, web search, currency, exact math, date math) · Google Calendar (read/add) |
| **Proactive** | Reminders by email / Telegram / web push with Done & Snooze · morning brief · birthday & anniversary nudges · goal check-ins · "Since we last talked…" cards |
| **Goals** | Goals panel with streaks and weekly check-ins; "ran 5k today" logs progress automatically |
| **Integrations** | Telegram bot · MCP server (personal access tokens) · Google Calendar · installable PWA with push · add reminders to Google Calendar or any calendar (.ics) |
| **Account & safety** | Email verification · password reset · Google sign-in · sign out of all devices · export all data (JSON) · delete account (including vectors) · rate limits on auth, chat, uploads and MCP · signed, purpose-scoped tokens |
| **Fun** | **SABA Wrapped** — a monthly or yearly recap card you can download or share |
| **Ops** | `/stats` observability · one cron job runs everything · CI (typecheck, lint, unit tests, build, browser smoke test) |

**Stack:** Next.js 15 (App Router) · TypeScript · PostgreSQL + pgvector · Redis · Pinecone ·
Groq · Gemini · Tailwind CSS — **12 runtime dependencies**. No ORM, no auth library, no AI SDK,
no email or push SDK (VAPID signing and aes128gcm payload encryption are ~80 lines of `node:crypto`,
with a round-trip test).

---

## Running it on your machine

Follow these steps in order — they work on Windows, macOS, and Linux.

### Step 1 — Install these first

| App | Version | Download | Check it works |
| --- | --- | --- | --- |
| Git | any recent | https://git-scm.com/downloads | `git --version` |
| Node.js | 20 or newer (LTS) | https://nodejs.org | `node --version` |
| Docker Desktop | any recent | https://www.docker.com/products/docker-desktop | `docker --version` |

> **Important:** open Docker Desktop and make sure it is **running** before continuing —
> Postgres (with pgvector) and Redis run inside it.

### Step 2 — Get the code

```bash
git clone https://github.com/BhagavanReddy07/SABA.git
cd SABA
npm install
```

### Step 3 — Create your `.env` file

```bash
# macOS / Linux
cp .env.example .env

# Windows (PowerShell)
copy .env.example .env
```

The minimum to fill in:

```env
DATABASE_URL=postgresql://saba:saba_password@localhost:5432/saba   # leave as-is for Docker
REDIS_URL=redis://localhost:6380                                     # leave as-is for Docker
AUTH_SECRET=<any long random string>
GROQ_API_KEY=<free at https://console.groq.com/keys>
GEMINI_API_KEY=<free at https://aistudio.google.com/apikey>          # images + embeddings
```

Everything else in `.env.example` is optional — each section says what it unlocks. Without
`PINECONE_API_KEY`, Tier 3 runs on pgvector inside your Postgres; without any LLM key SABA runs in
demo mode.

### Step 4 — Start the databases

```bash
npm run setup
```

Starts Postgres + Redis in Docker, waits until they're healthy, and creates all tables
(including the pgvector table). Run it once, or again after `docker compose down -v`.

### Step 5 — Run the app

```bash
npm run dev
```

Open **http://localhost:3000**, create an account, and start chatting.

### Try the memory

1. Say: *"Hi, I'm Priya, a designer from Bengaluru who loves hiking. My sister Ananya's birthday is May 3."*
2. Watch the **🧠 Learned** toasts — SABA saves each fact separately, with the birthday dated.
3. Start a **new** chat and ask *"What do you remember about me?"* — the reply cites `M1`, `M2`…; click one.
4. Say *"I just moved to Pune"*, then ask *"Where did I live before?"*
5. Open **Memory Galaxy** in the sidebar.

---

## Deploying for free

Recommended: **Vercel + Neon** (both free).

1. **Postgres — [Neon](https://neon.tech):** create a project and copy the **pooled** connection
   string (`-pooler` in the host, `?sslmode=require` at the end).
2. **Create the tables:** point `DATABASE_URL` in your local `.env` at Neon and run
   `npm run db:init`. The schema is additive and idempotent — safe to re-run on every deploy, and safe
   to apply *before* deploying new code.
3. **App — [Vercel](https://vercel.com):** import the repo and add the env vars from `.env.example`
   (at least `DATABASE_URL`, `AUTH_SECRET`, `GROQ_API_KEY`, `GEMINI_API_KEY`). Don't set `REDIS_URL`
   unless you use [Upstash](https://upstash.com) — Tier 1 falls back to Postgres.
4. **The scheduler — [cron-job.org](https://cron-job.org) (free):** call
   `https://<your-app>/api/cron/reminders?key=<CRON_SECRET>` every 5 minutes. That one job delivers
   reminders, sends morning briefs at each user's local 8 AM, and runs nightly memory consolidation.

**Optional integrations**

| Integration | Setup |
| --- | --- |
| Email (reminders, brief, verification, reset) | [Brevo](https://app.brevo.com) free tier: verify a sender, then set `BREVO_API_KEY` and `BREVO_FROM`. |
| Google sign-in + Calendar | OAuth Web client in Google Cloud Console; redirect URI `https://<your-app>/api/auth/google/callback`; set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Calendar uses the `calendar.events` scope (testing mode allows 100 users; public launch needs Google's verification). |
| Telegram | Create a bot with [@BotFather](https://t.me/BotFather), set `TELEGRAM_BOT_TOKEN`, deploy, then open `https://<your-app>/api/telegram/setup?key=<CRON_SECRET>` once. Users connect from Settings → Connections. |
| Web push | `npm run vapid`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Users enable it in Settings → Notifications (iOS: after "Add to Home Screen"). |
| Web search tool | `TAVILY_API_KEY` or `BRAVE_API_KEY` (free tiers). |
| Local / private mode | `OLLAMA_URL` (+ `OLLAMA_CHAT_MODEL`, `OLLAMA_EMBED_MODEL=nomic-embed-text`) with pgvector — nothing leaves your machine. |

**MCP:** create a token in Settings → Connections, then add to your MCP client:

```json
{ "mcpServers": { "saba": { "url": "https://<your-app>/api/mcp", "headers": { "Authorization": "Bearer saba_…" } } } }
```

Tools exposed: `search_memory`, `remember`, `forget`, `list_tasks`, `create_reminder`,
`complete_task`, `log_goal`.

## All commands

| Command | What it does |
| --- | --- |
| `npm run dev` | development server → http://localhost:3000 |
| `npm run build` then `npm start` | production build and serve |
| `npm run setup` | start Docker containers + create tables (first-time setup) |
| `npm run docker:up` / `docker:down` | start / stop Postgres + Redis |
| `npm run db:init` | (re)apply the schema — safe to run repeatedly |
| `npm run db:reset` | ⚠ drop all tables and recreate them empty |
| `npm run typecheck` · `npm run lint` | TypeScript · ESLint |
| `npm test` | unit tests (`node:test` via tsx) |
| `npm run test:e2e` | browser smoke test (Playwright) |
| `npm run eval` | SABA Bench (needs `EVAL_KEY` on the server and in the shell) |
| `npm run vapid` | generate web-push keys |

## Project layout

```
src/
├── app/
│   ├── page.tsx · login/ · reset/        landing, sign-in/up, password reset
│   ├── chat/page.tsx                     the app: streaming client, panels, dialogs
│   ├── share/[token]/ · stats/           public read-only share page · live stats
│   ├── manifest.ts · pwa-icon/ · apple-icon.tsx
│   └── api/                              auth · chat · conversations · memories · tasks · goals · documents
│                                         search · export · tokens · mcp · telegram · push · calendar · cron · config · wrapped
├── components/
│   ├── chat/      messages · composer · sidebar · tasks-panel · pulse-cards · talk-mode · wrapped-dialog
│   ├── settings/  settings-dialog · memory-dialog · memory-galaxy · theme-slider
│   └── stats/ · ui/ · landing/
├── lib/           shared types, citations, deep links, calendar export, SSE reader, prefs
└── server/
    ├── assistant.ts       recall → generate (tool loop) → remember; citations; metrics
    ├── llm.ts             Groq / Gemini / Ollama chain: streaming, tool calls, vision, embeddings
    ├── tools.ts           every tool the model can call (+ calc.ts, lookup.ts, calendar.ts)
    ├── memory/            index.ts (recall, reconcile, search) · working.ts (Tier 1) · vectors.ts (Tier 3) · consolidate.ts (sleep)
    ├── db.ts              all SQL (Tier 2 + everything else)
    ├── pulse.ts           the cron tick: reminders, briefs, consolidation
    ├── email.ts · push.ts · telegram.ts · documents.ts · tokens.ts · auth.ts · http.ts
scripts/   init.sql · db.mjs · vapid.mjs · eval/ (SABA Bench)
e2e/       Playwright smoke test
```

## Design notes

- **Three stores, one job each.** Redis keeps the hot conversation window off the database; Postgres
  holds the source of truth (history, facts with validity intervals, documents); the vector store
  only holds ids + embeddings. Recall always re-reads text from Postgres, so a deleted or superseded
  memory can never resurface from a stale vector.
- **Every service is optional.** No Redis → window rebuilt from Postgres. No Pinecone → pgvector. No
  embeddings → keyword recall. No LLM key → demo mode. A provider retires a model → the chain moves on
  (and `GROQ_MODELS` / `GEMINI_MODELS` change it without a code change).
- **Truthful actions.** Tools report what really happened (created, duplicate, nothing matched); clear
  action requests force a tool call; an explicit "remember" is required for the remember tool, while
  passing facts are learned by the reconcile step.
- **Free-tier aware.** Compact tool schemas, a ~9k-character window, per-model token budgets, and a
  single retry after a provider's `retry-after` when every model is rate-limited.
- **No SDKs where a few lines do.** OAuth, SSE parsing, LLM clients, VAPID/aes128gcm and the
  calculator are hand-written and unit-tested.

## Contributing

Contributions are welcome! Fork → branch → PR → owner review → merge to `main` auto-deploys. Every PR
gets a Vercel preview and must pass CI (typecheck, lint, unit tests, build, browser smoke test).
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm run setup` fails / `docker` not found | Docker Desktop isn't running — open it and retry |
| Port 3000 / 5432 in use | stop the other app, or change the port (`npx next dev -p 3001`, or the mapping in `docker-compose.yml` + `DATABASE_URL`) |
| Replies say "demo mode" | no LLM key in `.env` — add `GROQ_API_KEY` (or `GEMINI_API_KEY`) and restart |
| "Trouble reaching my language model" | every model in the chain failed (often free-tier rate limits) — wait a minute; check the server log for each model's error |
| No semantic recall in the memory trace | no `GEMINI_API_KEY` (embeddings), or neither Pinecone nor pgvector is available |
| No reminder emails | Brevo keys missing, the cron job isn't calling `/api/cron/reminders`, or the address isn't verified yet (banner in the app) |
| Want a clean slate | `npm run db:reset` |

## License

[MIT](LICENSE) · Built by Bhagavan Reddy
