# Start all services for SABA Application
# Run from project root: .\start-services.ps1

Write-Host "================================" -ForegroundColor Cyan
Write-Host "🚀 SABA Services Startup Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "📦 Checking Docker..." -ForegroundColor Yellow
$dockerStatus = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit
}
Write-Host "✅ Docker is running" -ForegroundColor Green
Write-Host ""

# Start Docker containers
Write-Host "🐳 Starting Docker containers (PostgreSQL, Redis)..." -ForegroundColor Yellow
cd $PSScriptRoot
docker-compose up -d
Start-Sleep -Seconds 3
Write-Host "✅ Docker containers started" -ForegroundColor Green
Write-Host ""

# Start Frontend
Write-Host "🌐 Starting Frontend (Next.js)..." -ForegroundColor Yellow
$frontendJob = Start-Process -PassThru -NoNewWindow -FilePath "powershell" -ArgumentList "-Command", "cd '$PSScriptRoot'; npm run dev"
Write-Host "✅ Frontend started (PID: $($frontendJob.Id))" -ForegroundColor Green
Write-Host "   📍 URL: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""

# Wait a bit for frontend to start
Start-Sleep -Seconds 5

# Start Backend
Write-Host "⚙️  Starting Backend (FastAPI)..." -ForegroundColor Yellow
$backendJob = Start-Process -PassThru -NoNewWindow -FilePath "powershell" -ArgumentList "-Command", "cd '$PSScriptRoot/backend'; python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
Write-Host "✅ Backend started (PID: $($backendJob.Id))" -ForegroundColor Green
Write-Host "   📍 URL: http://localhost:8000" -ForegroundColor Cyan
Write-Host "   📍 Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""

# Wait for backend to start
Start-Sleep -Seconds 5

# Start Celery Worker
Write-Host "⚙️  Starting Celery Worker..." -ForegroundColor Yellow
$celeryWorkerJob = Start-Process -PassThru -NoNewWindow -FilePath "powershell" -ArgumentList "-Command", "cd '$PSScriptRoot/backend'; celery -A app.worker worker --loglevel=info"
Write-Host "✅ Celery Worker started (PID: $($celeryWorkerJob.Id))" -ForegroundColor Green
Write-Host ""

# Celery Beat intentionally not started to prevent duplicate reminders
Write-Host "⏭️  Skipping Celery Beat (disabled by design)" -ForegroundColor Yellow
Write-Host ""

Write-Host "================================" -ForegroundColor Green
Write-Host "✅ All services started!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""

Write-Host "📋 Service Summary:" -ForegroundColor Cyan
Write-Host "  Frontend:        http://localhost:3000" -ForegroundColor White
Write-Host "  Backend:         http://localhost:8000" -ForegroundColor White
Write-Host "  API Docs:        http://localhost:8000/docs" -ForegroundColor White
Write-Host "  PostgreSQL:      localhost:5432" -ForegroundColor White
Write-Host "  Redis:           localhost:6379" -ForegroundColor White
Write-Host ""

Write-Host "📝 Process IDs:" -ForegroundColor Cyan
Write-Host "  Frontend:        $($frontendJob.Id)" -ForegroundColor White
Write-Host "  Backend:         $($backendJob.Id)" -ForegroundColor White
Write-Host "  Celery Worker:   $($celeryWorkerJob.Id)" -ForegroundColor White
Write-Host "  Celery Beat:     $($celeryBeatJob.Id)" -ForegroundColor White
Write-Host ""

Write-Host "🛑 To stop all services, run: .\stop-services.ps1" -ForegroundColor Yellow
Write-Host ""

# Keep script running and show status
Write-Host "Monitoring services..." -ForegroundColor Yellow
while ($true) {
    $frontendRunning = Get-Process -Id $frontendJob.Id -ErrorAction SilentlyContinue
    $backendRunning = Get-Process -Id $backendJob.Id -ErrorAction SilentlyContinue
    $workerRunning = Get-Process -Id $celeryWorkerJob.Id -ErrorAction SilentlyContinue
    $beatRunning = $null
    
    if (-not $frontendRunning) {
        Write-Host "⚠️  Frontend process stopped" -ForegroundColor Yellow
    }
    if (-not $backendRunning) {
        Write-Host "⚠️  Backend process stopped" -ForegroundColor Yellow
    }
    if (-not $workerRunning) {
        Write-Host "⚠️  Celery Worker process stopped" -ForegroundColor Yellow
    }
    # Beat intentionally not running
    
    Start-Sleep -Seconds 10
}
