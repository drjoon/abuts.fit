using System;
using System.Threading;

namespace HiLinkBridgeWebApi48
{
    internal static class HiLinkDllGate
    {
        private static readonly object StateLock = new object();
        private static DateTime _heldSinceUtc = DateTime.MinValue;
        private static string _heldTag = null;
        private static int _heldThreadId = 0;
        private static DateTime _lastWarnUtc = DateTime.MinValue;
        private static Timer _watchdog;

        private static int EnterTimeoutMs
        {
            get
            {
                var raw = (Environment.GetEnvironmentVariable("HILINK_DLL_ENTER_TIMEOUT_MS") ?? string.Empty).Trim();
                if (int.TryParse(raw, out var ms) && ms >= 50 && ms <= 60000) return ms;
                return 8000;
            }
        }

        private static int WorkerTimeoutMs
        {
            get
            {
                var raw = (Environment.GetEnvironmentVariable("HILINK_WORKER_TIMEOUT_MS") ?? string.Empty).Trim();
                if (int.TryParse(raw, out var ms) && ms >= 500 && ms <= 300000) return ms;
                return 30000;
            }
        }

        private static int HoldFatalMs
        {
            get
            {
                var raw = (Environment.GetEnvironmentVariable("HILINK_DLL_HOLD_FATAL_MS") ?? string.Empty).Trim();
                if (int.TryParse(raw, out var ms) && ms >= 1000 && ms <= 300000) return ms;
                return 60000;
            }
        }

        private static bool FailFastOnHang
        {
            get
            {
                var raw = (Environment.GetEnvironmentVariable("HILINK_FAILFAST_ON_HANG") ?? string.Empty).Trim();
                return string.Equals(raw, "true", StringComparison.OrdinalIgnoreCase) || raw == "1";
            }
        }

        private static void EnsureWatchdog()
        {
            if (_watchdog != null) return;
            _watchdog = new Timer(_ =>
            {
                try
                {
                    DateTime held;
                    string tag;
                    int tid;
                    DateTime last;
                    lock (StateLock)
                    {
                        held = _heldSinceUtc;
                        tag = _heldTag;
                        tid = _heldThreadId;
                        last = _lastWarnUtc;
                    }

                    if (held == DateTime.MinValue) return;
                    var elapsedMs = (int)Math.Max(0, (DateTime.UtcNow - held).TotalMilliseconds);
                    if (elapsedMs < HoldFatalMs) return;

                    // 로그 스팸 방지: 10초에 1번만 경고
                    if (last != DateTime.MinValue && (DateTime.UtcNow - last).TotalSeconds < 10)
                    {
                        return;
                    }

                    lock (StateLock)
                    {
                        _lastWarnUtc = DateTime.UtcNow;
                    }

                    var msg = $"Hi-Link DLL lock held too long. elapsedMs={elapsedMs} fatalMs={HoldFatalMs} tag={tag} threadId={tid} heldSinceUtc={held:O}";
                    Console.Error.WriteLine("[HiLinkDllGate] " + msg);
                    if (FailFastOnHang)
                    {
                        Environment.FailFast(msg);
                    }
                }
                catch
                {
                }
            }, null, 1000, 1000);
        }

        public static T Run<T>(object dllLock, Func<T> func, string tag)
        {
            EnsureWatchdog();

            return Mode1WorkerQueue.Run(() =>
            {
                var entered = false;
                try
                {
                    entered = Monitor.TryEnter(dllLock, EnterTimeoutMs);
                    if (!entered)
                    {
                        throw new TimeoutException($"Hi-Link DLL lock enter timeout ({EnterTimeoutMs}ms). tag={tag}");
                    }

                    lock (StateLock)
                    {
                        _heldSinceUtc = DateTime.UtcNow;
                        _heldTag = tag;
                        _heldThreadId = Thread.CurrentThread.ManagedThreadId;
                    }

                    return func();
                }
                finally
                {
                    if (entered)
                    {
                        lock (StateLock)
                        {
                            _heldSinceUtc = DateTime.MinValue;
                            _heldTag = null;
                            _heldThreadId = 0;
                        }
                        try { Monitor.Exit(dllLock); } catch { }
                    }
                }
            }, "HiLinkDllGate." + tag, WorkerTimeoutMs);
        }

        public static void Run(object dllLock, Action action, string tag)
        {
            Run(dllLock, () =>
            {
                action();
                return true;
            }, tag);
        }
    }
}
