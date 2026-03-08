@echo off
chcp 65001 >nul
title Clash TUN 安全关闭工具
echo ============================================
echo      Clash TUN 模式安全关闭工具
echo ============================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 请以管理员身份运行此脚本！
    pause
    exit /b 1
)

echo [步骤 1/5] 正在关闭 Clash 进程...
taskkill /F /IM clash.exe 2>nul
taskkill /F /IM clash-verge.exe 2>nul
taskkill /F /IM mihomo.exe 2>nul
taskkill /F /IM verge.exe 2>nul
echo [完成] Clash 进程已关闭
echo.

echo [步骤 2/5] 等待虚拟网卡卸载...
:check_loop
netsh interface show interface | findstr /i "Meta\|Wintun\|Clash" >nul
if %errorlevel% == 0 (
    echo [等待] 虚拟网卡仍在卸载中...
    timeout /t 2 /nobreak >nul
    goto check_loop
)
echo [完成] 虚拟网卡已卸载
echo.

echo [步骤 3/5] 清理路由表残留...
netsh interface ipv4 delete route 0.0.0.0/0 "Meta" >nul 2>&1
netsh interface ipv4 delete route 198.18.0.0/15 "Meta" >nul 2>&1
echo [完成] 路由表已清理
echo.

echo [步骤 4/5] 恢复系统代理设置...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f >nul
echo [完成] 系统代理已关闭
echo.

echo [步骤 5/5] 清理DNS缓存...
ipconfig /flushdns >nul
echo [完成] DNS缓存已清理
echo.

echo ============================================
echo [成功] Clash TUN 模式已安全关闭！
echo.
echo 提示：现在可以安全地关机或重启
echo ============================================
pause
