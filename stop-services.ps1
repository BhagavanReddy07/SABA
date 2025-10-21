# Stop all SABA services
# Run from project root: .\stop-services.ps1

Write-Host "================================" -ForegroundColor Cyan
Write-Host "🛑 Stopping SABA Services" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Stop Node processes (Frontend)
Write-Host "Stopping Frontend..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "✅ Frontend stopped" -ForegroundColor Green

# Stop Python processes (Backend, Celery)
Write-Host "Stopping Backend services..." -ForegroundColor Yellow
Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*uvicorn*" -or $_.CommandLine -like "*celery*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "✅ Backend services stopped" -ForegroundColor Green

# Stop Docker containers
Write-Host "Stopping Docker containers..." -ForegroundColor Yellow
docker-compose down
Write-Host "✅ Docker containers stopped" -ForegroundColor Green

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "✅ All services stopped" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
