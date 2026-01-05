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

                // NC 파일 감시 시작
                using (var watcher = new NcFileWatcher())
                {
                    watcher.Start();
                    Console.WriteLine("Initialization done. Press Enter to exit.");
                    Console.ReadLine();
                }
            }
        }
    }
}

// netsh http add urlacl url=http://+:8002/ user=desktop-udai2ar\user