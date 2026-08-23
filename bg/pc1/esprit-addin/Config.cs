// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - web/backend/controllers/requests/common.review.controller.js
using System;

using System.Globalization;

using System.IO;

using System.Reflection;

using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;

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

        public const string SurfaceRootEnv = "ABUTS_SURFACE_ROOT";

        public const string TurningDepthEnv = "ABUTS_TURNING_DEPTH";

        public const string ExitAngleEnv = "ABUTS_EXIT_ANGLE";

        public const string TurningExtendEnv = "ABUTS_TURNING_EXTEND";

        public const string RoughfreeformSplitEnableEnv = "ABUTS_ROUGHFREEFORM_SPLIT_ENABLE";

        // 2-phase(초기 Turning/Rough 분리) 제어용 env
        public const string TwoPhaseEnableEnv = "ABUTS_TWOPHASE_ENABLE";

        public const string TwoPhaseSplitXEnv = "ABUTS_TWOPHASE_SPLIT_X";

        public const string TwoPhaseTurningRegionEnv = "ABUTS_TWOPHASE_TURNING_REGION";

        public const string TwoPhaseRoughRegionEnv = "ABUTS_TWOPHASE_ROUGH_REGION";

        public const string CompositeSplitEnableEnv = "ABUTS_COMPOSITE_SPLIT_ENABLE";

        public const string CompositeSplitXEnv = "ABUTS_COMPOSITE_SPLIT_X";

        public const string CompositePrcAEnv = "ABUTS_COMPOSITE_PRC_A";

        public const string CompositePrcBEnv = "ABUTS_COMPOSITE_PRC_B";

        // Legacy: ABUTS_COMPOSITE_STEP_INCREMENT_A/B.
        // 현행 SSOT는 ABUTS_RETENTION_GROOVE(none→0.12, deep→0.20)이며 STEP_INCREMENT_* env는 쓰지 않는다.
        public const string CompositeStepIncrementAEnv = "ABUTS_COMPOSITE_STEP_INCREMENT_A";
        public const string CompositeStepIncrementBEnv = "ABUTS_COMPOSITE_STEP_INCREMENT_B";

        public const string CompositeStockAllowanceAEnv = "ABUTS_COMPOSITE_STOCK_ALLOWANCE_A";

        public const string CompositeFirstPassPercentAEnv = "ABUTS_COMPOSITE_FIRST_PASS_PERCENT_A";

        // Composite Finish_Front/Finish_Back 공차 런타임 오버라이드(mm).
        // 값이 없으면 PRC 기본값(예: 0.02)을 그대로 사용한다.
        public const string CompositeFinishToleranceEnv = "ABUTS_COMPOSITE_FINISH_TOLERANCE";

        public const string BackendUrlEnv = "BACKEND_BASE";

        public const string EspritPortEnv = "ESPRIT_ADDIN_PORT";

        public const string EspritSharedSecretEnv = "ESPRIT_SHARED_SECRET";

        public const string LegacyBridgeSecretEnv = "ABUTS_BRIDGE_SECRET";

        public const string EspritAllowIpsEnv = "ESPRIT_ALLOW_IPS";

        private const string DefaultBaseDirectory = @"C:\Users\user\abuts.fit\bg";

        private static readonly string DefaultStorageFilledDirectory = Path.Combine(DefaultBaseDirectory, "storage", "2-filled");

        private static readonly string DefaultStorageNcDirectory = Path.Combine(DefaultBaseDirectory, "storage", "3-nc");

        private static readonly string DefaultAddInRootDirectory = Path.Combine(DefaultBaseDirectory, "esprit-addin");

        private static string DefaultPrcRootDirectory => Path.Combine(DefaultAddInRootDirectory, "AcroDent");

        private static readonly string DefaultSurfaceRootDirectory = Path.Combine(DefaultAddInRootDirectory, "Surface");

        public const bool FaceBeforeCompositeDefault = true;

        public const int DefaultEspritPort = 8001;

        public const string DefaultBackendUrl = "https://abuts.fit/api";

        public const string DefaultBridgeSharedSecret = "";

        public const double DefaultTurningDepth = 1.5;  // Front Mill depth -> face.prc에서 LimitZ 설정

        public const double DefaultExitAngle = 30.0;

        // 주의: 기본값은 UserData/env 미주입 시 fallback으로 사용된다.
        // Back_Turn/ExtendTurning에서도 MainModule.TurningExtend 값을 코드 override 없이 직접 사용한다.
        public const double DefaultTurningExtend = 3.5;

        public const double DefaultStlShift = 0.05;  // #523: 탑과 포스트 상단 사이 거리

        public const int DefaultRoughfreeformSplitEnable = 0;

        public const int DefaultCompositeSplitEnable = 1;

        public const double DefaultLeftRatioOffset = 0.0;

        // public const double DefaultLeftRatioOffset = 0.3;

        public const double DefaultLeftRatio = (DefaultLeftRatioOffset+DefaultStlShift) / 20.0;

        public const double DefaultRightRatioOffset = 0.1;

        public const double DefaultCompositeBStockAllowanceForRightOffset = 0.005;

        // public const double DefaultRightRatioOffset = -0.15;

        // -0.3 for left 0.3 to #520(STL origin) which means back-turning will compensate

        public static int[] DefaultBackturnDiameters = { 6, 8, 10, 12, 14 };

        public static double[] DefaultBackturnClearances = {0.584, 1.161, 1.738, 2.316, 2.893};

        public static string BaseDirectory => GetEnvOrDefault(BaseDirectoryEnv, DefaultBaseDirectory);

        public static int EspritPort => GetIntEnvOrDefault(EspritPortEnv, DefaultEspritPort);

        public static string StorageFilledDirectory => GetEnvOrDefault(StorageFilledEnv, DefaultStorageFilledDirectory);

        public static string StorageNcDirectory => GetEnvOrDefault(StorageNcEnv, DefaultStorageNcDirectory);

        private static string _resolvedAddInRootDirectory;
        private static bool _resolvingAddInRoot;

        public static string AddInRootDirectory
        {
            get
            {
                if (!string.IsNullOrWhiteSpace(_resolvedAddInRootDirectory))
                {
                    return _resolvedAddInRootDirectory;
                }
                // AppLogger 등이 해석 중 재진입할 수 있으므로 가드
                if (_resolvingAddInRoot)
                {
                    return DefaultAddInRootDirectory;
                }
                _resolvingAddInRoot = true;
                try
                {
                    _resolvedAddInRootDirectory = ResolveAddInRootDirectory();
                    return _resolvedAddInRootDirectory;
                }
                finally
                {
                    _resolvingAddInRoot = false;
                }
            }
        }

        public static string PrcRootDirectory => GetEnvOrDefault(PrcRootEnv, Path.Combine(AddInRootDirectory, "AcroDent"));

        public static string SurfaceRootDirectory => GetEnvOrDefault(SurfaceRootEnv, Path.Combine(AddInRootDirectory, "Surface"));

        public static double TurningDepth => GetDoubleEnvOrDefault(TurningDepthEnv, DefaultTurningDepth);

        public static double ExitAngle => GetDoubleEnvOrDefault(ExitAngleEnv, DefaultExitAngle);

        public static double TurningExtend => GetDoubleEnvOrDefault(TurningExtendEnv, DefaultTurningExtend);

        public static int RoughfreeformSplitEnable => GetIntEnvOrDefault(RoughfreeformSplitEnableEnv, DefaultRoughfreeformSplitEnable);

        public static int CompositeSplitEnable => GetIntEnvOrDefault(CompositeSplitEnableEnv, DefaultCompositeSplitEnable);

        public static string CompositePrcA => GetEnvOrDefault(CompositePrcAEnv, string.Empty);

        public static string CompositePrcB => GetEnvOrDefault(CompositePrcBEnv, string.Empty);

        public static string GetBackendUrl()

        {

            return GetEnvOrDefault(BackendUrlEnv, DefaultBackendUrl);

        }

        public static string GetBridgeSecret()

        {

            var primary = GetEnvOrDefault(EspritSharedSecretEnv, string.Empty);

            if (!string.IsNullOrWhiteSpace(primary)) return primary;

            return GetEnvOrDefault(LegacyBridgeSecretEnv, DefaultBridgeSharedSecret);

        }

        public static string GetEspritAllowIpsRaw()

        {

            return GetEnvOrDefault(EspritAllowIpsEnv, "");

        }

        public static string GetEspritBaseUrl()

        {

            return $"http://+:{EspritPort}/";

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

        private static int GetIntEnvOrDefault(string key, int fallback)

        {

            try

            {

                var value = Environment.GetEnvironmentVariable(key);

                if (int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var result))

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

                AppLogger.Log($"AppConfig: local.env 로드 시작 - Path={envPath}, BaseDir={baseDir}, AsmDir={asmDir}");

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

        private static string ResolveAddInRootDirectory()
        {
            var candidates = new System.Collections.Generic.List<string>();
            var seen = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);

            void Consider(string path)
            {
                if (string.IsNullOrWhiteSpace(path))
                {
                    return;
                }
                try
                {
                    string full = Path.GetFullPath(path);
                    if (!Directory.Exists(Path.Combine(full, "AcroDent")))
                    {
                        return;
                    }
                    if (seen.Add(full))
                    {
                        candidates.Add(full);
                    }
                }
                catch
                {
                }
            }

            // 실행 위치에서 AcroDent를 가진 상위 폴더
            Consider(DetectDirectoryContainingMarker("AcroDent"));

            // 운영 PC / 개발 PC 레이아웃 차이: bg/esprit-addin vs bg/pc1/esprit-addin
            string bg = GetEnvOrDefault(BaseDirectoryEnv, DefaultBaseDirectory);
            Consider(Path.Combine(bg, "esprit-addin"));
            Consider(Path.Combine(bg, "pc1", "esprit-addin"));

            string fromEnv = GetEnvOrDefault(AddInRootEnv, string.Empty);
            Consider(fromEnv);
            Consider(DefaultAddInRootDirectory);

            foreach (string candidate in candidates)
            {
                if (IsHealthyAddInRoot(candidate))
                {
                    try { AppLogger.Log($"AppConfig: AddInRoot selected (healthy) - {candidate}"); } catch { }
                    return candidate;
                }
            }

            if (candidates.Count > 0)
            {
                try { AppLogger.Log($"AppConfig: AddInRoot fallback (AcroDent only) - {candidates[0]}"); } catch { }
                return candidates[0];
            }

            return DefaultAddInRootDirectory;
        }

        private static bool IsHealthyAddInRoot(string root)
        {
            try
            {
                if (!Directory.Exists(Path.Combine(root, "Templates")))
                {
                    return false;
                }
                string faceHoleDir = Path.Combine(root, "AcroDent", "1_Face Hole");
                if (!Directory.Exists(faceHoleDir))
                {
                    return false;
                }
                foreach (string path in Directory.GetFiles(faceHoleDir))
                {
                    if (path.EndsWith(".prc", StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }
            }
            catch
            {
            }
            return false;
        }

        private static string DetectDirectoryContainingMarker(string markerDirName)
        {
            string asmDir = null;
            try { asmDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location); } catch { }
            string baseDir = null;
            try { baseDir = AppDomain.CurrentDomain.BaseDirectory; } catch { }

            foreach (string start in new[] { asmDir, baseDir })
            {
                string found = FindMarkerUpward(start, markerDirName);
                if (!string.IsNullOrWhiteSpace(found))
                {
                    return found;
                }
            }
            return null;
        }

        private static string FindMarkerUpward(string startDirectory, string markerDirName)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(startDirectory))
                {
                    return null;
                }
                string current = Path.GetFullPath(startDirectory);
                for (int i = 0; i < 10; i++)
                {
                    if (Directory.Exists(Path.Combine(current, markerDirName)))
                    {
                        return current;
                    }
                    var parent = Directory.GetParent(current);
                    if (parent == null)
                    {
                        break;
                    }
                    current = parent.FullName;
                }
            }
            catch { }
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
