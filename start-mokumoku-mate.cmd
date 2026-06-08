@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please install Node.js, then run this shortcut again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

set "MOKUMOKU_MATE_PORT=5200"

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%MOKUMOKU_MATE_PORT%'"

echo Starting Mokumoku Mate at http://localhost:%MOKUMOKU_MATE_PORT%
call npm run dev -- --host 127.0.0.1 --port %MOKUMOKU_MATE_PORT% --strictPort

pause
