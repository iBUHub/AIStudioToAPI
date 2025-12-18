@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo.==========================================
echo.  AI Studio To API - Auth Setup
echo.==========================================
echo.

:: Config variables
set "CAMOUFOX_VERSION=135.0.1-beta.24"
set "CAMOUFOX_URL=https://github.com/daijro/camoufox/releases/download/v%CAMOUFOX_VERSION%/camoufox-%CAMOUFOX_VERSION%-win.x86_64.zip"
set "CAMOUFOX_ZIP=camoufox.zip"
set "CAMOUFOX_DIR=camoufox"

:: Navigate to project root
cd /d "%~dp0\.."

:: Step 1: Check and install Node.js dependencies
echo.[1/4] Checking Node.js dependencies...
if not exist "node_modules" (
    echo.Installing npm dependencies...
    call npm install
    if errorlevel 1 (
        echo.ERROR: npm install failed! Please ensure Node.js and npm are installed
        pause
        exit /b 1
    )
    echo.Dependencies installed
) else (
    echo.Dependencies exist, skipping installation
)
echo.

:: Step 2: Check Camoufox browser
echo.[2/4] Checking Camoufox browser...
if exist "%CAMOUFOX_DIR%\camoufox.exe" (
    echo.Camoufox exists, skipping download
    goto :skip_download
)

echo.Downloading Camoufox v%CAMOUFOX_VERSION%...
echo.Download URL: %CAMOUFOX_URL%
echo.

:: Download file using PowerShell
powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Write-Host 'Downloading...' -ForegroundColor Cyan; Invoke-WebRequest -Uri '%CAMOUFOX_URL%' -OutFile '%CAMOUFOX_ZIP%' -UseBasicParsing; Write-Host 'Download complete' -ForegroundColor Green}"

if errorlevel 1 (
    echo.ERROR: Download failed! Please check network connection or download manually
    echo.Manual download URL: %CAMOUFOX_URL%
    pause
    exit /b 1
)

:: Step 3: Extract Camoufox
echo.
echo.[3/4] Extracting Camoufox...

:: Create camoufox directory if not exists
if not exist "%CAMOUFOX_DIR%" mkdir "%CAMOUFOX_DIR%"

:: Extract to camoufox directory
powershell -Command "& {Expand-Archive -Path '%CAMOUFOX_ZIP%' -DestinationPath '%CAMOUFOX_DIR%' -Force; Write-Host 'Extraction complete' -ForegroundColor Green}"

if errorlevel 1 (
    echo.ERROR: Extraction failed!
    pause
    exit /b 1
)

:: Check if files were extracted to a subdirectory and move them up if needed
if exist "%CAMOUFOX_DIR%\camoufox-%CAMOUFOX_VERSION%-win.x86_64" (
    echo.Moving files from subdirectory...
    xcopy "%CAMOUFOX_DIR%\camoufox-%CAMOUFOX_VERSION%-win.x86_64\*" "%CAMOUFOX_DIR%\" /E /Y >nul 2>&1
    rd /s /q "%CAMOUFOX_DIR%\camoufox-%CAMOUFOX_VERSION%-win.x86_64" >nul 2>&1
)

:: Delete zip file
del "%CAMOUFOX_ZIP%" >nul 2>&1
echo.Cleanup complete
echo.

:skip_download

:: Step 4: Run auth save script
echo.[4/4] Starting auth save tool...
echo.
echo.==========================================
echo.  Please follow the prompts to login
echo.==========================================
echo.
timeout /t 2 >nul

node scripts\auth\saveAuth.js

if errorlevel 1 (
    echo.
    echo.ERROR: Auth save failed! Please check error messages above
    pause
    exit /b 1
)

echo.
echo.==========================================
echo.  Auth setup complete!
echo.==========================================
echo.
echo.Auth files saved to auth directory
echo.You can now run "npm start" to start the server
echo.
pause
