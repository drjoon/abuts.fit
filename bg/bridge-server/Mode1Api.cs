using System;
using System.Collections.Generic;
using Hi_Link;
using Hi_Link.Libraries.Model;
using HiLinkBridgeWebApi48.Models;

namespace HiLinkBridgeWebApi48
{
    /// <summary>
    /// Hi-Link Mode1 직접 호출 래퍼.
    /// </summary>
    public static class Mode1Api
    {
        public static bool TryGetProgListInfo(string uid, short headType, out MachineProgramListInfo info, out string error)
        {
            info = default(MachineProgramListInfo);
            error = null;
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            info = new MachineProgramListInfo { headType = headType };
            var result = HiLink.GetMachineProgramListInfo(handle, ref info);
            if (result != 0)
            {
                error = $"GetMachineProgramListInfo failed (result={result})";
                info = default(MachineProgramListInfo);
                return false;
            }
            return true;
        }

        public static bool TryGetActivateProgInfo(string uid, out MachineProgramInfo info, out string error)
        {
            info = default(MachineProgramInfo);
            error = null;
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            info = new MachineProgramInfo();
            var result = HiLink.GetMachineActivateProgInfo(handle, ref info);
            if (result != 0)
            {
                error = $"GetMachineActivateProgInfo failed (result={result})";
                info = default(MachineProgramInfo);
                return false;
            }
            return true;
        }

        public static bool TryGetProgDataInfo(string uid, short headType, short programNo, out MachineProgramData info, out string error)
        {
            info = default(MachineProgramData);
            error = null;
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            info = new MachineProgramData
            {
                headType = headType,
                programNo = programNo,
            };
            var result = HiLink.GetMachineProgramData(handle, ref info);
            if (result != 0)
            {
                error = $"GetMachineProgramData failed (result={result})";
                info = default(MachineProgramData);
                return false;
            }
            return true;
        }

        public static bool TryGetMachineList(out List<MachineConfigItem> list, out string error)
        {
            error = null;
            list = MachinesConfigStore.Load() ?? new List<MachineConfigItem>();
            return true;
        }
    }
}
