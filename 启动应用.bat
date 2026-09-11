@echo off
if /I "%GEWU_DEBUG%"=="1" echo on
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title 格物 - 智能物理探究学习环境

set "APP_ROOT=%~dp0"
set "APP_HOST=127.0.0.1"
set "APP_PORT=3001"
set "FIXED_URL=http://%APP_HOST%:%APP_PORT%/"
set "LEGACY_URL=http://localhost:%APP_PORT%/"
set "APP_URL=%FIXED_URL%"
set "APP_MARKER=gewuphysics-inquiry-v1"
set "MIN_NODE=22.13.0"
set "MIN_NPM=10.0.0"
set "RUNTIME_DIR=%~dp0.vinext\dev"
set "LOCK_FILE=%~dp0.vinext\dev\lock.json"
set "OUT_LOG=%~dp0.vinext\dev\local-server.out.log"
set "ERR_LOG=%~dp0.vinext\dev\local-server.err.log"
set "PID_FILE=%~dp0.vinext\dev\local-server.pid"

call :FIND_APP
if not errorlevel 1 goto OPEN_APP

call :CHECK_PROJECT_PROCESS
if not errorlevel 1 goto WAIT_FOR_EXISTING

:PREPARE_START
call :CHECK_PORT
if not errorlevel 1 goto PORT_BUSY

where node.exe >nul 2>nul
if errorlevel 1 goto NODE_MISSING
where npm.cmd >nul 2>nul
if errorlevel 1 goto NPM_MISSING

node.exe -e "const [major,minor,patch]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&(minor>13||(minor===13&&patch>=0)))?0:1)" >nul 2>nul
if errorlevel 1 goto NODE_OLD
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "try { $version=[version](npm.cmd --version); if ($version -ge [version]$env:MIN_NPM) { exit 0 } } catch {}; exit 1" >nul 2>nul
if errorlevel 1 goto NPM_OLD

if not exist "%~dp0node_modules\vinext\dist\cli.js" goto FILES_MISSING
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%" >nul 2>nul
if not exist "%RUNTIME_DIR%" goto RUNTIME_DIR_FAILED

echo 正在后台启动格物平台，请稍候……
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $process=Start-Process -FilePath 'node.exe' -ArgumentList @('node_modules/vinext/dist/cli.js','dev','--port',$env:APP_PORT,'--hostname',$env:APP_HOST) -WorkingDirectory $env:APP_ROOT -RedirectStandardOutput $env:OUT_LOG -RedirectStandardError $env:ERR_LOG -WindowStyle Hidden -PassThru; [IO.File]::WriteAllText($env:PID_FILE,[string]$process.Id,[Text.Encoding]::ASCII)"
if errorlevel 1 goto START_FAILED

for /L %%N in (1,1,60) do (
  call :WAIT_ONE_SECOND
  call :FIND_APP
  if not errorlevel 1 goto OPEN_APP
  call :CHECK_LAUNCHED_PROCESS
  if errorlevel 1 goto START_EXITED
)
goto START_TIMEOUT

:WAIT_FOR_EXISTING
echo 检测到本项目已有启动进程，正在等待它就绪……
for /L %%N in (1,1,60) do (
  call :WAIT_ONE_SECOND
  call :FIND_APP
  if not errorlevel 1 goto OPEN_APP
  call :CHECK_PROJECT_PROCESS
  if errorlevel 1 goto PREPARE_START
)
goto EXISTING_UNHEALTHY

:FIND_APP
set "APP_URL=%FIXED_URL%"
call :CHECK_APP
if not errorlevel 1 exit /b 0
set "APP_URL=%LEGACY_URL%"
call :CHECK_APP
if not errorlevel 1 exit /b 0
set "APP_URL=%FIXED_URL%"
exit /b 1

:CHECK_APP
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ProgressPreference='SilentlyContinue'; try { $response=Invoke-WebRequest -UseBasicParsing -Uri $env:APP_URL -TimeoutSec 2 -MaximumRedirection 0; if ($response.StatusCode -eq 200 -and $response.Content.Contains($env:APP_MARKER)) { exit 0 } } catch {}; exit 1" >nul 2>nul
exit /b %errorlevel%

