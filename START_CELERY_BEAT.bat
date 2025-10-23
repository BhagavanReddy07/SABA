@echo off
REM Start Celery Beat scheduler for task reminder emails

echo ========================================
echo Starting Celery Beat Scheduler
echo ========================================

cd /d %~dp0

set PYTHONPATH=backend

REM Start Celery Beat
python -m celery -A app.tasks_scheduler beat --loglevel=info

pause
