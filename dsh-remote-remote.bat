@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Please install Node.js first: https://nodejs.org
  pause
  exit /b 1
)

if not exist "harness-plugin\dist\cli.js" (
  echo Building dsh-remote...
  call pnpm --filter dsh-harness-remote build
  if errorlevel 1 (
    echo Build failed. Please run "pnpm install" first.
    pause
    exit /b 1
  )
)

echo Starting remote access...
echo Keep this window open. Press Ctrl+C or close this window to stop.
node "harness-plugin\dist\cli.js" remote

pause
