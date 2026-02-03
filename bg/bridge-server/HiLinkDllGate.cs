using System;
using System.Threading;

namespace HiLinkBridgeWebApi48
{
    internal static class HiLinkDllGate
    {
        private static readonly object StateLock = new object();
        private static DateTime _heldSinceUtc = DateTime.MinValue;
        private static string _heldTag = null;
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
                    lock (StateLock)
                    {
                        held = _heldSinceUtc;
                        tag = _heldTag;
                    }

                    if (held == DateTime.MinValue) return;
                    var elapsedMs = (int)Math.Max(0, (DateTime.UtcNow - held).TotalMilliseconds);
                    if (elapsedMs < HoldFatalMs) return;

                    var msg = $"Hi-Link DLL lock held too long. elapsedMs={elapsedMs} fatalMs={HoldFatalMs} tag={tag}";
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
                    }
                    try { Monitor.Exit(dllLock); } catch { }
                }
            }
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
