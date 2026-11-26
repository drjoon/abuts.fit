// Standalone UVC control probe/tool for Digital Microscope Camera.
// Compile: csc /nologo /platform:x64 /out:UvcTool.exe UvcTool.cs
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class UvcTool {
  const int Exposure = 4;
  const int Focus = 6;
  const int Brightness = 0;
  const int Gain = 9;
  const int Backlight = 8;
  const int FlagAuto = 0x1;
  const int FlagManual = 0x2;

  [DllImport("ole32.dll")]
  static extern int CoInitializeEx(IntPtr reserved, uint coinit);

  [DllImport("ole32.dll")]
  static extern void CoTaskMemFree(IntPtr ptr);

  [DllImport("ole32.dll")]
  static extern int CreateBindCtx(int reserved, out IntPtr ppbc);

  [DllImport("ole32.dll")]
  static extern int CoCreateInstance(
    ref Guid clsid,
    IntPtr outer,
    uint context,
    ref Guid iid,
    out IntPtr created);

  [DllImport("mfplat.dll", ExactSpelling = true)]
  static extern int MFStartup(uint version, uint flags);

  [DllImport("mfplat.dll", ExactSpelling = true)]
  static extern int MFShutdown();

  [DllImport("mfplat.dll", ExactSpelling = true)]
  static extern int MFCreateAttributes(out IntPtr attributes, uint initialSize);

  [DllImport("mf.dll", ExactSpelling = true)]
  static extern int MFEnumDeviceSources(IntPtr attributes, out IntPtr activates, out int count);

  [ComImport, Guid("00000000-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IUnknownStub { }

  [ComImport, Guid("2CD2D921-C447-44A7-A13C-4ADABFC247E3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMFAttributes {
    void GetItem(); void GetItemType(); void CompareItem(); void Compare();
    void GetUINT32(); void GetUINT64(); void GetDouble(); void GetGUID();
    void GetStringLength(); void GetString();
    [PreserveSig] int GetAllocatedString(ref Guid key, out IntPtr str, out int length);
    void GetBlobSize(); void GetBlob(); void GetAllocatedBlob(); void GetUnknown();
    void SetItem(); void DeleteItem(); void DeleteAllItems();
    void SetUINT32(); void SetUINT64(); void SetDouble();
    [PreserveSig] int SetGUID(ref Guid key, ref Guid value);
    void SetString(); void SetBlob(); void SetUnknown();
    void LockStore(); void UnlockStore(); void GetCount(); void GetItemByIndex(); void CopyAllItems();
  }

  [ComImport, Guid("7FEE9E9A-4A89-47a6-899C-B6A53A70FB67"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMFActivate {
    // IMFAttributes
    void GetItem(); void GetItemType(); void CompareItem(); void Compare();
    void GetUINT32(); void GetUINT64(); void GetDouble(); void GetGUID();
    void GetStringLength(); void GetString();
    [PreserveSig] int GetAllocatedString(ref Guid key, out IntPtr str, out int length);
    void GetBlobSize(); void GetBlob(); void GetAllocatedBlob(); void GetUnknown();
    void SetItem(); void DeleteItem(); void DeleteAllItems();
    void SetUINT32(); void SetUINT64(); void SetDouble();
    [PreserveSig] int SetGUID(ref Guid key, ref Guid value);
    void SetString(); void SetBlob(); void SetUnknown();
    void LockStore(); void UnlockStore(); void GetCount(); void GetItemByIndex(); void CopyAllItems();
    // IMFActivate
    [PreserveSig] int ActivateObject(ref Guid iid, out IntPtr ppv);
    [PreserveSig] int ShutdownObject();
    [PreserveSig] int DetachObject();
  }

  [ComImport, Guid("29840822-5B84-11D0-BD3B-00A0C911CE86"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ICreateDevEnum {
    [PreserveSig] int CreateClassEnumerator(ref Guid type, out IEnumMoniker monikers, int flags);
  }

  [ComImport, Guid("00000102-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IEnumMoniker {
    [PreserveSig] int Next(int celt, [MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 0)] IMoniker[] rgelt, IntPtr fetched);
    [PreserveSig] int Skip(int celt);
    [PreserveSig] int Reset();
    [PreserveSig] int Clone(out IEnumMoniker clone);
  }

  [ComImport, Guid("0000000f-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMoniker {
    void GetClassID(); void IsDirty(); void Load(); void Save(); void GetSizeMax();
    [PreserveSig] int BindToObject(IntPtr bindCtx, IntPtr left, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object obj);
    [PreserveSig] int BindToStorage(IntPtr bindCtx, IntPtr left, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object obj);
  }

  [ComImport, Guid("55272A00-42CB-11CE-8135-00AA004BB851"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyBag {
    [PreserveSig] int Read([MarshalAs(UnmanagedType.LPWStr)] string name, ref object value, IntPtr errorLog);
    [PreserveSig] int Write([MarshalAs(UnmanagedType.LPWStr)] string name, ref object value);
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

  static bool LongExposure(IAMCameraControl cam, out string how) {
    how = "skip";
    if (cam == null) return false;
    int min, max, step, def, caps;
    if (cam.GetRange(Exposure, out min, out max, out step, out def, out caps) != 0) return false;
    // Lower exposure value => longer shutter => brighter for most UVC cams.
    if (cam.Set(Exposure, min, FlagManual) == 0) { how = "manual-" + min; return true; }
    if ((caps & FlagAuto) != 0 && cam.Set(Exposure, 0, FlagAuto) == 0) { how = "auto"; return true; }
    return false;
  }

  static bool AutoFocus(IAMCameraControl cam, out string how) {
    how = "skip";
    if (cam == null) return false;
    if (cam.Set(Focus, 0, FlagAuto) == 0) { how = "auto"; return true; }
    int min, max, step, def, caps;
    if (cam.GetRange(Focus, out min, out max, out step, out def, out caps) != 0) return false;
    int mid = min + ((max - min) / 2);
    if (cam.Set(Focus, mid, FlagManual) != 0) return false;
    how = "manual-" + mid;
    return true;
  }

  static bool MaxAmp(IAMVideoProcAmp amp, int prop, out string how, out int level, out int maxOut) {
    how = "skip"; level = 0; maxOut = 0;
    if (amp == null) return false;
    int min, max, step, def, caps;
    if (amp.GetRange(prop, out min, out max, out step, out def, out caps) != 0) return false;
    maxOut = max;
    if (amp.Set(prop, max, FlagManual) != 0) return false;
    how = "manual-" + max;
    level = max;
    return true;
  }

  static string Apply(object source, string deviceName, string path) {
    IAMCameraControl cam = source as IAMCameraControl;
    IAMVideoProcAmp amp = source as IAMVideoProcAmp;
    string focusHow, exposureHow, brightHow, gainHow, backHow;
    int brightLevel, brightMax, gainLevel, gainMax, unusedL, unusedM;
    bool focusOk = AutoFocus(cam, out focusHow);
    bool exposureOk = LongExposure(cam, out exposureHow);
    bool brightOk = MaxAmp(amp, Brightness, out brightHow, out brightLevel, out brightMax);
    bool gainOk = MaxAmp(amp, Gain, out gainHow, out gainLevel, out gainMax);
    MaxAmp(amp, Backlight, out backHow, out unusedL, out unusedM);
    bool ok = focusOk || exposureOk || brightOk || gainOk;
    return "{\"ok\":" + (ok ? "true" : "false")
      + ",\"af\":\"" + (focusOk ? "done" : (ok ? "accepted" : "none")) + "\""
      + ",\"reason\":\"" + (ok ? "" : "uvc-none") + "\""
      + ",\"path\":\"" + path + "\""
      + ",\"device\":\"" + Esc(deviceName) + "\""
      + ",\"cam\":" + (cam != null ? "true" : "false")
      + ",\"amp\":" + (amp != null ? "true" : "false")
      + ",\"focus\":\"" + focusHow + "\""
      + ",\"exposure\":\"" + exposureHow + "\""
      + ",\"brightness\":\"" + brightHow + "\""
      + ",\"brightLevel\":" + brightLevel
      + ",\"brightMax\":" + brightMax
      + ",\"gain\":\"" + gainHow + "\""
      + ",\"gainLevel\":" + gainLevel
      + ",\"gainMax\":" + gainMax + "}";
  }

  static string TryDshow(string preferred) {
    Guid clsid = new Guid(0x62BE5D10, 0x60EB, 0x11d0, 0xBD, 0x3B, 0x00, 0xA0, 0xC9, 0x11, 0xCE, 0x86);
    Guid iid = new Guid(0x29840822, 0x5B84, 0x11D0, 0xBD, 0x3B, 0x00, 0xA0, 0xC9, 0x11, 0xCE, 0x86);
    Guid video = new Guid(0x860BB310, 0x5D01, 0x11d0, 0xBD, 0x3B, 0x00, 0xA0, 0xC9, 0x11, 0xCE, 0x86);
    Guid iidFilter = new Guid(0x56A86895, 0x0AD4, 0x11CE, 0xB0, 0x3A, 0x00, 0x20, 0xAF, 0x0B, 0xA7, 0x70);
    Guid iidBag = new Guid(0x55272A00, 0x42CB, 0x11CE, 0x81, 0x35, 0x00, 0xAA, 0x00, 0x4B, 0xB8, 0x51);

    IntPtr punk;
    int created = CoCreateInstance(ref clsid, IntPtr.Zero, 1, ref iid, out punk);
    if (created != 0 || punk == IntPtr.Zero) {
      created = CoCreateInstance(ref clsid, IntPtr.Zero, 23, ref iid, out punk);
    }
    if (created != 0 || punk == IntPtr.Zero) {
      try {
        Type t = Type.GetTypeFromCLSID(clsid, true);
        object obj = Activator.CreateInstance(t);
        ICreateDevEnum alt = obj as ICreateDevEnum;
        if (alt == null) return "{\"ok\":false,\"reason\":\"cocreate-" + created.ToString("X8") + "\",\"path\":\"dshow\"}";
        return EnumDshow(alt, preferred, video, iidFilter, iidBag);
      } catch (Exception ex) {
        return "{\"ok\":false,\"reason\":\"cocreate-" + created.ToString("X8") + "\",\"path\":\"dshow\",\"detail\":\"" + Esc(ex.GetType().Name + " " + ex.Message) + "\"}";
      }
    }
    try {
      ICreateDevEnum devenum = (ICreateDevEnum)Marshal.GetObjectForIUnknown(punk);
      return EnumDshow(devenum, preferred, video, iidFilter, iidBag);
    } finally {
      Marshal.Release(punk);
    }
  }

  static string EnumDshow(ICreateDevEnum devenum, string preferred, Guid video, Guid iidFilter, Guid iidBag) {
    IEnumMoniker monikers;
    int hr = devenum.CreateClassEnumerator(ref video, out monikers, 0);
    if (hr != 0 || monikers == null) return "{\"ok\":false,\"reason\":\"no-device\",\"path\":\"dshow\",\"hr\":" + hr + "}";
    string want = preferred == null ? "" : preferred.Trim();
    IMoniker[] one = new IMoniker[1];
    object chosen = null;
    string chosenName = "";
    StringBuilder trace = new StringBuilder();
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
        if (trace.Length > 0) trace.Append("|");
        trace.Append(Esc(name));
        bool match = want.Length == 0 || name.IndexOf(want, StringComparison.OrdinalIgnoreCase) >= 0;
        int bindHr = moniker.BindToObject(bc, IntPtr.Zero, ref iidFilter, out filter);
        trace.Append(":bind=").Append(bindHr.ToString("X8"));
        if (!match) continue;
        if (bindHr != 0 || filter == null) continue;
        chosen = filter;
        chosenName = name;
        filter = null;
        break;
      } finally {
        if (filter != null) try { Marshal.ReleaseComObject(filter); } catch { }
        if (bagObj != null) try { Marshal.ReleaseComObject(bagObj); } catch { }
        if (bc != IntPtr.Zero) Marshal.Release(bc);
        try { Marshal.ReleaseComObject(moniker); } catch { }
        one[0] = null;
      }
    }
    try { Marshal.ReleaseComObject(monikers); } catch { }
    if (chosen == null) {
      return "{\"ok\":false,\"reason\":\"bind-failed\",\"path\":\"dshow\",\"detail\":\"" + trace.ToString() + "\"}";
    }
    try {
      return Apply(chosen, chosenName, "dshow");
    } finally {
      try { Marshal.ReleaseComObject(chosen); } catch { }
    }
  }

  static string TryMf(string preferred) {
    int started = MFStartup(0x00020070, 1);
    if (started != 0) return "{\"ok\":false,\"reason\":\"startup-" + started.ToString("X8") + "\",\"path\":\"mf\"}";
    IntPtr attrPunk = IntPtr.Zero;
    IntPtr list = IntPtr.Zero;
    int count = 0;
    try {
      int created = MFCreateAttributes(out attrPunk, 1);
      if (created != 0 || attrPunk == IntPtr.Zero) return "{\"ok\":false,\"reason\":\"attr-" + created.ToString("X8") + "\",\"path\":\"mf\"}";
      IMFAttributes attrs = (IMFAttributes)Marshal.GetObjectForIUnknown(attrPunk);
      Guid key = new Guid("c60ac5fe-252a-478f-a0ef-bc8fa5f7cad3");
      Guid vid = new Guid("8ac3587a-4ae7-42d8-99e0-0a6013eef90f");
      int set = attrs.SetGUID(ref key, ref vid);
      if (set != 0) return "{\"ok\":false,\"reason\":\"setguid-" + set.ToString("X8") + "\",\"path\":\"mf\"}";
      int enumerated = MFEnumDeviceSources(attrPunk, out list, out count);
      if (enumerated != 0) return "{\"ok\":false,\"reason\":\"enum-" + enumerated.ToString("X8") + "\",\"path\":\"mf\"}";
      if (count <= 0 || list == IntPtr.Zero) return "{\"ok\":false,\"reason\":\"none\",\"path\":\"mf\"}";
      string want = preferred == null ? "" : preferred.Trim();
      Guid nameKey = new Guid("60d0e559-52f8-4fa2-bbce-acdb34a8ec01");
      Guid mediaSource = new Guid(0x279A653D, 0xD0F6, 0x4653, 0x97, 0x6B, 0xF1, 0x62, 0xD3, 0x20, 0x65, 0x43);
      string last = "";
      int limit = count > 16 ? 16 : count;
      for (int i = 0; i < limit; i++) {
        IntPtr activatePtr = Marshal.ReadIntPtr(list, i * IntPtr.Size);
        if (activatePtr == IntPtr.Zero) continue;
        IMFActivate activate = null;
        object source = null;
        try {
          activate = (IMFActivate)Marshal.GetObjectForIUnknown(activatePtr);
          string name = "";
          IntPtr wide; int length;
          if (activate.GetAllocatedString(ref nameKey, out wide, out length) == 0 && wide != IntPtr.Zero) {
            name = Marshal.PtrToStringUni(wide);
            CoTaskMemFree(wide);
          }
          bool match = want.Length == 0 || (name != null && name.IndexOf(want, StringComparison.OrdinalIgnoreCase) >= 0);
          if (!match) continue;
          IntPtr sourcePtr;
          Guid unknown = new Guid(0x00000000, 0x0000, 0x0000, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46);
          int activated = activate.ActivateObject(ref mediaSource, out sourcePtr);
          string iidUsed = "mediasource";
          if (activated != 0 || sourcePtr == IntPtr.Zero) {
            activated = activate.ActivateObject(ref unknown, out sourcePtr);
            iidUsed = "iunknown";
          }
          if (activated != 0 || sourcePtr == IntPtr.Zero) {
            last = "activate-" + activated.ToString("X8") + " name=" + Esc(name) + " iid=" + iidUsed;
            continue;
          }
          source = Marshal.GetObjectForIUnknown(sourcePtr);
          Marshal.Release(sourcePtr);
          string json = Apply(source, name, "mf");
          try { activate.ShutdownObject(); } catch { }
          return json;
        } finally {
          if (source != null) try { Marshal.ReleaseComObject(source); } catch { }
          if (activate != null) try { Marshal.ReleaseComObject(activate); } catch { }
          Marshal.Release(activatePtr);
        }
      }
      return "{\"ok\":false,\"reason\":\"no-match\",\"path\":\"mf\",\"detail\":\"" + Esc(last) + "\"}";
    } finally {
      if (list != IntPtr.Zero) CoTaskMemFree(list);
      if (attrPunk != IntPtr.Zero) Marshal.Release(attrPunk);
      MFShutdown();
    }
  }

  public static int Main(string[] args) {
    string preferred = args.Length > 0 ? args[0] : "Digital Microscope";
    CoInitializeEx(IntPtr.Zero, 2);
    string mf = TryMf(preferred);
    if (mf.IndexOf("\"ok\":true") >= 0) {
      Console.WriteLine(mf);
      return 0;
    }
    string ds = TryDshow(preferred);
    if (ds.IndexOf("\"ok\":true") >= 0) {
      Console.WriteLine(ds);
      return 0;
    }
    Console.WriteLine("{\"ok\":false,\"mf\":" + mf + ",\"dshow\":" + ds + "}");
    return 1;
  }
}
