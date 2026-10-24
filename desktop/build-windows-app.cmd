@echo off
rem Builds the Nexora Windows app (dist\Nexora-Windows\Nexora.exe). Needs internet the first time.
setlocal
cd /d "%~dp0"
if exist "%~dp0..\.tools\node\node.exe" set "PATH=%~dp0..\.tools\node;%PATH%"
where node >nul 2>nul || (echo Node.js was not found. Run start-nexora.cmd once first. & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows-app.ps1" || (echo Build failed. & pause & exit /b 1)
pause
