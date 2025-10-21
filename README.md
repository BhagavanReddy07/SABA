# SABA – AI Assistant (Next.js + FastAPI)

A full-stack AI assistant with tasks, reminders, chat, and persistent memory.

## Prerequisites

- Node.js 18+ (or 20+)
- Python 3.10+
- Docker (recommended) for Postgres + Redis

## Quick start (local)

### One-command with Docker Compose (recommended)

1) Ensure Docker Desktop is installed and running.
2) Optional: set API keys by creating a `.env` at the repo root to override compose envs (e.g., `GEMINI_API_KEY`, `SENDGRID_API_KEY`).
3) From the project root, run: `docker compose up -d`
4) Open http://localhost:3000

What this starts:
- `frontend` (Next.js dev server on 3000)
- `backend` (FastAPI on 5000)
- `postgres` (DB on 5432)
- `redis` (broker on 6379)
- `worker` (Celery worker for scheduled emails)

Defaults used in compose:
- Frontend → Backend URL: `NEXT_PUBLIC_BACKEND_URL=http://backend:5000`
- Backend DB: `postgres://saba:saba@postgres:5432/saba`
- Backend Redis: `redis://redis:6379/0`
- Email (optional): set `SENDGRID_API_KEY` to enable email sending

If you prefer running services natively, use the manual setup below.

1) Clone and set env files

- Copy `.env.example` to `.env.local` and set values:
	- `NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000`
	- Optionally `GEMINI_API_KEY=<your-key>` for chat responses
- Copy `backend/.env.example` to `backend/.env` and set values (DB, Redis, SendGrid, JWT_SECRET)

2) Start infrastructure (DB + Redis)

- If you have Docker, from `backend/` run:
	- `docker compose up -d` (if a compose file exists)
	- Or run your local Postgres and Redis matching `backend/.env`

3) Backend (FastAPI)

- In `backend/` create a virtualenv and install:
	- `pip install -r requirements.txt`
- Run API:
	- `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`
- Optional: Celery worker (for scheduled email reminders):
	- `celery -A app.worker.celery worker -l info`

4) Frontend (Next.js)

- In project root, install deps:
	- `npm install`
- Run dev server:
	- `npm run dev` (http://127.0.0.1:3000)

Login/Signup is file-based; tokens are stored client-side. The frontend calls the backend on `NEXT_PUBLIC_BACKEND_URL`.

## Features

- Chat with Gemini (if `GEMINI_API_KEY` set)
- Create reminders from chat; backend schedules email (requires Redis + Celery + SendGrid)
- Tasks list with complete/toggle/delete synced to backend
- Conversations list with delete (persisted locally in `.data`)
- Memory extraction when leaving a chat and “Memorize now” on demand; deduped and editable

## Deployment notes

- Frontend: build and deploy any Next.js host
	- `npm run build` then `npm start` for Node hosting
- Backend: deploy as a container or a Python app service
	- Provide envs from `backend/.env.example`
	- Ensure Postgres + Redis are reachable
	- Add Celery worker if you want scheduled emails
- Required vars:
	- Frontend: `NEXT_PUBLIC_BACKEND_URL`, optional `GEMINI_API_KEY`
	- Backend: DB/REDIS URLs, `JWT_SECRET`, optional `SENDGRID_API_KEY`

## Project structure

- `src/` – Next.js app and API routes
- `backend/` – FastAPI, Celery worker, DB utils
- `.data/` – local file storage (users, conversations, memories)
- `public/`, `next.config.js`, `tailwind.config.ts` – frontend build assets/config

## Troubleshooting

- If tasks don’t complete: check `SENDGRID_API_KEY` is set; completion happens only after successful email send.
- If chat says Unauthorized: ensure the client has a valid token (login) and backend is reachable on `127.0.0.1:8000`.
- If you see `::1` connection errors, stick to `127.0.0.1` in envs.

## Scripts

- Frontend:
	- `npm run dev` – Next dev server
	- `npm run build` – build
	- `npm start` – start production build
- Backend:
	- `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`
	- `celery -A app.worker.celery worker -l info`
