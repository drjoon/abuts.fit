using System;
using Microsoft.Owin.Hosting;

namespace HiLinkBridgeWebApi48
{
    internal static class Program
    {
        private const string BaseAddress = "http://+:8002";

        [STAThread]
        private static void Main(string[] args)
        {
            Console.WriteLine("Starting HiLinkBridgeWebApi48 on " + BaseAddress + "...");
            using (WebApp.Start<Startup>(BaseAddress))
            {
                Console.WriteLine("Hi-Link Bridge WebAPI (net48) is running. Initializing machines from machines.json...");
                MachinesInitializer.InitializeFromConfig();

                DummyCncScheduler.Start();
                CncJobDispatcher.Start();

                // NcFileWatcher 미사용: 이벤트 기반(백엔드 트리거)으로 처리
                Console.WriteLine("Initialization done. Press Enter to exit.");
                Console.ReadLine();

                DummyCncScheduler.Stop();
                CncJobDispatcher.Stop();
            }
        }
    }
}

// netsh http add urlacl url=http://+:8002/ user=desktop-udai2ar\user