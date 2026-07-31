@echo off
setlocal
title SOPH.IA - Backend
cd /d "%~dp0"

set "SOPHIA_PYTHON=C:\Users\70361772254\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if not exist "%SOPHIA_PYTHON%" (
  echo.
  echo ERRO: O ambiente Python da SOPH.IA nao foi encontrado.
  echo Caminho esperado:
  echo %SOPHIA_PYTHON%
  echo.
  pause
  exit /b 1
)

echo.
echo Iniciando a SOPH.IA...
echo Nao feche esta janela enquanto estiver utilizando o sistema.
echo.

"%SOPHIA_PYTHON%" "work\start_backend.py"

echo.
echo O backend da SOPH.IA foi encerrado.
pause
