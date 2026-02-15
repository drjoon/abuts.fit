using System;

using System.IO;

using System.Collections.Generic;

using System.Linq;

namespace HiLinkBridgeWebApi48

{

    public static class Config

    {

        static Config()

        {

            TryLoadLocalEnv();

        }

        private static readonly string BaseDirectory = AppDomain.CurrentDomain.BaseDirectory;

        private static string Get(string name, string fallback = "")

        {

            return (Environment.GetEnvironmentVariable(name) ?? fallback).Trim();

        }

        private static void TryLoadLocalEnv()

        {

            try

            {

                var start = BaseDirectory;

                var envPath = FindLocalEnvUpward(start);

                if (string.IsNullOrWhiteSpace(envPath) || !File.Exists(envPath))

                {

                    Console.WriteLine("[config] local.env not found (searched up to 10 levels from " + start + ")");

                    return;

                }

                Console.WriteLine("[config] loading local.env from " + envPath);

                foreach (var lineRaw in File.ReadAllLines(envPath))

                {

                    var line = (lineRaw ?? string.Empty).Trim();

                    if (line.Length == 0) continue;

                    if (line.StartsWith("#")) continue;

                    var eq = line.IndexOf('=');

                    if (eq <= 0) continue;

                    var key = line.Substring(0, eq).Trim();

                    var value = line.Substring(eq + 1).Trim();

                    if (key.Length == 0) continue;

                    value = Unquote(value);

                    Environment.SetEnvironmentVariable(key, value);

                }

            }

            catch

            {

            }

        }

        private static string FindLocalEnvUpward(string startDirectory)

        {

            try

            {

                if (string.IsNullOrWhiteSpace(startDirectory)) return null;

                var current = startDirectory;

                for (var i = 0; i < 10; i++)

                {

                    var candidate = Path.Combine(current, "local.env");

                    if (File.Exists(candidate)) return candidate;

                    var parent = Directory.GetParent(current);

                    if (parent == null) break;

                    current = parent.FullName;

                }

            }

            catch

            {

            }

            return null;

        }

        private static string Unquote(string value)

        {

            if (string.IsNullOrEmpty(value)) return value;

            if ((value.StartsWith("\"") && value.EndsWith("\"")) || (value.StartsWith("'") && value.EndsWith("'")))

            {

                if (value.Length >= 2)

                {

                    return value.Substring(1, value.Length - 2);

                }

            }

            return value;

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

            var env = Get("BRIDGE_STORE_ROOT", @"C:\Users\user\abuts.fit\bg\storage\3-direct");

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

        public static string BridgeSharedSecret => Get("BRIDGE_SHARED_SECRET", "");

        public static string BridgeAllowIpsRaw => Get("BRIDGE_ALLOW_IPS", "");

        public static IEnumerable<string> BridgeAllowIps => BridgeAllowIpsRaw.Split(',').Select(ip => ip.Trim()).Where(ip => !string.IsNullOrEmpty(ip));

        public static string BridgeStoreRoot => ResolveStoreRoot();

        public static string BridgeSerial => Get("BRIDGE_SERIAL", "");

        public static bool DummyCncSchedulerEnabled =>

            !string.Equals(Get("DUMMY_CNC_SCHEDULER_ENABLED", ""), "false", StringComparison.OrdinalIgnoreCase);

        public static bool MockCncMachining =>

            string.Equals(Get("MOCK_CNC_MACHINING", ""), "true", StringComparison.OrdinalIgnoreCase);

        public static string BridgeSelfBase =>

            TrimBase(Get("BRIDGE_SELF_BASE", ""), "");

        public static string BackendBase =>

            TrimBase(Get("BACKEND_BASE", ""), "");

        public static int CncStartIoUid => GetInt("CNC_START_IOUID", 0, 0, short.MaxValue);

        public static int CncBusyIoUid => GetInt("CNC_BUSY_IOUID", 0, -1, short.MaxValue);

        public static int CncJobAssumeMinutes => GetInt("CNC_JOB_ASSUME_MINUTES", 0, 1, 24 * 60);

    }

}