# change-log:
# - 2026-09-24: exe 탐색 — 설치 폴더→실행 중 프로세스. 실패 시 EXE_NOT_FOUND.
# - 2026-09-24: 설치(여기를_더블클릭_설치)·run-hidden·프로토콜 wake·중복 실행 시 조용히 종료.
# - 2026-09-24: Windows 스탠드얼론 — Node 없이 HttpListener + Start-Process (start.cmd).
# related files:
# - bg/lab-cad-helper/여기를_더블클릭_설치.cmd
# - bg/lab-cad-helper/run-hidden.vbs
# - bg/lab-cad-helper/start.cmd
# - bg/lab-cad-helper/config.example.json
# - bg/lab-cad-helper/rules.md
# - web/frontend/src/shared/files/labCadHelperClient.ts
#
# Requires: Windows PowerShell 5.1+ (기본 탑재). Node 불필요.
# 기공소: 여기를_더블클릭_설치.cmd (최초 1회). 이후 PC 시작·웹「열기」가 자동으로 깨움.

param(
  [string]$ProtocolArg = ""
)

$ErrorActionPreference = "Stop"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptDir "config.json"
$ExamplePath = Join-Path $ScriptDir "config.example.json"

function Write-Log([string]$Message) {
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  Write-Host "[lab-cad-helper] $stamp $Message"
}

function Ensure-Config {
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    if (Test-Path -LiteralPath $ExamplePath) {
      Copy-Item -LiteralPath $ExamplePath -Destination $ConfigPath
      Write-Log "created config.json from config.example.json"
    } else {
      @{
        port = 8010
        allowOrigin = "*"
        sharedSecret = ""
        exePaths = @{
          "3Shape" = ""
          ExoCAD = ""
          custom = ""
        }
      } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
      Write-Log "created default config.json"
    }
  }
}

function Get-Config {
  Ensure-Config
  $raw = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $port = 8010
  if ($raw.port) { $port = [int]$raw.port }
  $allowOrigin = "*"
  if ($raw.allowOrigin) { $allowOrigin = [string]$raw.allowOrigin }
  $sharedSecret = ""
  if ($raw.sharedSecret) { $sharedSecret = ([string]$raw.sharedSecret).Trim() }
  $exe3 = ""
  $exeExo = ""
  $exeCustom = ""
  if ($raw.exePaths) {
    if ($raw.exePaths."3Shape") { $exe3 = ([string]$raw.exePaths."3Shape").Trim() }
    if ($raw.exePaths.ExoCAD) { $exeExo = ([string]$raw.exePaths.ExoCAD).Trim() }
    if ($raw.exePaths.custom) { $exeCustom = ([string]$raw.exePaths.custom).Trim() }
  }
  return @{
    Port = $port
    AllowOrigin = $allowOrigin
    SharedSecret = $sharedSecret
    Exe3Shape = $exe3
    ExeExoCad = $exeExo
    ExeCustom = $exeCustom
  }
}

function Sanitize-FileName([string]$Name) {
  $base = [System.IO.Path]::GetFileName(([string]$Name).Trim())
  if ([string]::IsNullOrWhiteSpace($base)) { $base = "model.stl" }
  $invalid = [System.IO.Path]::GetInvalidFileNameChars()
  foreach ($ch in $invalid) {
    $base = $base.Replace([string]$ch, "_")
  }
  if ($base.Length -gt 180) { $base = $base.Substring(0, 180) }
  return $base
}

function Resolve-ConfiguredExe([hashtable]$Cfg, [string]$DesignSoftware) {
  $key = ([string]$DesignSoftware).Trim()
  if ($key -eq "3Shape") { return $Cfg.Exe3Shape }
  if ($key -eq "ExoCAD") { return $Cfg.ExeExoCad }
  if ($key) {
    if ($Cfg.ExeCustom) { return $Cfg.ExeCustom }
  }
  return ""
}

function Get-SearchRoots {
  $roots = New-Object System.Collections.Generic.List[string]
  foreach ($r in @(
      ${env:ProgramFiles},
      ${env:ProgramFiles(x86)},
      (Join-Path $env:LOCALAPPDATA "Programs"),
      "D:\Program Files",
      "D:\Program Files (x86)"
    )) {
    if ($r -and (Test-Path -LiteralPath $r)) { $roots.Add($r) | Out-Null }
  }
  return $roots
}

