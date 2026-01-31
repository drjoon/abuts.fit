using System;
using System.IO;
using Microsoft.Owin.Hosting;

namespace HiLinkBridgeWebApi48
{
    internal static class Program
    {
        private const string BaseAddress = "http://+:8002";

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

            Console.WriteLine("Starting HiLinkBridgeWebApi48 on " + BaseAddress + "...");
            using (WebApp.Start<Startup>(BaseAddress))
            {
                Console.WriteLine("Hi-Link Bridge WebAPI (net48) is running. Initializing machines from machines.json...");
                MachinesInitializer.InitializeFromConfig();

                DummyCncScheduler.Start();
                ManualCardMachiningWatcher.Start();
                var continuousEnabled = (Environment.GetEnvironmentVariable("CNC_CONTINUOUS_ENABLED") ?? "true").Trim();
                if (!string.Equals(continuousEnabled, "false", StringComparison.OrdinalIgnoreCase))
                {
                    CncContinuousMachining.Start();
                }
                else
                {
                    CncJobDispatcher.Start();
                }

                // NcFileWatcher 미사용: 이벤트 기반(백엔드 트리거)으로 처리
                Console.WriteLine("Initialization done. Press Enter to exit.");
                Console.ReadLine();

                DummyCncScheduler.Stop();
                CncJobDispatcher.Stop();
                CncContinuousMachining.Stop();
                ManualCardMachiningWatcher.Stop();
            }
        }
    }
}

// netsh http add urlacl url=http://+:8002/ user=desktop-udai2ar\user