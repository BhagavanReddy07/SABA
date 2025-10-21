from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging
import jwt
from typing import Optional

from app.config import settings

app = FastAPI(title="Personal AI Assistant - Simple")
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:5000", "127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info("✅ Backend app initialized")

def get_current_user_id(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return str(payload.get("sub"))
    except Exception as e:
        logger.error(f"Token decode error: {e}")
        return "user-unknown"

@app.get("/")
async def root():
    return {"message": "🚀 Personal AI Assistant backend running!"}

@app.get("/api/tasks")
async def api_get_tasks(token: str):
    """Get tasks for user - returns empty list (localStorage fallback)"""
    try:
        user_id = get_current_user_id(token)
        logger.info(f"Fetching tasks for user {user_id}")
        # Return empty list - frontend uses localStorage
        return {"success": True, "tasks": []}
    except Exception as e:
        logger.exception(f"Error fetching tasks: {e}")
        return {"success": True, "tasks": []}

class CreateTaskRequest(BaseModel):
    token: str
    title: str
    notes: Optional[str] = None
    dueDate: Optional[str] = None

@app.post("/api/tasks")
async def api_create_task(request: CreateTaskRequest):
    """Create task - returns success (frontend uses localStorage)"""
    try:
        user_id = get_current_user_id(request.token)
        logger.info(f"Creating task for user {user_id}: {request.title}")
        return {"success": True, "message": "Task created", "task_id": f"task-{user_id}"}
    except Exception as e:
        logger.exception(f"Error creating task: {e}")
        return {"success": False, "error": str(e)}

class UpdateTaskRequest(BaseModel):
    token: str
    task_id: str
    completed: bool

@app.patch("/api/tasks/{task_id}")
async def api_update_task(task_id: str, request: UpdateTaskRequest):
    """Update task - returns success (frontend uses localStorage)"""
    try:
        user_id = get_current_user_id(request.token)
        logger.info(f"Updating task {task_id} for user {user_id}")
        return {"success": True, "message": "Task updated"}
    except Exception as e:
        logger.exception(f"Error updating task: {e}")
        return {"success": False, "error": str(e)}

@app.delete("/api/tasks/{task_id}")
async def api_delete_task(task_id: str, token: str):
    """Delete task - returns success (frontend uses localStorage)"""
    try:
        user_id = get_current_user_id(token)
        logger.info(f"Deleting task {task_id} for user {user_id}")
        return {"success": True, "message": "Task deleted"}
    except Exception as e:
        logger.exception(f"Error deleting task: {e}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
