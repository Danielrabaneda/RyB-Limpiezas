@echo off
title Instalador del conector VeriFactu de LimpiaGest
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-LimpiaGestConnector.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo completar la conexion. Revisa el mensaje anterior.
  pause
  exit /b 1
)
echo.
echo Instalacion completada.
pause
