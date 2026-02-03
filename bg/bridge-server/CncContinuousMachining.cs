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
public int CurrentSlot; // 현재 실행 중인 슬롯 (3000 or 3001)
public int NextSlot; // 다음 작업 대기 슬롯
public CncJobItem CurrentJob;
public CncJobItem NextJob; // 선업로드된 다음 작업
public DateTime StartedAtUtc;
public bool IsRunning;
public bool AwaitingStart;
public int ProductCountBefore; // 가공 시작 전 생산 수량
public bool SawBusy;
public bool LastBusy;
public DateTime LastManualNotifyUtc;
public string LastMachiningFailJobId;
public string LastMachiningCompleteJobId;
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
public static CncJobItem EnqueueFileJob(string machineId, string fileName, string requestId, string bridgePath = null, string s3Key = null, string s3Bucket = null, bool enqueueFront = false)
{
var mid = (machineId ?? string.Empty).Trim();
if (string.IsNullOrEmpty(mid)) return null;
var fn = (fileName ?? string.Empty).Trim();
if (string.IsNullOrEmpty(fn)) return null;
var rid = string.IsNullOrWhiteSpace(requestId) ? null : requestId;
var job = enqueueFront
                ? CncJobQueue.EnqueueFileFront(mid, fn, rid, fn)
                : CncJobQueue.EnqueueFileBack(mid, fn, rid, fn);
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
NextSlot = SLOT_B,
IsRunning = false,
AwaitingStart = false,
SawBusy = false,
LastBusy = false,
LastManualNotifyUtc = DateTime.MinValue,
LastMachiningFailJobId = null,
LastMachiningCompleteJobId = null,
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
// (중요) busy=1(실제 가공 시작) 확인 전에는 preload(기존 프로그램 삭제/새 업로드)가 돌면 안 된다.
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
// 가공 시작이 확인된 이후에만 다음 작업을 preload 한다.
await PreloadNextJob(machineId, state);
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
if (nextJob.paused)
{
    // paused 상태의 Next Up은 자동 시작/업로드를 하지 않는다.
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
// 재시도하지 않고 큐에서 제거 (관리자가 확인 후 재등록)
CncJobQueue.Pop(machineId);
Console.WriteLine("[CncMachining] start dropped machine={0} jobId={1} file={2}",
machineId,
nextJob.id,
nextJob.fileName
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
private static async Task PreloadNextJob(string machineId, MachineState state)
{
    // 이미 선업로드 완료했으면, 더 높은 우선순위 작업이 큐에 생겼는지 확인한다.
    // (manual_insert는 다음 작업으로 최우선 처리해야 함)
    if (state.NextJob != null)
    {
        var queued = CncJobQueue.Peek(machineId);
        if (queued == null) return;
        if (queued.paused) return;
        var queuedPri = GetJobPriority(queued);
        var nextPri = GetJobPriority(state.NextJob);
        if (queuedPri > nextPri)
        {
            try
            {
                Console.WriteLine("[CncMachining] higher priority job arrived; requeue preloaded nextJob machine={0} queued={1} nextJob={2}",
                    machineId, queued?.source, state.NextJob?.source);
                // 기존 NextJob을 큐로 되돌리고(queued 다음 순서), NextJob을 비워서 다음 Tick에서 queued를 선업로드한다.
                var list = CncJobQueue.Snapshot(machineId) ?? new List<CncJobItem>();
                if (list.Count > 0)
                {
                    var rebuilt = new List<CncJobItem>();
                    // 현재 큐 맨 앞(queued)은 그대로 두고, 그 다음에 기존 NextJob을 삽입한다.
                    rebuilt.Add(list[0]);
                    rebuilt.Add(state.NextJob);
                    for (int i = 1; i < list.Count; i++)
                    {
                        rebuilt.Add(list[i]);
                    }
                    CncJobQueue.ReplaceQueue(machineId, rebuilt);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CncMachining] priority override failed machine={0} err={1}", machineId, ex.Message);
            }
            lock (StateLock)
            {
                state.NextJob = null;
                state.LastPreloadFailJobId = null;
                state.PreloadFailCount = 0;
                state.NextPreloadAttemptUtc = DateTime.MinValue;
            }
            return;
        }
    }
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
        Console.WriteLine("[CncMachining] preloading next job machine={0} jobId={1} file={2} to slot=O{3}",
            machineId, nextJob?.id, nextJob?.fileName, state.NextSlot);
        var (uploaded, uploadErr) = await UploadProgramToSlot(machineId, nextJob, state.NextSlot);
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
            Console.WriteLine("[CncMachining] preload success machine={0} jobId={1} slot=O{2}", machineId, nextJob?.id, state.NextSlot);
            _ = Task.Run(() => NotifyNcPreloadStatus(nextJob, machineId, "READY", null));
        }
        else
        {
            _ = Task.Run(() => NotifyNcPreloadStatus(nextJob, machineId, "FAILED", uploadErr ?? "preload upload failed"));
            // 재시도하지 않고 큐에서 제거 (관리자가 확인 후 재등록)
            CncJobQueue.Pop(machineId);
            lock (StateLock)
            {
                state.LastPreloadFailJobId = null;
                state.PreloadFailCount = 0;
                state.NextPreloadAttemptUtc = DateTime.MinValue;
            }
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine("[CncMachining] preload error machine={0} err={1}", machineId, ex.Message);
        _ = Task.Run(() => NotifyNcPreloadStatus(nextJob, machineId, "FAILED", "exception: " + ex.Message));
        CncJobQueue.Pop(machineId);
    }
}
private static async Task SwitchToNextJob(string machineId, MachineState state)
{
try
{
Console.WriteLine("[CncMachining] switching to next job machine={0} jobId={1} from O{2} to O{3}",
machineId, state.NextJob?.id, state.CurrentSlot, state.NextSlot);
// 1. Edit 모드 전환 (Idle에서만)
if (!Mode1Api.TrySetMachineMode(machineId, "EDIT", out var modeErr))
{
Console.WriteLine("[CncMachining] edit mode failed machine={0} err={1}", machineId, modeErr);
return;
}
await Task.Delay(300);
Mode1HandleStore.Invalidate(machineId);
// 2. (옵션) 이전 슬롯 프로그램 삭제
try
{
var delEnabled = (Environment.GetEnvironmentVariable("CNC_DELETE_PREV_ON_SWITCH") ?? "false").Trim();
if (string.Equals(delEnabled, "true", StringComparison.OrdinalIgnoreCase))
{
if (!Mode1Api.TryDeleteMachineProgramInfo(machineId, 1, (short)state.CurrentSlot, out var _, out var delErr))
{
Console.WriteLine("[CncMachining] delete existing failed machine={0} jobId={1} slot=O{2} err={3}", machineId, state.CurrentJob?.id, state.CurrentSlot, delErr);
}
}
else
{
Console.WriteLine("[CncMachining] delete prev skipped machine={0} jobId={1} slot=O{2}", machineId, state.CurrentJob?.id, state.CurrentSlot);
}
}
catch { }
// 3. NextSlot 활성화 (O4000/O4001은 메인 슬롯이므로 headType=1)
var dto = new UpdateMachineActivateProgNo
{
headType = 1,
programNo = (short)state.NextSlot
};
var res = Mode1HandleStore.SetActivateProgram(machineId, dto, out var err);
if (res != 0)
{
Console.WriteLine("[CncMachining] activate failed machine={0} jobId={1} res={2} err={3}",
machineId, state.NextJob?.id, res, err);
return;
}
// 4. Auto 모드 전환
if (!Mode1Api.TrySetMachineMode(machineId, "AUTO", out var modeErr2))
{
Console.WriteLine("[CncMachining] auto mode failed machine={0} err={1}", machineId, modeErr2);
return;
}
await Task.Delay(300);
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
Console.WriteLine("[CncMachining] switch success machine={0} jobId={1} now ready O{2}",
machineId, state.CurrentJob?.id, state.CurrentSlot);
}
catch (Exception ex)
{
Console.WriteLine("[CncMachining] switch error machine={0} err={1}", machineId, ex.Message);
}
}
private static async Task<bool> StartNewJob(string machineId, MachineState state, CncJobItem job)
{
try
{
Console.WriteLine("[CncMachining] starting new job machine={0} jobId={1} file={2} slot=O{3}",
machineId, job?.id, job?.fileName, state.CurrentSlot);
// 1. Edit 모드 전환 (Idle에서만)
if (!Mode1Api.TrySetMachineMode(machineId, "EDIT", out var modeErr))
{
Console.WriteLine("[CncMachining] edit mode failed machine={0} err={1}", machineId, modeErr);
return false;
}
await Task.Delay(300);
Mode1HandleStore.Invalidate(machineId);
// 2. CurrentSlot에 업로드
var (uploaded, uploadErr) = await UploadProgramToSlot(machineId, job, state.CurrentSlot);
if (!uploaded)
{
_ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "FAILED", uploadErr ?? "start upload failed"));
return false;
}
_ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "READY", null));
// 3. 활성화 (O4000/O4001은 메인 슬롯이므로 headType=1)
var dto = new UpdateMachineActivateProgNo
{
headType = 1,
programNo = (short)state.CurrentSlot
};
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
state.IsRunning = false;
state.AwaitingStart = true;
state.StartedAtUtc = DateTime.MinValue;
state.ProductCountBefore = 0;
state.SawBusy = false;
}

