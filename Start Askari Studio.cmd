@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "Start-Process -FilePath '.\runtime\python.exe' -ArgumentList 'server.py' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden"
