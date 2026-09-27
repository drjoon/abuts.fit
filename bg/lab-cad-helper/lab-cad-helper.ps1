# change-log:
# - 2026-09-27: v2 — HttpListener(관리자 URL 예약 필요) 대신 TcpListener. 작업 폴더(케이스 폴더) 저장·폴더 고르기.
#   3Shape는 인자 열기를 지원하지 않아 Dental Manager 실행/앞으로 + 폴더 열기 + 경로 복사.
#   exocad는 .dentalProject만 DentalCADApp 인자로 열고, 없으면 DentalDB + 폴더.
#   파일은 UTF-8 BOM 필수(PowerShell 5.1이 BOM 없으면 CP949로 읽어 한글이 깨짐).
# - 2026-09-24: exe 탐색 — 설치 폴더→실행 중 프로세스. 실패 시 EXE_NOT_FOUND.
# - 2026-09-24: 설치(여기를_더블클릭_설치)·run-hidden·프로토콜 wake·중복 실행 시 조용히 종료.
# related files:
# - bg/lab-cad-helper/여기를_더블클릭_설치.cmd
# - bg/lab-cad-helper/run-hidden.vbs
# - bg/lab-cad-helper/rules.md
# - bg/lab-cad-helper/mac/AbutsLabHelper.swift
# - web/frontend/src/shared/files/labCadHelperClient.ts
#
# Requires: Windows PowerShell 5.1+ (기본 탑재). 관리자 권한·Node 불필요.

param(
  [string]$ProtocolArg = ""
)

$ErrorActionPreference = "Stop"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$HelperVersion = 2
$OnWindows = ($env:OS -eq "Windows_NT")
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptDir "config.json"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Log([string]$Message) {
  $stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $line = "[lab-cad-helper] $stamp $Message"
  Write-Host $line
  try {
    $logPath = Join-Path $ScriptDir "helper.log"
    if ((Test-Path -LiteralPath $logPath) -and ((Get-Item -LiteralPath $logPath).Length -gt 1MB)) {
      Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
    }
    [System.IO.File]::AppendAllText($logPath, $line + "`r`n", $Utf8NoBom)
  } catch {}
}

# ---------- config ----------

function Get-Prop($Obj, [string]$Name) {
  if ($null -eq $Obj) { return $null }
  $p = $Obj.PSObject.Properties[$Name]
  if ($null -eq $p) { return $null }
  return $p.Value
}

