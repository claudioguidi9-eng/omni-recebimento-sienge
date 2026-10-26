@echo off
chcp 65001 >nul
title Instalador do Atalho - Omnitrade Brasil

echo ============================================================
echo      INSTALADOR DO ATALHO - OMNITRADE BRASIL
echo      Sistema de Engenharia de Orcamentos & Propostas
echo ============================================================
echo.

set "DEST_DIR=%LOCALAPPDATA%\Omnitrade"
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

set "ICO_PATH=%DEST_DIR%\omnitrade.ico"
set "URL_PROD=https://omnitrade-orcamentos-ai.vercel.app/"
set "ICO_URL=https://omnitrade-orcamentos-ai.vercel.app/assets/omnitrade.ico"

echo [1/3] Baixando icone corporativo oficial...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%ICO_URL%', '%ICO_PATH%')"

if not exist "%ICO_PATH%" (
    echo [AVISO] Nao foi possivel baixar o icone online. Criando atalho padrao...
) else (
    echo [OK] Icone corporativo oficial instalado com sucesso!
)

echo.
echo [2/3] Localizando Area de Trabalho...
for /f "usebackq tokens=*" %%A in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP_DIR=%%A"

if "%DESKTOP_DIR%"=="" set "DESKTOP_DIR=%USERPROFILE%\Desktop"
echo Destino: %DESKTOP_DIR%

echo.
echo [3/3] Criando atalho oficial na Area de Trabalho...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; " ^
  "$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; " ^
  "if (!(Test-Path $edge)) { $edge = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }; " ^
  "if (Test-Path $edge) { " ^
  "  $sc = $WshShell.CreateShortcut('%DESKTOP_DIR%\Omnitrade - Orcamentos AI.lnk'); " ^
  "  $sc.TargetPath = $edge; " ^
  "  $sc.Arguments = '%URL_PROD%'; " ^
  "  if (Test-Path '%ICO_PATH%') { $sc.IconLocation = '%ICO_PATH%,0' }; " ^
  "  $sc.Description = 'Sistema de Orcamentos e Propostas Tecnicas - Omnitrade Brasil'; " ^
  "  $sc.Save(); " ^
  "} else { " ^
  "  $sc = $WshShell.CreateShortcut('%DESKTOP_DIR%\Omnitrade - Orcamentos AI.lnk'); " ^
  "  $sc.TargetPath = '%URL_PROD%'; " ^
  "  $sc.Save(); " ^
  "}"

(
echo [InternetShortcut]
echo URL=%URL_PROD%
echo IconFile=%ICO_PATH%
echo IconIndex=0
) > "%DESKTOP_DIR%\Omnitrade - Orcamentos AI.url"

echo.
echo ============================================================
echo   ATALHO CRIADO COM SUCESSO NA AREA DE TRABALHO!
echo   Basta dar duplo clique em 'Omnitrade - Orcamentos AI'
echo ============================================================
echo.
pause
