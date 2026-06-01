@echo off
chcp 65001 >nul
title TBMediCare-Devices Sync Engine

cd /d "%~dp0"
echo ================================================
echo    TBMediCare-Devices Sync Engine
echo    TTYT Khu vuc Thanh Ba - Phu Tho
echo ================================================
echo.

python sync_devices.py
pause
