@echo off
chcp 65001 >nul
echo ========================================
echo   TTS音色工厂全链路测试
echo   测试音色: Kai (aliyun-qwen-kai)
echo ========================================
echo.

if not exist "node_modules" (
    echo 错误: node_modules 不存在
    echo 请先运行: npm install
    pause
    exit /b 1
)

echo 正在运行全链路测试...
echo.

node tests\full-chain-kai-test.js

if %errorlevel% equ 0 (
    echo.
    echo ✅ 测试完成
) else (
    echo.
    echo ❌ 测试失败，错误代码: %errorlevel%
)

echo.
pause
