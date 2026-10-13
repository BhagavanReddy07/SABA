# SABA — Project Context (v2)

> Full context for anyone — human or AI agent — working on SABA: what it is, how every part works,
> how to run and operate it, and what's known to be limited.
>
> Written 2026-10-13 after the v2 build, which fixed every issue in the v1 review and implemented its
> whole roadmap. Supersedes the v1 review of commit `d0cf749`.

## Contents

1. [Summary](#1-summary)
2. [What changed in v2](#2-what-changed-in-v2)
3. [Architecture](#3-architecture)
4. [Data model](#4-data-model)
5. [API reference](#5-api-reference)
6. [Frontend](#6-frontend)
7. [Configuration](#7-configuration)
8. [Operations](#8-operations)
9. [Code conventions](#9-code-conventions)
10. [Known limitations & next steps](#10-known-limitations--next-steps)

---

## 1. Summary

SABA is a personal AI assistant whose defining feature is **long-term memory you can see**. Every
message runs *recall → generate (with tools) → remember* across three memory tiers; every reply cites
the memories it used; facts evolve when the user's life changes (with history); and the memory can be
inspected, corrected, exported and explored as a 3D graph.

| | |
|---|---|
| Live | https://saba-assistant.vercel.app · public stats at `/stats` |
| Owner | Bhagavan Reddy ([@BhagavanReddy07](https://github.com/BhagavanReddy07)), MIT |
| Stack | Next.js 15 (App Router), React 18, TypeScript strict, Tailwind 3, PostgreSQL 15 (+pgvector), Redis 7 (optional), Pinecone (optional), Groq + Gemini (+ optional Ollama) |
| Runtime deps | 12 — no ORM, auth library, AI SDK, email SDK or push SDK |
| Quality gates | `tsc`, ESLint (flat config), 23 unit tests (`node:test` via tsx), Playwright smoke test, SABA Bench, CI on every PR |
| Cost | $0 — every service has a free tier and every service except Postgres is optional |

## 2. What changed in v2

**Fixed (all 21 issues from the v1 review)**

- Reminders no longer get dropped: dedupe now requires the *same wording* and a nearby time within a
  10-minute window, and the tool result tells the model the truth ("already set").
- Reminder emails only go to **verified** addresses (verification email on signup; Google accounts
  count as verified), with a per-user daily cap.
- "Forget" really forgets: deleting a fact, chat, document or account removes its vectors — and recall
  re-reads text from Postgres, so even stale vectors can never resurface deleted content.
- Email Done/Snooze buttons **confirm by POST** (link scanners can't trigger them).
- Manual memories are embedded via `after()` (no lost work on Vercel).
- Garbled UI characters fixed; the Tasks panel starts closed on phones; hover-only controls are
  keyboard- and touch-reachable.
- **Rate limits** on login (per IP and per account), signup, password reset, chat, uploads, search,
  export, tokens, MCP and Telegram (Postgres fixed windows).
- Memory self-corrects (reconcile + nightly consolidation); "remember/forget that…" works in chat.
- Semantic recall excludes the current chat, embeds the whole exchange (so SABA can recall its own
  past answers), and fact extraction is gated so most turns skip the extra LLM call.
- Account lifecycle: verification, password reset, sign out of all devices (session versions),
  JSON export, account deletion.
- Memory traces, actions, tool steps and tasks persist with each message (`messages.meta`).
- Stop, regenerate and edit-and-resend.
- The Google button only shows when OAuth is configured; past/absurd reminder times are rejected.
- Docs refreshed; `next lint` replaced by the ESLint CLI; CI restored; tests added.

**Discovered during the build:** Groq retired `llama-3.3-70b-versatile` and `llama-3.1-8b-instant`
(HTTP 404). The deployed v1 silently fell back to Gemini and fails once Gemini's free quota runs out.
v2 uses Groq's current models and makes both chains env-configurable (`GROQ_MODELS`, `GEMINI_MODELS`).

**New**

| Area | What |
|---|---|
| Memory | Reconcile (add/update/delete in one JSON call) · validity intervals + history · Generative-Agents-style ranking (relevance + importance + recency) · nightly **SABA Sleep** (merge, retire, summarize chats) · citations `[M#]/[P#]/[D#]` with provenance · Memory panel with history and "learned in…" · **Memory Galaxy** · incognito chats · Undo on every "🧠 Learned" toast |
| Tools | Native tool calling with truthful results: `open_link`, `compose`, `create_reminder`, `list_tasks`, `complete_task`, `remember`, `forget`, `search_memory`, `log_goal`, `lookup` (weather, Wikipedia, web, currency, math, dates), `calendar` |
| Inputs | Image understanding (Gemini) · document memory (PDF/TXT/MD/CSV/JSON → page-aware chunks, full-text + vectors) · voice in 15 languages · **Talk mode** |
| Proactive | One cron tick: reminders via email/Telegram/push, **morning brief** at local 8 AM, birthday nudges, goal check-ins, nightly consolidation |
| Channels | **Telegram bot** (same brain; streamed replies; reminder buttons) · **MCP server** with personal access tokens · installable **PWA** with web push |
| Productivity | Goals & streaks panel · add reminders to Google Calendar or `.ics` · Google Calendar tool · search every message (FTS + vectors, RRF) · share read-only links |
| Proof | **SABA Bench** (ablation by tier) · public **`/stats`** (turn metrics) |
| Fun | **SABA Wrapped** recap cards (download / share) |

## 3. Architecture

### 3.1 A chat turn

```
POST /api/chat {message, conversationId?, images?, incognito?, replaceLastTurn?, clientTime, timezone}
  │  auth (session cookie, version-checked) · validation · rate limit · AbortController (Stop)
  ▼
chatStream()                                   src/server/assistant.ts
  1. conversation: load / create (incognito flag) / replaceLastTurn (delete last turn + its vectors)
  2. recall()                                  src/server/memory/index.ts
       T1 Redis window (20 turns; rebuilt from Postgres when cold)
       T2 current facts → ranked: 0.5·relevance + 0.3·importance + 0.2·recency → top 15
       T3 embed query → vector search (≤1.5 s budget) → ids resolved against Postgres
          (messages + their replies, facts incl. "formerly true", summaries, document chunks)
     → sources tagged M1… (facts) P1… (moments/summaries) D1… (documents)       ──► SSE start {conversation, trace}
  3. tool loop (≤4 rounds) over streamChat()   src/server/llm.ts · src/server/tools.ts
       text deltas                                                                 ──► SSE delta
       tool calls → runTool() → result fed back (truthful)                          ──► SSE tool {step}
       clear action requests force a tool call in round 1; tool failure → retry without tools
  4. save user + assistant messages (meta: trace, actions, tasks, tools, notice, model) · turn metrics
                                                                                   ──► SSE done {message, userMessage}
  5. after done (stream stays open): auto-title (new chats) ──► SSE title · memory reconcile ──► SSE memory {update}
     Everything post-response is also registered with after(), so it finishes even if the client leaves.
```

### 3.2 Memory

| | Tier 1 · Working | Tier 2 · Episodic | Tier 3 · Semantic |
|---|---|---|---|
| Store | Redis list `saba:wm:<conversationId>` (24 h TTL) | Postgres: `messages`, `memories` (+ history), `document_chunks` | Pinecone if `PINECONE_API_KEY`, else pgvector table `memory_vectors` |
| Holds | last 20 turns | everything; facts with `valid_from/valid_to/superseded_by`, importance, use count, source message, event date, entities | ids + 768-d embeddings + `{userId, kind, conversationId?, documentId?}` |
| Ids | — | uuid | user message uuid · `memory-<uuid>` · `doc-<documentId>-<n>` |
| Fallback | rebuilt from Postgres | required | skipped (keyword recall still works) |

- **Reconcile** (`reconcileFacts`): gated to first-person or non-English messages ≥12 chars. One JSON
  call compares the exchange with up to 40 known facts (most relevant first) and returns
  `add / update / delete` ops — atomic facts in English, third person, with importance, `MM-DD` dates
  (plus a deterministic fallback parser) and entities. Updates supersede (history kept); deletes retire.
- **SABA Sleep** (`memory/consolidate.ts`): during the user's night (or after 48 h), merges duplicates,
  retires contradicted facts, and summarizes finished chats (≥8 messages, idle 6 h) into `summary`
  memories that Tier 3 recalls.
- **Search** (`searchMemory`, `searchChats`): Postgres full-text (`simple` config, prefix tsquery) and
  vectors, fused with Reciprocal Rank Fusion.
- **Embeddings**: Gemini `gemini-embedding-001` (batch) or Ollama `nomic-embed-text`, both 768-d.

### 3.3 LLM layer (`src/server/llm.ts`)

- Neutral message format → OpenAI-style (Groq, Ollama) or Gemini wire formats; streaming with tool
  calls for both; images route to Gemini.
- Chain: Ollama (if `OLLAMA_URL`) → Groq `openai/gpt-oss-120b` → `qwen/qwen3.8-27b` → `openai/gpt-oss-20b`
  → Gemini `2.5-flash-lite` → `2.5-flash` → `flash-latest`. Env-overridable. A model that fails before
  output falls through; after partial output the stream stops cleanly.
- If **every** model is rate-limited, waits once (≤8 s, honouring `retry-after`) and retries.
- Reasoning models get `reasoning_effort` low/none; Gemini 2.5 thinking disabled for latency.
- Budget: ~1.1k tokens of tool schemas, ~9k-char window, 1,024-token replies — sized for 8k TPM tiers.

### 3.4 Tools (`src/server/tools.ts`)

| Tool | Notes |
|---|---|
| `open_link` | YouTube (resolves a video id for autoplay), Spotify, Maps, directions, Google, Wikipedia |
| `compose` | email (mailto), WhatsApp, SMS, call |
| `create_reminder` / `list_tasks` / `complete_task` | validates ISO time (not past, <5 years), wording-aware dedupe |
| `remember` / `forget` / `search_memory` | remember needs an explicit request (implicit facts go through reconcile); never in incognito; forget accepts `M#` refs or a description |
| `log_goal` | matches a goal fact; returns the streak |
| `lookup` | Open-Meteo weather, Wikipedia, Tavily/Brave web search, Frankfurter currency, safe calculator (`calc.ts`; "23.5% of 1847.25", "1000 + 18%"), date math. Arithmetic in a message forces this tool, like reminders do |
| `calendar` | Google Calendar list/add (only when connected) |

### 3.5 Scheduled work (`src/server/pulse.ts`)

The existing 5-minute cron (`GET /api/cron/reminders?key=CRON_SECRET`) runs `cronTick()`:
reminders (≤50; email to verified users under a 25/day cap, Telegram, push; retried unless a day late)
→ morning briefs (users at local 8–9 AM, once per local day) → consolidation (≤2 users/run) →
rate-limit cleanup. Each step is bounded to fit a 60 s invocation.

### 3.6 Channels

- **Telegram** (`telegram.ts`): webhook verified by a secret header, processed in `after()`; `/start
  <code>` links accounts (code from Settings, 15 min); `/new`; replies stream by editing one message;
  reminder buttons via callback queries (ownership checked).
- **MCP** (`api/mcp`): JSON-RPC 2.0 over Streamable HTTP (JSON responses), protocol versions
  2025-06-18 / 2025-03-26 / 2024-11-05; Bearer personal access tokens (SHA-256 stored); exposes 7 tools
  reusing the chat tool implementations.
- **Web push** (`push.ts` + `public/sw.js`): VAPID ES256 JWT + aes128gcm (RFC 8291) on `node:crypto`,
  round-trip tested; notification buttons POST signed task tokens.

### 3.7 Security model

Sessions are HMAC-signed `{p:'s', uid, v}` cookies (7 days); `users.session_version` revokes them.
Every token carries a purpose (`s` session, `t` task action, `v` verify, `r` reset — single-use via a
password-hash fingerprint, `sh` share) so one can't be replayed as another; pre-v2 session and task
tokens remain valid. Google refresh tokens are sealed with AES-256-GCM. Every user-owned query
filters on `user_id`.

## 4. Data model

```
users ──┬──< conversations ──< messages (meta jsonb, search tsvector)
        ├──< memories (validity, history, provenance, importance, event_date, entities) ──< goal_logs
        ├──< tasks
        ├──< documents ──< document_chunks (search tsvector)
        ├──< access_tokens · push_subscriptions · google_tokens (sealed)
        └──< memory_vectors (pgvector, only when Pinecone isn't used)
rate_limits · turn_metrics (aggregate only — no user id, no content)
```

`scripts/init.sql` is idempotent and **additive** (it keeps v1's unique index; re-learning a
superseded fact revives it), so it can be applied to production before or after deploying v2 code.

## 5. API reference

| Route | Methods | Purpose |
|---|---|---|
| `/api/auth/signup` · `/login` · `/logout` | POST | accounts (rate limited); signup sends verification |
| `/api/auth/me` | GET · PATCH · DELETE | profile, morning-brief toggle, delete account |
| `/api/auth/verify` | GET (link) · POST (resend) | email verification |
| `/api/auth/forgot` · `/api/auth/reset` | POST | password reset (no account enumeration) |
| `/api/auth/sessions` | DELETE | sign out of all devices |
| `/api/auth/google` (`?calendar=1`) · `/callback` | GET | Google sign-in / Calendar connect |
| `/api/chat` | POST | SSE chat stream |
| `/api/conversations` · `/[id]` · `/[id]/share` | GET · PATCH · DELETE · POST | chats, rename, delete (all tiers), share links |
| `/api/memories` (`?history=1`) · `/[id]` (`?undo=1`) · `/graph` | GET · POST · DELETE | memory, undo, Galaxy graph |
| `/api/tasks` · `/[id]` · `/act` | GET · POST · PATCH · DELETE | tasks; `/act` = email/push buttons (GET confirm page, POST action) |
| `/api/goals` · `/api/documents` · `/[id]` | GET · POST · DELETE | goals with logs, document memory |
| `/api/search` · `/api/export` · `/api/wrapped` · `/api/config` | GET | search, data export, Wrapped, feature flags |
| `/api/tokens` · `/[id]` · `/api/mcp` | GET · POST · DELETE | MCP tokens and server |
| `/api/telegram` · `/link` · `/setup` | POST · DELETE · GET | Telegram webhook, link codes, webhook setup |
| `/api/push` · `/api/calendar` | POST · DELETE | push subscriptions, Calendar disconnect |
| `/api/cron/reminders` | GET | the cron tick |

## 6. Frontend

- **Pages:** `/` landing (3D neural globe) · `/login` (sign in, sign up, forgot password) · `/reset` ·
  `/chat` · `/share/[token]` (public, read-only, noindex) · `/stats` (public dashboard).
- **Chat** (`app/chat/page.tsx`): streaming client (`lib/sse.ts`), stop/regenerate/edit, attachments,
  Pulse cards, verify-email banner, incognito toggle, share/export, Talk mode, toasts with Undo.
- **Components:** `messages` (citation chips, tool steps, action & task cards, memory trace) ·
  `composer` (attachments, drag/paste, voice, Talk, Stop) · `sidebar` (search every message, Galaxy,
  Wrapped) · `tasks-panel` (Tasks + Goals) · `pulse-cards` · `talk-mode` · `wrapped-dialog` ·
  `settings-dialog` (6 tabs) · `memory-dialog` (memories + documents) · `memory-galaxy` · `stats/charts`.
- **Theming:** CSS-variable tokens; dark default; light mode scoped to `/chat`.

## 7. Configuration

| Variable | Needed for | Without it |
|---|---|---|
| `DATABASE_URL`, `AUTH_SECRET` | everything | app can't run |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `OLLAMA_URL` | chat | demo mode |
| `GEMINI_API_KEY` or `OLLAMA_URL` | embeddings, images (Gemini) | keyword-only recall, no images |
| `PINECONE_API_KEY`, `PINECONE_INDEX` | Tier 3 on Pinecone | pgvector, if installed |
| `REDIS_URL` | Tier 1 cache | rebuilt from Postgres |
| `GROQ_MODELS`, `GEMINI_MODELS`, `OLLAMA_*_MODEL` | model overrides | defaults |
| `BREVO_API_KEY`, `BREVO_FROM` | email | no email features |
| `CRON_SECRET` | the cron tick, Telegram setup | 401 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in + Calendar | hidden |
| `TELEGRAM_BOT_TOKEN` | Telegram | hidden |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web push | hidden |
| `TAVILY_API_KEY` / `BRAVE_API_KEY` | web search tool | tool says it's unavailable |
| `EVAL_KEY` | SABA Bench tier switching | header ignored |

## 8. Operations

- **Deploy:** `npm run db:init` against Neon (safe any time) → deploy to Vercel → cron-job.org every 5
  min → optional: Telegram setup URL, VAPID keys, Google OAuth redirect URI.
- **Checks:** `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · `npm run test:e2e`
  (CI runs all of them; e2e runs in demo mode against a pgvector Postgres service).
- **SABA Bench:** start the server with `EVAL_KEY`, then `EVAL_KEY=… BASE_URL=… npm run eval` →
  `scripts/eval/results.md`. One persona, 12 probes × 4 tier configurations (latest: 17% → 17% → 75% → 100% as tiers are added); probes run in incognito
  chats so they don't pollute memory; the test account is deleted afterwards.
- **Observability:** `/stats` (p50/p95 first token, per-tier recall latency, recall/tool/fallback/error
  rates, model share, daily volume). Server logs prefix every subsystem (`[assistant]`, `[memory]`,
  `[cron/…]`, `[telegram]`, `[push]`).

## 9. Code conventions

- All SQL in `src/server/db.ts`; schema changes additive and idempotent in `scripts/init.sql`.
- Every user-owned query filters on `user_id`. Route handlers: `handle()` + `requireUser()` + `readJson()` + `limit()`.
- Post-response work via `after()` (or the `defer` passed through `chatStream`), never bare promises.
- Every outbound `fetch` has a timeout; optional services fail soft.
- Tool results must describe what actually happened. Text shown to users never relies on hover alone.
- `ponytail:` comments mark deliberate simplifications and their upgrade path.
- Logic with branches gets a `*.test.ts` beside it.

## 10. Known limitations & next steps

- **Free-tier throughput.** Groq allows ~8k tokens/minute per model; bursts fall back through the chain
  and may wait once. Heavy use needs a paid tier or a local model (`OLLAMA_URL`).
- **Model behaviour.** Models occasionally use odd formats (e.g. `【M1】` citations, narrow no-break
  spaces) — parsers normalize what's been seen; the prompt forbids guessing personal details.
- **Reminders** are one-off (no recurrence yet); dedupe is a 10-minute heuristic.
- **Documents:** text-based files only (no OCR for scanned PDFs), 4 MB cap, ≤300 chunks.
- **Telegram:** text only (no voice notes or photos yet).
- **Google Calendar** needs Google's app verification beyond 100 test users.
- **iOS push** works only after "Add to Home Screen"; notification buttons are Chromium-only.
- **Talk mode** depends on the browser's speech APIs (best in Chrome/Edge).
- **Switching embedding providers** on an existing index mixes vector spaces — re-embed instead.
- **SABA Bench** uses keyword scoring and a single persona; adding personas and an LLM judge is the
  natural next step.