function Find-ExeUnderDirs([string[]]$NamePatterns, [string[]]$FolderHints, [int]$MaxDepth = 5) {
  $roots = Get-SearchRoots
  foreach ($root in $roots) {
    foreach ($hint in $FolderHints) {
      $hintPath = Join-Path $root $hint
      if (-not (Test-Path -LiteralPath $hintPath)) { continue }
      foreach ($pat in $NamePatterns) {
        try {
          $hits = Get-ChildItem -LiteralPath $hintPath -Filter $pat -File -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 8
          foreach ($hit in $hits) {
            if ($hit.FullName -and (Test-Path -LiteralPath $hit.FullName)) {
              return $hit.FullName
            }
          }
        } catch {}
      }
    }
  }
  # broader shallow search under Program Files\*hint*
  foreach ($root in $roots) {
    try {
      $dirs = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
        Where-Object {
          $n = $_.Name.ToLowerInvariant()
          foreach ($h in $FolderHints) {
            if ($n -like ("*" + $h.ToLowerInvariant().Split('\')[0] + "*")) { return $true }
          }
          return $false
        }
      foreach ($dir in $dirs) {
        foreach ($pat in $NamePatterns) {
          $hits = Get-ChildItem -LiteralPath $dir.FullName -Filter $pat -File -Recurse -Depth $MaxDepth -ErrorAction SilentlyContinue |
            Select-Object -First 5
          foreach ($hit in $hits) {
            if ($hit.FullName) { return $hit.FullName }
          }
        }
      }
    } catch {}
  }
  return ""
}

function Find-ExeByRunningProcess([string[]]$ProcessNamePatterns) {
  try {
    $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  } catch {
    try { $procs = Get-WmiObject Win32_Process -ErrorAction SilentlyContinue } catch { return "" }
  }
  if (-not $procs) { return "" }
  foreach ($p in $procs) {
    $name = [string]$p.Name
    $path = [string]$p.ExecutablePath
    if (-not $path) { continue }
    $matched = $false
    foreach ($pat in $ProcessNamePatterns) {
      if ($name -like $pat) { $matched = $true; break }
    }
    if (-not $matched) { continue }
    if (Test-Path -LiteralPath $path) { return $path }
  }
  return ""
}

function Discover-DesignExe([string]$DesignSoftware) {
  $key = ([string]$DesignSoftware).Trim()
  if ($key -eq "3Shape") {
    $byDir = Find-ExeUnderDirs @(
      "DentalDesktop.exe",
      "DentalDesigner.exe",
      "ThreeShape.DentalDesktop.exe"
    ) @(
      "3Shape",
      "3shape"
    )
    if ($byDir) { return @{ exe = $byDir; source = "install_dir" } }
    $byProc = Find-ExeByRunningProcess @(
      "DentalDesktop.exe",
      "DentalDesigner.exe",
      "ThreeShape.DentalDesktop.exe",
      "DentalDesktop*",
      "DentalDesigner*"
    )
    if ($byProc) { return @{ exe = $byProc; source = "running_process" } }
    return @{ exe = ""; source = "not_found" }
  }
  if ($key -eq "ExoCAD") {
    $byDir = Find-ExeUnderDirs @(
      "DentalCADApp.exe",
      "DentalCAD.exe",
      "DentalDB.exe"
    ) @(
      "exocad",
      "ExoCAD",
      "exocad GmbH"
    )
    if ($byDir) { return @{ exe = $byDir; source = "install_dir" } }
    $byProc = Find-ExeByRunningProcess @(
      "DentalCADApp.exe",
      "DentalCAD.exe",
      "DentalDB.exe",
      "DentalCAD*"
    )
    if ($byProc) { return @{ exe = $byProc; source = "running_process" } }
    return @{ exe = ""; source = "not_found" }
  }
  # custom: only running process by name guess is weak — skip dir scan
  return @{ exe = ""; source = "not_found" }
}

function Save-DiscoveredExe([string]$DesignSoftware, [string]$ExePath) {
  if (-not $ExePath) { return }
  try {
    Ensure-Config
    $key = ([string]$DesignSoftware).Trim()
    $obj = @{
      port = 8010
      allowOrigin = "*"
      sharedSecret = ""
      exePaths = @{
        "3Shape" = ""
        ExoCAD = ""
        custom = ""
      }
    }
    try {
      $raw = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($raw.port) { $obj.port = [int]$raw.port }
      if ($raw.allowOrigin) { $obj.allowOrigin = [string]$raw.allowOrigin }
      if ($null -ne $raw.sharedSecret) { $obj.sharedSecret = [string]$raw.sharedSecret }
      if ($raw.exePaths) {
        if ($raw.exePaths."3Shape") { $obj.exePaths."3Shape" = [string]$raw.exePaths."3Shape" }
        if ($raw.exePaths.ExoCAD) { $obj.exePaths.ExoCAD = [string]$raw.exePaths.ExoCAD }
        if ($raw.exePaths.custom) { $obj.exePaths.custom = [string]$raw.exePaths.custom }
      }
    } catch {}
    if ($key -eq "3Shape") { $obj.exePaths."3Shape" = $ExePath }
    elseif ($key -eq "ExoCAD") { $obj.exePaths.ExoCAD = $ExePath }
    else { $obj.exePaths.custom = $ExePath }
    ($obj | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
    Write-Log "saved discovered exe ($key): $ExePath"
  } catch {
    Write-Log ("save discovered exe failed: {0}" -f $_.Exception.Message)
  }
}

function Launch-Files([hashtable]$Cfg, [string]$DesignSoftware, [string[]]$FilePaths) {
  $configured = Resolve-ConfiguredExe $Cfg $DesignSoftware
  $exe = ""
  $source = "config"
  if ($configured -and (Test-Path -LiteralPath $configured)) {
    $exe = $configured
  } else {
    $discovered = Discover-DesignExe $DesignSoftware
    $exe = [string]$discovered.exe
    $source = [string]$discovered.source
    if ($exe) {
      Save-DiscoveredExe $DesignSoftware $exe
      # refresh in-memory cfg for this process
      if (([string]$DesignSoftware).Trim() -eq "3Shape") { $Cfg.Exe3Shape = $exe }
      elseif (([string]$DesignSoftware).Trim() -eq "ExoCAD") { $Cfg.ExeExoCad = $exe }
      else { $Cfg.ExeCustom = $exe }
    }
  }

  if (-not $exe -or -not (Test-Path -LiteralPath $exe)) {
    $sw = ([string]$DesignSoftware).Trim()
    if (-not $sw) { $sw = "디자인 프로그램" }
    return @{
      ok = $false
      code = "EXE_NOT_FOUND"
      mode = "not_found"
      exe = $null
      count = 0
      message = ("{0} 실행 파일을 찾지 못했습니다. PC에서 {0}을(를) 실행한 뒤, 웹에서 설치를 다시 진행해 주세요." -f $sw)
    }
  }

  Start-Process -FilePath $exe -ArgumentList $FilePaths -WindowStyle Normal | Out-Null
  return @{
    ok = $true
    code = $null
    mode = "exe"
    exe = $exe
    source = $source
    count = $FilePaths.Count
    hint = $null
    message = $null
  }
}

function Send-Json($Response, [int]$StatusCode, $BodyObj, [string]$AllowOrigin) {
  $json = ($BodyObj | ConvertTo-Json -Depth 6 -Compress)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.ContentEncoding = [System.Text.Encoding]::UTF8
  $Response.Headers["Access-Control-Allow-Origin"] = $AllowOrigin
  $Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,OPTIONS"
  $Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, x-abuts-cad-secret"
  $Response.ContentLength64 = $bytes.LongLength
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.OutputStream.Close()
}

function Read-BodyBytes($Request, [long]$MaxBytes) {
  $len = $Request.ContentLength64
  if ($len -lt 0) { $len = 0 }
  if ($len -gt $MaxBytes) {
    throw "요청 본문이 너무 큽니다."
  }
  $ms = New-Object System.IO.MemoryStream
  try {
    $buffer = New-Object byte[] 65536
    $stream = $Request.InputStream
    while ($true) {
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) { break }
      $ms.Write($buffer, 0, $read)
      if ($ms.Length -gt $MaxBytes) {
        throw "요청 본문이 너무 큽니다."
      }
    }
    return $ms.ToArray()
  } finally {
    $ms.Dispose()
  }
}

function Prune-Sessions([hashtable]$Sessions, [string]$WorkRoot, [long]$TtlMs) {
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $dead = @()
  foreach ($key in @($Sessions.Keys)) {
    $s = $Sessions[$key]
    if (($now - [long]$s.createdAt) -gt $TtlMs) {
      $dead += $key
    }
  }
  foreach ($key in $dead) {
    $dir = $Sessions[$key].dir
    $Sessions.Remove($key)
    if ($dir -and (Test-Path -LiteralPath $dir)) {
      Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

$Cfg = Get-Config
$Port = $Cfg.Port
if ($env:LAB_CAD_HELPER_PORT) {
  $Port = [int]$env:LAB_CAD_HELPER_PORT
}
$AllowOrigin = $Cfg.AllowOrigin
if ($env:LAB_CAD_HELPER_ORIGIN) {
  $AllowOrigin = $env:LAB_CAD_HELPER_ORIGIN
}
$SharedSecret = $Cfg.SharedSecret
if ($env:LAB_CAD_HELPER_SHARED_SECRET) {
  $SharedSecret = $env:LAB_CAD_HELPER_SHARED_SECRET.Trim()
}

$WorkRoot = Join-Path $env:TEMP "abuts-lab-cad-helper"
if ($env:LAB_CAD_HELPER_WORK_DIR) {
  $WorkRoot = $env:LAB_CAD_HELPER_WORK_DIR
}
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null

$Sessions = @{}
$SessionTtlMs = 30 * 60 * 1000

$prefix = "http://127.0.0.1:$Port/"

# 이미 실행 중이면(웹/설치가 wake) 조용히 종료
try {
  $existing = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 "$($prefix)health"
  if ($existing.StatusCode -eq 200) {
    Write-Log "already running — exit"
    exit 0
  }
} catch {}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  # 다른 인스턴스가 방금 포트를 잡았을 수 있음
  try {
    $again = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 "$($prefix)health"
    if ($again.StatusCode -eq 200) {
      Write-Log "peer already listening — exit"
      exit 0
    }
  } catch {}
  Write-Log "listen failed on $prefix — $($_.Exception.Message)"
  throw
}

Write-Log "listening on $prefix (protocol=$ProtocolArg)"
Write-Log "work dir: $WorkRoot"
Write-Log ("exePaths: 3Shape={0} ExoCAD={1}" -f `
  ($(if ($Cfg.Exe3Shape) { $Cfg.Exe3Shape } else { "(shell)" })), `
  ($(if ($Cfg.ExeExoCad) { $Cfg.ExeExoCad } else { "(shell)" })))

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $method = $req.HttpMethod.ToUpperInvariant()
      $path = $req.Url.AbsolutePath

      if ($method -eq "OPTIONS") {
        $res.StatusCode = 204
        $res.Headers["Access-Control-Allow-Origin"] = $AllowOrigin
        $res.Headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,OPTIONS"
        $res.Headers["Access-Control-Allow-Headers"] = "Content-Type, x-abuts-cad-secret"
        $res.Close()
        continue
      }

      if ($path -eq "/health" -and $method -eq "GET") {
        Send-Json $res 200 @{
          ok = $true
          service = "abuts-lab-cad-helper"
          port = $Port
          runtime = "powershell"
          exeConfigured = @{
            "3Shape" = [bool]$Cfg.Exe3Shape
            ExoCAD = [bool]$Cfg.ExeExoCad
            custom = [bool]$Cfg.ExeCustom
          }
        } $AllowOrigin
        continue
      }

      if ($SharedSecret) {
        $got = [string]$req.Headers["x-abuts-cad-secret"]
        if ($got.Trim() -ne $SharedSecret) {
          Send-Json $res 401 @{ ok = $false; message = "권한이 없습니다." } $AllowOrigin
          continue
        }
      }

      if ($path -eq "/sessions" -and $method -eq "POST") {
        Prune-Sessions $Sessions $WorkRoot $SessionTtlMs
        $sessionId = ("{0}-{1}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString("x"), ([Guid]::NewGuid().ToString("N").Substring(0, 8)))
        $dir = Join-Path $WorkRoot $sessionId
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        $Sessions[$sessionId] = @{
          dir = $dir
          files = New-Object System.Collections.Generic.List[string]
          createdAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        }
        Send-Json $res 200 @{ ok = $true; sessionId = $sessionId } $AllowOrigin
        continue
      }

      if ($path -match '^/sessions/([^/]+)/files/([^/]+)$' -and $method -eq "PUT") {
        $sessionId = [Uri]::UnescapeDataString($Matches[1])
        $fileName = Sanitize-FileName ([Uri]::UnescapeDataString($Matches[2]))
        if (-not $Sessions.ContainsKey($sessionId)) {
          Send-Json $res 404 @{ ok = $false; message = "세션이 없습니다." } $AllowOrigin
          continue
        }
        $session = $Sessions[$sessionId]
        $dest = Join-Path $session.dir $fileName
        $bytes = Read-BodyBytes $req (500L * 1024L * 1024L)
        [System.IO.File]::WriteAllBytes($dest, $bytes)
        if (-not $session.files.Contains($dest)) {
          $session.files.Add($dest) | Out-Null
        }
        Send-Json $res 200 @{
          ok = $true
          fileName = $fileName
          bytes = $bytes.LongLength
        } $AllowOrigin
        continue
      }

      if ($path -match '^/sessions/([^/]+)/open$' -and $method -eq "POST") {
        $sessionId = [Uri]::UnescapeDataString($Matches[1])
        if (-not $Sessions.ContainsKey($sessionId)) {
          Send-Json $res 404 @{ ok = $false; message = "세션이 없습니다." } $AllowOrigin
          continue
        }
        $session = $Sessions[$sessionId]
        $rawBytes = Read-BodyBytes $req (64L * 1024L)
        $designSoftware = ""
        if ($rawBytes.Length -gt 0) {
          $rawText = [System.Text.Encoding]::UTF8.GetString($rawBytes)
          $body = $rawText | ConvertFrom-Json
          if ($body.designSoftware) {
            $designSoftware = ([string]$body.designSoftware).Trim()
          }
        }
        if ($session.files.Count -le 0) {
          Send-Json $res 400 @{ ok = $false; message = "열린 파일이 없습니다." } $AllowOrigin
          continue
        }
        $fileArr = @($session.files.ToArray())
        $result = Launch-Files $Cfg $designSoftware $fileArr
        if (-not $result.ok) {
          Write-Log ("open failed session={0} sw={1} code={2}" -f $sessionId, ($(if ($designSoftware) { $designSoftware } else { "(default)" })), $result.code)
          Send-Json $res 422 @{
            ok = $false
            code = $result.code
            message = $result.message
            designSoftware = $(if ($designSoftware) { $designSoftware } else { $null })
          } $AllowOrigin
          continue
        }
        Write-Log ("opened session={0} sw={1} mode={2} source={3} count={4}" -f $sessionId, ($(if ($designSoftware) { $designSoftware } else { "(default)" })), $result.mode, $result.source, $result.count)
        $payload = @{
          ok = $true
          designSoftware = $(if ($designSoftware) { $designSoftware } else { $null })
          mode = $result.mode
          exe = $result.exe
          source = $result.source
          count = $result.count
        }
        if ($result.hint) { $payload.hint = $result.hint }
        Send-Json $res 200 $payload $AllowOrigin
        continue
      }

      Send-Json $res 404 @{ ok = $false; message = "not found" } $AllowOrigin
    } catch {
      Write-Log ("request error: {0}" -f $_.Exception.Message)
      try {
        Send-Json $res 500 @{
          ok = $false
          message = $_.Exception.Message
        } $AllowOrigin
      } catch {
        try { $res.Abort() } catch {}
      }
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
  Write-Log "stopped"
}
