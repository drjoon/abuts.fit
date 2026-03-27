using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Net.Http;
using System.Text;
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
public class CncMachining
{
private static readonly Regex FanucRegex = new Regex(@"O(\d{1,5})", RegexOptions.IgnoreCase | RegexOptions.Compiled);
private static readonly HttpClient BackendClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
private static readonly Dictionary<string, DateTime> LastBackendSyncUtc = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
private static readonly Dictionary<string, DateTime> LastSnapshotLogUtc = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
private class MachineFlags
{
public bool AllowAutoMachining;
public bool AllowJobStart;
public DateTime FetchedAtUtc;
}
private static async Task NotifyMachiningCompleted(CncJobItem job, string machineId)
{
try
{
var backend = GetBackendBase();
if (string.IsNullOrEmpty(backend)) return;
// register-file(sourceStep=cnc)는 BG 산출물 bookkeeping / 이벤트 적재용 보조 통지다.
// request stage 전이와 생산 큐 진행의 canonical 완료 신호는 아래 machining/complete 콜백이며,
// backend는 그 콜백을 기준으로만 상태 전이와 후속 자동 진행을 판단해야 한다.
try
{
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
    status = "success",
    metadata = new { machineId = machineId }
    };
    var json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
    using (var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, url))
    {
    AddAuthHeader(req);
    AddSecretHeader(req);
    req.Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");
    using (var resp = await Http.SendAsync(req))
    {
        _ = await resp.Content.ReadAsStringAsync();
    }
    }
}
catch (Exception regEx)
{
    Console.WriteLine("[CncMachining] register-file notify failed machine={0} err={1}", machineId, regEx.Message);
}
// CNC machining completed notify (bridge -> backend)
try
{
    if (!string.IsNullOrEmpty(backend))
    {
        var completeUrl = backend + "/cnc-machines/bridge/machining/complete/" + Uri.EscapeDataString(machineId);
        Console.WriteLine(
            "[CncMachining] machining-complete notify start machine={0} jobId={1} requestId={2}",
            machineId,
            job?.id,
            job?.requestId
        );
        var completePayload = new
        {
            machineId = machineId,
            jobId = job?.id,
            requestId = job?.requestId,
            bridgePath = job?.bridgePath,
            s3Key = job?.s3Key,
            s3Bucket = job?.s3Bucket,
            completedAt = DateTime.UtcNow,
        };
        var completeJson = Newtonsoft.Json.JsonConvert.SerializeObject(completePayload);
        using (var completeReq = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, completeUrl))
        {
            AddAuthHeader(completeReq);
            AddSecretHeader(completeReq);
            completeReq.Content = new System.Net.Http.StringContent(completeJson, System.Text.Encoding.UTF8, "application/json");
            using (var completeResp = await Http.SendAsync(completeReq))
            {
                var completeBody = await completeResp.Content.ReadAsStringAsync();
                Console.WriteLine(
                    "[CncMachining] machining-complete notify done machine={0} status={1} body={2}",
                    machineId,
                    (int)completeResp.StatusCode,
                    completeBody
                );
            }
        }
    }
}
catch (Exception completeEx)
{
    Console.WriteLine("[CncMachining] NotifyMachiningComplete endpoint error: {0}", completeEx.Message);
}
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] NotifyMachiningCompleted error: {0}", ex.Message);
}
}
private static async Task<bool> TryConsumeBackendQueueJob(string machineId, string jobId)
{
    try
    {
        var backendBase = Config.BackendBase;
        if (string.IsNullOrEmpty(backendBase)) return false;
        var mid = (machineId ?? string.Empty).Trim();
        var jid = (jobId ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(mid) || string.IsNullOrEmpty(jid)) return false;
        var url = backendBase.TrimEnd('/') + "/cnc-machines/bridge/queue-consume/" + Uri.EscapeDataString(mid) + "/" + Uri.EscapeDataString(jid);
        using (var req = new HttpRequestMessage(HttpMethod.Post, url))
        {
            var secret = Config.BridgeSharedSecret;
            var hasSecret = !string.IsNullOrEmpty(secret);
            Console.WriteLine("[CncMachining] queue-consume add-secret hasSecret={0} machine={1} jobId={2}", hasSecret, mid, jid);
            AddSecretHeader(req);
            AddAuthHeader(req);
            using (var resp = await BackendClient.SendAsync(req))
            {
                var body = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                {
                    Console.WriteLine("[CncMachining] backend queue consume failed machine={0} jobId={1} status={2} body={3}", mid, jid, (int)resp.StatusCode, body);
                    return false;
                }
                try
                {
                    var json = JObject.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
                    if (json.Value<bool?>("success") != true)
                    {
                        Console.WriteLine("[CncMachining] backend queue consume success=false machine={0} jobId={1} body={2}", mid, jid, body);
                        return false;
                    }
                }
                catch { }
                return true;
            }
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine("[CncMachining] TryConsumeBackendQueueJob error machine={0} jobId={1} err={2}", machineId, jobId, ex.Message);
        return false;
    }
}
private static async Task NotifyMachiningFailed(CncJobItem job, string machineId, string error, List<object> alarms = null)
{
try
{
var backend = GetBackendBase();
if (string.IsNullOrEmpty(backend)) return;
var url = backend + "/cnc-machines/bridge/machining/fail/" + Uri.EscapeDataString(machineId);
var payload = new
{
requestId = job?.requestId,
jobId = job?.id,
bridgePath = job?.bridgePath,
reason = error,
alarms = alarms ?? new List<object>()
};
var json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
using (var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, url))
{
AddAuthHeader(req);
AddSecretHeader(req);
req.Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");
using (var resp = await Http.SendAsync(req))
{
var body = await resp.Content.ReadAsStringAsync();
if (!resp.IsSuccessStatusCode)
{
Console.WriteLine("[CncMachining] NotifyMachiningFailed failed status={0} body={1}", (int)resp.StatusCode, body);
}
}
}
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] NotifyMachiningFailed error: {0}", ex.Message);
}
}
private static Task<bool> DetectMachiningCompletion(string machineId, MachineState state)
{
    try
    {
        if (Config.MockCncMachining)
        {
            var started = state.StartedAtUtc;
            if (started == DateTime.MinValue) return Task.FromResult(false);
            var elapsed = DateTime.UtcNow - started;
            return Task.FromResult(elapsed >= TimeSpan.FromSeconds(5));
        }
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
                        Console.WriteLine("[CncMachining] production count increased machine={0} jobId={1} before={2} after={3}",
                        machineId, state.CurrentJob?.id, state.ProductCountBefore, currentCount);
                        return Task.FromResult(true);
                    }
                }
                // 수량 확인이 실패하더라도, busy가 내려가면 일정 시간 후 완료로 간주
                var elapsed = DateTime.UtcNow - state.StartedAtUtc;
                if (elapsed > TimeSpan.FromMinutes(1)) return Task.FromResult(true);
            }
        }
        // fallback: 일정 시간 지나면 완료로 간주
        var elapsedFallback = DateTime.UtcNow - state.StartedAtUtc;
        if (elapsedFallback > TimeSpan.FromMinutes(60)) return Task.FromResult(true);
        return Task.FromResult(false);
    }
    catch (Exception ex)
    {
        Console.WriteLine("[CncMachining] DetectMachiningCompletion error machine={0} err={1}", machineId, ex.Message);
        return Task.FromResult(false);
    }
}
private static readonly Dictionary<string, MachineFlags> MachineFlagsCache = new Dictionary<string, MachineFlags>(StringComparer.OrdinalIgnoreCase);
private const int MACHINE_FLAGS_CACHE_SEC = 5;
private const int BACKEND_SYNC_INTERVAL_SEC = 10;
/// <summary>
/// 특정 장비의 플래그 캐시를 무효화한다. 백엔드에서 플래그 변경 시 호출.
/// </summary>
public static void InvalidateMachineFlagsCache(string machineId)
{
    if (string.IsNullOrEmpty(machineId)) return;
    lock (StateLock)
    {
        MachineFlagsCache.Remove(machineId);
    }
    Console.WriteLine("[CncMachining] flags cache invalidated machine={0}", machineId);
}
// 고정 슬롯 번호
private const int SLOT_A = 4000;
private static int GetJobPriority(CncJobItem job)
{
if (job == null) return 0;
var src = (job.source ?? string.Empty).Trim();
if (string.Equals(src, "cam_approve", StringComparison.OrdinalIgnoreCase)) return 1;
return 0;
}
private class MachineState
{
public string MachineId;
public int CurrentSlot; // 현재 실행 중인 슬롯 (4000)
public CncJobItem CurrentJob;
public DateTime StartedAtUtc;
public bool IsRunning;
public bool AwaitingStart;
public DateTime LastTickNotifyAtUtc;
public string PendingConsumeJobId;
public int ConsumeFailCount;
public DateTime NextConsumeAttemptUtc;
public int ProductCountBefore; // 가공 시작 전 생산 수량
public bool SawBusy;
public DateTime AwaitingStartSinceUtc;
public DateTime LastAwaitingStartSignalUtc;
public string LastMachiningFailJobId;
public string LastMachiningCompleteJobId;
public string LastStartFailJobId;
public int StartFailCount;
public DateTime NextStartAttemptUtc;
public DateTime MockCompletionDueUtc;
public JObject UiSnapshot;
public DateTime UiSnapshotUpdatedAt;
}
private static readonly object StateLock = new object();
private static readonly Dictionary<string, MachineState> MachineStates
= new Dictionary<string, MachineState>(StringComparer.OrdinalIgnoreCase);
private static Timer _timer;
private static int _tickRunning = 0;
public static void ResetStartBackoff(string machineId)
{
if (string.IsNullOrWhiteSpace(machineId)) return;
lock (StateLock)
{
if (MachineStates.TryGetValue(machineId, out var state))
{
state.LastStartFailJobId = null;
state.StartFailCount = 0;
state.NextStartAttemptUtc = DateTime.MinValue;
Console.WriteLine("[CncMachining] start backoff reset machine={0}", machineId);
}
}
}
public static void ResetIdleStateForQueueRefresh(string machineId)
{
if (string.IsNullOrWhiteSpace(machineId)) return;
lock (StateLock)
{
if (MachineStates.TryGetValue(machineId, out var state))
{
state.PendingConsumeJobId = null;
state.ConsumeFailCount = 0;
state.NextConsumeAttemptUtc = DateTime.MinValue;
state.CurrentJob = null;
state.IsRunning = false;
state.AwaitingStart = false;
state.SawBusy = false;
state.AwaitingStartSinceUtc = DateTime.MinValue;
state.LastAwaitingStartSignalUtc = DateTime.MinValue;
state.MockCompletionDueUtc = DateTime.MinValue;
state.StartedAtUtc = DateTime.MinValue;
Console.WriteLine("[CncMachining] idle state reset for queue refresh machine={0}", machineId);
}
}
}
public static void TriggerProcessNow(string machineId)
{
var mid = (machineId ?? string.Empty).Trim();
if (string.IsNullOrEmpty(mid)) return;
_ = Task.Run(async () =>
{
try
{
Console.WriteLine("[CncMachining] immediate process trigger machine={0}", mid);
await ProcessMachine(mid);
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] immediate process trigger failed machine={0} err={1}", mid, ex.Message);
}
});
}
public static void Start()
{
if (_timer != null) return;
// 부팅 시 1회: DB(SSOT) 큐 스냅샷을 받아 메모리 큐를 복구한다.
// 주기적 폴링은 금지하며, 이후 동기화는 백엔드 push(/api/bridge/queue/{machineId}/replace)로만 수행한다.
_ = Task.Run(async () =>
{
await InitialSyncFromBackendOnce();
});
_timer = new Timer(async _ => await Tick(), null, TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(3));
Console.WriteLine("[CncMachining] started (3s interval)");
}
private static async Task InitialSyncFromBackendOnce()
{
try
{
var backendBase = Config.BackendBase;
if (string.IsNullOrEmpty(backendBase))
{
Console.WriteLine("[CncMachining] initial sync skipped: BACKEND_URL is empty");
return;
}
var list = MachinesConfigStore.Load() ?? new List<Models.MachineConfigItem>();
if (list.Count == 0)
{
Console.WriteLine("[CncMachining] initial sync skipped: machines.json is empty");
return;
}
Console.WriteLine("[CncMachining] initial queue sync started machines={0}", list.Count);
foreach (var m in list)
{
try
{
var uid = (m?.uid ?? string.Empty).Trim();
if (string.IsNullOrEmpty(uid)) continue;
await SyncQueueFromBackend(uid);
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] initial sync failed uid={0} err={1}", m?.uid, ex.Message);
}
}
Console.WriteLine("[CncMachining] initial queue sync done");
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] initial queue sync error: {0}", ex.Message);
}
}
public static void Stop()
{
try { _timer?.Dispose(); } catch { }
_timer = null;
}
public static CncJobItem EnqueueFileJob(string machineId, string fileName, string requestId, string bridgePath = null, string s3Key = null, string s3Bucket = null, bool enqueueFront = false, string originalFileName = null, bool paused = true, bool allowAutoStart = false)
{
var mid = (machineId ?? string.Empty).Trim();
if (string.IsNullOrEmpty(mid)) return null;
var fn = (fileName ?? string.Empty).Trim();
if (string.IsNullOrEmpty(fn)) return null;
var rid = string.IsNullOrWhiteSpace(requestId) ? null : requestId;
var ofn = string.IsNullOrWhiteSpace(originalFileName) ? fn : originalFileName;
var job = enqueueFront
                ? CncJobQueue.EnqueueFileFront(mid, fn, rid, ofn, allowAutoStart)
                : CncJobQueue.EnqueueFileBack(mid, fn, rid, ofn, allowAutoStart);
try
            {
                job.paused = paused;
                job.allowAutoStart = allowAutoStart;
            }
            catch { }
try
            {
                var bp = (bridgePath ?? string.Empty).Trim();
                if (!string.IsNullOrEmpty(bp)) job.bridgePath = bp;
            }
            catch { }
try
            {
var sk = (s3Key ?? string.Empty).Trim();
if (!string.IsNullOrEmpty(sk))
{
job.s3Key = sk;
}
var sb = (s3Bucket ?? string.Empty).Trim();
if (!string.IsNullOrEmpty(sb))
{
job.s3Bucket = sb;
}
}
catch { }
Console.WriteLine("[CncMachining] job enqueued machine={0} jobId={1} file={2}", mid, job?.id, job?.fileName);
return job;
}
private static async Task Tick()
{
if (Interlocked.Exchange(ref _tickRunning, 1) == 1) return;
try
{
if (!Controllers.ControlController.IsRunning) return;
var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
lock (StateLock)
{
foreach (var kv in MachineStates)
{
var k = kv.Key;
var s = kv.Value;
if (string.IsNullOrEmpty(k) || s == null) continue;
if (!string.IsNullOrEmpty(s.PendingConsumeJobId) || s.IsRunning || s.AwaitingStart)
{
keys.Add(k);
}
}
}
foreach (var machineId in keys)
{
await ProcessMachine(machineId);
}
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] tick error: {0}", ex);
}
finally
{
Interlocked.Exchange(ref _tickRunning, 0);
}
}
private static async Task ProcessMachine(string machineId)
{
var mid = (machineId ?? string.Empty).Trim();
if (string.IsNullOrEmpty(mid))
{
Console.WriteLine("[CncMachining] ProcessMachine early return: empty machineId");
return;
}
MachineState state;
lock (StateLock)
{
if (!MachineStates.TryGetValue(machineId, out state))
{
state = new MachineState
{
MachineId = machineId,
CurrentSlot = SLOT_A,
IsRunning = false,
AwaitingStart = false,
SawBusy = false,
LastTickNotifyAtUtc = DateTime.MinValue,
LastMachiningFailJobId = null,
LastMachiningCompleteJobId = null,
StartFailCount = 0,
NextStartAttemptUtc = DateTime.MinValue,
MockCompletionDueUtc = DateTime.MinValue,
};
MachineStates[machineId] = state;
}
}

if (!string.IsNullOrEmpty(state.PendingConsumeJobId))
{
var nowUtc = DateTime.UtcNow;
if (nowUtc < state.NextConsumeAttemptUtc)
{
return;
}
if (await TryConsumeBackendQueueJob(machineId, state.PendingConsumeJobId))
{
lock (StateLock)
{
state.PendingConsumeJobId = null;
state.ConsumeFailCount = 0;
state.NextConsumeAttemptUtc = DateTime.MinValue;
state.CurrentJob = null;
state.IsRunning = false;
state.AwaitingStart = false;
state.SawBusy = false;
state.AwaitingStartSinceUtc = DateTime.MinValue;
state.LastAwaitingStartSignalUtc = DateTime.MinValue;
state.MockCompletionDueUtc = DateTime.MinValue;
}
}
else
{
lock (StateLock)
{
state.ConsumeFailCount = Math.Min(10, state.ConsumeFailCount + 1);
var delaySec = Math.Min(60, 2 * state.ConsumeFailCount);
state.NextConsumeAttemptUtc = DateTime.UtcNow.AddSeconds(delaySec);
}
}
return;
}

if (state.IsRunning)
{
try
{
var nowUtcSnapshot = DateTime.UtcNow;
var shouldTick = state.CurrentJob != null && (state.LastTickNotifyAtUtc == DateTime.MinValue || (nowUtcSnapshot - state.LastTickNotifyAtUtc) >= TimeSpan.FromSeconds(1));
if (shouldTick)
{
lock (StateLock)
{
state.LastTickNotifyAtUtc = nowUtcSnapshot;
}
_ = Task.Run(async () => await NotifyMachiningTick(state.CurrentJob, machineId, "RUNNING", null));
}
}
catch { }

if (state.CurrentJob != null)
{
if (!Config.MockCncMachining)
{
if (TryGetMachineAlarms(machineId, out var alarmList, out var alarmErr))
{
if (alarmList != null && alarmList.Count > 0)
{
var jobId = state.CurrentJob?.id;
var shouldSend = true;
lock (StateLock)
{
if (!string.IsNullOrEmpty(jobId) && string.Equals(state.LastMachiningFailJobId, jobId, StringComparison.OrdinalIgnoreCase))
{
shouldSend = false;
}
}
if (shouldSend)
{
lock (StateLock)
{
state.LastMachiningFailJobId = jobId;
}
_ = Task.Run(() => NotifyMachiningTick(state.CurrentJob, machineId, "ALARM", Newtonsoft.Json.JsonConvert.SerializeObject(alarmList)));
_ = Task.Run(() => NotifyMachiningFailed(state.CurrentJob, machineId, "alarm", alarmList));
}
Console.WriteLine("[CncMachining] machining failed by alarm machine={0} alarms={1}", machineId, Newtonsoft.Json.JsonConvert.SerializeObject(alarmList));
var failedJob = state.CurrentJob;
lock (StateLock)
{
state.PendingConsumeJobId = failedJob?.id;
state.ConsumeFailCount = 0;
state.NextConsumeAttemptUtc = DateTime.MinValue;
state.IsRunning = false;
state.AwaitingStart = false;
state.CurrentJob = null;
state.SawBusy = false;
state.MockCompletionDueUtc = DateTime.MinValue;
}
_ = CncJobQueue.TryRemove(machineId, failedJob?.id);
return;
}
}
else
{
Console.WriteLine("[CncMachining] alarm read failed machine={0} err={1}", machineId, alarmErr);
}
}
}

var nowUtc = DateTime.UtcNow;
var mockDone = false;
if (Config.MockCncMachining)
{
if (state.MockCompletionDueUtc != DateTime.MinValue && nowUtc >= state.MockCompletionDueUtc)
{
mockDone = true;
}
}
else
{
if (await CheckJobCompleted(machineId, state))
{
mockDone = true;
}
}
if (mockDone)
{
var completedJob = state.CurrentJob;
lock (StateLock)
{
state.PendingConsumeJobId = completedJob?.id;
state.ConsumeFailCount = 0;
state.NextConsumeAttemptUtc = DateTime.MinValue;
state.IsRunning = false;
state.AwaitingStart = false;
state.SawBusy = false;
state.MockCompletionDueUtc = DateTime.MinValue;
}
_ = Task.Run(() => NotifyMachiningCompleted(completedJob, machineId));
_ = CncJobQueue.TryRemove(machineId, completedJob?.id);
return;
}

return;
}

if (state.AwaitingStart && state.CurrentJob != null)
{
// awaiting-start 상태에서도 주기적으로 tick 전송 (준비 중 상태 표시)
try
{
var nowUtcSnapshot = DateTime.UtcNow;
var shouldTickAwaiting = state.CurrentJob != null && (state.LastTickNotifyAtUtc == DateTime.MinValue || (nowUtcSnapshot - state.LastTickNotifyAtUtc) >= TimeSpan.FromSeconds(2));
if (shouldTickAwaiting)
{
lock (StateLock)
{
state.LastTickNotifyAtUtc = nowUtcSnapshot;
}
_ = Task.Run(async () => await NotifyMachiningTick(state.CurrentJob, machineId, "AWAITING_START", null));
}
}
catch { }

// busy 상태 체크를 먼저 수행 (가장 빠른 시작 감지)
if (TryGetMachineBusy(machineId, out var awaitingBusy) && awaitingBusy)
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
state.AwaitingStartSinceUtc = DateTime.MinValue;
state.LastAwaitingStartSignalUtc = DateTime.MinValue;
}
Console.WriteLine("[CncMachining] detected start machine={0} jobId={1} slot=O{2}", machineId, state.CurrentJob?.id, state.CurrentSlot);
_ = Task.Run(() => NotifyMachiningStarted(state.CurrentJob, machineId));
return;
}

