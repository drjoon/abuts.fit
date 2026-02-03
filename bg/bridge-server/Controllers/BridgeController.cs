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
        private static readonly HiLinkMode2Client Mode2Client = new HiLinkMode2Client();
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
                        Console.WriteLine("[HighLevelUpload] handle error: " + errUp);
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
                            Console.WriteLine("[HighLevelUpload] handle retry error: " + errUp2);
                        }
                    }
                    if (upRc != 0)
                    {
                        Console.WriteLine("[HighLevelUpload] upload failed rc={0} for {1}", upRc, machineId);
                        return;
                    }
                    Console.WriteLine("[HighLevelUpload] success: {0} headType={1} slot={2}", machineId, headType, slotNo);
                }
                catch (Exception ex)
                {
                    Console.WriteLine("[HighLevelUpload] background error: " + ex);
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

                // Mode2 headType: Main=0, Sub=1
                var busyWaitMaxMs = 20000;
                var busyStarted = DateTime.UtcNow;
                var mode2HeadType = (short)Math.Max(0, (int)headType - 1);
                var info2 = new UpdateMachineProgramInfo
                {
                    headType = mode2HeadType,
                    programNo = (short)slotNo,
                    programData = processed,
                    isNew = isNew,
                };

                // EW_BUSY(-1)면 CNC processing 중이므로 2초 단위로 대기 후 재시도한다.
                for (var attempt = 0; ; attempt++)
                {
                    object resp;
                    try
                    {
                        resp = Mode2Client.RequestRawAsync(machineId, CollectDataType.UpdateProgram, info2, 15000)
                            .GetAwaiter()
                            .GetResult();
                    }
                    catch (Exception ex)
                    {
                        error = $"Mode1 failed: {mode1Error}; Mode2 UpdateProgram exception: {ex.Message}";
                        return false;
                    }

                    int rc;
                    if (resp is short s) rc = s;
                    else if (resp is int i) rc = i;
                    else rc = -1;

                    if (rc == 0)
                    {
                        usedMode = "Mode2";
                        return true;
                    }
                    if (rc == -1)
                    {
                        var elapsedMs = (int)(DateTime.UtcNow - busyStarted).TotalMilliseconds;
                        if (elapsedMs >= busyWaitMaxMs)
                        {
                            error = $"Mode1 failed: {mode1Error}; Mode2 UpdateProgram failed (result=-1, EW_BUSY, waitedMs={elapsedMs})";
                            return false;
                        }
                        System.Threading.Thread.Sleep(1000);
                        continue;
                    }

                    error = $"Mode1 failed: {mode1Error}; Mode2 UpdateProgram failed (result={rc})";
                    return false;
                }
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
            while (true)
            {
                if ((DateTime.UtcNow - started).TotalSeconds > timeoutSeconds) return false;

                if (Mode1Api.TryGetProgListInfo(machineId, headType, out var progList, out var _))
                {
                    try
                    {
                        var list = progList.programArray;
                        if (list == null) continue;

                        foreach (var p in list)
                        {
                            if (p.no == slotNo) return true;
                        }
                    }
                    catch { }
                }

                await Task.Delay(1000);
            }
        }

        private static bool TryGetProgramDataPreferMode1(string machineId, short headType, short programNo, out string programData, out string error)
        {
            programData = null;
            error = null;

            var gotAny = false;
            var mode1Data = (string)null;
            var mode2Data = (string)null;
            var mode1Err = (string)null;
            var mode2Err = (string)null;

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

            try
            {
                var mode2HeadType = (short)Math.Max(0, (int)headType - 1);
                var req = new GetProgramData();
                req.machineProgramData = new Hi_Link.Libraries.Model.MachineProgramData
                {
                    headType = mode2HeadType,
                    programNo = programNo,
                };

                var resp = Mode2Client.RequestRawAsync(machineId, CollectDataType.GetProgDataInfo, req, 15000)
                    .GetAwaiter()
                    .GetResult();

                if (resp is GetProgramData gp)
                {
                    gotAny = true;
                    var mp = gp.machineProgramData;
                    mode2Data = mp.programData ?? string.Empty;
                    Console.WriteLine($"[DownloadProgram] Mode2 programData length={mode2Data.Length} uid={machineId} headType={headType} programNo={programNo}");
                }
                else if (resp is Hi_Link.Libraries.Model.MachineProgramData mpd)
                {
                    gotAny = true;
                    mode2Data = mpd.programData ?? string.Empty;
                    Console.WriteLine($"[DownloadProgram] Mode2 programData length={mode2Data.Length} uid={machineId} headType={headType} programNo={programNo}");
                }
            }
            catch (Exception ex)
            {
                mode2Err = ex.Message;
                Console.WriteLine($"[DownloadProgram] Mode2 exception uid={machineId} headType={headType} programNo={programNo} ex={mode2Err}");
            }

            if (!gotAny)
            {
                error = mode1Err ?? mode2Err ?? "GetMachineProgramData failed";
                return false;
            }

            if (!string.IsNullOrEmpty(mode2Data) && (mode1Data == null || mode2Data.Length > mode1Data.Length))
            {
                programData = mode2Data;
                // Mode1/Mode2 모두 동일 길이면 Hi-Link API 제한으로 truncated
                if (!string.IsNullOrEmpty(mode1Data) && mode1Data.Length == mode2Data.Length && mode2Data.Length > 90000)
                {
                    error = $"TRUNCATED: Hi-Link API readback limit (~103KB). Actual program may be larger. Downloaded {mode2Data.Length} bytes.";
                    Console.WriteLine($"[DownloadProgram] Warning: programData truncated by Hi-Link readback limit (len={mode2Data.Length}) uid={machineId} headType={headType} programNo={programNo}");
                }
                return true;
            }

            programData = mode1Data ?? string.Empty;
            if (programData.Length == 0 && !string.IsNullOrEmpty(mode1Err) && !string.IsNullOrEmpty(mode2Err))
            {
                error = $"Mode1 error: {mode1Err}; Mode2 error: {mode2Err}";
            }
            else
            {
                // Mode1/Mode2 모두 특정 상한(예: 102480)으로 동일하게 잘리는 경우가 있어, 진단 메시지를 남긴다.
                if (!string.IsNullOrEmpty(mode1Data) && !string.IsNullOrEmpty(mode2Data) && mode1Data.Length == mode2Data.Length && mode1Data.Length > 90000)
                {
                    error = $"TRUNCATED: Hi-Link API readback limit (~103KB). Actual program may be larger. Downloaded {mode1Data.Length} bytes.";
                    Console.WriteLine($"[DownloadProgram] Warning: programData truncated by Hi-Link readback limit (len={mode1Data.Length}) uid={machineId} headType={headType} programNo={programNo}");
                }
            }
            return true;
        }

        private class HighLevelStartJob
        {
            public string JobId;
            public short HeadType;
            public List<string> Paths;
            public int MaxWaitSeconds;

            public int Index;
            public int CurrentSlot;
            public int PreviousSlot;
            public int ProductCountBefore;

            public DateTime StartedAtUtc;
            public DateTime? FinishedAtUtc;
            public string Status;
            public string ErrorCode;
            public string ErrorMessage;
        }

        private class HighLevelMachineQueue
        {
            public readonly object Sync = new object();
            public readonly Queue<HighLevelStartJob> Jobs = new Queue<HighLevelStartJob>();
            public bool WorkerRunning;
            public HighLevelStartJob Current;
        }

        private static readonly ConcurrentDictionary<string, HighLevelMachineQueue> HighLevelStartQueues =
            new ConcurrentDictionary<string, HighLevelMachineQueue>(StringComparer.OrdinalIgnoreCase);

        private static HighLevelMachineQueue GetOrCreateHighLevelQueue(string machineId)
        {
            return HighLevelStartQueues.GetOrAdd(machineId, _ => new HighLevelMachineQueue());
        }

        private static async Task<bool> WaitUntilIdleOrTimeout(string machineId, int maxWaitSeconds)
        {
            var started = DateTime.UtcNow;
            while (true)
            {
                if (CncMachineSignalUtils.TryGetMachineBusy(machineId, out var busy) && busy)
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
                if (CncMachineSignalUtils.TryGetMachineBusy(machineId, out var busy) && busy)
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

        private static bool IsAlarm(string machineId, out string error)
        {
            error = null;
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
            var q = GetOrCreateHighLevelQueue(machineId);
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
                        HighLevelStartJob job = null;
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
                        }

                        try
                        {
                            job.Status = "RUNNING";
                            await RunHighLevelStartJob(machineId, job);
                            job.Status = "DONE";
                            job.FinishedAtUtc = DateTime.UtcNow;
                        }
                        catch (Exception ex)
                        {
                            job.Status = "FAILED";
                            job.ErrorCode = job.ErrorCode ?? "EXCEPTION";
                            job.ErrorMessage = job.ErrorMessage ?? ex.Message;
                            job.FinishedAtUtc = DateTime.UtcNow;
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
                    Console.WriteLine("[HighLevelStartWorker] fatal: " + ex);
                    lock (q.Sync)
                    {
                        q.WorkerRunning = false;
                    }
                }
            });
        }

        private static async Task RunHighLevelStartJob(string machineId, HighLevelStartJob job)
        {
            if (job == null) throw new ArgumentNullException(nameof(job));
            if (job.Paths == null || job.Paths.Count == 0) return;

            // 시작 슬롯 결정(현재 활성/가공중 프로그램 피하기)
            job.CurrentSlot = ChooseManualSlotForUpload(machineId);
            job.PreviousSlot = 0;

            // 첫 파일을 현재 슬롯에 업로드(가공 전)
            {
                var rel = job.Paths[0];
                var full = GetSafeBridgeStorePath(rel);
                if (!File.Exists(full))
                {
                    job.ErrorCode = "FILE_NOT_FOUND";
                    job.ErrorMessage = "file not found";
                    throw new FileNotFoundException("file not found", full);
                }
                var content = File.ReadAllText(full);
                var enforced = EnsurePercentAndHeaderSecondLine(content, job.CurrentSlot);
                var processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(enforced));
                if (!UploadProgramDataBlocking(machineId, job.HeadType, job.CurrentSlot, processed, true, out var _, out var upErr0))
                {
                    job.ErrorCode = "UPLOAD_FAILED";
                    job.ErrorMessage = upErr0;
                    throw new InvalidOperationException(job.ErrorMessage);
                }
                if (!await VerifyProgramExists(machineId, job.HeadType, job.CurrentSlot, 40))
                {
                    job.ErrorCode = "UPLOAD_VERIFY_FAILED";
                    job.ErrorMessage = "program not found after upload";
                    throw new TimeoutException(job.ErrorMessage);
                }
            }

            for (job.Index = 0; job.Index < job.Paths.Count; job.Index++)
            {
                var thisSlot = job.CurrentSlot;
                var nextSlot = thisSlot == MANUAL_SLOT_A ? MANUAL_SLOT_B : MANUAL_SLOT_A;

                // 다음 사이클에서 바로 활성화할 수 있도록, 현재 슬롯 프로그램이 존재하는지 확인
                if (!await VerifyProgramExists(machineId, job.HeadType, thisSlot, 40))
                {
                    job.ErrorCode = "PROGRAM_MISSING";
                    job.ErrorMessage = "program not found on machine (currentSlot)";
                    throw new InvalidOperationException(job.ErrorMessage);
                }

                // 1) 장비 상태 확인 : 가공중이면 대기
                if (!await WaitUntilIdleOrTimeout(machineId, job.MaxWaitSeconds))
                {
                    job.ErrorCode = "WAIT_IDLE_TIMEOUT";
                    job.ErrorMessage = "wait for idle timeout";
                    throw new TimeoutException(job.ErrorMessage);
                }

                // 3) 비정상 종료(Alarm)면 중단
                if (IsAlarm(machineId, out var alarmErr0))
                {
                    job.ErrorCode = "ALARM";
                    job.ErrorMessage = alarmErr0 ?? "machine is in ALARM state";
                    throw new InvalidOperationException(job.ErrorMessage);
                }

                // 4) 생산 수량(시작 전) 기록
                job.ProductCountBefore = 0;
                CncMachineSignalUtils.TryGetProductCount(machineId, out job.ProductCountBefore);

                // 5) Edit 모드 변경
                if (!Mode1Api.TrySetMachineMode(machineId, "EDIT", out var editErr))
                {
                    job.ErrorCode = "SET_MODE_EDIT_FAILED";
                    job.ErrorMessage = editErr ?? "SetMachineMode(EDIT) failed";
                    throw new InvalidOperationException(job.ErrorMessage);
                }
                await Task.Delay(500);

                // 6) 활성화 프로그램 변경
                var actDto = new PayloadUpdateActivateProg { headType = 1, programNo = (short)thisSlot };
                var actRc = Mode1HandleStore.SetActivateProgram(machineId, actDto, out var actErr);
                if (actRc != 0)
                {
                    job.ErrorCode = "ACTIVATE_FAILED";
                    job.ErrorMessage = actErr ?? ("SetActivateProgram failed (result=" + actRc + ")");
                    throw new InvalidOperationException(job.ErrorMessage);
                }

                // 7) Auto 모드 변경
                if (!Mode1Api.TrySetMachineMode(machineId, "AUTO", out var autoErr))
                {
                    job.ErrorCode = "SET_MODE_AUTO_FAILED";
                    job.ErrorMessage = autoErr ?? "SetMachineMode(AUTO) failed";
                    throw new InvalidOperationException(job.ErrorMessage);
                }
                await Task.Delay(500);

                // 8) 가공 시작 명령
                if (!Mode1Api.TrySetMachinePanelIO(machineId, 0, (short)Config.CncStartIoUid, true, out var startErr))
                {
                    job.ErrorCode = "START_FAILED";
                    job.ErrorMessage = startErr ?? "Start signal failed";
                    throw new InvalidOperationException(job.ErrorMessage);
                }

                // 10) 가공 중 다음 작업 선업로드 (사이클타임 절감)
                if (job.Index + 1 < job.Paths.Count)
                {
                    var nextPath = job.Paths[job.Index + 1];
                    var nextFull = GetSafeBridgeStorePath(nextPath);
                    if (!File.Exists(nextFull))
                    {
                        job.ErrorCode = "FILE_NOT_FOUND";
                        job.ErrorMessage = "file not found";
                        throw new FileNotFoundException("file not found", nextFull);
                    }
                    var nextContent = File.ReadAllText(nextFull);
                    var enforcedNext = EnsurePercentAndHeaderSecondLine(nextContent, nextSlot);
                    var processedNext = SanitizeProgramTextForCnc(EnsureProgramEnvelope(enforcedNext));

                    if (!UploadProgramDataBlocking(machineId, job.HeadType, nextSlot, processedNext, true, out var _, out var upErr1))
                    {
                        job.ErrorCode = "UPLOAD_FAILED";
                        job.ErrorMessage = upErr1;
                        throw new InvalidOperationException(job.ErrorMessage);
                    }
                    if (!await VerifyProgramExists(machineId, job.HeadType, nextSlot, 40))
                    {
                        job.ErrorCode = "UPLOAD_VERIFY_FAILED";
                        job.ErrorMessage = "program not found after upload";
                        throw new TimeoutException(job.ErrorMessage);
                    }
                }

                // 2) 가공 종료 대기
                if (!await WaitUntilDoneOrTimeout(machineId, job.MaxWaitSeconds))
                {
                    job.ErrorCode = "WAIT_DONE_TIMEOUT";
                    job.ErrorMessage = "wait for machining end timeout";
                    throw new TimeoutException(job.ErrorMessage);
                }

                // 3) 비정상 종료(Alarm)면 중단
                if (IsAlarm(machineId, out var alarmErr1))
                {
                    job.ErrorCode = "ALARM";
                    job.ErrorMessage = alarmErr1 ?? "machine is in ALARM state";
                    throw new InvalidOperationException(job.ErrorMessage);
                }

                // 4) 생산 수량 +1 확인
                if (!await WaitForProductCountIncrease(machineId, job.ProductCountBefore, 120))
                {
                    job.ErrorCode = "PRODUCT_COUNT_NOT_INCREASED";
                    job.ErrorMessage = "product count did not increase";
                    throw new TimeoutException(job.ErrorMessage);
                }

                // 9) 이전 가공프로그램 삭제
                if (job.PreviousSlot > 0)
                {
                    Mode1Api.TryDeleteMachineProgramInfo(machineId, job.HeadType, (short)job.PreviousSlot, out var _, out var _);
                }

                job.PreviousSlot = thisSlot;
                job.CurrentSlot = nextSlot;
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
                        var upRc = Hi_Link.HiLink.SetMachineProgramInfo(handle, info);
                        if (upRc == -8)
                        {
                            Mode1HandleStore.Invalidate(machineId);
                            if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                            {
                                upRc = Hi_Link.HiLink.SetMachineProgramInfo(handle2, info);
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
        public async Task<HttpResponseMessage> SmartUploadProgram(string machineId, [FromBody] HighLevelUploadProgramRequest req)
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

            var slotNo = ChooseManualSlotForUpload(machineId);

            try
            {
                var responseLogs = new List<string>();

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
                var enforced = EnsurePercentAndHeaderSecondLine(content, slotNo);
                var processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(enforced));

                var processedLen = (processed ?? string.Empty).Length;
                var processedBytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);

                // 활성 프로그램 슬롯(4000/4001)이면 삭제 금지.
                // 가공중 여부와 무관하게 활성 슬롯은 보호한다(사용자 요구).
                var activeSlot = 0;
                if (Mode1Api.TryGetActivateProgInfo(machineId, out var activeInfo0, out var _))
                {
                    activeSlot = ParseProgramNoFromName(activeInfo0.MainProgramName);
                    if (activeSlot <= 0) activeSlot = ParseProgramNoFromName(activeInfo0.SubProgramName);
                }

                var protectedSlot = (activeSlot == MANUAL_SLOT_A || activeSlot == MANUAL_SLOT_B) ? activeSlot : 0;

                // 4000/4001 중 보호 슬롯이 아니면 무조건 삭제하여 메모리 확보 후 업로드
                var deletedSlots = new List<int>();
                foreach (var s in new[] { MANUAL_SLOT_A, MANUAL_SLOT_B })
                {
                    if (protectedSlot == s) continue;
                    try
                    {
                        Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)s, out var _, out var _);
                        deletedSlots.Add(s);
                    }
                    catch
                    {
                    }
                }

                // 보호 슬롯이 있으면 반대 슬롯으로 강제 업로드
                if (protectedSlot == MANUAL_SLOT_A) slotNo = MANUAL_SLOT_B;
                else if (protectedSlot == MANUAL_SLOT_B) slotNo = MANUAL_SLOT_A;

                // 슬롯이 바뀌었으면 헤더도 다시 강제
                enforced = EnsurePercentAndHeaderSecondLine(content, slotNo);
                processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(enforced));
                processedLen = (processed ?? string.Empty).Length;
                processedBytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);

                responseLogs.Add($"activeSlot={activeSlot}");
                responseLogs.Add($"protectedSlot={protectedSlot}");
                responseLogs.Add($"deletedSlots=[{string.Join(",", deletedSlots)}]");
                responseLogs.Add($"uploadSlot={slotNo}");
                responseLogs.Add($"fileBytes={processedBytes}");

                Console.WriteLine($"[SmartUpload] activeSlot={activeSlot} protectedSlot={protectedSlot} deletedSlots=[{string.Join(",", deletedSlots)}] uploadSlot={slotNo} bytes={processedBytes} path={relPath}");

                if (processedBytes > 512000)
                {
                    return Request.CreateResponse((HttpStatusCode)413, new
                    {
                        success = false,
                        message = "program is too large (max 500KB)",
                        bytes = processedBytes,
                        limitBytes = 512000,
                    });
                }

                if (!UploadProgramDataBlocking(machineId, headType, slotNo, processed, req?.isNew ?? true, out var usedMode, out var upErr))
                {
                    responseLogs.Add($"uploadFailed usedMode={usedMode ?? "?"} err={upErr}");
                    Console.WriteLine($"[SmartUpload] failed usedMode={usedMode ?? "?"} slot={slotNo} bytes={processedBytes} err={upErr}");
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = upErr ?? "upload failed", logs = responseLogs });
                }

                // 업로드 검증:
                // - 소형: GetMachineProgramData로 길이 비교
                // - 대형: GetMachineProgramData가 잘릴 수 있어 ProgramList에 존재하는지만 확인
                if (processedBytes <= 90000)
                {
                    if (Mode1Api.TryGetProgDataInfo(machineId, headType, (short)slotNo, out var verifyInfo, out var verifyErr))
                    {
                        var gotLen = (verifyInfo.programData ?? string.Empty).Length;
                        if (gotLen < processedLen)
                        {
                            try { Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)slotNo, out var _, out var _); } catch { }
                            return Request.CreateResponse((HttpStatusCode)500, new
                            {
                                success = false,
                                message = "uploaded program appears truncated on machine",
                                expectedLength = processedLen,
                                actualLength = gotLen,
                                slotNo,
                            });
                        }
                    }
                    else
                    {
                        return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = verifyErr ?? "upload verify failed" });
                    }
                }
                else
                {
                    // 대용량은 readback이 잘릴 수 있어, 1초 단위로 리스트 존재 여부만 폴링한다.
                    var ok = await VerifyProgramExists(machineId, headType, slotNo, 20);
                    if (!ok)
                    {
                        responseLogs.Add("verifyFailed: program not found in list (timeout=20s)");
                        return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = "upload verify failed", slotNo, logs = responseLogs });
                    }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Smart program uploaded",
                    headType,
                    slotNo,
                    programName = $"O{slotNo.ToString().PadLeft(4, '0')}",
                    path = relPath,
                    length = processedLen,
                    bytes = processedBytes,
                    logs = responseLogs,
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        public class HighLevelStartEnqueueRequest
        {
            public short? headType { get; set; }
            public string[] paths { get; set; }
            public int? maxWaitSeconds { get; set; }
        }

        // POST /machines/{machineId}/smart/replace
        [HttpPost]
        [Route("machines/{machineId}/smart/replace")]
        public HttpResponseMessage SmartReplace(string machineId, [FromBody] HighLevelStartEnqueueRequest req)
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

            var job = new HighLevelStartJob
            {
                JobId = Guid.NewGuid().ToString("N"),
                HeadType = req?.headType ?? (short)1,
                Paths = paths,
                MaxWaitSeconds = Math.Max(30, req?.maxWaitSeconds ?? 1800),
                Index = 0,
                StartedAtUtc = DateTime.UtcNow,
                Status = "QUEUED",
            };

            var q = GetOrCreateHighLevelQueue(machineId);
            lock (q.Sync)
            {
                q.Jobs.Clear();
                q.Jobs.Enqueue(job);
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                jobId = job.JobId,
                queued = 1,
            });
        }

        // POST /machines/{machineId}/smart/enqueue
        [HttpPost]
        [Route("machines/{machineId}/smart/enqueue")]
        public HttpResponseMessage SmartEnqueue(string machineId, [FromBody] HighLevelStartEnqueueRequest req)
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

            var job = new HighLevelStartJob
            {
                JobId = Guid.NewGuid().ToString("N"),
                HeadType = req?.headType ?? (short)1,
                Paths = paths,
                MaxWaitSeconds = Math.Max(30, req?.maxWaitSeconds ?? 1800),
                Index = 0,
                StartedAtUtc = DateTime.UtcNow,
                Status = "QUEUED",
            };

            var q = GetOrCreateHighLevelQueue(machineId);
            int queued;
            lock (q.Sync)
            {
                q.Jobs.Enqueue(job);
                queued = q.Jobs.Count;
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                jobId = job.JobId,
                queued,
            });
        }

        public class SmartDequeueRequest
        {
            public string jobId { get; set; }
        }

        // POST /machines/{machineId}/smart/dequeue
        [HttpPost]
        [Route("machines/{machineId}/smart/dequeue")]
        public HttpResponseMessage SmartDequeue(string machineId, [FromBody] SmartDequeueRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var q = GetOrCreateHighLevelQueue(machineId);
            lock (q.Sync)
            {
                if (q.Current != null)
                {
                    if (string.IsNullOrWhiteSpace(req?.jobId))
                    {
                        return Request.CreateResponse((HttpStatusCode)409, new { success = false, message = "cannot dequeue current running job" });
                    }
                    if (string.Equals(q.Current.JobId, req.jobId, StringComparison.OrdinalIgnoreCase))
                    {
                        return Request.CreateResponse((HttpStatusCode)409, new { success = false, message = "cannot dequeue current running job" });
                    }
                }

                if (q.Jobs.Count == 0)
                {
                    return Request.CreateResponse(HttpStatusCode.OK, new { success = true, removed = false, queued = 0 });
                }

                if (string.IsNullOrWhiteSpace(req?.jobId))
                {
                    var removedJob = q.Jobs.Dequeue();
                    return Request.CreateResponse(HttpStatusCode.OK, new { success = true, removed = true, jobId = removedJob?.JobId, queued = q.Jobs.Count });
                }

                var target = req.jobId.Trim();
                var newQ = new Queue<HighLevelStartJob>();
                HighLevelStartJob removed = null;
                while (q.Jobs.Count > 0)
                {
                    var j = q.Jobs.Dequeue();
                    if (removed == null && j != null && string.Equals(j.JobId, target, StringComparison.OrdinalIgnoreCase))
                    {
                        removed = j;
                        continue;
                    }
                    newQ.Enqueue(j);
                }
                while (newQ.Count > 0) q.Jobs.Enqueue(newQ.Dequeue());

                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, removed = removed != null, jobId = removed?.JobId, queued = q.Jobs.Count });
            }
        }

        // POST /machines/{machineId}/smart/start
        [HttpPost]
        [Route("machines/{machineId}/smart/start")]
        public HttpResponseMessage SmartStart(string machineId)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var q = GetOrCreateHighLevelQueue(machineId);
            lock (q.Sync)
            {
                if (q.WorkerRunning)
                {
                    return Request.CreateResponse(HttpStatusCode.OK, new { success = true, started = false, message = "worker already running", queued = q.Jobs.Count });
                }
                if (q.Jobs.Count == 0)
                {
                    return Request.CreateResponse((HttpStatusCode)409, new { success = false, message = "queue is empty" });
                }
            }

            EnsureWorkerStarted(machineId);
            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, started = true });
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
                bool skipAlarmCheck = req?.skipAlarmCheck != false;
                if (!skipAlarmCheck && Mode1Api.TryGetMachineStatus(machineId, out var status, out var statusErr))
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
                
                var upRc = Hi_Link.HiLink.SetMachineProgramInfo(handle, info);
                if (upRc == -8)
                {
                    Mode1HandleStore.Invalidate(machineId);
                    if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                    {
                        upRc = Hi_Link.HiLink.SetMachineProgramInfo(handle2, info);
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
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = startErr ?? "SetMachinePanelIO failed" });
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
                if (headTypeToken != null && headTypeToken.Type == JTokenType.Integer)
                {
                    try { headType = (short)headTypeToken.Value<int>(); } catch { }
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

        // POST /machines/{machineId}/start
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

            if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, status, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "SetMachinePanelIO failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Start signal sent",
                ioUid,
                status
            });
        }

        // POST /machines/{machineId}/reset
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

            // Reset은 항상 새 핸들로 수행한다.
            Mode1HandleStore.Invalidate(machineId);

            if (!Mode1Api.TrySetMachineReset(machineId, out var error))
            {
                var msg = (error ?? "SetMachineReset failed") as string;
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

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Machine reset requested"
            });
        }

        public class MachineModeRequest
        {
            public string mode { get; set; }
        }

        // POST /machines/{machineId}/mode
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

            if (!Mode1Api.TrySetMachineMode(machineId, mode, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "SetMachineMode failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Mode switched",
                mode = mode.ToUpperInvariant()
            });
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

        // POST /machines/{machineId}/stop
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

            if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, status, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "SetMachinePanelIO failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Stop signal sent",
                ioUid,
                status
            });
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

        // GET /machines/{machineId}/programs (Mode1)
        [HttpGet]
        [Route("machines/{machineId}/programs")]
        public async Task<HttpResponseMessage> GetProgramList(string machineId, short headType = 1, short? slotNo = null, string path = null)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            // slotNo가 있으면: 프로그램 1개 다운로드(필요 시 파일 저장)
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

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = result.info
            });
        }

        public class UploadProgramRequest
        {
            public short? headType { get; set; }
            public int? slotNo { get; set; }
            public string path { get; set; }
            public bool? isNew { get; set; }
        }

        public class HighLevelUploadProgramRequest
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
                        var upRc = Hi_Link.HiLink.SetMachineProgramInfo(handle, info);
                        if (upRc == -8)
                        {
                            Mode1HandleStore.Invalidate(machineId);
                            if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                            {
                                upRc = Hi_Link.HiLink.SetMachineProgramInfo(handle2, info);
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

        // POST /machines/{machineId}/programs/delete (Mode1)
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

            if (!Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, programNo, out var activateProgNum, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "DeleteMachineProgramInfo failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Program deleted",
                headType,
                programNo,
                activateProgNum
            });
        }

        // POST /machines/{machineId}/programs/activate (Mode1)
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
                // 실측: headType 1=메인, 2=서브
                headType = req.headType ?? 1,
                programNo = req.programNo.Value
            };

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
                    job.originalFileName
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