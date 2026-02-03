using System;
using System.Collections.Generic;
using Hi_Link;
using Hi_Link.Libraries.Model;

namespace HiLinkBridgeWebApi48
{
    internal static class CncMachineSignalUtils
    {
        internal static bool TryGetMachineBusy(string machineId, out bool isBusy)
        {
            isBusy = false;
            try
            {
                var busyIoUid = Config.CncBusyIoUid;
                if (busyIoUid < 0) return false;

                if (!Mode1Api.TryGetMachineAllOPInfo(machineId, 0, out var panelList, out var error))
                {
                    return false;
                }
                if (panelList == null) return false;
                foreach (var io in panelList)
                {
                    if (io != null && io.IOUID == (short)busyIoUid)
                    {
                        isBusy = io.Status != 0;
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
