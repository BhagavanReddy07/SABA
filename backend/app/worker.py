# backend/app/worker.py

import os
from celery import Celery
from datetime import datetime
import psycopg2
from dotenv import load_dotenv
import pytz
from app.config import settings
from app.db import utils as db_utils
from app.simple_email_service import send_task_notification_email

# Load environment variables
load_dotenv()

# ======================
# 🔹 PostgreSQL Settings
# ======================
POSTGRES_HOST = settings.POSTGRES_HOST
POSTGRES_DB = settings.POSTGRES_DB
POSTGRES_USER = settings.POSTGRES_USER
POSTGRES_PASSWORD = settings.POSTGRES_PASSWORD

# ======================
# 🔹 Redis (Celery Broker)
# ======================
REDIS_URL_CELERY = settings.REDIS_URL_CELERY

# ======================
# 🔹 Email Config
# ======================
EMAIL_USER = settings.EMAIL_USER
EMAIL_PASS = settings.EMAIL_PASS

# ======================
# 🔹 Timezone
# ======================
INDIA_TZ = pytz.timezone("Asia/Kolkata")

# ======================
# 🔹 Celery Initialization
# ======================
celery = Celery(
    "worker",
    broker=REDIS_URL_CELERY,
    backend=REDIS_URL_CELERY,
    include=["app.tasks_scheduler"],  # ensure scheduled tasks are registered
)

# Run check every minute
# NOTE: We now prefer explicit scheduling at task creation time.
# To avoid double-sends (beat + scheduled), the periodic checker is disabled by default.
celery.conf.beat_schedule = {}
celery.conf.timezone = "Asia/Kolkata"


# ======================
# 🔹 Main Task Checker
# ======================
@celery.task(name="worker.check_and_trigger_tasks")
def check_and_trigger_tasks():
    """
    Periodically checks PostgreSQL 'tasks' table for due reminders.
    Sends an email if a task is due (in IST timezone) and not yet notified.
    """
    try:
        conn = psycopg2.connect(
            dbname=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            host=POSTGRES_HOST,
            port="5432"
        )
        cur = conn.cursor()

        # Compare timestamps in UTC to avoid timezone mismatches
        cur.execute(
            """
            SELECT t.id, t.title, t.notes, t.datetime, u.email, t.user_id
            FROM tasks t
            JOIN users u ON t.user_id = u.id
            WHERE (t.datetime AT TIME ZONE 'UTC') <= NOW()
              AND (t.notified IS NULL OR t.notified = FALSE);
            """
        )
        tasks = cur.fetchall()

        triggered_count = 0

        for task_id, title, desc, trigger_time, user_email, user_id in tasks:
            # Send using the unified email service (clean SABA template)
            sent = send_task_notification_email(
                to_email=user_email,
                task_title=title,
                task_notes=desc or "",
                task_time=""
            )
            if sent:
                try:
                    db_utils.update_task(int(task_id), {"notified": True, "completed": True})
                except Exception:
                    pass
                triggered_count += 1

        cur.close()
        conn.close()

        now_ist = datetime.now(INDIA_TZ).strftime("%Y-%m-%d %H:%M:%S")
        print(f"✅ Checked tasks at {now_ist}, triggered {triggered_count} reminder(s).")
        return {"status": "success", "triggered": triggered_count}

    except Exception as e:
        print("❌ Error checking tasks:", e)
        return {"status": "error", "message": str(e)}

# (Legacy SMTP sender removed; all emails use send_task_notification_email)