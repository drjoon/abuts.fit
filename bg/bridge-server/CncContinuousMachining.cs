using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Hi_Link;
using Hi_Link.Libraries.Model;
using Newtonsoft.Json.Linq;

namespace HiLinkBridgeWebApi48
{
    /// <summary>
    /// O3000↔O3001 토글 방식의 연속 가공 관리
    /// </summary>
    public class CncContinuousMachining
    {
        private static readonly Regex FanucRegex = new Regex(@"O(\d{1,5})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly HttpClient BackendClient = new HttpClient();
        private static readonly Dictionary<string, DateTime> LastBackendSyncUtc = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        private const int BACKEND_SYNC_INTERVAL_SEC = 10;

        // 고정 슬롯 번호
        private const int SLOT_A = 4000;
        private const int SLOT_B = 4001;

        private class MachineState
        {
            public string MachineId;
            public int CurrentSlot; // 현재 실행 중인 슬롯 (3000 or 3001)
            public int NextSlot; // 다음 작업 대기 슬롯
            public CncJobItem CurrentJob;
            public CncJobItem NextJob; // 선업로드된 다음 작업
            public DateTime StartedAtUtc;
            public bool IsRunning;
            public bool AwaitingStart;
            public int ProductCountBefore; // 가공 시작 전 생산 수량
            public bool SawBusy;

            public string LastStartFailJobId;
            public int StartFailCount;
            public DateTime NextStartAttemptUtc;

            public string LastPreloadFailJobId;
            public int PreloadFailCount;
            public DateTime NextPreloadAttemptUtc;
        }

        private static readonly object StateLock = new object();
        private static readonly Dictionary<string, MachineState> MachineStates
            = new Dictionary<string, MachineState>(StringComparer.OrdinalIgnoreCase);

        private static Timer _timer;
        private static int _tickRunning = 0;

        public static void Start()
        {
            if (_timer != null) return;

            var enabled = (Environment.GetEnvironmentVariable("CNC_CONTINUOUS_ENABLED") ?? "true").Trim();
            if (string.Equals(enabled, "false", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine("[CncContinuous] disabled by CNC_CONTINUOUS_ENABLED=false");
                return;
            }

            _timer = new Timer(async _ => await Tick(), null, TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(3));
            Console.WriteLine("[CncContinuous] started (3s interval)");
        }

        public static void Stop()
        {
            try { _timer?.Dispose(); } catch { }
            _timer = null;
        }

        public static CncJobItem EnqueueFileJob(string machineId, string fileName, string requestId, string bridgePath = null)
        {
            var mid = (machineId ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(mid)) return null;

            var fn = (fileName ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(fn)) return null;

            var job = CncJobQueue.EnqueueFileBack(mid, fn, string.IsNullOrWhiteSpace(requestId) ? null : requestId, fn);
            try
            {
                var bp = (bridgePath ?? string.Empty).Trim();
                if (!string.IsNullOrEmpty(bp))
                {
                    job.bridgePath = bp;
                }
            }
            catch { }
            Console.WriteLine("[CncContinuous] job enqueued machine={0} jobId={1} file={2}", mid, job?.id, job?.fileName);
            return job;
        }

        private static async Task Tick()
        {
            if (Interlocked.Exchange(ref _tickRunning, 1) == 1) return;

            try
            {
                if (!Controllers.ControlController.IsRunning) return;

                var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                var allQueues = CncJobQueue.SnapshotAll();
                foreach (var kv in allQueues)
                {
                    if (!string.IsNullOrEmpty(kv.Key)) keys.Add(kv.Key);
                }

                lock (StateLock)
                {
                    foreach (var k in MachineStates.Keys)
                    {
                        if (!string.IsNullOrEmpty(k)) keys.Add(k);
                    }
                }

                foreach (var machineId in keys)
                {
                    await ProcessMachine(machineId);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncContinuous] tick error: {0}", ex);
            }
            finally
            {
                Interlocked.Exchange(ref _tickRunning, 0);
            }
        }

        private static async Task ProcessMachine(string machineId)
        {
            MachineState state;
            lock (StateLock)
            {
                if (!MachineStates.TryGetValue(machineId, out state))
                {
                    state = new MachineState
                    {
                        MachineId = machineId,
                        CurrentSlot = SLOT_A,
                        NextSlot = SLOT_B,
                        IsRunning = false,
                        AwaitingStart = false,
                        SawBusy = false,
                        StartFailCount = 0,
                        PreloadFailCount = 0,
                        NextStartAttemptUtc = DateTime.MinValue,
                        NextPreloadAttemptUtc = DateTime.MinValue,
                    };
                    MachineStates[machineId] = state;
                }
            }

            // 장비의 현재 활성 프로그램을 읽어 슬롯 기준을 맞춘다.
            // (선업로드가 이미 된 경우에는 nextSlot을 바꾸지 않는다.)
            RefreshSlotsFromMachine(machineId, state);

            // 1. 현재 가공 중인지 확인
            if (state.IsRunning)
            {
                // 가공 완료 체크
                var done = await CheckJobCompleted(machineId, state);
                if (done)
                {
                    Console.WriteLine("[CncContinuous] job completed machine={0} slot=O{1}",
                        machineId, state.CurrentSlot);

                    lock (StateLock)
                    {
                        state.IsRunning = false;
                        state.CurrentJob = null;
                        state.SawBusy = false;
                    }

                    // 다음 작업이 대기 중이면 즉시 전환
                    if (state.NextJob != null)
                    {
                        await SwitchToNextJob(machineId, state);
                    }
                }
                else
                {
                    // 가공 중: 다음 작업 선업로드
                    await PreloadNextJob(machineId, state);
                }
            }
            else
            {
                // 1.5) 프로그램은 올려놨지만 Start는 사용자가 직접(또는 외부) 수행해야 하는 상태
                if (state.AwaitingStart && state.CurrentJob != null)
                {
                    if (TryGetMachineBusy(machineId, out var busy) && busy)
                    {
                        var prodCountBefore = 0;
                        TryGetProductCount(machineId, out prodCountBefore);

                        lock (StateLock)
                        {
                            state.IsRunning = true;
                            state.AwaitingStart = false;
                            state.StartedAtUtc = DateTime.UtcNow;
                            state.ProductCountBefore = prodCountBefore;
                            state.SawBusy = true;
                        }

                        Console.WriteLine("[CncContinuous] detected start machine={0} slot=O{1}",
                            machineId, state.CurrentSlot);

                        _ = Task.Run(() => NotifyMachiningStarted(state.CurrentJob, machineId));
                    }

                    // 이미 로드된 작업이 있으면, 다음 작업 선업로드만 수행한다.
                    await PreloadNextJob(machineId, state);
                    return;
                }

                // 2. Idle 상태: 새 작업 시작
                var nextJob = CncJobQueue.Peek(machineId);
                if (nextJob != null)
                {
                    var now = DateTime.UtcNow;
                    if (!string.IsNullOrEmpty(state.LastStartFailJobId) &&
                        string.Equals(state.LastStartFailJobId, nextJob.id, StringComparison.OrdinalIgnoreCase) &&
                        now < state.NextStartAttemptUtc)
                    {
                        return;
                    }

                    var started = await StartNewJob(machineId, state, nextJob);
                    if (started)
                    {
                        CncJobQueue.Pop(machineId);

                        lock (StateLock)
                        {
                            state.LastStartFailJobId = null;
                            state.StartFailCount = 0;
                            state.NextStartAttemptUtc = DateTime.MinValue;
                        }
                    }
                    else
                    {
                        lock (StateLock)
                        {
                            if (!string.Equals(state.LastStartFailJobId, nextJob.id, StringComparison.OrdinalIgnoreCase))
                            {
                                state.LastStartFailJobId = nextJob.id;
                                state.StartFailCount = 0;
                            }

                            state.StartFailCount = Math.Min(1000, state.StartFailCount + 1);
                            var backoffSec = Math.Min(60, Math.Max(5, state.StartFailCount * 5));
                            state.NextStartAttemptUtc = DateTime.UtcNow.AddSeconds(backoffSec);
                        }

                        // 너무 오래 실패하면 큐에서 제거하여 무한 루프를 방지
                        if (state.StartFailCount >= 10)
                        {
                            CncJobQueue.Pop(machineId);
                            Console.WriteLine(
                                "[CncContinuous] start dropped machine={0} jobId={1} file={2} fails={3}",
                                machineId,
                                nextJob.id,
                                nextJob.fileName,
                                state.StartFailCount
                            );
                            lock (StateLock)
                            {
                                state.LastStartFailJobId = null;
                                state.StartFailCount = 0;
                                state.NextStartAttemptUtc = DateTime.MinValue;
                            }
                        }
                    }
                }
            }
        }

        private static async Task<bool> CheckJobCompleted(string machineId, MachineState state)
        {
            try
            {
                // 1) Busy IO 기반 완료 감지 (가공 시작(busy=1)을 한번이라도 봤고, 이후 busy=0이면 완료 후보)
                if (TryGetMachineBusy(machineId, out var busy))
                {
                    if (busy) state.SawBusy = true;
                    if (state.SawBusy && !busy)
                    {
                        // 2) 생산 수량 확인 (카운트 +1)
                        if (TryGetProductCount(machineId, out var currentCount))
                        {
                            if (currentCount > state.ProductCountBefore)
                            {
                                Console.WriteLine("[CncContinuous] production count increased machine={0} before={1} after={2}",
                                    machineId, state.ProductCountBefore, currentCount);
                                return true;
                            }
                        }

                        // 수량 확인이 실패하더라도, busy가 내려가면 일정 시간 후 완료로 간주
                        var elapsed = DateTime.UtcNow - state.StartedAtUtc;
                        if (elapsed > TimeSpan.FromMinutes(1)) return true;
                    }
                }

                // fallback: 일정 시간 지나면 완료로 간주
                var elapsedFallback = DateTime.UtcNow - state.StartedAtUtc;
                if (elapsedFallback > TimeSpan.FromMinutes(60)) return true;
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncContinuous] CheckJobCompleted error machine={0} err={1}", machineId, ex.Message);
                return false;
            }
        }

        private static async Task PreloadNextJob(string machineId, MachineState state)
        {
            // 이미 선업로드 완료했으면 스킵
            if (state.NextJob != null) return;

            var nextJob = CncJobQueue.Peek(machineId);
            if (nextJob == null) return;

            var now = DateTime.UtcNow;
            if (!string.IsNullOrEmpty(state.LastPreloadFailJobId) &&
                string.Equals(state.LastPreloadFailJobId, nextJob.id, StringComparison.OrdinalIgnoreCase) &&
                now < state.NextPreloadAttemptUtc)
            {
                return;
            }

            try
            {
                Console.WriteLine("[CncContinuous] preloading next job machine={0} file={1} to slot=O{2}",
                    machineId, nextJob.fileName, state.NextSlot);

                var uploaded = await UploadProgramToSlot(machineId, nextJob, state.NextSlot);
                if (uploaded)
                {
                    lock (StateLock)
                    {
                        state.NextJob = nextJob;
                        state.LastPreloadFailJobId = null;
                        state.PreloadFailCount = 0;
                        state.NextPreloadAttemptUtc = DateTime.MinValue;
                    }
                    CncJobQueue.Pop(machineId);
                    Console.WriteLine("[CncContinuous] preload success machine={0} slot=O{1}",
                        machineId, state.NextSlot);
                }
                else
                {
                    lock (StateLock)
                    {
                        if (!string.Equals(state.LastPreloadFailJobId, nextJob.id, StringComparison.OrdinalIgnoreCase))
                        {
                            state.LastPreloadFailJobId = nextJob.id;
                            state.PreloadFailCount = 0;
                        }

                        state.PreloadFailCount = Math.Min(1000, state.PreloadFailCount + 1);
                        var backoffSec = Math.Min(120, Math.Max(10, state.PreloadFailCount * 10));
                        state.NextPreloadAttemptUtc = DateTime.UtcNow.AddSeconds(backoffSec);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncContinuous] preload error machine={0} err={1}", machineId, ex.Message);
            }
        }

        private static async Task SwitchToNextJob(string machineId, MachineState state)
        {
            try
            {
                Console.WriteLine("[CncContinuous] switching to next job machine={0} from O{1} to O{2}",
                    machineId, state.CurrentSlot, state.NextSlot);

                // 1. Edit 모드 전환 (Idle에서만)
                if (!Mode1Api.TrySetMachineMode(machineId, "EDIT", out var modeErr))
                {
                    Console.WriteLine("[CncContinuous] edit mode failed machine={0} err={1}", machineId, modeErr);
                    return;
                }

                // 2. (옵션) 이전 슬롯 프로그램 삭제
                try
                {
                    var delEnabled = (Environment.GetEnvironmentVariable("CNC_DELETE_PREV_ON_SWITCH") ?? "false").Trim();
                    if (string.Equals(delEnabled, "true", StringComparison.OrdinalIgnoreCase))
                    {
                        if (!Mode1Api.TryDeleteMachineProgramInfo(machineId, 0, (short)state.CurrentSlot, out var actNo, out var delErr))
                        {
                            Console.WriteLine("[CncContinuous] delete prev failed machine={0} slot=O{1} err={2}", machineId, state.CurrentSlot, delErr);
                        }
                        else
                        {
                            Console.WriteLine("[CncContinuous] delete prev ok machine={0} slot=O{1} activateProgNum={2}", machineId, state.CurrentSlot, actNo);
                        }
                    }
                }
                catch { }

                // 3. NextSlot 활성화
                var dto = new UpdateMachineActivateProgNo
                {
                    headType = 0,
                    programNo = (short)state.NextSlot
                };

                var res = Mode1HandleStore.SetActivateProgram(machineId, dto, out var err);
                if (res != 0)
                {
                    Console.WriteLine("[CncContinuous] activate failed machine={0} res={1} err={2}",
                        machineId, res, err);
                    return;
                }

                // 4. Auto 모드 전환
                if (!Mode1Api.TrySetMachineMode(machineId, "AUTO", out var modeErr2))
                {
                    Console.WriteLine("[CncContinuous] auto mode failed machine={0} err={1}", machineId, modeErr2);
                    return;
                }

                // Start는 여기서 보내지 않는다. (Now Playing으로 올라간 뒤 사용자가 Start)
                // 상태 업데이트
                lock (StateLock)
                {
                    state.CurrentSlot = state.NextSlot;
                    state.NextSlot = (state.CurrentSlot == SLOT_A) ? SLOT_B : SLOT_A;
                    state.CurrentJob = state.NextJob;
                    state.NextJob = null;
                    state.IsRunning = false;
                    state.AwaitingStart = true;
                    state.StartedAtUtc = DateTime.MinValue;
                    state.ProductCountBefore = 0;
                    state.SawBusy = false;
                }

                Console.WriteLine("[CncContinuous] switch success machine={0} now ready O{1}",
                    machineId, state.CurrentSlot);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncContinuous] switch error machine={0} err={1}", machineId, ex.Message);
            }
        }

        private static async Task<bool> StartNewJob(string machineId, MachineState state, CncJobItem job)
        {
            try
            {
                Console.WriteLine("[CncContinuous] starting new job machine={0} file={1} slot=O{2}",
                    machineId, job.fileName, state.CurrentSlot);

                // 1. Edit 모드 전환 (Idle에서만)
                if (!Mode1Api.TrySetMachineMode(machineId, "EDIT", out var modeErr))
                {
                    Console.WriteLine("[CncContinuous] edit mode failed machine={0} err={1}", machineId, modeErr);
                    return false;
                }

                // 2. CurrentSlot에 업로드
                var uploaded = await UploadProgramToSlot(machineId, job, state.CurrentSlot);
                if (!uploaded) return false;

                // 3. 활성화
                var dto = new UpdateMachineActivateProgNo
                {
                    headType = 0,
                    programNo = (short)state.CurrentSlot
                };

                var res = Mode1HandleStore.SetActivateProgram(machineId, dto, out var err);
                if (res != 0)
                {
                    Console.WriteLine("[CncContinuous] activate failed machine={0} res={1} err={2}",
                        machineId, res, err);
                    return false;
                }

                // 4. Auto 모드 전환
                if (!Mode1Api.TrySetMachineMode(machineId, "AUTO", out var modeErr2))
                {
                    Console.WriteLine("[CncContinuous] auto mode failed machine={0} err={1}", machineId, modeErr2);
                    return false;
                }

                // Start는 여기서 보내지 않는다. (Now Playing으로 올라간 뒤 사용자가 Start)
                // 상태 업데이트
                lock (StateLock)
                {
                    state.CurrentJob = job;
                    state.IsRunning = false;
                    state.AwaitingStart = true;
                    state.StartedAtUtc = DateTime.MinValue;
                    state.ProductCountBefore = 0;
                    state.SawBusy = false;
                }

                Console.WriteLine("[CncContinuous] start ready machine={0} slot=O{1}",
                    machineId, state.CurrentSlot);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncContinuous] start error machine={0} err={1}", machineId, ex.Message);
                return false;
            }
        }

