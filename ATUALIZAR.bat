@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Estoque E2X - Atualizacao

echo ==========================================
echo       ESTOQUE E2X - ATUALIZACAO
echo ==========================================
echo.

:VERIFICAR_SISTEMA_RODANDO
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo O sistema ainda esta rodando nesta janela do INICIAR_ESTOQUE.bat.
  echo.
  echo Feche essa janela AGORA. Isso e importante: se ela continuar
  echo aberta, o programa antigo fica rodando na memoria mesmo depois
  echo dos arquivos serem atualizados no disco, e a atualizacao nao
  echo entra em vigor direito.
  echo.
  echo Depois de fechar, pressione uma tecla aqui para continuar.
  pause >nul
  goto VERIFICAR_SISTEMA_RODANDO
)

where git >nul 2>nul
if errorlevel 1 (
  echo O Git ainda nao esta instalado.
  echo Tentando instalar automaticamente pelo Windows...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo.
    echo Nao foi possivel instalar automaticamente.
    echo Instale o Git em https://git-scm.com/download/win e execute este arquivo novamente.
    pause
    exit /b 1
  )
  winget install Git.Git --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo Falha ao instalar o Git.
    pause
    exit /b 1
  )
  echo.
  echo Git instalado. Feche esta janela e execute este arquivo novamente.
  pause
  exit /b 0
)

if not exist ".git" (
  echo Primeira atualizacao por aqui: conectando esta pasta ao GitHub...
  git init >nul
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/MaiaGu25/estoque-e2x.git
) else (
  git remote set-url origin https://github.com/MaiaGu25/estoque-e2x.git
)

echo.
echo Baixando a versao mais recente (requer internet)...
git fetch origin main
if errorlevel 1 (
  echo.
  echo Nao foi possivel baixar as atualizacoes. Verifique sua internet.
  pause
  exit /b 1
)

git reset --hard origin/main
if errorlevel 1 (
  echo.
  echo Nao foi possivel aplicar a atualizacao.
  pause
  exit /b 1
)

echo.
echo Atualizando os componentes do sistema...
call npm ci
if errorlevel 1 (
  echo Nao foi possivel atualizar os componentes.
  pause
  exit /b 1
)

echo.
echo Preparando a interface atualizada...
call npm run build
if errorlevel 1 (
  echo Nao foi possivel preparar a interface.
  pause
  exit /b 1
)

echo.
echo ==========================================
echo   ATUALIZACAO CONCLUIDA
echo ==========================================
echo.
echo A pasta "data" (seu banco de dados) nao foi alterada.
echo Agora use INICIAR_ESTOQUE.bat normalmente.
pause
