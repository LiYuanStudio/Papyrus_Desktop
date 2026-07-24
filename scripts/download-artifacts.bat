@echo off
REM Download GitHub Actions artifacts
REM Usage: scripts\download-artifacts.bat [run-id]

set OUTPUT_DIR=downloaded-artifacts

if "%1"=="" (
    echo 🔍 Finding latest workflow run...
    for /f "tokens=*" %%a in ('gh run list --workflow=release.yml --limit=1 --json databaseId -q ".[0].databaseId"') do set RUN_ID=%%a
    if "%RUN_ID%"=="" (
        echo ❌ No runs found
        exit /b 1
    )
    echo 📋 Latest run ID: %RUN_ID%
) else (
    set RUN_ID=%1
    echo 📋 Using run ID: %RUN_ID%
)

REM Create output directory
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo 📦 Downloading artifacts...
echo.
gh run download %RUN_ID% -D "%OUTPUT_DIR%"

echo.
echo ✅ Download complete!
echo.
echo 📂 Files saved to: %OUTPUT_DIR%
echo.
dir /b "%OUTPUT_DIR%"
