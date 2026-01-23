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
        public static bool TryGetMachineInfo(string uid, out MachineInfo info, out string error)
        {
            info = default(MachineInfo);
            error = null;
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            for (var attempt = 0; attempt < 2; attempt++)
            {
                info = new MachineInfo();
                var result = HiLink.GetMachineInfo(handle, ref info);
                if (result == 0)
                {
                    return true;
                }

                if (result == -8 && attempt == 0)
                {
                    Mode1HandleStore.Invalidate(uid);
                    if (!Mode1HandleStore.TryGetHandle(uid, out handle, out err))
                    {
                        error = err;
                        info = default(MachineInfo);
                        return false;
                    }
                    continue;
                }

                error = $"GetMachineInfo failed (result={result})";
                info = default(MachineInfo);
                return false;
            }

            error = "GetMachineInfo failed";
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

            for (var attempt = 0; attempt < 2; attempt++)
            {
                list = new List<IOInfo>();
                var result = HiLink.GetMachineAllOPInfo(handle, panelType, ref list);
                if (result == 0)
                {
                    return true;
                }

                if (result == -8 && attempt == 0)
                {
                    Mode1HandleStore.Invalidate(uid);
                    if (!Mode1HandleStore.TryGetHandle(uid, out handle, out err))
                    {
                        error = err;
                        list = null;
                        return false;
                    }
                    continue;
                }

                error = $"GetMachineAllOPInfo failed (result={result})";
                list = null;
                return false;
            }

            error = "GetMachineAllOPInfo failed";
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

            for (var attempt = 0; attempt < 2; attempt++)
            {
                var result = HiLink.SetMachineReset(handle);
                if (result == 0)
                {
                    return true;
                }

                if (result == -8 && attempt == 0)
                {
                    Mode1HandleStore.Invalidate(uid);
                    if (!Mode1HandleStore.TryGetHandle(uid, out handle, out err))
                    {
                        error = err;
                        return false;
                    }
                    continue;
                }

                error = $"SetMachineReset failed (result={result})";
                return false;
            }

            error = "SetMachineReset failed";
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

            for (var attempt = 0; attempt < 2; attempt++)
            {
                var dto = new DeleteMachineProgramInfo
                {
                    headType = headType,
                    programNo = programNo,
                };

                var result = HiLink.DeleteMachineProgramInfo(handle, dto, out activateProgNum);
                if (result == 0)
                {
                    return true;
                }

                if (result == -8 && attempt == 0)
                {
                    Mode1HandleStore.Invalidate(uid);
                    if (!Mode1HandleStore.TryGetHandle(uid, out handle, out err))
                    {
                        error = err;
                        return false;
                    }
                    continue;
                }

                error = $"DeleteMachineProgramInfo failed (result={result})";
                return false;
            }

            error = "DeleteMachineProgramInfo failed";
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
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            // -8 무효 핸들 대응: 최대 2회 시도
            for (var attempt = 0; attempt < 2; attempt++)
            {
                info = new MachineProgramListInfo { headType = headType };
                var result = HiLink.GetMachineProgramListInfo(handle, ref info);
                if (result == 0) return true;

                if (result == -8 && attempt == 0)
                {
                    Mode1HandleStore.Invalidate(uid);
                    if (!Mode1HandleStore.TryGetHandle(uid, out handle, out err))
                    {
                        error = err;
                        info = default(MachineProgramListInfo);
                        return false;
                    }
                    continue;
                }

                error = $"GetMachineProgramListInfo failed (result={result})";
                info = default(MachineProgramListInfo);
                return false;
            }

            error = "GetMachineProgramListInfo failed";
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

            // 일부 환경에서 캐시된 handler가 무효(-8)로 떨어지는 경우가 있어 1회 재시도한다.
            for (var attempt = 0; attempt < 2; attempt++)
            {
                info = new MachineProgramInfo();
                var result = HiLink.GetMachineActivateProgInfo(handle, ref info);
                if (result == 0)
                {
                    return true;
                }

                if (result == -8 && attempt == 0)
                {
                    Mode1HandleStore.Invalidate(uid);
                    if (!Mode1HandleStore.TryGetHandle(uid, out handle, out err))
                    {
                        error = err;
                        info = default(MachineProgramInfo);
                        return false;
                    }
                    continue;
                }

                error = $"GetMachineActivateProgInfo failed (result={result})";
                info = default(MachineProgramInfo);
                return false;
            }

            error = "GetMachineActivateProgInfo failed";
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

        public static bool TryGetMachineAlarmInfo(string uid, short headType, out MachineAlarmInfo info, out string error)
        {
            info = default(MachineAlarmInfo);
            error = null;
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            // 일부 환경에서 캐시된 handler가 무효(-8)로 떨어지는 경우가 있어 1회 재시도한다.
            for (var attempt = 0; attempt < 2; attempt++)
            {
                info = new MachineAlarmInfo { headType = headType };
                var result = HiLink.GetMachineAlarmInfo(handle, ref info);
                if (result == 0)
                {
                    return true;
                }

                if (result == -8 && attempt == 0)
                {
                    Mode1HandleStore.Invalidate(uid);
                    if (!Mode1HandleStore.TryGetHandle(uid, out handle, out err))
                    {
                        error = err;
                        info = default(MachineAlarmInfo);
                        return false;
                    }
                    continue;
                }

                error = $"GetMachineAlarmInfo failed (result={result})";
                info = default(MachineAlarmInfo);
                return false;
            }

            error = "GetMachineAlarmInfo failed";
            info = default(MachineAlarmInfo);
            return false;
        }

        public static bool TryGetMachineStatus(string uid, out MachineStatusType status, out string error)
        {
            status = MachineStatusType.None;
            error = null;
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            for (var attempt = 0; attempt < 2; attempt++)
            {
                var result = HiLink.GetMachineStatus(handle, ref status);
                if (result == 0)
                {
                    return true;
                }

                if (result == -8 && attempt == 0)
                {
                    Mode1HandleStore.Invalidate(uid);
                    if (!Mode1HandleStore.TryGetHandle(uid, out handle, out err))
                    {
                        error = err;
                        return false;
                    }
                    continue;
                }

                error = $"GetMachineStatus failed (result={result})";
                return false;
            }

            error = "GetMachineStatus failed";
            return false;
        }

        public static bool TrySetMachinePanelIO(string uid, short panelType, short ioUid, bool status, out string error)
        {
            error = null;
            if (!Mode1HandleStore.TryGetHandle(uid, out var handle, out var err))
            {
                error = err;
                return false;
            }

            for (var attempt = 0; attempt < 2; attempt++)
            {
                var result = HiLink.SetMachinePanelIO(handle, panelType, ioUid, status);
                if (result == 0)
                {
                    return true;
                }

                if (result == -8 && attempt == 0)
                {
                    Mode1HandleStore.Invalidate(uid);
                    if (!Mode1HandleStore.TryGetHandle(uid, out handle, out err))
                    {
                        error = err;
                        return false;
                    }
                    continue;
                }

                error = $"SetMachinePanelIO failed (result={result})";
                return false;
            }

            error = "SetMachinePanelIO failed";
            return false;
        }
    }
}