var awaitingElapsed = state.AwaitingStartSinceUtc == DateTime.MinValue
    ? TimeSpan.Zero
    : (DateTime.UtcNow - state.AwaitingStartSinceUtc);

// 알람 체크는 15초 이상 경과 시에만 수행 (불필요한 지연 방지)
if (!Config.MockCncMachining && awaitingElapsed >= TimeSpan.FromSeconds(15))
{
if (TryGetMachineAlarms(machineId, out var awaitingAlarms, out var awaitingAlarmErr))
{
if (awaitingAlarms != null && awaitingAlarms.Count > 0)
{
var awaitingJob = state.CurrentJob;
var awaitingJobId = awaitingJob?.id;
var shouldSendAwaitingAlarm = true;
lock (StateLock)
{
if (!string.IsNullOrEmpty(awaitingJobId) && string.Equals(state.LastMachiningFailJobId, awaitingJobId, StringComparison.OrdinalIgnoreCase))
{
shouldSendAwaitingAlarm = false;
}
else
{
state.LastMachiningFailJobId = awaitingJobId;
}
state.IsRunning = false;
state.AwaitingStart = false;
state.CurrentJob = null;
state.SawBusy = false;
state.AwaitingStartSinceUtc = DateTime.MinValue;
state.LastAwaitingStartSignalUtc = DateTime.MinValue;
state.MockCompletionDueUtc = DateTime.MinValue;
}
if (shouldSendAwaitingAlarm)
{
var awaitingAlarmJson = Newtonsoft.Json.JsonConvert.SerializeObject(awaitingAlarms);
_ = Task.Run(() => NotifyMachiningTick(awaitingJob, machineId, "ALARM", awaitingAlarmJson));
_ = Task.Run(() => NotifyMachiningFailed(awaitingJob, machineId, "alarm", awaitingAlarms));
}
Console.WriteLine("[CncMachining] awaiting-start alarm machine={0} alarms={1}", machineId, Newtonsoft.Json.JsonConvert.SerializeObject(awaitingAlarms));
_ = CncJobQueue.TryRemove(machineId, awaitingJob?.id);
lock (StateLock)
{
state.PendingConsumeJobId = awaitingJob?.id;
state.ConsumeFailCount = 0;
state.NextConsumeAttemptUtc = DateTime.MinValue;
}
return;
}
}
}

