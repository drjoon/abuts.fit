# change-log:
# - 2026-11-26: ViTiny UM08/UM10/UM20/UM22/UM30 serial control (CP210x USB-UART, 115200 8N2).
#   Protocol from UM Viewer 1.100 (NewUMControl): "R00aa" read, "S00aa" read char, "Waavv" write, CR terminated.
#   Reply "@vv". Key register 0x01: 0x40|key = key down. 0x4F toggles PC remote control (STAFLAG bit3).
#   AF: area reg 0x0E (0x1A whole, 0x1B current section), key 0x15 single AF, 0x16 continuous, 0x14 manual.
# - 2026-11-26: LED on/off/level. STAFLAG bit1 = LED off. Key 0x19 toggles LED, 0x1A/0x1B LED +/- one step
#   (key down 0x40|key, key up 0x80|key). Level reads from reg 0x06 (1..12). Writing reg 0x06 directly
#   only works on newer MCU firmware (UM20 >= x.5), so levels are set with key steps.
# - 2026-11-26: AF refuses with reason "led-off" when the LED is off (dark frame is not blur).
#   A port held by another process is retried for up to 4 s, then reason "port-busy".
# related files:
# - bg/pc2/lot-server2/src/um-serial.js
# - bg/pc2/lot-server2/src/watch.js
# ASCII only (PowerShell 5.1 reads scripts as ANSI).
param(
  [string]$Port = "",
  [ValidateSet("status", "af", "afc", "manual", "release", "ledon", "ledoff")][string]$Action = "status",
  [ValidateSet("whole", "local")][string]$Area = "whole",
  [int]$TimeoutMs = 25000,
  [int]$Level = 0,
  [switch]$KeepRemote
)

$ErrorActionPreference = "Stop"

function Emit($obj) {
  Write-Output ($obj | ConvertTo-Json -Compress)
}

$script:sp = $null

function Open-Port([string]$name) {
  $p = New-Object System.IO.Ports.SerialPort $name, 115200, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::Two)
  $p.ReadTimeout = 200
  $p.WriteTimeout = 200
  $p.Open()
  return $p
}

# Send a command and return the last "@xx" value (device also prints debug lines like +++RFC+++00).
function Query([string]$cmd, [int]$waitMs = 60) {
  $script:sp.DiscardInBuffer()
  $script:sp.Write($cmd + "`r")
  $text = ""
  $deadline = (Get-Date).AddMilliseconds([Math]::Max($waitMs, 40) + 200)
  Start-Sleep -Milliseconds $waitMs
  while ((Get-Date) -lt $deadline) {
    $text += $script:sp.ReadExisting()
    if ($text -match "@([0-9A-Za-z ]{1,2})\r") { break }
    Start-Sleep -Milliseconds 15
  }
  $ms = [regex]::Matches($text, "@([0-9A-Za-z ]{1,2})\r")
  if ($ms.Count -eq 0) { return $null }
  return $ms[$ms.Count - 1].Groups[1].Value
}

function Send([string]$cmd) {
  $script:sp.Write($cmd + "`r")
  Start-Sleep -Milliseconds 30
}

function ReadHex([int]$addr) {
  $v = Query ("R00" + $addr.ToString("X2"))
  if ($v -eq $null) { return -1 }
  try { return [Convert]::ToInt32($v.Trim(), 16) } catch { return -1 }
}

function ReadSerialNumber() {
  $sn = ""
  for ($a = 44; $a -ge 35; $a--) {
    $v = Query ("S00" + $a.ToString("X2"))
    if ($v -eq $null) { return "" }
    $sn += $v.Substring(0, 1)
  }
  return $sn
}

function ReadPosition() {
  $hi = ReadHex 9
  $lo = ReadHex 10
  if ($hi -lt 0 -or $lo -lt 0) { return -1 }
  return ($hi * 256) + $lo
}

$script:busy = $false

# Another process (UM Viewer, a second script) may hold the port for a moment. Retry, then report busy.
function Open-PortRetry([string]$name) {
  $deadline = (Get-Date).AddMilliseconds(4000)
  while ($true) {
    try { return (Open-Port $name) } catch [System.UnauthorizedAccessException] {
      if ((Get-Date) -gt $deadline) { $script:busy = $true; return $null }
      Start-Sleep -Milliseconds 200
    } catch { return $null }
  }
}

function Find-Device([string]$preferred) {
  $names = @()
  if ($preferred) { $names += $preferred }
  $names += [System.IO.Ports.SerialPort]::GetPortNames() | Where-Object { $_ -ne $preferred }
  foreach ($n in $names) {
    $script:sp = Open-PortRetry $n
    if (-not $script:sp) { continue }
    $sn = ""
    try {
      $st = ReadHex 0
      if ($st -ge 0) { $sn = ReadSerialNumber }
    } catch { }
    if ($sn -match "^UM\d\d") {
      return @{ port = $n; sn = $sn }
    }
    try { $script:sp.Close() } catch { }
    $script:sp = $null
  }
  return $null
}

