using Abuts.EspritAddIns.ESPRIT2025AddinProject;
using Esprit;
using EspritConstants;
using EspritFeatures;
using EspritGeometry;
using EspritGeometryBase;
using EspritGeometryRoutines;
using EspritTechnology;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

#pragma warning disable CS0162, CS0164, CS0649

namespace DentalAddin
{
    internal sealed partial class MainModule
    {
        public static void OperationSeq()
        {
            // 실행 단위마다 초기화: Turn_B 직전 선행 생성한 Composite NewA 중복 방지 플래그
            try { Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_NEWA_PRE_ADDED", null); } catch { }

            // 2026-06-08: Two-Phase를 기본값으로 변경, One-Phase는 명시적 요청 시에만 사용
            bool onePhaseEnabled = IsOnePhaseEnabled();
            bool roughSplitEnabled = IsRoughSplitEnabled();
            bool prcHasRoughSplit = HasRoughSplitMarkers();

            // One-Phase가 명시적으로 요청되지 않으면 Two-Phase가 기본값
            bool twoPhaseMode = !onePhaseEnabled && (roughSplitEnabled || prcHasRoughSplit || RoughType == 2.0 || RoughType == 3.0);

            // 명시적 One-Phase 요청 시에만 기존 단일 단계 방식 사용
            if (onePhaseEnabled)
            {
                DentalLogger.Log($"OperationSeq - OnePhase 명시 실행: 기존 단일 단계 순서로 실행 (RoughType={RoughType})");

                ValidateBeforeOperation("CustomCycle", Array.Empty<string>(), Array.Empty<string>());
                CustomCycle();

                ValidateBeforeOperation("TurningOp", Array.Empty<string>(), Array.Empty<string>());
                TurningOp();
                if (RoughType == 1.0)
                {
                    ValidateBeforeOperation("RoughMill", new[] { "RoughBoundry1", "RoughBoundry2", "RoughBoundry3" }, Array.Empty<string>());
                    RoughMill();
                    ValidateBeforeOperation("OP36", Array.Empty<string>(), Array.Empty<string>());
                    OP36();
                }
                else
                {
                    string[] roughFreeForms = (RoughType == 2.0)
                        ? new[] { "3DRoughMilling_0Degree", "3DRoughMilling_180Degree" }
                        : new[] { "3DRoughMilling_0Degree", "3DRoughMilling_120Degree", "3DRoughMilling_240Degree" };
                    string[] roughBoundaries = (RoughType == 2.0)
                        ? new[] { "RoughBoundry1" }
                        : new[] { "RoughBoundry1", "RoughBoundry2", "RoughBoundry3" };
                    ValidateBeforeOperation("RoughFreeFromMill", roughBoundaries, roughFreeForms);
                    RoughFreeFromMill();
                }

                ValidateBeforeOperation("FreeFormMill", Array.Empty<string>(), new[] { "3DMilling_0Degree", "3DMilling_90Degree", "3DMilling_180Degree", "3DMilling_270Degree" });
                FreeFormMill();
                if (Mark.MarkSign)
                {
                    ValidateBeforeOperation("MarkText", Array.Empty<string>(), new[] { "3DProject_Mark" });
                    MarkText();
                }

                ValidateBeforeOperation("CustomCycle2", Array.Empty<string>(), Array.Empty<string>());
                CustomCycle2();
                return;
            }

            // 기본값: Two-Phase 실행 (RoughType 2.0/3.0 또는 roughSplit/PRC 마커 있을 때)
            if (twoPhaseMode)
            {
                DentalLogger.Log($"OperationSeq - TwoPhase 기본 실행: Turn/Rough를 A,B 2단계 순서로 실행 (RoughType={RoughType}, RoughSplitEnv={roughSplitEnabled})");
                ClearOperationsForTwoPhase();

                ValidateBeforeOperation("CustomCycle", Array.Empty<string>(), Array.Empty<string>());
                CustomCycle();

                // 2-phase 순서 (기본값):
                // CustomCycle → Turn_A → Rough_A → FrontFace → Composite_A(신규, Face 범위) → Turn_B → Rough_B → FreeForm
                ExecuteTwoPhaseTurning("A");
                ExecuteTwoPhaseRough("A");

                ValidateBeforeOperation("FrontFaceMill", Array.Empty<string>(), new[] { "3DMilling_FrontFace" });
                FrontFaceMill();

                // 요청사항: 신규 5Axis_Composite_A를 Turn_B 직전에 선행 실행
                TryRunComposite2NewABeforeTurnB();

                ExecuteTwoPhaseTurning("B");
                ExecuteTwoPhaseRough("B");

                // Front Face는 이미 실행했으므로 FreeFormMill 내부 Front Face 단계는 건너뜀
                Environment.SetEnvironmentVariable("ABUTS_SKIP_FRONTFACE_IN_FREEFORM", "1");
                try
                {
                    ValidateBeforeOperation("FreeFormMill", Array.Empty<string>(), new[] { "3DMilling_0Degree", "3DMilling_90Degree", "3DMilling_180Degree", "3DMilling_270Degree" });
                    FreeFormMill();
                }
                finally
                {
                    Environment.SetEnvironmentVariable("ABUTS_SKIP_FRONTFACE_IN_FREEFORM", null);
                }
                if (Mark.MarkSign)
                {
                    ValidateBeforeOperation("MarkText", Array.Empty<string>(), new[] { "3DProject_Mark" });
                    MarkText();
                }

                ValidateBeforeOperation("CustomCycle2", Array.Empty<string>(), Array.Empty<string>());
                CustomCycle2();
                return;
            }

            // Fallback: RoughType 1.0이나 마커 없을 때 기존 방식 (One-Phase와 동일)
            DentalLogger.Log($"OperationSeq - Fallback OnePhase 실행 (RoughType={RoughType})");
            ValidateBeforeOperation("CustomCycle", Array.Empty<string>(), Array.Empty<string>());
            CustomCycle();
            ValidateBeforeOperation("TurningOp", Array.Empty<string>(), Array.Empty<string>());
            TurningOp();
            if (RoughType == 1.0)
            {
                ValidateBeforeOperation("RoughMill", new[] { "RoughBoundry1", "RoughBoundry2", "RoughBoundry3" }, Array.Empty<string>());
                RoughMill();
                ValidateBeforeOperation("OP36", Array.Empty<string>(), Array.Empty<string>());
                OP36();
            }
            ValidateBeforeOperation("FreeFormMill", Array.Empty<string>(), new[] { "3DMilling_0Degree", "3DMilling_90Degree", "3DMilling_180Degree", "3DMilling_270Degree" });
            FreeFormMill();
            if (Mark.MarkSign)
            {
                ValidateBeforeOperation("MarkText", Array.Empty<string>(), new[] { "3DProject_Mark" });
                MarkText();
            }
            ValidateBeforeOperation("CustomCycle2", Array.Empty<string>(), Array.Empty<string>());
            CustomCycle2();
        }

        private static void TryRunComposite2NewABeforeTurnB()
        {
            // 이미 같은 실행에서 선행 생성 완료된 경우 중복 실행 방지
            string preAdded = null;
            try { preAdded = Environment.GetEnvironmentVariable("ABUTS_COMPOSITE_NEWA_PRE_ADDED"); } catch { }
            if (string.Equals(preAdded, "1", StringComparison.OrdinalIgnoreCase) || string.Equals(preAdded, "true", StringComparison.OrdinalIgnoreCase))
            {
                DentalLogger.Log("OperationSeq - Turn_B 직전 Composite NewA 선행 실행은 이미 완료되어 재실행 생략");
                return;
            }

            try
            {
                FreeFormFeature freeFormFeature = FindFreeFormFeatureByName("3DMilling_0Degree");
                if (freeFormFeature == null)
                {
                    DentalLogger.Log("OperationSeq - Turn_B 직전 Composite NewA 선행 실행 실패: 3DMilling_0Degree 미발견");
                    return;
                }

                Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_NEWA_ONLY", "1");
                bool executed = TryRunComposite2SplitAB(freeFormFeature);
                DentalLogger.Log($"OperationSeq - Turn_B 직전 Composite NewA 선행 실행 결과: executed={executed}");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"OperationSeq - Turn_B 직전 Composite NewA 선행 실행 예외: {ex.GetType().Name}:{ex.Message}");
            }
            finally
            {
                try { Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_NEWA_ONLY", null); } catch { }
            }
        }

        private static void ClearOperationsForTwoPhase()
        {
            try
            {
                // 이전 실행에서 남은 Phase별 레이어 정리 (Clean_Module이 모를 수 있는 잔사치 제거)
                foreach (string ln in new[] { "TurnOperation_A", "TurnOperation_B", "EndTurning" })
                {
                    try { Document?.Layers?.Remove(ln); } catch { }
                }

                if (Document?.Operations == null)
                {
                    return;
                }
                int removed = 0;
                for (int i = Document.Operations.Count; i >= 1; i--)
                {
                    try
                    {
                        Document.Operations.Remove(i);
                        removed++;
                    }
                    catch
                    {
                        // ignore
                    }
                }
                DentalLogger.Log($"OperationSeq - TwoPhase 시작 전 기존 Operation 정리: removed={removed}");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"OperationSeq - 기존 Operation 정리 실패: {ex.GetType().Name}:{ex.Message}");
            }
        }

