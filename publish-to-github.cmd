@echo off
rem Puts Nexora on GitHub as a public project. Run it once after creating an EMPTY repository on github.com.
setlocal
cd /d "%~dp0"
echo.
echo  1. Go to https://github.com/new  (sign in with nexora.duoo@gmail.com)
echo  2. Repository name: nexora   Visibility: Public   Do NOT tick "Add a README"   Click "Create repository"
echo  3. Copy the address it shows, like  https://github.com/YOURNAME/nexora.git
echo.
set /p REPO=Paste that address here and press Enter: 
if "%REPO%"=="" (echo Nothing pasted. & pause & exit /b 1)
set "GIT=git -c safe.directory=*"
%GIT% remote remove origin >nul 2>nul
%GIT% remote add origin %REPO%
%GIT% branch -M main
echo.
echo A browser window may open so GitHub can sign you in. Click "Authorize".
%GIT% push -u origin main
if errorlevel 1 (echo. & echo Push failed. Read the message above. & pause & exit /b 1)
echo.
echo Done. Your project is public at: %REPO:.git=%
pause
