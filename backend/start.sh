#!/usr/bin/env bash
# Simple container entrypoint: run migrations then start uvicorn
set -e

echo "Running DB migrations..."
python -c "from app.db.utils import create_tables; create_tables(); print('migrations done')"

echo "Starting Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-5000}