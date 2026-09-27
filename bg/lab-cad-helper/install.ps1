# change-log:
# - 2026-09-27: 설치 로직을 cmd 한 줄 명령에서 분리. 예전 헬퍼(v1) 종료 → 복사 → 프로토콜·시작프로그램 → v2 연결 확인.
# related files:
# - bg/lab-cad-helper/여기를_더블클릭_설치.cmd
# - bg/lab-cad-helper/lab-cad-helper.ps1
# - bg/lab-cad-helper/run-hidden.vbs
#
# UTF-8 BOM 필수(PowerShell 5.1).

$ErrorActionPreference = "Stop"
$Src = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dir = Join-Path $env:LOCALAPPDATA "Abuts\LabCadHelper"
$Vbs = Join-Path $Dir "run-hidden.vbs"
$Health = "http://127.0.0.1:8010/health"
$Title = "Abuts 연결 프로그램"

Add-Type -AssemblyName System.Windows.Forms

function Show-Message([string]$Text, [string]$Kind) {
  $icon = [System.Windows.Forms.MessageBoxIcon]::Information
  if ($Kind -eq "warn") { $icon = [System.Windows.Forms.MessageBoxIcon]::Warning }
  if ($Kind -eq "error") { $icon = [System.Windows.Forms.MessageBoxIcon]::Error }
  [void][System.Windows.Forms.MessageBox]::Show($Text, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, $icon)
}

function Stop-OldHelper {
  try {
    Invoke-WebRequest -UseBasicParsing -Method Post -TimeoutSec 2 "http://127.0.0.1:8010/shutdown" | Out-Null
  } catch {}
  try {
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessId -ne $PID -and [string]$_.CommandLine -like "*lab-cad-helper.ps1*" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  } catch {}
  Start-Sleep -Milliseconds 600
}

try {
  foreach ($f in @("lab-cad-helper.ps1", "run-hidden.vbs", "config.example.json")) {
    if (-not (Test-Path -LiteralPath (Join-Path $Src $f))) {
      throw "$f 파일이 없습니다. zip을 통째로 푼 뒤 다시 실행해 주세요."
    }
  }

  Stop-OldHelper

  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  foreach ($f in @("lab-cad-helper.ps1", "run-hidden.vbs", "config.example.json")) {
    Copy-Item -LiteralPath (Join-Path $Src $f) -Destination (Join-Path $Dir $f) -Force
  }
  # config.json(작업 폴더·프로그램 경로)은 유지한다.
  Get-ChildItem -LiteralPath $Dir -File | Unblock-File -ErrorAction SilentlyContinue

  # 브라우저가 헬퍼를 깨울 때 쓰는 abuts-cad:// 프로토콜
  $key = "HKCU:\Software\Classes\abuts-cad"
  New-Item -Path "$key\shell\open\command" -Force | Out-Null
  Set-Item -Path $key -Value "URL:Abuts CAD Helper"
  New-ItemProperty -Path $key -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
  Set-Item -Path "$key\shell\open\command" -Value ('wscript.exe "' + $Vbs + '" "%1"')

  # PC를 켤 때 자동 실행
  $startup = [Environment]::GetFolderPath("Startup")
  $lnk = Join-Path $startup "Abuts CAD Helper.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($lnk)
  $sc.TargetPath = "wscript.exe"
  $sc.Arguments = '"' + $Vbs + '"'
  $sc.WorkingDirectory = $Dir
  $sc.WindowStyle = 7
  $sc.Save()

  Start-Process -FilePath "wscript.exe" -ArgumentList @('"' + $Vbs + '"', "abuts-cad://wake")

  $ok = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $r = Invoke-RestMethod -TimeoutSec 1 $Health
      if ([int]$r.version -ge 2) { $ok = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 400
  }

  if ($ok) {
    Show-Message "설치가 끝났습니다.`r`n`r`n브라우저로 돌아가 「설치 완료 — 열기」를 눌러 주세요." "info"
  } else {
    Show-Message "설치는 됐지만 연결 확인에 실패했습니다.`r`n`r`nPC를 다시 시작하거나, 보안 프로그램이 막았는지 확인해 주세요." "warn"
  }
} catch {
  Show-Message ("설치 중 문제가 생겼습니다.`r`n`r`n" + $_.Exception.Message) "error"
  exit 1
}
