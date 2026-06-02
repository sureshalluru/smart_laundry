@echo off
echo ============================================
echo   Smart Laundry - Dev Server (API only)
echo ============================================
echo.
echo   Starts API with hot reload.
echo   Assumes admin app is already built.
echo   Run start.bat first if you haven't built yet.
echo.
echo   Admin app:  http://localhost:8000/admin
echo   API docs:   http://localhost:8000/docs
echo ============================================
echo.
cd services\api
uvicorn app.main:app --reload --port 8000
