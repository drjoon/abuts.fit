param(
  [ValidateSet("install", "remove", "restart", "status")]
  [string]$Action = "install",
  [string]$ServiceName = "AbutsPackPrintServer",
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
  
  Write-Warning "NSSM not found in standard locations. Searched: $($candidates -join ', ')"
  return $Current
}

function Get-NodePath {
  param([string]$Current)
  if (Test-Path $Current) { return $Current }

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
    $modulesPath = Join-Path $scriptDir "node_modules"
    $needsInstall = -not (Test-Path $modulesPath)

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

    try { & $NssmPath stop $ServiceName 2>$null | Out-Null } catch {}
    try { & $NssmPath remove $ServiceName confirm 2>$null | Out-Null } catch {}
    
    Write-Host "Installing service with NSSM..."
    & $NssmPath install $ServiceName $NodePath "app.js" | Out-Null
    & $NssmPath set $ServiceName AppDirectory $scriptDir | Out-Null
    
    # Set up logging
    $stdoutLog = Join-Path $logDir "stdout.log"
    $stderrLog = Join-Path $logDir "stderr.log"
    & $NssmPath set $ServiceName AppStdout $stdoutLog | Out-Null
    & $NssmPath set $ServiceName AppStderr $stderrLog | Out-Null
    & $NssmPath set $ServiceName AppRotateFiles 1 | Out-Null
    & $NssmPath set $ServiceName AppRotateOnline 1 | Out-Null
    & $NssmPath set $ServiceName AppRotateBytes 1048576 | Out-Null
    
    & $NssmPath set $ServiceName AppExit Default Restart | Out-Null
    & $NssmPath set $ServiceName AppThrottle 2000 | Out-Null
    & $NssmPath set $ServiceName Start SERVICE_AUTO_START | Out-Null
    & $NssmPath set $ServiceName AppRestartDelay 5000 | Out-Null
    
    Write-Host "Starting service..."
    & $NssmPath start $ServiceName | Out-Null
    
    Start-Sleep -Seconds 2
    
    $status = & $NssmPath status $ServiceName
    Write-Host "Service '$ServiceName' installed. Status: $status"
    
    if ($status -notmatch "SERVICE_RUNNING") {
      Write-Warning "Service is not running. Check application logs for details."
      Write-Host "STDOUT Log: $stdoutLog"
      Write-Host "STDERR Log: $stderrLog"
      if (Test-Path $stderrLog) {
        Write-Host "--- STDERR Content ---"
        Get-Content $stderrLog -Tail 20
      }
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
