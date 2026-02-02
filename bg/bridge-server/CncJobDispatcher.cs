using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Hi_Link;
using Hi_Link.Libraries.Model;

namespace HiLinkBridgeWebApi48
{
    public static class CncJobDispatcher
    {

        private static Timer _timer;
        private static int _tickRunning = 0;

        private static readonly Regex FanucRegex = new Regex(@"O(\d{1,5})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly int StartIoUid = Config.CncStartIoUid;
        private static readonly int BusyIoUid = Config.CncBusyIoUid;
        private static readonly int AssumeMinutes = Config.CncJobAssumeMinutes;

        private static string GetBackendBase()
        {
            return Config.BackendBase;
        }

        private static string GetBackendJwt()
        {
            return (Environment.GetEnvironmentVariable("BACKEND_JWT") ?? string.Empty).Trim();
        }

        private static string GetStoragePath()
        {
            return Config.BridgeStoreRoot;
        }

        /// <summary>
        /// Mode1 핸들을 얻는다.
        /// </summary>
        private static bool TryGetHandle(string uid, out ushort handle)
        {
            handle = 0;
            if (Mode1HandleStore.TryGetHandle(uid, out handle, out var err)) return true;
            Console.WriteLine("[CncJobDispatcher] handle error uid={0} err={1}", uid, err);
            return false;
        }

        private class RunningState
        {
            public CncJobItem Job;
            public DateTime StartedAtUtc;
            public bool SawBusy;
        }

        private static readonly object StateLock = new object();
        private static readonly System.Collections.Generic.Dictionary<string, RunningState> Running
            = new System.Collections.Generic.Dictionary<string, RunningState>(StringComparer.OrdinalIgnoreCase);

        public static void Start()
        {
            if (_timer != null) return;
            var enabled = (Environment.GetEnvironmentVariable("CNC_JOB_DISPATCHER_ENABLED") ?? string.Empty).Trim();
            if (string.Equals(enabled, "false", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine("[CncJobDispatcher] disabled by CNC_JOB_DISPATCHER_ENABLED=false");
                return;
            }

            _timer = new Timer(async _ => await Tick(), null, TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
            Console.WriteLine("[CncJobDispatcher] started (5s interval)");
        }

        public static void Stop()
        {
            try { _timer?.Dispose(); } catch { }
            _timer = null;
        }

        private static async Task Tick()
        {
            if (Interlocked.Exchange(ref _tickRunning, 1) == 1) return;

            try
            {
                if (!Controllers.ControlController.IsRunning)
                {
                    return;
                }

                // 현재 실행 중인 작업 완료 여부 체크
                string[] keys;
                lock (StateLock)
                {
                    keys = new string[Running.Keys.Count];
                    Running.Keys.CopyTo(keys, 0);
                }

                foreach (var machineId in keys)
                {
                    RunningState st;
                    lock (StateLock)
                    {
                        if (!Running.TryGetValue(machineId, out st)) continue;
                    }

                    var done = await IsJobDone(machineId, st);
                    if (done)
                    {
                        Console.WriteLine("[CncJobDispatcher] job done machine={0} jobId={1}", machineId, st.Job?.id);
                        lock (StateLock)
                        {
                            Running.Remove(machineId);
                        }
                    }
                }

                // 각 머신별로 idle이면 다음 작업 실행
                var allQueues = CncJobQueue.SnapshotAll();
                foreach (var kv in allQueues)
                {
                    var machineId = kv.Key;
                    if (string.IsNullOrEmpty(machineId)) continue;

                    lock (StateLock)
                    {
                        if (Running.ContainsKey(machineId)) continue;
                    }

                    var next = CncJobQueue.Peek(machineId);
                    if (next == null) continue;

                    // 시작
                    var started = await StartJob(machineId, next);
                    if (started)
                    {
                        CncJobQueue.Pop(machineId);
                        lock (StateLock)
                        {
                            Running[machineId] = new RunningState
                            {
                                Job = next,
                                StartedAtUtc = DateTime.UtcNow,
                                SawBusy = false
                            };
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncJobDispatcher] tick error: {0}", ex);
            }
            finally
            {
                Interlocked.Exchange(ref _tickRunning, 0);
            }
        }

        private static async Task<bool> StartJob(string machineId, CncJobItem job)
        {
            try
            {
                if (job == null) return false;

                if (job.kind == CncJobKind.Dummy)
                {
                    if (job.programNo == null || job.programNo.Value <= 0) return false;

                    var dto = new UpdateMachineActivateProgNo { headType = 1, programNo = (short)job.programNo.Value };
                    var res = Mode1HandleStore.SetActivateProgram(machineId, dto, out var err);
                    if (res != 0)
                    {
                        Console.WriteLine("[CncJobDispatcher] dummy activate failed machine={0} res={1} err={2}", machineId, res, err);
                        return false;
                    }

                    var ok = await CallStartApi(machineId, true);
                    if (!ok) return false;

                    Console.WriteLine("[CncJobDispatcher] dummy started machine={0} programNo={1}", machineId, job.programNo.Value);
                    return true;
                }

                // file job
                if (string.IsNullOrEmpty(job.fileName)) return false;

                var storage = GetStoragePath();
                var fullPath = Path.GetFullPath(Path.Combine(storage, job.fileName));
                if (!fullPath.StartsWith(storage, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
                {
                    Console.WriteLine("[CncJobDispatcher] file not found: {0}", fullPath);
                    return false;
                }

                var content = File.ReadAllText(fullPath);
                var progNo = ExtractProgramNo(content, job.fileName);
                if (progNo <= 0)
                {
                    Console.WriteLine("[CncJobDispatcher] cannot extract programNo from {0}", job.fileName);
                    return false;
                }

                // NC 파일 content 전처리: 상단에 OXXXX 헤더가 없으면 삽입
                var processedContent = EnsureProgramHeader(content, progNo);

                // 1) 업로드(UpdateProgram) - Mode1 API 사용
                var info = new UpdateMachineProgramInfo
                {
                    headType = 1,
                    programNo = (short)progNo,
                    programData = processedContent,
                    isNew = true,
                };

                if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                {
                    Console.WriteLine("[CncJobDispatcher] handle error machine={0} err={1}", machineId, errUp);
                    _ = Task.Run(() => NotifyMachiningFailed(job, machineId, "handle error: " + errUp));
                    return false;
                }

                var upRc = HiLink.SetMachineProgramInfo(handle, info);
                if (upRc != 0)
                {
                    Console.WriteLine("[CncJobDispatcher] upload failed machine={0} rc={1}", machineId, upRc);
                    _ = Task.Run(() => NotifyMachiningFailed(job, machineId, "upload failed rc=" + upRc));
                    return false;
                }

                // 2) 활성화(UpdateActivateProg)
                var dto2 = new UpdateMachineActivateProgNo { headType = 1, programNo = (short)progNo };
                var act = Mode1HandleStore.SetActivateProgram(machineId, dto2, out var err2);
                if (act != 0)
                {
                    Console.WriteLine("[CncJobDispatcher] activate failed machine={0} res={1} err={2}", machineId, act, err2);
                    _ = Task.Run(() => NotifyMachiningFailed(job, machineId, "activate failed res=" + act + " err=" + err2));
                    return false;
                }

                // 3) 시작(Start)
                var okStart = await CallStartApi(machineId, true);
                if (!okStart)
                {
                    _ = Task.Run(() => NotifyMachiningFailed(job, machineId, "start api failed"));
                    return false;
                }

                // 4) 백엔드에 machining start 알림(기존 bg/register-file 패턴 유지)
                _ = Task.Run(() => NotifyMachiningStarted(job, machineId));

                Console.WriteLine("[CncJobDispatcher] file started machine={0} file={1} programNo={2}", machineId, job.fileName, progNo);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncJobDispatcher] StartJob error machine={0} err={1}", machineId, ex.Message);
                _ = Task.Run(() => NotifyMachiningFailed(job, machineId, "exception: " + ex.Message));
                return false;
            }
        }

        private static int ExtractProgramNo(string content, string fileName)
        {
            var first = (content ?? string.Empty);
            var m = FanucRegex.Match(first);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var n1) && n1 > 0) return n1;

            var name = (fileName ?? string.Empty);
            var m2 = FanucRegex.Match(name);
            if (m2.Success && int.TryParse(m2.Groups[1].Value, out var n2) && n2 > 0) return n2;

            return 0;
        }

        /// <summary>
        /// NC 파일 content 상단에 OXXXX 프로그램 헤더가 없으면 삽입
        /// </summary>
        private static string EnsureProgramHeader(string content, int programNo)
        {
            if (string.IsNullOrEmpty(content)) return content;

            var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None);
            if (lines.Length == 0) return content;

            // 첫 줄이 이미 OXXXX 형태면 그대로 반환
            var firstLine = lines[0].Trim();
            var m = FanucRegex.Match(firstLine);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var existing) && existing == programNo)
            {
                return content;
            }

            // 헤더 삽입: O#### 형태로 4자리 패딩
            var header = $"O{programNo.ToString().PadLeft(4, '0')}";
            return header + "\r\n" + content;
        }

        private static int ToResultCode(object obj)
        {
            if (obj is short s) return s;
            if (obj is int i) return i;
            return -1;
        }

        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        private static readonly string BridgeBase = Config.BridgeSelfBase;

        private static void AddSecretHeader(HttpRequestMessage req)
        {
            var secret = Config.BridgeSharedSecret;
            if (!string.IsNullOrEmpty(secret))
            {
                req.Headers.Remove("X-Bridge-Secret");
                req.Headers.Add("X-Bridge-Secret", secret);
            }
        }

        private static void AddAuthHeader(HttpRequestMessage req)
        {
            var jwt = GetBackendJwt();
            if (!string.IsNullOrEmpty(jwt))
            {
                req.Headers.Remove("Authorization");
                req.Headers.Add("Authorization", "Bearer " + jwt);
            }
        }

        private static async Task<bool> CallStartApi(string machineId, bool startOn)
        {
            var payload = new { status = startOn ? 1 : 0, ioUid = StartIoUid };
            using (var req = new HttpRequestMessage(
                HttpMethod.Post,
                BridgeBase + "/api/cnc/machines/" + Uri.EscapeDataString(machineId) + "/start"
            ))
            {
                AddSecretHeader(req);
                req.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");

                using (var resp = await Http.SendAsync(req))
                {
                    var body = await resp.Content.ReadAsStringAsync();
                    if (!resp.IsSuccessStatusCode)
                    {
                        Console.WriteLine("[CncJobDispatcher] start api failed uid={0} status={1} body={2}", machineId, (int)resp.StatusCode, body);
                        return false;
                    }
                    return true;
                }
            }
        }


        private static async Task<bool> IsJobDone(string machineId, RunningState st)
        {
            try
            {
                if (st == null) return true;

                var busyIo = BusyIoUid;
                if (busyIo >= 0)
                {
                    if (Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errOp))
                    {
                        var panelList = new List<IOInfo>();
                        // panelType은 0(Main) 기준으로 사용 (필요 시 설정 변경 가능)
                        var rc = HiLink.GetMachineAllOPInfo(handle, 0, ref panelList);
                        if (rc == 0 && panelList != null)
                        {
                            short? status = null;
                            foreach (var io in panelList)
                            {
                                if (io != null && io.IOUID == (short)busyIo)
                                {
                                    status = io.Status;
                                    break;
                                }
                            }

                            if (status.HasValue)
                            {
                                var busy = status.Value != 0;
                                if (busy) st.SawBusy = true;
                                if (st.SawBusy && !busy) return true;
                            }
                        }
                        else
                        {
                            Console.WriteLine("[CncJobDispatcher] GetMachineAllOPInfo failed machine={0} rc={1}", machineId, rc);
                        }
                    }
                    else
                    {
                        Console.WriteLine("[CncJobDispatcher] handle error machine={0} err={1}", machineId, errOp);
                    }
                }

                // fallback: 일정 시간 지나면 완료로 간주
                var elapsed = DateTime.UtcNow - st.StartedAtUtc;
                var assume = TimeSpan.FromMinutes(AssumeMinutes);
                if (elapsed > assume)
                {
                    return true;
                }

                return false;
            }
            catch
            {
                // 상태를 못 읽으면 시간을 기준으로만 판단
                var elapsed = DateTime.UtcNow - st.StartedAtUtc;
                return elapsed > TimeSpan.FromMinutes(AssumeMinutes);
            }
        }