        // One-Phase 모드 확인: 명시적으로 요청 시에만 기존 단일 단계 방식 사용
        // 2026-06-08부터 Two-Phase가 기본값이 됨
        private static bool IsOnePhaseEnabled()
        {
            try
            {
                string raw = Environment.GetEnvironmentVariable("ABUTS_ONEPHASE_ENABLE");
                return string.Equals(raw, "1", StringComparison.OrdinalIgnoreCase) || string.Equals(raw, "true", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static bool IsRoughSplitEnabled()
        {
            try
            {
                string enabled = Environment.GetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_ENABLE");
                if (string.Equals(enabled, "1", StringComparison.OrdinalIgnoreCase) || string.Equals(enabled, "true", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }

                string splitX = Environment.GetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_X");
                if (!string.IsNullOrWhiteSpace(splitX))
                {
                    return true;
                }

                string prcA = Environment.GetEnvironmentVariable("ABUTS_ROUGHFREEFORM_PRC_A");
                string prcB = Environment.GetEnvironmentVariable("ABUTS_ROUGHFREEFORM_PRC_B");
                if (!string.IsNullOrWhiteSpace(prcA) || !string.IsNullOrWhiteSpace(prcB))
                {
                    return true;
                }

                string twoPhaseSplit = Environment.GetEnvironmentVariable(AppConfig.TwoPhaseSplitXEnv);
                if (!string.IsNullOrWhiteSpace(twoPhaseSplit))
                {
                    return true;
                }
            }
            catch
            {
                // ignore
            }
            return false;
        }

        private static bool HasRoughSplitMarkers()
        {
            try
            {
                string[] names = PrcFileName;
                string[] paths = PrcFilePath;
                if (names == null && paths == null)
                {
                    return false;
                }
                bool HasMarker(string value)
                {
                    if (string.IsNullOrWhiteSpace(value)) return false;
                    return value.IndexOf("ROUGH_A", StringComparison.OrdinalIgnoreCase) >= 0 ||
                           value.IndexOf("ROUGH_B", StringComparison.OrdinalIgnoreCase) >= 0;
                }
                if (names != null)
                {
                    foreach (string n in names)
                    {
                        if (HasMarker(n)) return true;
                    }
                }
                if (paths != null)
                {
                    foreach (string p in paths)
                    {
                        if (HasMarker(p)) return true;
                    }
                }
            }
            catch
            {
                // ignore
            }
            return false;
        }

        private static void ExecuteTwoPhaseTurningAndRough(string region)
        {
            Environment.SetEnvironmentVariable(AppConfig.TwoPhaseTurningRegionEnv, region);
            Environment.SetEnvironmentVariable(AppConfig.TwoPhaseRoughRegionEnv, region);
            Environment.SetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_REGION", region);
            try
            {
                int turnStart = Document?.Operations?.Count ?? 0;
                ValidateBeforeOperation($"TurningOp_{region}", Array.Empty<string>(), Array.Empty<string>());
                TurningOp();
                TagNewOperations(turnStart, $"TURN_{region}");

                int roughStart = Document?.Operations?.Count ?? 0;
                string[] roughFreeForms = (RoughType == 2.0)
                    ? new[] { "3DRoughMilling_0Degree", "3DRoughMilling_180Degree" }
                    : new[] { "3DRoughMilling_0Degree", "3DRoughMilling_120Degree", "3DRoughMilling_240Degree" };
                string[] roughBoundaries = (RoughType == 2.0)
                    ? new[] { "RoughBoundry1" }
                    : new[] { "RoughBoundry1", "RoughBoundry2", "RoughBoundry3" };
                ValidateBeforeOperation($"RoughFreeFromMill_{region}", roughBoundaries, roughFreeForms);
                RoughFreeFromMill();
                TagNewOperations(roughStart, $"ROUGH_{region}");
            }
            finally
            {
                Environment.SetEnvironmentVariable(AppConfig.TwoPhaseTurningRegionEnv, null);
                Environment.SetEnvironmentVariable(AppConfig.TwoPhaseRoughRegionEnv, null);
                Environment.SetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_REGION", null);
            }
        }

        public static void FrontFaceMill()
        {
            try
            {
                TechnologyUtility technologyUtility = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
                Layer activeLayer = GetOrCreateLayer("FreeFormMill");
                if (activeLayer == null)
                {
                    DentalLogger.Log("FrontFaceMill - FreeFormMill 레이어 확보 실패로 중단합니다.");
                    return;
                }
                Document.ActiveLayer = activeLayer;

                string file = PrcFilePath[5];
                ITechnology[] array2 = TryOpenProcess(technologyUtility, file, "FrontFaceMill:PRC[5] ParallelPlanes");
                if (array2.Length == 0)
                {
                    DentalLogger.Log("FrontFaceMill - PRC[5] 로드 실패로 공정을 중단합니다.");
                    return;
                }

                TechLatheMoldParallelPlanes techLatheMoldParallelPlanes = array2[0] as TechLatheMoldParallelPlanes;
                if (techLatheMoldParallelPlanes == null)
                {
                    DentalLogger.Log("FrontFaceMill - PRC[5] 첫 항목이 TechLatheMoldParallelPlanes가 아니어서 중단합니다.");
                    return;
                }

                // Front Face 깊이 정책:
                // - 기존 DownZ 기반 가변 깊이 대신, 요청사항에 따라 고정 1.0mm를 사용한다.
                // - 이후 Rough 대비 안전가드(0.3mm)를 추가 적용해 공구 파손 위험을 방지한다.
                ApplyFrontFaceFixedDepth(techLatheMoldParallelPlanes, "FrontFaceMill");

                ZH = Math.Abs(MoveSTL_Module.FrontPointX);

                // 안전가드: Rough_A 우측 선행절삭이 Face보다 최소 0.3mm 더 우측에 있도록 보정.
                // (Face가 더 우측으로 나가면 공구 파손 위험)
                TryApplyFaceRightEndGuard(techLatheMoldParallelPlanes, "FrontFaceMill");

                FreeFormFeature frontFace = FindFreeFormFeatureByName("3DMilling_FrontFace");
                if (LogGraphicObjectIsNull(frontFace, "FrontFaceMill feature", "Document.FreeFormFeatures에서 '3DMilling_FrontFace' FreeFormFeature를 준비하세요.", stopProcess: true))
                {
                    DentalLogger.Log("FrontFaceMill - FrontFace FreeFormFeature 누락으로 공정을 중단합니다.");
                    return;
                }

                TryAddOperation(techLatheMoldParallelPlanes, frontFace, "FrontFaceMill");
                DentalLogger.Log($"FrontFaceMill 완료 - RL:{RL}, FrontPointX:{MoveSTL_Module.FrontPointX}, DownZ:{DownZ}");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"FrontFaceMill 실패: {ex.GetType().Name}:{ex.Message}");
            }
        }

        // Turning과 Rough를 분리하여 개별 실행
        // 순서: Turn_A → Rough_A → FrontFace → Turn_B → Rough_B
        private static void ExecuteTwoPhaseTurning(string region)
        {
            Environment.SetEnvironmentVariable(AppConfig.TwoPhaseTurningRegionEnv, region);
            try
            {
                int turnStart = Document?.Operations?.Count ?? 0;
                ValidateBeforeOperation($"TurningOp_{region}", Array.Empty<string>(), Array.Empty<string>());
                TurningOp();
                TagNewOperations(turnStart, $"TURN_{region}");
                DentalLogger.Log($"ExecuteTwoPhaseTurning({region}) 완료");
            }
            finally
            {
                Environment.SetEnvironmentVariable(AppConfig.TwoPhaseTurningRegionEnv, null);
            }
        }

        private static void ExecuteTwoPhaseRough(string region)
        {
            string prevRoughSplitEnable = Environment.GetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_ENABLE");
            Environment.SetEnvironmentVariable(AppConfig.TwoPhaseRoughRegionEnv, region);
            Environment.SetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_REGION", region);
            Environment.SetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_ENABLE", "1");
            try
            {
                DentalLogger.Log($"ExecuteTwoPhaseRough({region}) - split enable 강제(ABUTS_ROUGHFREEFORM_SPLIT_ENABLE=1), prev='{prevRoughSplitEnable ?? ""}'");
                int roughStart = Document?.Operations?.Count ?? 0;
                string[] roughFreeForms = (RoughType == 2.0)
                    ? new[] { "3DRoughMilling_0Degree", "3DRoughMilling_180Degree" }
                    : new[] { "3DRoughMilling_0Degree", "3DRoughMilling_120Degree", "3DRoughMilling_240Degree" };
                string[] roughBoundaries = (RoughType == 2.0)
                    ? new[] { "RoughBoundry1" }
                    : new[] { "RoughBoundry1", "RoughBoundry2", "RoughBoundry3" };
                ValidateBeforeOperation($"RoughFreeFromMill_{region}", roughBoundaries, roughFreeForms);
                RoughFreeFromMill();
                TagNewOperations(roughStart, $"ROUGH_{region}");
                DentalLogger.Log($"ExecuteTwoPhaseRough({region}) 완료");
            }
            finally
            {
                Environment.SetEnvironmentVariable(AppConfig.TwoPhaseRoughRegionEnv, null);
                Environment.SetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_REGION", null);
                Environment.SetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_ENABLE", prevRoughSplitEnable);
            }
        }

        private static void TagNewOperations(int startCount, string tag)
        {
            try
            {
                if (Document?.Operations == null)
                {
                    return;
                }
                int end = Document.Operations.Count;
                for (int i = Math.Max(1, startCount + 1); i <= end; i++)
                {
                    object op = null;
                    try { op = Document.Operations[i]; } catch { }
                    if (op == null) continue;

                    // dynamic 방식으로 Name 읽기 (lathe/mill 공통 COM 호환)
                    string oldName = null;
                    try
                    {
                        dynamic dynOp = op;
                        oldName = dynOp.Name as string;
                    }
                    catch
                    {
                        try { oldName = (string)op.GetType().InvokeMember("Name", BindingFlags.GetProperty, null, op, null); } catch { }
                    }

                    string baseName = string.IsNullOrWhiteSpace(oldName) ? "OP" : oldName;
                    if (baseName.IndexOf(tag, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        continue;
                    }
                    string newName = $"{baseName} [{tag}]";

                    // dynamic 방식으로 Name 쓰기 — lathe 작업은 InvokeMember SetProperty가 동작 안 함
                    bool renamed = false;
                    try
                    {
                        dynamic dynOp = op;
                        dynOp.Name = newName;
                        renamed = true;
                    }
                    catch { }

                    if (!renamed)
                    {
                        try { op.GetType().InvokeMember("Name", BindingFlags.SetProperty, null, op, new object[] { newName }); } catch { }
                    }

                    DentalLogger.Log($"TagNewOperations: [{tag}] 적용 - '{baseName}' → '{newName}' (dynamic={renamed})");
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"TagNewOperations 실패(tag={tag}): {ex.GetType().Name}:{ex.Message}");
            }
        }

        public static void CustomCycle()
        {
            try
            {
                string file = PrcFilePath[4];
                DentalLogger.Log($"CustomCycle - OpenProcess: PRC[4]={file}");
                TechLatheCustom pITechnology = (TechLatheCustom)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file))[0];
                Layer activeLayer = Document.Layers.Add("FaceDrill");
                Document.ActiveLayer = activeLayer;

                double stlShift = AppConfig.DefaultStlShift;
                try
                {
                    var techType = pITechnology.GetType();
                    var prop = techType.GetProperty("ZLimit");
                    if (prop != null && prop.CanRead && prop.CanWrite)
                    {
                        object raw = prop.GetValue(pITechnology);
                        if (raw != null && double.TryParse(Convert.ToString(raw, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out double originalZ))
                        {
                            double newZ = originalZ + stlShift;
                            prop.SetValue(pITechnology, newZ);
                            DentalLogger.Log($"CustomCycle - FaceHole ZLimit shift 적용: {originalZ:F3} -> {newZ:F3} (shift:{stlShift:F3})");
                        }
                        else
                        {
                            DentalLogger.Log("CustomCycle - FaceHole ZLimit 값 변환 실패");
                        }
                    }
                    else
                    {
                        DentalLogger.Log("CustomCycle - FaceHole PRC 기술에 ZLimit 속성 없음");
                    }
                }
                catch (Exception ex)
                {
                    DentalLogger.Log($"CustomCycle - FaceHole shift 적용 실패: {ex.GetType().Name}:{ex.Message}");
                }

                Document.Operations.Add(pITechnology, null, RuntimeHelpers.GetObjectValue(Missing.Value));
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"CustomCycle 실패: {ex.GetType().Name}:{ex.Message}");
            }
        }

        public static void CustomCycle2()
        {
            try
            {
                string file = PrcFilePath[8];
                DentalLogger.Log($"CustomCycle2 - OpenProcess: PRC[8]={file}");
                TechLatheCustom pITechnology = (TechLatheCustom)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file))[0];
                Layer activeLayer = Document.Layers.Add("EndTurning");
                Document.ActiveLayer = activeLayer;

                double stlShift = AppConfig.DefaultStlShift;
                try
                {
                    var techType = pITechnology.GetType();
                    var prop = techType.GetProperty("ZLimit");
                    if (prop != null && prop.CanRead && prop.CanWrite)
                    {
                        object raw = prop.GetValue(pITechnology);
                        if (raw != null && double.TryParse(Convert.ToString(raw, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out double originalZ))
                        {
                            double newZ = originalZ + stlShift;
                            prop.SetValue(pITechnology, newZ);
                            DentalLogger.Log($"CustomCycle2 - Connection ZLimit shift 적용: {originalZ:F3} -> {newZ:F3} (shift:{stlShift:F3})");
                        }
                        else
                        {
                            DentalLogger.Log("CustomCycle2 - Connection ZLimit 값 변환 실패");
                        }
                    }
                    else
                    {
                        DentalLogger.Log("CustomCycle2 - Connection PRC 기술에 ZLimit 속성 없음");
                    }
                }
                catch (Exception ex)
                {
                    DentalLogger.Log($"CustomCycle2 - Connection shift 적용 실패: {ex.GetType().Name}:{ex.Message}");
                }

                Document.Operations.Add(pITechnology, null, RuntimeHelpers.GetObjectValue(Missing.Value));
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"CustomCycle2 실패: {ex.GetType().Name}:{ex.Message}");
            }
        }

