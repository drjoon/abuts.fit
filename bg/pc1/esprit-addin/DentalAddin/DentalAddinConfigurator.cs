using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using Esprit;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.DentalAddin
{
    /// <summary>
    /// DentalAddin PRC 설정 및 구성 관리
    /// </summary>
    public class DentalAddinConfigurator
    {
        private readonly DentalAddinPrcManager _prcManager;

        public DentalAddinConfigurator(DentalAddinPrcManager prcManager)
        {
            _prcManager = prcManager ?? throw new ArgumentNullException(nameof(prcManager));
        }

        public void ConfigureDentalProcesses(Type mainModuleType)
        {
            string defaultUserDataXml = DentalAddinPrcManager.GetDefaultUserDataPath();
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "DefaultXmlFileName", defaultUserDataXml);

            string prcDirectory = DentalAddinPrcManager.ResolvePrcDirectory();
            TryApplyDentalUserData(mainModuleType, ref prcDirectory);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "PrcDirectory", prcDirectory);

            string[] prcPaths = DentalAddinPrcManager.EnsurePrcArray(DentalAddinReflectionHelper.GetMainModuleField<string[]>(mainModuleType, "PrcFilePath"));
            string[] prcNames = DentalAddinPrcManager.EnsurePrcArray(DentalAddinReflectionHelper.GetMainModuleField<string[]>(mainModuleType, "PrcFileName"));
            int[] numCombobox = DentalAddinPrcManager.EnsureComboArray(DentalAddinReflectionHelper.GetMainModuleField<int[]>(mainModuleType, "NumCombobox"));

            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "PrcFilePath", prcPaths);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "PrcFileName", prcNames);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "NumCombobox", numCombobox);

            EnsurePrcBaseDefaults(prcDirectory, prcPaths, prcNames);

            if (prcPaths != null && prcPaths.Length > 4)
            {
                prcPaths[4] = null;
            }
            if (prcNames != null && prcNames.Length > 4)
            {
                prcNames[4] = null;
            }
            if (prcPaths != null && prcPaths.Length > 8)
            {
                prcPaths[8] = null;
            }
            if (prcNames != null && prcNames.Length > 8)
            {
                prcNames[8] = null;
            }

            EnsureFaceConnectionFromBackend(prcPaths, prcNames);
            EnsureCompositeDefaults(prcDirectory, prcPaths, prcNames);
            ApplyEnvOverrides(prcPaths);
            ForceFourAxisFinishing(mainModuleType, numCombobox);

            bool reverseEnabled = numCombobox != null && numCombobox.Length > 4 && numCombobox[4] == 1;
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "ReverseOn", reverseEnabled);
            AppLogger.Log(reverseEnabled
                ? "DentalAddinConfigurator: Reverse Turning 활성 (NumCombobox[4]=1)"
                : "DentalAddinConfigurator: Reverse Turning 비활성 (NumCombobox[4]!=1)");

            double roughType = DetermineRoughType(numCombobox, prcPaths, out string roughReason);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "RoughType", roughType);
            AppLogger.Log($"DentalAddinConfigurator: RoughType 자동 결정 - {roughType} ({roughReason})");

            EnsureCompositeEnabled(mainModuleType, prcPaths);
            EnsurePrcMappingsForFinishing(mainModuleType, prcPaths, prcNames);
            LogMainModuleArrays(mainModuleType);
        }

        private void TryApplyDentalUserData(Type mainModuleType, ref string prcDirectory)
        {
            if (mainModuleType == null)
            {
                return;
            }
            try
            {
                string xmlPath = DentalAddinPrcManager.GetDefaultUserDataPath();
                if (string.IsNullOrWhiteSpace(xmlPath) || !File.Exists(xmlPath))
                {
                    AppLogger.Log($"DentalAddinConfigurator: UserData xml 없음 - {xmlPath}");
                    return;
                }
                Assembly asm = mainModuleType.Assembly;
                Type serializableType = asm.GetType("DentalAddin.SerializableData");
                Type userDataType = asm.GetType("DentalAddin.UserData");
                if (serializableType == null || userDataType == null)
                {
                    AppLogger.Log("DentalAddinConfigurator: UserData 타입/SerializableData 타입을 찾지 못해 로드 생략");
                    return;
                }
                MethodInfo loadMethod = serializableType.GetMethod("Load", BindingFlags.Public | BindingFlags.Static, null, new[] { typeof(string), typeof(Type) }, null);
                if (loadMethod == null)
                {
                    AppLogger.Log("DentalAddinConfigurator: SerializableData.Load 메서드를 찾지 못해 로드 생략");
                    return;
                }
                object ud = loadMethod.Invoke(null, new object[] { xmlPath, userDataType });
                if (ud == null)
                {
                    AppLogger.Log("DentalAddinConfigurator: UserData 로드 결과가 null");
                    return;
                }
                double[] udNumData = userDataType.GetField("NumData")?.GetValue(ud) as double[];
                int[] udNumCombobox = userDataType.GetField("NumCombobox")?.GetValue(ud) as int[];
                if (udNumData != null)
                {
                    DentalAddinReflectionHelper.SetStaticField(mainModuleType, "NumData", udNumData);
                    AppLogger.Log($"DentalAddinConfigurator: UserData.NumData 적용 (Len:{udNumData.Length})");
                }
                if (udNumCombobox != null)
                {
                    DentalAddinReflectionHelper.SetStaticField(mainModuleType, "NumCombobox", udNumCombobox);
                    AppLogger.Log($"DentalAddinConfigurator: UserData.NumCombobox 적용 (Len:{udNumCombobox.Length})");
                }
            }
            catch (TargetInvocationException tie)
            {
                Exception root = tie.GetBaseException();
                AppLogger.Log($"DentalAddinConfigurator: UserData 로드 중 예외\n{root}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinConfigurator: UserData 적용 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static double DetermineRoughType(int[] numCombobox, string[] prcPaths, out string reason)
        {
            string prefix = null;
            if (numCombobox != null && numCombobox.Length > 6)
            {
                int roughMethod = numCombobox[6];
                switch (roughMethod)
                {
                    case 0:
                        reason = "NumCombobox[6]=0 (FlatEndMillRough)";
                        return 1.0;
                    case 1:
                        reason = "NumCombobox[6]=1 (BallEndMillRough2Position)";
                        return 2.0;
                    case 2:
                        reason = "NumCombobox[6]=2 (BallEndMillRough3Position)";
                        return 3.0;
                    default:
                        prefix = $"NumCombobox[6]={roughMethod} 매핑 없음, ";
                        break;
                }
            }
            double fallback = DeriveRoughTypeFromPrc(prcPaths);
            string roughPrc = (prcPaths != null && prcPaths.Length > 3) ? prcPaths[3] : "(null)";
            reason = $"{prefix}PRC 경로 기반 (RoughPRC:{roughPrc})";
            return fallback;
        }

        private static double DeriveRoughTypeFromPrc(string[] prcPaths)
        {
            string path = (prcPaths != null && prcPaths.Length > 3) ? prcPaths[3] : null;
            if (string.IsNullOrWhiteSpace(path))
            {
                return 1.0;
            }
            string normalized = path.Replace('/', '\\');
            if (normalized.IndexOf("\\8_0-180", StringComparison.OrdinalIgnoreCase) >= 0 ||
                normalized.IndexOf("0-180", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return 2.0;
            }
            if (normalized.IndexOf("\\5_Rough", StringComparison.OrdinalIgnoreCase) >= 0 ||
                normalized.IndexOf("MillRough_3D", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return 3.0;
            }
            if (normalized.IndexOf("0-120-240", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return 3.0;
            }
            return 1.0;
        }

        private void EnsurePrcBaseDefaults(string prcDirectory, string[] prcPaths, string[] prcNames)
        {
            try
            {
                if (prcPaths == null || prcNames == null)
                {
                    return;
                }
                EnsurePrcSlot(prcDirectory, prcPaths, prcNames, 1, @"3_Turning prc\Turning.prc");
                EnsurePrcSlot(prcDirectory, prcPaths, prcNames, 2, @"4_ReverseTurning prc\Reverse Turning Process.prc");
                EnsurePrcSlot(prcDirectory, prcPaths, prcNames, 3, @"5_Rough prc\MillRough_3D.prc");

                bool faceBeforeComposite = DetermineFaceBeforeComposite();
                if (faceBeforeComposite)
                {
                    EnsurePrcSlot(prcDirectory, prcPaths, prcNames, 5, @"7_FrontFace prc\FACE.prc");
                }
                EnsurePrcSlot(prcDirectory, prcPaths, prcNames, 6, @"8_0-180 prc\3D.prc");
                EnsurePrcSlot(prcDirectory, prcPaths, prcNames, 7, @"9_90-270 prc\3D_2.prc");
                EnsurePrcSlot(prcDirectory, prcPaths, prcNames, 9, @"6_Semi_Rough prc\SemiRough_2D.prc");
                if (!faceBeforeComposite)
                {
                    EnsurePrcSlot(prcDirectory, prcPaths, prcNames, 5, @"7_FrontFace prc\FACE.prc");
                }
                EnsurePrcSlot(prcDirectory, prcPaths, prcNames, 12, @"10_MarkText prc\MarkText.prc");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinConfigurator: PRC 기본값 적용 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static bool DetermineFaceBeforeComposite()
        {
            string flag = Environment.GetEnvironmentVariable("ABUTS_FACE_BEFORE_COMPOSITE");
            if (!string.IsNullOrWhiteSpace(flag))
            {
                return flag.Equals("1", StringComparison.OrdinalIgnoreCase) || flag.Equals("true", StringComparison.OrdinalIgnoreCase);
            }
            return AppConfig.FaceBeforeCompositeDefault;
        }

        private void EnsureFaceConnectionFromBackend(string[] prcPaths, string[] prcNames)
        {
            try
            {
                if (prcPaths == null || prcNames == null)
                {
                    return;
                }

                if (string.IsNullOrWhiteSpace(_prcManager.FaceHoleProcessFilePath) || string.IsNullOrWhiteSpace(_prcManager.ConnectionMachiningProcessFilePath))
                {
                    AppLogger.Log($"DentalAddinConfigurator: 백엔드 PRC 누락으로 중단 - FaceHoleProcessFilePath={_prcManager.FaceHoleProcessFilePath}, ConnectionMachiningProcessFilePath={_prcManager.ConnectionMachiningProcessFilePath}");
                    throw new InvalidOperationException("Backend PRC file path is missing");
                }

                if (prcPaths.Length > 4)
                {
                    string oldValue = prcPaths[4];
                    prcPaths[4] = _prcManager.FaceHoleProcessFilePath;
                    AppLogger.Log($"DentalAddinConfigurator: PRC[4] 백엔드값으로 갱신 - {oldValue} -> {_prcManager.FaceHoleProcessFilePath}");
                }
                if (prcNames.Length > 4)
                {
                    string oldValue = prcNames[4];
                    prcNames[4] = Path.GetFileName(_prcManager.FaceHoleProcessFilePath);
                    AppLogger.Log($"DentalAddinConfigurator: PRC[4] Name 백엔드값으로 갱신 - {oldValue} -> {prcNames[4]}");
                }

                if (prcPaths.Length > 8)
                {
                    string oldValue = prcPaths[8];
                    prcPaths[8] = _prcManager.ConnectionMachiningProcessFilePath;
                    AppLogger.Log($"DentalAddinConfigurator: PRC[8] 백엔드값으로 갱신 - {oldValue} -> {_prcManager.ConnectionMachiningProcessFilePath}");
                }
                if (prcNames.Length > 8)
                {
                    string oldValue = prcNames[8];
                    prcNames[8] = Path.GetFileName(_prcManager.ConnectionMachiningProcessFilePath);
                    AppLogger.Log($"DentalAddinConfigurator: PRC[8] Name 백엔드값으로 갱신 - {oldValue} -> {prcNames[8]}");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinConfigurator: 백엔드 PRC 적용 실패 - {ex.GetType().Name}:{ex.Message}");
                throw;
            }
        }

        private void EnsureCompositeDefaults(string prcDirectory, string[] prcPaths, string[] prcNames)
        {
            try
            {
                if (prcPaths == null || prcNames == null)
                {
                    return;
                }
                EnsurePrcSlot(prcDirectory, prcPaths, prcNames, 10, @"11_Composite prc\5axisComposite_A.prc", force:true);
                EnsurePrcSlot(prcDirectory, prcPaths, prcNames, 11, @"11_Composite prc\5axisComposite_B.prc", force:true);
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinConfigurator: Composite 기본값 적용 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private void EnsurePrcSlot(string prcDirectory, string[] paths, string[] names, int index, string relativePath, bool force = false)
        {
            if (paths == null || names == null || index < 0 || index >= paths.Length)
            {
                return;
            }
            if (!force && !string.IsNullOrWhiteSpace(paths[index]))
            {
                return;
            }
            string resolved;
            try
            {
                string candidate = Path.Combine(AppConfig.AddInRootDirectory, "AcroDent", relativePath);
                resolved = Path.GetFullPath(candidate);
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinConfigurator: 경로 조합 실패 - idx={index}, rel={relativePath}, {ex.GetType().Name}:{ex.Message}");
                return;
            }
            if (string.IsNullOrWhiteSpace(resolved) || !File.Exists(resolved))
            {
                AppLogger.Log($"DentalAddinConfigurator: PRC를 찾지 못해 건너뜀 - idx={index}, rel={relativePath}, resolved={resolved}");
                return;
            }
            paths[index] = resolved;
            if (index < names.Length)
            {
                names[index] = Path.GetFileName(resolved);
            }
            AppLogger.Log($"DentalAddinConfigurator: 기본 PRC 채움 - idx={index}, file={names[index]}");
        }

        private static void ApplyEnvOverrides(string[] prcPaths)
        {
            try
            {
                string surfaceRoot = Path.Combine(AppConfig.AddInRootDirectory, "Surface");
                Environment.SetEnvironmentVariable(AppConfig.SurfaceRootEnv, surfaceRoot);

                Environment.SetEnvironmentVariable(AppConfig.CompositeSplitEnableEnv, AppConfig.CompositeSplitEnable.ToString());

                if (prcPaths != null)
                {
                    if (prcPaths.Length > 10 && !string.IsNullOrWhiteSpace(prcPaths[10]))
                    {
                        Environment.SetEnvironmentVariable(AppConfig.CompositePrcAEnv, prcPaths[10]);
                    }
                    if (prcPaths.Length > 11 && !string.IsNullOrWhiteSpace(prcPaths[11]))
                    {
                        Environment.SetEnvironmentVariable(AppConfig.CompositePrcBEnv, prcPaths[11]);
                    }
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinConfigurator: 환경변수 설정 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static void ForceFourAxisFinishing(Type mainModuleType, int[] numCombobox)
        {
            if (numCombobox == null || numCombobox.Length <= 1)
            {
                return;
            }

            const int FourAxisIndex = 1;
            if (numCombobox[1] != FourAxisIndex)
            {
                numCombobox[1] = FourAxisIndex;
                DentalAddinReflectionHelper.SetStaticField(mainModuleType, "NumCombobox", numCombobox);
                AppLogger.Log("DentalAddinConfigurator: Finishing Method 강제 설정 - 4 Axis Milling");
            }

            int desiredMachineType = 2;
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "machinetype", desiredMachineType);
            AppLogger.Log("DentalAddinConfigurator: MachineType 강제 설정 - machinetype=2 (4 Axis)");
        }

        private static void EnsureCompositeEnabled(Type mainModuleType, string[] prcPaths)
        {
            try
            {
                int[] numCombobox = DentalAddinReflectionHelper.GetMainModuleField<int[]>(mainModuleType, "NumCombobox");
                if (numCombobox == null || numCombobox.Length <= 3)
                {
                    return;
                }
                int finishingMethod = numCombobox.Length > 1 ? numCombobox[1] : -1;
                string compositePrc = (prcPaths != null && prcPaths.Length > 11) ? prcPaths[11] : null;
                if (finishingMethod == 1)
                {
                    AppLogger.Log("DentalAddinConfigurator: Finishing Method=4 axis 선택됨 (NumCombobox[1]=1)");
                    if (string.IsNullOrWhiteSpace(compositePrc))
                    {
                        AppLogger.Log("DentalAddinConfigurator 경고: Finishing Method=4 axis지만 Composite2 PRC 경로가 비어있습니다.");
                    }
                    else
                    {
                        AppLogger.Log($"DentalAddinConfigurator: Composite2 PRC 준비됨 - {Path.GetFileName(compositePrc)}");
                    }
                }
                else
                {
                    AppLogger.Log($"DentalAddinConfigurator: Finishing Method=3d Milling (NumCombobox[1]={finishingMethod})");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinConfigurator: NumCombobox[3] 보정 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static void EnsurePrcMappingsForFinishing(Type mainModuleType, string[] prcPaths, string[] prcNames)
        {
            try
            {
                int[] numCombobox = DentalAddinReflectionHelper.GetMainModuleField<int[]>(mainModuleType, "NumCombobox");
                int finishingMethod = (numCombobox != null && numCombobox.Length > 1) ? numCombobox[1] : 0;
                if (finishingMethod != 1)
                {
                    return;
                }
                if (prcPaths == null || prcPaths.Length <= 10)
                {
                    AppLogger.Log("DentalAddinConfigurator 경고: FinishingMethod=1 이지만 PRC[10](5axisComposite) 배열 길이가 부족함");
                    return;
                }
                string compositePrc = prcPaths[10];
                if (string.IsNullOrWhiteSpace(compositePrc))
                {
                    string compositeName = (prcNames != null && prcNames.Length > 10) ? prcNames[10] : "(미지정)";
                    AppLogger.Log($"DentalAddinConfigurator 경고: FinishingMethod=1 이지만 PRC[10](5axisComposite:{compositeName}) 경로가 비어있음");
                }
                else
                {
                    AppLogger.Log($"DentalAddinConfigurator: FinishingMethod=1 - PRC[10] 사용 ({Path.GetFileName(compositePrc)})");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinConfigurator: Finishing PRC 확인 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static void LogMainModuleArrays(Type mainModuleType)
        {
            try
            {
                int[] numCombobox = DentalAddinReflectionHelper.GetMainModuleField<int[]>(mainModuleType, "NumCombobox");
                double[] numData = DentalAddinReflectionHelper.GetMainModuleField<double[]>(mainModuleType, "NumData");
                string[] prcPaths = DentalAddinReflectionHelper.GetMainModuleField<string[]>(mainModuleType, "PrcFilePath");
                string[] prcNames = DentalAddinReflectionHelper.GetMainModuleField<string[]>(mainModuleType, "PrcFileName");
                LogArray("DentalAddinConfigurator: NumCombobox", numCombobox);
                LogArray("DentalAddinConfigurator: NumData", numData);
                LogArray("DentalAddinConfigurator: PrcFileName", prcNames, value => value);
                LogArray("DentalAddinConfigurator: PrcFilePath", prcPaths, value => string.IsNullOrWhiteSpace(value) ? value : Path.GetFileName(value));
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinConfigurator: MainModule 배열 로깅 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static void LogArray<T>(string title, T[] values)
        {
            LogArray(title, values, value => value?.ToString());
        }

        private static void LogArray<T>(string title, T[] values, Func<T, string> formatter)
        {
            if (values == null)
            {
                AppLogger.Log($"{title}: null");
                return;
            }
            int max = Math.Min(values.Length, 13);
            var parts = new List<string>(max);
            for (int i = 0; i < max; i++)
            {
                string text = formatter == null ? values[i]?.ToString() : formatter(values[i]);
                parts.Add($"{i}:{text}");
            }
            AppLogger.Log($"{title}: {string.Join(", ", parts)} (Len:{values.Length})");
        }

        public static void ApplyTurningParameters(Type mainModuleType)
        {
            if (mainModuleType == null)
            {
                return;
            }
            double[] numData = DentalAddinReflectionHelper.GetMainModuleField<double[]>(mainModuleType, "NumData");
            double exitAngle = (numData != null && numData.Length > 1 && numData[1] > 0) ? numData[1] : AppConfig.ExitAngle;
            double frontMillDepth = (numData != null && numData.Length > 2 && numData[2] > 0) ? numData[2] : AppConfig.TurningDepth;
            double turningDepth = (numData != null && numData.Length > 3 && numData[3] > 0) ? numData[3] : AppConfig.TurningDepth;
            double angleNumber = (numData != null && numData.Length > 4 && numData[4] > 0) ? numData[4] : exitAngle;
            // 중요: 여기서 설정하는 turningExtend는 MainModule의 "초기 입력값(seed)"이다.
            // Back_Turn 최종 적용값은 공정 단계에서 별도 SSOT로 재해석/보정된다.
            // (예: finishLineMinZ 기반 계산 + 최소 4.0mm 보장)
            double turningExtend = (numData != null && numData.Length > 5 && numData[5] > 0) ? numData[5] : AppConfig.TurningExtend;

            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "MillingDepth", frontMillDepth);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "DownZ", frontMillDepth);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "TurningDepth", turningDepth);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "TurningExtend", turningExtend);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "Chamfer", exitAngle);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "AngleNumber", angleNumber);
            // 로그의 Extend는 "초기 로드값"이며, Back_Turn 최종 적용값 로그와 구분해서 해석해야 한다.
            // 최종값 확인은 TurningFeature_Extension.BackT / MainModuleOperations.ResolveBackTurningExtendForBackTurnRange 로그를 사용.
            AppLogger.Log($"DentalAddinConfigurator: Turning/Milling 파라미터 설정 - FrontDepth:{frontMillDepth}, TurningDepth:{turningDepth}, Extend:{turningExtend}, ExitAngle:{exitAngle}, AngleNumber:{angleNumber}");
        }
    }
}
