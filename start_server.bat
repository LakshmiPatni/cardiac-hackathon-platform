@echo off
title Cardiovascular Risk API - Local Server
color 0A

echo ============================================
echo   Cardiovascular Risk Prediction API
echo   Running on: http://127.0.0.1:8000
echo   Press Ctrl+C to stop the server
echo ============================================
echo.

:: Activate venv if it exists
if exist "%~dp0venv\Scripts\activate.bat" (
    echo [INFO] Activating virtual environment...
    call "%~dp0venv\Scripts\activate.bat"
) else (
    echo [INFO] No venv found, using system Python...
)

:: Change to the project directory
cd /d "%~dp0"

:: Start uvicorn strictly on localhost - Windows Firewall won't block this
echo [INFO] Starting uvicorn on 127.0.0.1:8000 ...
echo.
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

echo.
echo [INFO] Server stopped.
pause
