# Docker Compose for AI-assistant-prototype

This repository includes a `docker-compose.yml` to run the three memory/storage layers locally:

- Postgres (long-term memory)
- Redis (short-term memory)
- Neo4j (semantic memory)

Files added

- `docker-compose.yml` — compose config for the three services
- `.env.example` — example environment variables to copy into `.env.local` or your environment

Quick start (PowerShell)

1. Copy `.env.example` to `.env.local` (or create `.env` in project root):

```powershell
copy .env.example .env.local
```

2. Start the services (detached):

```powershell
docker compose up -d
```

3. Wait for containers to pass health checks. Check logs:

```powershell
docker compose logs -f
```

4. Connect your app using these env vars (example names):

- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string
- `NEO4J_URL`, `NEO4J_USER`, `NEO4J_PASSWORD` — Neo4j connection details

Running Prisma migrations (if using Prisma)

If you choose Prisma (recommended):

1. Install prisma and client:

```powershell
npm install prisma @prisma/client
npx prisma init
```

2. Update `prisma/schema.prisma` with `provider = "postgresql"` and `DATABASE_URL` as in `.env.local`.
3. Run migration (with Postgres started by Docker):

```powershell
npx prisma migrate dev --name init
```

Backups

- Postgres backup:

```powershell
docker exec -t saba-postgres pg_dump -U saba saba > saba-backup.sql
```

- Redis backup: copy `dump.rdb` from the redis volume or run `redis-cli SAVE` inside the container.

- Neo4j backup: use `neo4j-admin dump` inside container to export/restore.

Notes & tips

- Do not commit `.env.local` with secrets to version control. Use `.env.example` only.
- For production, use managed DB services and a secrets manager. The Compose file is for local development/testing only.
- If services are not accessible on `localhost` (e.g., Docker Desktop on macOS M1 with special networking), you can use the internal service names in server code (e.g. `postgres:5432`) when running app in Docker as well.

If you want, I can:

- Add a simple `prisma/schema.prisma` and initial migration files.
- Wire up `src/lib/redis.ts` and DB config to read env vars (I can update the code to use `REDIS_URL` and `DATABASE_URL`).
- Add a small worker script to persist Redis messages into Postgres asynchronously.

Tell me which of the above you want next and I will implement it.