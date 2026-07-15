# Silent install: copies capture client to AppData and adds to Startup folder
# Run as: powershell -ExecutionPolicy Bypass -File install.ps1 -RoomCode 123456

param(
  [Parameter(Mandatory = $true)]
  [string]$RoomCode,

  [string]$Server = "https://theinterviewhelpercom-production.up.railway.app"
)

$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "InterviewHelper"
$exeName = "InterviewHelperCapture.exe"
$sourceExe = Join-Path $PSScriptRoot "dist\$exeName"

if (-not (Test-Path $sourceExe)) {
  Write-Host "Build the exe first: powershell -File build.ps1"
  exit 1
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item $sourceExe (Join-Path $installDir $exeName) -Force

$launcher = Join-Path $installDir "launch.vbs"
$vbsContent = @"
Set shell = CreateObject("WScript.Shell")
shell.Run """$installDir\$exeName"" --room $RoomCode --server $Server --stealth", 0, False
"@
Set-Content -Path $launcher -Value $vbsContent -Encoding ASCII

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "InterviewHelperCapture.lnk"
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$launcher`""
$shortcut.WorkingDirectory = $installDir
$shortcut.WindowStyle = 7
$shortcut.Description = "Interview Helper stealth screen capture"
$shortcut.Save()

Write-Host "Installed to $installDir"
Write-Host "Stealth client will start automatically on login."
Write-Host "Hotkey: Ctrl+Shift+Space to capture and send to Android."
Write-Host "Room code: $RoomCode"

# Start now
Start-Process "wscript.exe" -ArgumentList "`"$launcher`""
