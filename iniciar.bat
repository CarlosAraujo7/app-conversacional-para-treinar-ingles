@echo off
cd /d "%~dp0"
title English Talk
node server.js
if errorlevel 1 pause
