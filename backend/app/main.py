from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
import logging
import jwt
from urllib.parse import unquote
import json

from app.services import ai_services, nlu
from app.db import utils as db_utils
from app.db.utils import create_tables, save_chat, get_chat_history, get_conversations, get_messages_by_chat  # correct import
from app.db.neo4j_utils import save_fact_neo4j, get_facts_neo4j
from app.db.redis_utils import save_chat_redis, get_last_chats
from app.config import settings
from app.api.auth import router as auth_router

app = FastAPI(title="Personal AI Assistant")
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    try:
        logger.info("🔧 Running database migrations (create_tables)...")
        create_tables()
        logger.info("✅ Database ready")
    except Exception as e:
        logger.exception(f"❌ Failed to run DB migrations: {e}")

app.include_router(auth_router)

class ChatRequest(BaseModel):
    user_message: str
    token: str
    chat_id: str | None = None
def get_current_user_id(token: str) -> int:
    """
    Extract user_id from JWT token.
    Returns: integer user_id from database
    """
    try:
        if not token:
            raise HTTPException(status_code=401, detail="No token provided")
        
        # URL decode the token in case it was encoded in the query string
        token = unquote(token).strip()
        
        logger.info(f"🔐 Decoding token (first 50 chars): {token[:50]}...")
        
        # Try JWT decoding first (from backend auth/signup)
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            user_id = payload.get("sub")
            
            if not user_id:
                raise Exception("No user ID in JWT token")
            
            # Convert to int - JWT contains numeric user_id from database
            user_id_int = int(user_id)
            logger.info(f"✅ JWT decoded successfully, user_id: {user_id_int}")
            return user_id_int
            
        except (jwt.DecodeError, jwt.InvalidTokenError, ValueError) as jwt_err:
            # Only attempt base64 fallback for non-JWT strings (no header.payload.signature)
            if token.count(".") != 2:
                logger.warning(f"JWT decode failed: {jwt_err}, trying legacy base64 token...")
                import json
                import base64
                try:
                    decoded_bytes = base64.b64decode(token)
                    payload = json.loads(decoded_bytes)
                    user_id = payload.get("sub")
                    if not user_id:
                        raise Exception("No user ID in base64 token")
                    user_id_int = int(user_id)
                    logger.info(f"✅ Base64 decoded (numeric), user_id: {user_id_int}")
                    return user_id_int
                except Exception as base64_err:
                    logger.error(f"❌ Cannot decode legacy token: {base64_err}")
                    raise HTTPException(status_code=401, detail="Invalid token format")
            else:
                # It's a JWT but invalid (likely wrong secret or expired). Ask client to re-auth.
                logger.error(f"❌ JWT invalid: {jwt_err}. Token likely signed with a different secret or expired.")
                raise HTTPException(status_code=401, detail="Invalid or expired token. Please sign in again.")
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Token decode error: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid or expired token")


def get_current_user_info(token: str) -> dict:
    """
    Extract user_id and email from JWT token.
    Returns: {"user_id": int, "email": str}
    """
    try:
        if not token:
            raise HTTPException(status_code=401, detail="No token provided")
        
        # URL decode the token in case it was encoded in the query string
        token = unquote(token).strip()
        
        # Try JWT decoding
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            user_id = payload.get("sub")
            email = payload.get("email", "")
            
            if not user_id:
                raise Exception("No user ID in JWT token")
            
            # Convert to int - JWT contains numeric user_id from database
            user_id_int = int(user_id)
            logger.info(f"✅ JWT decoded - user_id: {user_id_int}, email: {email}")
            return {"user_id": user_id_int, "email": email}
            
        except (jwt.DecodeError, jwt.InvalidTokenError, ValueError) as jwt_err:
            if token.count(".") != 2:
                logger.warning(f"JWT decode failed: {jwt_err}, trying legacy base64 token...")
                import json
                import base64
                try:
                    decoded_bytes = base64.b64decode(token)
                    payload = json.loads(decoded_bytes)
                    user_id = payload.get("sub")
                    email = payload.get("email", "")
                    if not user_id:
                        raise Exception("No user ID in base64 token")
                    user_id_int = int(user_id)
                    logger.info(f"✅ Base64 decoded - user_id: {user_id_int}, email: {email}")
                    return {"user_id": user_id_int, "email": email}
                except Exception as base64_err:
                    logger.error(f"❌ Cannot decode legacy token: {base64_err}")
                    raise HTTPException(status_code=401, detail="Invalid token format")
            else:
                logger.error(f"❌ JWT invalid: {jwt_err}. Token likely signed with a different secret or expired.")
                raise HTTPException(status_code=401, detail="Invalid or expired token. Please sign in again.")
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Token decode error: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid or expired token")

@app.get("/")
async def root():
    return {"message": "🚀 Personal AI Assistant backend running!"}

