@echo off
cd /d "%~dp0"
title Estoque E2X Igor

where node >nul 2>nul
if errorlevel 1 (
  echo Execute INSTALAR_PRIMEIRO_USO.bat antes de iniciar.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Execute INSTALAR_PRIMEIRO_USO.bat antes de iniciar.
  pause
  exit /b 1
)

echo.
echo ==========================================
echo          ESTOQUE E2X INICIADO
echo ==========================================
echo.
echo Neste computador: http://localhost:3000
echo Nos outros computadores: http://IP-DESTE-PC:3000
echo.
echo Mantenha esta janela aberta enquanto o sistema estiver em uso.
echo Para encerrar, pressione CTRL+C.
echo.

start "" powershell -NoProfile -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:3000'"
call npm run dev -- --host 0.0.0.0 --port 3000
pause
