using System;
using System.Globalization;
using System.IO;
using System.Reflection;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject
{
    public static class AppConfig
    {
        static AppConfig()
        {
            TryLoadLocalEnv();
        }

        public const string BaseDirectoryEnv = "ABUTS_BASE_DIRECTORY";
        public const string StorageFilledEnv = "ABUTS_STORAGE_FILLED";
        public const string StorageNcEnv = "ABUTS_STORAGE_NC";
        public const string AddInRootEnv = "ABUTS_ADDIN_ROOT";
        public const string PrcRootEnv = "ABUTS_PRC_ROOT";
        public const string FaceHolePrcEnv = "ABUTS_FACE_HOLE_PRC";
        public const string ConnectionPrcEnv = "ABUTS_CONNECTION_PRC";
        public const string TurningDepthEnv = "ABUTS_TURNING_DEPTH";
        public const string ExitAngleEnv = "ABUTS_EXIT_ANGLE";
        public const string TurningExtendEnv = "ABUTS_TURNING_EXTEND";

        public const string BackendUrlEnv = "ABUTS_BACKEND_URL";
        public const string BridgeSecretEnv = "ABUTS_BRIDGE_SECRET";

        private const string DefaultBaseDirectory = @"C:\Users\user\abuts.fit\bg";
        private static readonly string DefaultStorageFilledDirectory = Path.Combine(DefaultBaseDirectory, "storage", "2-filled");
        private static readonly string DefaultStorageNcDirectory = Path.Combine(DefaultBaseDirectory, "storage", "3-nc");
        private static readonly string DefaultAddInRootDirectory = Path.Combine(DefaultBaseDirectory, "esprit-addin");
        private static readonly string DefaultPrcRootDirectory = @"C:\Program Files (x86)\D.P.Technology\ESPRIT\AddIns\DentalAddin\AcroDent";
        public const string DefaultBackendUrl = "https://abuts.fit/api";
        public const string DefaultBridgeSharedSecret = "t1ZYB4ELMWBKHDuyyUgnx4HdyRg";
        public const double DefaultTurningDepth = 1.0;
        public const double DefaultExitAngle = 30.0;
        public const double DefaultTurningExtend = 3.5;

        public const double DefaultStlShift = 0.0;  // # 523

        public const double DefaultLeftRatioOffset = 0.3;
        public const double DefaultLeftRatio = (DefaultLeftRatioOffset+DefaultStlShift) / 20.0;
        public const double DefaultRightRatioOffset = 0.3 - DefaultLeftRatioOffset;


        public static int[] DefaultBackturnDiameters = { 6, 8, 10, 12, 14 };
        public static double[] DefaultBackturnClearances = {0.584, 1.161, 1.738, 2.316, 2.893};

        public static string BaseDirectory => GetEnvOrDefault(BaseDirectoryEnv, DefaultBaseDirectory);
        public static string StorageFilledDirectory => GetEnvOrDefault(StorageFilledEnv, DefaultStorageFilledDirectory);
        public static string StorageNcDirectory => GetEnvOrDefault(StorageNcEnv, DefaultStorageNcDirectory);
        public static string AddInRootDirectory => GetEnvOrDefault(AddInRootEnv, DefaultAddInRootDirectory);
        public static string PrcRootDirectory => GetEnvOrDefault(PrcRootEnv, DefaultPrcRootDirectory);

        public static string FaceHoleProcessPath => GetEnvOrDefault(
            FaceHolePrcEnv,
            Path.Combine(PrcRootDirectory, "1_Face Hole", "네오_R_Connection_H.prc"));

        public static string ConnectionProcessPath => GetEnvOrDefault(
            ConnectionPrcEnv,
            Path.Combine(PrcRootDirectory, "2_Connection", "네오_R_Connection.prc"));

        public static double TurningDepth => GetDoubleEnvOrDefault(TurningDepthEnv, DefaultTurningDepth);
        public static double ExitAngle => GetDoubleEnvOrDefault(ExitAngleEnv, DefaultExitAngle);
        public static double TurningExtend => GetDoubleEnvOrDefault(TurningExtendEnv, DefaultTurningExtend);

        public static string GetBackendUrl()
        {
            return GetEnvOrDefault(BackendUrlEnv, DefaultBackendUrl);
        }

        public static string GetBridgeSecret()
        {
            return GetEnvOrDefault(BridgeSecretEnv, DefaultBridgeSharedSecret);
        }

        private static string GetEnvOrDefault(string key, string fallback)
        {
            try
            {
                var value = Environment.GetEnvironmentVariable(key);
                return string.IsNullOrWhiteSpace(value) ? fallback : value;
            }
            catch
            {
                return fallback;
            }
        }

        private static double GetDoubleEnvOrDefault(string key, double fallback)
        {
            try
            {
                var value = Environment.GetEnvironmentVariable(key);
                if (double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var result))
                {
                    return result;
                }
            }
            catch
            {
            }

            return fallback;
        }

        private static void TryLoadLocalEnv()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string asmDir = null;
                try
                {
                    asmDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                }
                catch
                {
                    asmDir = null;
                }

                string envPath = FindLocalEnvUpward(baseDir) ?? FindLocalEnvUpward(asmDir);

                if (string.IsNullOrWhiteSpace(envPath))
                {
                    return;
                }

                foreach (var lineRaw in File.ReadAllLines(envPath))
                {
                    var line = (lineRaw ?? string.Empty).Trim();
                    if (line.Length == 0)
                    {
                        continue;
                    }
                    if (line.StartsWith("#"))
                    {
                        continue;
                    }

                    int eq = line.IndexOf('=');
                    if (eq <= 0)
                    {
                        continue;
                    }

                    string key = line.Substring(0, eq).Trim();
                    string value = line.Substring(eq + 1).Trim();
                    if (key.Length == 0)
                    {
                        continue;
                    }

                    value = Unquote(value);

                    var existing = Environment.GetEnvironmentVariable(key);
                    if (!string.IsNullOrWhiteSpace(existing))
                    {
                        continue;
                    }

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
                if (string.IsNullOrWhiteSpace(startDirectory))
                {
                    return null;
                }

                string current = startDirectory;
                for (int i = 0; i < 10; i++)
                {
                    string candidate = Path.Combine(current, "local.env");
                    if (File.Exists(candidate))
                    {
                        return candidate;
                    }

                    var parent = Directory.GetParent(current);
                    if (parent == null)
                    {
                        break;
                    }
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
            if (string.IsNullOrEmpty(value))
            {
                return value;
            }

            if ((value.StartsWith("\"") && value.EndsWith("\"")) || (value.StartsWith("'") && value.EndsWith("'")))
            {
                if (value.Length >= 2)
                {
                    return value.Substring(1, value.Length - 2);
                }
            }

            return value;
        }
    }
}
