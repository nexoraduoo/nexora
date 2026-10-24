@echo off
rem Nexora - start on this computer (Windows). Double-click me.
cd /d "%~dp0"
title Nexora
if exist ".tools\node\node.exe" set "PATH=%~dp0.tools\node;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Nexora needs Node.js to run on this computer ^(one-time install^).
  echo  1. Open https://nodejs.org  2. Download the LTS version  3. Install it
  echo  4. Double-click this file again.
  echo.
  echo  Tip: in Windows you can also run:  winget install OpenJS.NodeJS.LTS
  echo.
  pause
  exit /b 1
)
if not exist "node_modules\wrangler" (
  echo Installing components ^(one time, about a minute^)...
  call npm install --no-audit --no-fund
)
node scripts\dev.mjs
pause