function Read-Config {
  $cfg = @{
    port = 8010
    allowOrigin = ""
    sharedSecret = ""
    workFolder = ""
    exePaths = @{ "3Shape" = ""; ExoCAD = ""; custom = "" }
    managerPaths = @{ "3Shape" = ""; ExoCAD = "" }
  }
  if (-not (Test-Path -LiteralPath $ConfigPath)) { return $cfg }
  try {
    $raw = [System.IO.File]::ReadAllText($ConfigPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  } catch {
    Write-Log ("config parse failed: {0}" -f $_.Exception.Message)
    return $cfg
  }
  $port = Get-Prop $raw "port"
  if ($port) { $cfg.port = [int]$port }
  $origin = Get-Prop $raw "allowOrigin"
  if ($origin) { $cfg.allowOrigin = [string]$origin }
  $secret = Get-Prop $raw "sharedSecret"
  if ($secret) { $cfg.sharedSecret = ([string]$secret).Trim() }
  $wf = Get-Prop $raw "workFolder"
  if ($wf) { $cfg.workFolder = ([string]$wf).Trim() }
  foreach ($group in @("exePaths", "managerPaths")) {
    $src = Get-Prop $raw $group
    if ($null -eq $src) { continue }
    foreach ($key in @($cfg[$group].Keys)) {
      $v = Get-Prop $src $key
      if ($v) { $cfg[$group][$key] = ([string]$v).Trim() }
    }
  }
  return $cfg
}

function Save-Config([hashtable]$Cfg) {
  try {
    $json = $Cfg | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($ConfigPath, $json, $Utf8NoBom)
  } catch {
    Write-Log ("config save failed: {0}" -f $_.Exception.Message)
  }
}

# ---------- paths ----------

function Sanitize-FileName([string]$Name, [string]$Fallback = "model.stl") {
  $base = [System.IO.Path]::GetFileName(([string]$Name).Trim())
  if ([string]::IsNullOrWhiteSpace($base)) { $base = $Fallback }
  foreach ($ch in [System.IO.Path]::GetInvalidFileNameChars()) {
    $base = $base.Replace([string]$ch, "_")
  }
  $base = $base.Trim().TrimEnd(".")
  if ([string]::IsNullOrWhiteSpace($base)) { $base = $Fallback }
  if ($base.Length -gt 120) { $base = $base.Substring(0, 120) }
  return $base
}

function Test-Folder([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
  try { return (Test-Path -LiteralPath $Path -PathType Container) } catch { return $false }
}

# ---------- design software discovery ----------

function Get-SearchRoots {
  $roots = New-Object System.Collections.Generic.List[string]
  foreach ($r in @(
      ${env:ProgramFiles},
      ${env:ProgramFiles(x86)},
      $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Programs" } else { "" }),
      "C:\Program Files",
      "C:\Program Files (x86)",
      "D:\Program Files",
      "D:\Program Files (x86)",
      "C:\",
      "D:\"
    )) {
    if ($r -and (Test-Path -LiteralPath $r) -and -not $roots.Contains($r)) { $roots.Add($r) | Out-Null }
  }
  return $roots
}

function Find-FileUnder([string[]]$VendorDirPatterns, [string[]]$FileNames, [int]$Depth = 4) {
  foreach ($root in Get-SearchRoots) {
    $vendorDirs = @()
    try {
      $vendorDirs = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
        Where-Object {
          $n = $_.Name
          ($VendorDirPatterns | Where-Object { $n -like $_ }).Count -gt 0
        }
    } catch {}
    foreach ($dir in $vendorDirs) {
      foreach ($fileName in $FileNames) {
        try {
          $hit = Get-ChildItem -LiteralPath $dir.FullName -Filter $fileName -File -Recurse -Depth $Depth -ErrorAction SilentlyContinue |
            Select-Object -First 1
          if ($hit) { return $hit.FullName }
        } catch {}
      }
    }
  }
  return ""
}

function Find-RunningProcess([string[]]$NamePatterns) {
  if (-not $OnWindows) { return $null }
  try {
    $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  } catch {
    try { $procs = Get-WmiObject Win32_Process -ErrorAction SilentlyContinue } catch { return $null }
  }
  foreach ($pat in $NamePatterns) {
    foreach ($p in $procs) {
      if ([string]$p.Name -like $pat) {
        return @{ id = [int]$p.ProcessId; path = [string]$p.ExecutablePath }
      }
    }
  }
  return $null
}

# 3Shape Dental System: 스캔 가져오기는 Dental Manager에서만. DentalDesktop.exe에 파일 인자를 주면 무시된다.
$ThreeShapeManagerNames = @("DentalManager.exe", "ThreeShape.DentalManager.exe")
$ThreeShapeManagerProcs = @("DentalManager*.exe", "ThreeShape.DentalManager*.exe")
$ThreeShapeDesktopNames = @("DentalDesktop.exe", "ThreeShape.DentalDesktop.exe")
$ThreeShapeDesktopProcs = @("DentalDesktop*.exe", "ThreeShape.DentalDesktop*.exe")
# exocad: DentalCADApp.exe는 .dentalProject 인자만 연다. 새 케이스는 DentalDB에서 만든다.
$ExoCadAppNames = @("DentalCADApp.exe")
$ExoCadAppProcs = @("DentalCADApp*.exe", "DentalCAD*.exe")
$ExoCadDbNames = @("DentalDB.exe")
$ExoCadDbProcs = @("DentalDB*.exe")

function Resolve-Program([hashtable]$Cfg, [string]$Group, [string]$Key, [string[]]$FileNames, [string[]]$ProcPatterns, [string[]]$VendorDirs) {
  $configured = [string]$Cfg[$Group][$Key]
  if ($configured -and (Test-Path -LiteralPath $configured)) {
    $leaf = Split-Path -Leaf $configured
    if (($FileNames | Where-Object { $_ -ieq $leaf }).Count -gt 0) {
      return @{ exe = $configured; source = "config" }
    }
  }
  $running = Find-RunningProcess $ProcPatterns
  if ($running -and $running.path -and (Test-Path -LiteralPath $running.path)) {
    $Cfg[$Group][$Key] = $running.path
    Save-Config $Cfg
    return @{ exe = $running.path; source = "running_process" }
  }
  $found = Find-FileUnder $VendorDirs $FileNames
  if ($found) {
    $Cfg[$Group][$Key] = $found
    Save-Config $Cfg
    return @{ exe = $found; source = "install_dir" }
  }
  return @{ exe = ""; source = "not_found" }
}

function Start-OrActivate([string]$Exe, [string[]]$ProcPatterns, [string[]]$Arguments) {
  $running = Find-RunningProcess $ProcPatterns
  if ($running -and (-not $Arguments -or $Arguments.Count -eq 0)) {
    try {
      $shell = New-Object -ComObject WScript.Shell
      [void]$shell.AppActivate([int]$running.id)
    } catch {}
    return "activated"
  }
  $workDir = Split-Path -Parent $Exe
  if ($Arguments -and $Arguments.Count -gt 0) {
    $quoted = $Arguments | ForEach-Object { '"' + ($_ -replace '"', '') + '"' }
    Start-Process -FilePath $Exe -ArgumentList $quoted -WorkingDirectory $workDir | Out-Null
  } else {
    Start-Process -FilePath $Exe -WorkingDirectory $workDir | Out-Null
  }
  return "started"
}

function Reveal-Folder([string]$Folder) {
  if (-not $OnWindows -or -not (Test-Folder $Folder)) { return }
  Start-Process -FilePath "explorer.exe" -ArgumentList ('"' + $Folder + '"') | Out-Null
}

function Copy-ToClipboard([string]$Text) {
  if (-not $OnWindows) { return $false }
  try {
    Set-Clipboard -Value $Text
    return $true
  } catch {
    try {
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.Clipboard]::SetText($Text)
      return $true
    } catch {
      return $false
    }
  }
}

function Open-InDesignSoftware([hashtable]$Cfg, [string]$DesignSoftware, [string]$Folder, [string[]]$FilePaths) {
  $sw = ([string]$DesignSoftware).Trim()
  $base = @{ ok = $true; folder = $Folder; count = $FilePaths.Count; exe = $null; mode = "folder"; guide = "folder_only"; clipboard = $false }

  if (-not $OnWindows) {
    Reveal-Folder $Folder
    return $base
  }

  if ($sw -eq "3Shape") {
    $prog = Resolve-Program $Cfg "managerPaths" "3Shape" $ThreeShapeManagerNames $ThreeShapeManagerProcs @("3Shape*")
    $procs = $ThreeShapeManagerProcs
    if (-not $prog.exe) {
      $prog = Resolve-Program $Cfg "exePaths" "3Shape" $ThreeShapeDesktopNames $ThreeShapeDesktopProcs @("3Shape*")
      $procs = $ThreeShapeDesktopProcs
    }
    Reveal-Folder $Folder
    $base.clipboard = Copy-ToClipboard $Folder
    if (-not $prog.exe) {
      return @{ ok = $false; code = "EXE_NOT_FOUND"; folder = $Folder; message = "3Shape Dental Manager를 찾지 못했습니다. 파일은 작업 폴더에 저장했습니다." }
    }
    $base.mode = Start-OrActivate $prog.exe $procs @()
    $base.exe = $prog.exe
    $base.source = $prog.source
    $base.guide = "3shape_import"
    return $base
  }

  if ($sw -eq "ExoCAD") {
    $project = $FilePaths | Where-Object { $_ -like "*.dentalProject" } | Select-Object -First 1
    if ($project) {
      $app = Resolve-Program $Cfg "exePaths" "ExoCAD" $ExoCadAppNames $ExoCadAppProcs @("exocad*", "DentalCAD*", "DentalDB*")
      if ($app.exe) {
        $base.mode = Start-OrActivate $app.exe $ExoCadAppProcs @($project)
        $base.exe = $app.exe
        $base.source = $app.source
        $base.guide = "exocad_project"
        return $base
      }
    }
    $db = Resolve-Program $Cfg "managerPaths" "ExoCAD" $ExoCadDbNames $ExoCadDbProcs @("exocad*", "DentalCAD*", "DentalDB*")
    Reveal-Folder $Folder
    $base.clipboard = Copy-ToClipboard $Folder
    if (-not $db.exe) {
      return @{ ok = $false; code = "EXE_NOT_FOUND"; folder = $Folder; message = "exocad DentalDB를 찾지 못했습니다. 파일은 작업 폴더에 저장했습니다." }
    }
    $base.mode = Start-OrActivate $db.exe $ExoCadDbProcs @()
    $base.exe = $db.exe
    $base.source = $db.source
    $base.guide = "exocad_import"
    return $base
  }

  $custom = [string]$Cfg.exePaths.custom
  if ($custom -and (Test-Path -LiteralPath $custom)) {
    Start-Process -FilePath $custom -ArgumentList ($FilePaths | ForEach-Object { '"' + $_ + '"' }) | Out-Null
    $base.mode = "started"
    $base.exe = $custom
    $base.guide = "args"
    return $base
  }
  Reveal-Folder $Folder
  $base.clipboard = Copy-ToClipboard $Folder
  return $base
}

function Pick-FolderDialog([string]$Initial) {
  if (-not $OnWindows) {
    return @{ ok = $false; code = "UNSUPPORTED"; message = "이 PC에서는 폴더 고르기 창을 열 수 없습니다. 경로를 직접 입력해 주세요." }
  }
  Add-Type -AssemblyName System.Windows.Forms
  $owner = New-Object System.Windows.Forms.Form
  $owner.TopMost = $true
  $owner.ShowInTaskbar = $false
  $owner.StartPosition = "CenterScreen"
  $owner.Size = New-Object System.Drawing.Size(1, 1)
  $owner.Opacity = 0
  $owner.Show()
  $owner.Activate()
  try {
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = "환자 케이스를 저장할 작업 폴더를 고르세요."
    $dlg.ShowNewFolderButton = $true
    if (Test-Folder $Initial) { $dlg.SelectedPath = $Initial }
    $result = $dlg.ShowDialog($owner)
    if ($result -ne [System.Windows.Forms.DialogResult]::OK -or -not $dlg.SelectedPath) {
      return @{ ok = $false; code = "CANCELED"; message = "폴더 선택을 취소했습니다." }
    }
    return @{ ok = $true; path = [string]$dlg.SelectedPath }
  } finally {
    $owner.Close()
    $owner.Dispose()
  }
}

# ---------- HTTP (TcpListener, 1 request per connection) ----------

$StatusText = @{ 200 = "OK"; 204 = "No Content"; 400 = "Bad Request"; 401 = "Unauthorized"; 404 = "Not Found"; 411 = "Length Required"; 413 = "Payload Too Large"; 422 = "Unprocessable Entity"; 500 = "Internal Server Error" }

function Write-Response($Stream, [int]$Status, [byte[]]$Body, [string]$ContentType) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("HTTP/1.1 $Status $($StatusText[$Status])`r`n")
  if ($script:ResponseOrigin) {
    [void]$sb.Append("Access-Control-Allow-Origin: $script:ResponseOrigin`r`n")
    [void]$sb.Append("Vary: Origin`r`n")
  }
  [void]$sb.Append("Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS`r`n")
  [void]$sb.Append("Access-Control-Allow-Headers: Content-Type, x-abuts-cad-secret`r`n")
  [void]$sb.Append("Access-Control-Allow-Private-Network: true`r`n")
  [void]$sb.Append("Access-Control-Max-Age: 600`r`n")
  [void]$sb.Append("Cache-Control: no-store`r`n")
  [void]$sb.Append("Connection: close`r`n")
  if ($ContentType) { [void]$sb.Append("Content-Type: $ContentType`r`n") }
  $len = 0
  if ($Body) { $len = $Body.Length }
  [void]$sb.Append("Content-Length: $len`r`n`r`n")
  $head = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
  $Stream.Write($head, 0, $head.Length)
  if ($len -gt 0) { $Stream.Write($Body, 0, $len) }
  $Stream.Flush()
}

