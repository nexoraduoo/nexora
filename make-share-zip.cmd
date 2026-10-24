@echo off
rem Nexora - pack the project into one small zip you can send. Double-click me.
cd /d "%~dp0"
if exist ".tools\node\node.exe" set "PATH=%~dp0.tools\node;%PATH%"
where node >nul 2>nul || (echo Node.js is required. Install it from https://nodejs.org & pause & exit /b 1)
node scripts\pack.mjs
echo.
pause
