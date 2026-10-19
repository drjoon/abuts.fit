# related files:
# - bg/pc1/Start-Pc1Apps.ps1
#
# Registers a per-user AtLogOn scheduled task so PC1 apps restart after
# Windows Update reboot (requires interactive logon / auto-logon).
param(
  [ValidateSet("install", "uninstall", "status", "run-now")]
  [string]$Action = "install",
  [string]$TaskName = "AbutsPc1Autostart",
  [int]$DelaySeconds = 45
)

$ErrorActionPreference = "Stop"

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

function Assert-Pc1RootReady {
  param([string]$Root)
  if (-not $Root -or -not (Test-Pc1RootCandidate -Path $Root)) {
    throw @"
PC1 root not found (need esprit-addin\Esprit.cmd and bridge-server).

  cd C:\Users\user\abuts.fit\bg\pc1
  .\Install-Pc1Autostart.ps1 -Action install

Do not run from bg\ or copy Start-Pc1Apps.ps1 outside bg\pc1.
"@
  }
}

$Pc1Root = Resolve-Pc1Root
Assert-Pc1RootReady -Root $Pc1Root
$StartScript = Join-Path $Pc1Root "Start-Pc1Apps.ps1"

if (-not (Test-Path $StartScript)) {
  throw "Start script not found: $StartScript (expected under bg\pc1)"
}

function Get-TaskStatus {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "Task '$TaskName' is not registered."
    return
  }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "TaskName : $TaskName"
  Write-Host "State    : $($task.State)"
  Write-Host "LastRun  : $($info.LastRunTime)"
  Write-Host "LastResult: $($info.LastTaskResult)"
  Write-Host "NextRun  : $($info.NextRunTime)"
  Write-Host "Action   : $($task.Actions.Execute) $($task.Actions.Arguments)"
}

switch ($Action) {
  "install" {
    # Remove prior registration so reinstall is idempotent.
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

    $arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`" -DelaySeconds $DelaySeconds"
    $actionObj = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg -WorkingDirectory $Pc1Root
    Write-Host "Pc1Root     : $Pc1Root"
    Write-Host "StartScript : $StartScript"
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
      -MultipleInstances IgnoreNew `
      -RestartCount 1 `
      -RestartInterval (New-TimeSpan -Minutes 1)
    # Interactive: ESPRIT must run in the logged-on desktop session (not Session 0).
    $principal = New-ScheduledTaskPrincipal `
      -UserId $env:USERNAME `
      -LogonType Interactive `
      -RunLevel Highest

    Register-ScheduledTask `
      -TaskName $TaskName `
      -Action $actionObj `
      -Trigger $trigger `
      -Settings $settings `
      -Principal $principal `
      -Description "abuts.fit PC1: ESPRIT, bridge after logon / Windows Update reboot" `
      -Force | Out-Null

    Write-Host "Installed scheduled task '$TaskName' (At logon for user $env:USERNAME)."
    Write-Host "Start script: $StartScript"
    Write-Host ""
    Write-Host "IMPORTANT: After Windows Update reboot, apps start only when this user logs on."
    Write-Host "If the PC sits at the login screen, enable auto-logon for this manufacturing account"
    Write-Host "(e.g. netplwiz / Autologon) so the desktop session comes up unattended."
    Write-Host ""
    Write-Host "Test now:  powershell -File `"$PSCommandPath`" -Action run-now"
    Write-Host "Status:    powershell -File `"$PSCommandPath`" -Action status"
    Get-TaskStatus
  }
  "uninstall" {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task '$TaskName' (if it existed)."
  }
  "status" {
    Get-TaskStatus
  }
  "run-now" {
    Write-Host "Starting $StartScript (SkipDelay)..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StartScript -SkipDelay
  }
  default {
    throw "Unsupported action: $Action"
  }
}
