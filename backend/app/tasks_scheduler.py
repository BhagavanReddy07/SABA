"""
Celery scheduling utilities and task for sending task reminder emails.
This module delegates execution to the primary Celery app defined in app.worker.
"""

from datetime import datetime, timedelta
import logging
from dotenv import load_dotenv

from app.worker import celery  # Use the single Celery app

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)


@celery.task(bind=True, name="worker.send_scheduled_task_email")
def send_scheduled_task_email(self, task_id: int, user_email: str, task_title: str, task_notes: str = "", task_time: str = ""):
    """
    Send task reminder email at scheduled time via Celery
    
    Args:
        task_id: Database task ID
        user_email: User's email
        task_title: Task title
        task_notes: Task description
        task_time: Task due time
    """
    try:
        from app.simple_email_service import send_task_notification_email
        from app.db import utils as db_utils

        # We rely on deterministic Celery task_id and the 'scheduled' flag to avoid duplicates.
        # Only mark notified/completed AFTER a successful send so UI doesn't flip without an email.
        logger.info(f"📧 [Celery] Sending scheduled email for task {task_id}...")
        result = send_task_notification_email(
            to_email=user_email,
            task_title=task_title,
            task_notes=task_notes,
            task_time=task_time
        )

        if result:
            try:
                db_utils.update_task(int(task_id), {"notified": True, "completed": True})
            except Exception as upd_err:
                logger.error(f"❌ [Celery] Email sent but failed to mark task {task_id} done: {upd_err}")
            logger.info(f"✅ [Celery] Email sent for task {task_id}")
            return {"success": True, "task_id": task_id, "completed": True}
        else:
            logger.error(f"❌ [Celery] Failed to send email for task {task_id}")
            return {"success": False, "task_id": task_id}

    except Exception as e:
        logger.error(f"❌ [Celery] Error sending scheduled email: {str(e)}")
        # Retry up to 3 times with exponential backoff
        raise self.retry(exc=e, countdown=60, max_retries=3)


def schedule_task_email(task_id: int, user_email: str, task_title: str, 
                       task_notes: str, due_datetime_str: str):
    """
    Schedule an email to be sent at the task's due time
    
    Args:
        task_id: Database task ID
        user_email: User's email
        task_title: Task title
        task_notes: Task notes
        due_datetime_str: Due datetime in ISO format (UTC, e.g., "2025-10-20T15:30:00.000Z")
    """
    try:
        # Claim scheduling once to avoid duplicate enqueues
        try:
            from app.db import utils as db_utils
            claimed_sched = db_utils.claim_task_for_scheduling(int(task_id))
            if not claimed_sched:
                logger.info(f"⏭️  [Scheduler] Task {task_id} already scheduled. Skipping enqueue.")
                return True
        except Exception as e:
            logger.error(f"❌ Failed to claim scheduling for task {task_id}: {e}")
            return False

        # Parse the datetime string
        if not due_datetime_str:
            logger.warning(f"⚠️  No due date for task {task_id}. Skipping email scheduling.")
            return False
        
        logger.info(f"📅 Scheduling email for task {task_id}, received datetime: {due_datetime_str}")
        
        # Try multiple datetime formats
        due_datetime = None
        formats = [
            "%Y-%m-%dT%H:%M:%S.%fZ",  # ISO with milliseconds and Z (UTC)
            "%Y-%m-%dT%H:%M:%SZ",      # ISO with Z timezone (UTC)
            "%Y-%m-%dT%H:%M:%S",       # ISO without timezone
            "%Y-%m-%d %H:%M:%S",       # Standard format
            "%Y-%m-%d %H:%M",          # Without seconds
            "%m/%d/%Y %I:%M %p",       # US format with AM/PM
        ]
        
        for fmt in formats:
            try:
                due_datetime = datetime.strptime(due_datetime_str, fmt)
                logger.info(f"✅ Parsed with format '{fmt}': {due_datetime_str} → {due_datetime}")
                break
            except ValueError:
                continue
        
        if not due_datetime:
            logger.warning(f"⚠️  Could not parse datetime: {due_datetime_str}")
            return False
        
        # Calculate countdown from UTC now
        now_utc = datetime.utcnow()
        countdown = int((due_datetime - now_utc).total_seconds())
        
        logger.info(f"⏰ Current UTC: {now_utc}, Task due UTC: {due_datetime}, Countdown: {countdown}s")
        
        if countdown <= 0:
            logger.warning(f"⚠️  Task {task_id} due time is in the past ({countdown}s). Sending immediately.")
            countdown = 1  # Send almost immediately
        
        # Convert datetime to string for task storage (optional)
        task_time_str = due_datetime.strftime("%Y-%m-%d %I:%M %p UTC")

        logger.info(f"📨 Will send email in {countdown} seconds for task: {task_title}")

        # Schedule the Celery task on the main worker app
        result = send_scheduled_task_email.apply_async(
            args=[task_id, user_email, task_title, task_notes, task_time_str],
            countdown=countdown,
            task_id=f"task-email-{task_id}"
        )

        logger.info(f"✅ Celery task scheduled, ID: {result.id}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to schedule email for task {task_id}: {str(e)}", exc_info=True)
        return False


if __name__ == "__main__":
    # Start Celery Beat worker
    # Run with: celery -A app.tasks_scheduler beat --loglevel=info
    logger.info("Starting Celery Beat scheduler...")
