@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo 🚀 启动 Papyrus Desktop 开发环境...
echo.

cd /d "%~dp0"

:: =====================================
:: 释放端口（按需清理）
:: =====================================
echo 🔍 检查端口占用...

:: 释放 8000 端口（Uvicorn 后端）
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo   发现 8000 端口被占用，PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    if !errorlevel! equ 0 (
        echo   ✓ 8000 端口已释放
    ) else (
        echo   ⚠️  无法终止进程 %%a
    )
)

:: 释放 5173 端口（Vite 前端）
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo   发现 5173 端口被占用，PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    if !errorlevel! equ 0 (
        echo   ✓ 5173 端口已释放
    ) else (
        echo   ⚠️  无法终止进程 %%a
    )
)

:: 等待端口完全释放
timeout /t 1 /nobreak >nul

echo.
echo 🎯 启动服务...
echo.

:: 调用 npm run dev
npm run dev

endlocal
