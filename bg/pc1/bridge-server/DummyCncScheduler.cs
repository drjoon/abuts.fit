using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace HiLinkBridgeWebApi48
{
    public static class DummyCncScheduler
    {
        public static void Start()
        {
            Console.WriteLine("[DummyCncScheduler] deprecated; backend owns dummy scheduling");
        }

        public static void Stop()
        {
            return;
        }
    }
}
