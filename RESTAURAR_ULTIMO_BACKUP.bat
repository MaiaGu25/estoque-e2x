@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Estoque E2X - Restaurar backup

set "RAIZ=E:\Estoque_E2X\Backups"
if not exist "%RAIZ%" (
  echo Nenhum backup foi encontrado no SSD E:.
  pause
  exit /b 1
)

set "ULTIMO="
for /f "delims=" %%D in ('dir "%RAIZ%\backup_*" /b /ad /o-n 2^>nul') do (
  if not defined ULTIMO set "ULTIMO=%%D"
)
if not defined ULTIMO (
  echo Nenhum backup foi encontrado.
  pause
  exit /b 1
)

echo O sistema deve estar fechado para restaurar.
echo Sera usado: %ULTIMO%
set /p "CONFIRMA=Digite SIM para continuar: "
if /I not "!CONFIRMA!"=="SIM" exit /b 0

if exist "data" (
  for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
  move "data" "data_antes_restauracao_!STAMP!" >nul
)
mkdir "data" >nul 2>nul
robocopy "%RAIZ%\%ULTIMO%\data" "data" /E /R:2 /W:1 >nul

echo.
echo Backup restaurado com sucesso.
pause
