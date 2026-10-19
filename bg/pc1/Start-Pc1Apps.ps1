# related files:
# - bg/pc1/Install-Pc1Autostart.ps1
# - bg/pc1/esprit-addin/Esprit.cmd
# - bg/pc1/bridge-server/bridge.cmd
# - bg/pc1/abutment-stl-shadow/shadow-worker.cmd
#
# Boot order after Windows logon (ESPRIT needs interactive desktop):
#   1) ESPRIT + add-in (:8001) — splash/license OK is manual
#   2) bridge-server (:8002)
#   3) abutment STL shadow worker (node, BelowNormal): bg/pc1/abutment-stl-shadow/shadow-worker.cmd
param(
  [int]$DelaySeconds = 45,
  [switch]$SkipDelay,
  [switch]$WhatIf
)

$ErrorActionPreference = "Continue"

function Test-Pc1RootCandidate {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path $Path)) { return $false }
  return (
    (Test-Path (Join-Path $Path "esprit-addin\Esprit.cmd")) -and
    (Test-Path (Join-Path $Path "bridge-server"))
  )
}

function Resolve-Pc1Root {
  $scriptDir = Split-Path -Parent $PSCommandPath
  $candidates = @()
  if ((Split-Path -Leaf $scriptDir) -eq "pc1") {
    $candidates += $scriptDir
  } else {
    $candidates += (Join-Path $scriptDir "pc1")
    $candidates += (Join-Path (Split-Path $scriptDir -Parent) "pc1")
    $candidates += $scriptDir
  }
  foreach ($c in $candidates) {
    if (Test-Pc1RootCandidate -Path $c) {
      return (Resolve-Path $c).Path
    }
  }
  return $null
}

$Pc1Root = Resolve-Pc1Root
if (-not $Pc1Root) {
  Write-Error "PC1 root not found. Run bg\pc1\Start-Pc1Apps.ps1 (not a copy under bg\)."
  exit 1
}
$LogDir = Join-Path $Pc1Root "logs"
if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}
$LogFile = Join-Path $LogDir ("autostart-{0:yyyyMMdd}.log" -f (Get-Date))

function Write-Log {
  param([string]$Message, [string]$Level = "INFO")
  $line = "[{0:yyyy-MM-dd HH:mm:ss}] [{1}] {2}" -f (Get-Date), $Level, $Message
  Write-Host $line
  for ($i = 0; $i -lt 8; $i++) {
    try {
      $fs = [System.IO.File]::Open(
        $LogFile,
        [System.IO.FileMode]::Append,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::ReadWrite
      )
      try {
        $sw = New-Object System.IO.StreamWriter($fs, [System.Text.UTF8Encoding]::new($false))
        try { $sw.WriteLine($line) } finally { $sw.Dispose() }
      } finally { $fs.Dispose() }
      break
    } catch {
      Start-Sleep -Milliseconds 40
    }
  }
}

function Test-TcpPortOpen {
  param([string]$HostName = "127.0.0.1", [int]$Port)
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(800)
    if ($ok -and $client.Connected) {
      $client.EndConnect($iar) | Out-Null
      $client.Close()
      return $true
    }
    $client.Close()
  } catch {}
  return $false
}

function Start-EspritApp {
  $esprit = Get-Process -Name "esprit" -ErrorAction SilentlyContinue
  if ($esprit) {
    Write-Log "ESPRIT already running (pid=$($esprit[0].Id))"
    return
  }
  if (Test-TcpPortOpen -Port 8001) {
    Write-Log "esprit HTTP already listening on :8001"
    return
  }
  $cmd = Join-Path $Pc1Root "esprit-addin\Esprit.cmd"
  if (-not (Test-Path $cmd)) {
    Write-Log "Missing $cmd (Pc1Root wrong?)" "ERROR"
    return
  }
  Write-Log "Starting ESPRIT (Esprit.cmd) — dismiss splash/license OK manually if shown"
  if (-not $WhatIf) {
    Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "`"$cmd`"") -WorkingDirectory (Split-Path $cmd -Parent) -WindowStyle Minimized | Out-Null
  }
}

function Start-BridgeServer {
  if (Test-TcpPortOpen -Port 8002) {
    Write-Log "bridge-server already listening on :8002"
    return
  }
  $exe = Join-Path $Pc1Root "bridge-server\bin\x86\Debug\HiLinkBridgeWebApi48.exe"
  if (-not (Test-Path $exe)) {
    Write-Log "Missing bridge exe: $exe (Pc1Root wrong?)" "ERROR"
    return
  }
  Write-Log "Starting bridge-server: $exe"
  if (-not $WhatIf) {
    Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe -Parent) -WindowStyle Minimized | Out-Null
  }
  for ($i = 0; $i -lt 10; $i++) {
    if (Test-TcpPortOpen -Port 8002) {
      Write-Log "bridge-server listening on :8002"
      return
    }
    Start-Sleep -Seconds 1
  }
  Write-Log "bridge-server :8002 not open yet (check urlacl / local.env / exe console)" "WARN"
}

function Start-AbutmentStlShadowWorker {
  $running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*shadow-remote-worker.js*" }
  if ($running) {
    Write-Log "abutment STL shadow worker already running (pid=$($running[0].ProcessId))"
    return
  }
  $cmd = Join-Path $Pc1Root "abutment-stl-shadow\shadow-worker.cmd"
  $dist = Join-Path $Pc1Root "abutment-stl-shadow\dist"
  if (-not (Test-Path $cmd)) {
    Write-Log "Missing $cmd" "WARN"
    return
  }
  if (-not (Test-Path (Join-Path $dist "shadow-remote-worker.js"))) {
    Write-Log "shadow worker skipped: abutment-stl-shadow\dist\shadow-remote-worker.js not copied yet" "WARN"
    return
  }
  $shadowEnv = Join-Path $Pc1Root "rhino-server\compute\local.env"
  if (-not (Test-Path $shadowEnv)) {
    Write-Log "shadow worker skipped: rhino-server\compute\local.env missing (BACKEND_BASE, RHINO_SHARED_SECRET)" "WARN"
    return
  }
  Write-Log "Starting abutment STL shadow worker (BelowNormal)"
  if (-not $WhatIf) {
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "`"$cmd`"") -WorkingDirectory (Split-Path $cmd -Parent) -WindowStyle Minimized -PassThru
    try { $p.PriorityClass = "BelowNormal" } catch { Write-Log "priority set failed: $($_.Exception.Message)" "WARN" }
  }
}

Write-Log "=== PC1 autostart begin (Pc1Root=$Pc1Root) ==="

if (-not $SkipDelay -and $DelaySeconds -gt 0) {
  Write-Log "Waiting ${DelaySeconds}s for desktop/network after logon..."
  if (-not $WhatIf) { Start-Sleep -Seconds $DelaySeconds }
}

Start-EspritApp
Start-Sleep -Seconds 3
Start-BridgeServer
Start-Sleep -Seconds 2
Start-AbutmentStlShadowWorker

Write-Log "Port check: 8001=$(Test-TcpPortOpen -Port 8001) 8002=$(Test-TcpPortOpen -Port 8002)"
Write-Log "=== PC1 autostart end ==="
