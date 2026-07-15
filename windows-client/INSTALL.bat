@echo off
title Interview Helper - Windows Install
color 0B
echo.
echo  ============================================================
echo   Interview Helper - Windows Install
echo  ============================================================
echo.
echo  This app is NOT installed through the Microsoft Store.
echo  You run it from this folder using the steps below.
echo.
echo  IMPORTANT:
echo   - Do NOT double-click InterviewHelperCapture.exe directly
echo   - Use this INSTALL.bat or RUN-STEALTH.bat instead
echo.
echo  If Windows SmartScreen or Defender blocks the app:
echo   1. Click "More info" on the blue SmartScreen window
echo   2. Click "Run anyway"
echo   3. Or right-click the .exe - Properties - check Unblock - OK
echo.
pause
echo.
call "%~dp0RUN-STEALTH.bat"
