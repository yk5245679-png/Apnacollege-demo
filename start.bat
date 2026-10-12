@echo off
cd /d "%~dp0"
set NO_OPEN=1
start "CSC Server (band mat karna)" /min cmd /c node server.js
timeout /t 2 >nul
rem Chrome ko alag profile me kholte hain taaki --kiosk-printing (bina dialog print) kaam kare.
start "" chrome --kiosk-printing --user-data-dir="%LOCALAPPDATA%\csc-chrome" --app=http://localhost:3000
if errorlevel 1 start "" http://localhost:3000
