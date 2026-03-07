param(
  [ValidateSet("install", "remove", "restart", "status")]
  [string]$Action = "install",
  [string]$ServiceName = "AbutsLotCaptureServer",
  [string]$NssmPath = "C:\\tools\\nssm\\nssm.exe",
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
  param([string]$Current)
  if (Test-Path $Current) { return $Current }

  $candidates = @(
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

if (-not (Test-Path $NssmPath)) {
  $NssmPath = Get-NssmPath -Current $NssmPath
}
Assert-Executable -Path $NssmPath -Label "NSSM"

if (-not (Test-Path $NodePath)) {
  $NodePath = Get-NodePath -Current $NodePath
}
if (-not (Test-Path $NodePath)) {
  Install-Node
  $NodePath = Get-NodePath -Current $NodePath
}
Assert-Executable -Path $NodePath -Label "Node.js"

$scriptDir = Split-Path -Parent $PSCommandPath
$logDir = Join-Path $scriptDir "logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

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

    # lot-server uses ESM entry at src/index.js
    try { & $NssmPath stop $ServiceName 2>$null | Out-Null } catch {}
    try { & $NssmPath remove $ServiceName confirm 2>$null | Out-Null } catch {}
    & $NssmPath install $ServiceName $NodePath "src/index.js" | Out-Null
    & $NssmPath set $ServiceName AppDirectory $scriptDir | Out-Null
    # 로그 파일을 남기지 않도록 표준 출력/에러 리디렉션 설정 제거
    & $NssmPath reset $ServiceName AppStdout | Out-Null
    & $NssmPath reset $ServiceName AppStderr | Out-Null
    & $NssmPath reset $ServiceName AppRotateFiles | Out-Null
    & $NssmPath reset $ServiceName AppRotateOnline | Out-Null
    & $NssmPath reset $ServiceName AppRotateBytes | Out-Null
    & $NssmPath set $ServiceName AppExit Default Restart | Out-Null
    & $NssmPath set $ServiceName AppThrottle 2000 | Out-Null
    & $NssmPath set $ServiceName Start SERVICE_AUTO_START | Out-Null
    & $NssmPath set $ServiceName AppRestartDelay 5000 | Out-Null
    & $NssmPath start $ServiceName | Out-Null
    $status = & $NssmPath status $ServiceName
    Write-Host "Service '$ServiceName' installed. Status: $status"
    if ($status -notmatch "SERVICE_RUNNING") {
      Write-Warning "Service is not running. Check logs under: $logDir"
    }
  }
  "remove" {
    & $NssmPath stop $ServiceName | Out-Null
    & $NssmPath remove $ServiceName confirm | Out-Null
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
