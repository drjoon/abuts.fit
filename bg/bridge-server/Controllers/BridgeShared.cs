using Hi_Link.Libraries.Model;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace HiLinkBridgeWebApi48.Controllers
{
    public class JobResult
    {
        public string JobId { get; set; }
        public string Status { get; set; }
        public object Result { get; set; }
        public DateTime CreatedAtUtc { get; set; }
    }

    public static class BridgeShared
    {
        public static readonly ConcurrentDictionary<string, DateTime> ControlCooldowns = new ConcurrentDictionary<string, DateTime>();
        public static readonly ConcurrentDictionary<string, DateTime> RawReadCooldowns = new ConcurrentDictionary<string, DateTime>();
        public static readonly TimeSpan ControlCooldownWindow = TimeSpan.FromMilliseconds(5000);
        public static readonly TimeSpan RawReadCooldownWindow = TimeSpan.FromMilliseconds(2000);

        public const int SINGLE_SLOT = 4000;
        public static readonly Regex FanucRegex = new Regex(@"O(\d{1,5})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public static readonly ConcurrentDictionary<string, JobResult> JobResults = new ConcurrentDictionary<string, JobResult>();

        public static string EnsureProgramHeader(string content, int programNo)
        {
            if (string.IsNullOrEmpty(content)) return content;
            var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None);
            if (lines.Length == 0) return content;
            var header = $"O{programNo.ToString().PadLeft(4, '0')}";
            int idx = 0;
            while (idx < lines.Length)
            {
                var t = (lines[idx] ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(t)) { idx++; continue; }
                if (t == "%") { idx++; continue; }
                break;
            }
            if (idx < lines.Length)
            {
                var cur = (lines[idx] ?? string.Empty).Trim();
                var m = FanucRegex.Match(cur);
                if (m.Success)
                {
                    if (int.TryParse(m.Groups[1].Value, out var existing) && existing == programNo) return content;
                    lines[idx] = header;
                    return string.Join("\r\n", lines);
                }
                var list = lines.ToList();
                list.Insert(idx, header);
                return string.Join("\r\n", list);
            }
            return header + "\r\n" + content;
        }

        public static string EnsureProgramEnvelope(string content)
        {
            if (string.IsNullOrEmpty(content)) return content;
            var trimmed = content.Trim();
            if (string.IsNullOrEmpty(trimmed)) return content;
            var startsWithPercent = trimmed.StartsWith("%", StringComparison.Ordinal);
            var endsWithPercent = trimmed.EndsWith("%", StringComparison.Ordinal);
            var result = trimmed;
            if (!startsWithPercent) result = "%\r\n" + result;
            if (!endsWithPercent) result = result + "\r\n%";
            return result;
        }

        public static string EnsurePercentAndHeaderSecondLine(string content, int programNo)
        {
            if (string.IsNullOrEmpty(content)) return content;
            var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None).Select(x => x ?? string.Empty).ToList();
            while (lines.Count > 0 && string.IsNullOrWhiteSpace(lines[0])) lines.RemoveAt(0);
            var header = $"O{programNo.ToString().PadLeft(4, '0')}";
            if (lines.Count == 0) return "%\r\n" + header + "\r\n%";
            if ((lines[0] ?? string.Empty).Trim() != "%") lines.Insert(0, "%");
            while (lines.Count > 1 && string.IsNullOrWhiteSpace(lines[1])) lines.RemoveAt(1);
            if (lines.Count == 1) lines.Add(header);
            else lines[1] = header;
            return string.Join("\r\n", lines);
        }

        public static void QueueUploadProgramData(string machineId, short headType, int slotNo, string processed, bool isNew)
        {
            Task.Run(() =>
            {
                try
                {
                    try { Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)slotNo, out var _, out var _); } catch { }
                    if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                    {
                        Console.WriteLine("[SmartUpload] handle error: " + errUp);
                        return;
                    }
                    var info = new UpdateMachineProgramInfo
                    {
                        headType = headType,
                        programNo = (short)slotNo,
                        programData = processed,
                        isNew = isNew,
                    };
                    short upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle, info), "SetMachineProgramInfo.Async");
                    if (upRc == -8)
                    {
                        Mode1HandleStore.Invalidate(machineId);
                        if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                        {
                            upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle2, info), "SetMachineProgramInfo.Async.retry");
                            if (upRc == -8) Mode1HandleStore.Invalidate(machineId);
                        }
                        else
                        {
                            Console.WriteLine("[SmartUpload] handle retry error: " + errUp2);
                        }
                    }
                    if (upRc != 0)
                    {
                        Console.WriteLine("[SmartUpload] upload failed rc={0} for {1}", upRc, machineId);
                        return;
                    }
                    Console.WriteLine("[SmartUpload] success: {0} headType={1} slot={2}", machineId, headType, slotNo);
                }
                catch (Exception ex)
                {
                    Console.WriteLine("[SmartUpload] background error: " + ex);
                }
            });
        }

        public static bool UploadProgramDataBlocking(string machineId, short headType, int slotNo, string processed, bool isNew, out string usedMode, out string error)
        {
            usedMode = null; error = null;
            try
            {
                var bytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);
                if (bytes > 512000) { error = $"program too large (bytes={bytes}, limit=512000)"; return false; }
                if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp)) { error = errUp; return false; }
                var info = new UpdateMachineProgramInfo { headType = headType, programNo = (short)slotNo, programData = processed, isNew = isNew };
                var busyWaitMaxMs2 = 20000;
                var busyStarted2 = DateTime.UtcNow;
                short upRc = -1;
                for (var attempt = 0; ; attempt++)
                {
                    upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle, info), "SetMachineProgramInfo.Blocking");
                    if (upRc == 0) break;
                    if (upRc == -1)
                    {
                        var elapsedMs = (int)(DateTime.UtcNow - busyStarted2).TotalMilliseconds;
                        if (elapsedMs >= busyWaitMaxMs2) break;
                        System.Threading.Thread.Sleep(1000);
                        continue;
                    }
                    break;
                }
                if (upRc == -8)
                {
                    Mode1HandleStore.Invalidate(machineId);
                    if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                    {
                        upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle2, info), "SetMachineProgramInfo.Blocking.retry");
                        if (upRc == -8) Mode1HandleStore.Invalidate(machineId);
                    }
                    else { error = errUp2; return false; }
                }
                if (upRc == 0) { usedMode = "Mode1"; return true; }
                var mode1Error = upRc == -1 ? $"SetMachineProgramInfo failed (rc=-1, EW_BUSY, waitedMs={(int)(DateTime.UtcNow - busyStarted2).TotalMilliseconds})" : $"SetMachineProgramInfo failed (rc={upRc})";
                error = mode1Error;
                return false;
            }
            catch (Exception ex) { error = ex.Message; return false; }
        }

        public static bool TryVerifyProgramExistsByList(string machineId, short headType, int slotNo, out string error)
        {
            error = null;
            if (!Mode1Api.TryGetProgListInfo(machineId, headType, out var list, out var err)) { error = err ?? "GetProgListInfo failed"; return false; }
            var arr = list.programArray;
            if (arr == null) return false;
            foreach (var p in arr) if (p.no == slotNo) return true;
            return false;
        }

        public static async Task<bool> VerifyProgramExists(string machineId, short headType, int slotNo, int timeoutSeconds)
        {
            var started = DateTime.UtcNow;
            await Task.Delay(500);
            while (true)
            {
                if ((DateTime.UtcNow - started).TotalSeconds > timeoutSeconds) return false;
                if (Mode1Api.TryGetProgListInfo(machineId, headType, out var progList, out var _))
                {
                    try
                    {
                        var list = progList.programArray;
                        if (list == null) { await Task.Delay(2000); continue; }
                        foreach (var p in list) if (p.no == slotNo) return true;
                    } catch { }
                }
                await Task.Delay(2000);
            }
        }

        public static bool TryGetProgramDataPreferMode1(string machineId, short headType, short programNo, out string programData, out string error)
        {
            programData = null; error = null;
            var gotAny = false; var mode1Data = (string)null; var mode1Err = (string)null;
            try
            {
                if (Mode1Api.TryGetProgDataInfo(machineId, headType, programNo, out var info, out var err))
                {
                    gotAny = true; mode1Data = info.programData ?? string.Empty;
                    Console.WriteLine($"[DownloadProgram] Mode1 programData length={mode1Data.Length} uid={machineId} headType={headType} programNo={programNo}");
                }
                else
                {
                    mode1Err = err;
                    Console.WriteLine($"[DownloadProgram] Mode1 GetMachineProgramData failed uid={machineId} headType={headType} programNo={programNo} err={mode1Err}");
                }
            }
            catch (Exception ex)
            {
                mode1Err = ex.Message;
                Console.WriteLine($"[DownloadProgram] Mode1 exception uid={machineId} headType={headType} programNo={programNo} ex={mode1Err}");
            }
            if (!gotAny) { error = mode1Err ?? "GetMachineProgramData failed"; return false; }
            programData = mode1Data ?? string.Empty;
            if (programData.Length == 0) { error = mode1Err ?? "GetMachineProgramData failed"; return false; }
            return true;
        }

        public static bool IsAlarm(string machineId, out string error)
        {
            error = null;
            if (IsMockCncMachiningEnabled()) return false;
            if (Mode1Api.TryGetMachineStatus(machineId, out var st, out var stErr))
            {
                if (st == Hi_Link.Libraries.Model.MachineStatusType.Alarm) { error = stErr; return true; }
            }
            return false;
        }

        public static string SanitizeProgramTextForCnc(string content)
        {
            if (string.IsNullOrEmpty(content)) return content;
            var arr = content.ToCharArray();
            for (int i = 0; i < arr.Length; i++)
            {
                var c = arr[i];
                if (c == '\r' || c == '\n' || c == '\t') continue;
                if (c >= 32 && c <= 126) continue;
                arr[i] = ' ';
            }
            return new string(arr);
        }

        public static bool IsMockCncMachiningEnabled() => Config.MockCncMachining;

        public static string GetSafeBridgeStorePath(string relativePath)
        {
            var root = Path.GetFullPath(Config.BridgeStoreRoot);
            var rel = (relativePath ?? string.Empty).Replace('/', Path.DirectorySeparatorChar).Replace("..", string.Empty);
            var combined = Path.Combine(root, rel);
            var full = Path.GetFullPath(combined);
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Path is outside of bridge store root");
            return full;
        }

        public static bool IsControlOnCooldown(string key)
        {
            var now = DateTime.UtcNow;
            if (ControlCooldowns.TryGetValue(key, out var last) && (now - last) < ControlCooldownWindow) return true;
            ControlCooldowns[key] = now;
            return false;
        }

        public static bool IsRawReadOnCooldown(string key)
        {
            var now = DateTime.UtcNow;
            if (RawReadCooldowns.TryGetValue(key, out var last) && (now - last) < RawReadCooldownWindow) return true;
            RawReadCooldowns[key] = now;
            return false;
        }

        public static int ParseProgramNoFromName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return 0;
            var m = Regex.Match(name.ToUpperInvariant(), @"O(\d{1,5})");
            if (m.Success && int.TryParse(m.Groups[1].Value, out var n) && n > 0) return n;
            var d = Regex.Match(name, @"(\d{1,5})");
            if (d.Success && int.TryParse(d.Groups[1].Value, out var n2) && n2 > 0) return n2;
            return 0;
        }

        public static int GetCurrentActiveSlotOrDefault(string machineId)
        {
            if (Mode1Api.TryGetActivateProgInfo(machineId, out var info, out var _))
            {
                var n = ParseProgramNoFromName(info.MainProgramName);
                if (n <= 0) n = ParseProgramNoFromName(info.SubProgramName);
                return n;
            }
            return 0;
        }

        public static List<string> ParseMachineIds(string machines)
        {
            if (string.IsNullOrWhiteSpace(machines)) return new List<string>();
            return machines.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                           .Select(m => m.Trim())
                           .Where(m => !string.IsNullOrEmpty(m))
                           .ToList();
        }
    }
}
