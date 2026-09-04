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

node -e "process.exit(parseInt(process.versions.node) >= 22 ? 0 : 1)"
if errorlevel 1 (
  echo O Node.js instalado e uma versao antiga demais para este sistema.
  echo Tentando atualizar automaticamente pelo Windows...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo.
    echo Nao foi possivel atualizar automaticamente.
    echo Baixe e instale o Node.js LTS mais recente em https://nodejs.org e execute este arquivo novamente.
    pause
    exit /b 1
  )
  winget upgrade OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  echo.
  echo Feche esta janela, abra um novo terminal e execute este arquivo novamente.
  pause
  exit /b 0
)

echo Preparando os componentes do sistema (requer internet)...
call npm ci
if errorlevel 1 (
  echo.
  echo Nao foi possivel concluir a instalacao.
  pause
  exit /b 1
)

echo.
echo Preparando a interface do sistema...
call npm run build
if errorlevel 1 (
  echo.
  echo Nao foi possivel preparar a interface do sistema.
  pause
  exit /b 1
)

if not exist "E:\Estoque_E2X\Backups" mkdir "E:\Estoque_E2X\Backups" >nul 2>nul

echo.
echo Instalacao concluida.
echo Agora use INICIAR_ESTOQUE.bat.
pause
