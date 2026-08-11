@echo off
:: ============================================
:: Run this script as Administrator!
:: Right-click → "Run as administrator"
:: ============================================

echo ========================================================
echo   AOS - Windows Defender Exclusion Setup
echo   (Must be run as Administrator)
echo ========================================================
echo.

:: Check for admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script must be run as Administrator!
    echo.
    echo Right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo Adding exclusions for AOS folders...

:: Add folder exclusions
powershell -Command "Add-MpPreference -ExclusionPath 'C:\Users\gandu\OneDrive\Desktop\ai\dist'"
powershell -Command "Add-MpPreference -ExclusionPath 'C:\Users\gandu\OneDrive\Desktop\ai\dist-backend'"

:: Add process exclusion for the exe
powershell -Command "Add-MpPreference -ExclusionProcess 'AOS.exe'"
powershell -Command "Add-MpPreference -ExclusionProcess 'main.exe'"

echo.
echo [SUCCESS] Windows Defender exclusions added!
echo.
echo You can now run AOS.exe from:
echo   C:\Users\gandu\OneDrive\Desktop\ai\dist\AOS-win32-x64\AOS.exe
echo.
pause