@app.post("/chat/")
async def chat(request: ChatRequest):
    user_message = request.user_message
    user_id = get_current_user_id(request.token)
    chat_id = request.chat_id
    try:
        # ---------- Determine intent ----------
        structured = nlu.get_structured_intent(user_message)
        action = structured.get("action")

        # ---------- Fetch global context ----------
        # 1️⃣ Build history text from DB by chat_id if provided; fallback to recent chats
        history_text = ""
        if chat_id:
            msgs = await run_in_threadpool(get_messages_by_chat, user_id, chat_id, 50)
            history_text = "\n".join([f"{'Human' if m['sender']=='user' else 'Assistant'}: {m['content']}" for m in msgs])
        else:
            extra_chats = await run_in_threadpool(get_chat_history, user_id, 10)
            history_text = "\n".join([f"Human: {c['user_query']}\nAssistant: {c['ai_response']}" for c in extra_chats])

        # 3️⃣ Fetch all facts from Neo4j
        facts_list = await run_in_threadpool(get_facts_neo4j, user_id)
        facts_text = "\n".join([f"{fact['key']}: {fact['value']}" for fact in facts_list])

        # ---------- Handle actions ----------
        if action == "general_chat":
            # ✅ Wrap message in dict to avoid 'str' object has no attribute 'get'
            user_msg_dict = {"sender": str(user_id), "text": user_message}
            response = await run_in_threadpool(
                ai_services.get_response,
                user_msg_dict,
                history=history_text,
                neo4j_facts=facts_text
            )

            # Save chat for this user
            await run_in_threadpool(save_chat, user_id, user_message, response, chat_id)
            await run_in_threadpool(save_chat_redis, user_id, user_message, response, chat_id)

            return {"success": True, "reply": response, "intent": structured}

        elif action == "create_task":
            # Normalize chat datetime (IST string) to UTC naive for DB
            from datetime import datetime as _dt
            import pytz as _pytz
            ist = _pytz.timezone("Asia/Kolkata")
            chat_dt_str = structured["data"].get("datetime")
            parsed_dt_utc_naive = None
            due_iso_utc = None
            if chat_dt_str:
                try:
                    # Format from NLU: "YYYY-MM-DD HH:MM:SS" (IST)
                    dt_ist = _dt.strptime(chat_dt_str, "%Y-%m-%d %H:%M:%S")
                    dt_ist = ist.localize(dt_ist)
                    dt_utc = dt_ist.astimezone(_pytz.UTC)
                    parsed_dt_utc_naive = _dt(dt_utc.year, dt_utc.month, dt_utc.day, dt_utc.hour, dt_utc.minute, dt_utc.second)
                    due_iso_utc = dt_utc.isoformat().replace("+00:00", "Z")
                except Exception:
                    parsed_dt_utc_naive = None

            # attach user_id and save task
            data_with_user = {
                **structured["data"],
                "user_id": user_id,
                "datetime": parsed_dt_utc_naive or structured["data"].get("datetime"),
            }
            task = await run_in_threadpool(db_utils.save_task, data_with_user)

            # Schedule email if we have user's email and a datetime
            try:
                user_info = get_current_user_info(request.token)
                user_email = user_info.get("email")
                if user_email and (due_iso_utc or structured["data"].get("datetime")):
                    from app.tasks_scheduler import schedule_task_email
                    schedule_task_email(
                        task_id=task.get("id"),
                        user_email=user_email,
                        task_title=structured["data"].get("title", "Task"),
                        task_notes=structured["data"].get("notes", ""),
                        # Prefer UTC ISO string so scheduler computes correct countdown
                        due_datetime_str= due_iso_utc or structured["data"].get("datetime")
                    )
            except Exception as schedule_err:
                logger.exception(f"❌ Could not schedule email for chat-created task: {schedule_err}")

            confirmation_message = f"Task saved: {structured['data']['title']} due {structured['data']['datetime']}"

            await run_in_threadpool(save_chat, user_id, user_message, confirmation_message)
            await run_in_threadpool(save_chat_redis, user_id, user_message, confirmation_message)

            return {"success": True, "reply": confirmation_message, "status": "✅ Task saved", "task": {**structured["data"], "id": task.get("id")}}

        elif action == "fetch_tasks":
            tasks = await run_in_threadpool(db_utils.get_tasks, user_id)
            tasks_summary = f"You have {len(tasks)} tasks."

            # ✅ Wrap summary in dict for AI service
            tasks_msg_dict = {"sender": str(user_id), "text": tasks_summary}
            ai_reply = await run_in_threadpool(
                ai_services.get_response,
                tasks_msg_dict,
                history=history_text,
                neo4j_facts=facts_text
            )

            return {"success": True, "reply": ai_reply, "tasks": tasks, "intent": structured}

        elif action == "save_fact":
            key = structured["data"]["key"]
            value = structured["data"]["value"]
            await run_in_threadpool(save_fact_neo4j, key, value)

            confirmation_message = f"I have saved the fact '{key}: {value}' in your knowledge base."
            confirm_msg_dict = {"sender": str(user_id), "text": confirmation_message}  # ✅ wrapped
            ai_reply = await run_in_threadpool(
                ai_services.get_response,
                confirm_msg_dict,
                history=history_text,
                neo4j_facts=facts_text
            )

            return {"success": True, "reply": ai_reply, "intent": structured}

        elif action == "get_chat_history":
            # Return last 10 chats from Redis globally
            history = await run_in_threadpool(get_last_chats, user_id)
            return {"success": True, "history": history, "intent": structured}

        else:
            return {"success": False, "reply": "⚠ Unknown action", "intent": structured}

    except Exception as e:
        logger.exception(f"Chat endpoint failed: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


class CreateTaskRequest(BaseModel):
    content: str
    type: str = "Task"
    priority: str = "medium"
    dueDate: str | None = None
    tags: list = []
    completed: bool = False
    # Token may come from body, query, or Authorization header; keep optional here
    token: str | None = None

class UpdateTaskRequest(BaseModel):
    completed: bool

class SendEmailRequest(BaseModel):
    to_email: str
    task_title: str
    task_notes: str = ""
    task_time: str = ""
    token: str

@app.post("/api/send-task-email")
async def api_send_task_email(request: SendEmailRequest):
    """Send task notification email directly"""
    try:
        user_id = get_current_user_id(request.token)
        
        # Import the simplified email service
        from app.simple_email_service import send_task_notification_email
        
        success = await run_in_threadpool(
            send_task_notification_email,
            request.to_email,
            request.task_title,
            request.task_notes,
            request.task_time
        )
        
        if success:
            return {
                "success": True,
                "message": f"✅ Email sent to {request.to_email}",
                "to": request.to_email,
                "task": request.task_title
            }
        else:
            return {
                "success": False,
                "message": "❌ Failed to send email",
                "error": "SMTP connection failed"
            }
    except Exception as e:
        logger.exception(f"Error sending email: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

@app.get("/api/tasks")
async def api_get_tasks(token: str):
    try:
        user_id = get_current_user_id(token)
        tasks = await run_in_threadpool(db_utils.get_tasks, user_id)
        from datetime import timezone

        formatted_tasks = []
        for row in tasks:
            # Normalize due date: treat stored naive timestamps as UTC and emit ISO with 'Z'
            due_iso = None
            if row.get("datetime"):
                dt = row["datetime"]
                if getattr(dt, "tzinfo", None) is None:
                    dt_utc = dt.replace(tzinfo=timezone.utc)
                else:
                    dt_utc = dt.astimezone(timezone.utc)
                due_iso = dt_utc.isoformat().replace("+00:00", "Z")

            created_iso = None
            if row.get("created_at"):
                cat = row["created_at"]
                if getattr(cat, "tzinfo", None) is None:
                    cat_utc = cat.replace(tzinfo=timezone.utc)
                else:
                    cat_utc = cat.astimezone(timezone.utc)
                created_iso = cat_utc.isoformat().replace("+00:00", "Z")

            formatted_tasks.append({
                "id": str(row["id"]),
                "content": row.get("title", ""),
                "type": "Task",
                "priority": row.get("priority", "medium"),
                "completed": bool(row.get("completed")),
                "dueDate": due_iso,
                "tags": [],
                "userId": user_id,
                "createdAt": created_iso,
            })
        return {"success": True, "tasks": formatted_tasks}
    except Exception as e:
        logger.exception(f"Error fetching tasks: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Failed to fetch tasks")

@app.post("/api/tasks")
async def api_create_task(payload: CreateTaskRequest, request: Request, token: str | None = None):
    try:
        # Determine token from body, query param, or Authorization header
        bearer = request.headers.get("authorization", "")
        header_token = bearer[7:] if bearer.lower().startswith("bearer ") else None
        resolved_token = payload.token or token or header_token
        if not resolved_token:
            raise HTTPException(status_code=401, detail="Missing token")

        # Get both user_id and email from token
        user_info = get_current_user_info(resolved_token)
        user_id = user_info["user_id"]
        user_email = user_info["email"]
        
        from datetime import datetime, timezone
        # Parse incoming dueDate (ISO) to naive UTC datetime for storage (DB column is TIMESTAMP without TZ)
        parsed_dt = None
        if payload.dueDate:
            try:
                dt = datetime.fromisoformat(payload.dueDate.replace('Z', '+00:00'))
                parsed_dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            except Exception:
                parsed_dt = None

        task_data = {
            "user_id": user_id,
            "title": payload.content,
            "datetime": parsed_dt,
            "priority": payload.priority,
            "category": "general",
            "notes": "",
            "completed": payload.completed
        }
        task = await run_in_threadpool(db_utils.save_task, task_data)
        
        # Schedule email to be sent at task's due time (if due date provided)
        if payload.dueDate and user_email:
            try:
                from app.tasks_scheduler import schedule_task_email
                logger.info(f"📅 Scheduling email for task {task.get('id')} at {payload.dueDate}")
                result = schedule_task_email(
                    task_id=task.get("id"),
                    user_email=user_email,
                    task_title=payload.content,
                    task_notes="",
                    due_datetime_str=payload.dueDate
                )
                logger.info(f"✅ Email scheduled for task {task.get('id')} at {payload.dueDate}")
            except Exception as schedule_err:
                logger.exception(f"❌ Could not schedule email: {schedule_err}")
                # Don't fail task creation if email scheduling fails
        
        return {
            "success": True,
            "task": {
                "id": str(task.get("id")),
                "content": task.get("title"),
                "type": payload.type,
                "priority": payload.priority,
                "completed": bool(payload.completed),
                "dueDate": payload.dueDate
            }
        }
    except Exception as e:
        logger.exception(f"Error creating task: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Failed to create task")

@app.patch("/api/tasks/{task_id}")
async def api_update_task(task_id: str, payload: UpdateTaskRequest, token: str | None = None, request: Request = None):
    try:
        # Resolve token from query or Authorization header
        bearer = request.headers.get("authorization", "") if request else ""
        header_token = bearer[7:] if bearer.lower().startswith("bearer ") else None
        resolved_token = token or header_token
        if not resolved_token:
            raise HTTPException(status_code=401, detail="Missing token")

        user_id = get_current_user_id(resolved_token)
        updated = await run_in_threadpool(db_utils.update_task_for_user, int(task_id), int(user_id), {"completed": payload.completed})
        if not updated:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"success": True}
    except Exception as e:
        logger.exception(f"Error updating task: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Failed to update task")

@app.delete("/api/tasks/{task_id}")
async def api_delete_task(task_id: str, token: str | None = None, request: Request = None):
    try:
        # Resolve token from query or Authorization header
        bearer = request.headers.get("authorization", "") if request else ""
        header_token = bearer[7:] if bearer.lower().startswith("bearer ") else None
        resolved_token = token or header_token
        if not resolved_token:
            raise HTTPException(status_code=401, detail="Missing token")

        user_id = get_current_user_id(resolved_token)
        deleted = await run_in_threadpool(db_utils.delete_task_for_user, int(task_id), int(user_id))
        if not deleted:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"success": True}
    except Exception as e:
        logger.exception(f"Error deleting task: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Failed to delete task")


