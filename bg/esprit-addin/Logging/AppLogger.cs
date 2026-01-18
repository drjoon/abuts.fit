using System;
using System.Diagnostics;
using System.IO;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging
{
    internal static class AppLogger
    {
        private static readonly object InitLock = new object();
        private static bool _initialized;

        private static string _latestLogPath;

        public static void EnsureInitialized()
        {
            if (_initialized)
            {
                return;
            }

            lock (InitLock)
            {
                if (_initialized)
                {
                    return;
                }

                string baseDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
                if (string.IsNullOrEmpty(baseDir))
                {
                    baseDir = AppDomain.CurrentDomain.BaseDirectory;
                }

                string logsDir = Path.Combine(baseDir, "logs");
                Directory.CreateDirectory(logsDir);

                string logFile = Path.Combine(logsDir, $"{DateTime.Now:yyyyMMdd-HHmmss}.txt");
                _latestLogPath = Path.Combine(logsDir, "latest.txt");

                var timestampWriter = new StreamWriter(logFile, true)
                {
                    AutoFlush = true
                };
                var latestWriter = new StreamWriter(_latestLogPath, false)
                {
                    AutoFlush = true
                };

                Trace.Listeners.Add(new TextWriterTraceListener(timestampWriter));
                Trace.Listeners.Add(new TextWriterTraceListener(latestWriter));
                Trace.AutoFlush = true;
                _initialized = true;
                Trace.WriteLine($"==== Trace started at {DateTime.Now:O} ====");
            }
        }

        public static void Log(string message)
        {
            EnsureInitialized();
            Trace.WriteLine(message);
        }
    }
}
