using System;
using System.Collections.Concurrent;
using Hi_Link;
using Hi_Link.Libraries.Model;
using PayloadUpdateActivateProg = Hi_Link.Libraries.Model.UpdateMachineActivateProgNo;

namespace HiLinkBridgeWebApi48
{
    /// <summary>
    /// Hi-Link Mode1 핸들을 장비별로 캐시하여 SetActivateProgram 등 단일 호출을 지원한다.
    /// </summary>
    public static class Mode1HandleStore
    {
        private static readonly ConcurrentDictionary<string, ushort> Handles = new ConcurrentDictionary<string, ushort>();
        private static readonly ConcurrentDictionary<string, bool> Enabled = new ConcurrentDictionary<string, bool>();

        private static (string ip, int port)? FindMachine(string uid)
        {
            var list = MachinesConfigStore.Load();
            var m = list.Find(x => x != null && string.Equals(x.uid, uid, StringComparison.OrdinalIgnoreCase));
            if (m == null) return null;
            return (m.ip, m.port);
        }

        private static string GetSerial()
        {
            var serial = Environment.GetEnvironmentVariable("BRIDGE_SERIAL") ?? string.Empty;
            return serial.Trim();
        }

        public static bool TryGetHandle(string uid, out ushort handle, out string error)
        {
            error = null;
            handle = 0;
            if (string.IsNullOrWhiteSpace(uid))
            {
                error = "uid is required";
                return false;
            }

            if (Handles.TryGetValue(uid, out handle))
            {
                return true;
            }

            var mp = FindMachine(uid);
            if (mp == null)
            {
                error = $"machine not found for uid={uid}";
                return false;
            }

            var serial = GetSerial();
            if (string.IsNullOrWhiteSpace(serial))
            {
                error = "BRIDGE_SERIAL is not set";
                return false;
            }

            bool enable;
            var result = HiLink.OpenMachineHandle(serial, mp.Value.ip, (ushort)mp.Value.port, 3, out handle, out enable);
            if (result != 0 || handle == 0)
            {
                error = $"OpenMachineHandle failed (result={result})";
                return false;
            }

            Handles[uid] = handle;
            Enabled[uid] = enable;
            return true;
        }

        public static short SetActivateProgram(string uid, PayloadUpdateActivateProg dto, out string error)
        {
            error = null;
            if (dto.programNo <= 0)
            {
                error = "invalid payload (programNo must be > 0)";
                return -1;
            }

            if (!TryGetHandle(uid, out var handle, out error))
            {
                return -1;
            }

            return HiLink.SetActivateProgram(handle, dto);
        }
    }
}
