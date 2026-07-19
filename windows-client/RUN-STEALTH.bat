@echo off
title Interview Helper - Windows Setup
color 0A
echo.
echo  ============================================================
echo   Interview Helper - Stealth Capture Client
echo  ============================================================
echo.
echo  Windows Defender may block new apps. This is normal for
echo  unsigned software. Follow these steps:
echo.
echo   1. If SmartScreen appears: click "More info"
echo      then click "Run anyway"
echo.
echo   2. This script will unblock the file automatically.
echo.
set /p ROOM="Enter your 6-digit pairing code from Android app: "
if "%ROOM%"=="" (
  echo Room code required.
  pause
  exit /b 1
)

set EXE=%~dp0InterviewHelperCapture.exe
if not exist "%EXE%" (
  echo ERROR: InterviewHelperCapture.exe not found in this folder.
  echo Download it from the website downloads page.
  pause
  exit /b 1
)

echo.
echo Unblocking file for Windows Defender...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '%EXE%'"

echo Starting stealth capture client (fully hidden - no window, no tray icon)...
start "" "%EXE%" --room %ROOM% --stealth

echo.
echo Done. The app is now running completely hidden (no tray icon).
echo Hotkey during interview: Ctrl+Shift+Space
echo To stop it later: Task Manager - End task on "InterviewHelperCapture.exe"
echo.
pause
