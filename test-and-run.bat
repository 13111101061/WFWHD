@echo off
cd /d "%~dp0"
echo ========================================
echo Qwen Flash 多语言测试
echo ========================================
echo.
echo [1/2] 启动服务...
start /B pnpm dev
echo.
echo 等待服务启动...
timeout /t 5 /nobreak > nul
echo.
echo [2/2] 运行测试...
echo.
node test-qwen-flash.js
echo.
echo ========================================
echo 测试完成！
echo ========================================
pause
