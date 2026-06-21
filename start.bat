@echo off
echo ============================================
echo   Smart Laundry - Setup and Start
echo ============================================
echo.

:: Step 1: Install admin frontend dependencies
echo [1/6] Installing admin frontend dependencies...
cd apps\admin
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed for admin app
    pause
    exit /b 1
)

:: Step 2: Build admin frontend
echo.
echo [2/6] Building admin frontend...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: npm build failed for admin app
    pause
    exit /b 1
)

:: Step 3: Install customer frontend dependencies
echo.
echo [3/6] Installing customer frontend dependencies...
cd ..\customer
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed for customer app
    pause
    exit /b 1
)

:: Step 4: Build customer frontend
echo.
echo [4/6] Building customer frontend...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: npm build failed for customer app
    pause
    exit /b 1
)

:: Step 5: Install Python dependencies
echo.
echo [5/6] Installing Python API dependencies...
cd ..\..\services\api
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: pip install failed
    pause
    exit /b 1
)

:: Step 6: Start the server
echo.
echo [6/6] Starting server on http://localhost:8000
echo.
echo   Admin app:    http://localhost:8000/admin
echo   Customer app: http://localhost:8000/{laundryId}/site
echo   API docs:     http://localhost:8000/docs
echo   Health:       http://localhost:8000/health
echo.
echo   Press Ctrl+C to stop the server.
echo ============================================
uvicorn app.main:app --reload --port 8000
