@echo off
echo ========================================================
echo   AOS - AI Operating System IDE Packaging Script
echo ========================================================
echo.

:: Check for python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python and try again.
    pause
    exit /b 1
)

:: Check for node
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js and try again.
    pause
    exit /b 1
)

echo [1/5] Installing Python requirements...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [WARNING] Failed to install some python requirements. Attempting to proceed...
)

echo [2/5] Installing PyInstaller...
pip install pyinstaller
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install PyInstaller.
    pause
    exit /b 1
)

echo [3/5] Compiling Python Backend to executable...
python -m PyInstaller --onedir --clean --name main --distpath dist-backend --paths backend main.py
if %errorlevel% neq 0 (
    echo [ERROR] Failed to compile Python Backend with PyInstaller.
    pause
    exit /b 1
)

echo [4/5] Installing npm dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install npm dependencies.
    pause
    exit /b 1
)

echo [5/5] Packaging Electron App...
call npm run package
if %errorlevel% neq 0 (
    echo [ERROR] Failed to package Electron App.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   SUCCESS!
echo   Your packaged app is in:
echo   %CD%\dist\AOS-win32-x64\
echo.
echo   Run AOS.exe from that folder to launch.
echo ========================================================
echo.
pause
