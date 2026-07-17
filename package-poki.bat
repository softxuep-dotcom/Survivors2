@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title Horde Breaker - Poki ZIP Packager

set "NO_PAUSE="
if /i "%~1"=="--no-pause" set "NO_PAUSE=1"

echo.
echo ========================================
echo   Horde Breaker - Poki ZIP Packager
echo ========================================
echo.

if not exist "package.json" (
    echo [ERROR] package.json was not found next to this script.
    goto :failed
)

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH.
    goto :failed
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm was not found in PATH.
    goto :failed
)

set "PYTHON_CMD="
where py >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD (
    where python >nul 2>nul
    if not errorlevel 1 set "PYTHON_CMD=python"
)
if not defined PYTHON_CMD (
    echo [ERROR] Python 3 was not found in PATH.
    goto :failed
)

if not exist "node_modules\vite\package.json" (
    echo [1/3] Dependencies are missing. Running npm ci...
    call npm ci
    if errorlevel 1 goto :failed
) else (
    echo [1/3] Dependencies are ready.
)

echo [2/3] Building the production game...
call npm run build
if errorlevel 1 goto :failed

echo [3/3] Creating and verifying the versioned Poki ZIP...
call %PYTHON_CMD% tools\package-poki.py
if errorlevel 1 goto :failed

echo.
echo [SUCCESS] Poki upload ZIP is ready.
if not defined NO_PAUSE pause
exit /b 0

:failed
echo.
echo [FAILED] Poki ZIP was not created. Review the error above.
if not defined NO_PAUSE pause
exit /b 1
