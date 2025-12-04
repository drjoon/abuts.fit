using System;
using Microsoft.Owin.Hosting;

namespace HiLinkBridgeWebApi48
{
    internal static class Program
    {
        private const string BaseAddress = "http://+:4005";

        [STAThread]
        private static void Main(string[] args)
        {
            Console.WriteLine("Starting HiLinkBridgeWebApi48 on " + BaseAddress + "...");
            using (WebApp.Start<Startup>(BaseAddress))
            {
                Console.WriteLine("Hi-Link Bridge WebAPI (net48) is running. Initializing machines from machines.json...");
                MachinesInitializer.InitializeFromConfig();
                Console.WriteLine("Initialization done. Press Enter to exit.");
                Console.ReadLine();
            }
        }
    }
}

// netsh http add urlacl url=http://+:4005/ user=desktop-udai2ar\user