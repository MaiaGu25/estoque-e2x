@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Estoque E2X - Backup

if not exist "E:\" (
  echo O SSD externo E: nao foi encontrado.
  echo Conecte o SSD e tente novamente.
  pause
  exit /b 1
)

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "DESTINO=E:\Estoque_E2X\Backups\backup_%STAMP%"

if not exist ".wrangler\state" (
  echo Nenhum banco local foi encontrado.
  echo Inicie o sistema pelo menos uma vez antes de fazer o backup.
  pause
  exit /b 1
)

mkdir "%DESTINO%" >nul 2>nul
robocopy ".wrangler\state" "%DESTINO%\state" /E /R:2 /W:1 >nul
copy ".openai\hosting.json" "%DESTINO%\hosting.json" >nul

echo.
echo Backup concluido com sucesso:
echo %DESTINO%
pause
