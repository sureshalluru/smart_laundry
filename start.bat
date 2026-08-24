@echo off
echo ============================================
echo   Smart Laundry - Setup and Start
echo ============================================
echo.

:: Step 1: Install admin frontend dependencies
echo [1/8] Installing admin frontend dependencies...
cd apps\admin
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed for admin app
    pause
    exit /b 1
)

:: Step 2: Build admin frontend
echo.
echo [2/8] Building admin frontend...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: npm build failed for admin app
    pause
    exit /b 1
)

:: Step 3: Install customer frontend dependencies
echo.
echo [3/8] Installing customer frontend dependencies...
cd ..\customer
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed for customer app
    pause
    exit /b 1
)

:: Step 4: Build customer frontend
echo.
echo [4/8] Building customer frontend...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: npm build failed for customer app
    pause
    exit /b 1
)

:: Step 5: Install garment-counter dependencies (Vite PWA, served at /counter)
echo.
echo [5/8] Installing garment-counter dependencies...
cd ..\garment-counter
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed for garment-counter app
    pause
    exit /b 1
)

:: Step 6: Build garment-counter (Vite -> dist/)
echo.
echo [6/8] Building garment-counter...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: npm build failed for garment-counter app
    pause
    exit /b 1
)

:: Step 7: Install Python dependencies
echo.
echo [7/8] Installing Python API dependencies...
cd ..\..\services\api
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: pip install failed
    pause
    exit /b 1
)

:: Step 8: Start the server
:: The garment-counter /mockapi routes mount only when ENABLE_DEMO_COUNTER=true,
:: same as production (set it in the Render dashboard there). To demo the counter
:: locally, set it before running this script:  set ENABLE_DEMO_COUNTER=true
:: or add ENABLE_DEMO_COUNTER=true to services/api/.env
:: (Or uncomment the next line to always demo the counter locally.)
:: set ENABLE_DEMO_COUNTER=true
echo.
echo [8/8] Starting server on http://localhost:8000
echo.
echo   Admin app:     http://localhost:8000/admin
echo   Customer app:  http://localhost:8000/{laundryId}/site
echo   Counter PWA:   http://localhost:8000/counter/
echo   Counter mock:  http://localhost:8000/mockapi   (only if ENABLE_DEMO_COUNTER=true)
echo   API docs:      http://localhost:8000/docs
echo   Health:        http://localhost:8000/health
echo.
echo   Press Ctrl+C to stop the server.
echo ============================================
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
