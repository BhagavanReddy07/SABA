#!/usr/bin/env powershell
# =============================================================================
# 🚀 START ALL SERVICES - One Command to Rule Them All!
# =============================================================================
# This script starts:
# 1. Backend (FastAPI) on port 8000
# 2. Frontend (Next.js) on port 3001
# 3. Celery Worker (background tasks)
# 4. (Disabled) Celery Beat (scheduler) – avoided to prevent duplicate reminders
# All in separate terminals!
# =============================================================================

Write-Host "🚀 STARTING ALL SERVICES..." -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""

# Get the project root directory
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "📁 Project Root: $projectRoot" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# 1. Start Backend (FastAPI)
# ============================================================================
Write-Host "1️⃣ Starting Backend Server (port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @"
    cd '$projectRoot'
    `$env:PYTHONPATH='backend'
    Write-Host '🔄 Backend starting on port 8000...' -ForegroundColor Cyan
    Write-Host '📝 Logs:' -ForegroundColor Cyan
    python -m uvicorn app.main:app --port 8000 --host 0.0.0.0
    Read-Host 'Press Enter to close this window'
"@

Write-Host "   ✅ Backend started in new window" -ForegroundColor Green
Write-Host ""

# ============================================================================
# 2. Start Frontend (Next.js)
# ============================================================================
Write-Host "2️⃣ Starting Frontend (port 3001)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @"
    cd '$projectRoot'
    Write-Host '🔄 Frontend starting on port 3001...' -ForegroundColor Cyan
    Write-Host '📝 Logs:' -ForegroundColor Cyan
    npm run dev
    Read-Host 'Press Enter to close this window'
"@

Write-Host "   ✅ Frontend started in new window" -ForegroundColor Green
Write-Host ""

# ============================================================================
# 3. Start Celery Worker
# ============================================================================
Write-Host "3️⃣ Starting Celery Worker..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @"
    cd '$projectRoot\backend'
    Write-Host '🔄 Celery Worker starting...' -ForegroundColor Cyan
    Write-Host '📝 Logs:' -ForegroundColor Cyan
    celery -A app.worker worker --loglevel=info
    Read-Host 'Press Enter to close this window'
"@

Write-Host "   ✅ Celery Worker started in new window" -ForegroundColor Green
Write-Host ""

# ============================================================================
# 4. (Disabled) Celery Beat
# ============================================================================
Write-Host "4️⃣ Skipping Celery Beat (disabled to prevent duplicates)" -ForegroundColor Yellow
Write-Host ""

# ============================================================================
# Summary
# ============================================================================
Write-Host "======================================" -ForegroundColor Green
Write-Host "✅ ALL SERVICES STARTED!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "📊 SERVICE STATUS:" -ForegroundColor Cyan
Write-Host "  ✅ Backend     → http://localhost:8000" -ForegroundColor Green
Write-Host "  ✅ Frontend    → http://localhost:3001" -ForegroundColor Green
Write-Host "  ✅ Celery      → Worker running" -ForegroundColor Green
Write-Host "  ⚪ Scheduler   → Beat disabled" -ForegroundColor Yellow
Write-Host ""
Write-Host "📧 EMAIL CONFIGURATION:" -ForegroundColor Cyan
Write-Host "  FROM: personalassistantsaba@gmail.com" -ForegroundColor Green
Write-Host "  TO: bhagavanreddy069@gmail.com" -ForegroundColor Green
Write-Host ""
Write-Host "🧪 READY TO TEST:" -ForegroundColor Cyan
Write-Host "  1. Open http://localhost:3001" -ForegroundColor Yellow
Write-Host "  2. Login to your account" -ForegroundColor Yellow
Write-Host "  3. Create a task with near-future time" -ForegroundColor Yellow
Write-Host "  4. Wait for email notification" -ForegroundColor Yellow
Write-Host "  5. Watch backend logs for email sending" -ForegroundColor Yellow
Write-Host ""
Write-Host "⏸️  NOTES:" -ForegroundColor Cyan
Write-Host "  • Each service runs in its own window" -ForegroundColor Gray
Write-Host "  • Close any window to stop that service" -ForegroundColor Gray
Write-Host "  • Watch the logs for debugging" -ForegroundColor Gray
Write-Host "  • Press Ctrl+C to stop a service" -ForegroundColor Gray
Write-Host ""
Write-Host "🎉 SYSTEM IS READY!" -ForegroundColor Green
Write-Host ""
