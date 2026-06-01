@echo off
chcp 65001 >nul
title TBMediCare-Devices Database Server

cd /d "%~dp0"
echo ================================================
echo    TBMediCare-Devices Database Server
echo    TTYT Khu vuc Thanh Ba - Phu Tho
echo ================================================
echo.

echo Dang khoi dong PostgreSQL Database...
E:\Setup\drp_pg\pgsql\bin\postgres.exe -D E:\Setup\drp_pg\data
pause
