@echo off
setlocal
cd /d "%~dp0"

rem Prefer the user's normal Node/pnpm installation when both are available.
where node >nul 2>nul
if errorlevel 1 goto bundled
where pnpm.cmd >nul 2>nul
if errorlevel 1 goto bundled
goto run

:bundled
rem Find the installed Codex runtime without hard-coding its changing version.
for /f "usebackq delims=" %%R in (`powershell.exe -NoProfile -Command "$pkg = Get-AppxPackage -Name 'OpenAI.CodexPrimaryRuntime*' | Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1; if ($pkg) { $pkg.InstallLocation }"`) do set "PANTRY_RUNTIME=%%R"
if not defined PANTRY_RUNTIME goto missing
if not exist "%PANTRY_RUNTIME%\dependencies\node\bin\node.exe" goto missing
if not exist "%PANTRY_RUNTIME%\dependencies\bin\fallback\pnpm.cmd" goto missing
set "PATH=%PANTRY_RUNTIME%\dependencies\node\bin;%PANTRY_RUNTIME%\dependencies\bin\fallback;%PATH%"

:run
if /i "%~1"=="--check" goto check
if not exist "node_modules\vite\bin\vite.js" (
  call pnpm.cmd install
  if errorlevel 1 exit /b 1
)
echo Starting Pantry at http://127.0.0.1:5173/
echo Keep this terminal open. Press Ctrl+C to stop.
call pnpm.cmd dev --host 127.0.0.1 --port 5173 --strictPort
exit /b %ERRORLEVEL%

:check
node --version
call pnpm.cmd --version
exit /b %ERRORLEVEL%

:missing
echo Node.js and pnpm were not found. Install Node.js 24 and pnpm 11, then retry.
exit /b 1
