import psycopg2
from psycopg2.extras import RealDictCursor  # ✅ Added to get dicts instead of tuples
from app.config import settings
from passlib.context import CryptContext
from typing import Optional, Dict
import hashlib
import logging

logger = logging.getLogger(__name__)


# ✅ Function to convert user IDs to integers (NOW ONLY RECEIVES INTEGERS)
def normalize_user_id(user_id) -> int:
    """Convert user_id to integer. Now only receives integers from backend auth."""
    if isinstance(user_id, int):
        return user_id
    
    # If somehow it's a string number, parse it
    if isinstance(user_id, str):
        try:
            return int(user_id)
        except ValueError:
            # This shouldn't happen with new auth flow
            logger.error(f"Cannot parse user_id '{user_id}' as integer")
            raise ValueError(f"Invalid user_id format: {user_id}")
    
    return int(user_id)


# ---------------- DATABASE CONNECTION ----------------
def get_connection():
    return psycopg2.connect(
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        cursor_factory=RealDictCursor  # ✅ ensures fetch returns dicts
    )


# ---------------- TABLE SETUP ----------------
def create_tables():
    conn = get_connection()
    cur = conn.cursor()

    # Users table for authentication
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            datetime TIMESTAMP,
            priority TEXT,
            category TEXT,
            notes TEXT,
            completed BOOLEAN DEFAULT FALSE,
            notified BOOLEAN DEFAULT FALSE,
            scheduled BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            chat_id TEXT,
            user_query TEXT NOT NULL,
            ai_response TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Lightweight migrations for existing databases
    cur.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;")
    cur.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;")
    cur.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled BOOLEAN DEFAULT FALSE;")
    cur.execute("ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;")
    cur.execute("ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS chat_id TEXT;")

    conn.commit()
    cur.close()
    conn.close()
    print("✅ Tables created or verified: tasks, chat_history")


# ---------------- TASK FUNCTIONS ----------------
def save_task(task_data: dict):
    """Save a task to the database"""
    conn = get_connection()
    cur = conn.cursor()

    try:
        # ✅ Normalize user_id (convert string to int if needed)
        user_id = normalize_user_id(task_data.get("user_id"))
        
        # ✅ Insert task and return id only (safely)
        cur.execute("""
            INSERT INTO tasks (user_id, title, datetime, priority, category, notes)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id;
        """, (
            user_id,
            task_data.get("title"),
            task_data.get("datetime"),
            task_data.get("priority"),
            task_data.get("category"),
            task_data.get("notes", ""),
        ))

        # Fetch the returned id
        result = cur.fetchone()
        conn.commit()
        
        if result:
            task_id = result['id']
            print(f"✅ Task saved: {task_data.get('title')} for user {user_id}, ID: {task_id}")
            return {
                "id": task_id,
                "title": task_data.get("title"),
                "user_id": user_id,
                "datetime": task_data.get("datetime"),
                "priority": task_data.get("priority"),
                "category": task_data.get("category"),
                "notes": task_data.get("notes", ""),
                "completed": False
            }
        else:
            raise Exception("Failed to retrieve task id after insert")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error saving task: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def get_tasks(user_id):
    conn = get_connection()
    cur = conn.cursor()
    
    # ✅ Normalize user_id (convert string to int if needed)
    user_id = normalize_user_id(user_id)
    
    cur.execute("SELECT * FROM tasks WHERE user_id = %s ORDER BY datetime;", (user_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def update_task(task_id: str, update_data: dict):
    """Update task fields like completed status"""
    conn = get_connection()
    cur = conn.cursor()
    
    set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
    values = list(update_data.values()) + [task_id]
    
    cur.execute(f"UPDATE tasks SET {set_clause} WHERE id = %s;", values)
    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Task {task_id} updated: {update_data}")


def delete_task(task_id: str):
    """Delete a task by id"""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM tasks WHERE id = %s;", (task_id,))
    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Task {task_id} deleted")


def update_task_for_user(task_id: int, user_id: int, update_data: dict) -> bool:
    """
    Update a task but ensure it belongs to the given user. Returns True if a row was updated.
    """
    conn = get_connection()
    cur = conn.cursor()
    try:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values()) + [task_id, user_id]
        cur.execute(f"UPDATE tasks SET {set_clause} WHERE id = %s AND user_id = %s;", values)
        updated = cur.rowcount
        conn.commit()
        return updated > 0
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def delete_task_for_user(task_id: int, user_id: int) -> bool:
    """
    Delete a task by id for a specific user. Returns True if a row was deleted.
    """
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM tasks WHERE id = %s AND user_id = %s;", (task_id, user_id))
        deleted = cur.rowcount
        conn.commit()
        return deleted > 0
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def claim_task_for_notification(task_id: int) -> bool:
    """
    Atomically mark a task as notified and completed ONLY if it hasn't been
    notified yet. Returns True only for the first caller who claims it.

    This prevents duplicate emails when both the periodic checker and the
    scheduled Celery task try to send at the same time.
    """
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE tasks
            SET notified = TRUE, completed = TRUE
            WHERE id = %s AND (notified IS NULL OR notified = FALSE)
            RETURNING id;
            """,
            (task_id,)
        )
        row = cur.fetchone()
        conn.commit()
        return row is not None
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def claim_task_for_scheduling(task_id: int) -> bool:
    """
    Atomically mark a task as scheduled ONLY if it hasn't been scheduled yet.
    Returns True only for the first caller who claims it.
    Prevents duplicate Celery enqueues for the same task.
    """
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE tasks
            SET scheduled = TRUE
            WHERE id = %s AND (scheduled IS NULL OR scheduled = FALSE)
            RETURNING id;
            """,
            (task_id,)
        )
        row = cur.fetchone()
        conn.commit()
        return row is not None
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---------------- CHAT FUNCTIONS ----------------
def save_chat(user_id, user_query: str, ai_response: str, chat_id: Optional[str] = None):
    conn = get_connection()
    cur = conn.cursor()

    # ✅ Normalize user_id (convert string to int if needed)
    user_id = normalize_user_id(user_id)

    cur.execute("""
        INSERT INTO chat_history (user_id, chat_id, user_query, ai_response)
        VALUES (%s, %s, %s, %s);
    """, (user_id, chat_id, user_query, ai_response))

    conn.commit()
    cur.close()
    conn.close()
    print(f"💬 Chat saved: {user_query[:40]}...")