        private static async Task NotifyMachiningStarted(CncJobItem job, string machineId)
        {
            try
            {
                var backend = GetBackendBase();
                var url = backend + "/bg/register-file";

                var canonical = string.IsNullOrWhiteSpace(job?.originalFileName)
                    ? job?.fileName
                    : job.originalFileName;

                var payload = new
                {
                    sourceStep = "cnc",
                    fileName = job.fileName,
                    originalFileName = canonical,
                    requestId = job.requestId,
                    status = "success",
                    metadata = new { machineId = machineId }
                };

                var json = JsonConvert.SerializeObject(payload);
                using (var req = new HttpRequestMessage(HttpMethod.Post, url))
                {
                    AddAuthHeader(req);
                    req.Content = new StringContent(json, Encoding.UTF8, "application/json");

                    using (var resp = await Http.SendAsync(req))
                    {
                        _ = await resp.Content.ReadAsStringAsync();
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncJobDispatcher] NotifyMachiningStarted error: {0}", ex.Message);
            }
        }

        private static async Task NotifyMachiningFailed(CncJobItem job, string machineId, string error)
        {
            try
            {
                var backend = GetBackendBase();
                var url = backend + "/bg/register-file";

                var canonical = string.IsNullOrWhiteSpace(job?.originalFileName)
                    ? job?.fileName
                    : job.originalFileName;

                var payload = new
                {
                    sourceStep = "cnc",
                    fileName = job?.fileName,
                    originalFileName = canonical,
                    requestId = job?.requestId,
                    status = "failed",
                    metadata = new { machineId = machineId, error = error }
                };

                var json = JsonConvert.SerializeObject(payload);
                using (var req = new HttpRequestMessage(HttpMethod.Post, url))
                {
                    AddAuthHeader(req);
                    req.Content = new StringContent(json, Encoding.UTF8, "application/json");

                    using (var resp = await Http.SendAsync(req))
                    {
                        _ = await resp.Content.ReadAsStringAsync();
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncJobDispatcher] NotifyMachiningFailed error: {0}", ex.Message);
            }
        }
    }
}
