using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Owin.Hosting;

namespace HiLinkBridgeWebApi48
{
    internal static class Program
    {
        private const string BaseAddress = "http://+:8002";

        private static int _shutdownOnce = 0;
        private static readonly ManualResetEventSlim ExitEvent = new ManualResetEventSlim(false);

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
            try { ManualFileMachiningWatcher.Stop(); } catch { }
            try { HiLinkMode2Client.Stop(); } catch { }

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
            using (WebApp.Start<Startup>(BaseAddress))
            {
                Console.WriteLine("Hi-Link Bridge WebAPI (net48) is running. Initializing machines from machines.json...");
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