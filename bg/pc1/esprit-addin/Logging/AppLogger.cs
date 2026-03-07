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
                LogInitialConfiguration();
            }
        }

        public static IDisposable BeginScopedLog(string scopeName = null)
        {
            EnsureInitialized();

            lock (InitLock)
            {
                DisposeListeners();

                var folder = EnsureMonthFolder();
                var fileName = string.IsNullOrWhiteSpace(scopeName)
                    ? $"{DateTime.Now:yyyyMMdd-HHmmss}.txt"
                    : $"{DateTime.Now:yyyyMMdd-HHmmss}_{Sanitize(scopeName)}.txt";
                var logFile = Path.Combine(folder, fileName);
                InitializeListeners(logFile);
                return new ScopedLogHandle();
            }
        }

        public static void BeginRun()
        {
            EnsureInitialized();

            lock (InitLock)
            {
                DisposeListeners();

                var monthFolder = EnsureMonthFolder();
                string logFile = Path.Combine(monthFolder, $"{DateTime.Now:yyyyMMdd-HHmmss}.txt");
                InitializeListeners(logFile);
            }
        }

        public static void Log(string message)
        {
            EnsureInitialized();
            var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}";
            Trace.WriteLine(line);
        }

        private static void DisposeListeners()
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
        }

        private static string EnsureMonthFolder()
        {
            string monthFolder = string.IsNullOrWhiteSpace(_monthFolder)
                ? Path.Combine(_logsRoot ?? AppDomain.CurrentDomain.BaseDirectory, DateTime.Now.ToString("yyyy-MM"))
                : _monthFolder;
            Directory.CreateDirectory(monthFolder);
            _monthFolder = monthFolder;
            return monthFolder;
        }

        private static void InitializeListeners(string logFile)
        {
            _timestampWriter = new StreamWriter(logFile, true) { AutoFlush = true };
            _latestWriter = new StreamWriter(_latestLogPath, false) { AutoFlush = true };

            _timestampListener = new TextWriterTraceListener(_timestampWriter);
            _latestListener = new TextWriterTraceListener(_latestWriter);

            Trace.Listeners.Add(_timestampListener);
            Trace.Listeners.Add(_latestListener);
            Trace.AutoFlush = true;
            Trace.WriteLine($"==== Trace started at {DateTime.Now:O} ====");
        }

        private static void LogInitialConfiguration()
        {
            try
            {
                var backendUrl = AppConfig.GetBackendUrl();
                var bridgeSecret = AppConfig.GetBridgeSecret();
                var allowIps = AppConfig.GetEspritAllowIpsRaw();
                var baseDir = AppConfig.BaseDirectory;
                var filledDir = AppConfig.StorageFilledDirectory;
                var ncDir = AppConfig.StorageNcDirectory;

                var now = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                Trace.WriteLine($"[{now}] [Config] BaseDirectory={baseDir}");
                Trace.WriteLine($"[{now}] [Config] StorageFilledDirectory={filledDir}");
                Trace.WriteLine($"[{now}] [Config] StorageNcDirectory={ncDir}");
            }
            catch
            {
                // ignore
            }
        }

        private static string Sanitize(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            foreach (var c in Path.GetInvalidFileNameChars())
            {
                value = value.Replace(c, '_');
            }
            return value.Replace(' ', '_');
        }

        private sealed class ScopedLogHandle : IDisposable
        {
            private bool _disposed;

            public void Dispose()
            {
                if (_disposed) return;
                lock (InitLock)
                {
                    DisposeListeners();
                    InitializeListeners(Path.Combine(EnsureMonthFolder(), "latest.txt"));
                }
                _disposed = true;
            }
        }
    }
}