        private static async Task<bool> UploadProgramToSlot(string machineId, CncJobItem job, int slotNo)
        {
            try
            {
                if (job == null) return false;

                if (!TryResolveJobFilePath(job, out var fullPath, out var resolveErr))
                {
                    Console.WriteLine("[CncContinuous] file resolve failed: {0}", resolveErr);
                    return false;
                }

                if (!File.Exists(fullPath))
                {
                    // 로컬 캐시에 없으면 S3에서 내려받아 캐시한다.
                    var downloaded = await TryDownloadAndCacheFromS3(machineId, job, fullPath);
                    if (!downloaded || !File.Exists(fullPath))
                    {
                        Console.WriteLine("[CncContinuous] file not found: {0}", fullPath);
                        return false;
                    }
                }

                var content = File.ReadAllText(fullPath);

                // 프로그램 번호를 slotNo로 강제 변경
                content = ReplaceProgramHeaderLine(content, slotNo);

                var info = new UpdateMachineProgramInfo
                {
                    headType = 0,
                    programNo = (short)slotNo,
                    programData = content,
                    isNew = true,
                };

                if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                {
                    Console.WriteLine("[CncContinuous] handle error machine={0} err={1}", machineId, errUp);
                    return false;
                }

                var upRc = HiLink.SetMachineProgramInfo(handle, info);
                if (upRc != 0)
                {
                    Console.WriteLine("[CncContinuous] upload failed machine={0} rc={1}", machineId, upRc);
                    return false;
                }

                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncContinuous] upload error machine={0} err={1}", machineId, ex.Message);
                return false;
            }
        }

