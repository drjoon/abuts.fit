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
req.Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");
using (var resp = await Http.SendAsync(req))
{
_ = await resp.Content.ReadAsStringAsync();
}
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
metadata = new { machineId = machineId, error = error, alarms = alarms }
};
var json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
using (var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, url))
{
AddAuthHeader(req);
req.Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");
using (var resp = await Http.SendAsync(req))
{
_ = await resp.Content.ReadAsStringAsync();
}
}
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] NotifyMachiningFailed error: {0}", ex.Message);
}
}

private static int GetManualWatcherTimeoutMs()
{
var raw = (Environment.GetEnvironmentVariable("MANUAL_FILE_WATCHER_TIMEOUT_MS") ?? string.Empty).Trim();
if (string.IsNullOrEmpty(raw))
{
raw = (Environment.GetEnvironmentVariable("MANUAL_CARD_WATCHER_TIMEOUT_MS") ?? "500").Trim();
}
if (int.TryParse(raw, out var ms) && ms >= 50 && ms <= 10000)
{
return ms;
}
return 500;
}

private static async Task DetectAndNotifyManualFileCompleted(string machineId, MachineState state)
{
if (state == null) return;
var mid = (machineId ?? string.Empty).Trim();
if (string.IsNullOrEmpty(mid)) return;

// 큐 헤드가 manual_file일 때만 watcher 동작
var head = CncJobQueue.Peek(mid);
if (head == null) return;
if (!string.Equals((head.kindRaw ?? string.Empty).Trim(), "manual_file", StringComparison.OrdinalIgnoreCase)) return;

// busy 체크는 timeout으로 감싼다(네이티브 hang 방지)
var timeoutMs = GetManualWatcherTimeoutMs();
var busyTask = Task.Run(() =>
{
try
{
if (TryGetMachineBusy(mid, out var b))
{
return (ok: true, busy: b);
}
return (ok: false, busy: false);
}
catch
{
return (ok: false, busy: false);
}
});

var completed = await Task.WhenAny(busyTask, Task.Delay(timeoutMs));
if (completed != busyTask)
{
Console.WriteLine("[CncMachining] manual busy check timeout machine={0} timeoutMs={1}", mid, timeoutMs);
return;
}

(bool ok, bool busy) busyResult;
try
{
busyResult = await busyTask;
}
catch
{
return;
}
if (!busyResult.ok) return;

var busy = busyResult.busy;
var prevBusy = state.LastBusy;
state.LastBusy = busy;

if (prevBusy && !busy)
{
var nowUtc = DateTime.UtcNow;
if ((nowUtc - state.LastManualNotifyUtc).TotalSeconds < 2) return;
state.LastManualNotifyUtc = nowUtc;

_ = Task.Run(() => NotifyBackendManualFileComplete(mid));
}
}

private static async Task NotifyBackendManualFileComplete(string machineId)
{
try
{
var backendBase = Config.BackendBase;
if (string.IsNullOrEmpty(backendBase)) return;
var mid = (machineId ?? string.Empty).Trim();
if (string.IsNullOrEmpty(mid)) return;

var url = backendBase.TrimEnd('/') + "/cnc-machines/bridge/manual-file/complete/" + Uri.EscapeDataString(mid);
var req = new HttpRequestMessage(HttpMethod.Post, url);
AddSecretHeader(req);
req.Content = new StringContent("{}", Encoding.UTF8, "application/json");
var resp = await BackendClient.SendAsync(req);
_ = await resp.Content.ReadAsStringAsync();
if (!resp.IsSuccessStatusCode)
{
Console.WriteLine("[CncMachining] backend manual-file complete failed machine={0} status={1}", mid, (int)resp.StatusCode);
}
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] NotifyBackendManualFileComplete error machine={0} err={1}", machineId, ex.Message);
}
}
private static readonly Dictionary<string, MachineFlags> MachineFlagsCache = new Dictionary<string, MachineFlags>(StringComparer.OrdinalIgnoreCase);
private const int MACHINE_FLAGS_CACHE_SEC = 5;
private const int BACKEND_SYNC_INTERVAL_SEC = 10;
// 고정 슬롯 번호
private const int SLOT_A = 4000;
private const int SLOT_B = 4001;