# ✅ Corrected to return dicts compatible with main.py
def get_chat_history(user_id: int, limit: int = 10):
    """
    Fetch last N chats from PostgreSQL chat_history table.
    Returns list of dicts: [{"user_query": ..., "ai_response": ...}, ...]
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT chat_id, user_query, ai_response FROM chat_history WHERE user_id = %s ORDER BY created_at DESC LIMIT %s;",
            (user_id, limit)
        )
        rows = cur.fetchall()
        return rows
    finally:
        cur.close()
        conn.close()
def get_conversations(user_id: int, limit: int = 50):
    """
    Returns latest conversations grouped by chat_id with a title inferred from first user message.
    [{"chat_id": str, "title": str, "last_at": timestamp}]
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT chat_id,
               MIN(created_at) AS first_at,
               MAX(created_at) AS last_at,
               (SELECT ch2.user_query FROM chat_history ch2 WHERE ch2.user_id = %s AND ch2.chat_id = ch.chat_id ORDER BY ch2.created_at ASC LIMIT 1) AS first_msg
        FROM chat_history ch
        WHERE user_id = %s AND chat_id IS NOT NULL
        GROUP BY chat_id
        ORDER BY last_at DESC
        LIMIT %s;
        """,
        (user_id, user_id, limit)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    # map to desired structure
    results = []
    for r in rows:
        title = r.get("first_msg") or "New chat"
        results.append({"chat_id": r["chat_id"], "title": title, "last_at": r["last_at"].isoformat() if r["last_at"] else None})
    return results


def get_messages_by_chat(user_id: int, chat_id: str, limit: int = 200):
    """Return ordered messages for a chat_id as list of dicts with role & content."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT user_query, ai_response
        FROM chat_history
        WHERE user_id = %s AND chat_id = %s
        ORDER BY created_at ASC
        LIMIT %s;
        """,
        (user_id, chat_id, limit)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    messages = []
    for r in rows:
        messages.append({"type": "text", "sender": "user", "content": r["user_query"]})
        if r["ai_response"]:
            messages.append({"type": "text", "sender": "ai", "content": r["ai_response"]})
    return messages


# ---------------- AUTH HELPERS ----------------
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

def hash_password(plain_password: str) -> str:
    # Ensure password length compatibility for bcrypt; argon2 supports long inputs
    if isinstance(plain_password, str):
        plain_password = plain_password.strip()
    return pwd_context.hash(plain_password)

def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)

def create_user(name: str, email: str, plain_password: str) -> Dict:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s) RETURNING id, name, email;",
        (name, email, hash_password(plain_password))
    )
    user = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return user

def get_user_by_email(email: str) -> Optional[Dict]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, name, email, password_hash FROM users WHERE email = %s;", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    return user
