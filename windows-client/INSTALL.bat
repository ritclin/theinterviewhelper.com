@echo off
echo Interview Helper - Windows Stealth Capture Installer
echo.
set /p ROOM="Enter your 6-digit pairing code from the Android app: "
if "%ROOM%"=="" (
  echo Room code required.
  pause
  exit /b 1
)
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1" -RoomCode %ROOM%
pause