        public static void TurningOp()
        {
            FeatureChain[] array = new FeatureChain[16];
            FeatureChain[] array2 = new FeatureChain[9];
            string file = PrcFilePath[1];
            DentalLogger.Log($"TurningOp - OpenProcess: PRC[1]={file}");
            TechnologyUtility turningTechUtil = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
            ITechnology[] turningProcess = (ITechnology[])turningTechUtil.OpenProcess(file);
            List<TechLatheContour1> turningTechs = turningProcess?.OfType<TechLatheContour1>()?.ToList() ?? new List<TechLatheContour1>();
            if (turningTechs.Count == 0)
            {
                DentalLogger.Log("TurningOp - PRC[1]에서 TechLatheContour1을 찾지 못해 중단");
                return;
            }
            DentalLogger.Log($"TurningOp - PRC[1] contour tech count={turningTechs.Count}");

            List<TechLatheContour1> reverseTechs = new List<TechLatheContour1>();
            if (ReverseOn)
            {
                string file2 = PrcFilePath[2];
                DentalLogger.Log($"TurningOp - OpenProcess Reverse: PRC[2]={file2}");
                TechnologyUtility reverseTechUtil = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
                ITechnology[] reverseProcess = (ITechnology[])reverseTechUtil.OpenProcess(file2);
                reverseTechs = reverseProcess?.OfType<TechLatheContour1>()?.ToList() ?? new List<TechLatheContour1>();
                DentalLogger.Log($"TurningOp - PRC[2] reverse contour tech count={reverseTechs.Count}");
            }

            // 2-phase 모드: region env를 읽어 finishline(splitX) 기준 좌/우 경계를 적용
            //   - region A → 좌측(xMin~splitX), region B → 우측(splitX~xMax)
            //   - rough mill(RoughFreeFromMillSplitAB)과 동일한 splitX/경계 방식을 사용해
            //     turning 좌/우 분할 위치를 rough와 정렬
            //   - 실제 경계 적용은 chain 생성용 helper op 정리 직후, 최종 op 추가 직전에 수행
            string twoPhaseRegion = Environment.GetEnvironmentVariable(AppConfig.TwoPhaseTurningRegionEnv);

            // TwoPhase 모드에서는 Phase별로 다른 레이어명을 사용하여
            // Phase B가 Phase A의 Turning 작업을 삭제하지 않도록 보장
            string turnLayerName = string.IsNullOrWhiteSpace(twoPhaseRegion)
                ? "TurnOperation"
                : $"TurnOperation_{twoPhaseRegion}";

            int count = Document.FeatureChains.Count;
            checked
            {
                int i;
                for (i = 1; i <= count; i++)
                {
                    FeatureChain featureChain = Document.FeatureChains[i];
                    if (Operators.CompareString(Strings.Right(featureChain.Name, 6), "_Front", false) == 0)
                    {
                        int num = Conversions.ToInteger(Strings.Left(Strings.Right(featureChain.Name, 7), 1));
                        array2[num] = featureChain;
                    }
                }
                int count2 = Document.Layers.Count;
                Layer layer;
                for (i = 1; i <= count2; i++)
                {
                    layer = Document.Layers[i];
                    if (Operators.CompareString(layer.Name, turnLayerName, false) == 0)
                    {
                        Document.Layers.Remove(i);
                        break;
                    }
                }
                layer = Document.Layers.Add(turnLayerName);
                Document.ActiveLayer = layer;
                double[] xStocks = turningTechs.Select(t => t.XStock).ToArray();
                double[] zStocks = turningTechs.Select(t => t.ZStock).ToArray();
                double[] xStocksRev = reverseTechs.Select(t => t.XStock).ToArray();
                double[] zStocksRev = reverseTechs.Select(t => t.ZStock).ToArray();

                foreach (TechLatheContour1 t in turningTechs)
                {
                    t.XStock = 0.0;
                    t.ZStock = 0.0;
                }
                foreach (TechLatheContour1 t in reverseTechs)
                {
                    t.XStock = 0.0;
                    t.ZStock = 0.0;
                }
                int helperOpStart = Document?.Operations?.Count ?? 0;
                i = 1;
                do
                {
                    if (array2[9 - i] != null)
                    {
                        foreach (TechLatheContour1 t in turningTechs)
                        {
                            Document.Operations.Add(t, array2[9 - i], RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                        foreach (TechLatheContour1 t in reverseTechs)
                        {
                            Document.Operations.Add(t, array2[9 - i], RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                    }
                    i++;
                }
                while (i <= 8);
                int count3 = Document.FeatureChains.Count;
                for (i = 1; i <= count3; i++)
                {
                    FeatureChain featureChain = Document.FeatureChains[i];
                    if ((Operators.CompareString(Strings.Left(featureChain.Name, 7), "Turning", false) == 0) & (Strings.Len(featureChain.Name) <= 16))
                    {
                        if (Operators.CompareString(Strings.Right(featureChain.Name, 1), "g", false) == 0)
                        {
                            array[15] = featureChain;
                            continue;
                        }
                        int num = ((Operators.CompareString(Strings.Left(Strings.Right(featureChain.Name, 2), 1), "e", false) != 0) ? Conversions.ToInteger(Strings.Right(featureChain.Name, 2)) : Conversions.ToInteger(Strings.Right(featureChain.Name, 1)));
                        array[num] = featureChain;
                    }
                }
                for (int si = 0; si < turningTechs.Count; si++)
                {
                    turningTechs[si].XStock = xStocks[si];
                    turningTechs[si].ZStock = zStocks[si];
                }
                for (int si = 0; si < reverseTechs.Count; si++)
                {
                    reverseTechs[si].XStock = xStocksRev[si];
                    reverseTechs[si].ZStock = zStocksRev[si];
                }

                // 2-phase에서는 전처리용 임시 Turning 연산(체인 생성 목적)을 목록에서 제거하여
                // 최종 순서가 Turn_A → Rough_A → Turn_B → Rough_B로 보이도록 정리
                if (!string.IsNullOrWhiteSpace(twoPhaseRegion) && Document?.Operations != null)
                {
                    try
                    {
                        int helperOpEnd = Document.Operations.Count;
                        for (int idx = helperOpEnd; idx > helperOpStart; idx--)
                        {
                            try { Document.Operations.Remove(idx); } catch { }
                        }
                        DentalLogger.Log($"TurningOp TwoPhase - helper operations removed (region={twoPhaseRegion}, removed:{Math.Max(0, helperOpEnd - helperOpStart)})");
                    }
                    catch (Exception ex)
                    {
                        DentalLogger.Log($"TurningOp TwoPhase helper op 정리 실패: {ex.GetType().Name}:{ex.Message}");
                    }
                }

                // finishline(splitX) 기준 좌/우 분할.
                // turning(TechLatheContour1)은 milling과 달리 containment boundary(BoundaryProfiles) 속성이 없으므로
                // 경계로 영역을 자를 수 없다. 대신 turning 프로파일 체인을 splitX에서 잘라
                // region A는 좌측(x≤splitX), region B는 우측(x≥splitX) 서브체인만 가공한다.
                bool twoPhaseSplitReady = false;
                double twoPhaseSplitX = 0.0;
                bool twoPhaseLeftSide = string.Equals(twoPhaseRegion, "A", StringComparison.OrdinalIgnoreCase);
                if (!string.IsNullOrWhiteSpace(twoPhaseRegion))
                {
                    twoPhaseSplitReady = TryPrepareTurningSplitX(twoPhaseRegion, out twoPhaseSplitX);
                }

                i = 1;
                do
                {
                    if (array[i] != null)
                    {
                        FeatureChain opChain = array[i];
                        if (twoPhaseSplitReady)
                        {
                            // 주의: 이름이 "Turning"으로 시작하면 다음 phase의 array[i] 탐지 루프에 오인식되므로 다른 접두사 사용
                            double effectiveSplitX = twoPhaseSplitX;
                            try
                            {
                                if (twoPhaseLeftSide)
                                {
                                    double xMax = Math.Max(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);
                                    // Turn_A: finishline보다 1.5mm 오른쪽에서 종료
                                    effectiveSplitX = Math.Min(twoPhaseSplitX + 1.5, xMax - 1e-6);
                                }
                                else
                                {
                                    double xMin = Math.Min(0.0, Math.Min(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX));
                                    // Turn_B: finishline보다 0.5mm 왼쪽에서 시작
                                    effectiveSplitX = Math.Max(twoPhaseSplitX - 0.5, xMin + 1e-6);
                                }
                            }
                            catch { }

                            FeatureChain regionChain = BuildTurningRegionChain(array[i], effectiveSplitX, twoPhaseLeftSide, $"TurnRgn{twoPhaseRegion}_{i}");
                            if (regionChain != null)
                            {
                                opChain = regionChain;
                            }
                            else
                            {
                                DentalLogger.Log($"TurningOp TwoPhase - region={twoPhaseRegion} array[{i}] 분할 체인 생성 실패(또는 해당 영역 프로파일 없음), 이 체인은 건너뜀");
                                i++;
                                continue;
                            }
                        }

                        int techIndex = 0;
                        foreach (TechLatheContour1 t in turningTechs)
                        {
                            TryAddOperation(t, opChain, $"TurningOp array[i] Main#{techIndex}");
                            techIndex++;
                        }
                        techIndex = 0;
                        foreach (TechLatheContour1 t in reverseTechs)
                        {
                            TryAddOperation(t, opChain, $"TurningOp array[i] Reverse#{techIndex}");
                            techIndex++;
                        }
                    }
                    i++;
                }
                while (i <= 15);
            }
        }

        // 2-phase turning 분할 준비: rough mill과 동일한 splitX를 계산/검증하고 가이드 라인을 생성한다.
        private static bool TryPrepareTurningSplitX(string region, out double splitX)
        {
            splitX = 0.0;
            try
            {
                if (Document?.LatheMachineSetup == null)
                {
                    DentalLogger.Log("TurningOp TwoPhase - LatheMachineSetup null, 분할 미적용");
                    return false;
                }

                // rough mill(RoughFreeFromMillSplitAB)과 동일한 splitX 사용 → 좌/우 분할 위치를 rough와 정렬
                TryGetSplitABConfig(out splitX, out _, out _);

                double frontBackMin = Math.Min(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);
                double xMin = Math.Min(0.0, frontBackMin);
                double xMax = Math.Max(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);
                if (!(splitX > xMin && splitX < xMax))
                {
                    DentalLogger.Log($"TurningOp TwoPhase - splitX 범위 오류 splitX:{splitX:0.###}, xMin:{xMin:0.###}, xMax:{xMax:0.###}, 분할 미적용");
                    return false;
                }

                // 작업창에서 분할 위치 확인용 가이드 라인 (rough mill과 공유)
                EnsureTwoPhaseSplitGuideLine(splitX);

                DentalLogger.Log($"TurningOp TwoPhase - region={region}, splitX:{splitX:0.###} 준비 완료 (chain 분할 방식)");
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"TurningOp TwoPhase - splitX 준비 실패: {ex.GetType().Name}:{ex.Message}");
                return false;
            }
        }

        // turning 프로파일 체인(source)을 splitX 기준으로 잘라, 한쪽 영역만 포함하는 새 체인을 생성한다.
        // - leftSide=true  : x ≤ splitX (region A, 좌측)
        // - leftSide=false : x ≥ splitX (region B, 우측)
        // arc/segment 혼합 프로파일을 PointAlong로 조밀하게 샘플링해 polyline로 안전하게 재구성한다.
        private static FeatureChain BuildTurningRegionChain(FeatureChain source, double splitX, bool leftSide, string newName)
        {
            try
            {
                if (source == null)
                {
                    return null;
                }

                double len = 0.0;
                try { len = source.Length; } catch { }
                if (!(len > 1e-6))
                {
                    DentalLogger.Log("BuildTurningRegionChain - source length<=0");
                    return null;
                }

                // 체인을 호 길이 기준으로 조밀하게 샘플링
                const int targetSamples = 600;
                double step = len / targetSamples;
                if (step < 1e-4) step = 1e-4;

                List<double[]> pts = new List<double[]>();
                double srcMinX = double.MaxValue, srcMaxX = double.MinValue;
                for (double s = 0.0; s <= len + 1e-9; s += step)
                {
                    double ss = Math.Min(s, len);
                    Point p = null;
                    try { p = source.PointAlong(ss); } catch { }
                    if (p == null) continue;
                    double px = p.X, py = p.Y, pz = p.Z;
                    if (pts.Count == 0
                        || Math.Abs(px - pts[pts.Count - 1][0]) > 1e-9
                        || Math.Abs(py - pts[pts.Count - 1][1]) > 1e-9
                        || Math.Abs(pz - pts[pts.Count - 1][2]) > 1e-9)
                    {
                        pts.Add(new[] { px, py, pz });
                        if (px < srcMinX) srcMinX = px;
                        if (px > srcMaxX) srcMaxX = px;
                    }
                }

                if (pts.Count < 2)
                {
                    DentalLogger.Log($"BuildTurningRegionChain - 샘플 부족 (count={pts.Count})");
                    return null;
                }

                const double eps = 1e-6;
                List<double[]> region = new List<double[]>();
                for (int idx = 0; idx < pts.Count; idx++)
                {
                    double x = pts[idx][0];
                    bool inside = leftSide ? (x <= splitX + eps) : (x >= splitX - eps);
                    if (inside)
                    {
                        // 영역 진입 직전(이전 점이 영역 밖)이면 경계 교차점을 먼저 추가해 splitX에 정확히 맞춘다
                        if (region.Count == 0 && idx > 0)
                        {
                            double[] cross = InterpolatePointAtX(pts[idx - 1], pts[idx], splitX);
                            if (cross != null) region.Add(cross);
                        }
                        region.Add(pts[idx]);
                    }
                    else if (region.Count > 0)
                    {
                        // 영역 이탈: 경계 교차점을 마지막에 추가하고 종료 (단조 프로파일 가정)
                        double[] cross = InterpolatePointAtX(pts[idx - 1], pts[idx], splitX);
                        if (cross != null) region.Add(cross);
                        break;
                    }
                }

                if (region.Count < 2)
                {
                    DentalLogger.Log($"BuildTurningRegionChain - region 포인트 부족 (leftSide={leftSide}, splitX={splitX:0.###}, srcX=[{srcMinX:0.###},{srcMaxX:0.###}], count={region.Count})");
                    return null;
                }

                Point startPt = Document.GetPoint(region[0][0], region[0][1], region[0][2]);
                FeatureChain fc = Document.FeatureChains.Add(startPt);
                for (int k = 1; k < region.Count; k++)
                {
                    Point p = Document.GetPoint(region[k][0], region[k][1], region[k][2]);
                    fc.Add(p);
                }
                try { fc.Name = newName; } catch { }
                // 원본 터닝 프로파일과 동일 작업평면을 사용하도록 맞춤 (평면 불일치로 인한 가공 오류 방지)
                try { if (source.Plane != null) fc.Plane = source.Plane; } catch { }

                DentalLogger.Log($"BuildTurningRegionChain - '{newName}' 생성 (leftSide={leftSide}, splitX={splitX:0.###}, srcX=[{srcMinX:0.###},{srcMaxX:0.###}], pts={region.Count}, regionX=[{region[0][0]:0.###},{region[region.Count - 1][0]:0.###}])");
                return fc;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"BuildTurningRegionChain 실패: {ex.GetType().Name}:{ex.Message}");
                return null;
            }
        }

        // 두 점 a,b 사이에서 x=targetX인 지점을 선형 보간으로 구한다. (각 점은 [x,y,z])
        private static double[] InterpolatePointAtX(double[] a, double[] b, double targetX)
        {
            if (a == null || b == null) return null;
            double dx = b[0] - a[0];
            if (Math.Abs(dx) < 1e-9)
            {
                return new[] { targetX, b[1], b[2] };
            }
            double t = (targetX - a[0]) / dx;
            if (t < 0.0) t = 0.0;
            if (t > 1.0) t = 1.0;
            return new[]
            {
                targetX,
                a[1] + (b[1] - a[1]) * t,
                a[2] + (b[2] - a[2]) * t
            };
        }

        private static void ApplyBoundaryProfiles(object tech, int boundaryKey, string context)
        {
            if (tech == null || boundaryKey <= 0)
            {
                return;
            }

            string value = "6," + boundaryKey.ToString(CultureInfo.InvariantCulture);
            try
            {
                PropertyInfo p = tech.GetType().GetProperty("BoundaryProfiles", BindingFlags.Public | BindingFlags.Instance);
                if (p != null && p.CanWrite)
                {
                    p.SetValue(tech, value, null);
                    DentalLogger.Log($"{context} - BoundaryProfiles={value}");
                    return;
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"{context} - BoundaryProfiles 적용 실패: {ex.GetType().Name}:{ex.Message}");
            }

            try
            {
                PropertyInfo p = tech.GetType().GetProperty("BoundaryProfile", BindingFlags.Public | BindingFlags.Instance);
                if (p != null && p.CanWrite)
                {
                    p.SetValue(tech, value, null);
                    DentalLogger.Log($"{context} - BoundaryProfile={value}");
                    return;
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"{context} - BoundaryProfile 적용 실패: {ex.GetType().Name}:{ex.Message}");
            }

            DentalLogger.Log($"{context} - BoundaryProfiles 속성을 찾지 못해 영역 분할을 적용하지 못했습니다.");
        }

        public static void RoughMill()
        {
            FeatureChain[] array = new FeatureChain[20];
            FeatureChain[] array2 = new FeatureChain[20];
            FeatureChain[] array3 = new FeatureChain[20];
            FeatureChain[] array4 = new FeatureChain[20];
            FeatureChain[] array5 = new FeatureChain[20];
            string file = PrcFilePath[3];
            DentalLogger.Log($"RoughMill - OpenProcess: PRC[3]={file}");
            TechLatheMillContour1 techLatheMillContour = (TechLatheMillContour1)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file))[0];
            if (RL == 1.0)
            {
                techLatheMillContour.OffsetSideComputer = espMillContourOffsetSide.espMillContourOffsetLeft;
            }
            else if (RL == 2.0)
            {
                techLatheMillContour.OffsetSideComputer = espMillContourOffsetSide.espMillContourOffsetRight;
            }
            int count = Document.FeatureChains.Count;
            checked
            {
                int i;
                for (i = 1; i <= count; i++)
                {
                    FeatureChain featureChain = Document.FeatureChains[i];
                    if (Strings.Len(featureChain.Name) == 12)
                    {
                        if (Operators.CompareString(Strings.Left(featureChain.Name, 11), "RoughMill11", false) == 0)
                        {
                            int num = Conversions.ToInteger(Strings.Right(featureChain.Name, 2));
                            array[num] = featureChain;
                        }
                    }
                    else if (Operators.CompareString(Strings.Left(featureChain.Name, 10), "RoughMill1", false) == 0)
                    {
                        if (Operators.CompareString(Strings.Right(featureChain.Name, 2), "l1", false) == 0)
                        {
                            array[0] = featureChain;
                        }
                        else
                        {
                            int num = Conversions.ToInteger(Strings.Right(featureChain.Name, 1));
                            array[num] = featureChain;
                        }
                    }
                    if (Strings.Len(featureChain.Name) == 12)
                    {
                        if (Operators.CompareString(Strings.Left(featureChain.Name, 11), "RoughMill21", false) == 0)
                        {
                            int num = Conversions.ToInteger(Strings.Right(featureChain.Name, 2));
                            array2[num] = featureChain;
                        }
                    }
                    else if (Operators.CompareString(Strings.Left(featureChain.Name, 10), "RoughMill2", false) == 0)
                    {
                        if (Operators.CompareString(Strings.Right(featureChain.Name, 2), "l2", false) == 0)
                        {
                            array2[0] = featureChain;
                        }
                        else
                        {
                            int num = Conversions.ToInteger(Strings.Right(featureChain.Name, 1));
                            array2[num] = featureChain;
                        }
                    }
                    if (Strings.Len(featureChain.Name) == 12)
                    {
                        if (Operators.CompareString(Strings.Left(featureChain.Name, 11), "RoughMill31", false) == 0)
                        {
                            int num = Conversions.ToInteger(Strings.Right(featureChain.Name, 2));
                            array3[num] = featureChain;
                        }
                    }
                    else if (Operators.CompareString(Strings.Left(featureChain.Name, 10), "RoughMill3", false) == 0)
                    {
                        if (Operators.CompareString(Strings.Right(featureChain.Name, 2), "l3", false) == 0)
                        {
                            array3[0] = featureChain;
                        }
                        else
                        {
                            int num = Conversions.ToInteger(Strings.Right(featureChain.Name, 1));
                            array3[num] = featureChain;
                        }
                    }
                    if (Strings.Len(featureChain.Name) == 12)
                    {
                        if (Operators.CompareString(Strings.Left(featureChain.Name, 11), "RoughMill41", false) == 0)
                        {
                            int num = Conversions.ToInteger(Strings.Right(featureChain.Name, 2));
                            array4[num] = featureChain;
                        }
                    }
                    else if (Operators.CompareString(Strings.Left(featureChain.Name, 10), "RoughMill4", false) == 0)
                    {
                        if (Operators.CompareString(Strings.Right(featureChain.Name, 2), "l4", false) == 0)
                        {
                            array4[0] = featureChain;
                        }
                        else
                        {
                            int num = Conversions.ToInteger(Strings.Right(featureChain.Name, 1));
                            array4[num] = featureChain;
                        }
                    }
                    if (Strings.Len(featureChain.Name) == 12)
                    {
                        if (Operators.CompareString(Strings.Left(featureChain.Name, 11), "RoughMill51", false) == 0)
                        {
                            int num = Conversions.ToInteger(Strings.Right(featureChain.Name, 2));
                            array5[num] = featureChain;
                        }
                    }
                    else if (Operators.CompareString(Strings.Left(featureChain.Name, 10), "RoughMill5", false) == 0)
                    {
                        if (Operators.CompareString(Strings.Right(featureChain.Name, 2), "l5", false) == 0)
                        {
                            array5[0] = featureChain;
                            continue;
                        }
                        int num = Conversions.ToInteger(Strings.Right(featureChain.Name, 1));
                        array5[num] = featureChain;
                    }
                }
                int count2 = Document.Layers.Count;
                Layer layer;
                for (i = 1; i <= count2; i++)
                {
                    layer = Document.Layers[i];
                    if (Operators.CompareString(layer.Name, "RoughMillingOperation", false) == 0)
                    {
                        Document.Layers.Remove(i);
                        break;
                    }
                }
                layer = Document.Layers.Add("RoughMillingOperation");
                Document.ActiveLayer = layer;
                i = 0;
                do
                {
                    if (array[19 - i] != null)
                    {
                        Document.Operations.Add(techLatheMillContour, array[19 - i], RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                    i++;
                }
                while (i <= 19);
                i = 0;
                do
                {
                    if (array2[19 - i] != null)
                    {
                        Document.Operations.Add(techLatheMillContour, array2[19 - i], RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                    i++;
                }
                while (i <= 19);
                i = 0;
                do
                {
                    if (array3[19 - i] != null)
                    {
                        Document.Operations.Add(techLatheMillContour, array3[19 - i], RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                    i++;
                }
                while (i <= 19);
                i = 0;
                do
                {
                    if (array4[19 - i] != null)
                    {
                        Document.Operations.Add(techLatheMillContour, array4[19 - i], RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                    i++;
                }
                while (i <= 19);
                i = 0;
                do
                {
                    if (array5[19 - i] != null)
                    {
                        Document.Operations.Add(techLatheMillContour, array5[19 - i], RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                    i++;
                }
                while (i <= 19);
            }
        }

        public static void BackTurning()
        {
            FeatureChain[] array = new FeatureChain[7];
            string file = PrcFilePath[1];
            DentalLogger.Log($"BackTurning - OpenProcess: PRC[1]={file}");
            TechLatheContour1 pITechnology = (TechLatheContour1)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file))[0];
            int count = Document.FeatureChains.Count;
            checked
            {
                int i;
                for (i = 1; i <= count; i++)
                {
                    FeatureChain featureChain = Document.FeatureChains[i];
                    if (Operators.CompareString(Strings.Left(featureChain.Name, 4), "Back", false) == 0)
                    {
                        int num = Conversions.ToInteger(Strings.Right(featureChain.Name, 1));
                        array[num] = featureChain;
                    }
                }
                int count2 = Document.Layers.Count;
                for (i = 1; i <= count2; i++)
                {
                    Layer layer = Document.Layers[i];
                    if (Operators.CompareString(layer.Name, "TurnOperation", false) == 0)
                    {
                        Document.ActiveLayer = layer;
                    }
                }
                i = 1;
                do
                {
                    if (array[i] != null)
                    {
                        Document.Operations.Add(pITechnology, array[i], RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                    i++;
                }
                while (i <= 6);
            }
        }

        public static void SearchTool()
        {
            int num = 0;
            foreach (Tool item in (IEnumerable)Document.Tools)
            {
                if (item.ToolStyle == espToolType.espMillToolBallMill)
                {
                    ToolMillBallMill toolMillBallMill = (ToolMillBallMill)item;
                    if ((toolMillBallMill.Orientation == espMillToolOrientation.espMillToolOrientationYPlus) & (Math.Abs(toolMillBallMill.ToolDiameter - 4.0) <= 0.01))
                    {
                        ToolNs = toolMillBallMill.ToolID;
                        num = 1;
                        break;
                    }
                }
            }
            if (num != 1)
            {
                Jump = 1;
            }
        }
        public static void MarkText()
        {
            int try0000_dispatch = -1;
            int num2 = default(int);
            int num = default(int);
            int num3 = default(int);
            int num5 = default(int);
            int count = default(int);
            int count2 = default(int);
            FreeFormFeature freeFormFeature = default(FreeFormFeature);
            TechnologyUtility technologyUtility = default(TechnologyUtility);
            string file = default(string);
            ITechnology[] array = default(ITechnology[]);
            TechLatheMold3dContour techLatheMold3dContour = default(TechLatheMold3dContour);
            string text = default(string);
            FeatureChain featureChain = default(FeatureChain);
            while (true)
            {
                try
                {
                    /*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/
                    ;
                    switch (try0000_dispatch)
                    {
                        default:
                            num2 = 1;
                            _ = new int[11];
                            goto IL_000a;
                        case 498:
                            {
                                num = num2;
                                switch (num3)
                                {
                                    case 1:
                                        break;
                                    default:
                                        goto end_IL_0000;
                                }
                                int num4 = num + 1;
                                num = 0;
                                switch (num4)
                                {
                                    case 1:
                                        break;
                                    case 2:
                                        goto IL_000a;
                                    case 3:
                                        goto IL_001d;
                                    case 4:
                                        goto IL_0037;
                                    case 5:
                                        goto IL_003e;
                                    case 7:
                                        goto IL_0055;
                                    case 6:
                                    case 8:
                                        goto IL_006c;
                                    case 9:
                                        goto IL_007a;
                                    case 10:
                                        goto IL_0093;
                                    case 11:
                                        goto IL_00ad;
                                    case 13:
                                        goto IL_00c3;
                                    case 12:
                                    case 14:
                                        goto IL_00d2;
                                    case 15:
                                        goto IL_00d9;
                                    case 16:
                                        goto IL_00f7;
                                    case 17:
                                        goto IL_0118;
                                    case 18:
                                        goto IL_0125;
                                    case 19:
                                        goto IL_0138;
                                    case 20:
                                        goto IL_0146;
                                    case 21:
                                        goto IL_0155;
                                    case 22:
                                        goto end_IL_0000_2;
                                    default:
                                        goto end_IL_0000;
                                    case 23:
                                        goto end_IL_0000_3;
                                }
                                goto default;
                            }
                        IL_006c:
                            num2 = 8;
                            num5 = checked(num5 + 1);
                            goto IL_0074;
                        IL_000a:
                            num2 = 2;
                            count = Mark.SsNumber.Count;
                            num5 = 1;
                            goto IL_0074;
                        IL_0074:
                            if (num5 <= count)
                            {
                                goto IL_001d;
                            }
                            goto IL_007a;
                        IL_007a:
                            num2 = 9;
                            count2 = Document.FreeFormFeatures.Count;
                            num5 = 1;
                            goto IL_00cc;
                        IL_00cc:
                            if (num5 <= count2)
                            {
                                goto IL_0093;
                            }
                            goto IL_00d2;
                        IL_0093:
                            num2 = 10;
                            freeFormFeature = Document.FreeFormFeatures[num5];
                            goto IL_00ad;
                        IL_00ad:
                            num2 = 11;
                            if (Operators.CompareString(freeFormFeature.Name, "3DProject_Mark", false) != 0)
                            {
                                goto IL_00c3;
                            }
                            goto IL_00d2;
                        IL_00c3:
                            num2 = 13;
                            num5 = checked(num5 + 1);
                            goto IL_00cc;
                        IL_00d2:
                            ProjectData.ClearProjectError();
                            num3 = 1;
                            goto IL_00d9;
                        IL_00d9:
                            num2 = 15;
                            technologyUtility = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
                            goto IL_00f7;
                        IL_00f7:
                            num2 = 16;
                            Document.ActiveLayer = Document.Layers["MarkNumber"];
                            goto IL_0118;
                        IL_0118:
                            num2 = 17;
                            file = PrcFilePath[12];
                            goto IL_0125;
                        IL_0125:
                            num2 = 18;
                            array = (ITechnology[])technologyUtility.OpenProcess(file);
                            goto IL_0138;
                        IL_0138:
                            num2 = 19;
                            techLatheMold3dContour = (TechLatheMold3dContour)array[0];
                            goto IL_0146;
                        IL_0146:
                            num2 = 20;
                            techLatheMold3dContour.CuttingProfiles = "";
                            goto IL_0155;
                        IL_0155:
                            num2 = 21;
                            techLatheMold3dContour.CuttingProfiles = text;
                            break;
                        IL_001d:
                            num2 = 3;
                            featureChain = (FeatureChain)Mark.SsNumber[num5];
                            goto IL_0037;
                        IL_0037:
                            num2 = 4;
                            if (num5 == 1)
                            {
                                goto IL_003e;
                            }
                            goto IL_0055;
                        IL_003e:
                            num2 = 5;
                            text = "6," + featureChain.Key;
                            goto IL_006c;
                        IL_0055:
                            num2 = 7;
                            text = text + "|6," + featureChain.Key;
                            goto IL_006c;
                        end_IL_0000_2:
                            break;
                    }
                    num2 = 22;
                    Document.Operations.Add(techLatheMold3dContour, freeFormFeature, RuntimeHelpers.GetObjectValue(Missing.Value));
                    break;
                end_IL_0000:;
                }
                catch (Exception ex) when (num3 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 498;
                    continue;
                }
                throw ProjectData.CreateProjectError(-2146828237);
                continue;
            end_IL_0000_3:
                break;
            }
            if (num != 0)
            {
                ProjectData.ClearProjectError();
            }
        }

#pragma warning restore CS0162, CS0649
    }
}
