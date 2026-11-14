@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0cli.js" (
  echo [Error] Please extract the entire ZIP archive before running uninstall.bat!
  pause
  exit /b 1
)

set "NODE_EXE="
set "ELECTRON_RUN_AS_NODE="

where node >nul 2>&1
if not errorlevel 1 set "NODE_EXE=node"

if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

if not defined NODE_EXE for /d %%D in ("%APPDATA%\fnm\node-versions\*") do if exist "%%~fD\installation\node.exe" set "NODE_EXE=%%~fD\installation\node.exe"
if not defined NODE_EXE for /d %%D in ("%LOCALAPPDATA%\fnm\node-versions\*") do if exist "%%~fD\installation\node.exe" set "NODE_EXE=%%~fD\installation\node.exe"
if not defined NODE_EXE for /d %%D in ("%APPDATA%\nvm\v*") do if exist "%%~fD\node.exe" set "NODE_EXE=%%~fD\node.exe"
if not defined NODE_EXE for /d %%D in ("%LOCALAPPDATA%\nvm\v*") do if exist "%%~fD\node.exe" set "NODE_EXE=%%~fD\node.exe"
if not defined NODE_EXE if exist "%APPDATA%\Antigravity\bin\agy-node.cmd" set "NODE_EXE=%APPDATA%\Antigravity\bin\agy-node.cmd"

if defined NODE_EXE goto :FOUND_NODE

if exist "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" (
  set "NODE_EXE=%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe"
  set "ELECTRON_RUN_AS_NODE=1"
  goto :FOUND_NODE
)

if exist "%ProgramFiles%\Antigravity\Antigravity.exe" (
  set "NODE_EXE=%ProgramFiles%\Antigravity\Antigravity.exe"
  set "ELECTRON_RUN_AS_NODE=1"
  goto :FOUND_NODE
)

if exist "%ProgramFiles%\Google Antigravity\Antigravity.exe" (
  set "NODE_EXE=%ProgramFiles%\Google Antigravity\Antigravity.exe"
  set "ELECTRON_RUN_AS_NODE=1"
  goto :FOUND_NODE
)

echo [Error] Neither Node.js nor Antigravity was detected on this system.
echo Please install Antigravity or Node.js ^>= 22.4 first.
pause
exit /b 1

:FOUND_NODE
chcp 65001 >nul
call "%NODE_EXE%" "%~dp0cli.js" restore %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [Exit Code] %EXIT_CODE%
)
echo.
pause
exit /b %EXIT_CODE%
