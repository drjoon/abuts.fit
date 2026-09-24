@echo off
chcp 65001 >nul
REM Abuts CAD 연결 — 최초 1회 설치 (더블클릭만)
REM - LocalAppData 복사 · Windows 시작 시 자동 실행 · abuts-cad:// 프로토콜 등록
setlocal
set "SRC=%~dp0"
set "INSTALL_DIR=%LOCALAPPDATA%\Abuts\LabCadHelper"

echo.
echo  ========================================
echo   Abuts — 디자인 프로그램 연결 설치
echo  ========================================
echo.

if not exist "%SRC%lab-cad-helper.ps1" (
  echo [오류] lab-cad-helper.ps1 이 없습니다. zip을 통째로 풀어 주세요.
  echo.
  pause
  exit /b 1
)

mkdir "%INSTALL_DIR%" 2>nul
copy /Y "%SRC%lab-cad-helper.ps1" "%INSTALL_DIR%\lab-cad-helper.ps1" >nul
copy /Y "%SRC%run-hidden.vbs" "%INSTALL_DIR%\run-hidden.vbs" >nul
if exist "%SRC%config.example.json" (
  copy /Y "%SRC%config.example.json" "%INSTALL_DIR%\config.example.json" >nul
)
if not exist "%INSTALL_DIR%\config.json" (
  if exist "%SRC%config.example.json" (
    copy /Y "%SRC%config.example.json" "%INSTALL_DIR%\config.json" >nul
  ) else if exist "%SRC%config.json" (
    copy /Y "%SRC%config.json" "%INSTALL_DIR%\config.json" >nul
  )
)

REM URL 프로토콜 (브라우저가 헬퍼를 깨울 때)
reg add "HKCU\Software\Classes\abuts-cad" /ve /d "URL:Abuts CAD Helper" /f >nul
reg add "HKCU\Software\Classes\abuts-cad" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\abuts-cad\shell\open\command" /ve /d "wscript.exe \"%INSTALL_DIR%\run-hidden.vbs\" \"%%1\"" /f >nul

REM PC 켤 때 자동 시작
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$dir=$env:LOCALAPPDATA+'\Abuts\LabCadHelper'; $startup=[Environment]::GetFolderPath('Startup'); $lnk=Join-Path $startup 'Abuts CAD Helper.lnk'; $s=(New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $s.TargetPath='wscript.exe'; $s.Arguments='\"'+$dir+'\run-hidden.vbs\"'; $s.WorkingDirectory=$dir; $s.WindowStyle=7; $s.Save()"

REM 지금 바로 실행 (창 숨김)
wscript.exe "%INSTALL_DIR%\run-hidden.vbs" "abuts-cad://wake"

REM 연결 대기 후 안내
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok=$false; 1..20 | ForEach-Object { try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:8010/health'; if($r.StatusCode -eq 200){$ok=$true; break} } catch {} ; Start-Sleep -Milliseconds 400 }; " ^
  "Add-Type -AssemblyName System.Windows.Forms; " ^
  "if($ok){ [System.Windows.Forms.MessageBox]::Show(\"설치가 끝났습니다.`r`n`r`n브라우저로 돌아가 「열기」를 다시 눌러 주세요.\",'Abuts CAD 연결',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null } " ^
  "else { [System.Windows.Forms.MessageBox]::Show(\"설치는 됐지만 연결 확인에 실패했습니다.`r`nPC를 다시 시작하거나, 보안 프로그램이 차단했는지 확인해 주세요.\",'Abuts CAD 연결',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null }"

exit /b 0
