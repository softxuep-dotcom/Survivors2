@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title Horde Spark - CrazyGames Upload Files

set "NO_PAUSE="
if /i "%~1"=="--no-pause" set "NO_PAUSE=1"

echo.
echo ========================================
echo   Horde Spark - CrazyGames Upload Files
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

echo [3/3] Verifying files for direct upload...
call node tools\crazygames-upload.mjs
if errorlevel 1 goto :failed

echo.
echo [SUCCESS] Upload every file and folder inside dist\client.
echo           Keep index.html at the upload root.
if not defined NO_PAUSE pause
exit /b 0

:failed
echo.
echo [FAILED] CrazyGames upload files are not ready. Review the error above.
if not defined NO_PAUSE pause
exit /b 1
