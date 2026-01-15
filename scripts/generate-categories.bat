@echo off
REM 音色分类生成脚本 - Windows批处理版本

echo ========================================
echo 音色分类自动生成工具
echo ========================================
echo.

REM 检查Node.js是否安装
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到Node.js，请先安装Node.js
    pause
    exit /b 1
)

echo [1/3] 检查环境...
echo Node版本: 
node --version
echo.

echo [2/3] 运行生成脚本...
node src/modules/tts/config/generate-voice-categories.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 生成失败，请检查错误信息
    pause
    exit /b 1
)

echo.
echo [3/3] 验证生成结果...
if exist "src\modules\tts\config\voiceCategories.json" (
    echo [成功] voiceCategories.json 已生成
) else (
    echo [错误] voiceCategories.json 未找到
    pause
    exit /b 1
)

echo.
echo ========================================
echo 生成完成！
echo ========================================
echo.
echo 生成的文件:
echo   - src/modules/tts/config/voiceCategories.json
echo.
echo 下一步:
echo   1. 启动服务: npm start
echo   2. 测试API: node tests/test-voice-categories.js
echo   3. 查看文档: docs/VOICE_CATEGORIES_GUIDE.md
echo.

pause