function Send-Json($Stream, [int]$Status, $BodyObj) {
  $json = ($BodyObj | ConvertTo-Json -Depth 6 -Compress)
  Write-Response $Stream $Status ([System.Text.Encoding]::UTF8.GetBytes($json)) "application/json; charset=utf-8"
}

function Read-RequestHead($Stream) {
  $ms = New-Object System.IO.MemoryStream
  $state = 0
  while ($true) {
    $b = $Stream.ReadByte()
    if ($b -lt 0) { break }
    $ms.WriteByte([byte]$b)
    if ($ms.Length -gt 65536) { throw "헤더가 너무 깁니다." }
    if (($state -eq 0 -or $state -eq 2) -and $b -eq 13) { $state++ }
    elseif (($state -eq 1 -or $state -eq 3) -and $b -eq 10) { $state++ }
    else { $state = 0; if ($b -eq 13) { $state = 1 } }
    if ($state -eq 4) { break }
  }
  if ($ms.Length -eq 0) { return $null }
  $text = [System.Text.Encoding]::ASCII.GetString($ms.ToArray())
  $lines = $text -split "`r`n"
  $parts = $lines[0] -split " "
  if ($parts.Count -lt 2) { return $null }
  $headers = @{}
  for ($i = 1; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $idx = $line.IndexOf(":")
    if ($idx -le 0) { continue }
    $headers[$line.Substring(0, $idx).Trim().ToLowerInvariant()] = $line.Substring($idx + 1).Trim()
  }
  $target = $parts[1]
  $q = $target.IndexOf("?")
  if ($q -ge 0) { $target = $target.Substring(0, $q) }
  $len = 0L
  if ($headers.ContainsKey("content-length")) { $len = [long]$headers["content-length"] }
  return @{ method = $parts[0].ToUpperInvariant(); path = $target; headers = $headers; contentLength = $len }
}