private static int GetJobPriority(CncJobItem job)
{
if (job == null) return 0;
var src = (job.source ?? string.Empty).Trim();
if (string.Equals(src, "manual_insert", StringComparison.OrdinalIgnoreCase)) return 2;
if (string.Equals(src, "cam_approve", StringComparison.OrdinalIgnoreCase)) return 1;
return 0;
}
private class MachineState
{
public string MachineId;
public int CurrentSlot; // 현재 실행 중인 슬롯 (4000 or 4001)
public CncJobItem CurrentJob;
public DateTime StartedAtUtc;
public bool IsRunning;
public bool AwaitingStart;
public string PendingConsumeJobId;
public int ConsumeFailCount;
public DateTime NextConsumeAttemptUtc;
public int ProductCountBefore; // 가공 시작 전 생산 수량
public bool SawBusy;
public bool LastBusy;
public DateTime LastManualNotifyUtc;
public string LastMachiningFailJobId;
public string LastMachiningCompleteJobId;
public string LastStartFailJobId;
public int StartFailCount;
public DateTime NextStartAttemptUtc;
}
private static readonly object StateLock = new object();
private static readonly Dictionary<string, MachineState> MachineStates
= new Dictionary<string, MachineState>(StringComparer.OrdinalIgnoreCase);
private static Timer _timer;
private static int _tickRunning = 0;
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
public static CncJobItem EnqueueFileJob(string machineId, string fileName, string requestId, string bridgePath = null, string s3Key = null, string s3Bucket = null, bool enqueueFront = false, string originalFileName = null)
{
var mid = (machineId ?? string.Empty).Trim();
if (string.IsNullOrEmpty(mid)) return null;
var fn = (fileName ?? string.Empty).Trim();
if (string.IsNullOrEmpty(fn)) return null;
var rid = string.IsNullOrWhiteSpace(requestId) ? null : requestId;
var ofn = string.IsNullOrWhiteSpace(originalFileName) ? fn : originalFileName;
var job = enqueueFront
                ? CncJobQueue.EnqueueFileFront(mid, fn, rid, ofn)
                : CncJobQueue.EnqueueFileBack(mid, fn, rid, ofn);
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
Console.WriteLine("[CncMachining] tick error: {0}", ex);
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
IsRunning = false,
AwaitingStart = false,
SawBusy = false,
LastBusy = false,
LastManualNotifyUtc = DateTime.MinValue,
LastMachiningFailJobId = null,
LastMachiningCompleteJobId = null,
StartFailCount = 0,
NextStartAttemptUtc = DateTime.MinValue,
};
MachineStates[machineId] = state;
}
}

// 완료 후 consume(SSOT 큐 제거) 재시도 중이면 먼저 처리한다.
// (consume 성공 전에는 동일 job 재시작을 막는다.)
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
// 장비의 현재 활성 프로그램을 읽어 슬롯 기준을 맞춘다.
// (선업로드가 이미 된 경우에는 nextSlot을 바꾸지 않는다.)
RefreshSlotsFromMachine(machineId, state);

// manual_file 전용 완료 감지: busy 1->0 전환 시 백엔드에 complete 통보
try
{
await DetectAndNotifyManualFileCompleted(machineId, state);
}
catch { }

// 1. 현재 가공 중인지 확인
if (state.IsRunning)
{
// Alarm(Mode1) 기반 실패 감지 (알람이 1개 이상이면 실패로 간주)
if (state.CurrentJob != null)
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
_ = Task.Run(() => NotifyMachiningFailed(state.CurrentJob, machineId, "alarm", alarmList));
}

Console.WriteLine("[CncMachining] machining failed by alarm machine={0} alarms={1}", machineId, alarmList.Count);
lock (StateLock)
{
state.IsRunning = false;
state.AwaitingStart = false;
state.CurrentJob = null;
state.SawBusy = false;
}
return;
}
}
else
{
Console.WriteLine("[CncMachining] alarm read failed machine={0} err={1}", machineId, alarmErr);
}
}

