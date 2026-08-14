@echo off
echo ========================================================
echo   AOS - AI Operating System IDE Packaging Script
echo ========================================================
echo.

:: Check for .env file
if not exist ".env" (
    echo [ERROR] .env file not found!
    echo Please create a .env file with your API keys before building.
    echo Copy .env.example to .env and fill in the values.
    pause
    exit /b 1
)

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

echo [0/6] Closing running app instances to release file locks...
taskkill /F /IM main.exe >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1

echo [1/6] Installing Python requirements...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [WARNING] Failed to install some python requirements. Attempting to proceed...
)

echo [2/6] Installing PyInstaller...
pip install pyinstaller
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install PyInstaller.
    pause
    exit /b 1
)

echo [3/6] Compiling Python Backend to executable...
if exist "build\main" rmdir /s /q "build\main" >nul 2>&1
python -m PyInstaller --onedir --noconfirm --clean --name main --distpath dist-backend --paths backend main.py
if %errorlevel% neq 0 (
    echo [ERROR] Failed to compile Python Backend with PyInstaller.
    pause
    exit /b 1
)

echo [4/6] Copying .env and creating output directory for backend...
copy /Y ".env" "dist-backend\main\.env"
if %errorlevel% neq 0 (
    echo [ERROR] Failed to copy .env to dist-backend.
    pause
    exit /b 1
)
if not exist "dist-backend\main\output" mkdir "dist-backend\main\output"
echo    .env copied and output directory created successfully.

echo [5/6] Installing npm dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install npm dependencies.
    pause
    exit /b 1
)

echo [6/6] Packaging Electron App...
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
