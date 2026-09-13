@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo   Unique Market - Network AI Agent Installer
echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js LTS is not installed.
  echo Install Node.js LTS, then run this installer again.
  echo.
  pause
  exit /b 1
)

call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)

if not exist UniqueMarketNetworkAgent.exe (
  powershell -NoProfile -ExecutionPolicy Bypass -File build-agent.ps1
  if errorlevel 1 (
    echo EXE build failed.
    pause
    exit /b 1
  )
)

start "Unique Market Network Agent" /min UniqueMarketNetworkAgent.exe

echo.
echo Network Agent started on http://127.0.0.1:17855
pause
