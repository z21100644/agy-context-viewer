@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if not exist "%~dp0cli.js" (
  echo [Error / 错误 / 錯誤] Please extract the entire ZIP archive before running install.bat!
  echo 请先完整解压 ZIP 压缩包后再运行 install.bat / 請先完整解壓縮 ZIP 壓縮檔後再執行 install.bat
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

echo [Error / 错误 / 錯誤] Neither Node.js nor Antigravity was detected on this system.
echo Please install Antigravity or Node.js ^>= 22.4 first.
echo 未检测到 Node.js 或 Antigravity 主程序 / 未偵測到 Node.js 或 Antigravity 主程式。
pause
exit /b 1

:FOUND_NODE
call "%NODE_EXE%" cli.js install %*
if errorlevel 1 (
  echo.
  echo [Exit / 退出码 / 錯誤碼] %errorlevel%
)
echo.
pause