function Read-BodyBytes($Stream, [long]$Length, [long]$MaxBytes) {
  if ($Length -le 0) { return ,([byte[]]@()) }
  if ($Length -gt $MaxBytes) { throw "요청 본문이 너무 큽니다." }
  $buffer = New-Object byte[] $Length
  $offset = 0
  while ($offset -lt $Length) {
    $read = $Stream.Read($buffer, $offset, [int]($Length - $offset))
    if ($read -le 0) { throw "요청 본문이 끊겼습니다." }
    $offset += $read
  }
  return ,$buffer
}

function Read-JsonBody($Stream, $Req) {
  $bytes = Read-BodyBytes $Stream $Req.contentLength (256L * 1024L)
  if ($bytes.Length -eq 0) { return $null }
  return ([System.Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}

function Copy-BodyToFile($Stream, [long]$Length, [string]$Dest) {
  $tmp = "$Dest.part"
  $fs = [System.IO.File]::Create($tmp)
  try {
    $buffer = New-Object byte[] 1048576
    $remaining = $Length
    while ($remaining -gt 0) {
      $want = [int][Math]::Min([long]$buffer.Length, $remaining)
      $read = $Stream.Read($buffer, 0, $want)
      if ($read -le 0) { throw "파일 전송이 끊겼습니다." }
      $fs.Write($buffer, 0, $read)
      $remaining -= $read
    }
  } finally {
    $fs.Dispose()
  }
  if (Test-Path -LiteralPath $Dest) { Remove-Item -LiteralPath $Dest -Force }
  Move-Item -LiteralPath $tmp -Destination $Dest
}

function Prune-Sessions {
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  foreach ($key in @($script:Sessions.Keys)) {
    $s = $script:Sessions[$key]
    if (($now - [long]$s.createdAt) -le $script:SessionTtlMs) { continue }
    $script:Sessions.Remove($key)
    # 작업 폴더 안 케이스 폴더는 절대 지우지 않는다. temp만 정리.
    if ($s.isTemp -and $s.dir -and (Test-Path -LiteralPath $s.dir)) {
      Remove-Item -LiteralPath $s.dir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Get-HealthBody {
  $wf = [string]$script:Cfg.workFolder
  $os = "other"
  if ($OnWindows) { $os = "windows" } elseif ($IsMacOS) { $os = "mac" }
  return @{
    ok = $true
    service = "abuts-lab-cad-helper"
    version = $HelperVersion
    os = $os
    runtime = "powershell"
    port = $script:Port
    workFolder = $wf
    workFolderExists = (Test-Folder $wf)
  }
}

function Resolve-ResponseOrigin([string]$Origin) {
  if ($script:AllowAnyOrigin) { return "*" }
  if (-not $Origin) { return "" }
  foreach ($allowed in $script:AllowedOrigins) {
    if ($Origin -ieq $allowed) { return $Origin }
  }
  return ""
}

function Handle-Request($Stream, $Req) {
  $method = $Req.method
  $path = $Req.path
  $origin = [string]$Req.headers["origin"]
  $script:ResponseOrigin = Resolve-ResponseOrigin $origin
  # 브라우저에서 온 요청은 허용 출처만. 다른 사이트가 작업 폴더에 파일을 쓰지 못하게 막는다.
  if ($origin -and -not $script:ResponseOrigin -and $path -ne "/health") {
    Send-Json $Stream 401 @{ ok = $false; message = "허용되지 않은 출처입니다." }
    return
  }

  if ($method -eq "OPTIONS") {
    Write-Response $Stream 204 $null ""
    return
  }

  if ($path -eq "/health" -and $method -eq "GET") {
    Send-Json $Stream 200 (Get-HealthBody)
    return
  }

  if ($script:SharedSecret) {
    $got = [string]$Req.headers["x-abuts-cad-secret"]
    if ($got.Trim() -ne $script:SharedSecret) {
      Send-Json $Stream 401 @{ ok = $false; message = "권한이 없습니다." }
      return
    }
  }

  if ($path -eq "/shutdown" -and $method -eq "POST") {
    Send-Json $Stream 200 @{ ok = $true }
    $script:Running = $false
    return
  }

  if ($path -eq "/work-folder" -and $method -eq "GET") {
    $wf = [string]$script:Cfg.workFolder
    Send-Json $Stream 200 @{ ok = $true; path = $wf; exists = (Test-Folder $wf) }
    return
  }

  if ($path -eq "/work-folder" -and $method -eq "POST") {
    $body = Read-JsonBody $Stream $Req
    $want = ([string](Get-Prop $body "path")).Trim().Trim('"')
    if (-not (Test-Folder $want)) {
      Send-Json $Stream 400 @{ ok = $false; code = "WORK_FOLDER_NOT_FOUND"; message = "폴더를 찾을 수 없습니다. 경로를 확인해 주세요." }
      return
    }
    $script:Cfg.workFolder = $want
    Save-Config $script:Cfg
    Write-Log "work folder set: $want"
    Send-Json $Stream 200 @{ ok = $true; path = $want }
    return
  }

  if ($path -eq "/work-folder/pick" -and $method -eq "POST") {
    $body = Read-JsonBody $Stream $Req
    $initial = [string](Get-Prop $body "initial")
    if (-not $initial) { $initial = [string]$script:Cfg.workFolder }
    $picked = Pick-FolderDialog $initial
    if (-not $picked.ok) {
      Send-Json $Stream 200 $picked
      return
    }
    $script:Cfg.workFolder = $picked.path
    Save-Config $script:Cfg
    Write-Log ("work folder picked: {0}" -f $picked.path)
    Send-Json $Stream 200 $picked
    return
  }

  if ($path -eq "/sessions" -and $method -eq "POST") {
    Prune-Sessions
    $body = Read-JsonBody $Stream $Req
    $workFolder = ([string](Get-Prop $body "workFolder")).Trim().Trim('"')
    $caseFolder = [string](Get-Prop $body "caseFolder")
    $sessionId = ("{0}-{1}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString("x"), ([Guid]::NewGuid().ToString("N").Substring(0, 8)))
    $isTemp = $true
    if ($workFolder) {
      if (-not (Test-Folder $workFolder)) {
        Send-Json $Stream 400 @{ ok = $false; code = "WORK_FOLDER_NOT_FOUND"; message = "작업 폴더를 찾을 수 없습니다. 작업 폴더를 다시 지정해 주세요." }
        return
      }
      $name = Sanitize-FileName $caseFolder $sessionId
      $dir = Join-Path $workFolder $name
      $isTemp = $false
      if ($script:Cfg.workFolder -ne $workFolder) {
        $script:Cfg.workFolder = $workFolder
        Save-Config $script:Cfg
      }
    } else {
      $dir = Join-Path $script:WorkRoot $sessionId
    }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $script:Sessions[$sessionId] = @{
      dir = $dir
      isTemp = $isTemp
      files = New-Object System.Collections.Generic.List[string]
      createdAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
    Send-Json $Stream 200 @{ ok = $true; sessionId = $sessionId; folder = $dir }
    return
  }

  if ($path -match '^/sessions/([^/]+)/files/([^/]+)$' -and $method -eq "PUT") {
    $sessionId = [Uri]::UnescapeDataString($Matches[1])
    $fileName = Sanitize-FileName ([Uri]::UnescapeDataString($Matches[2]))
    if (-not $script:Sessions.ContainsKey($sessionId)) {
      Send-Json $Stream 404 @{ ok = $false; message = "세션이 없습니다." }
      return
    }
    if ($Req.contentLength -gt (1024L * 1024L * 1024L)) {
      Send-Json $Stream 413 @{ ok = $false; message = "파일이 너무 큽니다(최대 1GB)." }
      return
    }
    $session = $script:Sessions[$sessionId]
    $dest = Join-Path $session.dir $fileName
    Copy-BodyToFile $Stream $Req.contentLength $dest
    if (-not $session.files.Contains($dest)) { $session.files.Add($dest) | Out-Null }
    Send-Json $Stream 200 @{ ok = $true; fileName = $fileName; bytes = $Req.contentLength }
    return
  }

  if ($path -match '^/sessions/([^/]+)/(open|reveal)$' -and $method -eq "POST") {
    $sessionId = [Uri]::UnescapeDataString($Matches[1])
    $action = $Matches[2]
    if (-not $script:Sessions.ContainsKey($sessionId)) {
      Send-Json $Stream 404 @{ ok = $false; message = "세션이 없습니다." }
      return
    }
    $session = $script:Sessions[$sessionId]
    $body = Read-JsonBody $Stream $Req
    if ($action -eq "reveal") {
      Reveal-Folder $session.dir
      Send-Json $Stream 200 @{ ok = $true; folder = $session.dir; count = $session.files.Count }
      return
    }
    $designSoftware = ([string](Get-Prop $body "designSoftware")).Trim()
    if ($session.files.Count -le 0) {
      Send-Json $Stream 400 @{ ok = $false; message = "열 파일이 없습니다." }
      return
    }
    $result = Open-InDesignSoftware $script:Cfg $designSoftware $session.dir @($session.files.ToArray())
    $swLog = $designSoftware
    if (-not $swLog) { $swLog = "(default)" }
    if (-not $result.ok) {
      Write-Log ("open failed session={0} sw={1} code={2}" -f $sessionId, $swLog, $result.code)
      Send-Json $Stream 422 $result
      return
    }
    Write-Log ("opened session={0} sw={1} mode={2} guide={3} exe={4}" -f $sessionId, $swLog, $result.mode, $result.guide, $result.exe)
    Send-Json $Stream 200 $result
    return
  }

  Send-Json $Stream 404 @{ ok = $false; message = "not found" }
}

# ---------- main ----------

$script:Cfg = Read-Config
if (-not (Test-Path -LiteralPath $ConfigPath)) { Save-Config $script:Cfg }
$script:Port = [int]$script:Cfg.port
if ($env:LAB_CAD_HELPER_PORT) { $script:Port = [int]$env:LAB_CAD_HELPER_PORT }
$script:AllowedOrigins = New-Object System.Collections.Generic.List[string]
foreach ($o in @("https://abuts.fit", "https://www.abuts.fit", "http://localhost:5173", "http://127.0.0.1:5173")) {
  $script:AllowedOrigins.Add($o) | Out-Null
}
$originSetting = [string]$script:Cfg.allowOrigin
if ($env:LAB_CAD_HELPER_ORIGIN) { $originSetting = $env:LAB_CAD_HELPER_ORIGIN }
# 예전 설정의 "*"는 기본 허용 목록으로 본다. 모두 허용은 환경변수로만.
$script:AllowAnyOrigin = ($env:LAB_CAD_HELPER_ORIGIN -eq "*")
foreach ($o in ($originSetting -split ",")) {
  $t = $o.Trim().TrimEnd("/")
  if ($t -and $t -ne "*" -and -not $script:AllowedOrigins.Contains($t)) { $script:AllowedOrigins.Add($t) | Out-Null }
}
$script:ResponseOrigin = ""
$script:SharedSecret = [string]$script:Cfg.sharedSecret
if ($env:LAB_CAD_HELPER_SHARED_SECRET) { $script:SharedSecret = $env:LAB_CAD_HELPER_SHARED_SECRET.Trim() }

$tempBase = $env:TEMP
if (-not $tempBase) { $tempBase = [System.IO.Path]::GetTempPath() }
$script:WorkRoot = Join-Path $tempBase "abuts-lab-cad-helper"
if ($env:LAB_CAD_HELPER_WORK_DIR) { $script:WorkRoot = $env:LAB_CAD_HELPER_WORK_DIR }
New-Item -ItemType Directory -Force -Path $script:WorkRoot | Out-Null

$script:Sessions = @{}
$script:SessionTtlMs = 30 * 60 * 1000
$script:Running = $true

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $script:Port)
try {
  $listener.Start()
} catch {
  Write-Log ("port {0} busy — another helper is running? ({1})" -f $script:Port, $_.Exception.Message)
  exit 0
}

Write-Log ("v{0} listening on http://127.0.0.1:{1} (protocol={2})" -f $HelperVersion, $script:Port, $ProtocolArg)
Write-Log ("work folder: {0}" -f $(if ($script:Cfg.workFolder) { $script:Cfg.workFolder } else { "(unset)" }))

try {
  while ($script:Running) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 30000
      $client.SendTimeout = 30000
      $stream = $client.GetStream()
      $req = Read-RequestHead $stream
      if ($null -eq $req) { continue }
      if ($req.headers.ContainsKey("transfer-encoding")) {
        Send-Json $stream 411 @{ ok = $false; message = "Content-Length가 필요합니다." }
        continue
      }
      try {
        Handle-Request $stream $req
      } catch {
        Write-Log ("request error {0} {1}: {2}" -f $req.method, $req.path, $_.Exception.Message)
        try { Send-Json $stream 500 @{ ok = $false; message = $_.Exception.Message } } catch {}
      }
    } catch {
      Write-Log ("connection error: {0}" -f $_.Exception.Message)
    } finally {
      try { $client.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
  Write-Log "stopped"
}
