from app.db import redis_utils as redis, postgres as postgres
from app.db.neo4j_utils import save_fact_neo4j, get_fact_neo4j

# =========================================================
# 🔹 FACTS (Neo4j)
# =========================================================
def save_fact(key: str, value: str):
    """
    Save a fact (knowledge relationship) in Neo4j.
    """
    save_fact_neo4j(key, value)


def get_fact(key: str):
    """
    Retrieve a fact from Neo4j.
    """
    return get_fact_neo4j(key)


# =========================================================
# 🔹 TASKS (PostgreSQL)
# =========================================================
def save_task(task_data: dict):
    """
    Save a task record in PostgreSQL.
    """
    postgres.save_task(task_data)


def get_tasks():
    """
    Retrieve all task records from PostgreSQL.
    """
    return postgres.get_tasks()


# =========================================================
# 🔹 CHAT HISTORY (Redis)
# =========================================================
def save_chat_history(user_message: str, bot_reply: str):
    """
    Save last 10 chat messages in Redis.
    """
    redis.save_chat(user_message, bot_reply)


def get_last_chats():
    """
    Retrieve last 10 chat messages from Redis.
    """
    return redis.get_last_chats()