// 백엔드 DB 플래그(allowAutoMachining && allowJobStart)가 true일 때만 자동 Start 신호를 보낸다.
var allowAutoStart = await ShouldAutoStartByBackendFlags(machineId);
if (allowAutoStart)
{
if (!TryStartSignal(machineId, out var startErr))
{
Console.WriteLine("[CncMachining] start signal failed machine={0} err={1}", machineId, startErr);
_ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "FAILED", "start signal failed: " + (startErr ?? string.Empty)));
return false;
}
Console.WriteLine("[CncMachining] start signal sent machine={0}", machineId);
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

private static async Task<bool> ShouldAutoStartByBackendFlags(string machineId)
{
try
{
var backendBase = Config.BackendBase;
if (string.IsNullOrEmpty(backendBase)) return false;
var mid = (machineId ?? string.Empty).Trim();
if (string.IsNullOrEmpty(mid)) return false;

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
return cached.AllowAutoMachining && cached.AllowJobStart;
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
return false;
}

var json = JObject.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
var data = json["data"] as JObject;
var allowAuto = data != null && data["allowAutoMachining"] != null && data["allowAutoMachining"].Type == JTokenType.Boolean
? data["allowAutoMachining"].Value<bool>()
: false;
var allowJobStart = data != null && data["allowJobStart"] != null && data["allowJobStart"].Type == JTokenType.Boolean
? data["allowJobStart"].Value<bool>()
: false;

lock (StateLock)
{
MachineFlagsCache[mid] = new MachineFlags
{
AllowAutoMachining = allowAuto,
AllowJobStart = allowJobStart,
FetchedAtUtc = DateTime.UtcNow
};
}

return allowAuto && allowJobStart;
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
// NC 파일 content 전처리: 상단에 OXXXX 헤더가 없으면 삽입
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
string text;
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
var root = JObject.Parse(text);
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
var paused = false;
try
{
paused = j?["paused"]?.Value<bool?>() ?? false;
}
catch { paused = false; }
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
createdAtUtc = DateTime.UtcNow,
source = string.IsNullOrEmpty(source) ? "backend_db" : source,
paused = paused
});
}
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
private static readonly System.Net.Http.HttpClient Http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(30) };
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
using (var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, url))
{
AddAuthHeader(req);
req.Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");
using (var resp = await Http.SendAsync(req))
{
_ = await resp.Content.ReadAsStringAsync();
}
}
// 수동 카드 시작 알림 (manual_file 종류인 경우)
if (!string.IsNullOrEmpty(job?.kindRaw) && job.kindRaw == "manual_file")
{
	try
	{
		var manualStartUrl = backend + "/cnc-machines/" + Uri.EscapeDataString(machineId) + "/manual-file/start";
		var manualPayload = new { jobId = job.id };
		var manualJson = Newtonsoft.Json.JsonConvert.SerializeObject(manualPayload);
		using (var manualReq = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, manualStartUrl))
		{
			AddAuthHeader(manualReq);
			manualReq.Content = new System.Net.Http.StringContent(manualJson, System.Text.Encoding.UTF8, "application/json");
			using (var manualResp = await Http.SendAsync(manualReq))
			{
				_ = await manualResp.Content.ReadAsStringAsync();
			}
		}
	}
	catch (Exception manualEx)
	{
		Console.WriteLine("[CncMachining] NotifyManualFileStart error: {0}", manualEx.Message);
	}
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
var payload = new
{
sourceStep = "cnc-preload",
fileName = job?.fileName,
originalFileName = job?.fileName,
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
