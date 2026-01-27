using System;
using System.Diagnostics;
using System.IO;
using Abuts.EspritAddIns.ESPRIT2025AddinProject;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging
{
    internal static class AppLogger
    {
        private static readonly object InitLock = new object();
        private static bool _initialized;

        private static string _latestLogPath;

        private static TextWriterTraceListener _timestampListener;
        private static TextWriterTraceListener _latestListener;
        private static StreamWriter _timestampWriter;
        private static StreamWriter _latestWriter;
        private static string _logsRoot;
        private static string _monthFolder;

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

                string baseDir = AppConfig.AddInRootDirectory;
                if (string.IsNullOrWhiteSpace(baseDir) || !Directory.Exists(baseDir))
                {
                    baseDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
                }
                if (string.IsNullOrWhiteSpace(baseDir))
                {
                    baseDir = AppDomain.CurrentDomain.BaseDirectory;
                }

                string logsRoot = Path.Combine(baseDir, "logs");
                Directory.CreateDirectory(logsRoot);

                _logsRoot = logsRoot;

                string monthFolder = Path.Combine(logsRoot, DateTime.Now.ToString("yyyy-MM"));
                Directory.CreateDirectory(monthFolder);

                _monthFolder = monthFolder;

                _latestLogPath = Path.Combine(logsRoot, "latest.txt");

                _initialized = true;
                BeginRun();
            }
        }

        public static void BeginRun()
        {
            EnsureInitialized();

            lock (InitLock)
            {
                try
                {
                    if (_timestampListener != null)
                    {
                        Trace.Listeners.Remove(_timestampListener);
                        _timestampListener.Flush();
                        _timestampListener.Dispose();
                        _timestampListener = null;
                    }
                    if (_latestListener != null)
                    {
                        Trace.Listeners.Remove(_latestListener);
                        _latestListener.Flush();
                        _latestListener.Dispose();
                        _latestListener = null;
                    }

                    if (_timestampWriter != null)
                    {
                        _timestampWriter.Flush();
                        _timestampWriter.Dispose();
                        _timestampWriter = null;
                    }
                    if (_latestWriter != null)
                    {
                        _latestWriter.Flush();
                        _latestWriter.Dispose();
                        _latestWriter = null;
                    }
                }
                catch
                {
                }

                string monthFolder = string.IsNullOrWhiteSpace(_monthFolder)
                    ? Path.Combine(_logsRoot ?? AppDomain.CurrentDomain.BaseDirectory, DateTime.Now.ToString("yyyy-MM"))
                    : _monthFolder;
                Directory.CreateDirectory(monthFolder);

                string logFile = Path.Combine(monthFolder, $"{DateTime.Now:yyyyMMdd-HHmmss}.txt");

                _timestampWriter = new StreamWriter(logFile, true) { AutoFlush = true };
                _latestWriter = new StreamWriter(_latestLogPath, false) { AutoFlush = true };

                _timestampListener = new TextWriterTraceListener(_timestampWriter);
                _latestListener = new TextWriterTraceListener(_latestWriter);

                Trace.Listeners.Add(_timestampListener);
                Trace.Listeners.Add(_latestListener);
                Trace.AutoFlush = true;
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
