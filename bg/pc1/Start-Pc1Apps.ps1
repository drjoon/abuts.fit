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
#   3) ESPRIT + splash 확인 + add-in (:8001)
#   4) bridge-server (:8002)
param(
  [int]$DelaySeconds = 45,
  [int]$RhinoReadyTimeoutSec = 180,
  [int]$EspritSplashTimeoutSec = 90,
  [switch]$SkipDelay,
  [switch]$ForceRhinoRestart,
  [switch]$WhatIf
)

$ErrorActionPreference = "Continue"

# --- Win32 / UI helpers (ScriptEditor keys + ESPRIT splash click) ---
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
Add-Type -AssemblyName UIAutomationClient -ErrorAction SilentlyContinue
Add-Type -AssemblyName UIAutomationTypes -ErrorAction SilentlyContinue

if (-not ("AbutsWin32" -as [type])) {
  Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class AbutsWin32 {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  public const int SW_RESTORE = 9;
  public const byte VK_RETURN = 0x0D;
  public const uint KEYEVENTF_KEYUP = 0x0002;

  public static List<IntPtr> GetVisibleWindowsForPid(uint pid) {
    var list = new List<IntPtr>();
    EnumWindows((hWnd, lParam) => {
      uint wpid;
      GetWindowThreadProcessId(hWnd, out wpid);
      if (wpid == pid && IsWindowVisible(hWnd)) list.Add(hWnd);
      return true;
    }, IntPtr.Zero);
    return list;
  }

  public static string GetTitle(IntPtr hWnd) {
    var sb = new StringBuilder(512);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }

  public static void FocusWindow(IntPtr hWnd) {
    ShowWindow(hWnd, SW_RESTORE);
    BringWindowToTop(hWnd);
    SetForegroundWindow(hWnd);
  }

  public static void TapEnter() {
    keybd_event(VK_RETURN, 0, 0, UIntPtr.Zero);
    keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
  }
}
"@
}

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

# Korean UI labels via codepoints so CP949/UTF-8 file encoding cannot corrupt matches.
function Get-UiLabelConfirm { return ([string]::new([char[]]@(0xD655, 0xC778))) }  # 확인
function Get-UiLabelCancel { return ([string]::new([char[]]@(0xCDE8, 0xC18C))) }   # 취소

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
    $lines = @($text -split "`r?`n" | Where-Object { $_.Trim() -ne "" })
    return $lines.Count
  }
}

function Get-RhinoProcesses {
  return @(Get-Process -Name "Rhino" -ErrorAction SilentlyContinue)
}

function Get-ProcessWindows {
  param([string[]]$ProcessNames)
  $out = @()
  foreach ($name in $ProcessNames) {
    foreach ($proc in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
      try {
        $hwnds = [AbutsWin32]::GetVisibleWindowsForPid([uint32]$proc.Id)
        foreach ($h in $hwnds) {
          $title = [AbutsWin32]::GetTitle($h)
          $out += [pscustomobject]@{
            ProcessName = $proc.ProcessName
            Pid = $proc.Id
            Hwnd = $h
            Title = $title
          }
        }
      } catch {}
    }
  }
  return $out
}

function Get-UiButtonsOnWindow {
  param($Hwnd)
  $list = @()
  if (-not ("System.Windows.Automation.AutomationElement" -as [type])) { return $list }
  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($Hwnd)
    if (-not $root) { return $list }
    $btnCond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Button
    )
    $buttons = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
    foreach ($btn in $buttons) {
      $list += [pscustomobject]@{
        Element = $btn
        Name = $btn.Current.Name
        AutomationId = $btn.Current.AutomationId
      }
    }
  } catch {}
  return $list
}

function Invoke-UiButtonElement {
  param($ButtonElement, [string]$WindowTitle, [int]$Pid)
  $name = $ButtonElement.Current.Name
  Write-Log "Clicking UI button name='$name' on '$WindowTitle' (pid=$Pid)"
  try {
    $pattern = $ButtonElement.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $pattern.Invoke()
    return $true
  } catch {
    Write-Log "InvokePattern failed: $($_.Exception.Message)" "WARN"
    return $false
  }
}