// 가공 완료 체크
var done = await CheckJobCompleted(machineId, state);
if (done)
{
Console.WriteLine("[CncMachining] job completed machine={0} slot=O{1}",
machineId, state.CurrentSlot);

// COMPLETED 통보 (jobId 기준 1회)
try
{
var jobId = state.CurrentJob?.id;
var shouldSend = true;
lock (StateLock)
{
if (!string.IsNullOrEmpty(jobId) && string.Equals(state.LastMachiningCompleteJobId, jobId, StringComparison.OrdinalIgnoreCase))
{
shouldSend = false;
}
}
if (shouldSend)
{
lock (StateLock)
{
state.LastMachiningCompleteJobId = jobId;
}
_ = Task.Run(() => NotifyMachiningCompleted(state.CurrentJob, machineId));
}
}
catch { }

// 완료 시점에 백엔드 SSOT 큐에서 job 제거(consume)
var completedJobId = state.CurrentJob?.id;
if (!string.IsNullOrEmpty(completedJobId))
{
    if (!await TryConsumeBackendQueueJob(machineId, completedJobId))
    {
        Console.WriteLine("[CncMachining] consume after complete failed (will retry) machine={0} jobId={1}", machineId, completedJobId);
        lock (StateLock)
        {
            state.PendingConsumeJobId = completedJobId;
            state.ConsumeFailCount = Math.Max(1, state.ConsumeFailCount);
            state.NextConsumeAttemptUtc = DateTime.UtcNow.AddSeconds(2);
            state.IsRunning = false;
            state.AwaitingStart = false;
        }
        return;
    }
}

lock (StateLock)
{
state.IsRunning = false;
state.CurrentJob = null;
state.SawBusy = false;
}
}
else
{
// 가공 중: 다음 작업은 idle 상태에서 처리
}
}
else
{
// 1.5) 프로그램은 올려놨지만 Start는 사용자가 직접(또는 외부) 수행해야 하는 상태
if (state.AwaitingStart && state.CurrentJob != null)
{
if (TryGetMachineBusy(machineId, out var busy))
{
if (busy)
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
Console.WriteLine("[CncMachining] detected start machine={0} jobId={1} slot=O{2}",
machineId, state.CurrentJob?.id, state.CurrentSlot);
_ = Task.Run(() => NotifyMachiningStarted(state.CurrentJob, machineId));
}
}
return;
}
// 2. Idle 상태: 새 작업 시작
var nextJob = CncJobQueue.Peek(machineId);
if (nextJob == null)
{
    return;
}
// manual_file은 브리지에서 자동 Start/Upload를 하지 않는다. (백엔드가 preload/play를 관리)
if (string.Equals((nextJob.kindRaw ?? string.Empty).Trim(), "manual_file", StringComparison.OrdinalIgnoreCase))
{
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
// 로컬에서는 시작된 job을 큐에서 제거해서 재시작을 막는다.
// 백엔드 SSOT 큐 제거는 완료 시점에 수행한다.
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
// 시작 실패: SSOT(백엔드) 큐는 유지. 브리지에서만 백오프로 재시도한다.
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
    lock (StateLock)
    {
        state.CurrentJob = job;
        state.CurrentSlot = SLOT_A; // 임의 슬롯
        state.IsRunning = false;
        state.AwaitingStart = true;
        state.StartedAtUtc = DateTime.MinValue;
        state.ProductCountBefore = 0;
        state.SawBusy = false;
    }
    return true;
}

// 현재 가공 중인 슬롯을 피해서 다른 슬롯 선택
var uploadSlot = (state.CurrentSlot == SLOT_A) ? SLOT_B : SLOT_A;
Console.WriteLine("[CncMachining] starting new job machine={0} jobId={1} file={2} slot=O{3} (current=O{4})",
machineId, job?.id, job?.fileName, uploadSlot, state.CurrentSlot);
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
// 3. 활성화 (O4000/O4001은 메인 슬롯이므로 headType=1)
// 더미 job: programNo로 직접 활성화
short activateProgNo = job.kind == CncJobKind.Dummy && job.programNo.HasValue
  ? (short)job.programNo.Value
  : (short)uploadSlot;
