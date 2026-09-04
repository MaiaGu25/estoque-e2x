@echo off
title Estoque E2X - Endereco da rede
echo.
echo Procure abaixo o Endereco IPv4 da conexao em uso.
echo Nos outros computadores, acesse:
echo http://ENDERECO-IP:3000
echo.
ipconfig | findstr /i "IPv4"
echo.
pause