function Test-ButtonNameMatch {
  param([string]$Name, [string[]]$WantNames)
  if (-not $Name) { return $false }
  $trimmed = $Name.Trim()
  foreach ($want in $WantNames) {
    if (-not $want) { continue }
    if ($trimmed -eq $want) { return $true }
    if ($trimmed.StartsWith($want)) { return $true }  # e.g. 확인(O)
    if ($trimmed -like "*$want*") { return $true }
  }
  return $false
}

function Invoke-UiButtonClick {
  param(
    [string[]]$ProcessNames,
    [string[]]$ButtonNames,
    [int]$TimeoutSec = 60,
    [switch]$PreferSplashLayout
  )
  if (-not ("System.Windows.Automation.AutomationElement" -as [type])) {
    Write-Log "UIAutomation assemblies unavailable" "WARN"
    return $false
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $loggedDump = $false
  while ((Get-Date) -lt $deadline) {
    $wins = Get-ProcessWindows -ProcessNames $ProcessNames
    # Prefer non-document dialogs (splash/about) over "ESPRIT - [file.esp]"
    $ordered = @($wins | Sort-Object {
      $t = $_.Title
      if (-not $t) { return 0 }
      if ($t -match '\[.*\.esp\]') { return 2 }
      if ($t -like "ESPRIT*") { return 1 }
      return 0
    })

    foreach ($w in $ordered) {
      try {
        [AbutsWin32]::FocusWindow($w.Hwnd)
        Start-Sleep -Milliseconds 150
        $buttons = @(Get-UiButtonsOnWindow -Hwnd $w.Hwnd)
        if ($buttons.Count -eq 0) { continue }

        if (-not $loggedDump) {
          $dump = ($buttons | ForEach-Object {
            $n = if ($_.Name) { $_.Name } else { "(empty)" }
            "[$n/id=$($_.AutomationId)]"
          }) -join " "
          Write-Log "ESPRIT UI buttons on '$($w.Title)': $dump"
          $loggedDump = $true
        }

        foreach ($btn in $buttons) {
          if (Test-ButtonNameMatch -Name $btn.Name -WantNames $ButtonNames) {
            if (Invoke-UiButtonElement -ButtonElement $btn.Element -WindowTitle $w.Title -Pid $w.Pid) {
              return $true
            }
          }
        }

        # Splash layout: two stacked buttons (확인 then 취소) — click first if PreferSplashLayout.
        if ($PreferSplashLayout -and $buttons.Count -ge 2 -and $buttons.Count -le 4) {
          $cancel = Get-UiLabelCancel
          $hasCancel = $false
          foreach ($b in $buttons) {
            if (Test-ButtonNameMatch -Name $b.Name -WantNames @($cancel, "Cancel", "&Cancel")) {
              $hasCancel = $true
              break
            }
          }
          if ($hasCancel -or ($w.Title -notmatch '\[.*\.esp\]')) {
            if (Invoke-UiButtonElement -ButtonElement $buttons[0].Element -WindowTitle $w.Title -Pid $w.Pid) {
              return $true
            }
          }
        }
      } catch {
        # keep polling
      }
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Send-KeysToProcessWindow {
  param(
    [string[]]$ProcessNames,
    [string]$Keys,
    [string]$TitleContains = $null
  )
  $wins = Get-ProcessWindows -ProcessNames $ProcessNames
  if ($TitleContains) {
    $wins = @($wins | Where-Object { $_.Title -and ($_.Title -like "*$TitleContains*") })
  }
  if ($wins.Count -eq 0) { return $false }
  # Prefer largest / main-looking window (non-empty title).
  $target = $wins | Sort-Object { if ($_.Title) { $_.Title.Length } else { 0 } } -Descending | Select-Object -First 1
  try {
    [AbutsWin32]::FocusWindow($target.Hwnd)
    Start-Sleep -Milliseconds 400
    [System.Windows.Forms.SendKeys]::SendWait($Keys)
    Write-Log "Sent keys to $($target.ProcessName) '$($target.Title)': $Keys"
    return $true
  } catch {
    Write-Log "SendKeys failed: $($_.Exception.Message)" "WARN"
    return $false
  }
}

function Dismiss-EspritSplash {
  param([int]$TimeoutSec = 90)
  $confirm = Get-UiLabelConfirm
  $cancel = Get-UiLabelCancel
  Write-Log ("Waiting for ESPRIT splash confirm button '{0}' (up to {1}s)..." -f $confirm, $TimeoutSec)
  if ($WhatIf) { return $true }

  # Primary: UI Automation click on confirm / OK (names via Unicode codepoints).
  $clicked = Invoke-UiButtonClick `
    -ProcessNames @("esprit", "ESPRIT") `
    -ButtonNames @($confirm, "OK", "&OK", "Ok") `
    -TimeoutSec $TimeoutSec `
    -PreferSplashLayout
  if ($clicked) {
    Write-Log "ESPRIT splash dismissed via button click"
    return $true
  }

  # Fallback: focus splash-like windows and tap Enter (default is usually confirm).
  Write-Log "Button click missed; trying Enter on ESPRIT dialogs..." "WARN"
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    $wins = Get-ProcessWindows -ProcessNames @("esprit", "ESPRIT")
    foreach ($w in $wins) {
      $buttons = @(Get-UiButtonsOnWindow -Hwnd $w.Hwnd)
      $looksLikeSplash = $false
      foreach ($b in $buttons) {
        if (Test-ButtonNameMatch -Name $b.Name -WantNames @($confirm, $cancel, "OK", "Cancel")) {
          $looksLikeSplash = $true
          break
        }
      }
      if (-not $looksLikeSplash -and $w.Title -match '\[.*\.esp\]') { continue }

      [AbutsWin32]::FocusWindow($w.Hwnd)
      Start-Sleep -Milliseconds 250
      [AbutsWin32]::TapEnter()
      Write-Log "Tapped Enter on ESPRIT window '$($w.Title)' (buttons=$($buttons.Count))"
      Start-Sleep -Seconds 2

      $stillConfirm = $false
      foreach ($b in @(Get-UiButtonsOnWindow -Hwnd $w.Hwnd)) {
        if (Test-ButtonNameMatch -Name $b.Name -WantNames @($confirm)) { $stillConfirm = $true; break }
      }
      if (-not $stillConfirm) {
        Write-Log "ESPRIT splash appears dismissed after Enter"
        return $true
      }
    }
    Start-Sleep -Seconds 2
  }
  Write-Log "ESPRIT splash confirm not auto-clicked — click it once manually if still open." "WARN"
  return $false
}

function Invoke-RhinoScriptEditorViaCom {
  $progIds = @("Rhino.Application.8", "Rhino.Application")
  foreach ($id in $progIds) {
    try {
      $app = [Runtime.InteropServices.Marshal]::GetActiveObject($id)
      $null = $app.RunScript("_ScriptEditor", $false)
      Write-Log "Sent _ScriptEditor via COM ($id)"
      return $true
    } catch {
      Write-Log "COM $id unavailable: $($_.Exception.Message)" "WARN"
    }
  }
  return $false
}

function Invoke-RhinoScriptEditorViaKeys {
  # Escape any modal, then run ScriptEditor command in Rhino command line.
  $ok = Send-KeysToProcessWindow -ProcessNames @("Rhino") -Keys "{ESC}{ESC}_ScriptEditor{ENTER}"
  if (-not $ok) {
    $ok = Send-KeysToProcessWindow -ProcessNames @("Rhino") -Keys "{ESC}ScriptEditor{ENTER}"
  }
  return $ok
}

function Start-FreshRhinoWithScriptEditor {
  param($Paths)
  if (-not (Test-Path $Paths.RhinoApp)) {
    Write-Log "Rhino.exe not found: $($Paths.RhinoApp)" "ERROR"
    return $false
  }
  # McNeel form: /runscript="..."  (hyphen form is often ignored)
  Write-Log "Starting Rhino 8 /nosplash /runscript=`"_ScriptEditor`""
  if (-not $WhatIf) {
    Start-Process -FilePath $Paths.RhinoApp -ArgumentList @(
      "/nosplash",
      '/runscript="_ScriptEditor"'
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
    if (-not (Invoke-RhinoScriptEditorViaCom)) {
      Invoke-RhinoScriptEditorViaKeys | Out-Null
    }
  } else {
    Start-FreshRhinoWithScriptEditor -Paths $Paths | Out-Null
  }

  $deadline = (Get-Date).AddSeconds($RhinoReadyTimeoutSec)
  $woke = $false
  $keysAt = 25
  $comAt = 45
  $restartAt = 70
  $didKeys = $false
  $didCom = $false
  $didRestart = $false
  $pollStart = Get-Date

  while ((Get-Date) -lt $deadline) {
    $count = Get-RhinoCodePipeCount -RhinoCode $Paths.RhinoCode
    if ($count -gt 0) {
      Write-Log "RhinoCode list OK (pipes=$count)"
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

    $elapsed = [int]((Get-Date) - $pollStart).TotalSeconds
    Write-Log "Waiting for RhinoCode pipes... (${elapsed}s / ${RhinoReadyTimeoutSec}s)"

    # Dismiss possible Rhino license/update modal with Enter, then ScriptEditor keys.
    if (-not $didKeys -and $elapsed -ge $keysAt) {
      $didKeys = $true
      Write-Log "Trying Enter + _ScriptEditor via SendKeys..."
      Send-KeysToProcessWindow -ProcessNames @("Rhino") -Keys "{ENTER}" | Out-Null
      Start-Sleep -Seconds 1
      Invoke-RhinoScriptEditorViaKeys | Out-Null
    }
    if (-not $didCom -and $elapsed -ge $comAt) {
      $didCom = $true
      Invoke-RhinoScriptEditorViaCom | Out-Null
      Invoke-RhinoScriptEditorViaKeys | Out-Null
    }
    if (-not $didRestart -and $elapsed -ge $restartAt) {
      $didRestart = $true
      Restart-RhinoWithScriptEditor -Paths $Paths | Out-Null
      Start-Sleep -Seconds 20
      Invoke-RhinoScriptEditorViaKeys | Out-Null
    }

    Start-Sleep -Seconds 5
  }

  if (-not $woke) {
    $raw = Get-RhinoCodeListRaw -RhinoCode $Paths.RhinoCode
    Write-Log "RhinoCode pipes still empty after ${RhinoReadyTimeoutSec}s. raw=$(if ($raw) { $raw } else { '(empty)' })" "WARN"
    Write-Log "Open ScriptEditor once manually in Rhino (Tools > ScriptEditor), then pipes should appear." "WARN"
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
  if (-not $esprit) {
    if (Test-TcpPortOpen -Port 8001) {
      Write-Log "esprit HTTP already listening on :8001"
    } else {
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
  } else {
    Write-Log "ESPRIT already running (pid=$($esprit[0].Id))"
  }

  Dismiss-EspritSplash -TimeoutSec $EspritSplashTimeoutSec | Out-Null
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
  # Give HTTP listener a moment (urlacl / bind).
  for ($i = 0; $i -lt 10; $i++) {
    if (Test-TcpPortOpen -Port 8002) {
      Write-Log "bridge-server listening on :8002"
      return
    }
    Start-Sleep -Seconds 1
  }
  Write-Log "bridge-server :8002 not open yet (check urlacl / local.env / exe console)" "WARN"
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
Start-Sleep -Seconds 3
Start-BridgeServer

Write-Log "Port check: 8000=$(Test-TcpPortOpen -Port 8000) 8001=$(Test-TcpPortOpen -Port 8001) 8002=$(Test-TcpPortOpen -Port 8002)"
Write-Log "=== PC1 autostart end ==="
