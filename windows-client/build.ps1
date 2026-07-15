# Build Windows stealth capture client (.exe)
# Run in PowerShell from windows-client/

$ErrorActionPreference = "Stop"

Write-Host "Installing Python dependencies..."
pip install -r requirements.txt -r requirements-build.txt

Write-Host "Building stealth executable..."
pyinstaller `
  --noconsole `
  --onefile `
  --name "InterviewHelperCapture" `
  --hidden-import=engineio.async_drivers.threading `
  --hidden-import=pystray._win32 `
  client.py

Write-Host ""
Write-Host "Built: dist\InterviewHelperCapture.exe"
Write-Host ""
Write-Host "Usage (stealth tray mode):"
Write-Host '  dist\InterviewHelperCapture.exe --room 123456 --stealth'
Write-Host ""
Write-Host "Run install.ps1 to install silently with Windows startup."
