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
public class CncContinuousMachining
{
private static readonly Regex FanucRegex = new Regex(@"O(\d{1,5})", RegexOptions.IgnoreCase | RegexOptions.Compiled);
private static readonly HttpClient BackendClient = new HttpClient();
private static readonly Dictionary<string, DateTime> LastBackendSyncUtc = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
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

// 부팅 시 1회: DB(SSOT) 큐 스냅샷을 받아 메모리 큐를 복구한다.
// 주기적 폴링은 금지하며, 이후 동기화는 백엔드 push(/api/bridge/queue/{machineId}/replace)로만 수행한다.
_ = Task.Run(async () =>
{
await InitialSyncFromBackendOnce();
});

_timer = new Timer(async _ => await Tick(), null, TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(3));
Console.WriteLine("[CncContinuous] started (3s interval)");
}

private static async Task InitialSyncFromBackendOnce()
{
try
{
var backendBase = Config.BackendBase;
if (string.IsNullOrEmpty(backendBase))
{
Console.WriteLine("[CncContinuous] initial sync skipped: BACKEND_URL is empty");
return;
}

var list = MachinesConfigStore.Load() ?? new List<Models.MachineConfigItem>();
if (list.Count == 0)
{
Console.WriteLine("[CncContinuous] initial sync skipped: machines.json is empty");
return;
}

Console.WriteLine("[CncContinuous] initial queue sync started machines={0}", list.Count);

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
Console.WriteLine("[CncContinuous] initial sync failed uid={0} err={1}", m?.uid, ex.Message);
}
}

Console.WriteLine("[CncContinuous] initial queue sync done");
}
catch (Exception ex)
{
Console.WriteLine("[CncContinuous] initial queue sync error: {0}", ex.Message);
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
if (nextJob == null)
{
nextJob = CncJobQueue.Peek(machineId);
}
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
// 재시도하지 않고 큐에서 제거 (관리자가 확인 후 재등록)
CncJobQueue.Pop(machineId);
Console.WriteLine(
"[CncContinuous] start dropped machine={0} jobId={1} file={2}",
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
Console.WriteLine("[CncContinuous] higher priority job arrived; requeue preloaded nextJob machine={0} queued={1} nextJob={2}",
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
Console.WriteLine("[CncContinuous] priority override failed machine={0} err={1}", machineId, ex.Message);
}

lock (StateLock)
{
state.NextJob = null;
state.LastPreloadFailJobId = null;
state.PreloadFailCount = 0;
state.NextPreloadAttemptUtc = DateTime.MinValue;
}
}

return;
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
Console.WriteLine("[CncContinuous] preloading next job machine={0} file={1} to slot=O{2}",
machineId, nextJob.fileName, state.NextSlot);
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
Console.WriteLine("[CncContinuous] preload success machine={0} slot=O{1}",
machineId, state.NextSlot);
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
Console.WriteLine("[CncContinuous] preload error machine={0} err={1}", machineId, ex.Message);
_ = Task.Run(() => NotifyNcPreloadStatus(nextJob, machineId, "FAILED", "exception: " + ex.Message));
CncJobQueue.Pop(machineId);
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
// 4.5 Auto Start (옵션)
try
{
var autoStart = (Environment.GetEnvironmentVariable("CNC_CONTINUOUS_AUTO_START") ?? "true").Trim();
if (!string.Equals(autoStart, "false", StringComparison.OrdinalIgnoreCase))
{
if (TryStartSignal(machineId, out var startErr))
{
Console.WriteLine("[CncContinuous] start signal sent machine={0}", machineId);
}
else if (!string.IsNullOrEmpty(startErr))
{
Console.WriteLine("[CncContinuous] start signal failed machine={0} err={1}", machineId, startErr);
}
}
}
catch { }
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
var (uploaded, uploadErr) = await UploadProgramToSlot(machineId, job, state.CurrentSlot);
if (!uploaded)
{
_ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "FAILED", uploadErr ?? "start upload failed"));
return false;
}
_ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "READY", null));
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
// 4.5 Auto Start (옵션)
try
{
var autoStart = (Environment.GetEnvironmentVariable("CNC_CONTINUOUS_AUTO_START") ?? "true").Trim();
if (!string.Equals(autoStart, "false", StringComparison.OrdinalIgnoreCase))
{
if (TryStartSignal(machineId, out var startErr))
{
Console.WriteLine("[CncContinuous] start signal sent machine={0}", machineId);
}
else if (!string.IsNullOrEmpty(startErr))
{
Console.WriteLine("[CncContinuous] start signal failed machine={0} err={1}", machineId, startErr);
}
}
}
catch { }
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
_ = Task.Run(() => NotifyNcPreloadStatus(job, machineId, "FAILED", "exception: " + ex.Message));
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
Console.WriteLine("[CncContinuous] file resolve failed: {0}", resolveErr);
error = resolveErr;
return (false, error);
}
if (!File.Exists(fullPath))
{
try
{
var dir0 = Path.GetDirectoryName(fullPath);
Console.WriteLine(
"[CncContinuous] file missing. machine={0} jobId={1} user={2} root={3} fullPath={4} dirExists={5}",
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
"[CncContinuous] file open failed: machine={0} jobId={1} path={2} err={3}",
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
Console.WriteLine("[CncContinuous] file not found: {0}", fullPath);
error = "file not found: " + fullPath;
return (false, error);
}
}
var content = File.ReadAllText(fullPath);
// NC 파일 content 전처리: 상단에 OXXXX 헤더가 없으면 삽입
var processedContent = EnsureProgramHeader(content, slotNo);
var info = new UpdateMachineProgramInfo
{
headType = 0,
programNo = (short)slotNo,
programData = processedContent,
isNew = true,
};
// CNC 메모리 제약 대응: 업로드 대상 슬롯(O4000/O4001)에 기존 프로그램이 있으면 삭제 후 업로드한다.
// (연속가공 흐름상 preload는 항상 '다음 슬롯'에 수행되므로, 현재 가공 슬롯 삭제 위험은 없다.)
try
{
if (!Mode1Api.TryDeleteMachineProgramInfo(machineId, 0, (short)slotNo, out var _, out var delErr))
{
if (!string.IsNullOrEmpty(delErr))
{
Console.WriteLine("[CncContinuous] delete before upload ignored machine={0} slot=O{1} err={2}", machineId, slotNo, delErr);
}
}
else
{
Console.WriteLine("[CncContinuous] delete before upload ok machine={0} slot=O{1}", machineId, slotNo);
}
}
catch { }
if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
{
Console.WriteLine("[CncContinuous] handle error machine={0} err={1}", machineId, errUp);
error = "handle error: " + errUp;
return (false, error);
}
var upRc = HiLink.SetMachineProgramInfo(handle, info);
if (upRc != 0)
{
Console.WriteLine("[CncContinuous] upload failed machine={0} rc={1}", machineId, upRc);
error = "upload failed rc=" + upRc;
return (false, error);
}
return (true, null);
}
catch (Exception ex)
{
Console.WriteLine("[CncContinuous] upload error machine={0} err={1}", machineId, ex.Message);
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
Console.WriteLine("[CncContinuous] enumerate failed dir={0} err={1}", dir, ex.Message);
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
var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, url);
AddAuthHeader(req);
req.Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");
var resp = await Http.SendAsync(req);
_ = await resp.Content.ReadAsStringAsync();
}
catch (Exception ex)
{
Console.WriteLine("[CncContinuous] NotifyNcPreloadStatus error: {0}", ex.Message);
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
