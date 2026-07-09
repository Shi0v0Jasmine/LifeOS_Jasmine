@echo off
chcp 65001 >nul
title LifeOS Server
echo ============================================
echo   LifeOS 启动中...
echo   http://localhost:3000
echo ============================================
echo.

cd /d "%~dp0"

REM 检查 Node.js
node -v >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [OK] Node.js 已找到
    echo [INFO] 后端数据存储在 LifeOS/data/lifeos-db.json
    echo.
    start "" "http://localhost:3000"
    node server.js
) else (
    echo [警告] 未找到 Node.js，尝试 Python 作为静态服务器...
    cd /d "%~dp0LifeOS"
    python -V >nul 2>&1
    if %ERRORLEVEL% == 0 (
        echo [OK] Python 已找到（无后端持久化）
        start "" "http://localhost:8080"
        python -m http.server 8080
    ) else (
        echo [错误] 未找到 Node.js 或 Python
        echo 请安装 Node.js 以获得数据持久化功能。
        echo.
        pause
    )
)