function Set-Remote([bool]$on) {
  for ($i = 0; $i -lt 3; $i++) {
    $st = ReadHex 0
    if ($st -lt 0) { Start-Sleep -Milliseconds 100; continue }
    $isOn = ($st -band 0x08) -ne 0
    if ($isOn -eq $on) { return $true }
    Send "W014F"
    Start-Sleep -Milliseconds 300
  }
  $st = ReadHex 0
  return ($st -ge 0) -and ((($st -band 0x08) -ne 0) -eq $on)
}

function Led-IsOn() {
  $st = ReadHex 0
  if ($st -lt 0) { return $null }
  return (($st -band 0x02) -eq 0)
}

function Set-Led([bool]$on) {
  for ($i = 0; $i -lt 3; $i++) {
    $cur = Led-IsOn
    if ($cur -eq $on) { return $true }
    if ($cur -eq $null) { Start-Sleep -Milliseconds 100; continue }
    Send "W0159"
    Start-Sleep -Milliseconds 400
  }
  return ((Led-IsOn) -eq $on)
}

function Step-Led([int]$key) {
  Send ("W01" + (0x40 -bor $key).ToString("X2"))
  Start-Sleep -Milliseconds 120
  Send ("W01" + (0x80 -bor $key).ToString("X2"))
  Start-Sleep -Milliseconds 250
}

# Move the LED level to $target (1..12) with +/- key steps. Stops when the level no longer changes.
function Set-LedLevel([int]$target) {
  $target = [Math]::Max(1, [Math]::Min(12, $target))
  for ($i = 0; $i -lt 24; $i++) {
    $cur = ReadHex 6
    if ($cur -lt 0) { return -1 }
    if ($cur -eq $target) { return $cur }
    if ($cur -lt $target) { Step-Led 0x1A } else { Step-Led 0x1B }
    if ((ReadHex 6) -eq $cur) { return $cur }
  }
  return (ReadHex 6)
}

$t0 = Get-Date
$found = $null
try {
  $found = Find-Device $Port
  if (-not $found) {
    $why = $(if ($script:busy) { "port-busy" } else { "no-um-serial" })
    Emit @{ ok = $false; reason = $why; ports = ([System.IO.Ports.SerialPort]::GetPortNames() -join ",") }
    exit 0
  }
  $fw = "{0}.{1}.{2}" -f (ReadHex 47), (ReadHex 46), (ReadHex 45)
  $status = ReadHex 0
  $pos0 = ReadPosition
  $result = @{
    ok = $true; port = $found.port; sn = $found.sn; firmware = $fw; action = $Action
    status = $status; startPosition = $pos0; position = $pos0; af = "none"; reason = ""
    led = (ReadHex 6); afArea = (ReadHex 14)
  }
  if ($Action -eq "status") { Emit $result; exit 0 }
  if ($Action -eq "release") {
    $result.ok = Set-Remote $false
    $result.status = ReadHex 0
    if (-not $result.ok) { $result.reason = "release-failed" }
    Emit $result
    exit 0
  }

  if (($Action -eq "af" -or $Action -eq "afc") -and ((Led-IsOn) -eq $false)) {
    $result.ok = $false; $result.reason = "led-off"; $result.ledOn = $false
    Emit $result
    exit 0
  }

  if (-not (Set-Remote $true)) {
    $result.ok = $false; $result.reason = "remote-failed"; $result.status = ReadHex 0
    Emit $result
    exit 0
  }

  if ($Action -eq "ledon" -or $Action -eq "ledoff") {
    $want = ($Action -eq "ledon")
    $result.ledBefore = Led-IsOn
    $ok = Set-Led $want
    if ($ok -and $want -and $Level -gt 0) { [void](Set-LedLevel $Level) }
    $result.ledOn = Led-IsOn
    $result.led = ReadHex 6
    if (-not $ok) { $result.ok = $false; $result.reason = "led-failed" }
  }
  elseif ($Action -eq "manual") { Send "W0154" }
  elseif ($Action -eq "afc") {
    Send ("W0E" + $(if ($Area -eq "local") { "1B" } else { "1A" }))
    Send "W0156"
    $result.af = "continuous"
  } else {
    Send ("W0E" + $(if ($Area -eq "local") { "1B" } else { "1A" }))
    Send "W0155"
    $afStart = Get-Date
    # STAFLAG bit2 = AF running. Wait for it to rise and fall.
    $sawBusy = $false
    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
    $af = "timeout"
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 250
      $st = ReadHex 0
      if ($st -lt 0) { continue }
      if (($st -band 0x04) -ne 0) { $sawBusy = $true; continue }
      if ($sawBusy) { $af = "done"; break }
      if (((Get-Date) - $afStart).TotalMilliseconds -gt 2500) { $af = "not-started"; break }
    }
    $result.af = $af
    if ($af -ne "done") { $result.ok = $false; $result.reason = "af-$af" }
  }
  Start-Sleep -Milliseconds 100
  $result.position = ReadPosition
  if (-not $KeepRemote) { [void](Set-Remote $false) }
  $result.status = ReadHex 0
  $result.ms = [int]((Get-Date) - $t0).TotalMilliseconds
  Emit $result
} catch {
  $d = $_.Exception.Message
  if ($d) { $d = $d.Replace('"', "'").Replace("`r", " ").Replace("`n", " ") }
  Emit @{ ok = $false; reason = "exception"; detail = $d }
} finally {
  if ($script:sp) { try { $script:sp.Close() } catch { } }
}
