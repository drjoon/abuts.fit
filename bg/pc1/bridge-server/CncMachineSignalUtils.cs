using System;
using System.Collections.Generic;
using Hi_Link;
using Hi_Link.Libraries.Model;
using System.Text;

namespace HiLinkBridgeWebApi48
{
    internal static class CncMachineSignalUtils
    {
        private static readonly object PanelIoDumpLock = new object();
        private static readonly HashSet<string> PanelIoDumpedMachines = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        internal static void DumpPanelIoSnapshotAtStartup()
        {
            try
            {
                var machines = MachinesConfigStore.Load() ?? new List<HiLinkBridgeWebApi48.Models.MachineConfigItem>();
                if (machines.Count == 0)
                {
                    Console.WriteLine("[CncSignal] startup panel io dump skipped: machines.json is empty");
                    return;
                }

                Console.WriteLine("[CncSignal] startup panel io dump started machines={0}", machines.Count);
                foreach (var machine in machines)
                {
                    var mid = (machine?.uid ?? string.Empty).Trim();
                    if (string.IsNullOrEmpty(mid)) continue;

                    if (!Mode1Api.TryGetMachineInfo(mid, out var machineInfo, out var infoError))
                    {
                        Console.WriteLine("[CncSignal] startup panel io dump failed machine={0} err={1}", mid, infoError);
                        continue;
                    }

                    if (!Mode1Api.TryGetMachineAllOPInfo(mid, machineInfo.panelType, out var panelList, out var panelError))
                    {
                        Console.WriteLine("[CncSignal] startup panel io dump failed machine={0} panelType={1} err={2}", mid, machineInfo.panelType, panelError);
                        continue;
                    }

                    var sb = new StringBuilder();
                    if (panelList != null)
                    {
                        foreach (var io in panelList)
                        {
                            if (io == null) continue;
                            if (sb.Length > 0) sb.Append(" | ");
                            sb.Append(io.IOUID)
                              .Append(':')
                              .Append(io.IOName)
                              .Append('=')
                              .Append(io.Status);
                        }
                    }

                    Console.WriteLine("[CncSignal] startup panel io snapshot machine={0} panelType={1} list={2}", mid, machineInfo.panelType, sb.ToString());
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncSignal] startup panel io dump error: {0}", ex.Message);
            }
        }

        internal static bool TryGetMachineBusy(string machineId, out bool isBusy)
        {
            isBusy = false;
            try
            {
                var busyIoUid = Config.CncBusyIoUid;
                if (busyIoUid < 0) return false;

                if (!Mode1Api.TryGetMachineInfo(machineId, out var machineInfo, out var infoError))
                {
                    Console.WriteLine("[CncSignal] busy read failed machine={0} err={1}", (machineId ?? string.Empty).Trim(), infoError);
                    return false;
                }

                var panelType = machineInfo.panelType;
                if (!Mode1Api.TryGetMachineAllOPInfo(machineId, panelType, out var panelList, out var error))
                {
                    Console.WriteLine("[CncSignal] busy read failed machine={0} panelType={1} err={2}", (machineId ?? string.Empty).Trim(), panelType, error);
                    return false;
                }
                if (panelList == null) return false;

                var mid = (machineId ?? string.Empty).Trim();
                var shouldDump = false;
                lock (PanelIoDumpLock)
                {
                    if (!PanelIoDumpedMachines.Contains(mid))
                    {
                        PanelIoDumpedMachines.Add(mid);
                        shouldDump = true;
                    }
                }
                if (shouldDump)
                {
                    var sb = new StringBuilder();
                    for (var i = 0; i < panelList.Count; i++)
                    {
                        var io = panelList[i];
                        if (io == null) continue;
                        if (sb.Length > 0) sb.Append(" | ");
                        sb.Append(io.IOUID)
                          .Append(':')
                          .Append(io.IOName)
                          .Append('=')
                          .Append(io.Status);
                    }
                    Console.WriteLine("[CncSignal] panel io snapshot machine={0} panelType={1} list={2}", mid, panelType, sb.ToString());
                }

                foreach (var io in panelList)
                {
                    if (io != null && io.IOUID == (short)busyIoUid)
                    {
                        isBusy = io.Status != 0;
                        Console.WriteLine("[CncSignal] busy read machine={0} panelType={1} busyIoUid={2} busyIoName={3} busyIoStatus={4} isBusy={5}", mid, panelType, io.IOUID, io.IOName, io.Status, isBusy);
                        return true;
                    }
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        internal static bool TryGetProductCount(string machineId, out int count)
        {
            count = 0;
            try
            {
                if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var err))
                {
                    return false;
                }
                var prodInfo = new MachineProductInfo();

                short rc;
                rc = HiLinkDllGate.Run(Mode1Api.DllLock, () => HiLink.GetMachineProductInfo(handle, ref prodInfo), "GetMachineProductInfo");

                if (rc != 0) return false;
                var prodCount = prodInfo.currentProdCount;
                if (prodCount < int.MinValue) prodCount = int.MinValue;
                if (prodCount > int.MaxValue) prodCount = int.MaxValue;
                count = (int)prodCount;
                return true;
            }
            catch
            {
                return false;
            }
        }

        internal static int? TryGetActiveProgramNo(string machineId)
        {
            try
            {
                if (!Mode1Api.TryGetActivateProgInfo(machineId, out var info, out var error))
                {
                    return null;
                }

                var name = (info.MainProgramName ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(name))
                {
                    name = (info.SubProgramName ?? string.Empty).Trim();
                }
                if (string.IsNullOrEmpty(name)) return null;
                var upper = name.ToUpperInvariant();
                var m = System.Text.RegularExpressions.Regex.Match(upper, @"O(\d{1,5})");
                if (m.Success && int.TryParse(m.Groups[1].Value, out var n) && n > 0) return n;
                var digits = System.Text.RegularExpressions.Regex.Match(name, @"(\d{1,5})");
                if (digits.Success && int.TryParse(digits.Groups[1].Value, out var n2) && n2 > 0) return n2;
                return null;
            }
            catch
            {
                return null;
            }
        }
    }
}
