using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace HiLinkBridgeWebApi48
{
    /// <summary>
    /// manual-card 전용 감시 워커 (예외적으로 3초 폴링)
    /// - CNC는 완료 콜백이 없으므로 Busy(IO) 기반으로 RUN->IDLE 전환을 감지한다.
    /// - 완료 감지 시 백엔드(SSOT)로 통보하여 큐 head pop + 다음 2개 preload + (auto on이면) 다음 시작까지 수행한다.
    /// </summary>
    public static class ManualFileMachiningWatcher
    {
        private static Timer _timer;
        private static int _tickRunning = 0;
        private static int _stopping = 0;
        private static readonly object StateLock = new object();
        private static readonly Dictionary<string, bool> LastBusyMap = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        private static readonly Dictionary<string, DateTime> LastNotifyUtc = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        private static readonly Dictionary<string, bool> BusyCheckInFlight = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);

        private static int GetTimeoutMs()
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

        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

        public static void Start()
        {
            if (_timer != null) return;

            Interlocked.Exchange(ref _stopping, 0);

            var enabled = (Environment.GetEnvironmentVariable("MANUAL_FILE_WATCHER_ENABLED") ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(enabled))
            {
                enabled = (Environment.GetEnvironmentVariable("MANUAL_CARD_WATCHER_ENABLED") ?? "true").Trim();
            }
            if (string.Equals(enabled, "false", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine("[ManualFileWatcher] disabled by allowlist env");
                return;
            }

            _timer = new Timer(
                _ =>
                {
                    // Timer 콜백은 절대 await하지 않는다(네이티브 hang/예외로 Timer 스레드가 멈추는 상황 방지)
                    _ = Task.Run(async () => await Tick());
                },
                null,
                TimeSpan.FromSeconds(3),
                TimeSpan.FromSeconds(3)
            );
            Console.WriteLine("[ManualFileWatcher] started (3s interval)");
        }

        public static void Stop()
        {
            Interlocked.Exchange(ref _stopping, 1);
            try
            {
                _timer?.Dispose();
            }
            catch
            {
                // ignore
            }
            _timer = null;
        }

        private static async Task Tick()
        {
            if (Interlocked.CompareExchange(ref _stopping, 0, 0) == 1) return;
            if (Interlocked.Exchange(ref _tickRunning, 1) == 1) return;
            var startedAt = DateTime.UtcNow;
            try
            {
                if (!Controllers.ControlController.IsRunning) return;

                var backend = Config.BackendBase;
                if (string.IsNullOrEmpty(backend)) return;

                var machines = MachinesConfigStore.Load() ?? new List<Models.MachineConfigItem>();
                if (machines.Count == 0) return;

                foreach (var m in machines)
                {
                    if (Interlocked.CompareExchange(ref _stopping, 0, 0) == 1) return;

                    var uid = (m?.uid ?? string.Empty).Trim();
                    if (string.IsNullOrEmpty(uid)) continue;

                    lock (StateLock)
                    {
                        // 네이티브 호출 hang 시 Task가 회수되지 않을 수 있으므로 장비별로 단일 호출만 허용한다.
                        // (한 번이라도 hang/timeout 나면 해당 장비는 busy 체크를 스킵하여 프로세스 전체 멈춤을 방지)
                        if (BusyCheckInFlight.TryGetValue(uid, out var inflight) && inflight)
                        {
                            continue;
                        }
                        BusyCheckInFlight[uid] = true;
                    }

                    var timeoutMs = GetTimeoutMs();
                    var busyTask = Task.Run(() =>
                    {
                        try
                        {
                            if (CncMachineSignalUtils.TryGetMachineBusy(uid, out var b))
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
                        Console.WriteLine("[ManualFileWatcher] busy check timeout machine={0} timeoutMs={1}", uid, timeoutMs);
                        // timeout 이후에도 busyTask는 계속 실행될 수 있으므로 in-flight를 해제하지 않는다.
                        continue;
                    }

                    (bool ok, bool busy) busyResult;
                    try
                    {
                        busyResult = await busyTask;
                    }
                    finally
                    {
                        lock (StateLock)
                        {
                            BusyCheckInFlight[uid] = false;
                        }
                    }
                    if (!busyResult.ok)
                    {
                        continue;
                    }

                    var busy = busyResult.busy;

                    bool prevBusy;
                    lock (StateLock)
                    {
                        prevBusy = LastBusyMap.ContainsKey(uid) && LastBusyMap[uid];
                        LastBusyMap[uid] = busy;
                    }

                    // RUN->IDLE (busy 1->0) 전환 감지
                    if (prevBusy && !busy)
                    {
                        var nowUtc = DateTime.UtcNow;
                        lock (StateLock)
                        {
                            // 과도한 중복 통보 방지(네트워크 지연/상태 흔들림)
                            if (LastNotifyUtc.TryGetValue(uid, out var last) && (nowUtc - last).TotalSeconds < 2)
                            {
                                continue;
                            }
                            LastNotifyUtc[uid] = nowUtc;
                        }

                        _ = Task.Run(async () => await NotifyBackendCompleted(uid));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[ManualFileWatcher] tick error: {0}", ex.Message);
            }
            finally
            {
                Interlocked.Exchange(ref _tickRunning, 0);
            }
        }

        private static void AddBridgeSecretHeader(HttpRequestMessage req)
        {
            var secret = (Config.BridgeSharedSecret ?? string.Empty).Trim();
            if (!string.IsNullOrEmpty(secret))
            {
                req.Headers.Remove("X-Bridge-Secret");
                req.Headers.Add("X-Bridge-Secret", secret);
            }
        }

        private static async Task NotifyBackendCompleted(string machineId)
        {
            try
            {
                var backend = Config.BackendBase;
                if (string.IsNullOrEmpty(backend)) return;

                var url = backend + "/cnc-machines/bridge/manual-file/complete/" + Uri.EscapeDataString(machineId);

                var req = new HttpRequestMessage(HttpMethod.Post, url);
                AddBridgeSecretHeader(req);
                req.Content = new StringContent("{}", Encoding.UTF8, "application/json");

                var resp = await Http.SendAsync(req);
                _ = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    Console.WriteLine("[ManualFileWatcher] backend notify failed machine={0} status={1}", machineId, (int)resp.StatusCode);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[ManualFileWatcher] notify error machine={0} err={1}", machineId, ex.Message);
            }
        }
    }
}
