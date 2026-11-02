@echo off
setlocal
cd /d "%~dp0"

set "LOG=%~dp0build.log"
echo ==== %DATE% %TIME% ==== > "%LOG%"

set "CSC="
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not defined CSC if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"

if not defined CSC goto nocsc

echo 编译器: %CSC%>> "%LOG%"
echo.
echo 正在编译 mro_agent.cs ...
echo.

"%CSC%" /nologo /target:exe /platform:x64 /optimize+ /out:mro_agent_new.exe mro_agent.cs >> "%LOG%" 2>&1
if errorlevel 1 goto failed
if not exist mro_agent_new.exe goto failed

echo.
echo 编译完成，正在替换 mro_agent.exe ...
echo （代理可能正在运行，运行中的 exe 不能直接覆盖，所以先改名再放入）

if exist mro_agent.exe.old del /q mro_agent.exe.old >nul 2>&1
if exist mro_agent.exe move /y mro_agent.exe mro_agent.exe.old >nul 2>&1
if exist mro_agent.exe del /q mro_agent.exe >nul 2>&1
move /y mro_agent_new.exe mro_agent.exe >nul 2>&1
if not exist mro_agent.exe goto failed

echo [OK] 编译成功>> "%LOG%"
echo.
for %%F in (mro_agent.exe) do echo [OK] mro_agent.exe  %%~zF 字节  %%~tF
echo.
echo 下一步：在 OpenRevo 里把「MRO HUD」关掉再打开，或者直接重启 OpenRevo。
echo        然后打开「MRO HUD 设置」页，确认顶部没有黄色告警、
echo        帧率读数左边显示「逐帧数据」。
echo.
pause
exit /b 0

:nocsc
echo [FAIL] 找不到 .NET Framework 4.x 编译器>> "%LOG%"
echo [FAIL] 找不到 .NET Framework 4.x 编译器
echo        期望位置: %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\
pause
exit /b 1

:failed
echo.
echo [FAIL] 编译或替换失败，mro_agent.exe 可能还是旧的。
echo        错误详情：
echo.
type "%LOG%"
echo.
echo 提示：如果提示文件被占用，先在 OpenRevo 里停用「MRO HUD」插件，再重新运行本脚本。
echo.
if exist mro_agent_new.exe del /q mro_agent_new.exe >nul 2>&1
pause
exit /b 1
