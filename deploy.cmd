@echo off
rem Nexora - put it online for free on Cloudflare (Windows). Double-click me.
cd /d "%~dp0"
title Nexora - go online
if exist ".tools\node\node.exe" set "PATH=%~dp0.tools\node;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is required. Install the LTS version from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)
if not exist "node_modules\wrangler" (
  echo Installing components ^(one time^)...
  call npm install --no-audit --no-fund
)
node scripts\deploy.mjs %*
echo.
if /i not "%~1"=="--yes" pause
