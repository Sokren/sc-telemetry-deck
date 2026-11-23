@echo off
title SC Telemetry Web
cd /d "%~dp0"
"%~dp0runtime\node.exe" "%~dp0app\server.mjs" %*
if errorlevel 1 pause