if (awaitingElapsed >= TimeSpan.FromSeconds(20))
{
var stuckJob = state.CurrentJob;
var stuckSlot = state.CurrentSlot;
lock (StateLock)
{
state.IsRunning = false;
state.AwaitingStart = false;
state.CurrentJob = null;
state.SawBusy = false;
state.AwaitingStartSinceUtc = DateTime.MinValue;
state.LastAwaitingStartSignalUtc = DateTime.MinValue;
state.PendingConsumeJobId = stuckJob?.id;
state.ConsumeFailCount = 0;
state.NextConsumeAttemptUtc = DateTime.MinValue;
state.MockCompletionDueUtc = DateTime.MinValue;
}
_ = Task.Run(() => NotifyMachiningFailed(stuckJob, machineId, "awaiting-start-timeout", null));
_ = CncJobQueue.TryRemove(machineId, stuckJob?.id);
Console.WriteLine("[CncMachining] awaiting-start timeout machine={0} jobId={1} slot=O{2}", machineId, stuckJob?.id, stuckSlot);
return;
}
return;
}

try
{
await SyncQueueFromBackend(machineId, false);
}
catch (Exception syncEx)
{
Console.WriteLine("[CncMachining] idle force sync failed machine={0} err={1}", machineId, syncEx.Message);
}
var nextJob = CncJobQueue.Peek(machineId);
if (nextJob == null)
{
return;
}
var flagsBeforeStart = await GetMachineFlagsFromBackend(machineId);
if (flagsBeforeStart == null)
{
Console.WriteLine("[CncMachining] idle start blocked machine={0} reason=flags-unavailable", machineId);
return;
}
if (!flagsBeforeStart.AllowAutoMachining)
{
Console.WriteLine("[CncMachining] idle preload blocked machine={0} jobId={1} reason=allowAutoMachining=false", machineId, nextJob.id);
lock (StateLock)
{
state.PendingConsumeJobId = nextJob.id;
state.ConsumeFailCount = 0;
state.NextConsumeAttemptUtc = DateTime.MinValue;
state.LastMachiningFailJobId = nextJob.id;
}
_ = CncJobQueue.TryRemove(machineId, nextJob.id);
_ = Task.Run(() => NotifyMachiningFailed(nextJob, machineId, "allowAutoMachining=false", null));
return;
}
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
_ = CncJobQueue.TryRemove(machineId, nextJob.id);
lock (StateLock)
{
state.LastStartFailJobId = null;
state.StartFailCount = 0;
state.NextStartAttemptUtc = DateTime.MinValue;
}
}
else
{
Console.WriteLine("[CncMachining] start failed (will retry) machine={0} jobId={1} file={2}",
machineId,
nextJob.id,
nextJob.fileName
);
lock (StateLock)
{
state.LastStartFailJobId = nextJob.id;
state.StartFailCount = Math.Min(10, state.StartFailCount + 1);
var delaySec = Math.Min(60, 2 * state.StartFailCount);
state.NextStartAttemptUtc = DateTime.UtcNow.AddSeconds(delaySec);
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
Console.WriteLine("[CncMachining] production count increased machine={0} jobId={1} before={2} after={3}",
machineId, state.CurrentJob?.id, state.ProductCountBefore, currentCount);
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
Console.WriteLine("[CncMachining] CheckJobCompleted error machine={0} err={1}", machineId, ex.Message);
return false;
}
}
private static async Task<bool> StartNewJob(string machineId, MachineState state, CncJobItem job)
{
try
{
// MOCK 모드: 장비 호출을 모두 건너뛰고 성공 처리
if (Config.MockCncMachining)
{
    Console.WriteLine("[CncMachining] MOCK start bypass machine={0} jobId={1} file={2}", machineId, job?.id, job?.fileName);
    _ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "READY", null));
    _ = Task.Run(() => NotifyMachiningStarted(job, machineId));
    var mockStartUtc = DateTime.UtcNow;
    var mockDuration = Config.CncJobAssumeMinutes > 0
        ? TimeSpan.FromMinutes(Config.CncJobAssumeMinutes)
        : TimeSpan.FromSeconds(10);
    Console.WriteLine(
        "[CncMachining] MOCK state set machine={0} jobId={1} durationSec={2} dueAt={3:o}",
        machineId,
        job?.id,
        mockDuration.TotalSeconds,
        mockStartUtc + mockDuration
    );
    lock (StateLock)
    {
        state.CurrentJob = job;
        state.CurrentSlot = SLOT_A; // 임의 슬롯
        state.IsRunning = true;
        state.AwaitingStart = false;
        state.StartedAtUtc = mockStartUtc;
        state.LastTickNotifyAtUtc = DateTime.MinValue;
        state.ProductCountBefore = 0;
        state.SawBusy = false;
        state.MockCompletionDueUtc = mockStartUtc + mockDuration;
    }
    // 시작 시점에 STARTED tick을 한 번 보내 로컬 타이머가 바로 시작되도록 한다.
    _ = Task.Run(() => NotifyMachiningTick(job, machineId, "STARTED", null));
    // 모의 가공 동안 5초마다 tick을 보내 경과시간을 프론트에 전달한다.
    _ = Task.Run(async () =>
    {
        try
        {
            while (true)
            {
                bool running = false;
                string currentJobId = null;
                lock (StateLock)
                {
                    if (MachineStates.TryGetValue(machineId, out var s))
                    {
                        running = s.IsRunning;
                        currentJobId = s.CurrentJob?.id;
                    }
                }
                if (!running || currentJobId != job?.id)
                {
                    break;
                }
                try
                {
                    _ = Task.Run(() => NotifyMachiningTick(job, machineId, "RUNNING", null));
                }
                catch { }
                await Task.Delay(TimeSpan.FromSeconds(5));
            }
        }
        catch { }
    });
    return true;
}
var uploadSlot = SLOT_A;
Console.WriteLine("[CncMachining] starting new job machine={0} jobId={1} file={2} slot=O{3}",
machineId, job?.id, job?.fileName, uploadSlot);
// 1. Edit 모드 전환 (Idle에서만)
if (!Mode1Api.TrySetMachineMode(machineId, "EDIT", out var modeErr))
{
Console.WriteLine("[CncMachining] edit mode failed machine={0} err={1}", machineId, modeErr);
return false;
}
await Task.Delay(300);
Mode1HandleStore.Invalidate(machineId);
// 2. 대상 슬롯에 기존 프로그램 삭제 후 업로드
try
{
if (!Mode1Api.TryDeleteMachineProgramInfo(machineId, 1, (short)uploadSlot, out var _, out var delErr))
{
if (!string.IsNullOrEmpty(delErr))
{
Console.WriteLine("[CncMachining] delete before upload ignored machine={0} jobId={1} slot=O{2} err={3}", machineId, job?.id, uploadSlot, delErr);
}
}
else
{
Console.WriteLine("[CncMachining] delete before upload ok machine={0} jobId={1} slot=O{2}", machineId, job?.id, uploadSlot);
}
}
catch { }
var (uploaded, uploadErr) = await UploadProgramToSlot(machineId, job, uploadSlot);
if (!uploaded)
{
_ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "FAILED", uploadErr ?? "start upload failed"));
return false;
}
_ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "READY", null));
// 3. 활성화 (O4000은 메인 슬롯이므로 headType=1)
// 더미 job: programNo로 직접 활성화
short activateProgNo = job.kind == CncJobKind.Dummy && job.programNo.HasValue
  ? (short)job.programNo.Value
  : (short)uploadSlot;
