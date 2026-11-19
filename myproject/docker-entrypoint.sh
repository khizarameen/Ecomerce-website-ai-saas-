#!/bin/sh
set -eu

echo "Waiting for database connection..."
python - <<'EOF'
import os
import socket
import time
from urllib.parse import urlparse

db_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or ""
if db_url.startswith("postgres"):
    parsed = urlparse(db_url)
    host = parsed.hostname or "db"
    port = int(parsed.port or 5432)
    for attempt in range(45):
        try:
            with socket.create_connection((host, port), timeout=2):
                print(f"PostgreSQL reachable at {host}:{port}")
                break
        except OSError:
            if attempt == 44:
                print(f"Timed out waiting for PostgreSQL at {host}:{port}; continuing anyway.")
            else:
                time.sleep(1)
else:
    print("Non-Postgres DATABASE_URL or SQLite mode; skipping TCP wait.")
EOF

echo "Running Django migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput --clear

echo "Seeding demo StoreHub data (idempotent)..."
python manage.py seed_demo

WORKERS="${GUNICORN_WORKERS:-2}"
THREADS="${GUNICORN_THREADS:-4}"
echo "Starting Gunicorn on 0.0.0.0:8000 (workers=${WORKERS}, threads=${THREADS})..."
exec gunicorn myproject.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${WORKERS}" \
    --threads "${THREADS}" \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
