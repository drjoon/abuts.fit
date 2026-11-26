param(
  [ValidateSet("install", "remove", "restart", "status")]
  [string]$Action = "install",
  [string]$ServiceName = "AbutsLotServer",
  [string]$NssmPath = "",
  [string]$NodePath = "C:\\Program Files\\nodejs\\node.exe"
)

function Assert-Executable {
  param(
    [string]$Path,
    [string]$Label
  )
  if (-not (Test-Path $Path)) {
    throw "${Label} not found: $Path"
  }
}

function Get-NssmPath {
  param(
    [string]$Current,
    [string]$ScriptDir
  )
  if ($Current -and (Test-Path $Current)) { return $Current }

  $candidates = @(
    (Join-Path $ScriptDir "nssm.exe"),
    "C:\\tools\\nssm\\nssm.exe",
    "C:\\Program Files\\nssm\\nssm.exe",
    "C:\\Program Files\\nssm-2.24\\win64\\nssm.exe",
    "C:\\Program Files\\nssm-2.24\\win32\\nssm.exe"
  )
  $pf = [Environment]::GetEnvironmentVariable("ProgramFiles")
  $pf86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  if ($pf) { $candidates += (Join-Path $pf "nssm\\nssm.exe") }
  if ($pf86) { $candidates += (Join-Path $pf86 "nssm\\nssm.exe") }

  $found = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($found) { return $found }
  try {
    $fromPath = (where.exe nssm 2>$null | Select-Object -First 1)
    if ($fromPath) { return $fromPath }
  } catch {}
  return $Current
}

function Get-NodePath {
  param([string]$Current)
  if (Test-Path $Current) { return $Current }

  # env 키를 명시적으로 조회해 괄호 파싱 오류 방지
  $pf = [Environment]::GetEnvironmentVariable("ProgramFiles")
  $pf86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  $candidates = @()
  if ($pf) { $candidates += (Join-Path $pf "nodejs\node.exe") }
  if ($pf86) { $candidates += (Join-Path $pf86 "nodejs\node.exe") }
  $candidates = $candidates | Where-Object { $_ -and (Test-Path $_) }
  if ($candidates.Length -gt 0) { return $candidates[0] }
  try {
    $found = (where.exe node 2>$null | Select-Object -First 1)
    if ($found) { return $found }
  } catch {}
  return $Current
}

function Install-Node {
  Write-Host "Attempting to install Node.js via winget (LTS)..."
  try {
    $winget = (where.exe winget 2>$null | Select-Object -First 1)
    if ($winget) {
      & $winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    }
  } catch {}
}

$scriptDir = Split-Path -Parent $PSCommandPath
$logDir = Join-Path $scriptDir "logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$NssmPath = Get-NssmPath -Current $NssmPath -ScriptDir $scriptDir
Assert-Executable -Path $NssmPath -Label "NSSM"

if (-not (Test-Path $NodePath)) {
  $NodePath = Get-NodePath -Current $NodePath
}
if (-not (Test-Path $NodePath)) {
  Install-Node
  $NodePath = Get-NodePath -Current $NodePath
}
Assert-Executable -Path $NodePath -Label "Node.js"

$npmPath = Join-Path (Split-Path $NodePath -Parent) "npm.cmd"
if (-not (Test-Path $npmPath)) { $npmPath = "npm" }

# Ensure Node.js is modern enough (fetch required): v18+
try {
  $nodeVersionRaw = & $NodePath -v
  if ($nodeVersionRaw) {
    $m = [regex]::Match($nodeVersionRaw, "v(\d+)")
    if ($m.Success) {
      $major = [int]$m.Groups[1].Value
      if ($major -lt 18) {
        Write-Warning "Node.js v$major detected (<18). Trying to install LTS via winget."
        Install-Node
        $NodePath = Get-NodePath -Current $NodePath
      }
    }
  }
} catch {}

switch ($Action) {
  "install" {
    # Install production dependencies if missing (ensures 'sharp' etc.)
    $needsInstall = $true
    try {
      $nodeModules = Join-Path $scriptDir "node_modules"
      if (Test-Path (Join-Path $nodeModules "sharp")) { $needsInstall = $false }
    } catch { $needsInstall = $true }

    if ($needsInstall) {
      $pkgLock = Join-Path $scriptDir "package-lock.json"
      if (Test-Path $pkgLock) {
        $cmd = "ci --omit=dev"
      } else {
        $cmd = "install --omit=dev"
      }
      Write-Host "Installing npm dependencies ($cmd) ..."
      Push-Location $scriptDir
      try {
        $npmArgs = $cmd.Split(' ')
        & $npmPath @npmArgs
      } catch {
        Write-Warning "npm $cmd failed: $($_.Exception.Message). Continuing..."
      } finally {
        Pop-Location
      }
    }

    # lot-server HTTP(8012) + 로컬 OCR. Windows 부팅 시 자동 시작.
    foreach ($legacyName in @("AbutsLotCaptureServer", $ServiceName)) {
      try { & $NssmPath stop $legacyName 2>$null | Out-Null } catch {}
      try { & $NssmPath remove $legacyName confirm 2>$null | Out-Null } catch {}
    }
    & $NssmPath install $ServiceName $NodePath "src\index.js" | Out-Null
    & $NssmPath set $ServiceName AppDirectory $scriptDir | Out-Null
    & $NssmPath set $ServiceName AppEnvironmentExtra `
      "PORT=8012" `
      "HOST=127.0.0.1" `
      "TZ=Asia/Seoul" `
      "LOT_AUTO_WATCH=0" | Out-Null
    & $NssmPath set $ServiceName AppStdout (Join-Path $logDir "stdout.log") | Out-Null
    & $NssmPath set $ServiceName AppStderr (Join-Path $logDir "stderr.log") | Out-Null
    & $NssmPath set $ServiceName AppRotateFiles 1 | Out-Null
    & $NssmPath set $ServiceName AppRotateBytes 1048576 | Out-Null
    & $NssmPath set $ServiceName AppExit Default Restart | Out-Null
    & $NssmPath set $ServiceName AppThrottle 2000 | Out-Null
    & $NssmPath set $ServiceName Start SERVICE_AUTO_START | Out-Null
    & $NssmPath set $ServiceName AppRestartDelay 5000 | Out-Null
    & $NssmPath set $ServiceName DisplayName "Abuts lot-server (microscope OCR)" | Out-Null
    & $NssmPath set $ServiceName Description "PC2 microscope live/OCR HTTP on 8012. Starts with Windows." | Out-Null
    & $NssmPath start $ServiceName | Out-Null
    $status = & $NssmPath status $ServiceName
    Write-Host "Service '$ServiceName' installed (auto-start). Status: $status"
    Write-Host "HTTP: http://127.0.0.1:8012/  logs: $logDir"
    if ($status -notmatch "SERVICE_RUNNING") {
      Write-Warning "Service is not running. Check logs under: $logDir"
    }
  }
  "remove" {
    foreach ($name in @($ServiceName, "AbutsLotCaptureServer")) {
      try { & $NssmPath stop $name 2>$null | Out-Null } catch {}
      try { & $NssmPath remove $name confirm 2>$null | Out-Null } catch {}
    }
    Write-Host "Service '$ServiceName' removed."
  }
  "restart" {
    & $NssmPath restart $ServiceName | Out-Null
    Write-Host "Service '$ServiceName' restarted."
  }
  "status" {
    & $NssmPath status $ServiceName
  }
  default {
    throw "Unsupported action: $Action"
  }
}
