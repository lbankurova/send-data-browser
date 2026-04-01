@echo off
REM Launch Chrome with remote debugging for Chrome DevTools MCP
REM Run this before starting a Claude Code session that needs live UI inspection
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%TEMP%\chrome-debug-profile" ^
  http://localhost:5173
echo Chrome launched with remote debugging on port 9222
echo Navigate to http://localhost:5173 in the debug Chrome window
echo Claude Code's chrome-devtools MCP will connect automatically
