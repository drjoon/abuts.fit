using Hi_Link.Libraries.Model;
using HiLinkBridgeWebApi48.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Http;
using Hi_Link_Advanced.LinkBridge;
using Hi_Link_Advanced.EdgeBridge;
using Mode1Api = HiLinkBridgeWebApi48.Mode1Api;
using PayloadUpdateActivateProg = Hi_Link.Libraries.Model.UpdateMachineActivateProgNo;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class BridgeController : ApiController
    {
        private static readonly ConcurrentDictionary<string, DateTime> ControlCooldowns = new ConcurrentDictionary<string, DateTime>();
        private static readonly ConcurrentDictionary<string, DateTime> RawReadCooldowns = new ConcurrentDictionary<string, DateTime>();
        private static readonly TimeSpan ControlCooldownWindow = TimeSpan.FromMilliseconds(5000);
        private static readonly TimeSpan RawReadCooldownWindow = TimeSpan.FromMilliseconds(2000);

        private const int MANUAL_SLOT_A = 4000;
        private const int MANUAL_SLOT_B = 4001;
        private static readonly Regex FanucRegex = new Regex(@"O(\d{1,5})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private class ManualMachineState
        {
            public int NextSlot;
            public int? LastPreloadedSlot;
            public string LastPreloadedPath;
            public DateTime LastPreloadedAtUtc;
        }

        private class JobResult
        {
            public string JobId { get; set; }
            public string Status { get; set; }
            public object Result { get; set; }
            public DateTime CreatedAtUtc { get; set; }
        }

        private static readonly ConcurrentDictionary<string, JobResult> JobResults = 
            new ConcurrentDictionary<string, JobResult>();

        // POST /machines/{machineId}/manual/preload-mode2
        // Mode2 DLL을 사용하여 프로그램 업로드(UpdateProgram)
        [HttpPost]
        [Route("machines/{machineId}/manual/preload-mode2")]
        public async Task<HttpResponseMessage> ManualPreloadMode2(string machineId, [FromBody] ManualPreloadRequest req)
        {
            return Request.CreateResponse(HttpStatusCode.Gone, new
            {
                success = false,
                message = "Mode2 is disabled. Use /manual/preload (Mode1)."
            });
        }

        private static readonly ConcurrentDictionary<string, ManualMachineState> ManualStates =
            new ConcurrentDictionary<string, ManualMachineState>(StringComparer.OrdinalIgnoreCase);

        private static ManualMachineState GetOrCreateManualState(string machineId)
        {
            return ManualStates.GetOrAdd(machineId, _ => new ManualMachineState
            {
                NextSlot = MANUAL_SLOT_A,
                LastPreloadedSlot = null,
                LastPreloadedPath = null,
                LastPreloadedAtUtc = DateTime.MinValue,
            });
        }

        private static string EnsureProgramHeader(string content, int programNo)
        {
            if (string.IsNullOrEmpty(content)) return content;
            var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None);
            if (lines.Length == 0) return content;

            var header = $"O{programNo.ToString().PadLeft(4, '0')}";

            // Fanuc 프로그램은 첫 줄이 '%'인 경우가 많다.
            // 이때 O번호를 '%' 앞에 넣으면, CNC가 '%'에서 프로그램을 끝으로 해석해 본문이 날아갈 수 있다.
            // 따라서 선행 '%' / 공백 라인을 건너뛴 뒤 첫 O라인을 교체(또는 없으면 적절히 삽입)한다.
            int idx = 0;
            while (idx < lines.Length)
            {
                var t = (lines[idx] ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(t))
                {
                    idx++;
                    continue;
                }
                if (t == "%")
                {
                    idx++;
                    continue;
                }
                break;
            }

            if (idx < lines.Length)
            {
                var cur = (lines[idx] ?? string.Empty).Trim();
                var m = FanucRegex.Match(cur);
                if (m.Success)
                {
                    if (int.TryParse(m.Groups[1].Value, out var existing) && existing == programNo)
                    {
                        return content;
                    }
                    lines[idx] = header;
                    return string.Join("\r\n", lines);
                }

                // 첫 유효 라인이 O번호가 아니면, idx 위치에 헤더를 삽입
                var list = lines.ToList();
                list.Insert(idx, header);
                return string.Join("\r\n", list);
            }

            // 전부 공백/% 뿐이면 맨 끝에라도 헤더 추가
            return header + "\r\n" + content;
        }

        private static string EnsureProgramEnvelope(string content)
        {
            if (string.IsNullOrEmpty(content)) return content;

            // Hi-Link 예제 기준: programData는 % ... % 형태로 감싸진 경우가 많아, 없으면 보강한다.
            var trimmed = content.Trim();
            if (string.IsNullOrEmpty(trimmed)) return content;

            var startsWithPercent = trimmed.StartsWith("%", StringComparison.Ordinal);
            var endsWithPercent = trimmed.EndsWith("%", StringComparison.Ordinal);

            var result = trimmed;
            if (!startsWithPercent)
            {
                result = "%\r\n" + result;
            }
            if (!endsWithPercent)
            {
                result = result + "\r\n%";
            }
            return result;
        }

        private static string EnsurePercentAndHeaderSecondLine(string content, int programNo)
        {
            if (string.IsNullOrEmpty(content)) return content;

            var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None)
                .Select(x => x ?? string.Empty)
                .ToList();

            // 선행 공백 라인 제거
            while (lines.Count > 0 && string.IsNullOrWhiteSpace(lines[0]))
            {
                lines.RemoveAt(0);
            }

            var header = $"O{programNo.ToString().PadLeft(4, '0')}";

            if (lines.Count == 0)
            {
                return "%\r\n" + header + "\r\n%";
            }

            // 1행은 무조건 %
            if ((lines[0] ?? string.Empty).Trim() != "%")
            {
                lines.Insert(0, "%");
            }

            // % 다음에 빈 줄이 있으면 제거하여 header가 항상 2행이 되도록
            while (lines.Count > 1 && string.IsNullOrWhiteSpace(lines[1]))
            {
                lines.RemoveAt(1);
            }

            if (lines.Count == 1)
            {
                lines.Add(header);
            }
            else
            {
                lines[1] = header;
            }

            return string.Join("\r\n", lines);
        }

        private static int ChooseManualSlotForUpload(string machineId)
        {
            var active = 0;
            if (Mode1Api.TryGetActivateProgInfo(machineId, out var info, out var _))
            {
                active = ParseProgramNoFromName(info.MainProgramName);
                if (active <= 0) active = ParseProgramNoFromName(info.SubProgramName);
            }

            // 장비 상태(busy/가공중)와 무관하게, 현재 활성 슬롯(4000/4001)이면 덮어쓰지 않도록 반대 슬롯을 선택한다.
            if (active == MANUAL_SLOT_A) return MANUAL_SLOT_B;
            if (active == MANUAL_SLOT_B) return MANUAL_SLOT_A;
            return MANUAL_SLOT_A;
        }

        private static void QueueUploadProgramData(string machineId, short headType, int slotNo, string processed, bool isNew)
        {
            Task.Run(() =>
            {
                try
                {
                    try
                    {
                        Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)slotNo, out var _, out var _);
                    }
                    catch { }

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

                    short upRc;
                    upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle, info), "SetMachineProgramInfo.Async");

                    if (upRc == -8)
                    {
                        Mode1HandleStore.Invalidate(machineId);
                        if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                        {
                            upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle2, info), "SetMachineProgramInfo.Async.retry");
                            if (upRc == -8)
                            {
                                Mode1HandleStore.Invalidate(machineId);
                            }
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

        private static bool UploadProgramDataBlocking(string machineId, short headType, int slotNo, string processed, bool isNew, out string usedMode, out string error)
        {
            usedMode = null;
            error = null;
            try
            {
                // payload는 CNC/Hi-Link가 ASCII만 안정적인 경우가 있어 ASCII 기준 bytes로 계산한다.
                var bytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);

                // 500KB 상한(요구사항). 장비 메모리 상황에 따라 실패할 수 있으므로, 이 값 초과는 요청 단계에서 차단.
                if (bytes > 512000)
                {
                    error = $"program too large (bytes={bytes}, limit=512000)";
                    return false;
                }

                if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                {
                    error = errUp;
                    return false;
                }

                var info = new UpdateMachineProgramInfo
                {
                    headType = headType,
                    programNo = (short)slotNo,
                    programData = processed,
                    isNew = isNew,
                };

                // EW_BUSY(-1)면 CNC processing 중이므로 대기 후 재시도한다.
                // 요구사항: 최대 20초, 1초 단위 체크
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
                        if (elapsedMs >= busyWaitMaxMs2)
                        {
                            break;
                        }
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
                        if (upRc == -8)
                        {
                            Mode1HandleStore.Invalidate(machineId);
                        }
                    }
                    else
                    {
                        error = errUp2;
                        return false;
                    }
                }
                if (upRc == 0)
                {
                    usedMode = "Mode1";
                    return true;
                }

                // Mode1 실패 시 Mode2로 fallback 재시도(특히 대용량에서 필요)
                var mode1Error = upRc == -1
                    ? $"SetMachineProgramInfo failed (rc=-1, EW_BUSY, waitedMs={(int)(DateTime.UtcNow - busyStarted2).TotalMilliseconds})"
                    : $"SetMachineProgramInfo failed (rc={upRc})";

                // Mode2 제거: Mode1만 사용하므로 실패 시 바로 반환
                error = mode1Error;
                return false;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        private static bool TryVerifyProgramExistsByList(string machineId, short headType, int slotNo, out string error)
        {
            error = null;
            if (!Mode1Api.TryGetProgListInfo(machineId, headType, out var list, out var err))
            {
                error = err ?? "GetProgListInfo failed";
                return false;
            }

            var arr = list.programArray;
            if (arr == null) return false;
            foreach (var p in arr)
            {
                if (p.no == slotNo) return true;
            }
            return false;
        }

        private static async Task<bool> VerifyProgramExists(string machineId, short headType, int slotNo, int timeoutSeconds)
        {
            var started = DateTime.UtcNow;
            // 첫 호출 전 짧은 delay로 업로드 직후 안정화 시간 확보
            await Task.Delay(500);
            
            while (true)
            {
                if ((DateTime.UtcNow - started).TotalSeconds > timeoutSeconds) return false;

                if (Mode1Api.TryGetProgListInfo(machineId, headType, out var progList, out var _))
                {
                    try
                    {
                        var list = progList.programArray;
                        if (list == null)
                        {
                            await Task.Delay(2000);
                            continue;
                        }

                        foreach (var p in list)
                        {
                            if (p.no == slotNo) return true;
                        }
                    }
                    catch { }
                }

                await Task.Delay(2000);
            }
        }

        private static bool TryGetProgramDataPreferMode1(string machineId, short headType, short programNo, out string programData, out string error)
        {
            programData = null;
            error = null;

            var gotAny = false;
            var mode1Data = (string)null;
            var mode1Err = (string)null;

            try
            {
                if (Mode1Api.TryGetProgDataInfo(machineId, headType, programNo, out var info, out var err))
                {
                    gotAny = true;
                    mode1Data = info.programData ?? string.Empty;
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

            // Mode2 제거: Mode1만 사용
            if (!gotAny)
            {
                error = mode1Err ?? "GetMachineProgramData failed";
                return false;
            }

            programData = mode1Data ?? string.Empty;
            if (programData.Length == 0)
            {
                error = mode1Err ?? "GetMachineProgramData failed";
                return false;
            }

            // // Hi-Link API 제한으로 인한 truncation 경고
            // if (mode1Data.Length > 90000)
            // {
            //     error = $"TRUNCATED: Hi-Link API readback limit (~103KB). Actual program may be larger. Downloaded {mode1Data.Length} bytes.";
            //     Console.WriteLine($"[DownloadProgram] Warning: programData truncated by Hi-Link readback limit (len={mode1Data.Length}) uid={machineId} headType={headType} programNo={programNo}");
            // }
            return true;
        }

        private class SmartStartJob
        {
            public string JobId;
            public short HeadType;
            public List<string> Paths;
            public int MaxWaitSeconds;

            public int Index;
            public int CurrentSlot;
            public int PreviousSlot;
            public int ProductCountBefore;

            public int? PreUploadedSlot;
            public bool FirstFilePreUploaded;

            public DateTime StartedAtUtc;
            public DateTime? FinishedAtUtc;
            public string Status;
            public string ErrorCode;
            public string ErrorMessage;
        }

        private class SmartMachineQueue
        {
            public readonly object Sync = new object();
            public readonly Queue<SmartStartJob> Jobs = new Queue<SmartStartJob>();
            public bool WorkerRunning;
            public SmartStartJob Current;
        }

        private class PreUploadResult
        {
            public int ActiveSlot { get; set; }
            public int ProtectedSlot { get; set; }
            public List<int> UploadSlots { get; set; }
            public List<int> DeletedSlots { get; set; }
            public List<object> Files { get; set; }
        }

        private static readonly ConcurrentDictionary<string, SmartMachineQueue> SmartStartQueues =
            new ConcurrentDictionary<string, SmartMachineQueue>(StringComparer.OrdinalIgnoreCase);

        private static SmartMachineQueue GetOrCreateSmartQueue(string machineId)
        {
            return SmartStartQueues.GetOrAdd(machineId, _ => new SmartMachineQueue());
        }

        private static SmartMachineQueue GetOrCreateHighLevelQueue(string machineId)
        {
            return GetOrCreateSmartQueue(machineId);
        }

        private static async Task<bool> WaitUntilIdleOrTimeout(string machineId, int maxWaitSeconds)
        {
            var started = DateTime.UtcNow;
            while (true)
            {
                var hasBusy = CncMachineSignalUtils.TryGetMachineBusy(machineId, out var busy);
                if (hasBusy && busy)
                {
                    if ((DateTime.UtcNow - started).TotalSeconds > maxWaitSeconds) return false;
                    await Task.Delay(3000);
                    continue;
                }

                // 바쁜 상태를 읽지 못한 경우에도 안전하게 대기한다.
                if (!hasBusy)
                {
                    if ((DateTime.UtcNow - started).TotalSeconds > maxWaitSeconds) return false;
                    await Task.Delay(3000);
                    continue;
                }

                return true;
            }
        }

        private static async Task<bool> WaitUntilDoneOrTimeout(string machineId, int maxWaitSeconds)
        {
            var started = DateTime.UtcNow;
            while (true)
            {
                var hasBusy = CncMachineSignalUtils.TryGetMachineBusy(machineId, out var busy);
                if (hasBusy && busy)
                {
                    if ((DateTime.UtcNow - started).TotalSeconds > maxWaitSeconds) return false;
                    await Task.Delay(3000);
                    continue;
                }

                // 바쁜 상태를 읽지 못한 경우에도 안전하게 대기한다.
                if (!hasBusy)
                {
                    if ((DateTime.UtcNow - started).TotalSeconds > maxWaitSeconds) return false;
                    await Task.Delay(3000);
                    continue;
                }

                return true;
            }
        }

        private static async Task<bool> WaitForProductCountIncrease(string machineId, int before, int timeoutSeconds)
        {
            var started = DateTime.UtcNow;
            while (true)
            {
                if ((DateTime.UtcNow - started).TotalSeconds > timeoutSeconds) return false;
                if (CncMachineSignalUtils.TryGetProductCount(machineId, out var c) && c > before) return true;
                await Task.Delay(2000);
            }
        }

        private static bool TryUploadWithFallback(string machineId, short headType, short initialSlot, string rawContent, bool isNew, out short finalSlot, out string usedMode, out string err)
        {
            string Prepare(short slot)
            {
                var enforced = EnsurePercentAndHeaderSecondLine(rawContent, slot);
                return SanitizeProgramTextForCnc(EnsureProgramEnvelope(enforced));
            }

            var prepared = Prepare(initialSlot);
            if (UploadProgramDataBlocking(machineId, headType, initialSlot, prepared, isNew, out usedMode, out err))
            {
                finalSlot = initialSlot;
                return true;
            }

            if (err != null && err.Contains("(rc=5)"))
            {
                var altSlot = initialSlot == MANUAL_SLOT_A ? MANUAL_SLOT_B : MANUAL_SLOT_A;
                Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)altSlot, out var _, out var _);
                var preparedAlt = Prepare((short)altSlot);
                if (UploadProgramDataBlocking(machineId, headType, (short)altSlot, preparedAlt, isNew, out usedMode, out err))
                {
                    finalSlot = (short)altSlot;
                    return true;
                }
            }

            finalSlot = initialSlot;
            return false;
        }

        // 옵션: 큐 삽입 전에 CNC로 미리 업로드(슬롯 A/B 두 개까지만 선업로드)
        private static PreUploadResult PreUploadProgramsForQueue(string machineId, short headType, List<string> paths)
        {
            if (paths == null || paths.Count == 0) return null;
            var activeSlot = GetCurrentActiveSlotOrDefault(machineId);
            var protectedSlot = (activeSlot == MANUAL_SLOT_A || activeSlot == MANUAL_SLOT_B) ? activeSlot : 0;

            // 활성 슬롯 보호: 반대 슬롯을 우선 사용. 보호 슬롯만 있는 경우 1개만 업로드.
            var slotOrder = new List<int>();
            if (protectedSlot == MANUAL_SLOT_A)
            {
                slotOrder.Add(MANUAL_SLOT_B);
            }
            else if (protectedSlot == MANUAL_SLOT_B)
            {
                slotOrder.Add(MANUAL_SLOT_A);
            }
            else
            {
                slotOrder.Add(MANUAL_SLOT_A);
                slotOrder.Add(MANUAL_SLOT_B);
            }

            var uploadSlots = slotOrder.Take(paths.Count).ToList();
            if (uploadSlots.Count < paths.Count)
            {
                throw new InvalidOperationException("Not enough uploadable slots (protected active slot)");
            }

            var deletedSlots = new List<int>();
            var logInfo = new StringBuilder();
            logInfo.Append($"[PreUpload] machine={machineId} headType={headType} active={activeSlot} protected={protectedSlot} uploadSlots=[{string.Join(",", uploadSlots)}]");
            var fileInfos = new List<object>();

            for (int i = 0; i < paths.Count; i++)
            {
                var rel = paths[i];
                var full = GetSafeBridgeStorePath(rel);
                if (!File.Exists(full))
                {
                    throw new FileNotFoundException("file not found", full);
                }

                var slot = uploadSlots[i];

                // 보호되지 않은 슬롯은 업로드 전에 삭제하여 메모리 확보(EW_DATA/Busy 완화)
                if (slot != protectedSlot)
                {
                    if (Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)slot, out var _, out var delErr))
                    {
                        deletedSlots.Add(slot);
                    }
                    else
                    {
                        logInfo.Append($" delErr(slot={slot})={delErr}");
                    }
                }

                var content = File.ReadAllText(full);
                var enforced = EnsurePercentAndHeaderSecondLine(content, slot);
                var processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(enforced));
                var bytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);

                if (!UploadProgramDataBlocking(machineId, headType, (short)slot, processed, true, out var _, out var upErr))
                {
                    throw new InvalidOperationException(upErr ?? "upload failed");
                }

                fileInfos.Add(new { slot, bytes, path = rel });
                logInfo.Append($" [slot={slot} bytes={bytes} path={rel} uploaded]");
            }

            if (deletedSlots.Count > 0)
            {
                logInfo.Append($" deleted=[{string.Join(",", deletedSlots)}]");
            }

            Console.WriteLine(logInfo.ToString());
            return new PreUploadResult
            {
                ActiveSlot = activeSlot,
                ProtectedSlot = protectedSlot,
                UploadSlots = uploadSlots,
                DeletedSlots = deletedSlots,
                Files = fileInfos,
            };
        }

        private static bool IsAlarm(string machineId, out string error)
        {
            error = null;

            // mock 모드일 때는 알람을 항상 무시한다.
            if (IsMockCncMachiningEnabled())
            {
                return false;
            }

            if (Mode1Api.TryGetMachineStatus(machineId, out var st, out var stErr))
            {
                if (st == MachineStatusType.Alarm)
                {
                    error = stErr;
                    return true;
                }
            }
            return false;
        }

        private static void EnsureWorkerStarted(string machineId)
        {
            var q = GetOrCreateSmartQueue(machineId);
            lock (q.Sync)
            {
                if (q.WorkerRunning) return;
                q.WorkerRunning = true;
            }

            Task.Run(async () =>
            {
                try
                {
                    while (true)
                    {
                        SmartStartJob job = null;
                        lock (q.Sync)
                        {
                            if (q.Jobs.Count == 0)
                            {
                                q.Current = null;
                                q.WorkerRunning = false;
                                return;
                            }
                            job = q.Jobs.Peek();
                            q.Current = job;
                            Console.WriteLine($"[SmartStartJob] start jobId={job.JobId} machine={machineId} index={job.Index} total={job.Paths?.Count ?? 0} currentSlot={job.CurrentSlot} prevSlot={job.PreviousSlot}");
                        }

                        try
                        {
                            job.Status = "RUNNING";
                            await RunSmartStartJob(machineId, job);
                            job.Status = "DONE";
                            job.FinishedAtUtc = DateTime.UtcNow;
                            JobResults[job.JobId] = new JobResult
                            {
                                JobId = job.JobId,
                                Status = "COMPLETED",
                                Result = new
                                {
                                    success = true,
                                    message = "Job completed",
                                    currentSlot = job.CurrentSlot,
                                    previousSlot = job.PreviousSlot,
                                    index = job.Index,
                                    total = job.Paths?.Count ?? 0,
                                },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            Console.WriteLine($"[SmartStartJob] done jobId={job.JobId} machine={machineId} status=DONE");
                        }
                        catch (Exception ex)
                        {
                            job.Status = "FAILED";
                            job.ErrorCode = job.ErrorCode ?? "EXCEPTION";
                            job.ErrorMessage = job.ErrorMessage ?? ex.Message;
                            job.FinishedAtUtc = DateTime.UtcNow;

                            JobResults[job.JobId] = new JobResult
                            {
                                JobId = job.JobId,
                                Status = "FAILED",
                                Result = new
                                {
                                    success = false,
                                    message = job.ErrorMessage,
                                    errorCode = job.ErrorCode,
                                    currentSlot = job.CurrentSlot,
                                    previousSlot = job.PreviousSlot,
                                    index = job.Index,
                                    total = job.Paths?.Count ?? 0,
                                },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            Console.WriteLine($"[SmartStartJob] failed jobId={job.JobId} machine={machineId} errorCode={job.ErrorCode} errorMessage={job.ErrorMessage} exception={ex.Message}");
                        }
                        finally
                        {
                            lock (q.Sync)
                            {
                                if (q.Jobs.Count > 0 && ReferenceEquals(q.Jobs.Peek(), job))
                                {
                                    q.Jobs.Dequeue();
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("[SmartStartWorker] fatal: " + ex);
                    lock (q.Sync)
                    {
                        q.WorkerRunning = false;
                    }
                }
            });
        }

        private static async Task RunSmartStartJob(string machineId, SmartStartJob job)
        {
            if (job == null) throw new ArgumentNullException(nameof(job));
            if (job.Paths == null || job.Paths.Count == 0) return;

            var firstPath = (job.Paths[0] ?? string.Empty).Trim();
            if (!string.IsNullOrEmpty(firstPath) && firstPath.StartsWith("dummy/", StringComparison.OrdinalIgnoreCase))
            {
                await RunSmartStartJobMock(machineId, job);
                return;
            }

            if (IsMockCncMachiningEnabled())
            {
                await RunSmartStartJobMock(machineId, job);
                return;
            }

            // 시작 슬롯 결정(현재 활성/가공중 프로그램 피하기)
            job.CurrentSlot = job.PreUploadedSlot ?? ChooseManualSlotForUpload(machineId);
            job.PreviousSlot = 0;

            // 첫 파일을 현재 슬롯에 업로드(가공 전)
            if (!(job.FirstFilePreUploaded && job.PreUploadedSlot.HasValue && job.PreUploadedSlot.Value == job.CurrentSlot))
            {
                var rel = job.Paths[0];
                var full = GetSafeBridgeStorePath(rel);
                if (!File.Exists(full))
                {
                    job.ErrorCode = "FILE_NOT_FOUND";
                    job.ErrorMessage = "file not found";
                    throw new FileNotFoundException("file not found", full);
                }

                // 업로드 전에 대상 슬롯 삭제
                Mode1Api.TryDeleteMachineProgramInfo(machineId, job.HeadType, (short)job.CurrentSlot, out var _, out var _);

                var content = File.ReadAllText(full);
                if (!TryUploadWithFallback(machineId, job.HeadType, (short)job.CurrentSlot, content, true, out var finalSlot0, out var _, out var upErr0))
                {
                    job.ErrorCode = "UPLOAD_FAILED";
                    job.ErrorMessage = upErr0;
                    throw new InvalidOperationException(job.ErrorMessage);
                }
                job.CurrentSlot = finalSlot0;
            }

            // 단일 파일 처리 (연속 가공은 백엔드 DB에서 관리)
            if (job.Paths.Count > 0)
            {
                job.Index = 0;
                var thisSlot = job.CurrentSlot;
                var nextSlot = thisSlot == MANUAL_SLOT_A ? MANUAL_SLOT_B : MANUAL_SLOT_A;

                // 현재 슬롯 프로그램이 존재하는지 확인
                if (!Mode1Api.TryGetProgListInfo(machineId, job.HeadType, out var progListCheck, out var progErr))
                {
                    job.ErrorCode = "PROGRAM_CHECK_FAILED";
                    job.ErrorMessage = progErr ?? "Unable to read program list";
                    throw new InvalidOperationException(job.ErrorMessage);
                }

                // 1) 장비 상태 확인 : 가공중이면 대기
                if (!await WaitUntilIdleOrTimeout(machineId, job.MaxWaitSeconds))
                {
                    job.ErrorCode = "WAIT_IDLE_TIMEOUT";
                    job.ErrorMessage = "wait for idle timeout";
                    throw new TimeoutException(job.ErrorMessage);
                }

                // 2) 비정상 종료(Alarm)면 중단
                if (IsAlarm(machineId, out var alarmErr0))
                {
                    job.ErrorCode = "ALARM";
                    job.ErrorMessage = alarmErr0 ?? "machine is in ALARM state";
                    throw new InvalidOperationException(job.ErrorMessage);
                }

                // 3) 생산 수량(시작 전) 기록
                job.ProductCountBefore = 0;
                CncMachineSignalUtils.TryGetProductCount(machineId, out job.ProductCountBefore);

                // 4) Edit 모드 변경
                if (!Mode1Api.TrySetMachineMode(machineId, "EDIT", out var editErr))
                {
                    job.ErrorCode = "SET_MODE_EDIT_FAILED";
                    job.ErrorMessage = editErr ?? "SetMachineMode(EDIT) failed";
                    throw new InvalidOperationException(job.ErrorMessage);
                }
                await Task.Delay(500);

                // 5) 활성화 프로그램 변경 (Busy(-1) 재시도)
                var actDto = new PayloadUpdateActivateProg { headType = 1, programNo = (short)thisSlot };
                short actRc = -1;
                string actErr = null;
                var actStarted = DateTime.UtcNow;
                var actBusyWaitMs = 20000; // 최대 20초 대기
                for (;;)
                {
                    actRc = Mode1HandleStore.SetActivateProgram(machineId, actDto, out actErr);
                    if (actRc == 0) break;
                    if (actRc != -1) break; // 다른 에러는 즉시 중단

                    var elapsedMs = (int)(DateTime.UtcNow - actStarted).TotalMilliseconds;
                    if (elapsedMs >= actBusyWaitMs) break;
                    await Task.Delay(1000);
                }

                if (actRc != 0)
                {
                    job.ErrorCode = "ACTIVATE_FAILED";
                    job.ErrorMessage = actErr ?? ($"SetActivateProgram failed (result={actRc})");
                    throw new InvalidOperationException(job.ErrorMessage);
                }

                // 6) Auto 모드 변경
                if (!Mode1Api.TrySetMachineMode(machineId, "AUTO", out var autoErr))
                {
                    job.ErrorCode = "SET_MODE_AUTO_FAILED";
                    job.ErrorMessage = autoErr ?? "SetMachineMode(AUTO) failed";
                    throw new InvalidOperationException(job.ErrorMessage);
                }
                await Task.Delay(500);

                // 7) 가공 시작 명령
                if (!Mode1Api.TrySetMachinePanelIO(machineId, 0, (short)Config.CncStartIoUid, true, out var startErr))
                {
                    job.ErrorCode = "START_FAILED";
                    job.ErrorMessage = startErr ?? "Start signal failed";
                    throw new InvalidOperationException(job.ErrorMessage);
                }

                // 8) 가공 종료 대기
                if (!await WaitUntilDoneOrTimeout(machineId, job.MaxWaitSeconds))
                {
                    job.ErrorCode = "WAIT_DONE_TIMEOUT";
                    job.ErrorMessage = "wait for machining end timeout";
                    throw new TimeoutException(job.ErrorMessage);
                }

                // 9) 비정상 종료(Alarm)면 중단
                if (IsAlarm(machineId, out var alarmErr1))
                {
                    job.ErrorCode = "ALARM";
                    job.ErrorMessage = alarmErr1 ?? "machine is in ALARM state";
                    throw new InvalidOperationException(job.ErrorMessage);
                }

                // 10) 생산 수량 +1 확인
                // 긴 가공(6~7분 이상) 대비: 제품 수량 증가 대기 시간 20분
                if (!await WaitForProductCountIncrease(machineId, job.ProductCountBefore, 1200))
                {
                    job.ErrorCode = "PRODUCT_COUNT_NOT_INCREASED";
                    job.ErrorMessage = "product count did not increase";
                    throw new TimeoutException(job.ErrorMessage);
                }

                // 11) 이전 가공프로그램 삭제
                if (job.PreviousSlot > 0)
                {
                    Mode1Api.TryDeleteMachineProgramInfo(machineId, job.HeadType, (short)job.PreviousSlot, out var _, out var _);
                }

                job.PreviousSlot = thisSlot;
                job.CurrentSlot = nextSlot;

                // 12) 가공 완료 콜백 (백엔드에 통보)
                await NotifyMachiningCompletedToBackend(
                    machineId,
                    job.JobId,
                    ExtractRequestIdFromBridgePath(job.Paths[0]),
                    job.Paths[0]);

                // 13) 다음 작업 자동 시작
                await TryStartNextMachiningJob(machineId, job.HeadType);
            }
        }

        private static bool IsMockCncMachiningEnabled()
        {
            var raw = (Environment.GetEnvironmentVariable("MOCK_CNC_MACHINING_ENABLED") ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(raw)) return false;
            return !string.Equals(raw, "false", StringComparison.OrdinalIgnoreCase) && raw != "0";
        }

        private static readonly Regex RequestIdRegex = new Regex(@"(\d{8}-[A-Z0-9]{6,10})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static string ExtractRequestIdFromBridgePath(string bridgePath)
        {
            try
            {
                var p = (bridgePath ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(p)) return string.Empty;
                p = p.Replace('\\', '/');
                var parts = p.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
                for (int i = 0; i < parts.Length - 1; i += 1)
                {
                    if (string.Equals(parts[i], "nc", StringComparison.OrdinalIgnoreCase))
                    {
                        var segment = (parts[i + 1] ?? string.Empty).Trim();
                        var matchFromSegment = RequestIdRegex.Match(segment);
                        if (matchFromSegment.Success)
                        {
                            return matchFromSegment.Groups[1].Value.ToUpperInvariant();
                        }
                        return segment;
                    }
                }
                // 파일명 기반 fallback: {machineId}_{requestId}_*.nc 또는 {requestId}_*.nc
                var file = parts.Length > 0 ? parts[parts.Length - 1] : p;
                file = (file ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(file)) return string.Empty;
                var fileNoExt = Path.GetFileNameWithoutExtension(file);
                if (string.IsNullOrEmpty(fileNoExt)) return string.Empty;

                var segs = fileNoExt.Split(new[] { '_' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var seg in segs)
                {
                    var match = RequestIdRegex.Match(seg);
                    if (match.Success)
                    {
                        return match.Groups[1].Value.ToUpperInvariant();
                    }
                }

                var matchFromWhole = RequestIdRegex.Match(fileNoExt);
                if (matchFromWhole.Success)
                {
                    return matchFromWhole.Groups[1].Value.ToUpperInvariant();
                }

                return string.Empty;
            }
            catch
            {
                return string.Empty;
            }
        }

        private static async Task RunSmartStartJobMock(string machineId, SmartStartJob job)
        {
            var bridgePath = job?.Paths != null && job.Paths.Count > 0 ? job.Paths[0] : string.Empty;
            var requestId = ExtractRequestIdFromBridgePath(bridgePath);

            try
            {
                await NotifyMachiningTickToBackend(machineId, job.JobId, requestId, bridgePath, "STARTED", 0);
            }
            catch { }

            await Task.Delay(4000);
            try
            {
                await NotifyMachiningTickToBackend(machineId, job.JobId, requestId, bridgePath, "RUNNING", 50);
            }
            catch { }

            await Task.Delay(4000);

            await NotifyMachiningCompletedToBackend(machineId, job.JobId, requestId, bridgePath);
            await TryStartNextMachiningJob(machineId, job.HeadType);
        }

        private static async Task NotifyMachiningTickToBackend(string machineId, string jobId, string requestId, string bridgePath, string phase, int percent)
        {
            try
            {
                var backendUrl = Config.BackendBase?.TrimEnd('/');
                if (string.IsNullOrEmpty(backendUrl))
                {
                    Console.WriteLine($"[NotifyMachiningTick] BackendUrl not configured");
                    return;
                }

                var url = $"{backendUrl}/api/cnc-machines/bridge/machining/tick/{Uri.EscapeDataString(machineId)}";
                var payload = new
                {
                    jobId,
                    requestId = string.IsNullOrEmpty(requestId) ? null : requestId,
                    bridgePath = string.IsNullOrEmpty(bridgePath) ? null : bridgePath,
                    phase,
                    percent
                };
                var json = JsonConvert.SerializeObject(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                Console.WriteLine(
                    $"[NotifyMachiningTick] payload machineId={machineId} jobId={jobId} requestId={payload.requestId ?? "(null)"} bridgePath={payload.bridgePath ?? "(null)"} phase={phase} percent={percent}");

                using (var client = new HttpClient())
                {
                    client.DefaultRequestHeaders.Add("X-Bridge-Secret", Config.BridgeSharedSecret ?? string.Empty);
                    var response = await client.PostAsync(url, content);
                    Console.WriteLine($"[NotifyMachiningTick] machineId={machineId} jobId={jobId} status={response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[NotifyMachiningTick] Error: {ex.Message}");
            }
        }

        private static async Task NotifyMachiningCompletedToBackend(string machineId, string jobId, string requestId, string bridgePath)
        {
            try
            {
                var backendUrl = Config.BackendBase?.TrimEnd('/');
                if (string.IsNullOrEmpty(backendUrl))
                {
                    Console.WriteLine($"[NotifyMachiningCompleted] BackendUrl not configured");
                    return;
                }

                // 운영 서버에는 bridge 전용 complete 엔드포인트(/bridge/machining/complete)가 안정적으로 존재한다.
                // (smart/machining-completed 라우트는 환경에 따라 미배포일 수 있어 authenticate(401)로 떨어질 수 있음)
                var url = $"{backendUrl}/api/cnc-machines/bridge/machining/complete/{Uri.EscapeDataString(machineId)}";
                var payload = new
                {
                    jobId,
                    requestId = string.IsNullOrEmpty(requestId) ? null : requestId,
                    bridgePath = string.IsNullOrEmpty(bridgePath) ? null : bridgePath
                };
                var json = JsonConvert.SerializeObject(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                Console.WriteLine(
                    $"[NotifyMachiningCompleted] payload machineId={machineId} jobId={jobId} requestId={payload.requestId ?? "(null)"} bridgePath={payload.bridgePath ?? "(null)"}");

                // 브리지 시크릿 헤더 추가
                var headers = new Dictionary<string, string>
                {
                    { "X-Bridge-Secret", Config.BridgeSharedSecret ?? string.Empty }
                };

                using (var client = new HttpClient())
                {
                    foreach (var header in headers)
                    {
                        client.DefaultRequestHeaders.Add(header.Key, header.Value);
                    }

                    var response = await client.PostAsync(url, content);
                    if (!response.IsSuccessStatusCode)
                    {
                        var body = string.Empty;
                        try { body = await response.Content.ReadAsStringAsync(); } catch { }
                        Console.WriteLine($"[NotifyMachiningCompleted] machineId={machineId} jobId={jobId} status={response.StatusCode} url={url} body={body}");
                    }
                    else
                    {
                        Console.WriteLine($"[NotifyMachiningCompleted] machineId={machineId} jobId={jobId} status={response.StatusCode}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[NotifyMachiningCompleted] Error: {ex.Message}");
            }
        }

        private static async Task TryStartNextMachiningJob(string machineId, short headType)
        {
            try
            {
                var backendUrl = Config.BackendBase?.TrimEnd('/');
                if (string.IsNullOrEmpty(backendUrl))
                {
                    Console.WriteLine($"[TryStartNextMachiningJob] BackendUrl not configured");
                    return;
                }

                // 백엔드에서 다음 작업 조회
                var url = $"{backendUrl}/api/cnc-machines/bridge/queue-snapshot/{Uri.EscapeDataString(machineId)}";
                var headers = new Dictionary<string, string>
                {
                    { "X-Bridge-Secret", Config.BridgeSharedSecret ?? string.Empty }
                };

                using (var client = new HttpClient())
                {
                    foreach (var header in headers)
                    {
                        client.DefaultRequestHeaders.Add(header.Key, header.Value);
                    }

                    var response = await client.GetAsync(url);
                    if (!response.IsSuccessStatusCode)
                    {
                        var body = string.Empty;
                        try { body = await response.Content.ReadAsStringAsync(); } catch { }
                        Console.WriteLine($"[TryStartNextMachiningJob] Failed to get queue snapshot: {response.StatusCode} url={url} body={body}");
                        return;
                    }

                    var json = await response.Content.ReadAsStringAsync();
                    var queueData = JsonConvert.DeserializeObject<JObject>(json);
                    var jobs = queueData?["data"] as JArray;

                    if (jobs == null || jobs.Count == 0)
                    {
                        Console.WriteLine($"[TryStartNextMachiningJob] No more jobs in queue");
                        return;
                    }

                    // 첫 번째 작업 경로 추출
                    var firstJob = jobs[0] as JObject;
                    var path = firstJob?["bridgePath"]?.ToString();
                    if (string.IsNullOrEmpty(path))
                    {
                        path = firstJob?["path"]?.ToString();
                    }

                    if (string.IsNullOrEmpty(path))
                    {
                        Console.WriteLine($"[TryStartNextMachiningJob] No path found in first job");
                        return;
                    }

                    // 백엔드의 /smart/replace, /smart/start 는 제조사 JWT 인증이 필요하므로,
                    // 브리지 서버는 내부 큐에 다음 작업을 직접 enqueue하여 연속 가공을 이어간다.
                    var q = GetOrCreateSmartQueue(machineId);
                    lock (q.Sync)
                    {
                        q.Jobs.Enqueue(new SmartStartJob
                        {
                            JobId = Guid.NewGuid().ToString("N"),
                            HeadType = headType,
                            Paths = new List<string> { path },
                            MaxWaitSeconds = Config.CncJobAssumeMinutes * 60,
                            Index = 0,
                            CurrentSlot = 0,
                            PreviousSlot = 0,
                            ProductCountBefore = 0,
                            StartedAtUtc = DateTime.UtcNow,
                            Status = "QUEUED",
                        });
                    }

                    EnsureWorkerStarted(machineId);
                    Console.WriteLine($"[TryStartNextMachiningJob] Enqueued next job locally. machineId={machineId} path={path}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TryStartNextMachiningJob] Error: {ex.Message}");
            }
        }

        private static string SanitizeProgramTextForCnc(string content)
        {
            if (string.IsNullOrEmpty(content)) return content;
            // CNC 컨트롤러/Hi-Link가 비 ASCII 문자를 포함한 프로그램 데이터 업로드에 실패하는 경우가 있어 방어적으로 제거한다.
            // (파일명은 그대로 유지하고, CNC로 보내는 본문만 정리)
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

        private static string GetSafeBridgeStorePath(string relativePath)
        {
            var root = Path.GetFullPath(Config.BridgeStoreRoot);
            var rel = (relativePath ?? string.Empty)
                .Replace('/', Path.DirectorySeparatorChar)
                .Replace("..", string.Empty);

            var combined = Path.Combine(root, rel);
            var full = Path.GetFullPath(combined);
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Path is outside of bridge store root");
            }
            return full;
        }

        private static bool IsControlOnCooldown(string key)
        {
            var now = DateTime.UtcNow;
            if (ControlCooldowns.TryGetValue(key, out var last) && (now - last) < ControlCooldownWindow)
            {
                return true;
            }

            ControlCooldowns[key] = now;
            return false;
        }
        private static bool IsRawReadOnCooldown(string key)
        {
            var now = DateTime.UtcNow;
            if (RawReadCooldowns.TryGetValue(key, out var last) && (now - last) < RawReadCooldownWindow)
            {
                return true;
            }

            RawReadCooldowns[key] = now;
            return false;
        }

        public class ManualPreloadRequest
        {
            public string path { get; set; }
            public int? slotNo { get; set; }
            public short? headType { get; set; }
        }

        public class ManualPlayRequest
        {
            public int? slotNo { get; set; }
            public string path { get; set; }
            public bool? skipAlarmCheck { get; set; }
        }

        private static int ParseProgramNoFromName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return 0;
            var m = Regex.Match(name.ToUpperInvariant(), @"O(\d{1,5})");
            if (m.Success && int.TryParse(m.Groups[1].Value, out var n) && n > 0) return n;
            var d = Regex.Match(name, @"(\d{1,5})");
            if (d.Success && int.TryParse(d.Groups[1].Value, out var n2) && n2 > 0) return n2;
            return 0;
        }

        private static int GetCurrentActiveSlotOrDefault(string machineId)
        {
            if (Mode1Api.TryGetActivateProgInfo(machineId, out var info, out var _))
            {
                var n = ParseProgramNoFromName(info.MainProgramName);
                if (n <= 0) n = ParseProgramNoFromName(info.SubProgramName);
                return n;
            }
            return 0;
        }

        // POST /machines/{machineId}/manual/preload
        [HttpPost]
        [Route("machines/{machineId}/manual/preload")]
        public HttpResponseMessage ManualPreload(string machineId, [FromBody] ManualPreloadRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var relPath = (req?.path ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(relPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
            }

            var desired = req?.slotNo;
            if (desired.HasValue && desired.Value != MANUAL_SLOT_A && desired.Value != MANUAL_SLOT_B)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "invalid slotNo" });
            }

            try
            {
                var st = GetOrCreateManualState(machineId);
                var slotNo = desired.HasValue
                    ? desired.Value
                    : (st.NextSlot == MANUAL_SLOT_B ? MANUAL_SLOT_B : MANUAL_SLOT_A);
                var nextSlotNo = slotNo == MANUAL_SLOT_A ? MANUAL_SLOT_B : MANUAL_SLOT_A;

                var fullPath = GetSafeBridgeStorePath(relPath);
                if (!File.Exists(fullPath))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
                    {
                        success = false,
                        message = "file not found",
                        path = relPath
                    });
                }

                var content = File.ReadAllText(fullPath);
                var processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(EnsureProgramHeader(content, slotNo)));

                // 프로그램 업로드를 백그라운드에서 비동기로 처리 (응답 지연 방지)
                Task.Run(() =>
                {
                    try
                    {
                        // CNC 메모리 제약 대응: 대상 슬롯은 삭제 후 업로드 (메인 headType=1)
                        try
                        {
                            Mode1Api.TryDeleteMachineProgramInfo(machineId, 1, (short)slotNo, out var _, out var _);
                        }
                        catch { }

                        if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                        {
                            Console.WriteLine("[ManualPreload] handle error: " + errUp);
                            return;
                        }

                        var info = new UpdateMachineProgramInfo
                        {
                            headType = 1, // Main
                            programNo = (short)slotNo,
                            programData = processed,
                            isNew = true,
                        };
                        var upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle, info), "SetMachineProgramInfo.ManualPreload");
                        if (upRc == -8)
                        {
                            Mode1HandleStore.Invalidate(machineId);
                            if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                            {
                                upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle2, info), "SetMachineProgramInfo.ManualPreload.retry");
                                if (upRc == -8)
                                {
                                    Mode1HandleStore.Invalidate(machineId);
                                }
                            }
                            else
                            {
                                Console.WriteLine("[ManualPreload] handle retry error: " + errUp2);
                            }
                        }
                        if (upRc != 0)
                        {
                            Console.WriteLine("[ManualPreload] upload failed rc={0} for {1}", upRc, machineId);
                            return;
                        }

                        st.LastPreloadedSlot = slotNo;
                        st.LastPreloadedPath = relPath;
                        st.LastPreloadedAtUtc = DateTime.UtcNow;
                        if (!desired.HasValue)
                        {
                            st.NextSlot = nextSlotNo;
                        }
                        Console.WriteLine("[ManualPreload] success: {0} slot={1}", machineId, slotNo);
                    }
                    catch (Exception bgEx)
                    {
                        Console.WriteLine("[ManualPreload] background error: " + bgEx);
                    }
                });

                // 즉시 응답 반환 (업로드는 백그라운드에서 진행)
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Manual preload queued",
                    slotNo,
                    nextSlotNo,
                    path = relPath,
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        // POST /machines/{machineId}/smart/upload
        [HttpPost]
        [Route("machines/{machineId}/smart/upload")]
        public HttpResponseMessage SmartUploadProgram(string machineId, [FromBody] SmartUploadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var headType = req?.headType ?? (short)1;
            var relPath = (req?.path ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(relPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
            }

            var fullPath = GetSafeBridgeStorePath(relPath);
            if (!File.Exists(fullPath))
            {
                return Request.CreateResponse(HttpStatusCode.NotFound, new
                {
                    success = false,
                    message = "file not found",
                    path = relPath
                });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[SmartUpload] jobId={jobId} accepted. machineId={machineId} path={relPath}");

            // 즉시 응답: 작업 수락됨
            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Smart upload job accepted",
                jobId = jobId,
                machineId = machineId,
                path = relPath,
            });

            // 백그라운드에서 작업 처리
            Task.Run(async () =>
            {
                try
                {
                    var slotNo = ChooseManualSlotForUpload(machineId);
                    var content = File.ReadAllText(fullPath);
                    var enforced = EnsurePercentAndHeaderSecondLine(content, slotNo);
                    var processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(enforced));

                    var processedLen = (processed ?? string.Empty).Length;
                    var processedBytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);

                    var activeSlot = 0;
                    if (Mode1Api.TryGetActivateProgInfo(machineId, out var activeInfo0, out var _))
                    {
                        activeSlot = ParseProgramNoFromName(activeInfo0.MainProgramName);
                        if (activeSlot <= 0) activeSlot = ParseProgramNoFromName(activeInfo0.SubProgramName);
                    }

                    var protectedSlot = (activeSlot == MANUAL_SLOT_A || activeSlot == MANUAL_SLOT_B) ? activeSlot : 0;

                    var deletedSlots = new List<int>();
                    foreach (var s in new[] { MANUAL_SLOT_A, MANUAL_SLOT_B })
                    {
                        if (protectedSlot == s) continue;
                        try
                        {
                            Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)s, out var _, out var _);
                            deletedSlots.Add(s);
                        }
                        catch { }
                    }

                    if (protectedSlot == MANUAL_SLOT_A) slotNo = MANUAL_SLOT_B;
                    else if (protectedSlot == MANUAL_SLOT_B) slotNo = MANUAL_SLOT_A;

                    enforced = EnsurePercentAndHeaderSecondLine(content, slotNo);
                    processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(enforced));
                    processedLen = (processed ?? string.Empty).Length;
                    processedBytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);

                    if (processedBytes > 512000)
                    {
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = "program is too large (max 500KB)", bytes = processedBytes },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    if (!UploadProgramDataBlocking(machineId, headType, slotNo, processed, req?.isNew ?? true, out var usedMode, out var upErr))
                    {
                        var isRc5 = (upErr ?? string.Empty).Contains("(rc=5)");
                        var triedFallback = false;
                        if (isRc5)
                        {
                            var altSlot = slotNo == MANUAL_SLOT_A ? MANUAL_SLOT_B : MANUAL_SLOT_A;
                            if (protectedSlot != altSlot)
                            {
                                // 다른 슬롯 삭제 후 재업로드 시도
                                Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)altSlot, out var _, out var _);
                                var enforcedAlt = EnsurePercentAndHeaderSecondLine(content, altSlot);
                                var processedAlt = SanitizeProgramTextForCnc(EnsureProgramEnvelope(enforcedAlt));
                                if (UploadProgramDataBlocking(machineId, headType, altSlot, processedAlt, req?.isNew ?? true, out usedMode, out upErr))
                                {
                                    slotNo = altSlot;
                                    processed = processedAlt;
                                    triedFallback = true;
                                }
                            }
                        }

                        if (!triedFallback)
                        {
                            Console.WriteLine($"[SmartUpload] jobId={jobId} failed: {upErr}");
                            JobResults[jobId] = new JobResult
                            {
                                JobId = jobId,
                                Status = "FAILED",
                                Result = new { success = false, message = upErr ?? "upload failed", usedMode },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            return;
                        }
                    }

                    Console.WriteLine($"[SmartUpload] jobId={jobId} completed. slotNo={slotNo} bytes={processedBytes}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new
                        {
                            success = true,
                            message = "Smart program uploaded",
                            headType,
                            slotNo,
                            programName = $"O{slotNo.ToString().PadLeft(4, '0')}",
                            path = relPath,
                            length = processedLen,
                            bytes = processedBytes,
                        },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SmartUpload] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // GET /machines/{machineId}/jobs/{jobId}
        [HttpGet]
        [Route("machines/{machineId}/jobs/{jobId}")]
        public HttpResponseMessage GetJobResult(string machineId, string jobId)
        {
            if (!JobResults.TryGetValue(jobId, out var result))
            {
                return Request.CreateResponse(HttpStatusCode.NotFound, new
                {
                    success = false,
                    message = "job not found",
                    jobId
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                jobId = result.JobId,
                status = result.Status,
                result = result.Result,
                createdAtUtc = result.CreatedAtUtc
            });
        }

        public class SmartStartEnqueueRequest
        {
            public short? headType { get; set; }
            public string[] paths { get; set; }
            public int? maxWaitSeconds { get; set; }
            public bool? uploadIfMissing { get; set; }
        }

        // POST /machines/{machineId}/smart/replace (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/smart/replace")]
        public HttpResponseMessage SmartReplace(string machineId, [FromBody] SmartStartEnqueueRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var paths = (req?.paths ?? new string[0])
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim())
                .ToList();
            if (paths.Count == 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "paths is required" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[SmartReplace] jobId={jobId} accepted. machineId={machineId} paths={paths.Count}");

            PreUploadResult preUploadResult = null;
            if (req?.uploadIfMissing == true)
            {
                try
                {
                    preUploadResult = PreUploadProgramsForQueue(machineId, req?.headType ?? (short)1, paths);
                }
                catch (Exception ex)
                {
                    return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                    {
                        success = false,
                        message = ex.Message,
                        jobId,
                        machineId,
                        path = paths.FirstOrDefault(),
                        preUpload = preUploadResult
                    });
                }
            }

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Smart replace job accepted",
                jobId = jobId,
                machineId = machineId,
                preUpload = preUploadResult
            });

            Task.Run(() =>
            {
                try
                {
                    var job = new SmartStartJob
                    {
                        JobId = jobId,
                        HeadType = req?.headType ?? (short)1,
                        Paths = paths,
                        MaxWaitSeconds = Math.Max(30, req?.maxWaitSeconds ?? 1800),
                        Index = 0,
                        StartedAtUtc = DateTime.UtcNow,
                        Status = "QUEUED",
                        PreUploadedSlot = preUploadResult?.UploadSlots?.FirstOrDefault(),
                        FirstFilePreUploaded = preUploadResult != null,
                    };

                    var q = GetOrCreateSmartQueue(machineId);
                    lock (q.Sync)
                    {
                        q.Jobs.Clear();
                        q.Jobs.Enqueue(job);
                    }

                    Console.WriteLine($"[SmartReplace] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Queue replaced", queued = 1 },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SmartReplace] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // POST /machines/{machineId}/smart/enqueue (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/smart/enqueue")]
        public HttpResponseMessage SmartEnqueue(string machineId, [FromBody] SmartStartEnqueueRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var paths = (req?.paths ?? new string[0])
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim())
                .ToList();
            if (paths.Count == 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "paths is required" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[SmartEnqueue] jobId={jobId} accepted. machineId={machineId} paths={paths.Count}");

            PreUploadResult preUploadResult = null;
            if (req?.uploadIfMissing == true)
            {
                try
                {
                    preUploadResult = PreUploadProgramsForQueue(machineId, req?.headType ?? (short)1, paths);
                }
                catch (Exception ex)
                {
                    return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                    {
                        success = false,
                        message = ex.Message,
                        jobId,
                        machineId,
                        path = paths.FirstOrDefault(),
                        preUpload = preUploadResult
                    });
                }
            }

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Smart enqueue job accepted",
                jobId = jobId,
                machineId = machineId,
                preUpload = preUploadResult
            });

            Task.Run(() =>
            {
                try
                {
                    var job = new SmartStartJob
                    {
                        JobId = jobId,
                        HeadType = req?.headType ?? (short)1,
                        Paths = paths,
                        MaxWaitSeconds = Math.Max(30, req?.maxWaitSeconds ?? 1800),
                        Index = 0,
                        StartedAtUtc = DateTime.UtcNow,
                        Status = "QUEUED",
                        PreUploadedSlot = preUploadResult?.UploadSlots?.FirstOrDefault(),
                        FirstFilePreUploaded = preUploadResult != null,
                    };

                    var q = GetOrCreateSmartQueue(machineId);
                    int queued;
                    lock (q.Sync)
                    {
                        q.Jobs.Enqueue(job);
                        queued = q.Jobs.Count;
                    }

                    Console.WriteLine($"[SmartEnqueue] jobId={jobId} completed. queued={queued}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Job enqueued", queued },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SmartEnqueue] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        public class SmartDequeueRequest
        {
            public string jobId { get; set; }
        }

        // POST /machines/{machineId}/smart/dequeue (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/smart/dequeue")]
        public HttpResponseMessage SmartDequeue(string machineId, [FromBody] SmartDequeueRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[SmartDequeue] jobId={jobId} accepted. machineId={machineId}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Smart dequeue job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    var q = GetOrCreateHighLevelQueue(machineId);
                    lock (q.Sync)
                    {
                        if (q.Current != null)
                        {
                            if (string.IsNullOrWhiteSpace(req?.jobId))
                            {
                                JobResults[jobId] = new JobResult
                                {
                                    JobId = jobId,
                                    Status = "FAILED",
                                    Result = new { success = false, message = "cannot dequeue current running job" },
                                    CreatedAtUtc = DateTime.UtcNow
                                };
                                return;
                            }
                            if (string.Equals(q.Current.JobId, req.jobId, StringComparison.OrdinalIgnoreCase))
                            {
                                JobResults[jobId] = new JobResult
                                {
                                    JobId = jobId,
                                    Status = "FAILED",
                                    Result = new { success = false, message = "cannot dequeue current running job" },
                                    CreatedAtUtc = DateTime.UtcNow
                                };
                                return;
                            }
                        }

                        if (q.Jobs.Count == 0)
                        {
                            JobResults[jobId] = new JobResult
                            {
                                JobId = jobId,
                                Status = "COMPLETED",
                                Result = new { success = true, removed = false, queued = 0 },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            return;
                        }

                        SmartStartJob removedJob = null;
                        if (string.IsNullOrWhiteSpace(req?.jobId))
                        {
                            removedJob = q.Jobs.Dequeue();
                        }
                        else
                        {
                            var target = req.jobId.Trim();
                            var newQ = new Queue<SmartStartJob>();
                            while (q.Jobs.Count > 0)
                            {
                                var j = q.Jobs.Dequeue();
                                if (removedJob == null && j != null && string.Equals(j.JobId, target, StringComparison.OrdinalIgnoreCase))
                                {
                                    removedJob = j;
                                    continue;
                                }
                                newQ.Enqueue(j);
                            }
                            while (newQ.Count > 0) q.Jobs.Enqueue(newQ.Dequeue());
                        }

                        Console.WriteLine($"[SmartDequeue] jobId={jobId} completed. removed={removedJob != null}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "COMPLETED",
                            Result = new { success = true, removed = removedJob != null, removedJobId = removedJob?.JobId, queued = q.Jobs.Count },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SmartDequeue] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // POST /machines/{machineId}/smart/start (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/smart/start")]
        public HttpResponseMessage SmartStart(string machineId)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[SmartStart] jobId={jobId} accepted. machineId={machineId}");

            var q = GetOrCreateHighLevelQueue(machineId);
            lock (q.Sync)
            {
                // 워커가 이미 돌고 있으면 즉시 200으로 알려준다.
                if (q.WorkerRunning)
                {
                    return Request.CreateResponse(HttpStatusCode.OK, new
                    {
                        success = true,
                        started = false,
                        message = "worker already running",
                        queued = q.Jobs.Count,
                    });
                }

                // 큐가 비어 있으면 409를 반환해 호출자가 즉시 알 수 있게 한다.
                if (q.Jobs.Count == 0)
                {
                    return Request.CreateResponse(HttpStatusCode.Conflict, new
                    {
                        success = false,
                        message = "queue is empty",
                    });
                }
            }

            // 큐가 존재하면 비동기로 워커를 시작하고 202를 반환한다.
            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Smart start job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    EnsureWorkerStarted(machineId);
                    Console.WriteLine($"[SmartStart] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, started = true },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SmartStart] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // GET /machines/{machineId}/smart/status
        [HttpGet]
        [Route("machines/{machineId}/smart/status")]
        public HttpResponseMessage SmartStatus(string machineId)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var q = GetOrCreateHighLevelQueue(machineId);
            lock (q.Sync)
            {
                var cur = q.Current;
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = new
                    {
                        workerRunning = q.WorkerRunning,
                        queued = q.Jobs.Count,
                        current = cur == null
                            ? null
                            : new
                            {
                                jobId = cur.JobId,
                                status = cur.Status,
                                index = cur.Index,
                                total = cur.Paths != null ? cur.Paths.Count : 0,
                                currentSlot = cur.CurrentSlot,
                                previousSlot = cur.PreviousSlot,
                                startedAtUtc = cur.StartedAtUtc,
                                finishedAtUtc = cur.FinishedAtUtc,
                                elapsedSeconds = (int)Math.Max(0, ((cur.FinishedAtUtc ?? DateTime.UtcNow) - cur.StartedAtUtc).TotalSeconds),
                                errorCode = cur.ErrorCode,
                                errorMessage = cur.ErrorMessage,
                            }
                    }
                });
            }
        }

        // POST /machines/{machineId}/manual/play
        [HttpPost]
        [Route("machines/{machineId}/manual/play")]
        public async Task<HttpResponseMessage> ManualPlay(string machineId, [FromBody] ManualPlayRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var cooldownKey = $"manualPlay:{machineId}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            try
            {
                var st = GetOrCreateManualState(machineId);
                var desired = req?.slotNo;
                if (desired.HasValue && desired.Value != MANUAL_SLOT_A && desired.Value != MANUAL_SLOT_B)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "invalid slotNo" });
                }

                // path는 필수
                var relPath = (req?.path ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(relPath))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
                }

                // skipAlarmCheck=true이면 Alarm 체크를 건너뛴다 (에디터 로드용, 기본값)
                // skipAlarmCheck=false이면 Alarm 체크를 수행한다 (가공 시작 시)
                // mock 모드면 알람을 무시한다.
                bool skipAlarmCheck = req?.skipAlarmCheck != false;
                if (!IsMockCncMachiningEnabled() && !skipAlarmCheck && Mode1Api.TryGetMachineStatus(machineId, out var status, out var statusErr))
                {
                    if (status == MachineStatusType.Alarm)
                    {
                        var alarms = new List<object>();
                        try
                        {
                            if (Mode1Api.TryGetMachineAlarmInfo(machineId, 0, out var alarmInfo0, out var alarmErr0))
                            {
                                if (alarmInfo0.alarmArray != null)
                                {
                                    foreach (var a in alarmInfo0.alarmArray)
                                    {
                                        alarms.Add(new { type = a.type, no = a.no });
                                    }
                                }
                            }
                            else if (Mode1Api.TryGetMachineAlarmInfo(machineId, 1, out var alarmInfo1, out var alarmErr1))
                            {
                                if (alarmInfo1.alarmArray != null)
                                {
                                    foreach (var a in alarmInfo1.alarmArray)
                                    {
                                        alarms.Add(new { type = a.type, no = a.no });
                                    }
                                }
                            }
                        }
                        catch { }

                        if (alarms.Count > 0)
                        {
                            Console.WriteLine("[ManualPlay] blocked by ALARM machine={0}", machineId);
                            return Request.CreateResponse((HttpStatusCode)409, new
                            {
                                success = false,
                                message = "machine is in ALARM state; clear alarm before manual play",
                                status = status.ToString(),
                                alarms = alarms
                            });
                        }
                    }
                }

                // 슬롯 결정: 요청 slotNo 우선, 없으면 현재 활성 슬롯을 피해서 4000/4001 중 선택
                int slotNo;
                if (desired.HasValue)
                {
                    slotNo = desired.Value;
                }
                else
                {
                    var active = GetCurrentActiveSlotOrDefault(machineId);
                    if (active == MANUAL_SLOT_A) slotNo = MANUAL_SLOT_B;
                    else if (active == MANUAL_SLOT_B) slotNo = MANUAL_SLOT_A;
                    else slotNo = MANUAL_SLOT_A; // 기본 4000
                }

                // 선택된 슬롯이 현재 활성 슬롯과 같으면 반대 슬롯 사용 (활성 슬롯 모를 경우 그대로)
                var currentActive = GetCurrentActiveSlotOrDefault(machineId);
                if (currentActive > 0 && slotNo == currentActive)
                {
                    slotNo = (slotNo == MANUAL_SLOT_A) ? MANUAL_SLOT_B : MANUAL_SLOT_A;
                }

                var fullPath = GetSafeBridgeStorePath(relPath);
                if (!File.Exists(fullPath))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
                    {
                        success = false,
                        message = "file not found",
                        path = relPath
                    });
                }

                // 파일을 즉시 업로드 (headType=1 메인)
                var content = File.ReadAllText(fullPath);
                Console.WriteLine("[ManualPlay] file read machine={0} path={1} contentLen={2}", machineId, relPath, content?.Length ?? 0);
                
                var processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(EnsureProgramHeader(content, slotNo)));
                Console.WriteLine("[ManualPlay] file processed machine={0} processedLen={1}", machineId, processed?.Length ?? 0);

                try
                {
                    // Main(headType=1)
                    Mode1Api.TryDeleteMachineProgramInfo(machineId, 1, (short)slotNo, out var _, out var _);
                }
                catch { }

                if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = "handle error: " + errUp });
                }

                // O4000/O4001 슬롯에 업로드할 때는 programNo를 4000/4001로 설정
                short programNo = (short)slotNo;

                var info = new UpdateMachineProgramInfo
                {
                    headType = 1, // Main (사용자 확인: 1=Main, 2=Sub)
                    programNo = programNo,
                    programData = processed,
                    isNew = true,  // 새 프로그램으로 생성 (기존 프로그램이 없을 수 있으므로)
                };
                
                Console.WriteLine("[ManualPlay] uploading machine={0} slot=O{1} programNo={2} dataLen={3}", 
                    machineId, slotNo, programNo, processed?.Length ?? 0);
                
                var upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle, info), "SetMachineProgramInfo.ManualPlay");
                if (upRc == -8)
                {
                    Mode1HandleStore.Invalidate(machineId);
                    if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                    {
                        upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle2, info), "SetMachineProgramInfo.ManualPlay.retry");
                        if (upRc == -8)
                        {
                            Mode1HandleStore.Invalidate(machineId);
                        }
                    }
                    else
                    {
                        Console.WriteLine("[ManualPlay] handle retry error: " + errUp2);
                    }
                }
                if (upRc != 0)
                {
                    Console.WriteLine("[ManualPlay] upload failed machine={0} slot=O{1} programNo={2} rc={3}", 
                        machineId, slotNo, programNo, upRc);
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = "upload failed rc=" + upRc,
                        slotNo,
                        programNo
                    });
                }

                Console.WriteLine("[ManualPlay] upload ok machine={0} slot=O{1} programNo={2}", machineId, slotNo, programNo);

                // 업로드 기록 갱신
                st.LastPreloadedSlot = slotNo;
                st.LastPreloadedPath = relPath;
                st.LastPreloadedAtUtc = DateTime.UtcNow;

                // 업로드 완료 폴링 (최대 20초 대기)
                bool programExists = false;
                int maxRetries = 80;  // 40초 (500ms * 80)
                int retryCount = 0;
                while (retryCount < maxRetries)
                {
                    await Task.Delay(500);
                    retryCount++;

                    if (!Mode1Api.TryGetProgListInfo(machineId, 0, out var progList, out var progErr))
                    {
                        Console.WriteLine("[ManualPlay] TryGetProgListInfo retry={0} failed machine={1} err={2}", retryCount, machineId, progErr);
                        continue;
                    }

                    var found = progList.programArray?.FirstOrDefault(p => p.no == programNo);
                    if (found != null)
                    {
                        programExists = true;
                        Console.WriteLine("[ManualPlay] program verified machine={0} programNo={1} after {2}ms", 
                            machineId, programNo, retryCount * 500);
                        break;
                    }
                }

                // 프로그램이 없으면 업로드 실패로 처리
                if (!programExists)
                {
                    Console.WriteLine("[ManualPlay] program NOT found after polling machine={0} programNo={1} maxRetries={2}", 
                        machineId, programNo, maxRetries);
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = "program not found after upload (timeout)",
                        programNo,
                        slotNo
                    });
                }

                // EDIT 모드로 변경 (프로그램 활성화를 위해 필요)
                if (!Mode1Api.TrySetMachineMode(machineId, "EDIT", out var modeErr))
                {
                    Console.WriteLine("[ManualPlay] SetMachineMode(EDIT) failed machine={0} err={1}", machineId, modeErr);
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = modeErr ?? "SetMachineMode(EDIT) failed" });
                }

                // 모드 변경 후 약간의 지연
                await Task.Delay(300);

                // 모드 변경 후 핸들이 무효화될 수 있으므로 핸들 갱신
                Mode1HandleStore.Invalidate(machineId);

                // Hi-Link 장비/컨트롤러별 headType 매핑 차이 대응:
                // 활성화 시도 (사용자 확인: Main=1, Sub=2)
                var dto = new PayloadUpdateActivateProg
                {
                    headType = 1,
                    programNo = programNo,
                };

                var act = Mode1HandleStore.SetActivateProgram(machineId, dto, out var actErr);
                if (act != 0)
                {
                    Console.WriteLine("[ManualPlay] SetActivateProgram failed (try headType=1) machine={0} programNo={1} result={2} err={3}",
                        machineId, programNo, act, actErr);

                    // fallback: 0 재시도 (혹시 모를 구버전 대응)
                    dto.headType = 0;
                    Mode1HandleStore.Invalidate(machineId);
                    act = Mode1HandleStore.SetActivateProgram(machineId, dto, out actErr);
                }

                if (act != 0)
                {
                    Console.WriteLine("[ManualPlay] SetActivateProgram failed machine={0} programNo={1} headType={2} result={3} err={4}",
                        machineId, programNo, dto.headType, act, actErr);
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = actErr ?? ("SetActivateProgram failed (result=" + act + ")") });
                }

                Console.WriteLine("[ManualPlay] activate ok machine={0} programNo={1} headType={2}", machineId, programNo, dto.headType);

                // AUTO 모드로 변경 (가공 모드)
                if (!Mode1Api.TrySetMachineMode(machineId, "AUTO", out var autoModeErr))
                {
                    Console.WriteLine("[ManualPlay] SetMachineMode(AUTO) failed machine={0} err={1}", machineId, autoModeErr);
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = autoModeErr ?? "SetMachineMode(AUTO) failed" });
                }

                // 모드 변경 후 약간의 지연
                await Task.Delay(300);

                // Start
                short ioUid = 61;
                short panelType = 0;
                if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, true, out var startErr))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = startErr ?? "SetMachinePanelIO failed"
                    });
                }

                Console.WriteLine("[ManualPlay] start signal sent machine={0} slot=O{1}", machineId, slotNo);

                // 주의: 다음 파일 preload는 CncContinuousMachining.PreloadNextJob에서 통합 관리됨
                // Manual play와 continuous machining이 동일한 preload 로직을 공유함

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Manual start ok",
                    slotNo,
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        // POST /raw (Mode1 only)
        [HttpPost]
        [Route("raw")]
        public async Task<HttpResponseMessage> Raw(RawHiLinkRequest raw)
        {
            if (raw == null || string.IsNullOrWhiteSpace(raw.dataType))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "dataType is required" });
            }

            var dataType = raw.dataType.Trim();
            var isAlarm = string.Equals(dataType, "GetMachineAlarmInfo", StringComparison.OrdinalIgnoreCase);
            var isActivateProgram = string.Equals(dataType, "SetActivateProgram", StringComparison.OrdinalIgnoreCase);
            var isGetProgList = string.Equals(dataType, "GetProgListInfo", StringComparison.OrdinalIgnoreCase);
            var isGetActivateProg = string.Equals(dataType, "GetActivateProgInfo", StringComparison.OrdinalIgnoreCase);
            var isGetProgData = string.Equals(dataType, "GetProgDataInfo", StringComparison.OrdinalIgnoreCase);
            var isGetMachineList = string.Equals(dataType, "GetMachineList", StringComparison.OrdinalIgnoreCase);
            var isGetMachineStatus = string.Equals(dataType, "GetMachineStatus", StringComparison.OrdinalIgnoreCase);
            var isGetOpStatus = string.Equals(dataType, "GetOPStatus", StringComparison.OrdinalIgnoreCase);

            // Alarm은 Mode1 API로 처리 (안정성)
            if (isAlarm)
            {
                short headType = 1;
                var headTypeToken = raw.payload?["headType"];
                if (headTypeToken != null)
                {
                    try { headType = (short)headTypeToken.Value<int>(); } catch { }
                }

                if (IsMockCncMachiningEnabled())
                {
                    return Request.CreateResponse(HttpStatusCode.OK, new
                    {
                        success = true,
                        data = new { headType = headType, alarms = new object[0] }
                    });
                }

                if (!Mode1Api.TryGetMachineAlarmInfo(raw.uid, headType, out var data, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = err ?? "GetMachineAlarmInfo failed",
                    });
                }

                var alarms = new List<object>();
                if (data.alarmArray != null)
                {
                    foreach (var a in data.alarmArray)
                    {
                        alarms.Add(new { type = a.type, no = a.no });
                    }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = new { headType = data.headType, alarms }
                });
            }

            // Machine list (Mode1, SSOT=machines.json)
            if (isGetMachineList)
            {
                if (!Mode1Api.TryGetMachineList(out var list, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = err ?? "GetMachineList failed" });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = list });
            }

            // Machine status (Mode1)
            if (isGetMachineStatus || isGetOpStatus)
            {
                if (!Mode1Api.TryGetMachineStatus(raw.uid, out var status, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = err ?? "GetMachineStatus failed" });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = new { status = status.ToString() }
                });
            }

            // Program list (Mode1)
            if (isGetProgList)
            {
                short headType = 1;
                try
                {
                    if (raw.payload != null)
                    {
                        headType = (short)raw.payload.Value<int>();
                    }
                }
                catch { }

                // API headType: 1=메인, 2=서브. Mode1 API는 메인/서브를 0/1로 쓰는 케이스가 있어 0/1로 정규화한다.
                short mapped = (short)Math.Max(0, headType - 1);
                if (!Mode1Api.TryGetProgListInfo(raw.uid, mapped, out var info, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = err ?? "GetProgListInfo failed" });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = info });
            }

            // Activate program info (Mode1)
            if (isGetActivateProg)
            {
                if (!Mode1Api.TryGetActivateProgInfo(raw.uid, out var info, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = err ?? "GetActivateProgInfo failed" });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = info });
            }

            // Program data info (Mode1)
            if (isGetProgData)
            {
                short headType = 1;
                short programNo = 0;
                try
                {
                    if (raw.payload?[("headType")] != null)
                    {
                        headType = (short)raw.payload.Value<int>("headType");
                    }
                    if (raw.payload?[("programNo")] != null)
                    {
                        programNo = (short)raw.payload.Value<int>("programNo");
                    }
                }
                catch { }
                if (programNo <= 0)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
                }
                // API headType: 1=메인, 2=서브. Mode1은 1/2를 그대로 쓰는 DTO가 많아 그대로 전달한다.
                if (!Mode1Api.TryGetProgDataInfo(raw.uid, headType, programNo, out var info, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = err ?? "GetProgDataInfo failed" });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = info });
            }

            // Program 활성화 (Mode1 control)
            if (isActivateProgram)
            {
                var cooldownKey = $"activate:{raw.uid}";
                if (!raw.bypassCooldown && IsControlOnCooldown(cooldownKey))
                {
                    return Request.CreateResponse((HttpStatusCode)429, new
                    {
                        success = false,
                        message = "Too many activate requests"
                    });
                }

                short headType = 1; // 기본 메인
                short programNo = 0;
                try
                {
                    if (raw.payload?["headType"] != null)
                    {
                        headType = (short)raw.payload.Value<int>("headType"); // 1=메인, 2=서브
                    }
                    if (raw.payload?["programNo"] != null)
                    {
                        programNo = (short)raw.payload.Value<int>("programNo");
                    }
                }
                catch { /* fallback to defaults */ }

                if (programNo <= 0)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        success = false,
                        message = "programNo is required"
                    });
                }

                var dto = new PayloadUpdateActivateProg
                {
                    headType = headType, // 1=메인, 2=서브 (실측)
                    programNo = programNo
                };
                var res = Mode1HandleStore.SetActivateProgram(raw.uid, dto, out var err);
                if (res != 0)
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = err ?? $"SetActivateProgram failed (result={res})"
                    });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Program activated",
                    programNo = dto.programNo,
                    headType = dto.headType
                });
            }

            return Request.CreateResponse(HttpStatusCode.BadRequest, new
            {
                success = false,
                message = $"unsupported dataType (mode1-only): {dataType}" +
                          " (Mode2 types like GetMotorTemperature/GetToolLifeInfo are disabled)"
            });
        }

        // 프런트에서 /machines/{id}/raw로 호출하는 경로 호환
        [HttpPost]
        [Route("machines/{machineId}/raw")]
        public Task<HttpResponseMessage> RawForMachine(string machineId, RawHiLinkRequest raw)
        {
            if (raw == null)
            {
                raw = new RawHiLinkRequest();
            }
            if (string.IsNullOrWhiteSpace(raw.uid))
            {
                raw.uid = machineId;
            }
            return Raw(raw);
        }

        // POST /machines/{machineId}/start (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/start")]
        public HttpResponseMessage MachineStart(string machineId, [FromBody] StartStopRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var cooldownKey = $"start:{machineId}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            short ioUid = req?.ioUid ?? 61;
            short panelType = req?.panelType ?? 0;
            bool status = req?.status == null || req?.status == 1;

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[MachineStart] jobId={jobId} accepted. machineId={machineId} ioUid={ioUid}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Start signal job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, status, out var error))
                    {
                        Console.WriteLine($"[MachineStart] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? "SetMachinePanelIO failed" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[MachineStart] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Start signal sent", ioUid, status },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[MachineStart] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // POST /machines/{machineId}/reset (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/reset")]
        public HttpResponseMessage MachineReset(string machineId)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var cooldownKey = $"reset:{machineId}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[MachineReset] jobId={jobId} accepted. machineId={machineId}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Reset job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    Mode1HandleStore.Invalidate(machineId);

                    if (!Mode1Api.TrySetMachineReset(machineId, out var error))
                    {
                        var msg = (error ?? "SetMachineReset failed") as string;
                        if (!string.IsNullOrEmpty(msg) && msg.Contains("result=-8"))
                        {
                            msg = msg + " (무효 핸들러: 다시 시도하세요)";
                        }
                        Console.WriteLine($"[MachineReset] jobId={jobId} failed: {msg}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = msg },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[MachineReset] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Machine reset completed" },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[MachineReset] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        public class MachineModeRequest
        {
            public string mode { get; set; }
        }

        // POST /machines/{machineId}/mode (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/mode")]
        public HttpResponseMessage MachineMode(string machineId, [FromBody] MachineModeRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var mode = (req?.mode ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(mode))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "mode is required (EDIT/AUTO)" });
            }

            var cooldownKey = $"mode:{machineId}:{mode.ToUpperInvariant()}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[MachineMode] jobId={jobId} accepted. machineId={machineId} mode={mode}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Mode change job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    if (!Mode1Api.TrySetMachineMode(machineId, mode, out var error))
                    {
                        Console.WriteLine($"[MachineMode] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? "SetMachineMode failed" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[MachineMode] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Mode switched", mode = mode.ToUpperInvariant() },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[MachineMode] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // POST /machines/{machineId}/programs/activate-sub (Mode1, headType 기본 1)
        [HttpPost]
        [Route("machines/{machineId}/programs/activate-sub")]
        public HttpResponseMessage ActivateProgramSub(string machineId, [FromBody] ActivateProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (req == null || !req.programNo.HasValue || req.programNo.Value <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var dto = new PayloadUpdateActivateProg
            {
                // 실측: headType 1=메인, 2=서브
                headType = 2,
                programNo = req.programNo.Value
            };

            // 서브 활성화 시 핸들을 초기화하여 Main/기존 상태 캐시 영향을 줄인다.
            Mode1HandleStore.Invalidate(machineId);

            var res = Mode1HandleStore.SetActivateProgram(machineId, dto, out var error);
            if (res != 0)
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? $"SetActivateProgram failed (result={res})"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Program activated",
                programNo = dto.programNo,
                headType = dto.headType
            });
        }

        // POST /machines/{machineId}/stop (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/stop")]
        public HttpResponseMessage MachineStop(string machineId, [FromBody] StartStopRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var cooldownKey = $"stop:{machineId}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            short ioUid = req?.ioUid ?? 62;
            short panelType = req?.panelType ?? 0;
            bool status = req?.status == null || req?.status == 1;

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[MachineStop] jobId={jobId} accepted. machineId={machineId} ioUid={ioUid}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Stop signal job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, status, out var error))
                    {
                        Console.WriteLine($"[MachineStop] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? "SetMachinePanelIO failed" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[MachineStop] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Stop signal sent", ioUid, status },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[MachineStop] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // GET /machines/{machineId}/status
        [HttpGet]
        [Route("machines/{machineId}/status")]
        public HttpResponseMessage MachineStatus(string machineId)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (!Mode1Api.TryGetMachineStatus(machineId, out var status, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "GetMachineStatus failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                status = status.ToString()
            });
        }

        // GET /machines/{machineId}/alarms (Mode1)
        [HttpGet]
        [Route("machines/{machineId}/alarms")]
        public HttpResponseMessage GetMachineAlarms(string machineId, short headType = 1)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (IsMockCncMachiningEnabled())
            {
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = new { headType = headType, alarms = new object[0] }
                });
            }

            if (!Mode1Api.TryGetMachineAlarmInfo(machineId, headType, out var data, out var err))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = err ?? "GetMachineAlarmInfo failed",
                });
            }

            var alarms = new List<object>();
            if (data.alarmArray != null)
            {
                foreach (var a in data.alarmArray)
                {
                    alarms.Add(new { type = a.type, no = a.no });
                }
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = new { headType = data.headType, alarms }
            });
        }

        public class StartStopRequest
        {
            public short? ioUid { get; set; }
            public short? panelType { get; set; }
            public int? status { get; set; }
        }

        // POST /machines/{machineId}/smart/download (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/smart/download")]
        public HttpResponseMessage SmartDownloadProgram(string machineId, [FromBody] DownloadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var headType = req?.headType ?? (short)1;
            var programNo = req?.programNo ?? (short)0;
            var relPath = (req?.path ?? string.Empty).Trim();

            if (programNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[SmartDownload] jobId={jobId} accepted. machineId={machineId} headType={headType} programNo={programNo} path={relPath}");

            // 즉시 응답: 작업 수락됨
            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Smart download job accepted",
                jobId = jobId,
                machineId = machineId,
                headType,
                programNo,
            });

            // 백그라운드에서 작업 처리
            Task.Run(() =>
            {
                try
                {
                    var cooldownKey = $"downloadProgram:{machineId}:{headType}:{programNo}";
                    if (IsRawReadOnCooldown(cooldownKey))
                    {
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = "Too many requests" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    if (!TryGetProgramDataPreferMode1(machineId, headType, programNo, out var programData, out var error))
                    {
                        Console.WriteLine($"[SmartDownload] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? "GetMachineProgramData failed" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    int length = (programData ?? string.Empty).Length;
                    string savedPath = null;

                    if (!string.IsNullOrWhiteSpace(relPath))
                    {
                        try
                        {
                            var fullPath = GetSafeBridgeStorePath(relPath);
                            var dir = Path.GetDirectoryName(fullPath);
                            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                            {
                                Directory.CreateDirectory(dir);
                            }
                            File.WriteAllText(fullPath, programData ?? string.Empty, Encoding.ASCII);
                            savedPath = relPath;
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[SmartDownload] jobId={jobId} file write failed: {ex.Message}");
                        }
                    }

                    Console.WriteLine($"[SmartDownload] jobId={jobId} completed. length={length} path={savedPath}");

                    var resultObj = new
                    {
                        success = true,
                        headType,
                        slotNo = programNo,
                        path = savedPath,
                        length,
                        warning = (string)null,
                    };

                    if (!string.IsNullOrEmpty(error) && error.StartsWith("TRUNCATED:"))
                    {
                        resultObj = new
                        {
                            success = true,
                            headType,
                            slotNo = programNo,
                            path = savedPath,
                            length,
                            warning = error,
                        };
                    }

                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = resultObj,
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SmartDownload] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // GET /machines/{machineId}/programs (Mode1) - 레거시 호환
        [HttpGet]
        [Route("machines/{machineId}/programs")]
        public async Task<HttpResponseMessage> GetProgramList(string machineId, short headType = 1, short? slotNo = null, string path = null)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            // slotNo가 있으면: 프로그램 1개 다운로드(필요 시 파일 저장) - 레거시 호환
            if (slotNo.HasValue && slotNo.Value > 0)
            {
                var programNo = slotNo.Value;
                var relPath = (path ?? string.Empty).Trim();

                var cooldownKey = $"downloadProgram:get:{machineId}:{headType}:{programNo}";
                if (IsRawReadOnCooldown(cooldownKey))
                {
                    return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
                }

                if (!TryGetProgramDataPreferMode1(machineId, headType, programNo, out var programData, out var error))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = error ?? "GetMachineProgramData failed",
                    });
                }

                try
                {
                    int length = (programData ?? string.Empty).Length;
                    string savedPath = null;

                    if (!string.IsNullOrWhiteSpace(relPath))
                    {
                        var fullPath = GetSafeBridgeStorePath(relPath);
                        var dir = Path.GetDirectoryName(fullPath);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                        {
                            Directory.CreateDirectory(dir);
                        }
                        File.WriteAllText(fullPath, programData ?? string.Empty, Encoding.ASCII);
                        savedPath = relPath;
                    }

                    var resp = new
                    {
                        success = true,
                        headType,
                        slotNo = programNo,
                        path = savedPath,
                        length,
                        warning = (string)null,
                    };

                    if (!string.IsNullOrEmpty(error) && error.StartsWith("TRUNCATED:"))
                    {
                        return Request.CreateResponse(HttpStatusCode.OK, new
                        {
                            success = true,
                            headType,
                            slotNo = programNo,
                            path = savedPath,
                            length,
                            warning = error,
                        });
                    }

                    return Request.CreateResponse(HttpStatusCode.OK, new
                    {
                        success = true,
                        headType,
                        slotNo = programNo,
                        path = savedPath,
                        length,
                    });
                }
                catch (Exception ex)
                {
                    return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                    {
                        success = false,
                        message = ex.Message,
                    });
                }
            }

            var timeoutMs = 2500;
            var task = System.Threading.Tasks.Task.Factory.StartNew(() =>
            {
                MachineProgramListInfo info;
                string error;
                var ok = Mode1Api.TryGetProgListInfo(machineId, headType, out info, out error);
                return (ok: ok, info: info, error: error);
            }, System.Threading.Tasks.TaskCreationOptions.LongRunning);

            var completed = await System.Threading.Tasks.Task.WhenAny(task, System.Threading.Tasks.Task.Delay(timeoutMs));
            if (completed != task)
            {
                Mode1HandleStore.Invalidate(machineId);
                return Request.CreateResponse((HttpStatusCode)504, new
                {
                    success = false,
                    message = $"GetMachineProgramListInfo timeout (>{timeoutMs}ms)"
                });
            }

            var result = await task;
            if (!result.ok)
            {
                var msg = (result.error ?? "GetMachineProgramListInfo failed") as string;
                if (!string.IsNullOrEmpty(msg) && msg.Contains("result=-8"))
                {
                    msg = msg + " (무효 핸들러: 다시 시도하세요)";
                }
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = msg
                });
            }

            // headType을 명시적으로 설정
            var responseInfo = result.info;
            responseInfo.headType = headType;
            
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = responseInfo
            });
        }

        public class UploadProgramRequest
        {
            public short? headType { get; set; }
            public int? slotNo { get; set; }
            public string path { get; set; }
            public bool? isNew { get; set; }
        }

        public class SmartUploadProgramRequest
        {
            public short? headType { get; set; }
            public string path { get; set; }
            public bool? isNew { get; set; }
        }

        // POST /machines/{machineId}/programs (Mode1)
        [HttpPost]
        [Route("machines/{machineId}/programs")]
        public HttpResponseMessage UploadProgram(string machineId, [FromBody] UploadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var headType = req?.headType ?? (short)1;
            var slotNo = req?.slotNo ?? 0;
            if (slotNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "slotNo is required" });
            }

            var relPath = (req?.path ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(relPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
            }

            try
            {
                var fullPath = GetSafeBridgeStorePath(relPath);
                if (!File.Exists(fullPath))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
                    {
                        success = false,
                        message = "file not found",
                        path = relPath
                    });
                }

                var content = File.ReadAllText(fullPath);
                var processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(EnsureProgramHeader(content, slotNo)));

                Task.Run(() =>
                {
                    try
                    {
                        try
                        {
                            Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)slotNo, out var _, out var _);
                        }
                        catch { }

                        if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                        {
                            Console.WriteLine("[UploadProgram] handle error: " + errUp);
                            return;
                        }

                        var info = new UpdateMachineProgramInfo
                        {
                            headType = headType,
                            programNo = (short)slotNo,
                            programData = processed,
                            isNew = req?.isNew ?? true,
                        };
                        var upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle, info), "SetMachineProgramInfo.UploadProgram");
                        if (upRc == -8)
                        {
                            Mode1HandleStore.Invalidate(machineId);
                            if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                            {
                                upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle2, info), "SetMachineProgramInfo.UploadProgram.retry");
                                if (upRc == -8)
                                {
                                    Mode1HandleStore.Invalidate(machineId);
                                }
                            }
                            else
                            {
                                Console.WriteLine("[UploadProgram] handle retry error: " + errUp2);
                            }
                        }
                        if (upRc != 0)
                        {
                            Console.WriteLine("[UploadProgram] upload failed rc={0} for {1}", upRc, machineId);
                            return;
                        }
                        Console.WriteLine("[UploadProgram] success: {0} headType={1} slot={2}", machineId, headType, slotNo);
                    }
                    catch (Exception bgEx)
                    {
                        Console.WriteLine("[UploadProgram] background error: " + bgEx);
                    }
                });

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Program upload queued",
                    headType,
                    slotNo,
                    path = relPath,
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        public class DownloadProgramRequest
        {
            public short? headType { get; set; }
            public short? programNo { get; set; }
            public string path { get; set; }
        }

        // POST /machines/{machineId}/programs/download (Mode1)
        [HttpPost]
        [Route("machines/{machineId}/programs/download")]
        public HttpResponseMessage DownloadProgram(string machineId, [FromBody] DownloadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var headType = req?.headType ?? (short)1;
            var programNo = req?.programNo ?? (short)0;
            if (programNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var relPath = (req?.path ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(relPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
            }

            var cooldownKey = $"downloadProgram:{machineId}:{headType}:{programNo}";
            if (IsRawReadOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            if (!TryGetProgramDataPreferMode1(machineId, headType, programNo, out var programData, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "GetMachineProgramData failed",
                });
            }

            try
            {
                var fullPath = GetSafeBridgeStorePath(relPath);
                var dir = Path.GetDirectoryName(fullPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                File.WriteAllText(fullPath, programData ?? string.Empty, Encoding.ASCII);

                if (!string.IsNullOrEmpty(error) && error.StartsWith("TRUNCATED:"))
                {
                    return Request.CreateResponse(HttpStatusCode.OK, new
                    {
                        success = true,
                        headType,
                        programNo,
                        path = relPath,
                        length = (programData ?? string.Empty).Length,
                        warning = error,
                    });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    headType,
                    programNo,
                    path = relPath,
                    length = (programData ?? string.Empty).Length,
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = ex.Message,
                });
            }
        }

        // GET /machines/{machineId}/programs/active (Mode1)
        [HttpGet]
        [Route("machines/{machineId}/programs/active")]
        public HttpResponseMessage GetActiveProgram(string machineId)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (!Mode1Api.TryGetActivateProgInfo(machineId, out var info, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "GetMachineActivateProgInfo failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = info
            });
        }

        public class ActivateProgramRequest
        {
            public short? headType { get; set; }
            public short? programNo { get; set; }
        }

        public class DeleteProgramRequest
        {
            public short? headType { get; set; }
            public short? programNo { get; set; }
        }

        // POST /machines/{machineId}/programs/delete (Mode1) (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/programs/delete")]
        public HttpResponseMessage DeleteProgram(string machineId, [FromBody] DeleteProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var headType = req?.headType ?? (short)0;
            var programNo = req?.programNo ?? (short)0;
            if (programNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var cooldownKey = $"deleteProgram:{machineId}:{headType}:{programNo}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[DeleteProgram] jobId={jobId} accepted. machineId={machineId} programNo={programNo}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Delete program job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    if (!Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, programNo, out var activateProgNum, out var error))
                    {
                        Console.WriteLine($"[DeleteProgram] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? "DeleteMachineProgramInfo failed" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[DeleteProgram] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Program deleted", headType, programNo, activateProgNum },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[DeleteProgram] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // POST /machines/{machineId}/programs/activate (Mode1) (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/programs/activate")]
        public HttpResponseMessage ActivateProgram(string machineId, [FromBody] ActivateProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (req == null || !req.programNo.HasValue || req.programNo.Value <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var dto = new PayloadUpdateActivateProg
            {
                headType = req.headType ?? 1,
                programNo = req.programNo.Value
            };

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[ActivateProgram] jobId={jobId} accepted. machineId={machineId} programNo={dto.programNo}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Activate program job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    var res = Mode1HandleStore.SetActivateProgram(machineId, dto, out var error);
                    if (res != 0)
                    {
                        Console.WriteLine($"[ActivateProgram] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? $"SetActivateProgram failed (result={res})" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[ActivateProgram] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Program activated", programNo = dto.programNo, headType = dto.headType },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[ActivateProgram] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // POST /machines/{machineId}/continuous/enqueue
        [HttpPost]
        [Route("machines/{machineId}/continuous/enqueue")]
        public HttpResponseMessage EnqueueContinuousJob(string machineId, [FromBody] JObject payload)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (payload == null)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "payload is required" });
            }

            try
            {
                var fileName = payload.Value<string>("fileName");
                var originalFileName = payload.Value<string>("originalFileName");
                var requestId = payload.Value<string>("requestId");
                var jobId = payload.Value<string>("jobId") ?? Guid.NewGuid().ToString();
                var bridgePath = payload.Value<string>("bridgePath");
                var s3Key = payload.Value<string>("s3Key");
                var s3Bucket = payload.Value<string>("s3Bucket");
                var enqueueFront = payload.Value<bool?>("enqueueFront") ?? false;

                if (string.IsNullOrEmpty(fileName))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "fileName is required" });
                }

                var job = new CncJobItem
                {
                    id = jobId,
                    fileName = fileName,
                    requestId = requestId,
                    kind = CncJobKind.File
                };

                var enqueued = CncMachining.EnqueueFileJob(
                    machineId,
                    job.fileName,
                    job.requestId,
                    bridgePath,
                    s3Key,
                    s3Bucket,
                    enqueueFront,
                    originalFileName
                );
                if (enqueued == null)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        success = false,
                        message = "failed to enqueue job"
                    });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Job enqueued for continuous machining",
                    jobId = jobId,
                    machineId = machineId
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = ex.Message
                });
            }
        }

        // GET /machines/{machineId}/continuous/state
        [HttpGet]
        [Route("machines/{machineId}/continuous/state")]
        public HttpResponseMessage GetContinuousState(string machineId)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var state = CncMachining.GetMachineState(machineId);
            if (state == null)
            {
                return Request.CreateResponse(HttpStatusCode.NotFound, new
                {
                    success = false,
                    message = "Machine state not found"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = state
            });
        }
    }
}