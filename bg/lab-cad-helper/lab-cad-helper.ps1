# change-log:
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

function Resolve-Exe([hashtable]$Cfg, [string]$DesignSoftware) {
  $key = ([string]$DesignSoftware).Trim()
  if ($key -eq "3Shape") { return $Cfg.Exe3Shape }
  if ($key -eq "ExoCAD") { return $Cfg.ExeExoCad }
  if ($key) {
    if ($Cfg.ExeCustom) { return $Cfg.ExeCustom }
  }
  return ""
}

function Launch-Files([hashtable]$Cfg, [string]$DesignSoftware, [string[]]$FilePaths) {
  $exe = Resolve-Exe $Cfg $DesignSoftware
  if ($exe -and (Test-Path -LiteralPath $exe)) {
    Start-Process -FilePath $exe -ArgumentList $FilePaths -WindowStyle Normal | Out-Null
    return @{
      mode = "exe"
      exe = $exe
      count = $FilePaths.Count
      hint = $null
    }
  }

  foreach ($fp in $FilePaths) {
    Start-Process -FilePath $fp -WindowStyle Normal | Out-Null
  }
  $hint = "exePaths가 비어 OS 기본 앱으로 열었습니다. config.json에 3Shape/ExoCAD 경로를 넣으면 해당 SW로 실행합니다."
  if ($exe -and -not (Test-Path -LiteralPath $exe)) {
    $hint = "config.json exePaths에 지정한 경로가 없습니다: $exe"
  }
  return @{
    mode = "shell"
    exe = $null
    count = $FilePaths.Count
    hint = $hint
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
        Write-Log ("opened session={0} sw={1} mode={2} count={3}" -f $sessionId, ($(if ($designSoftware) { $designSoftware } else { "(default)" })), $result.mode, $result.count)
        $payload = @{
          ok = $true
          designSoftware = $(if ($designSoftware) { $designSoftware } else { $null })
          mode = $result.mode
          exe = $result.exe
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
