@echo off
setlocal
title SOPH.IA - Acesso pela rede interna
cd /d "%~dp0"

set "SOPHIA_PYTHON=C:\Users\70361772254\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if not exist "%SOPHIA_PYTHON%" (
  echo.
  echo ERRO: O ambiente Python da SOPH.IA nao foi encontrado.
  echo Caminho esperado: %SOPHIA_PYTHON%
  echo.
  pause
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo.
  echo Preparando a interface pela primeira vez...
  pushd frontend
  call npm install
  if errorlevel 1 (
    popd
    echo.
    echo ERRO: Nao foi possivel preparar a interface.
    pause
    exit /b 1
  )
  popd
)

echo.
echo Atualizando a interface...
pushd frontend
call npm run build
if errorlevel 1 (
  popd
  echo.
  echo ERRO: Nao foi possivel preparar a interface.
  pause
  exit /b 1
)
popd

echo.
echo Iniciando o backend da SOPH.IA...
start "SOPH.IA - Backend" /D "%~dp0" "%SOPHIA_PYTHON%" "work\start_backend.py"

echo Iniciando a interface para a rede interna...
start "SOPH.IA - Interface" /D "%~dp0" "%SOPHIA_PYTHON%" "work\serve_frontend.py"

timeout /t 3 /nobreak >nul

set "SOPHIA_IP="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$c = Get-NetIPConfiguration ^| Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } ^| Select-Object -First 1; if ($c) { $c.IPv4Address.IPAddress }"`) do set "SOPHIA_IP=%%A"

echo.
echo ============================================================
echo SOPH.IA iniciada.
echo.
echo Nesta maquina: http://localhost:5174
if defined SOPHIA_IP echo Na rede interna: http://%SOPHIA_IP%:5174
echo ============================================================
echo.
echo Mantenha as duas janelas abertas durante o uso.
echo Para encerrar, feche as janelas Backend e Interface.
echo.
start "" "http://localhost:5174"
pause
