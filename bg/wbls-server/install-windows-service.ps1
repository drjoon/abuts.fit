param(
  [ValidateSet("install", "remove", "restart", "status")]
  [string]$Action = "install",
  [string]$ServiceName = "AbutsWaybillPrintServer",
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

Assert-Executable -Path $NssmPath -Label "NSSM"
Assert-Executable -Path $NodePath -Label "Node.js"

$scriptDir = Split-Path -Parent $PSCommandPath
$logDir = Join-Path $scriptDir "logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

switch ($Action) {
  "install" {
    & $NssmPath install $ServiceName $NodePath "app.js" | Out-Null
    & $NssmPath set $ServiceName AppDirectory $scriptDir | Out-Null
    & $NssmPath set $ServiceName AppStdout (Join-Path $logDir "stdout.log") | Out-Null
    & $NssmPath set $ServiceName AppStderr (Join-Path $logDir "stderr.log") | Out-Null
    & $NssmPath set $ServiceName AppRotateFiles 1 | Out-Null
    & $NssmPath set $ServiceName AppRotateOnline 1 | Out-Null
    & $NssmPath set $ServiceName AppRotateBytes 1048576 | Out-Null
    & $NssmPath set $ServiceName Start SERVICE_AUTO_START | Out-Null
    & $NssmPath set $ServiceName AppRestartDelay 5000 | Out-Null
    & $NssmPath start $ServiceName | Out-Null
    Write-Host "Service '$ServiceName' installed and started."
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