var dto = new UpdateMachineActivateProgNo
{
headType = 1,
programNo = activateProgNo
};
if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
{
    Console.WriteLine("[CncMachining] handle error machine={0} jobId={1} slot=O{2} err={3}", machineId, job?.id, uploadSlot, errUp);
    return false;
}
// 활성화는 ProgramInfo가 아닌 ActivateProgNo API를 사용해야 한다
var upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => HiLink.SetActivateProgram(handle, dto), "SetActivateProgram.CncMachining");
if (upRc != 0)
{
Console.WriteLine("[CncMachining] activate failed machine={0} jobId={1} res={2} err={3}",
machineId, job?.id, upRc, errUp);
return false;
}
// 4. Auto 모드 전환
if (!Mode1Api.TrySetMachineMode(machineId, "AUTO", out var modeErr2))
{
Console.WriteLine("[CncMachining] auto mode failed machine={0} err={1}", machineId, modeErr2);
return false;
}
await Task.Delay(300);
// Start는 여기서 보내지 않는다. (Now Playing으로 올라간 뒤 사용자가 Start)
// 상태 업데이트
lock (StateLock)
{
state.CurrentJob = job;
state.CurrentSlot = SLOT_A;
state.IsRunning = false;
state.AwaitingStart = true;
state.StartedAtUtc = DateTime.MinValue;
state.ProductCountBefore = 0;
state.SawBusy = false;
state.AwaitingStartSinceUtc = DateTime.UtcNow;
state.LastAwaitingStartSignalUtc = DateTime.MinValue;
}
    // 정책 구분:
    // - allowAutoMachining: 작업 페이지 의뢰건 자동 가공 허용 플래그
    // - allowJobStart: 장비 페이지 수동/샘플 가공 시작 허용 플래그
    // 의뢰건 자동 가공 경로는 allowJobStart에 의해 막히면 안 되므로,
    // 브리지의 자동 Start 신호는 allowAutoMachining 기준으로만 판단한다.
    var flags = await GetMachineFlagsFromBackend(machineId);
    var allowRemoteStart = flags != null && flags.AllowJobStart;
    var allowAutoStart = flags != null && flags.AllowAutoMachining;
    Console.WriteLine("[CncMachining] flags check machine={0} jobId={1} allowRemoteStart={2} allowAutoStart={3} flagsNull={4}", 
        machineId, job?.id, allowRemoteStart, allowAutoStart, flags == null);
    if (allowAutoStart)
    {
        if (!TryStartSignal(machineId, out var startErr))
        {
            Console.WriteLine("[CncMachining] start signal failed machine={0} err={1}", machineId, startErr);
            _ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "FAILED", "start signal failed: " + (startErr ?? string.Empty)));
            return false;
        }
        lock (StateLock)
        {
            state.LastAwaitingStartSignalUtc = DateTime.UtcNow;
        }
        Console.WriteLine("[CncMachining] start signal sent machine={0}", machineId);
    }
    else if (!allowAutoStart)
    {
        Console.WriteLine("[CncMachining] auto-start blocked (allowAutoStart=false) machine={0} jobId={1}", machineId, job?.id);
    }
