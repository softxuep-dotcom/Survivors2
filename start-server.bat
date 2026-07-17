@echo off
setlocal

cd /d "%~dp0"

if not exist "dist\index.html" (
    echo [ERROR] dist\index.html was not found.
    echo Run "npm run build" before starting the server.
    pause
    exit /b 1
)

set "PORT=8081"
echo Starting Horde Breaker at http://localhost:%PORT%/
echo Press Ctrl+C to stop the server.
echo.

where py >nul 2>nul
if %errorlevel% equ 0 (
    py -3 -m http.server %PORT% --directory dist
    exit /b %errorlevel%
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    python -m http.server %PORT% --directory dist
    exit /b %errorlevel%
)

echo [ERROR] Python 3 was not found in PATH.
pause
exit /b 1
