# related files:
# - bg/pc1/Install-Pc1Autostart.ps1
# - bg/pc1/rhino-server/compute/rhino.cmd
# - bg/pc1/rhino-server/compute/scripts/init_instance.py
# - bg/pc1/esprit-addin/Esprit.cmd
# - bg/pc1/bridge-server/bridge.cmd
# - bg/pc1/rhino-server/rules.md
#
# Boot order after Windows logon (Rhino/ESPRIT need interactive desktop):
#   1) Rhino 8 + ScriptEditor wake (RhinoCode pipe)
#   2) rhino-server (:8000)
#   3) ESPRIT + add-in (:8001)
#   4) bridge-server (:8002)
param(
  [int]$DelaySeconds = 45,
  [int]$RhinoReadyTimeoutSec = 180,
  [switch]$SkipDelay,
  [switch]$ForceRhinoRestart,
  [switch]$WhatIf
)

$ErrorActionPreference = "Continue"

function Test-Pc1RootCandidate {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path $Path)) { return $false }
  return (
    (Test-Path (Join-Path $Path "rhino-server\compute\rhino.cmd")) -and
    (Test-Path (Join-Path $Path "esprit-addin\Esprit.cmd")) -and
    (Test-Path (Join-Path $Path "bridge-server"))
  )
}

function Resolve-Pc1Root {
  $scriptDir = Split-Path -Parent $PSCommandPath
  $candidates = @(
    $scriptDir,
    (Join-Path $scriptDir "pc1"),
    (Join-Path (Split-Path $scriptDir -Parent) "pc1")
  )
  foreach ($c in $candidates) {
    if (Test-Pc1RootCandidate -Path $c) {
      return (Resolve-Path $c).Path
    }
  }
  return $scriptDir
}

$Pc1Root = Resolve-Pc1Root
$LogDir = Join-Path $Pc1Root "logs"
if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}
$LogFile = Join-Path $LogDir ("autostart-{0:yyyyMMdd}.log" -f (Get-Date))

function Write-Log {
  param([string]$Message, [string]$Level = "INFO")
  $line = "[{0:yyyy-MM-dd HH:mm:ss}] [{1}] {2}" -f (Get-Date), $Level, $Message
  Write-Host $line
  try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch {}
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

function Read-EnvFileValue {
  param([string]$EnvPath, [string]$Key)
  if (-not (Test-Path $EnvPath)) { return $null }
  foreach ($line in Get-Content -Path $EnvPath -ErrorAction SilentlyContinue) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -match '^\s*#') { continue }
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
      return $Matches[1].Trim().Trim('"')
    }
  }
  return $null
}

function Resolve-RhinoPaths {
  $rhinoEnv = Join-Path $Pc1Root "rhino-server\compute\local.env"
  $rhinoApp = Read-EnvFileValue -EnvPath $rhinoEnv -Key "RHINO_APP"
  $rhinoCode = Read-EnvFileValue -EnvPath $rhinoEnv -Key "RHINOCODE_BIN"
  if (-not $rhinoApp) {
    $rhinoApp = "C:\Program Files\Rhino 8\System\Rhino.exe"
  }
  if (-not $rhinoCode) {
    $rhinoCode = "C:\Program Files\Rhino 8\System\RhinoCode.exe"
  }
  return @{
    RhinoApp = $rhinoApp
    RhinoCode = $rhinoCode
    InitScript = (Join-Path $Pc1Root "rhino-server\compute\scripts\init_instance.py")
    EnvFile = $rhinoEnv
  }
}

function Get-RhinoCodeListRaw {
  param([string]$RhinoCode)
  if (-not (Test-Path $RhinoCode)) { return "" }
  try {
    $out = & $RhinoCode list --json 2>&1 | Out-String
    return $out.Trim()
  } catch {
    return ""
  }
}

function Get-RhinoCodePipeCount {
  param([string]$RhinoCode)
  $text = Get-RhinoCodeListRaw -RhinoCode $RhinoCode
  if (-not $text -or $text -eq "[]" -or $text -eq "null") { return 0 }
  try {
    $parsed = $text | ConvertFrom-Json -ErrorAction Stop
    if ($null -eq $parsed) { return 0 }
    if ($parsed -is [System.Array]) { return $parsed.Count }
    return 1
  } catch {
    # Non-JSON list output: count non-empty lines as a weak signal.
    $lines = @($text -split "`r?`n" | Where-Object { $_.Trim() -ne "" })
    return $lines.Count
  }
}

