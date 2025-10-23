# Deployment guide (quick demo & free hosting)

This guide helps you deploy the SABA project for a demo to your mentor without buying a domain. Two recommended approaches:

1) Quick demo locally or on an always-free VM: use `docker-compose.prod.yml` (runs backend, worker, Postgres, Redis, and frontend in containers). Good for presentation on your machine or a free VM.

2) Free managed hosting split: Deploy frontend on Vercel (free) and backend on Render/Fly/Railway (free plans). This gives HTTPS and simple env management.

---

Local demo with Docker Compose (best for live demo on your laptop)

1. Copy example env file to `.env.prod` in the repo root and edit any values you need (secrets). For Windows PowerShell:

```powershell
cp .env.prod.example .env.prod
# Edit .env.prod with your editor (VS Code)
code .env.prod
```

2. Build and start services (from repo root):

```powershell
docker compose -f docker-compose.prod.yml up --build
```

3. The frontend will be available at http://localhost:3000 and backend at http://localhost:5000.

4. To run DB migrations (if needed) run inside backend container (example):

```powershell
docker compose -f docker-compose.prod.yml run --rm backend python -c "from app.db.utils import create_tables; create_tables(); print('migrated')"
```

5. To stop and remove containers:

```powershell
docker compose -f docker-compose.prod.yml down -v
```

---

Deploy frontend to Vercel (quick, automatic for Next.js)

1. Push your repo to GitHub.
2. Sign up at https://vercel.com and import the GitHub repository.
3. For build & output settings, Vercel auto-detects Next.js; set env var `NEXT_PUBLIC_BACKEND_URL` to your backend URL after you deploy the backend.

Deploy backend to Render (free plan) or Railway/Fly

1. Create a new Web Service on Render using 'Dockerfile' (select Docker). Choose "Deploy from GitHub".
2. Add environment variables from your `.env.prod` (Render has a UI to set envs).
3. For Celery worker, create a separate Background Worker service on Render (point it to the same repo and set the start command to `celery -A app.worker.celery worker -l info` and set the same env vars). Alternatively, run worker inside Docker Compose for local demos.
4. Create a managed Postgres on Render or use the Postgres container locally for demos.

Notes & tips
- If you only need to demo to your mentor and expect them to open a public link, Vercel + Render gives HTTPS URLs automatically and is the easiest path.
- For a simple demo on your laptop, local Docker Compose is the least friction — run what's needed and show it.
- If you want, I can add GitHub Actions to automatically deploy the backend to Render on push and the frontend to Vercel.
