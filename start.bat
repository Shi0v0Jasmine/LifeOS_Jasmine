@echo off
chcp 65001 >nul
title LifeOS 启动器
echo ============================================
echo   LifeOS 启动中...
echo   http://localhost:8080
echo ============================================
echo.

REM 切换到项目目录
cd /d "%~dp0LifeOS"

REM 检查 Python 是否可用
python -V >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [OK] Python 已找到
    start "" "http://localhost:8080"
    python -m http.server 8080
) else (
    echo [警告] 未找到 python 命令，尝试 python3...
    python3 -V >nul 2>&1
    if %ERRORLEVEL% == 0 (
        echo [OK] Python3 已找到
        start "" "http://localhost:8080"
        python3 -m http.server 8080
    ) else (
        echo [错误] 未找到 Python！
        echo.
        echo 请确保已安装 Python，或手动双击 index.html 打开。
        echo.
        pause
    )
)
