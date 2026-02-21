using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Net.Http;
using System.Text;
using System.Linq;
using Microsoft.Owin.Hosting;
using Newtonsoft.Json;
namespace HiLinkBridgeWebApi48
{
    internal static class Program
    {
        private const string BaseAddress = "http://+:8002";
        private static int _shutdownOnce = 0;
        private static readonly ManualResetEventSlim ExitEvent = new ManualResetEventSlim(false);

        private static void PurgeOldFiles(string dirPath, int days)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(dirPath)) return;
                if (!Directory.Exists(dirPath)) return;
                var thresholdUtc = DateTime.UtcNow.AddDays(-Math.Abs(days));
                var files = Enumerable.Empty<string>();
                try
                {
                    files = Directory.EnumerateFiles(dirPath, "*", SearchOption.AllDirectories);
                }
                catch
                {
                    files = Enumerable.Empty<string>();
                }
                foreach (var f in files)
                {
                    try
                    {
                        var utc = File.GetLastWriteTimeUtc(f);
                        if (utc < thresholdUtc)
                        {
                            File.Delete(f);
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        private static async Task RegisterBridgeSettings()
        {
            try
            {
                var backendBaseRaw = Environment.GetEnvironmentVariable("BACKEND_BASE") ?? string.Empty;
                var backendBaseTrimmed = backendBaseRaw.Trim().TrimEnd('/');
                var backendBase = backendBaseTrimmed.EndsWith("/api", StringComparison.OrdinalIgnoreCase)
                    ? backendBaseTrimmed
                    : (backendBaseTrimmed + "/api");
                if (string.IsNullOrEmpty(backendBase))
                {
                    Console.WriteLine("[BridgeSettings] BACKEND_BASE is empty; skip register");
                    return;
                }
                var url = backendBase + "/bg/bridge-settings";
                var secret = Environment.GetEnvironmentVariable("BRIDGE_SHARED_SECRET") ?? string.Empty;
                var payload = new
                {
                    HILINK_DLL_ENTER_TIMEOUT_MS = Environment.GetEnvironmentVariable("HILINK_DLL_ENTER_TIMEOUT_MS"),
                    HILINK_DLL_HOLD_FATAL_MS = Environment.GetEnvironmentVariable("HILINK_DLL_HOLD_FATAL_MS"),
                    HILINK_FAILFAST_ON_HANG = Environment.GetEnvironmentVariable("HILINK_FAILFAST_ON_HANG"),
                    MOCK_CNC_MACHINING_ENABLED = Environment.GetEnvironmentVariable("MOCK_CNC_MACHINING_ENABLED"),
                    DUMMY_CNC_SCHEDULER_ENABLED = Environment.GetEnvironmentVariable("DUMMY_CNC_SCHEDULER_ENABLED"),
                    CNC_JOB_ASSUME_MINUTES = Environment.GetEnvironmentVariable("CNC_JOB_ASSUME_MINUTES"),
                };
                using (var client = new HttpClient())
                {
                    if (!string.IsNullOrEmpty(secret))
                    {
                        client.DefaultRequestHeaders.Add("x-bridge-secret", secret);
                    }
                    var json = JsonConvert.SerializeObject(payload);
                    var content = new StringContent(json, Encoding.UTF8, "application/json");
                    var resp = await client.PostAsync(url, content).ConfigureAwait(false);
                    var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                    if (!resp.IsSuccessStatusCode)
                    {
                        Console.WriteLine($"[BridgeSettings] register failed status={(int)resp.StatusCode} body={body}");
                    }
                    else
                    {
                        Console.WriteLine("[BridgeSettings] registered successfully");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[BridgeSettings] register exception: " + ex.Message);
            }
        }
        private delegate bool ConsoleCtrlHandler(int ctrlType);
        [DllImport("kernel32.dll")]
        private static extern bool SetConsoleCtrlHandler(ConsoleCtrlHandler handler, bool add);
        private static readonly ConsoleCtrlHandler CtrlHandler = OnConsoleCtrl;
        private static bool OnConsoleCtrl(int ctrlType)
        {
            Shutdown();
            return true;
        }
        private static void Shutdown()
        {
            if (Interlocked.Exchange(ref _shutdownOnce, 1) == 1) return;
            try { DummyCncScheduler.Stop(); } catch { }
            try { CncMachining.Stop(); } catch { }
            try { Mode1WorkerQueue.Stop(); } catch { }
            try { Mode1HandleStore.InvalidateAll(); } catch { }
            try { ExitEvent.Set(); } catch { }
        }
        private sealed class TimestampTextWriter : TextWriter
        {
            private readonly TextWriter _inner;
            public TimestampTextWriter(TextWriter inner)
            {
                _inner = inner;
            }
            public override System.Text.Encoding Encoding => _inner.Encoding;
            public override void WriteLine(string value)
            {
                var ts = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                _inner.WriteLine($"[{ts}] {value}");
            }
            public override void Write(char value)
            {
                _inner.Write(value);
            }
        }
        [STAThread]
        private static void Main(string[] args)
        {
            try
            {
                Console.SetOut(new TimestampTextWriter(Console.Out));
                Console.SetError(new TimestampTextWriter(Console.Error));
            }
            catch
            {
            }
            try
            {
                AppDomain.CurrentDomain.ProcessExit += (_, __) => Shutdown();
                Console.CancelKeyPress += (_, e) =>
                {
                    try { e.Cancel = true; } catch { }
                    Shutdown();
                };
                SetConsoleCtrlHandler(CtrlHandler, true);
            }
            catch
            {
            }
            Console.WriteLine("Starting HiLinkBridgeWebApi48 on " + BaseAddress + "...");
            try
            {
                // Force Config static ctor to run so local.env is loaded before mode logging
                _ = Config.BackendBase;
                try
                {
                    var asm = typeof(Program).Assembly;
                    Console.WriteLine("[build] asm.location=" + (asm.Location ?? ""));
                    Console.WriteLine("[build] asm.version=" + (asm.GetName()?.Version?.ToString() ?? ""));
                    var envMockEnabled = (Environment.GetEnvironmentVariable("MOCK_CNC_MACHINING_ENABLED") ?? string.Empty).Trim();
                    Console.WriteLine("[build] env.MOCK_CNC_MACHINING_ENABLED=" + (string.IsNullOrEmpty(envMockEnabled) ? "(empty)" : envMockEnabled));
                    Console.WriteLine("[build] Config.MockCncMachining=" + Config.MockCncMachining);
                }
                catch { }
                var mockEnv = (Environment.GetEnvironmentVariable("MOCK_CNC_MACHINING_ENABLED") ?? string.Empty).Trim();
                var mock = !(string.IsNullOrEmpty(mockEnv) || string.Equals(mockEnv, "false", StringComparison.OrdinalIgnoreCase) || mockEnv == "0");
                Console.WriteLine(mock
                    ? "[MODE] MOCK CNC MACHINING ENABLED (alarms ignored, simulated machining)"
                    : "[MODE] REAL CNC MACHINING (alarms enforced)");
                // 브리지 설정을 백엔드에 등록
                try
                {
                    RegisterBridgeSettings().Wait(TimeSpan.FromSeconds(5));
                }
                catch (Exception e)
                {
                    Console.WriteLine("[BridgeSettings] failed to register: " + e.Message);
                }
            }
            catch { }
            using (WebApp.Start<Startup>(BaseAddress))
            {
                Console.WriteLine("Hi-Link Bridge WebAPI (net48) is running. Initializing machines from machines.json...");
                try
                {
                    PurgeOldFiles(Config.BridgeStoreRoot, 15);
                }
                catch { }
                MachinesInitializer.InitializeFromConfig();
                DummyCncScheduler.Start();
                CncMachining.Start();
                // NcFileWatcher 미사용: 이벤트 기반(백엔드 트리거)으로 처리
                Console.WriteLine("Initialization done. Press Enter to exit.");
                _ = ThreadPool.QueueUserWorkItem(_ =>
                {
                    try { Console.ReadLine(); } catch { }
                    Shutdown();
                });
                ExitEvent.Wait();
            }
        }
    }
}
// netsh http add urlacl url=http://+:8002/ user=desktop-udai2ar\user