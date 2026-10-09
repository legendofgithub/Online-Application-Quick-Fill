@echo off
chcp 65001 >nul
node "%~dp0archive-resume.cjs"
echo.
pause