function Get-RhinoProcesses {
  $procs = @(Get-Process -Name "Rhino" -ErrorAction SilentlyContinue)
  return $procs
}

function Invoke-RhinoScriptEditorViaCom {
  # Prefer in-process wake when Rhino is already open.
  $progIds = @("Rhino.Application.8", "Rhino.Application")
  foreach ($id in $progIds) {
    try {
      $app = [Runtime.InteropServices.Marshal]::GetActiveObject($id)
      # Underscore = no command echo; opens ScriptEditor / wakes RhinoCode.
      $null = $app.RunScript("_ScriptEditor", $false)
      Write-Log "Sent _ScriptEditor via COM ($id)"
      return $true
    } catch {
      Write-Log "COM $id unavailable: $($_.Exception.Message)" "WARN"
    }
  }
  return $false
}

function Start-FreshRhinoWithScriptEditor {
  param($Paths)
  if (-not (Test-Path $Paths.RhinoApp)) {
    Write-Log "Rhino.exe not found: $($Paths.RhinoApp)" "ERROR"
    return $false
  }
  Write-Log "Starting Rhino 8 with -runscript=_ScriptEditor"
  if (-not $WhatIf) {
    Start-Process -FilePath $Paths.RhinoApp -ArgumentList @(
      "-nosplash",
      "-runscript=_ScriptEditor"
    ) | Out-Null
  }
  return $true
}

function Restart-RhinoWithScriptEditor {
  param($Paths)
  Write-Log "Restarting Rhino so ScriptEditor can wake RhinoCode..." "WARN"
  if ($WhatIf) { return $true }
  Get-RhinoProcesses | ForEach-Object {
    try {
      Write-Log "Stopping Rhino pid=$($_.Id)"
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    } catch {}
  }
  Start-Sleep -Seconds 4
  return (Start-FreshRhinoWithScriptEditor -Paths $Paths)
}

function Start-RhinoWithScriptEditor {
  param($Paths)

  $existing = Get-RhinoProcesses
  $needRestart = [bool]$ForceRhinoRestart

  if ($needRestart) {
    Restart-RhinoWithScriptEditor -Paths $Paths | Out-Null
  } elseif ($existing.Count -gt 0) {
    Write-Log "Rhino already running (pid=$($existing[0].Id))"
    $count = Get-RhinoCodePipeCount -RhinoCode $Paths.RhinoCode
    if ($count -gt 0) {
      Write-Log "RhinoCode list already OK (pipes=$count)"
      return $true
    }
    Write-Log "RhinoCode list empty while Rhino is up — waking ScriptEditor..."
    $raw = Get-RhinoCodeListRaw -RhinoCode $Paths.RhinoCode
    Write-Log "rhinocode list --json raw: $(if ($raw) { $raw } else { '(empty)' })"
    $comOk = Invoke-RhinoScriptEditorViaCom
    if (-not $comOk) {
      # COM disabled / not registered → hard restart is the reliable wake path.
      Restart-RhinoWithScriptEditor -Paths $Paths | Out-Null
    }
  } else {
    Start-FreshRhinoWithScriptEditor -Paths $Paths | Out-Null
  }

  $deadline = (Get-Date).AddSeconds($RhinoReadyTimeoutSec)
  $woke = $false
  $comRetried = $false
  $restartRetried = $false

  while ((Get-Date) -lt $deadline) {
    $count = Get-RhinoCodePipeCount -RhinoCode $Paths.RhinoCode
    if ($count -gt 0) {
      Write-Log "RhinoCode list OK (pipes=$count)"
      # Optional: run init script against the live pipe (health ping).
      if ((Test-Path $Paths.RhinoCode) -and (Test-Path $Paths.InitScript) -and -not $WhatIf) {
        try {
          $p = Start-Process -FilePath $Paths.RhinoCode -ArgumentList @(
            "script", $Paths.InitScript
          ) -PassThru -WindowStyle Minimized -ErrorAction SilentlyContinue
          if ($p -and -not $p.WaitForExit(30000)) {
            try { $p.Kill() } catch {}
          } elseif ($p) {
            Write-Log "init_instance.py exitCode=$($p.ExitCode)"
          }
        } catch {
          Write-Log "init_instance.py failed: $($_.Exception.Message)" "WARN"
        }
      }
      $woke = $true
      break
    }

    $elapsed = [int]((New-TimeSpan -Start ($deadline.AddSeconds(-$RhinoReadyTimeoutSec)) -End (Get-Date)).TotalSeconds)
    Write-Log "Waiting for RhinoCode pipes... (${elapsed}s / ${RhinoReadyTimeoutSec}s)"

    # Escalation: COM once more around 20s, then full Rhino restart around 40s.
    if (-not $comRetried -and $elapsed -ge 20) {
      $comRetried = $true
      Invoke-RhinoScriptEditorViaCom | Out-Null
    }
    if (-not $restartRetried -and $elapsed -ge 40) {
      $restartRetried = $true
      Restart-RhinoWithScriptEditor -Paths $Paths | Out-Null
    }

    Start-Sleep -Seconds 5
  }

  if (-not $woke) {
    $raw = Get-RhinoCodeListRaw -RhinoCode $Paths.RhinoCode
    Write-Log "RhinoCode pipes still empty after ${RhinoReadyTimeoutSec}s. raw=$(if ($raw) { $raw } else { '(empty)' })" "WARN"
    Write-Log "Open ScriptEditor once manually in Rhino, or re-run with -ForceRhinoRestart." "WARN"
  }
  return $woke
}