Console.WriteLine("[CncMachining] start ready machine={0} slot=O{1}",
machineId, state.CurrentSlot);
return true;
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] start error machine={0} err={1}", machineId, ex.Message);
_ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "FAILED", "exception: " + ex.Message));
return false;
}
}
private static async Task<MachineFlags> GetMachineFlagsFromBackend(string machineId)
{
    try
    {
        var backendBase = Config.BackendBase;
        if (string.IsNullOrEmpty(backendBase)) return null;
        var mid = (machineId ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(mid)) return null;
        MachineFlags cached;
        lock (StateLock)
        {
            MachineFlagsCache.TryGetValue(mid, out cached);
        }
        if (cached != null)
        {
            var age = DateTime.UtcNow - cached.FetchedAtUtc;
            if (age.TotalSeconds <= MACHINE_FLAGS_CACHE_SEC)
            {
                return cached;
            }
        }
        var url = backendBase.TrimEnd('/') + "/cnc-machines/bridge/machine-flags/" + Uri.EscapeDataString(mid);
        var req = new HttpRequestMessage(HttpMethod.Get, url);
        AddSecretHeader(req);
        var resp = await BackendClient.SendAsync(req);
        var body = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode)
        {
            Console.WriteLine("[CncMachining] machine-flags failed machine={0} status={1} body={2}", mid, (int)resp.StatusCode, body);
            return null;
        }
        var json = JObject.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
        var data = json["data"] as JObject;
        var allowAuto = data != null && data["allowAutoMachining"] != null && data["allowAutoMachining"].Type == JTokenType.Boolean
            ? data["allowAutoMachining"].Value<bool>()
            : false;
        var allowJobStart = data != null && data["allowJobStart"] != null && data["allowJobStart"].Type == JTokenType.Boolean
            ? data["allowJobStart"].Value<bool>()
            : false;
        var flags = new MachineFlags
        {
            AllowAutoMachining = allowAuto,
            AllowJobStart = allowJobStart,
            FetchedAtUtc = DateTime.UtcNow
        };
        lock (StateLock)
        {
            MachineFlagsCache[mid] = flags;
        }
        return flags;
    }
    catch (Exception ex)
    {
        Console.WriteLine("[CncMachining] GetMachineFlagsFromBackend error machine={0} err={1}", machineId, ex.Message);
        return null;
    }
}
private static async Task<bool> ShouldAutoStartByBackendFlags(string machineId)
{
try
{
var flags = await GetMachineFlagsFromBackend(machineId);
return flags != null && flags.AllowAutoMachining;
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] ShouldAutoStartByBackendFlags error machine={0} err={1}", machineId, ex.Message);
return false;
}
}
private static bool TryGetMachineAlarms(string machineId, out List<object> alarms, out string error)
{
    alarms = new List<object>();
    error = null;
    try
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var headTypes = new short[] { 1, 2 };
        string lastErr = null;
        var anySuccess = false;
        foreach (var headType in headTypes)
        {
            if (!Mode1Api.TryGetMachineAlarmInfo(machineId, headType, out var info, out var err))
            {
                lastErr = err;
                Console.WriteLine("[CncMachining] alarm read failed machine={0} headType={1} err={2}", machineId, headType, err);
                continue;
            }
            anySuccess = true;
            var count = info.alarmArray != null ? info.alarmArray.Length : 0;
            Console.WriteLine("[CncMachining] alarm read ok machine={0} headType={1} count={2}", machineId, headType, count);
            if (info.alarmArray == null) continue;
            foreach (var a in info.alarmArray)
            {
                var key = string.Format("{0}:{1}", a.type, a.no);
                if (!seen.Add(key)) continue;
                alarms.Add(new { type = a.type, no = a.no, headType = headType });
            }
        }
        if (!anySuccess)
        {
            error = lastErr;
            return false;
        }
        if (alarms.Count == 0)
        {
            if (Mode1Api.TryGetMachineStatus(machineId, out var status, out var statusErr))
            {
                if (status == MachineStatusType.Alarm)
                {
                    Console.WriteLine("[CncMachining] alarm fallback by machine status machine={0} status={1}", machineId, status);
                    alarms.Add(new { type = (short)(-1), no = (short)(-1), headType = (short)1, source = "MachineStatusType.Alarm" });
                }
            }
            else if (!string.IsNullOrWhiteSpace(statusErr))
            {
                Console.WriteLine("[CncMachining] alarm status fallback read failed machine={0} err={1}", machineId, statusErr);
            }
        }
        return true;
    }
    catch (Exception ex)
    {
        error = ex.Message;
        return false;
    }
 }