var dto = new UpdateMachineActivateProgNo
{
headType = 1,
programNo = activateProgNo
};
if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var handleErr))
{
    Console.WriteLine("[CncMachining] handle missing before activate machine={0} err={1}", machineId, handleErr);
    return false;
}
var res = Mode1HandleStore.SetActivateProgram(machineId, dto, out var err);
if (res != 0)
{
Console.WriteLine("[CncMachining] activate failed machine={0} jobId={1} res={2} err={3}",
machineId, job?.id, res, err);
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
state.CurrentSlot = uploadSlot;
state.IsRunning = false;
state.AwaitingStart = true;
state.StartedAtUtc = DateTime.MinValue;
state.ProductCountBefore = 0;
state.SawBusy = false;
}

    // 원격 가공 허용(allowJobStart/allowRemoteStart)이 true이고,
    // 자동 가공 플래그(allowAutoMachining) + job.allowAutoStart 가 true일 때만 자동 Start 신호를 보낸다.
    var flags = await GetMachineFlagsFromBackend(machineId);
    var allowRemoteStart = flags != null && flags.AllowJobStart;
    var allowAutoStart = flags != null && flags.AllowAutoMachining;
    var jobAllowsAutoStart = job?.allowAutoStart == true;
    if (allowRemoteStart && allowAutoStart && jobAllowsAutoStart)
    {
        if (!TryStartSignal(machineId, out var startErr))
        {
            Console.WriteLine("[CncMachining] start signal failed machine={0} err={1}", machineId, startErr);
            _ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "FAILED", "start signal failed: " + (startErr ?? string.Empty)));
            return false;
        }
        Console.WriteLine("[CncMachining] start signal sent machine={0}", machineId);
    }
    else if (allowRemoteStart && allowAutoStart && !jobAllowsAutoStart)
    {
        Console.WriteLine("[CncMachining] auto-start skipped (job flag false) machine={0} jobId={1}", machineId, job?.id);
    }
    else if (!allowRemoteStart)
    {
        Console.WriteLine("[CncMachining] auto-start blocked (allowRemoteStart=false) machine={0} jobId={1}", machineId, job?.id);
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
        if (!Mode1Api.TryGetMachineAlarmInfo(machineId, 1, out var info, out var err))
        {
            error = err;
            return false;
        }
        if (info.alarmArray != null)
        {
            foreach (var a in info.alarmArray)
            {
                alarms.Add(new { type = a.type, no = a.no });
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
// NC 파일 content 전처리: 상단에 OXXXX 프로그램 헤더가 없으면 삽입
var processedContent = EnsureProgramHeader(content, slotNo);
var info = new UpdateMachineProgramInfo
{
headType = 1,
programNo = (short)slotNo,
programData = processedContent,
isNew = true,
};
// CNC 메모리 제약 대응: 업로드 대상 슬롯(O4000/O4001)에 기존 프로그램이 있으면 삭제 후 업로드한다.
// (연속가공 흐름상 preload는 항상 '다음 슬롯'에 수행되므로, 현재 가공 슬롯 삭제 위험은 없다.)
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
// 백엔드 allowAutoStart가 오면 그대로 사용, 없으면 '재생 상태'(paused == false)로부터 추론하여 장비페이지 Play도 자동시작 허용
var allowAutoStart = j?["allowAutoStart"]?.Value<bool?>() ?? (!paused);
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
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] SyncQueueFromBackend error: {0}", ex.Message);
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
var ioUid = Config.CncStartIoUid;
if (ioUid < 0) ioUid = 0;
if (ioUid > short.MaxValue) ioUid = 61;
return Mode1Api.TrySetMachinePanelIO(machineId, 0, (short)ioUid, true, out error);
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
private static void RefreshSlotsFromMachine(string machineId, MachineState state)
{
try
{
if (!Mode1Api.TryGetActivateProgInfo(machineId, out var info, out _))
{
return;
}
var active = CncMachineSignalUtils.TryGetActiveProgramNo(machineId) ?? ParseActiveProgramNo(info);
if (active == SLOT_A)
{
state.CurrentSlot = SLOT_A;
}
else if (active == SLOT_B)
{
state.CurrentSlot = SLOT_B;
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
var json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
using (var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, url))
{
AddAuthHeader(req);
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
        var startUrl = backend + "/api/cnc-machines/bridge/machining/start/" + Uri.EscapeDataString(machineId);
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
            startReq.Content = new System.Net.Http.StringContent(startJson, System.Text.Encoding.UTF8, "application/json");
            using (var startResp = await Http.SendAsync(startReq))
            {
                _ = await startResp.Content.ReadAsStringAsync();
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
Console.WriteLine("[CncMachining] NotifyMachiningStarted error: {0}", ex.Message);
}
}
private static async Task NotifyNcPreloadStatus(CncJobItem job, string machineId, string status, string error)
{
try
{
var backend = GetBackendBase();
if (string.IsNullOrEmpty(backend)) return;
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
elapsedSeconds = state.IsRunning ? (DateTime.UtcNow - state.StartedAtUtc).TotalSeconds : 0
};
}
return null;
}
}

}

}
