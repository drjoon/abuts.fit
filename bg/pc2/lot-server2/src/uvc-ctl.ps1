param(
  [string]$DeviceName = ""
)

$ErrorActionPreference = "Stop"

function Emit-Result($obj) {
  Write-Output ($obj | ConvertTo-Json -Compress)
}

# UVC DirectShow controls. ASCII-only C# for Windows PowerShell 5.1 Add-Type.
# ViTiny I2C (mltcCom) does not open this UM20 (ComInitial init-failed).
$source = @'
using System;
using System.Runtime.InteropServices;

public static class UvcCtl {
  const int Exposure = 4;
  const int Focus = 6;
  const int Brightness = 0;
  const int Gain = 9;
  const int Backlight = 8;
  const int FlagAuto = 0x1;
  const int FlagManual = 0x2;

  [DllImport("ole32.dll")]
  static extern int CreateBindCtx(int reserved, out IntPtr ppbc);

  [DllImport("ole32.dll")]
  static extern int CoInitializeEx(IntPtr reserved, uint coinit);

  [DllImport("ole32.dll", ExactSpelling = true)]
  static extern int CoCreateInstance(
    IntPtr clsid,
    IntPtr outer,
    uint context,
    IntPtr iid,
    out IntPtr created);

  [ComImport, Guid("29840822-5B84-11D0-BD3B-00A0C911CE86"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ICreateDevEnum {
    [PreserveSig]
    int CreateClassEnumerator(ref Guid type, out IEnumMoniker monikers, int flags);
  }

  [ComImport, Guid("00000102-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IEnumMoniker {
    [PreserveSig]
    int Next(int celt, [MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 0)] IMoniker[] rgelt, IntPtr fetched);
    [PreserveSig]
    int Skip(int celt);
    [PreserveSig]
    int Reset();
    [PreserveSig]
    int Clone(out IEnumMoniker clone);
  }

  [ComImport, Guid("0000000f-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMoniker {
    [PreserveSig] int GetClassID(out Guid classId);
    [PreserveSig] int IsDirty();
    [PreserveSig] int Load(IntPtr stream);
    [PreserveSig] int Save(IntPtr stream, int clearDirty);
    [PreserveSig] int GetSizeMax(IntPtr size);
    [PreserveSig] int BindToObject(IntPtr bindCtx, IntPtr left, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object obj);
    [PreserveSig] int BindToStorage(IntPtr bindCtx, IntPtr left, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object obj);
  }

  [ComImport, Guid("55272A00-42CB-11CE-8135-00AA004BB851"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyBag {
    [PreserveSig]
    int Read([MarshalAs(UnmanagedType.LPWStr)] string name, ref object value, IntPtr errorLog);
    [PreserveSig]
    int Write([MarshalAs(UnmanagedType.LPWStr)] string name, ref object value);
  }

  [ComImport, Guid("C6E13370-30AC-11d0-A18C-00A0C9118956"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAMCameraControl {
    [PreserveSig] int GetRange(int prop, out int min, out int max, out int step, out int def, out int caps);
    [PreserveSig] int Set(int prop, int value, int flags);
    [PreserveSig] int Get(int prop, out int value, out int flags);
  }

  [ComImport, Guid("C6E13360-30AC-11d0-A18C-00A0C9118956"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAMVideoProcAmp {
    [PreserveSig] int GetRange(int prop, out int min, out int max, out int step, out int def, out int caps);
    [PreserveSig] int Set(int prop, int value, int flags);
    [PreserveSig] int Get(int prop, out int value, out int flags);
  }

  static string Esc(string text) {
    if (text == null) return "";
    return text.Replace("\\", "\\\\").Replace("\"", "'");
  }

  static bool SetAutoOrMax(IAMCameraControl cam, int prop, out string how) {
    how = "skip";
    if (cam == null) return false;
    if (cam.Set(prop, 0, FlagAuto) == 0) {
      how = "auto";
      return true;
    }
    int min = 0, max = 0, step = 0, def = 0, caps = 0;
    if (cam.GetRange(prop, out min, out max, out step, out def, out caps) != 0) return false;
    int value = max >= min ? max : min;
    if (cam.Set(prop, value, FlagManual) != 0) return false;
    how = "manual-" + value;
    return true;
  }

  static bool SetAutoOrMaxAmp(IAMVideoProcAmp amp, int prop, out string how, out int level, out int maxOut) {
    how = "skip";
    level = 0;
    maxOut = 0;
    if (amp == null) return false;
    int min = 0, max = 0, step = 0, def = 0, caps = 0;
    if (amp.GetRange(prop, out min, out max, out step, out def, out caps) != 0) return false;
    maxOut = max;
    if ((caps & FlagAuto) != 0 && amp.Set(prop, def, FlagAuto) == 0) {
      how = "auto";
      level = def;
      return true;
    }
    int value = max;
    if (amp.Set(prop, value, FlagManual) != 0) return false;
    how = "manual-" + value;
    level = value;
    return true;
  }

  static IntPtr GuidAlloc(string text, out string hex) {
    Guid guid = new Guid(text);
    IntPtr ptr = Marshal.AllocCoTaskMem(16);
    Marshal.StructureToPtr(guid, ptr, false);
    byte[] raw = new byte[16];
    Marshal.Copy(ptr, raw, 0, 16);
    hex = BitConverter.ToString(raw);
    return ptr;
  }

  static string RegProbe() {
    string id = "{62BE5D10-60EB-11d0-BD3B-00A0C911CE86}";
    string[] keys = new string[] {
      @"SOFTWARE\Classes\CLSID\" + id + @"\InprocServer32",
      @"SOFTWARE\Classes\Wow6432Node\CLSID\" + id + @"\InprocServer32",
      @"SOFTWARE\WOW6432Node\Classes\CLSID\" + id + @"\InprocServer32"
    };
    string hit = "";
    for (int i = 0; i < keys.Length; i++) {
      try {
        Microsoft.Win32.RegistryKey key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(keys[i]);
        if (key == null) continue;
        object value = key.GetValue("");
        if (hit.Length > 0) hit += ";";
        hit += i + ":" + (value == null ? "key" : value.ToString());
        key.Close();
      } catch {
        // diagnostic only
      }
    }
    if (hit.Length == 0) return "none";
    return hit.Replace("\\", "/").Replace("\"", "'");
  }

  public static string Run(string preferred) {
    Guid video = new Guid("860BB310-5D01-11d0-BD3B-00A0C911CE86");
    Guid iidFilter = new Guid("56A86895-0AD4-11CE-B03A-0020AF0BA770");
    Guid iidBag = new Guid("55272A00-42CB-11CE-8135-00AA004BB851");
    Guid clsidEnum = new Guid("62BE5D10-60EB-11d0-BD3B-00A0C9118956");
    Guid iidEnum = new Guid("29840822-5B84-11D0-BD3B-00A0C911CE86");
    string clsidHex;
    string iidHex;
    IntPtr clsidPtr = GuidAlloc(clsidEnum.ToString(), out clsidHex);
    IntPtr iidPtr = GuidAlloc(iidEnum.ToString(), out iidHex);
    ICreateDevEnum devenum = null;
    int created = unchecked((int)0x80040154);
    int coinit = CoInitializeEx(IntPtr.Zero, 2);
    string activator = "";
    try {
      uint[] contexts = new uint[] { 1, 23 };
      for (int n = 0; n < contexts.Length; n++) {
        IntPtr punk;
        created = CoCreateInstance(clsidPtr, IntPtr.Zero, contexts[n], iidPtr, out punk);
        if (created == 0 && punk != IntPtr.Zero) {
          devenum = (ICreateDevEnum)Marshal.GetObjectForIUnknown(punk);
          Marshal.Release(punk);
          break;
        }
      }
      if (devenum == null) {
        try {
          Type enumType = Type.GetTypeFromCLSID(clsidEnum, true);
          object createdObj = Activator.CreateInstance(enumType);
          devenum = createdObj as ICreateDevEnum;
          activator = devenum == null ? "cast-failed" : "ok";
          if (devenum != null) created = 0;
        } catch (Exception ex) {
          activator = ex.GetType().Name;
        }
      }
    } finally {
      Marshal.FreeCoTaskMem(clsidPtr);
      Marshal.FreeCoTaskMem(iidPtr);
    }
    if (devenum == null) {
      int bits = IntPtr.Size * 8;
      string reg = RegProbe();
      string detail = "bits=" + bits
        + " coinit=" + coinit.ToString("X8")
        + " activator=" + activator
        + " guid=" + clsidHex + "/" + iidHex
        + " reg=" + reg;
      return "{\"ok\":false,\"af\":\"none\",\"reason\":\"cocreate-" + created.ToString("X8")
        + "\",\"bits\":" + bits + ",\"detail\":\"" + detail + "\"}";
    }
    IEnumMoniker monikers;
    int hr = devenum.CreateClassEnumerator(ref video, out monikers, 0);
    if (hr != 0 || monikers == null) {
      return "{\"ok\":false,\"af\":\"none\",\"reason\":\"no-device\"}";
    }
    string want = preferred == null ? "" : preferred.Trim();
    IMoniker[] one = new IMoniker[1];
    object chosen = null;
    string chosenName = "";
    object fallback = null;
    string fallbackName = "";
    while (monikers.Next(1, one, IntPtr.Zero) == 0) {
      IMoniker moniker = one[0];
      if (moniker == null) break;
      IntPtr bc = IntPtr.Zero;
      object bagObj = null;
      object filter = null;
      try {
        if (CreateBindCtx(0, out bc) != 0) continue;
        string name = "";
        if (moniker.BindToStorage(bc, IntPtr.Zero, ref iidBag, out bagObj) == 0 && bagObj != null) {
          IPropertyBag bag = bagObj as IPropertyBag;
          if (bag != null) {
            object val = "";
            if (bag.Read("FriendlyName", ref val, IntPtr.Zero) == 0 && val != null) name = val.ToString();
          }
        }
        if (moniker.BindToObject(bc, IntPtr.Zero, ref iidFilter, out filter) != 0 || filter == null) {
          continue;
        }
        bool match = want.Length == 0 || name.IndexOf(want, StringComparison.OrdinalIgnoreCase) >= 0;
        if (match && chosen == null) {
          chosen = filter;
          chosenName = name;
          filter = null;
        } else if (fallback == null) {
          fallback = filter;
          fallbackName = name;
          filter = null;
        }
      } finally {
        if (filter != null) {
          try { Marshal.ReleaseComObject(filter); } catch { }
        }
        if (bagObj != null) {
          try { Marshal.ReleaseComObject(bagObj); } catch { }
        }
        if (bc != IntPtr.Zero) Marshal.Release(bc);
        try { Marshal.ReleaseComObject(moniker); } catch { }
        one[0] = null;
      }
      if (chosen != null) break;
    }
    try { Marshal.ReleaseComObject(monikers); } catch { }
    if (chosen == null) {
      chosen = fallback;
      chosenName = fallbackName;
    } else if (fallback != null) {
      try { Marshal.ReleaseComObject(fallback); } catch { }
    }
    if (chosen == null) {
      return "{\"ok\":false,\"af\":\"none\",\"reason\":\"bind-failed\"}";
    }
    try {
      IAMCameraControl cam = chosen as IAMCameraControl;
      IAMVideoProcAmp amp = chosen as IAMVideoProcAmp;
      string focusHow;
      string exposureHow;
      string brightHow;
      string gainHow;
      string backHow;
      int brightLevel;
      int brightMax;
      int gainLevel;
      int gainMax;
      int unusedL;
      int unusedM;
      bool focusOk = SetAutoOrMax(cam, Focus, out focusHow);
      bool exposureOk = SetAutoOrMax(cam, Exposure, out exposureHow);
      bool brightOk = SetAutoOrMaxAmp(amp, Brightness, out brightHow, out brightLevel, out brightMax);
      bool gainOk = SetAutoOrMaxAmp(amp, Gain, out gainHow, out gainLevel, out gainMax);
      SetAutoOrMaxAmp(amp, Backlight, out backHow, out unusedL, out unusedM);
      bool ok = focusOk || exposureOk || brightOk || gainOk;
      string af = focusOk ? "done" : (ok ? "accepted" : "none");
      string reason = ok ? "" : "uvc-none";
      return "{\"ok\":" + (ok ? "true" : "false")
        + ",\"af\":\"" + af + "\""
        + ",\"reason\":\"" + reason + "\""
        + ",\"device\":\"" + Esc(chosenName) + "\""
        + ",\"focus\":\"" + focusHow + "\""
        + ",\"exposure\":\"" + exposureHow + "\""
        + ",\"brightness\":\"" + brightHow + "\""
        + ",\"brightLevel\":" + brightLevel
        + ",\"brightMax\":" + brightMax
        + ",\"gain\":\"" + gainHow + "\""
        + ",\"gainLevel\":" + gainLevel
        + ",\"gainMax\":" + gainMax
        + ",\"path\":\"uvc\"}";
    } finally {
      try { Marshal.ReleaseComObject(chosen); } catch { }
    }
  }
}
'@

try {
  Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop
  Write-Output ([UvcCtl]::Run($DeviceName))
} catch {
  $detail = $_.Exception.Message
  if ($_.Exception.InnerException) { $detail = $detail + " | " + $_.Exception.InnerException.Message }
  if ($detail) { $detail = $detail.Replace('"', "'").Replace("`r", " ").Replace("`n", " ") }
  if ($detail.Length -gt 500) { $detail = $detail.Substring(0, 500) }
  Emit-Result @{ ok = $false; af = "none"; reason = "exception"; path = "uvc"; detail = $detail }
  exit 0
}
