using System;
using System.Collections.Generic;
using System.Linq;
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
        internal static readonly object DllLock = new object();

        public static bool TryGetMachineInfo(string uid, out MachineInfo info, out string error)
        {
            info = default(MachineInfo);
            error = null;
            // 최초 시도
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            var machineInfo = new MachineInfo();
            short result;
            result = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineInfo(handle, ref machineInfo), "GetMachineInfo");
            if (result == 0)
            {
                info = machineInfo;
                return true;
            }

            // -8(무효 핸들) → Invalidate 후 1회 재시도
            if (result == -8)
            {
                Mode1HandleStore.Invalidate(uid);
                if (Mode1HandleStore.TryGetHandle(uid, out var handle2, out var err2))
                {
                    var retryInfo = new MachineInfo();
                    short result2;
                    result2 = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineInfo(handle2, ref retryInfo), "GetMachineInfo.retry");
                    if (result2 == 0)
                    {
                        info = retryInfo;
                        return true;
                    }
                    if (result2 == -8)
                    {
                        Mode1HandleStore.Invalidate(uid);
                    }
                    error = $"GetMachineInfo failed (result={result2})";
                    info = default(MachineInfo);
                    return false;
                }

                error = err2;
                info = default(MachineInfo);
                return false;
            }

            error = $"GetMachineInfo failed (result={result})";
            info = default(MachineInfo);
            return false;
        }

        public static bool TryGetMachineAllOPInfo(string uid, short panelType, out List<IOInfo> list, out string error)
        {
            list = null;
            error = null;
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            var ioList = new List<IOInfo>();
            short result;
            result = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineAllOPInfo(handle, panelType, ref ioList), "GetMachineAllOPInfo");
            if (result == 0)
            {
                list = ioList;
                return true;
            }

            // -8(무효 핸들) → Invalidate 후 1회 재시도
            if (result == -8)
            {
                Mode1HandleStore.Invalidate(uid);
                if (Mode1HandleStore.TryGetHandle(uid, out var handle2, out var err2))
                {
                    var retryList = new List<IOInfo>();
                    short result2;
                    result2 = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineAllOPInfo(handle2, panelType, ref retryList), "GetMachineAllOPInfo.retry");
                    if (result2 == 0)
                    {
                        list = retryList;
                        return true;
                    }
                    if (result2 == -8)
                    {
                        Mode1HandleStore.Invalidate(uid);
                    }
                    error = $"GetMachineAllOPInfo failed (result={result2})";
                    list = null;
                    return false;
                }

                error = err2;
                list = null;
                return false;
            }

            error = $"GetMachineAllOPInfo failed (result={result})";
            list = null;
            return false;
        }

        public static bool TrySetMachineReset(string uid, out string error)
        {
            error = null;
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            short result;
            result = HiLinkDllGate.Run(DllLock, () => HiLink.SetMachineReset(handle), "SetMachineReset");
            if (result == 0)
            {
                return true;
            }

            // -8(무효 핸들) → Invalidate 후 1회 재시도
            if (result == -8)
            {
                Mode1HandleStore.Invalidate(uid);
                if (Mode1HandleStore.TryGetHandle(uid, out var handle2, out var err2))
                {
                    short result2;
                    result2 = HiLinkDllGate.Run(DllLock, () => HiLink.SetMachineReset(handle2), "SetMachineReset.retry");
                    if (result2 == 0)
                    {
                        return true;
                    }
                    if (result2 == -8)
                    {
                        Mode1HandleStore.Invalidate(uid);
                    }
                    error = $"SetMachineReset failed (result={result2})";
                    return false;
                }

                error = err2;
                return false;
            }

            error = $"SetMachineReset failed (result={result})";
            return false;
        }

        public static bool TryDeleteMachineProgramInfo(string uid, short headType, short programNo, out int activateProgNum, out string error)
        {
            activateProgNum = 0;
            error = null;
            if (programNo <= 0)
            {
                error = "programNo must be > 0";
                return false;
            }

            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            var dto = new DeleteMachineProgramInfo
            {
                headType = headType,
                programNo = programNo,
            };

            int localActivateProgNum = 0;
            short result;
            result = HiLinkDllGate.Run(DllLock, () => HiLink.DeleteMachineProgramInfo(handle, dto, out localActivateProgNum), "DeleteMachineProgramInfo");
            if (result == 0)
            {
                activateProgNum = localActivateProgNum;
                return true;
            }

            // -8(무효 핸들) → Invalidate 후 1회 재시도
            if (result == -8)
            {
                Mode1HandleStore.Invalidate(uid);
                if (Mode1HandleStore.TryGetHandle(uid, out var handle2, out var err2))
                {
                    localActivateProgNum = 0;
                    short result2;
                    result2 = HiLinkDllGate.Run(DllLock, () => HiLink.DeleteMachineProgramInfo(handle2, dto, out localActivateProgNum), "DeleteMachineProgramInfo.retry");
                    if (result2 == 0)
                    {
                        activateProgNum = localActivateProgNum;
                        return true;
                    }
                    if (result2 == -8)
                    {
                        Mode1HandleStore.Invalidate(uid);
                    }
                    error = $"DeleteMachineProgramInfo failed (result={result2})";
                    return false;
                }

                error = err2;
                return false;
            }

            error = $"DeleteMachineProgramInfo failed (result={result})";
            return false;
        }

        public static bool TrySetMachineMode(string uid, string mode, out string error)
        {
            error = null;
            var m = (mode ?? string.Empty).Trim().ToUpperInvariant();
            var ioName = m == "EDIT" ? "MS_EDIT" : (m == "AUTO" ? "MS_AUTO" : null);
            if (string.IsNullOrEmpty(ioName))
            {
                error = "unsupported mode";
                return false;
            }

            if (!TryGetMachineInfo(uid, out var info, out error))
            {
                return false;
            }

            var panelType = info.panelType;
            if (!TryGetMachineAllOPInfo(uid, panelType, out var opList, out error))
            {
                return false;
            }

            var target = opList?.FirstOrDefault(x => x != null && string.Equals((x.IOName ?? string.Empty).Trim(), ioName, StringComparison.OrdinalIgnoreCase));
            if (target == null)
            {
                error = $"panel io not found: {ioName}";
                return false;
            }

            return TrySetMachinePanelIO(uid, panelType, target.IOUID, true, out error);
        }

        public static bool TryGetProgListInfo(string uid, short headType, out MachineProgramListInfo info, out string error)
        {
            info = default(MachineProgramListInfo);
            error = null;
            // 최초 시도
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            var listInfo = new MachineProgramListInfo { headType = headType };
            short result;
            result = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineProgramListInfo(handle, ref listInfo), "GetMachineProgramListInfo");
            if (result == 0) return true;

            // -8(무효 핸들) → Invalidate 후 1회 재시도
            if (result == -8)
            {
                Mode1HandleStore.Invalidate(uid);
                if (Mode1HandleStore.TryGetHandle(uid, out var handle2, out var err2))
                {
                    var retryInfo = new MachineProgramListInfo { headType = headType };
                    short result2;
                    result2 = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineProgramListInfo(handle2, ref retryInfo), "GetMachineProgramListInfo.retry");
                    if (result2 == 0) return true;
                    if (result2 == -8)
                    {
                        Mode1HandleStore.Invalidate(uid);
                    }
                    error = $"GetMachineProgramListInfo failed (result={result2})";
                    info = default(MachineProgramListInfo);
                    return false;
                }

                error = err2;
                info = default(MachineProgramListInfo);
                return false;
            }

            error = $"GetMachineProgramListInfo failed (result={result})";
            info = default(MachineProgramListInfo);
            return false;
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

            var activateProgInfo = new MachineProgramInfo();
            short result;
            result = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineActivateProgInfo(handle, ref activateProgInfo), "GetMachineActivateProgInfo");
            if (result == 0)
            {
                info = activateProgInfo;
                return true;
            }

            // -8(무효 핸들) → Invalidate 후 1회 재시도
            if (result == -8)
            {
                Mode1HandleStore.Invalidate(uid);
                if (Mode1HandleStore.TryGetHandle(uid, out var handle2, out var err2))
                {
                    var retryInfo = new MachineProgramInfo();
                    short result2;
                    result2 = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineActivateProgInfo(handle2, ref retryInfo), "GetMachineActivateProgInfo.retry");
                    if (result2 == 0)
                    {
                        info = retryInfo;
                        return true;
                    }
                    if (result2 == -8)
                    {
                        Mode1HandleStore.Invalidate(uid);
                    }
                    error = $"GetMachineActivateProgInfo failed (result={result2})";
                    info = default(MachineProgramInfo);
                    return false;
                }

                error = err2;
                info = default(MachineProgramInfo);
                return false;
            }

            error = $"GetMachineActivateProgInfo failed (result={result})";
            info = default(MachineProgramInfo);
            return false;
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

            var programData = new MachineProgramData
            {
                headType = headType,
                programNo = programNo,
            };
            short result;
            result = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineProgramData(handle, ref programData), "GetMachineProgramData");

            if (result == 0)
            {
                info = programData;
                return true;
            }

            // -8(무효 핸들) → Invalidate 후 1회 재시도
            if (result == -8)
            {
                Mode1HandleStore.Invalidate(uid);
                if (Mode1HandleStore.TryGetHandle(uid, out var handle2, out var err2))
                {
                    var retryInfo = new MachineProgramData
                    {
                        headType = headType,
                        programNo = programNo,
                    };
                    short result2;
                    result2 = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineProgramData(handle2, ref retryInfo), "GetMachineProgramData.retry");
                    if (result2 == 0)
                    {
                        info = retryInfo;
                        return true;
                    }
                    if (result2 == -8)
                    {
                        Mode1HandleStore.Invalidate(uid);
                    }
                    error = $"GetMachineProgramData failed (result={result2})";
                    info = default(MachineProgramData);
                    return false;
                }

                error = err2;
                info = default(MachineProgramData);
                return false;
            }

            error = $"GetMachineProgramData failed (result={result})";
            info = default(MachineProgramData);
            return false;
        }

        public static bool TryGetMachineList(out List<MachineConfigItem> list, out string error)
        {
            error = null;
            list = MachinesConfigStore.Load() ?? new List<MachineConfigItem>();
            return true;
        }

        public static bool TryGetMachineAlarmInfo(string uid, short headType, out MachineAlarmInfo info, out string error)
        {
            info = default(MachineAlarmInfo);
            error = null;

            // 1) 최초 호출
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            var alarmInfo = new MachineAlarmInfo { headType = headType };
            var result = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineAlarmInfo(handle, ref alarmInfo), "GetMachineAlarmInfo");
            if (result == 0)
            {
                info = alarmInfo;
                return true;
            }

            // 2) -8(잘못된 핸들) 이면 핸들을 폐기 후 1회 재시도
            if (result == -8)
            {
                Mode1HandleStore.Invalidate(uid);
                if (Mode1HandleStore.TryGetHandle(uid, out var handle2, out var err2))
                {
                    var retryInfo = new MachineAlarmInfo { headType = headType };
                    var result2 = HiLinkDllGate.Run(DllLock, () => HiLink.GetMachineAlarmInfo(handle2, ref retryInfo), "GetMachineAlarmInfo.retry");
                    if (result2 == 0)
                    {
                        info = retryInfo;
                        return true;
                    }
                    if (result2 == -8)
                    {
                        Mode1HandleStore.Invalidate(uid);
                    }
                    error = $"GetMachineAlarmInfo failed (result={result2})";
                    info = default(MachineAlarmInfo);
                    return false;
                }

                error = err2;
                info = default(MachineAlarmInfo);
                return false;
            }

            error = $"GetMachineAlarmInfo failed (result={result})";
            info = default(MachineAlarmInfo);
            return false;
        }

        public static bool TryGetMachineStatus(string uid, out MachineStatusType status, out string error)
        {
            status = MachineStatusType.None;
            error = null;
            
            try
            {
                var result = Mode1WorkerQueue.Run(() => GetMachineStatusInternal(uid), "GetMachineStatus", 5000);
                if (result.success)
                {
                    status = result.status;
                    return true;
                }
                error = result.error;
                return false;
            }
            catch (TimeoutException ex)
            {
                error = $"GetMachineStatus timeout: {ex.Message}";
                return false;
            }
            catch (Exception ex)
            {
                error = $"GetMachineStatus exception: {ex.Message}";
                return false;
            }
        }

        private static (bool success, MachineStatusType status, string error) GetMachineStatusInternal(string uid)
        {
            // 최초 시도
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                return (false, MachineStatusType.None, err);
            }

            var machineStatus = MachineStatusType.None;
            var result = HiLink.GetMachineStatus(handle, ref machineStatus);
            if (result == 0)
            {
                return (true, machineStatus, null);
            }

            // -8(잘못된 핸들)이면 핸들을 폐기 후 1회 재시도
            if (result == -8)
            {
                Mode1HandleStore.Invalidate(uid);
                if (Mode1HandleStore.TryGetHandle(uid, out var handle2, out var err2))
                {
                    machineStatus = MachineStatusType.None;
                    var result2 = HiLink.GetMachineStatus(handle2, ref machineStatus);
                    if (result2 == 0)
                    {
                        return (true, machineStatus, null);
                    }
                    if (result2 == -8)
                    {
                        Mode1HandleStore.Invalidate(uid);
                    }
                    return (false, MachineStatusType.None, $"GetMachineStatus failed (result={result2})");
                }

                return (false, MachineStatusType.None, err2);
            }

            return (false, MachineStatusType.None, $"GetMachineStatus failed (result={result})");
        }

        public static bool TrySetMachinePanelIO(string uid, short panelType, short ioUid, bool status, out string error)
        {
            error = null;
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            var result = HiLinkDllGate.Run(DllLock, () => HiLink.SetMachinePanelIO(handle, panelType, ioUid, status), "SetMachinePanelIO");
            if (result == 0)
            {
                return true;
            }

            // -8(무효 핸들) → Invalidate 후 1회 재시도
            if (result == -8)
            {
                Mode1HandleStore.Invalidate(uid);
                if (Mode1HandleStore.TryGetHandle(uid, out var handle2, out var err2))
                {
                    var result2 = HiLinkDllGate.Run(DllLock, () => HiLink.SetMachinePanelIO(handle2, panelType, ioUid, status), "SetMachinePanelIO.retry");
                    if (result2 == 0)
                    {
                        return true;
                    }
                    if (result2 == -8)
                    {
                        Mode1HandleStore.Invalidate(uid);
                    }
                    error = $"SetMachinePanelIO failed (result={result2})";
                    return false;
                }

                error = err2;
                return false;
            }

            error = $"SetMachinePanelIO failed (result={result})";
            return false;
        }
    }
}
