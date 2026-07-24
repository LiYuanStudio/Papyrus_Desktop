@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo 启动 Papyrus 开发环境...
echo.

cd /d "%~dp0"

:: =====================================
:: 释放端口（按需清理，避免自杀）
:: =====================================
echo 检查端口占用...

:: 释放 8000 端口（后端）- 只杀占用该端口的进程，不会自杀
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo   发现 8000 端口被占用，PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    if !errorlevel! equ 0 (
        echo   8000 端口已释放
    ) else (
        echo   无法终止进程 %%a（可能需要管理员权限）
    )
)

:: 释放 5173 端口（Vite 前端）- 只杀占用该端口的进程，不会自杀
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo   发现 5173 端口被占用，PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    if !errorlevel! equ 0 (
        echo   5173 端口已释放
    ) else (
        echo   无法终止进程 %%a（可能需要管理员权限）
    )
)

:: 等待端口完全释放
timeout /t 1 /nobreak >nul

echo.

:: =====================================
:: 检查依赖
:: =====================================
echo 检查依赖...

:: 检查 Node 依赖
if not exist "node_modules" (
    echo   正在安装根目录依赖...
    call npm install
)

if not exist "frontend\node_modules" (
    echo   正在安装前端依赖...
    cd frontend
    call npm install
    cd ..
)

if not exist "backend\node_modules" (
    echo   正在安装后端依赖...
    cd backend
    call npm install
    cd ..
)

echo.
echo 依赖检查完成
echo 启动服务...
echo.

:: 使用根目录 npm run dev 同时启动前后端
npm run dev

pause
endlocal
