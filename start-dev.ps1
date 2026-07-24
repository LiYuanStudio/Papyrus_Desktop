# Papyrus 开发环境启动脚本
# 同时启动 TypeScript 后端和 Vite 前端

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

Write-Host "启动 Papyrus 开发环境..." -ForegroundColor Cyan
Write-Host ""

# 释放端口（按需清理，避免自杀）
Write-Host "检查端口占用..." -ForegroundColor Yellow

# 释放 8000 端口（后端）
try {
    $netstat8000 = netstat -ano
    $listening8000 = $netstat8000 | Where-Object { $_ -match ":8000.*LISTENING" }
    if ($listening8000) {
        foreach ($line in $listening8000) {
            $parts = $line -split '\s+'
            $procId = $parts[-1]
            Write-Host "  发现 8000 端口被占用，PID: $procId" -ForegroundColor Yellow
            try {
                taskkill /PID $procId /F > $null 2>&1
                Write-Host "  8000 端口已释放" -ForegroundColor Green
            } catch {
                Write-Host "  无法终止进程 $procId（可能需要管理员权限）" -ForegroundColor Red
            }
        }
    }
} catch {
    Write-Host "  检查 8000 端口时出错: $($_.Exception.Message)" -ForegroundColor Red
}

# 释放 5173 端口（Vite 前端）
try {
    $netstat5173 = netstat -ano
    $listening5173 = $netstat5173 | Where-Object { $_ -match ":5173.*LISTENING" }
    if ($listening5173) {
        foreach ($line in $listening5173) {
            $parts = $line -split '\s+'
            $procId = $parts[-1]
            Write-Host "  发现 5173 端口被占用，PID: $procId" -ForegroundColor Yellow
            try {
                taskkill /PID $procId /F > $null 2>&1
                Write-Host "  5173 端口已释放" -ForegroundColor Green
            } catch {
                Write-Host "  无法终止进程 $procId（可能需要管理员权限）" -ForegroundColor Red
            }
        }
    }
} catch {
    Write-Host "  检查 5173 端口时出错: $($_.Exception.Message)" -ForegroundColor Red
}

# 等待端口完全释放
Start-Sleep -Seconds 1
Write-Host ""

# 检查 Node 依赖
Write-Host "检查 Node 依赖..." -ForegroundColor Yellow

if (-not (Test-Path "node_modules")) {
    Write-Host "  正在安装根目录依赖..." -ForegroundColor Yellow
    npm install
}

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "  正在安装前端依赖..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
}

if (-not (Test-Path "backend\node_modules")) {
    Write-Host "  正在安装后端依赖..." -ForegroundColor Yellow
    Set-Location backend
    npm install
    Set-Location ..
}

Write-Host ""
Write-Host "依赖检查完成" -ForegroundColor Green
Write-Host "启动服务..." -ForegroundColor Cyan
Write-Host ""

# 使用根目录 npm run dev 同时启动前后端
npm run dev
