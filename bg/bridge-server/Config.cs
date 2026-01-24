using System;
using System.IO;

namespace HiLinkBridgeWebApi48
{
    public static class Config
    {
        private static readonly string BaseDirectory = AppDomain.CurrentDomain.BaseDirectory;

        private static string Get(string name, string fallback = "")
        {
            return (Environment.GetEnvironmentVariable(name) ?? fallback).Trim();
        }

        private static int GetInt(string name, int fallback, int minValue, int maxValue)
        {
            var raw = Get(name);
            if (int.TryParse(raw, out var value) && value >= minValue && value <= maxValue)
            {
                return value;
            }
            return fallback;
        }

        private static string ResolveStoreRoot()
        {
            var env = Get("BRIDGE_STORE_ROOT", @"C:\abuts.fit\bg\storage\3-direct");
            if (!string.IsNullOrEmpty(env))
            {
                return Path.GetFullPath(env);
            }

            return Path.GetFullPath(Path.Combine(BaseDirectory, "..", "..", "storage", "3-direct"));
        }

        private static string TrimBase(string value, string fallback)
        {
            var trimmed = (value ?? string.Empty).Trim().TrimEnd('/');
            if (string.IsNullOrEmpty(trimmed))
            {
                return fallback;
            }
            return trimmed;
        }

        public static string BridgeSharedSecret { get; } = Get("BRIDGE_SHARED_SECRET", "t1ZYB4ELMWBKHDuyyUgnx4HdyRg");

        public static string BridgeStoreRoot { get; } = ResolveStoreRoot();

        public static string BridgeSerial { get; } = Get("BRIDGE_SERIAL", "acwa-e8fa-65af-13df");

        public static bool DummyCncSchedulerEnabled { get; } =
            !string.Equals(Get("DUMMY_CNC_SCHEDULER_ENABLED", "true"), "false", StringComparison.OrdinalIgnoreCase);

        public static string BridgeSelfBase { get; } =
            TrimBase(Get("BRIDGE_SELF_BASE", "http://localhost:8002"), "http://localhost:8002");

        public static string BackendBase { get; } =
            TrimBase(Get("BACKEND_BASE", "https://abuts.fit/api"), "https://abuts.fit/api");

        public static int CncStartIoUid { get; } = GetInt("CNC_START_IOUID", 61, 0, short.MaxValue);

        public static int CncBusyIoUid { get; } = GetInt("CNC_BUSY_IOUID", 61, -1, short.MaxValue);

        public static int CncJobAssumeMinutes { get; } = GetInt("CNC_JOB_ASSUME_MINUTES", 20, 1, 24 * 60);
    }
}