private static async Task<(bool Success, string Error)> UploadProgramToSlot(string machineId, CncJobItem job, int slotNo)
{
string error = null;
try
{
if (job == null) return (false, null);
// 더미 job: 파일 업로드 없이 programNo로 직접 활성화
if (job.kind == CncJobKind.Dummy)
{
if (!job.programNo.HasValue || job.programNo.Value <= 0)
{
Console.WriteLine("[CncMachining] dummy job invalid programNo machine={0} jobId={1}", machineId, job?.id);
return (false, "invalid programNo for dummy job");
}
Console.WriteLine("[CncMachining] dummy job skipping upload machine={0} jobId={1} programNo={2}", machineId, job?.id, job.programNo.Value);
return (true, null);
}
if (!TryResolveJobFilePath(job, out var fullPath, out var resolveErr))
{
Console.WriteLine("[CncMachining] file resolve failed: {0}", resolveErr);
error = resolveErr;
return (false, error);
}
if (!File.Exists(fullPath))
{
try
{
var dir0 = Path.GetDirectoryName(fullPath);
Console.WriteLine(
"[CncMachining] file missing. machine={0} jobId={1} user={2} root={3} fullPath={4} dirExists={5}",
machineId,
job?.id,
Environment.UserName,
Path.GetFullPath(Config.BridgeStoreRoot),
fullPath,
string.IsNullOrEmpty(dir0) ? false : Directory.Exists(dir0)
);
}
catch { }
var resolved = TryResolveExistingPath(fullPath, out var existingPath);
if (resolved)
{
fullPath = existingPath;
}
}
if (!File.Exists(fullPath))
{
try
{
using (var fs = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
{
}
}
catch (Exception openErr)
{
Console.WriteLine(
"[CncMachining] file open failed: machine={0} jobId={1} path={2} err={3}",
machineId,
job?.id,
fullPath,
openErr.Message
);
}
// 로컬 캐시에 없으면 S3에서 내려받아 캐시한다.
var downloaded = await TryDownloadAndCacheFromS3(machineId, job, fullPath);
if (!downloaded || !File.Exists(fullPath))
{
Console.WriteLine("[CncMachining] file not found: {0}", fullPath);
error = "file not found: " + fullPath;
return (false, error);
}
}
var content = File.ReadAllText(fullPath);
var previewLines = (content ?? string.Empty)
.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None)
.Take(2)
.Select(x => x ?? string.Empty)
.ToArray();
var preview1 = previewLines.Length > 0 ? previewLines[0] : string.Empty;
var preview2 = previewLines.Length > 1 ? previewLines[1] : string.Empty;
Console.WriteLine("[CncMachining] upload source machine={0} jobId={1} path={2}", machineId, job?.id, fullPath);
Console.WriteLine("[CncMachining] upload source first-lines machine={0} jobId={1} line1={2} line2={3}", machineId, job?.id, preview1, preview2);
var processedContent = EnsureProgramHeader(content, slotNo);
var info = new UpdateMachineProgramInfo
{
headType = 1,
programNo = (short)slotNo,
programData = processedContent,
isNew = true,
};
// CNC 메모리 제약 대응: 업로드 대상 슬롯(O4000)에 기존 프로그램이 있으면 삭제 후 업로드한다.
try
{
if (!Mode1Api.TryDeleteMachineProgramInfo(machineId, 1, (short)slotNo, out var _, out var delErr))
{
if (!string.IsNullOrEmpty(delErr))
{
Console.WriteLine("[CncMachining] delete before upload ignored machine={0} jobId={1} slot=O{2} err={3}", machineId, job?.id, slotNo, delErr);
}
}
else
{
Console.WriteLine("[CncMachining] delete before upload ok machine={0} jobId={1} slot=O{2}", machineId, job?.id, slotNo);
}
}
catch { }
if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
{
    Console.WriteLine("[CncMachining] handle error machine={0} jobId={1} slot=O{2} err={3}", machineId, job?.id, slotNo, errUp);
    error = "handle error: " + errUp;
    return (false, error);
}
var upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => HiLink.SetMachineProgramInfo(handle, info), "SetMachineProgramInfo.CncMachining");
if (upRc != 0)
{
Console.WriteLine("[CncMachining] upload failed machine={0} jobId={1} slot=O{2} rc={3}", machineId, job?.id, slotNo, upRc);
error = "upload failed rc=" + upRc;
return (false, error);
}
Console.WriteLine("[CncMachining] upload ok machine={0} jobId={1} slot=O{2}", machineId, job?.id, slotNo);
return (true, null);
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] upload error machine={0} jobId={1} slot=O{2} err={3}", machineId, job?.id, slotNo, ex.Message);
error = "exception: " + ex.Message;
return (false, error);
}
}
private static bool TryResolveExistingPath(string expectedFullPath, out string existingFullPath)
{
existingFullPath = null;
try
{
var dir = Path.GetDirectoryName(expectedFullPath);
var file = Path.GetFileName(expectedFullPath);
if (string.IsNullOrEmpty(dir) || string.IsNullOrEmpty(file)) return false;
if (!Directory.Exists(dir)) return false;
var targetC = file.Normalize(NormalizationForm.FormC);
IEnumerable<string> files;
try
{
files = Directory.EnumerateFiles(dir);
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] enumerate failed dir={0} err={1}", dir, ex.Message);
return false;
}
foreach (var p in files)
{
try
{
var f = Path.GetFileName(p);
if (string.Equals(f, file, StringComparison.OrdinalIgnoreCase))
{
existingFullPath = p;
return true;
}
if (string.Equals(f.Normalize(NormalizationForm.FormC), targetC, StringComparison.OrdinalIgnoreCase))
{
existingFullPath = p;
return true;
}
}
catch { }
}
return false;
}
catch
{
return false;
}
}
private static async Task SyncQueueFromBackend(string machineId, bool force = false)
{
try
{
var mid = (machineId ?? string.Empty).Trim();
if (string.IsNullOrEmpty(mid)) return;
var now = DateTime.UtcNow;
lock (LastBackendSyncUtc)
{
if (!force && LastBackendSyncUtc.TryGetValue(mid, out var last) && (now - last).TotalSeconds < BACKEND_SYNC_INTERVAL_SEC)
{
return;
}
LastBackendSyncUtc[mid] = now;
}
var backendBase = Config.BackendBase;
if (string.IsNullOrEmpty(backendBase)) return;
var url = backendBase.TrimEnd('/') + "/cnc-machines/bridge/queue-snapshot/" + Uri.EscapeDataString(mid);
string text = null;
using (var req = new HttpRequestMessage(HttpMethod.Get, url))
{
AddSecretHeader(req);
using (var resp = await BackendClient.SendAsync(req))
{
text = await resp.Content.ReadAsStringAsync();
if (!resp.IsSuccessStatusCode)
{
Console.WriteLine("[CncMachining] backend queue snapshot failed: status={0}", (int)resp.StatusCode);
return;
}
}
}
JObject root;
try
{
root = JObject.Parse(text);
}
catch (Exception parseEx)
{
var snippet = (text ?? string.Empty);
if (snippet.Length > 500) snippet = snippet.Substring(0, 500) + "...";
Console.WriteLine("[CncMachining] queue snapshot parse error url={0} error={1} bodySnippet={2}", url, parseEx.Message, snippet);
return;
}
if (root.Value<bool?>("success") != true)
{
Console.WriteLine("[CncMachining] backend queue snapshot success=false");
return;
}
var data = root["data"] as JArray;
if (data == null) return;
var uiSnapshot = root["uiSnapshot"] as JObject;
var jobs = new List<CncJobItem>();
foreach (var j in data)
{
var id = (j?["id"]?.ToString() ?? string.Empty).Trim();
var kind = (j?["kind"]?.ToString() ?? "file").Trim();
var source = (j?["source"]?.ToString() ?? string.Empty).Trim();
var fileName = (j?["fileName"]?.ToString() ?? string.Empty).Trim();
var bridgePath = (j?["bridgePath"]?.ToString() ?? string.Empty).Trim();
var s3Key = (j?["s3Key"]?.ToString() ?? string.Empty).Trim();
var s3Bucket = (j?["s3Bucket"]?.ToString() ?? string.Empty).Trim();
var requestId = (j?["requestId"]?.ToString() ?? string.Empty).Trim();
var priority = 2;
try
{
priority = j?["priority"]?.Value<int?>() ?? 2;
}
catch { priority = 2; }
var paused = false;
try
{
paused = j?["paused"]?.Value<bool?>() ?? false;
}
catch { paused = false; }
// 백엔드 allowAutoStart가 오면 그대로 사용, 없으면 기본 false (Play로만 시작)
var allowAutoStart = j?["allowAutoStart"]?.Value<bool?>() ?? false;
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
kindRaw = string.IsNullOrEmpty(kind) ? "file" : kind,
machineId = mid,
qty = qty,
fileName = fileName,
bridgePath = bridgePath,
s3Key = s3Key,
s3Bucket = s3Bucket,
requestId = requestId,
priority = Math.Max(1, priority),
createdAtUtc = DateTime.UtcNow,
source = string.IsNullOrEmpty(source) ? "backend_db" : source,
paused = paused,
allowAutoStart = allowAutoStart,
});
}
try
{
var sample = string.Join(", ", jobs.Take(3).Select(x => string.Format("{0}({1}:{2})", x.id, x.kindRaw, x.source)));
var nowLog = DateTime.UtcNow;
var shouldLog = false;
lock (LastSnapshotLogUtc)
{
if (!LastSnapshotLogUtc.TryGetValue(mid, out var last) || (nowLog - last).TotalSeconds >= 60)
{
shouldLog = true;
LastSnapshotLogUtc[mid] = nowLog;
}
}
if (shouldLog)
{
Console.WriteLine("[CncMachining] backend snapshot machine={0} jobs={1} sample=[{2}]", mid, jobs.Count, sample);
}
}
catch { }
CncJobQueue.ReplaceQueue(mid, jobs);
if (uiSnapshot != null)
{
lock (StateLock)
{
if (!MachineStates.TryGetValue(mid, out var uiState))
{
uiState = new MachineState
{
MachineId = mid,
CurrentSlot = SLOT_A,
UiSnapshot = uiSnapshot,
UiSnapshotUpdatedAt = DateTime.UtcNow,
};
MachineStates[mid] = uiState;
}
else
{
uiState.UiSnapshot = uiSnapshot;
uiState.UiSnapshotUpdatedAt = DateTime.UtcNow;
}
}
}
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] SyncQueueFromBackend error: url={0} err={1}", Config.BackendBase, ex);
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
string text;
using (var req = new HttpRequestMessage(HttpMethod.Get, presignUrl))
{
AddSecretHeader(req);
using (var resp = await BackendClient.SendAsync(req))
{
text = await resp.Content.ReadAsStringAsync();
if (!resp.IsSuccessStatusCode)
{
Console.WriteLine("[CncMachining] download presign failed: status={0}", (int)resp.StatusCode);
return false;
}
}
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
Console.WriteLine("[CncMachining] cached from S3: {0}", fullPath);
return true;
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] TryDownloadAndCacheFromS3 error: {0}", ex.Message);
return false;
}
}
/// <summary>
/// NC 파일 content 상단에 OXXXX 프로그램 헤더가 없으면 삽입
/// </summary>
private static string EnsureProgramHeader(string content, int newNo)
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
// 한글/긴 파일명/경로길이 문제를 피하기 위해, S3 기반 job은 로컬 캐시 파일명을 jobId 기반으로 고정한다.
try
{
var sk = (job.s3Key ?? string.Empty).Trim();
var jid = (job.id ?? string.Empty).Trim();
if (!string.IsNullOrEmpty(sk) && !string.IsNullOrEmpty(jid))
{
var mid = (job.machineId ?? string.Empty).Trim();
if (string.IsNullOrEmpty(mid)) mid = "_";
var safeId = Regex.Replace(jid, @"[^A-Za-z0-9_\-]", "_");
if (string.IsNullOrEmpty(safeId)) safeId = Guid.NewGuid().ToString("N");
var safeFile = safeId + ".nc";
var p2 = Path.GetFullPath(Path.Combine(root, mid, "cache", safeFile));
if (!p2.StartsWith(root, StringComparison.OrdinalIgnoreCase))
{
error = "cache path is outside of root";
return false;
}
fullPath = p2;
return true;
}
}
catch { }
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
if (!Mode1Api.TryGetMachineInfo(machineId, out var machineInfo, out var infoError))
{
    error = infoError;
    return false;
}
var panelType = machineInfo.panelType;

