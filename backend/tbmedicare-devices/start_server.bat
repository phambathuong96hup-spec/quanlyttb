@echo off
chcp 65001 >nul
title TBMediCare-Devices Web Server

cd /d "%~dp0"
echo ================================================
echo    TBMediCare-Devices Web Server
echo    TTYT Khu vuc Thanh Ba - Phu Tho
echo ================================================
echo.

python api_server.py
pause