function Start-RhinoServer {
  if (Test-TcpPortOpen -Port 8000) {
    Write-Log "rhino-server already listening on :8000"
    return
  }
  $cmd = Join-Path $Pc1Root "rhino-server\compute\rhino.cmd"
  if (-not (Test-Path $cmd)) {
    Write-Log "Missing $cmd (Pc1Root wrong?)" "ERROR"
    return
  }
  Write-Log "Starting rhino-server (rhino.cmd)"
  if (-not $WhatIf) {
    Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "`"$cmd`"") -WorkingDirectory (Split-Path $cmd -Parent) -WindowStyle Minimized | Out-Null
  }
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
  Write-Log "Starting ESPRIT (Esprit.cmd)"
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
  # Do not use bridge.cmd (forces MOCK=1). local.env is loaded by Config.TryLoadLocalEnv.
  Write-Log "Starting bridge-server: $exe"
  if (-not $WhatIf) {
    Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe -Parent) -WindowStyle Minimized | Out-Null
  }
}

Write-Log "=== PC1 autostart begin (Pc1Root=$Pc1Root) ==="
if (-not (Test-Pc1RootCandidate -Path $Pc1Root)) {
  Write-Log "Pc1Root does not look like bg/pc1 (missing rhino/esprit/bridge). Run from bg\pc1 after pull." "ERROR"
}

if (-not $SkipDelay -and $DelaySeconds -gt 0) {
  Write-Log "Waiting ${DelaySeconds}s for desktop/network after logon..."
  if (-not $WhatIf) { Start-Sleep -Seconds $DelaySeconds }
}

$rhinoPaths = Resolve-RhinoPaths
Write-Log "RHINO_APP=$($rhinoPaths.RhinoApp)"
Write-Log "RHINOCODE_BIN=$($rhinoPaths.RhinoCode)"
Write-Log "local.env exists=$(Test-Path $rhinoPaths.EnvFile)"

Start-RhinoWithScriptEditor -Paths $rhinoPaths | Out-Null
Start-Sleep -Seconds 3
Start-RhinoServer
Start-Sleep -Seconds 5
Start-EspritApp
Start-Sleep -Seconds 8
Start-BridgeServer

Write-Log "Port check: 8000=$(Test-TcpPortOpen -Port 8000) 8001=$(Test-TcpPortOpen -Port 8001) 8002=$(Test-TcpPortOpen -Port 8002)"
Write-Log "=== PC1 autostart end ==="