if (Mode1Api.TryGetMachineAllOPInfo(machineId, panelType, out var panelList, out var panelError))
{
    var singleBlock = panelList?.FirstOrDefault(x => x != null && string.Equals((x.IOName ?? string.Empty).Trim(), "F_SB", StringComparison.OrdinalIgnoreCase));
    if (singleBlock != null && singleBlock.Status == 1)
    {
        Console.WriteLine("[CncMachining] clearing single block before start machine={0} panelType={1} ioUid={2} ioName={3} ioStatus={4}", machineId, panelType, singleBlock.IOUID, singleBlock.IOName, singleBlock.Status);
        if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, singleBlock.IOUID, false, out var singleBlockErr))
        {
            error = "single block is enabled and could not be cleared: " + (singleBlockErr ?? panelError ?? string.Empty);
            Console.WriteLine("[CncMachining] clear single block failed machine={0} err={1}", machineId, error);
            return false;
        }
        Thread.Sleep(150);
    }
}

var ioUid = Config.CncStartIoUid;
if (ioUid < 0) ioUid = 0;
if (ioUid > short.MaxValue) ioUid = 61;
Console.WriteLine("[CncMachining] start signal target machine={0} panelType={1} ioUid={2}", machineId, panelType, ioUid);
return Mode1Api.TrySetMachinePanelIO(machineId, panelType, (short)ioUid, true, out error);
}
private static bool TryGetMachineBusy(string machineId, out bool isBusy)
{
    if (CncMachineSignalUtils.TryGetMachineBusy(machineId, out isBusy))
    {
        return true;
    }
    return false;
}
private static bool TryGetProductCount(string machineId, out int count)
{
    if (CncMachineSignalUtils.TryGetProductCount(machineId, out count))
    {
        return true;
    }
    Console.WriteLine("[CncMachining] productCount read failed machine={0}", machineId);
    return false;
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
private static string GetBridgeSecret()
{
return Config.BridgeSharedSecret;
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
private static void AddSecretHeader(System.Net.Http.HttpRequestMessage req)
{
var secret = GetBridgeSecret();
if (!string.IsNullOrEmpty(secret))
{
req.Headers.Remove("X-Bridge-Secret");
req.Headers.Add("X-Bridge-Secret", secret);
}
}
private static readonly System.Net.Http.HttpClient Http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(30) };
private static async Task NotifyRuntimeStatus(string requestId, string source, string stage, string status, string label, string tone, object metadata = null, bool clear = false)
{
try
{
var backend = GetBackendBase();
if (string.IsNullOrEmpty(backend)) return;
var url = backend + "/bg/runtime-status";
var payload = new
{
    requestId = string.IsNullOrWhiteSpace(requestId) ? null : requestId,
    source = source,
    stage = stage,
    status = status,
    label = label,
    tone = tone,
    clear = clear,
    startedAt = string.Equals(status, "started", StringComparison.OrdinalIgnoreCase) ? DateTime.UtcNow : (DateTime?)null,
    metadata = metadata,
};
var json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
using (var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, url))
{
AddAuthHeader(req);
AddSecretHeader(req);
req.Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");
using (var resp = await Http.SendAsync(req))
{
_ = await resp.Content.ReadAsStringAsync();
}
}
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] NotifyRuntimeStatus error: backend={0} err={1}", GetBackendBase(), ex.Message);
}
}
private static async Task NotifyMachiningStarted(CncJobItem job, string machineId)
{
try
{
var backend = GetBackendBase();
_ = Task.Run(() => NotifyRuntimeStatus(
job?.requestId,
"bridge-server",
"machining",
"started",
"가공 시작",
"indigo",
new { machineId = machineId, fileName = job?.fileName, jobId = job?.id }
));
// register-file(sourceStep=cnc)는 BG 산출물 bookkeeping / 이벤트 적재용 보조 통지다.
// canonical 가공 시작 신호는 아래 machining/start 콜백이며,
// backend는 그 콜백을 기준으로 request 상태 전이와 가공 진행 추적을 시작해야 한다.
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
var json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
using (var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, url))
{
AddAuthHeader(req);
AddSecretHeader(req);
req.Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");
using (var resp = await Http.SendAsync(req))
{
_ = await resp.Content.ReadAsStringAsync();
}
}
// CNC machining started notify (bridge -> backend)
try
{
    if (!string.IsNullOrEmpty(backend))
    {
        var startUrl = backend + "/cnc-machines/bridge/machining/start/" + Uri.EscapeDataString(machineId);
        var startPayload = new
        {
            machineId = machineId,
            jobId = job?.id,
            requestId = job?.requestId,
            bridgePath = job?.bridgePath,
            s3Key = job?.s3Key,
            s3Bucket = job?.s3Bucket,
            createdAt = DateTime.UtcNow,
            allowAutoStart = job?.allowAutoStart,
        };
        var startJson = Newtonsoft.Json.JsonConvert.SerializeObject(startPayload);
        using (var startReq = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, startUrl))
        {
            AddAuthHeader(startReq);
            AddSecretHeader(startReq);
            startReq.Content = new System.Net.Http.StringContent(startJson, System.Text.Encoding.UTF8, "application/json");
            using (var startResp = await Http.SendAsync(startReq))
            {
                var startBody = await startResp.Content.ReadAsStringAsync();
                if (!startResp.IsSuccessStatusCode)
                {
                    Console.WriteLine("[CncMachining] NotifyMachiningStart endpoint failed status={0} body={1}", (int)startResp.StatusCode, startBody);
                }
            }
        }
    }
}
catch (Exception startEx)
{
    Console.WriteLine("[CncMachining] NotifyMachiningStart endpoint error: {0}", startEx.Message);
}
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] NotifyMachiningStarted error: backend={0} err={1}", GetBackendBase(), ex);
}
}
private static async Task NotifyMachiningTick(CncJobItem job, string machineId, string phase, string message = null)
{
try
{
    var backend = GetBackendBase();
    if (string.IsNullOrEmpty(backend)) return;
    var startedAt = DateTime.MinValue;
    lock (StateLock)
    {
        if (MachineStates.TryGetValue(machineId, out var s))
        {
            startedAt = s.StartedAtUtc;
        }
    }
    if (startedAt == DateTime.MinValue) startedAt = DateTime.UtcNow;
    var elapsedSeconds = Math.Max(0, (int)Math.Floor((DateTime.UtcNow - startedAt).TotalSeconds));
    var tickUrl = backend + "/cnc-machines/bridge/machining/tick/" + Uri.EscapeDataString(machineId);
    var tickPayload = new
    {
        machineId = machineId,
        jobId = job?.id,
        requestId = job?.requestId,
        bridgePath = job?.bridgePath,
        s3Key = job?.s3Key,
        s3Bucket = job?.s3Bucket,
        phase = phase,
        percent = (int?)null,
        message = message,
        startedAt = startedAt,
        elapsedSeconds = elapsedSeconds,
        tickAt = DateTime.UtcNow,
    };
    var tickJson = Newtonsoft.Json.JsonConvert.SerializeObject(tickPayload);
    using (var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, tickUrl))
    {
        AddAuthHeader(req);
        AddSecretHeader(req);
        req.Content = new System.Net.Http.StringContent(tickJson, System.Text.Encoding.UTF8, "application/json");
        using (var resp = await Http.SendAsync(req))
        {
            var body = await resp.Content.ReadAsStringAsync();
            if (!resp.IsSuccessStatusCode)
            {
                Console.WriteLine("[CncMachining] NotifyMachiningTick failed status={0} body={1}", (int)resp.StatusCode, body);
            }
        }
    }
}
catch (Exception ex)
{
    Console.WriteLine("[CncMachining] NotifyMachiningTick error: backend={0} err={1}", GetBackendBase(), ex);
}
}
private static async Task NotifyNcPreloadStatus(CncJobItem job, string machineId, string status, string error)
{
try
{
var backend = GetBackendBase();
if (string.IsNullOrEmpty(backend)) return;
_ = Task.Run(() => NotifyRuntimeStatus(
job?.requestId,
"bridge-server",
"machining",
string.Equals(status, "READY", StringComparison.OrdinalIgnoreCase) ? "started" : "failed",
string.Equals(status, "READY", StringComparison.OrdinalIgnoreCase) ? "NC 프리로드 준비 완료" : "NC 프리로드 실패",
string.Equals(status, "READY", StringComparison.OrdinalIgnoreCase) ? "slate" : "rose",
new { machineId = machineId, fileName = job?.fileName, error = error },
string.Equals(status, "READY", StringComparison.OrdinalIgnoreCase)
));
var url = backend + "/bg/register-file";
var canonical = string.IsNullOrWhiteSpace(job?.originalFileName)
? job?.fileName
: job.originalFileName;
var payload = new
{
sourceStep = "cnc-preload",
fileName = job?.fileName,
originalFileName = canonical,
requestId = job?.requestId,
status = string.Equals(status, "READY", StringComparison.OrdinalIgnoreCase) ? "success" : "failed",
metadata = new { machineId = machineId, error = error }
};
var json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
using (var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, url))
{
AddAuthHeader(req);
AddSecretHeader(req);
req.Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");
using (var resp = await Http.SendAsync(req))
{
_ = await resp.Content.ReadAsStringAsync();
}
}
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] NotifyNcPreloadStatus error: {0}", ex.Message);
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
isRunning = state.IsRunning,
currentJob = state.CurrentJob?.fileName,
elapsedSeconds = state.IsRunning ? (DateTime.UtcNow - state.StartedAtUtc).TotalSeconds : 0,
uiSnapshot = state.UiSnapshot,
uiSnapshotUpdatedAt = state.UiSnapshotUpdatedAt == DateTime.MinValue ? (DateTime?)null : state.UiSnapshotUpdatedAt
};
}
return null;
}
}
}
}
