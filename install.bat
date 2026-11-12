@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if not exist "%~dp0cli.js" (
  echo [錯誤] 請先完整解壓縮 ZIP 壓縮檔後，再執行 install.bat！
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

if not defined NODE_EXE (
  for /d %%D in ("%APPDATA%\fnm\node-versions\*") do (
    if exist "%%~fD\installation\node.exe" set "NODE_EXE=%%~fD\installation\node.exe"
  )
)
if not defined NODE_EXE (
  for /d %%D in ("%APPDATA%\nvm\v*") do (
    if exist "%%~fD\node.exe" set "NODE_EXE=%%~fD\node.exe"
  )
)
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

echo [錯誤] 系統未偵測到 Node.js 或 Antigravity 主程式。
echo 請先確認已安裝 Antigravity 或 Node.js 22.4 以上版本。
pause
exit /b 1

:FOUND_NODE
call "%NODE_EXE%" cli.js install %*
if errorlevel 1 (
  echo.
  echo [提示] 安裝程序結束，錯誤碼：%errorlevel%。
)
echo.
pause
