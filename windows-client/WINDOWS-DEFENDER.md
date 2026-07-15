# Windows install guide — SmartScreen / Defender

PyInstaller executables are often flagged because they are **unsigned**. This is expected for new software without a code-signing certificate.

## Quick fix (recommended)

1. Download **`RUN-STEALTH.bat`** together with **`InterviewHelperCapture.exe`** (same folder).
2. Right-click **`RUN-STEALTH.bat`** → **Run as administrator** (optional but helps).
3. Enter your 6-digit Android pairing code.
4. If SmartScreen appears:
   - Click **More info**
   - Click **Run anyway**

## Manual unblock

PowerShell (Run as Administrator):

```powershell
Unblock-File -LiteralPath "C:\path\to\InterviewHelperCapture.exe"
```

Or: Right-click the `.exe` → **Properties** → check **Unblock** at the bottom → **OK**.

## Install silently on startup

After confirming the exe runs:

```powershell
cd path\to\windows-client
powershell -ExecutionPolicy Bypass -File install.ps1 -RoomCode YOUR_6_DIGIT_CODE
```

## Why Defender blocks it

- The app is not signed with a commercial code certificate (~€200+/year).
- PyInstaller packs Python into one file, which some antivirus heuristics flag.
- The app uses global hotkeys and screen capture (required for interview assistance).

The source code is open in this repository under `windows-client/client.py`.

## Still blocked?

Add an exclusion for the install folder:

**Windows Security** → **Virus & threat protection** → **Manage settings** → **Exclusions** → Add folder containing `InterviewHelperCapture.exe`.
