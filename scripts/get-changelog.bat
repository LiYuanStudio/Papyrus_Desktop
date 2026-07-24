@echo off
REM Get changelog for a specific version on Windows
REM Usage: scripts\get-changelog.bat [version]
REM Example: scripts\get-changelog.bat v2.0.0-beta.1

set VERSION=%1
if "%VERSION%"=="" set VERSION=Unreleased

echo 📋 Changelog for version: %VERSION%
echo ==========================================

node scripts\extract-changelog.js %VERSION%
