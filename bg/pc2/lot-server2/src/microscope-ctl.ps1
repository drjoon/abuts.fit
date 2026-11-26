param(
  [Parameter(Mandatory = $true)][string]$DllDir,
  # prepare = LED on then AF. af = same path (compat).
  [ValidateSet("prepare", "af")][string]$Action = "prepare"
)

$ErrorActionPreference = "Stop"

function Emit-Result($obj) {
  Write-Output ($obj | ConvertTo-Json -Compress)
}

if ([IntPtr]::Size -ne 4) {
  Emit-Result @{ ok = $false; reason = "need-32bit" }
  exit 0
}

$dll = Join-Path $DllDir "mltcCom.dll"
if (-not (Test-Path -LiteralPath $dll)) {
  Emit-Result @{ ok = $false; reason = "dll-missing" }
  exit 0
}

# C# source must stay ASCII-only: PS 5.1 encoding can break non-ASCII in Add-Type.
$source = @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class MltcCtl {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool SetDllDirectory(string lpPathName);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr LoadLibrary(string lpFileName);

  [DllImport("mltcCom.dll", EntryPoint = "@ComInitial$qqsv", CallingConvention = CallingConvention.StdCall)]
  static extern int ComInitial();

  [DllImport("mltcCom.dll", EntryPoint = "@ComUnInitial$qqsv", CallingConvention = CallingConvention.StdCall)]
  static extern void ComUnInitial();

  [DllImport("mltcCom.dll", EntryPoint = "@wSetSendData_I2C$qqsululs", CallingConvention = CallingConvention.StdCall)]
  static extern void WSet(uint cmd, uint data, short mode);

  [DllImport("mltcCom.dll", EntryPoint = "@rGetSendData_I2C$qqsuls", CallingConvention = CallingConvention.StdCall)]
  static extern uint RGet(uint cmd, short mode);

  // Shared UM06/UM12/UM20 registers (ViTiny mltcComCtrl.h).
  const uint STAFLAG = 0x00;
  const uint KEYCO = 0x01;
  const uint KEYCH = 0x02;
  const uint LEDMAX = 0x05;
  const uint LEDLV = 0x06;
  const uint OPOSIH = 0x09;
  const uint OPOSIL = 0x0A;
  const uint AFAREA = 0x0E;
  const uint LEDMOD = 0x10;
  const uint FWVER2 = 0x2D;
  const uint FWVER1 = 0x2E;
  const uint FWVER0 = 0x2F;
  const uint KEY_DOWN = 0x40;
  const uint KEY_UP = 0x80;
  const uint KEY_REMOTE = 0x0F;
  const uint KEY_AF_SINGLE = 0x15;
  const uint KEY_LED_ONOFF = 0x19;
  const uint KEY_LED_INC = 0x1A;

  static bool TryRead(uint addr, short mode, out uint value) {
    value = 0;
    for (int i = 0; i < 3; i++) {
      uint a = RGet(addr, mode);
      Thread.Sleep(2);
      uint b = RGet(addr, mode);
      Thread.Sleep(2);
      if (a == b) {
        value = a;
        return true;
      }
    }
    return false;
  }

  static bool WriteKey(uint key, short mode) {
    WSet(KEYCO, key, mode);
    Thread.Sleep(2);
    uint a = RGet(KEYCH, mode);
    Thread.Sleep(2);
    uint b = RGet(KEYCH, mode);
    return a == key && b == key;
  }

  static bool WriteData(uint addr, uint data, short mode) {
    WSet(addr, data, mode);
    Thread.Sleep(2);
    uint value;
    if (!TryRead(addr, mode, out value)) return false;
    return value == data;
  }

  static uint ReadPosition(short mode) {
    uint hi = 0;
    uint lo = 0;
    if (!TryRead(OPOSIH, mode, out hi)) return 0;
    if (!TryRead(OPOSIL, mode, out lo)) return 0;
    return (hi << 8) | (lo & 0xFF);
  }

  // CodeDom/C#5: do not chain out params with && (unassigned local error).
  static bool Probe(short mode, out string firmware) {
    firmware = "";
    uint major = 0;
    uint sub1 = 0;
    uint sub2 = 0;
    bool version = TryRead(FWVER0, mode, out major);
    if (version) version = TryRead(FWVER1, mode, out sub1);
    if (version) version = TryRead(FWVER2, mode, out sub2);
    if (version) firmware = major + "." + sub1 + "." + sub2;
    if (version && (major != 0 || sub1 != 0 || sub2 != 0)) return true;
    uint status = 0;
    uint ledMax = 0;
    if (!TryRead(STAFLAG, mode, out status)) return false;
    if (!TryRead(LEDMAX, mode, out ledMax)) return false;
    return status != 0 || ledMax != 0;
  }

  static bool EnableRemote(short mode) {
    uint status;
    if (!TryRead(STAFLAG, mode, out status)) return false;
    if ((status & 0x08) != 0) return true;
    if (!WriteKey(KEY_DOWN | KEY_REMOTE, mode)) return false;
    Thread.Sleep(20);
    if (!TryRead(STAFLAG, mode, out status)) return false;
    return (status & 0x08) != 0;
  }

  // STAFLAG bit1 = LED on.
  static bool EnsureLedOn(short mode, out bool wasOn) {
    wasOn = false;
    uint status;
    if (!TryRead(STAFLAG, mode, out status)) return false;
    wasOn = (status & 0x02) != 0;
    if (wasOn) return true;
    if (!WriteKey(KEY_DOWN | KEY_LED_ONOFF, mode)) return false;
    Thread.Sleep(40);
    if (!TryRead(STAFLAG, mode, out status)) return false;
    return (status & 0x02) != 0;
  }

  // Raise LED to max. Prefer WriteData; else KEY_LED_INC with a hard cap.
  static bool BrightenLed(short mode, out uint ledMax, out uint ledLevel) {
    ledMax = 0;
    ledLevel = 0;
    WriteData(LEDMOD, 0, mode);
    if (!TryRead(LEDMAX, mode, out ledMax)) ledMax = 12;
    if (ledMax == 0) ledMax = 12;
    if (WriteData(LEDLV, ledMax, mode)) {
      ledLevel = ledMax;
      return true;
    }
    if (!TryRead(LEDLV, mode, out ledLevel)) ledLevel = 0;
    int guard = 0;
    while (ledLevel < ledMax && guard < 16) {
      if (!WriteKey(KEY_DOWN | KEY_LED_INC, mode)) break;
      Thread.Sleep(30);
      WriteKey(KEY_UP | KEY_LED_INC, mode);
      Thread.Sleep(20);
      if (!TryRead(LEDLV, mode, out ledLevel)) break;
      guard++;
    }
    return ledLevel > 0;
  }

  static uint AfAreaForMode(short mode) {
    if (mode == 6) return 0x0F;
    return 0x1A;
  }

  static string WaitAf(short mode, uint startPos) {
    bool sawBusy = false;
    for (int i = 0; i < 40; i++) {
      Thread.Sleep(200);
      uint status;
      if (!TryRead(STAFLAG, mode, out status)) continue;
      bool busy = (status & 0x04) != 0;
      if (busy) sawBusy = true;
      if (sawBusy && !busy) return "done";
    }
    uint endPos = ReadPosition(mode);
    if (endPos != 0 && endPos != startPos) return "done";
    if (sawBusy) return "timeout";
    return "accepted";
  }

  static string Json(
    bool ok,
    short mode,
    string firmware,
    string af,
    uint position,
    uint ledMax,
    uint ledLevel,
    bool ledOn,
    string reason
  ) {
    return "{\"ok\":" + (ok ? "true" : "false")
      + ",\"devMode\":" + mode
      + ",\"firmware\":\"" + firmware + "\""
      + ",\"af\":\"" + af + "\""
      + ",\"position\":" + position
      + ",\"ledMax\":" + ledMax
      + ",\"ledLevel\":" + ledLevel
      + ",\"ledOn\":" + (ledOn ? "true" : "false")
      + ",\"reason\":\"" + reason + "\"}";
  }

  public static string Run(string dllDir, string action) {
    SetDllDirectory(dllDir);
    try { System.IO.Directory.SetCurrentDirectory(dllDir); } catch { }
    string et = System.IO.Path.Combine(dllDir, "etLib2.dll");
    string emx = System.IO.Path.Combine(dllDir, "emxunit.dll");
    string com = System.IO.Path.Combine(dllDir, "mltcCom.dll");
    if (LoadLibrary(et) == IntPtr.Zero) return Json(false, 0, "", "none", 0, 0, 0, false, "etlib-load-failed");
    LoadLibrary(emx);
    if (LoadLibrary(com) == IntPtr.Zero) return Json(false, 0, "", "none", 0, 0, 0, false, "dll-load-failed");
    // ffmpeg/dshow may hold the device briefly; retry a few times (hard cap).
    int initOk = 0;
    for (int attempt = 0; attempt < 4; attempt++) {
      initOk = ComInitial();
      if (initOk != 0) break;
      Thread.Sleep(250);
    }
    if (initOk == 0) return Json(false, 0, "", "none", 0, 0, 0, false, "init-failed");
    try {
      short[] modes = new short[] { 20, 12, 6 };
      string lastReason = "probe-failed";
      for (int i = 0; i < modes.Length; i++) {
        short mode = modes[i];
        string firmware;
        if (!Probe(mode, out firmware)) {
          lastReason = "probe-failed";
          continue;
        }
        if (!EnableRemote(mode)) {
          lastReason = "remote-failed";
          continue;
        }

        uint ledMax = 0;
        uint ledLevel = 0;
        bool ledOn = false;
        if (action == "prepare" || action == "af") {
          bool wasOn;
          if (!EnsureLedOn(mode, out wasOn)) {
            lastReason = "led-on-failed";
          } else {
            ledOn = true;
          }
          BrightenLed(mode, out ledMax, out ledLevel);
          uint stAfter;
          if (TryRead(STAFLAG, mode, out stAfter)) ledOn = (stAfter & 0x02) != 0;
        }

        WriteData(AFAREA, AfAreaForMode(mode), mode);
        uint start = ReadPosition(mode);
        if (!WriteKey(KEY_DOWN | KEY_AF_SINGLE, mode)) {
          lastReason = "af-rejected";
          continue;
        }
        string af = WaitAf(mode, start);
        uint position = ReadPosition(mode);
        bool ok = af == "done" || af == "accepted";
        return Json(ok, mode, firmware, af, position, ledMax, ledLevel, ledOn, ok ? "" : af);
      }
      return Json(false, 0, "", "none", 0, 0, 0, false, lastReason);
    } finally {
      ComUnInitial();
    }
  }
}
'@

try {
  Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop
  Write-Output ([MltcCtl]::Run($DllDir, $Action))
} catch {
  $detail = $_.Exception.Message
  if ($_.Exception.InnerException) {
    $detail = $detail + " | " + $_.Exception.InnerException.Message
  }
  if ($detail) { $detail = $detail.Replace('"', "'").Replace("`r", " ").Replace("`n", " ") }
  if ($detail.Length -gt 500) { $detail = $detail.Substring(0, 500) }
  Emit-Result @{ ok = $false; reason = "exception"; detail = $detail }
  exit 0
}
