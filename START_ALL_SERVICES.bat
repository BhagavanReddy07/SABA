@echo off
REM =============================================================================
REM 🚀 START ALL SERVICES - One Command to Rule Them All!
REM =============================================================================
REM This script starts all services in separate terminals:
REM 1. Backend (FastAPI) on port 8000
REM 2. Frontend (Next.js) on port 3001
REM 3. Celery Worker (background tasks)
REM 4. Celery Beat (scheduler)
REM =============================================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ============================================
echo 🚀 STARTING ALL SERVICES
echo ============================================
echo.

REM Get the project root
set PROJECT_ROOT=%cd%

echo 📁 Project Root: %PROJECT_ROOT%
echo.

REM 1. Start Backend
echo 1️⃣ Starting Backend Server (port 8000)...
start "Backend - Port 8000" cmd /k "cd /d %PROJECT_ROOT% && set PYTHONPATH=backend && python -m uvicorn app.main:app --port 8000 --host 0.0.0.0"
timeout /t 2 /nobreak
echo    ✅ Backend started
echo.

REM 2. Start Frontend
echo 2️⃣ Starting Frontend (port 3001)...
start "Frontend - Port 3001" cmd /k "cd /d %PROJECT_ROOT% && npm run dev"
timeout /t 2 /nobreak
echo    ✅ Frontend started
echo.

REM 3. Start Celery Worker
echo 3️⃣ Starting Celery Worker...
start "Celery Worker" cmd /k "cd /d %PROJECT_ROOT%\backend && celery -A app.worker worker --loglevel=info"
timeout /t 2 /nobreak
echo    ✅ Celery Worker started
echo.

REM 4. Start Celery Beat
echo 4️⃣ Starting Celery Beat (Scheduler)...
start "Celery Beat - Scheduler" cmd /k "cd /d %PROJECT_ROOT%\backend && celery -A app.worker beat --loglevel=info"
timeout /t 2 /nobreak
echo    ✅ Celery Beat started
echo.

REM Summary
echo ============================================
echo ✅ ALL SERVICES STARTED!
echo ============================================
echo.
echo 📊 SERVICE STATUS:
echo    ✅ Backend     → http://localhost:8000
echo    ✅ Frontend    → http://localhost:3001
echo    ✅ Celery      → Worker running
echo    ✅ Scheduler   → Beat running (60s checks)
echo.
echo 📧 EMAIL CONFIGURATION:
echo    FROM: personalassistantsaba@gmail.com
echo    TO: bhagavanreddy069@gmail.com
echo.
echo 🧪 READY TO TEST:
echo    1. Open http://localhost:3001
echo    2. Login to your account
echo    3. Create a task with near-future time
echo    4. Wait for email notification
echo    5. Watch backend logs for email sending
echo.
echo ⏸️  NOTES:
echo    • Each service runs in its own window
echo    • Close any window to stop that service
echo    • Watch the logs for debugging
echo    • Press Ctrl+C to stop a service
echo.
echo 🎉 SYSTEM IS READY!
echo.
pause