@app.get("/api/conversations")
async def api_get_conversations(token: str):
    try:
        user_id = get_current_user_id(token)
        convos = await run_in_threadpool(get_conversations, user_id)
        return {"success": True, "conversations": convos}
    except Exception as e:
        logger.exception(f"Error fetching conversations: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch conversations")


@app.get("/api/conversations/{chat_id}")
async def api_get_messages(chat_id: str, token: str):
    try:
        user_id = get_current_user_id(token)
        messages = await run_in_threadpool(get_messages_by_chat, user_id, chat_id, 500)
        return {"success": True, "messages": messages}
    except Exception as e:
        logger.exception(f"Error fetching messages: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch messages")


@app.post("/chat-with-upload/")
async def chat_with_upload(
    file: UploadFile = File(...),
    prompt: str = Form(...),
    token: str = Form(...),
    chat_id: str | None = Form(default=None)
):
    try:
        user_id = get_current_user_id(token)

        # Parse prompt JSON {"sender": ..., "text": ...}
        try:
            import json
            prompt_obj = json.loads(prompt) if isinstance(prompt, str) else prompt
            user_text = prompt_obj.get("text") if isinstance(prompt_obj, dict) else str(prompt)
        except Exception:
            user_text = str(prompt)

        # We don't process the file contents in this stub; ensure read to avoid warnings
        await file.read()  # discard

        # Create a simple response using AI service context if available
        user_msg_dict = {"sender": str(user_id), "text": user_text}
        ai_reply = await run_in_threadpool(
            ai_services.get_response,
            user_msg_dict,
            history="",
            neo4j_facts=""
        )

        # Save entries
        await run_in_threadpool(save_chat, user_id, user_text, ai_reply, chat_id)
        await run_in_threadpool(save_chat_redis, user_id, user_text, ai_reply, chat_id)

        return {"success": True, "response": ai_reply}
    except Exception as e:
        logger.exception(f"Upload chat failed: {e}")
        raise HTTPException(status_code=500, detail="Upload chat failed")
