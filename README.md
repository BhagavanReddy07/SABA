# SABA — a personal AI assistant that actually remembers you

**🚀 Try it live: [saba-assistant.vercel.app](https://saba-assistant.vercel.app)**

Most chatbots forget everything when the tab closes. SABA layers **three tiers of
memory** — each in the storage engine built for the job — so every conversation
builds on the last.

```
                     every message runs the loop
              ┌────────────────────────────────────┐
              │    recall → generate → remember    │
              └────────────────────────────────────┘

  Tier 1 · Working memory    Redis       rolling window of the live conversation
  Tier 2 · Episodic memory   PostgreSQL  full history + facts SABA learns about you
  Tier 3 · Semantic memory   Pinecone    vector recall across all past conversations
```

**How a reply is made:**

1. **Recall** — all three tiers are queried in parallel: the recent conversation
   window (Redis), durable facts about the user (Postgres), and semantically
   similar moments from any past conversation (Pinecone, via Gemini embeddings).
2. **Generate** — Gemini **streams** the answer token by token (SSE) with all of
   that context in its system prompt.
3. **Remember** — the exchange is persisted to Postgres, appended to the Redis
   window, embedded into Pinecone, and mined for new durable facts — asynchronously,
   off the response path.

**Beyond memory:**

- **Smart actions** — say *“play Take Five on Spotify”*, *“open the Dune trailer”,*
  or *“write a mail to…”* and SABA opens the right app in a new tab (deep links —
  no extra APIs, no cost).
- **AI conversation titles** — chats name themselves after the first exchange.
- **Voice input & read-aloud** — Web Speech API, right in the browser.
- **Memory trace** — a brain chip under each reply shows exactly what was recalled
  from each tier, with similarity scores.
- **Search, rename, date-grouped history, Markdown export, Ctrl+K, mobile drawer,
  light/dark themes.**

Every tier **degrades gracefully**: no Redis → the window is rebuilt from Postgres;
no Pinecone or Gemini key → the app still chats (demo mode). Each assistant reply
in the UI carries an expandable **memory trace** showing exactly what was recalled
from each tier.

**Stack:** Next.js 15 (App Router) · TypeScript · PostgreSQL · Redis · Pinecone ·
Gemini · Tailwind CSS · Docker — 8 runtime dependencies total. No ORM, no auth
library, no AI SDK.

---

## Running it on your machine

Follow these steps in order — they work on Windows, macOS, and Linux.

### Step 1 — Install these first

| App | Version | Download | Check it works |
| --- | --- | --- | --- |
| Git | any recent | https://git-scm.com/downloads | `git --version` |
| Node.js | 20 or newer (LTS) | https://nodejs.org | `node --version` |
| Docker Desktop | any recent | https://www.docker.com/products/docker-desktop | `docker --version` |

> **Important:** open Docker Desktop and make sure it is **running** (whale icon
> in the taskbar) before continuing — Postgres and Redis run inside it.

### Step 2 — Get the code

```bash
git clone https://github.com/BhagavanReddy07/SABA.git
cd SABA
npm install
```

### Step 3 — Create your `.env` file

Copy the template:

```bash
# macOS / Linux
cp .env.example .env

# Windows (PowerShell)
copy .env.example .env
```

Open `.env` in any editor and fill it in:

```env
# Storage — leave these exactly as-is, they match docker-compose.yml
DATABASE_URL=postgresql://saba:saba_password@localhost:5432/saba
REDIS_URL=redis://localhost:6380

# Auth — paste any long random string. Generate one with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUTH_SECRET=<paste-your-random-string-here>

# Gemini (free) — create a key at https://aistudio.google.com/apikey
# Optional: without it SABA runs in demo mode (no real AI replies).
GEMINI_API_KEY=<your-gemini-key>

# Pinecone (free tier) — create a key at https://app.pinecone.io
# Optional: without it Tier 3 semantic memory is skipped.
PINECONE_API_KEY=<your-pinecone-key>
PINECONE_INDEX=saba-memory
```

You do **not** need to create the Pinecone index yourself — SABA creates
`saba-memory` (768 dimensions, cosine) automatically on first run.

### Step 4 — Start the databases

```bash
npm run setup
```

This starts Postgres + Redis in Docker, waits until they are healthy, and
creates all tables. You only need it once (or after `docker compose down -v`).

### Step 5 — Run the app

```bash
npm run dev
```

Open **http://localhost:3000** — you should see the landing page.
Create an account and start chatting.

### Try the memory

1. Say: *“Hi, I’m Priya, a designer from Bengaluru who loves hiking.”*
2. Watch the **Memory panel** on the right — SABA extracts facts within seconds.
3. Start a **new** conversation and ask: *“What do you remember about me?”*
4. Click the small **brain chip** under any reply to see what each tier recalled.

---

## Deploying for free

Everything SABA needs has a free tier. Recommended stack: **Vercel + Neon**.

1. **Postgres — [Neon](https://neon.tech)** (free): create a project, copy the
   **pooled** connection string (the one with `-pooler` in the host, ending in
   `?sslmode=require`).
2. **Create the tables** — from your machine, point the init script at Neon:
   set `DATABASE_URL` in `.env` to the Neon URL, then run `npm run db:init`.
3. **App — [Vercel](https://vercel.com)** (free): import the GitHub repo
   (framework auto-detected as Next.js) and add these environment variables:
   - `DATABASE_URL` — the Neon pooled URL
   - `AUTH_SECRET` — any long random string
   - `GEMINI_API_KEY` — free at https://aistudio.google.com/apikey
   - `PINECONE_API_KEY` + `PINECONE_INDEX=saba-memory` — free at https://app.pinecone.io
   - **Do not set `REDIS_URL`** — Tier 1 falls back to Postgres automatically.
     (Want it anyway? [Upstash](https://upstash.com) has a free Redis and its
     `redis://` URL drops straight in.)
4. Deploy. Done — no Docker in production.

Also works on **Render** (free web service): build `npm install && npm run build`,
start `npm start`, same env vars. Render's free Postgres works too (expires after
30 days — Neon doesn't, so prefer Neon).

## All commands

| Command | What it does |
| --- | --- |
| `npm run dev` | development server → http://localhost:3000 |
| `npm run build` then `npm start` | production build and serve |
| `npm run setup` | start Docker containers + create tables (first-time setup) |
| `npm run docker:up` / `docker:down` | start / stop Postgres + Redis |
| `npm run db:init` | (re)apply the schema — safe to run repeatedly |
| `npm run db:reset` | ⚠ drop all tables and recreate them empty |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## Contributing

Contributions are welcome! The flow: fork/clone → branch → PR → owner review →
merge to `main` auto-deploys to production. Every PR gets an automatic Vercel
preview deployment and must pass CI (typecheck + lint + build).
See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm run setup` fails / `docker` not found | Docker Desktop isn’t running — open it and retry |
| Port 3000 already in use | stop the other app, or run `npx next dev -p 3001` |
| Port 5432 already in use | you have a local Postgres — stop it, or change the port mapping in `docker-compose.yml` and `DATABASE_URL` |
| Replies say “demo mode” | `GEMINI_API_KEY` is missing or empty in `.env` — add it and restart `npm run dev` |
| Memory trace shows no semantic recalls | `PINECONE_API_KEY` missing, or the index is still warming up on first run |
| Want a clean slate | `npm run db:reset` |

## Project layout

```
src/
├── app/
│   ├── page.tsx              landing (3D neural globe on canvas — no deps)
│   ├── login/                sign in / sign up
│   ├── chat/                 the assistant UI
│   └── api/                  auth, chat, conversations, memories, tasks
├── components/
│   ├── landing/              neural-canvas
│   └── chat/                 sidebar, messages, composer, memory panel
├── server/
│   ├── assistant.ts          the recall → generate → remember pipeline
│   ├── memory/
│   │   ├── index.ts          tier orchestration + fact extraction
│   │   ├── working.ts        Tier 1 — Redis window
│   │   └── semantic.ts       Tier 3 — Pinecone vectors
│   ├── db.ts                 Tier 2 — Postgres (users, conversations, messages, memories, tasks)
│   ├── gemini.ts             chat + embeddings (REST, model fallback chain)
│   ├── auth.ts               HMAC session cookie
│   └── http.ts               route error handling
└── lib/types.ts              shared types
```
