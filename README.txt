AUTO (Reverse-Engineered Build)

This is a clean rebuild of the workflow from the original extension:
- Check Facebook login/tokens
- Fetch joined groups via GraphQL
- Select groups
- Post text + images to selected groups

Load in Chrome:
1) Open chrome://extensions
2) Enable Developer mode
3) Click Load unpacked
4) Select:
   d:\FB_Agent_Stabilized\chrome_extension_auto_re

Notes:
- You must be logged in to Facebook in Chrome first.
- This build is readable source (not copied minified bundle).

Developer Logging (local machine) - enabled:
1) Native local logger (Option 1)
- The extension sends background logs to native host: `com.auto_re.logger`.
- Setup on Windows:
  1. Find your extension ID in `chrome://extensions` (or Edge extensions page).
  2. Run:
     `powershell -ExecutionPolicy Bypass -File d:\FB_Agent_Stabilized\chrome_extension_auto_re\dev_logger\install_windows.ps1 -ExtensionId <YOUR_EXTENSION_ID>`
  3. Reload extension.
- Local file output:
  `%LOCALAPPDATA%\AutoRe\dev_logger\events.ndjson`

2) Export logs from UI (Option 4)
- Open `Error Monitor` tab.
- Click `Export Dev Logs`.
- A `.json` file is downloaded with:
  - background logs
  - running campaign snapshot
  - campaigns for active account
  - failed groups for active account
  - error logs for active account
