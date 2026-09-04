@echo off
setlocal
cd /d "%~dp0"
title Estoque E2X - Instalacao

echo ==========================================
echo       ESTOQUE E2X - PRIMEIRO USO
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js ainda nao esta instalado.
  echo Tentando instalar automaticamente pelo Windows...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo.
    echo Nao foi possivel instalar automaticamente.
    echo Instale o Node.js LTS em https://nodejs.org e execute este arquivo novamente.
    pause
    exit /b 1
  )
  winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo Falha ao instalar o Node.js.
    pause
    exit /b 1
  )
  echo.
  echo Node.js instalado. Feche esta janela e execute este arquivo novamente.
  pause
  exit /b 0
)

echo Preparando os componentes do sistema...
call npm ci
if errorlevel 1 (
  echo.
  echo Nao foi possivel concluir a instalacao.
  pause
  exit /b 1
)

if not exist "E:\Estoque_E2X\Backups" mkdir "E:\Estoque_E2X\Backups"
echo.
echo Instalacao concluida.
echo Agora use INICIAR_ESTOQUE.bat.
pause