        private static void AddSecretHeader(HttpRequestMessage req)
        {
            var secret = Config.BridgeSharedSecret;
            if (!string.IsNullOrEmpty(secret))
            {
                req.Headers.Remove("X-Bridge-Secret");
                req.Headers.Add("X-Bridge-Secret", secret);
            }
        }

        private static async Task SyncQueueFromBackend(string machineId)
        {
            try
            {
                var mid = (machineId ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(mid)) return;

                var now = DateTime.UtcNow;
                lock (LastBackendSyncUtc)
                {
                    if (LastBackendSyncUtc.TryGetValue(mid, out var last) && (now - last).TotalSeconds < BACKEND_SYNC_INTERVAL_SEC)
                    {
                        return;
                    }
                    LastBackendSyncUtc[mid] = now;
                }

                var backendBase = Config.BackendBase;
                if (string.IsNullOrEmpty(backendBase)) return;

                var url = backendBase.TrimEnd('/') + "/cnc-machines/bridge/queue-snapshot/" + Uri.EscapeDataString(mid);
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                AddSecretHeader(req);

                var resp = await BackendClient.SendAsync(req);
                var text = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                {
                    Console.WriteLine("[CncContinuous] backend queue snapshot failed: status={0}", (int)resp.StatusCode);
                    return;
                }

                var root = JObject.Parse(text);
                if (root.Value<bool?>("success") != true)
                {
                    Console.WriteLine("[CncContinuous] backend queue snapshot success=false");
                    return;
                }

                var data = root["data"] as JArray;
                if (data == null) return;

                var jobs = new List<CncJobItem>();
                foreach (var j in data)
                {
                    var id = (j?["id"]?.ToString() ?? string.Empty).Trim();
                    var kind = (j?["kind"]?.ToString() ?? "file").Trim();
                    var fileName = (j?["fileName"]?.ToString() ?? string.Empty).Trim();
                    var bridgePath = (j?["bridgePath"]?.ToString() ?? string.Empty).Trim();
                    var s3Key = (j?["s3Key"]?.ToString() ?? string.Empty).Trim();
                    var s3Bucket = (j?["s3Bucket"]?.ToString() ?? string.Empty).Trim();
                    var requestId = (j?["requestId"]?.ToString() ?? string.Empty).Trim();
                    var qty = 1;
                    try
                    {
                        qty = Math.Max(1, j?["qty"]?.Value<int?>() ?? 1);
                    }
                    catch { qty = 1; }

                    if (string.IsNullOrEmpty(fileName)) continue;

                    jobs.Add(new CncJobItem
                    {
                        id = string.IsNullOrEmpty(id) ? Guid.NewGuid().ToString("N") : id,
                        kind = string.Equals(kind, "dummy", StringComparison.OrdinalIgnoreCase) ? CncJobKind.Dummy : CncJobKind.File,
                        machineId = mid,
                        qty = qty,
                        fileName = fileName,
                        bridgePath = bridgePath,
                        s3Key = s3Key,
                        s3Bucket = s3Bucket,
                        requestId = requestId,
                        createdAtUtc = DateTime.UtcNow,
                        source = "backend_db"
                    });
                }

                CncJobQueue.ReplaceQueue(mid, jobs);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncContinuous] SyncQueueFromBackend error: {0}", ex.Message);
            }
        }

        private static async Task<bool> TryDownloadAndCacheFromS3(string machineId, CncJobItem job, string fullPath)
        {
            try
            {
                if (job == null) return false;
                var s3Key = (job.s3Key ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(s3Key)) return false;

                var backendBase = Config.BackendBase;
                if (string.IsNullOrEmpty(backendBase)) return false;

                var mid = (machineId ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(mid)) return false;

                var presignUrl = backendBase.TrimEnd('/') + "/cnc-machines/bridge/cnc-direct/presign-download/" + Uri.EscapeDataString(mid) + "?s3Key=" + Uri.EscapeDataString(s3Key);
                var req = new HttpRequestMessage(HttpMethod.Get, presignUrl);
                AddSecretHeader(req);

                var resp = await BackendClient.SendAsync(req);
                var text = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                {
                    Console.WriteLine("[CncContinuous] download presign failed: status={0}", (int)resp.StatusCode);
                    return false;
                }

                var root = JObject.Parse(text);
                if (root.Value<bool?>("success") != true) return false;
                var data = root["data"] as JObject;
                var downloadUrl = (data?["downloadUrl"]?.ToString() ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(downloadUrl)) return false;

                var dir = Path.GetDirectoryName(fullPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                using (var dl = await BackendClient.GetAsync(downloadUrl))
                {
                    if (!dl.IsSuccessStatusCode) return false;
                    var bytes = await dl.Content.ReadAsByteArrayAsync();
                    File.WriteAllBytes(fullPath, bytes);
                }

                Console.WriteLine("[CncContinuous] cached from S3: {0}", fullPath);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncContinuous] TryDownloadAndCacheFromS3 error: {0}", ex.Message);
                return false;
            }
        }

        private static string ReplaceProgramHeaderLine(string content, int newNo)
        {
            if (newNo <= 0) return content;
            var newLine = string.Format("O{0:D4}", newNo);

            var raw = string.IsNullOrEmpty(content) ? string.Empty : content;
            var lines = raw.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            if (lines.Length == 0) return newLine;

            // % 헤더가 없으면 최상단에 삽입한다. (표준 Fanuc 스타일)
            var hasPercent = false;
            for (var i = 0; i < lines.Length; i++)
            {
                var t = (lines[i] ?? string.Empty).Trim();
                if (t == string.Empty) continue;
                if (t == "%") hasPercent = true;
                break;
            }
            if (!hasPercent)
            {
                var withPercent = new List<string>(lines.Length + 1);
                withPercent.Add("%");
                withPercent.AddRange(lines);
                lines = withPercent.ToArray();
            }

            // 첫 번째 '프로그램 헤더' 라인만 교체: 라인 시작이 O#### 인 경우
            for (var i = 0; i < lines.Length; i++)
            {
                var t = (lines[i] ?? string.Empty).TrimStart();
                if (t.StartsWith("(") || t.StartsWith("%"))
                {
                    continue;
                }

                if (Regex.IsMatch(t, @"^O\d{1,5}\b", RegexOptions.IgnoreCase))
                {
                    lines[i] = Regex.Replace(
                        lines[i],
                        @"^(\s*)O\d{1,5}\b",
                        "$1" + newLine,
                        RegexOptions.IgnoreCase
                    );
                    return string.Join("\n", lines);
                }
            }

            // O라인이 없으면, 첫 번째 비어있지 않은 줄 앞(또는 % 다음)에 삽입
            var insertIdx = 0;
            if (lines.Length > 0 && (lines[0] ?? string.Empty).Trim() == "%")
            {
                insertIdx = 1;
            }

            var outLines = new List<string>(lines.Length + 1);
            for (var i = 0; i < lines.Length; i++)
            {
                if (i == insertIdx)
                {
                    outLines.Add(newLine);
                }
                outLines.Add(lines[i]);
            }
            if (insertIdx >= lines.Length)
            {
                outLines.Add(newLine);
            }
            return string.Join("\n", outLines);
        }

        private static bool TryResolveJobFilePath(CncJobItem job, out string fullPath, out string error)
        {
            fullPath = null;
            error = null;

            var root = Path.GetFullPath(Config.BridgeStoreRoot);

            var bp = (job.bridgePath ?? string.Empty).Trim();
            if (!string.IsNullOrEmpty(bp))
            {
                var rel = bp.Replace('/', Path.DirectorySeparatorChar).Replace("..", string.Empty);
                var combined = Path.GetFullPath(Path.Combine(root, rel));
                if (!combined.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                {
                    error = "bridgePath is outside of root";
                    return false;
                }
                fullPath = combined;
                return true;
            }

            var fn = (job.fileName ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(fn))
            {
                error = "fileName is required";
                return false;
            }

            var p = Path.GetFullPath(Path.Combine(root, fn));
            if (!p.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            {
                error = "fileName is outside of root";
                return false;
            }
            fullPath = p;
            return true;
        }

        private static string GetStoragePath()
        {
            return Config.BridgeStoreRoot;
        }

        private static bool TryStartSignal(string machineId, out string error)
        {
            error = null;

            var ioUid = Config.CncStartIoUid;
            if (ioUid < 0) ioUid = 0;
            if (ioUid > short.MaxValue) ioUid = 61;

            return Mode1Api.TrySetMachinePanelIO(machineId, 0, (short)ioUid, true, out error);
        }

        private static bool TryGetMachineBusy(string machineId, out bool isBusy)
        {
            isBusy = false;

            var busyIoUid = Config.CncBusyIoUid;
            if (busyIoUid < 0) return false;

            if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var err))
            {
                Console.WriteLine("[CncContinuous] handle error machine={0} err={1}", machineId, err);
                return false;
            }

            var panelList = new List<IOInfo>();
            var rc = HiLink.GetMachineAllOPInfo(handle, 0, ref panelList);
            if (rc != 0 || panelList == null) return false;

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

        private static bool TryGetProductCount(string machineId, out int count)
        {
            count = 0;
            if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var err))
            {
                Console.WriteLine("[CncContinuous] handle error machine={0} err={1}", machineId, err);
                return false;
            }

            var prodInfo = new MachineProductInfo();
            var rc = HiLink.GetMachineProductInfo(handle, ref prodInfo);
            if (rc != 0) return false;
            var prodCount = prodInfo.currentProdCount;
            if (prodCount < int.MinValue) prodCount = int.MinValue;
            if (prodCount > int.MaxValue) prodCount = int.MaxValue;
            count = (int)prodCount;
            return true;
        }

        private static void RefreshSlotsFromMachine(string machineId, MachineState state)
        {
            try
            {
                if (!Mode1Api.TryGetActivateProgInfo(machineId, out var info, out _))
                {
                    return;
                }

                var active = ParseActiveProgramNo(info);
                if (active == SLOT_A)
                {
                    state.CurrentSlot = SLOT_A;
                    if (state.NextJob == null) state.NextSlot = SLOT_B;
                }
                else if (active == SLOT_B)
                {
                    state.CurrentSlot = SLOT_B;
                    if (state.NextJob == null) state.NextSlot = SLOT_A;
                }
            }
            catch { }
        }

        private static int ParseActiveProgramNo(MachineProgramInfo info)
        {
            try
            {
                var name = (info.MainProgramName ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(name))
                {
                    name = (info.SubProgramName ?? string.Empty).Trim();
                }
                if (string.IsNullOrEmpty(name)) return 0;

                var m = Regex.Match(name.ToUpperInvariant(), @"O(\d{1,5})");
                if (m.Success && int.TryParse(m.Groups[1].Value, out var n) && n > 0) return n;

                var digits = Regex.Match(name, @"(\d{1,5})");
                if (digits.Success && int.TryParse(digits.Groups[1].Value, out var n2) && n2 > 0) return n2;
            }
            catch { }
            return 0;
        }

        private static string GetBackendBase()
        {
            return Config.BackendBase;
        }

        private static string GetBackendJwt()
        {
            return (Environment.GetEnvironmentVariable("BACKEND_JWT") ?? string.Empty).Trim();
        }

        private static void AddAuthHeader(System.Net.Http.HttpRequestMessage req)
        {
            var jwt = GetBackendJwt();
            if (!string.IsNullOrEmpty(jwt))
            {
                req.Headers.Remove("Authorization");
                req.Headers.Add("Authorization", "Bearer " + jwt);
            }
        }

        private static readonly System.Net.Http.HttpClient Http = new System.Net.Http.HttpClient();

        private static async Task NotifyMachiningStarted(CncJobItem job, string machineId)
        {
            try
            {
                var backend = GetBackendBase();
                var url = backend + "/bg/register-file";

                var payload = new
                {
                    sourceStep = "cnc",
                    fileName = job.fileName,
                    originalFileName = job.fileName,
                    requestId = job.requestId,
                    status = "success",
                    metadata = new { machineId = machineId }
                };

                var json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
                var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, url);
                AddAuthHeader(req);
                req.Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");

                var resp = await Http.SendAsync(req);
                _ = await resp.Content.ReadAsStringAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncContinuous] NotifyMachiningStarted error: {0}", ex.Message);
            }
        }

        /// <summary>
        /// 특정 장비의 현재 상태 조회 (디버깅/모니터링용)
        /// </summary>
        public static object GetMachineState(string machineId)
        {
            lock (StateLock)
            {
                if (MachineStates.TryGetValue(machineId, out var state))
                {
                    return new
                    {
                        machineId = state.MachineId,
                        currentSlot = state.CurrentSlot,
                        nextSlot = state.NextSlot,
                        isRunning = state.IsRunning,
                        currentJob = state.CurrentJob?.fileName,
                        nextJob = state.NextJob?.fileName,
                        elapsedSeconds = state.IsRunning ? (DateTime.UtcNow - state.StartedAtUtc).TotalSeconds : 0
                    };
                }
                return null;
            }
        }
    }
}
