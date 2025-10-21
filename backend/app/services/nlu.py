import re
from datetime import datetime, date, timedelta
import pytz

# Use India Standard Time (IST)
IST = pytz.timezone("Asia/Kolkata")


def parse_time_string(time_str: str):
    """
    Converts a time string like '8am', '7:30 PM', '10:00pm', '7 PM',
    '8:25pm today', or '8pm tomorrow' into a full IST datetime string: YYYY-MM-DD HH:MM:SS
    """
    if not time_str:
        return None

    time_str = time_str.strip().replace(".", "").lower()

    # Detect 'today' or 'tomorrow'
    day_offset = 0
    if "tomorrow" in time_str:
        day_offset = 1
        time_str = time_str.replace("tomorrow", "").strip()
    elif "today" in time_str:
        time_str = time_str.replace("today", "").strip()

    # Normalize AM/PM spacing
    if time_str.endswith("am") or time_str.endswith("pm"):
        if not re.search(r"\s(am|pm)$", time_str):
            time_str = time_str[:-2] + " " + time_str[-2:]

    # Try to parse using multiple time formats
    for fmt in ("%I:%M %p", "%I %p"):
        try:
            parsed_time = datetime.strptime(time_str, fmt)
            final_date = date.today() + timedelta(days=day_offset)
            local_dt = datetime.combine(final_date, parsed_time.time())
            # Attach IST timezone
            ist_dt = IST.localize(local_dt)
            return ist_dt.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue

    return None


def get_structured_intent(user_message: str) -> dict:
    """
    Parse the user message into a structured intent dictionary.
    Supports:
    - save facts
    - create tasks / reminders
    - fetch tasks
    - get chat history
    - general chat
    """
    msg = user_message.lower().strip()

    # ---------- Save Fact (explicit) ----------
    match_fact = re.match(r"(save|remember) fact (.+?) as (.+)", msg)
    if match_fact:
        key = match_fact.group(2).strip()
        value = match_fact.group(3).strip()
        return {"action": "save_fact", "data": {"key": key, "value": value}}

    # ---------- Save Fact (generic) ----------
    match_generic_fact = re.match(r"(remember|my) (.+?) is (.+)", msg)
    if match_generic_fact:
        key = match_generic_fact.group(2).strip()
        value = match_generic_fact.group(3).strip()
        return {"action": "save_fact", "data": {"key": key, "value": value}}

    # ---------- Create Task ----------
    match_task = re.match(r"(create|add) task (.+?) due (.+)", msg)
    if match_task:
        title = match_task.group(2).strip()
        datetime_value = (
            parse_time_string(match_task.group(3).strip())
            or datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
        )
        return {
            "action": "create_task",
            "data": {
                "title": title,
                "datetime": datetime_value,
                "priority": "medium",
                "category": "personal",
                "notes": "",
            },
        }

    # ---------- Reminder Task ----------
    match_reminder = re.match(r"remind me to (.+?) at (.+)", msg)
    if match_reminder:
        title = match_reminder.group(1).strip()
        datetime_value = (
            parse_time_string(match_reminder.group(2).strip())
            or datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
        )
        return {
            "action": "create_task",
            "data": {
                "title": title,
                "datetime": datetime_value,
                "priority": "medium",
                "category": "personal",
                "notes": "",
            },
        }

    # ---------- Fetch Tasks ----------
    if any(keyword in msg for keyword in ["show tasks", "list tasks", "my tasks"]):
        return {"action": "fetch_tasks"}

    # ---------- Get Last Chat History ----------
    if any(
        keyword in msg for keyword in ["show chat history", "last chats", "previous messages"]
    ):
        return {"action": "get_chat_history"}

    # ---------- General Chat ----------
    return {"action": "general_chat"}