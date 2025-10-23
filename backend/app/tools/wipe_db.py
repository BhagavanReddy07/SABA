"""
Utility script to wipe application data so you can re-sign up/login with a fresh JWT.

This will remove:
- All tasks
- All chat history
- All users (CASCADE will remove dependent rows)

Optional: flush Redis DBs used by app (Celery broker DB 0, chat history DB 1)

Run:
  $env:PYTHONPATH="backend"; python -m app.tools.wipe_db
"""
from app.db.utils import get_connection
from app.config import settings


def wipe_postgres():
    conn = get_connection()
    cur = conn.cursor()
    try:
        # Use TRUNCATE with CASCADE to clear dependent rows
        cur.execute("TRUNCATE TABLE chat_history RESTART IDENTITY CASCADE;")
        cur.execute("TRUNCATE TABLE tasks RESTART IDENTITY CASCADE;")
        cur.execute("TRUNCATE TABLE users RESTART IDENTITY CASCADE;")
        conn.commit()
        print("✅ PostgreSQL wipe completed: users, tasks, chat_history")
    finally:
        cur.close()
        conn.close()


def flush_redis():
    try:
        import redis
        # Celery broker (db 0)
        r0 = redis.from_url(settings.REDIS_URL_CELERY)
        r0.flushdb()
        # Chat history (db 1)
        r1 = redis.from_url(settings.REDIS_URL_CHAT)
        r1.flushdb()
        print("✅ Redis DBs flushed (broker and chat)")
    except Exception as e:
        print(f"⚠️  Could not flush Redis: {e}")


def main():
    print("\n=== Wipe Application Data ===")
    wipe_postgres()
    flush_redis()
    print("All done. You can sign up again now.")


if __name__ == "__main__":
    main()