:CHECK_PROJECT_PROCESS
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $lock=Get-Content -LiteralPath $env:LOCK_FILE -Raw -Encoding UTF8 | ConvertFrom-Json; $root=[IO.Path]::GetFullPath($env:APP_ROOT).TrimEnd([char[]]'\/'); $cwd=[IO.Path]::GetFullPath([string]$lock.cwd).TrimEnd([char[]]'\/'); if ($cwd -ne $root -or [int]$lock.port -ne [int]$env:APP_PORT) { exit 1 }; $process=Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$lock.pid); if ($process.Name -ieq 'node.exe' -and [string]$process.CommandLine -match 'vinext[\\/]+dist[\\/]+cli\.js.+\bdev\b') { exit 0 }; exit 1" >nul 2>nul
exit /b %errorlevel%

:CHECK_LAUNCHED_PROCESS
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $serverPid=[int](Get-Content -LiteralPath $env:PID_FILE -Raw); $process=Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $serverPid); if ($process.Name -ieq 'node.exe') { exit 0 }; exit 1" >nul 2>nul
exit /b %errorlevel%

:CHECK_PORT
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$client=[Net.Sockets.TcpClient]::new(); try { $task=$client.ConnectAsync($env:APP_HOST,[int]$env:APP_PORT); if ($task.Wait(750) -and $client.Connected) { exit 0 }; exit 1 } catch { exit 1 } finally { $client.Dispose() }" >nul 2>nul
exit /b %errorlevel%

:WAIT_ONE_SECOND
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "Start-Sleep -Milliseconds 1000" >nul 2>nul
exit /b 0

:PORT_BUSY
echo [端口被占用] %APP_HOST%:%APP_PORT% 已有其他服务，且不是格物平台。
echo 请先关闭占用该端口的程序，再重新双击启动。本脚本不会自动结束其他进程。
pause
exit /b 1

:NODE_MISSING
echo [无法启动] 当前电脑未找到 Node.js。
echo 当前开发电脑应已具备运行环境；本项目不会自动安装任何依赖。
pause
exit /b 1

:NPM_MISSING
echo [无法启动] 当前电脑未找到 npm.cmd。
pause
exit /b 1

:NODE_OLD
echo [无法启动] Node.js 版本过低，需要 %MIN_NODE% 或更高版本。
node.exe --version
pause
exit /b 1

:NPM_OLD
echo [无法启动] npm 版本过低或版本号无效，需要 %MIN_NPM% 或更高版本。
npm.cmd --version
pause
exit /b 1

:FILES_MISSING
echo [无法启动] 当前项目的本地运行文件不完整：缺少 Vinext 运行文件。
echo 请保留本项目完整文件夹；无需手动运行 npm install。
pause
exit /b 1

:RUNTIME_DIR_FAILED
echo [无法启动] 无法创建本地运行目录：%RUNTIME_DIR%
pause
exit /b 1

:START_FAILED
echo [无法启动] 后台进程创建失败。
echo 可在本文件夹运行 npm run dev 查看详细错误。
pause
exit /b 1

:START_EXITED
echo [启动失败] 本地服务进程已提前退出。
echo 输出日志：%OUT_LOG%
echo 错误日志：%ERR_LOG%
pause
exit /b 1

:START_TIMEOUT
echo [启动超时] 本地服务没有在 60 秒内成功响应。
echo 输出日志：%OUT_LOG%
echo 错误日志：%ERR_LOG%
pause
exit /b 1

:EXISTING_UNHEALTHY
echo [服务未就绪] 本项目已有进程，但 60 秒内未返回正确的应用标识。
echo 请检查 Vinext 锁文件：%LOCK_FILE%
echo 本脚本为避免误杀进程，不会自动强制结束它。
pause
exit /b 1

:OPEN_APP
if /I "%GEWU_NO_OPEN%"=="1" exit /b 0
start "" "%APP_URL%"
exit /b 0
