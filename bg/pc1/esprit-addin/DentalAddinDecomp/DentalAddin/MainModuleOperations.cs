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
                TryNormalizeCompositeFinishOrderAfterFreeForm();
                if (Mark.MarkSign)
                {
                    ValidateBeforeOperation("MarkText", Array.Empty<string>(), new[] { "3DProject_Mark" });
                    MarkText();
                }

                ValidateBeforeOperation("CustomCycle2", Array.Empty<string>(), Array.Empty<string>());
                CustomCycle2();
                return;
            }

            // 기본값: 3-Stage Two-Phase 실행 (RoughType 2.0/3.0 또는 roughSplit/PRC 마커 있을 때)
            if (twoPhaseMode)
            {
                DentalLogger.Log($"OperationSeq - 3-Stage 실행: Front/Middle/Back Turn+Rough 후 Finish 실행 (RoughType={RoughType}, RoughSplitEnv={roughSplitEnabled})");
                ClearOperationsForTwoPhase();

                ValidateBeforeOperation("CustomCycle", Array.Empty<string>(), Array.Empty<string>());
                CustomCycle();

                // 3-stage 순서(요청 반영):
                // Front:  Turn -> Rough -> Front Face
                // Middle: Turn -> Rough
                // Back:   Turn -> Rough
                // Finish: deep=Front/Back 분할, none=All 단일
                ExecuteTwoPhaseTurning("FRONT");
                ExecuteTwoPhaseRough("FRONT");

                ValidateBeforeOperation("FrontFaceMill", Array.Empty<string>(), new[] { "3DMilling_FrontFace" });
                FrontFaceMill();

                ExecuteTwoPhaseTurning("MIDDLE");
                ExecuteTwoPhaseRough("MIDDLE");

                // 요청 반영:
                // Finish_Front는 마지막 Middle_Rough와 Back_Turn 사이에 생성한다.
                Environment.SetEnvironmentVariable("ABUTS_SKIP_FRONTFACE_IN_FREEFORM", "1");
                try
                {
                    Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_PHASE_MODE", "A_PHASE");
                    ValidateBeforeOperation("FreeFormMill", Array.Empty<string>(), new[] { "3DMilling_0Degree", "3DMilling_90Degree", "3DMilling_180Degree", "3DMilling_270Degree" });
                    FreeFormMill();
                    TryNormalizeCompositeFinishOrderAfterFreeForm();

                    ExecuteTwoPhaseTurning("BACK");
                    ExecuteTwoPhaseRough("BACK");

                    Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_PHASE_MODE", "B_PHASE");
                    ValidateBeforeOperation("FreeFormMill", Array.Empty<string>(), new[] { "3DMilling_0Degree", "3DMilling_90Degree", "3DMilling_180Degree", "3DMilling_270Degree" });
                    FreeFormMill();
                    TryNormalizeCompositeFinishOrderAfterFreeForm();
                }
                finally
                {
                    Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_PHASE_MODE", null);
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
            TryNormalizeCompositeFinishOrderAfterFreeForm();
            if (Mark.MarkSign)
            {
                ValidateBeforeOperation("MarkText", Array.Empty<string>(), new[] { "3DProject_Mark" });
                MarkText();
            }
            ValidateBeforeOperation("CustomCycle2", Array.Empty<string>(), Array.Empty<string>());
            CustomCycle2();
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

                // Front Face 끝점 정책:
                // - Face.RightX = FrontPointX + 1.0mm 로 고정 적용한다.
                // - 단, Splitline_2를 침범하지 않도록 상한 클램프한다.
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

                int startCount = Document?.Operations?.Count ?? 0;
                TryAddOperation(techLatheMoldParallelPlanes, frontFace, "FrontFaceMill");
                TagNewOperations(startCount, "FRONT_FACE");
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

                    // TURN 태그는 누적되지 않게 정리: [TURN_A]/[TURN_B]가 섞여 있으면 먼저 제거 후 현재 tag만 부착
                    if (tag.StartsWith("TURN_", StringComparison.OrdinalIgnoreCase))
                    {
                        baseName = RemoveTokenIgnoreCase(baseName, "[TURN_A]");
                        baseName = RemoveTokenIgnoreCase(baseName, "[TURN_B]");
                        while (baseName.IndexOf("  ", StringComparison.Ordinal) >= 0)
                        {
                            baseName = baseName.Replace("  ", " ");
                        }
                        baseName = baseName.Trim();
                    }

                    string newName;
                    switch ((tag ?? string.Empty).Trim().ToUpperInvariant())
                    {
                        case "TURN_FRONT": newName = "Front_Turn"; break;
                        case "ROUGH_FRONT": newName = "Front_Rough"; break;
                        case "FRONT_FACE": newName = "Front_Face"; break;
                        case "TURN_MIDDLE": newName = "Middle_Turn"; break;
                        case "ROUGH_MIDDLE": newName = "Middle_Rough"; break;
                        case "TURN_BACK": newName = "Back_Turn"; break;
                        case "ROUGH_BACK": newName = "Back_Rough"; break;
                        default:
                            if (baseName.IndexOf(tag, StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                continue;
                            }
                            newName = $"{baseName} [{tag}]";
                            break;
                    }

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

        private static string RemoveTokenIgnoreCase(string source, string token)
        {
            if (string.IsNullOrEmpty(source) || string.IsNullOrEmpty(token))
            {
                return source;
            }

            int idx = source.IndexOf(token, StringComparison.OrdinalIgnoreCase);
            while (idx >= 0)
            {
                source = source.Remove(idx, token.Length);
                idx = source.IndexOf(token, StringComparison.OrdinalIgnoreCase);
            }
            return source;
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

            // 3-stage 모드: region env를 읽어 Front/Middle/Back 구간으로 분할 적용
            //   - Splitline_1 = FrontPointX
            //   - Splitline_2 = midpoint(Splitline_1, BackPointX)
            //   - Turn/Rough는 경계선 기준 ±2.2mm 확장
            string twoPhaseRegion = Environment.GetEnvironmentVariable(AppConfig.TwoPhaseTurningRegionEnv);

            List<TechLatheContour1> reverseTechs = new List<TechLatheContour1>();
            if (ReverseOn)
            {
                string file2 = PrcFilePath[2];
                DentalLogger.Log($"TurningOp - OpenProcess Reverse: PRC[2]={file2} (ReverseOn={ReverseOn}, region={twoPhaseRegion})");
                TechnologyUtility reverseTechUtil = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
                ITechnology[] reverseProcess = (ITechnology[])reverseTechUtil.OpenProcess(file2);
                reverseTechs = reverseProcess?.OfType<TechLatheContour1>()?.ToList() ?? new List<TechLatheContour1>();
                DentalLogger.Log($"TurningOp - PRC[2] reverse contour tech count={reverseTechs.Count}");
            }

            // 요청사항: Front/Middle/Back 모두 정방향 로직 동일 유지, Back만 T05 우선 사용
            List<TechLatheContour1> phaseTurningTechs = turningTechs;
            List<TechLatheContour1> phaseReverseTechs = reverseTechs;
            if (string.Equals(twoPhaseRegion, "FRONT", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(twoPhaseRegion, "MIDDLE", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(twoPhaseRegion, "BACK", StringComparison.OrdinalIgnoreCase))
            {
                phaseReverseTechs = new List<TechLatheContour1>();
                DentalLogger.Log($"TurningOp - region={twoPhaseRegion}, 정방향 turning 전용으로 실행");
            }

            ApplyTwoPhaseTurningToolOverride(twoPhaseRegion, phaseTurningTechs, phaseReverseTechs);

            // CAM 직경(=BarDiameter)보다 큰 선반 공구는 불필요 가공으로 간주하여 제외
            // 예) CAM 8.0인 케이스에서 D10/D12 turning pass 제거
            List<TechLatheContour1> effectiveTurningTechs = FilterTurningTechsByBarDiameter(phaseTurningTechs, $"TurningOp:{twoPhaseRegion}:Main");
            List<TechLatheContour1> effectiveReverseTechs = FilterTurningTechsByBarDiameter(phaseReverseTechs, $"TurningOp:{twoPhaseRegion}:Reverse");

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
                        foreach (TechLatheContour1 t in effectiveTurningTechs)
                        {
                            Document.Operations.Add(t, array2[9 - i], RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                        foreach (TechLatheContour1 t in effectiveReverseTechs)
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
                double regionMinX = 0.0;
                double regionMaxX = 0.0;
                if (!string.IsNullOrWhiteSpace(twoPhaseRegion))
                {
                    if (string.Equals(twoPhaseRegion, "BACK", StringComparison.OrdinalIgnoreCase))
                    {
                        // 요청사항 반영:
                        // Back_Turn 시작점은 splitX-0.5(레거시) 대신 BackPointX 근처(소재 근처) 기준을 우선 사용한다.
                        twoPhaseSplitReady = TryPrepareTurningRegionRange(twoPhaseRegion, out regionMinX, out regionMaxX);
                        if (!twoPhaseSplitReady)
                        {
                            DentalLogger.Log("TurningOp BACK - BackPointX 기반 구간 계산 실패, 레거시 Turn_B(range=splitX-0.5~xMax)로 1회 폴백");
                            twoPhaseSplitReady = TryPrepareBackTurnRangeFromLegacyTurnB(out regionMinX, out regionMaxX);
                        }
                    }
                    else
                    {
                        twoPhaseSplitReady = TryPrepareTurningRegionRange(twoPhaseRegion, out regionMinX, out regionMaxX);
                    }
                }

                IEnumerable<int> targetTurningIndices = GetTurningTargetIndices(array, twoPhaseRegion);
                foreach (int targetIndex in targetTurningIndices)
                {
                    if (targetIndex < 1 || targetIndex > 15 || array[targetIndex] == null)
                    {
                        continue;
                    }

                    FeatureChain opChain = array[targetIndex];
                    if (twoPhaseSplitReady)
                    {
                        // 주의: 이름이 "Turning"으로 시작하면 다음 phase의 array[i] 탐지 루프에 오인식되므로 다른 접두사 사용
                        FeatureChain regionChain = BuildTurningRangeChain(array[targetIndex], regionMinX, regionMaxX, $"TurnRgn{twoPhaseRegion}_{targetIndex}");
                        if (regionChain != null)
                        {
                            opChain = regionChain;
                        }
                        else
                        {
                            DentalLogger.Log($"TurningOp TwoPhase - region={twoPhaseRegion} array[{targetIndex}] 분할 체인 생성 실패(또는 해당 영역 프로파일 없음), 이 체인은 건너뜀");
                            continue;
                        }
                    }

                    int techIndex = 0;
                    foreach (TechLatheContour1 t in effectiveTurningTechs)
                    {
                        TryAddOperation(t, opChain, $"TurningOp array[i] Main#{techIndex}");
                        techIndex++;
                    }
                    techIndex = 0;
                    foreach (TechLatheContour1 t in effectiveReverseTechs)
                    {
                        TryAddOperation(t, opChain, $"TurningOp array[i] Reverse#{techIndex}");
                        techIndex++;
                    }
                }
            }
        }

        private static IEnumerable<int> GetTurningTargetIndices(FeatureChain[] chains, string region)
        {
            // FRONT/MIDDLE: 대표 체인 1개만 사용
            if (!string.IsNullOrWhiteSpace(region)
                && (string.Equals(region, "FRONT", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(region, "MIDDLE", StringComparison.OrdinalIgnoreCase)))
            {
                foreach (int preferred in new[] { 15, 2, 1 })
                {
                    if (preferred >= 1 && preferred < chains.Length && chains[preferred] != null)
                    {
                        DentalLogger.Log($"TurningOp 3-Stage - single-chain mode region={region}, selectedIndex={preferred}");
                        return new[] { preferred };
                    }
                }

                DentalLogger.Log($"TurningOp 3-Stage - single-chain mode region={region}, 사용 가능한 체인 없음");
                return Array.Empty<int>();
            }

            // BACK: 소재 직경 기준으로 체인 개수 자동 조절
            // 정책:
            // - D8 기준 1가닥
            // - 이후 소재 직경 +2mm마다 1가닥 추가
            //   예) D8 -> 1, D10 -> 2, D12 -> 3
            if (!string.IsNullOrWhiteSpace(region)
                && string.Equals(region, "BACK", StringComparison.OrdinalIgnoreCase))
            {
                List<int> availablePreferred = new List<int>();
                foreach (int preferred in new[] { 15, 2, 1 })
                {
                    if (preferred >= 1 && preferred < chains.Length && chains[preferred] != null)
                    {
                        availablePreferred.Add(preferred);
                    }
                }

                if (availablePreferred.Count == 0)
                {
                    DentalLogger.Log("TurningOp BACK - 사용 가능한 대표 turning 체인 없음");
                    return Array.Empty<int>();
                }

                int desiredCount = ComputeBackTurnChainCountByDiameterGap(chains, out double targetMaxDia, out double barDia);
                int selectedCount = Math.Min(Math.Max(1, desiredCount), availablePreferred.Count);
                List<int> selected = availablePreferred.Take(selectedCount).ToList();

                DentalLogger.Log($"TurningOp BACK - adaptive chain mode: barDia={barDia:0.###}, targetMaxDia={targetMaxDia:0.###}, desired={desiredCount}, selected={selectedCount}, indices=[{string.Join(",", selected)}]");
                return selected;
            }

            // 그 외 기존 동작 유지: 가능한 turning 체인을 모두 사용
            List<int> all = new List<int>();
            for (int i = 1; i <= 15; i++)
            {
                if (i < chains.Length && chains[i] != null)
                {
                    all.Add(i);
                }
            }
            return all;
        }

        private static int ComputeBackTurnChainCountByDiameterGap(FeatureChain[] chains, out double targetMaxDiameter, out double barDiameter)
        {
            targetMaxDiameter = 0.0;
            barDiameter = 0.0;
            try
            {
                barDiameter = Document?.LatheMachineSetup?.BarDiameter ?? 0.0;
                if (barDiameter <= 0.0)
                {
                    return 1;
                }

                // 1) 기존 계산값(프로파일 최대 반경 HighY) 우선 사용
                if (HighY > 0.0)
                {
                    targetMaxDiameter = HighY * 2.0;
                }

                // 2) fallback: turning 체인에서 최대 Y를 샘플링해 대상체 최대직경 추정
                if (!(targetMaxDiameter > 0.0) && chains != null)
                {
                    double maxY = 0.0;
                    for (int i = 1; i <= 15 && i < chains.Length; i++)
                    {
                        FeatureChain fc = chains[i];
                        if (fc == null) continue;

                        double len = 0.0;
                        try { len = fc.Length; } catch { }
                        if (!(len > 1e-6)) continue;

                        double step = Math.Max(0.02, len / 600.0);
                        for (double s = 0.0; s <= len + 1e-9; s += step)
                        {
                            Point p = null;
                            try { p = fc.PointAlong(Math.Min(s, len)); } catch { }
                            if (p == null) continue;
                            double ay = Math.Abs(p.Y);
                            if (ay > maxY) maxY = ay;
                        }
                    }

                    if (maxY > 0.0)
                    {
                        targetMaxDiameter = maxY * 2.0;
                    }
                }

                // 대상체 직경이 비정상/미확정이면 보수적으로 1가닥 유지
                if (!(targetMaxDiameter > 0.0))
                {
                    targetMaxDiameter = barDiameter;
                }

                // 물리적으로 소재 직경을 넘는 대상체는 클램프
                if (targetMaxDiameter > barDiameter)
                {
                    targetMaxDiameter = barDiameter;
                }

                // 요청사항: "소재 직경 2mm당 한 가닥"
                // => (소재직경 - 대상체최대직경) 여유 구간을 2mm 단위로 나눈 개수
                // 예) 대상 5.5, 소재 10.0 => floor((10-5.5)/2)=2  (D8, D6)
                double diameterGap = Math.Max(0.0, barDiameter - targetMaxDiameter);
                int count = (int)Math.Floor(diameterGap / 2.0 + 1e-9);

                // Back_Turn 자체는 최소 1가닥은 유지
                if (count < 1) count = 1;
                return count;
            }
            catch
            {
                return 1;
            }
        }

        private static List<FeatureChain> BuildLegacyBackTurningChainsByCallingLegacy()
        {
            List<FeatureChain> result = new List<FeatureChain>();
            try
            {
                if (Document == null)
                {
                    return result;
                }

                // 기존 레거시 체인 정리(중복 방지)
                for (int i = Document.FeatureChains.Count; i >= 1; i--)
                {
                    FeatureChain fc = null;
                    try { fc = Document.FeatureChains[i]; } catch { }
                    if (fc == null) continue;
                    string name = fc.Name ?? string.Empty;
                    if (name.StartsWith("Back_Turning_", StringComparison.OrdinalIgnoreCase))
                    {
                        try { Document.FeatureChains.Remove(fc.Key); } catch { }
                    }
                }

                // 레거시 생성 함수 직접 호출
                TurningFeature_Extension.BackT();

                List<(int order, FeatureChain chain)> ordered = new List<(int order, FeatureChain chain)>();
                for (int i = 1; i <= Document.FeatureChains.Count; i++)
                {
                    FeatureChain fc = null;
                    try { fc = Document.FeatureChains[i]; } catch { }
                    if (fc == null) continue;

                    string name = fc.Name ?? string.Empty;
                    if (!name.StartsWith("Back_Turning_", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    int order = int.MaxValue;
                    int us = name.LastIndexOf('_');
                    if (us >= 0 && us + 1 < name.Length)
                    {
                        int.TryParse(name.Substring(us + 1), NumberStyles.Integer, CultureInfo.InvariantCulture, out order);
                    }
                    ordered.Add((order, fc));
                }

                foreach (var pair in ordered.OrderBy(x => x.order))
                {
                    result.Add(pair.chain);
                }

                DentalLogger.Log($"TurningOp BACK - 레거시 BackT 직접 호출 완료, chains={result.Count}");
                return result;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"TurningOp BACK - 레거시 BackT 호출 실패: {ex.GetType().Name}:{ex.Message}");
                return result;
            }
        }

        private static void ApplyTwoPhaseTurningToolOverride(string region, IList<TechLatheContour1> turningTechs, IList<TechLatheContour1> reverseTechs)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(region))
                {
                    return;
                }

                // 요청사항: Front/Middle는 정방향 공구(T02), Back는 백터닝 공구(T05) 우선
                int targetToolNumber;
                if (string.Equals(region, "FRONT", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(region, "MIDDLE", StringComparison.OrdinalIgnoreCase))
                {
                    targetToolNumber = 2;
                }
                else if (string.Equals(region, "BACK", StringComparison.OrdinalIgnoreCase))
                {
                    targetToolNumber = 5;
                }
                else
                {
                    DentalLogger.Log($"TurningOp ToolOverride - region={region}, 공구 오버라이드 대상 아님");
                    return;
                }

                string selectedToolId = SelectTurningToolIdByNumber(targetToolNumber);
                string preferredToolId = $"T{targetToolNumber:00}";

                if (string.IsNullOrWhiteSpace(selectedToolId))
                {
                    DentalLogger.Log($"TurningOp ToolOverride - region={region}용 {preferredToolId}({targetToolNumber}번 공구)를 찾지 못해 기존 PRC 공구를 유지합니다.");
                    return;
                }

                int applied = 0;
                foreach (TechLatheContour1 t in turningTechs)
                {
                    if (t == null) continue;
                    t.ToolID = selectedToolId;
                    applied++;
                }
                foreach (TechLatheContour1 t in reverseTechs)
                {
                    if (t == null) continue;
                    t.ToolID = selectedToolId;
                    applied++;
                }

                DentalLogger.Log($"TurningOp ToolOverride - region={region}, ToolID={selectedToolId} 적용(techCount={applied})");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"TurningOp ToolOverride 실패(region={region}): {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static string SelectTurningToolIdByNumber(int targetToolNumber)
        {
            try
            {
                if (Document?.Tools == null)
                {
                    return null;
                }

                // 1) 공구번호(스테이션) 우선 매칭: ToolID 명칭(OD_V35..., BackTurn...)과 무관하게 선택
                foreach (Tool tool in (IEnumerable)Document.Tools)
                {
                    if (tool == null || string.IsNullOrWhiteSpace(tool.ToolID)) continue;
                    if (TryGetToolNumber(tool, out int n) && n == targetToolNumber)
                    {
                        return tool.ToolID;
                    }
                }

                // 2) 호환용: T02/T05 정확 일치
                string preferredToolId = $"T{targetToolNumber:00}";
                foreach (Tool tool in (IEnumerable)Document.Tools)
                {
                    if (tool == null || string.IsNullOrWhiteSpace(tool.ToolID)) continue;
                    if (string.Equals(tool.ToolID, preferredToolId, StringComparison.OrdinalIgnoreCase))
                    {
                        return tool.ToolID;
                    }
                }

                // 3) 마지막 fallback: T2/T5 형태 ID만 허용
                foreach (Tool tool in (IEnumerable)Document.Tools)
                {
                    if (tool == null || string.IsNullOrWhiteSpace(tool.ToolID)) continue;
                    string id = tool.ToolID.Trim();
                    if (!id.StartsWith("T", StringComparison.OrdinalIgnoreCase)) continue;

                    string digits = new string(id.Where(char.IsDigit).ToArray());
                    if (int.TryParse(digits, out int n) && n == targetToolNumber)
                    {
                        return tool.ToolID;
                    }
                }

                // 디버그 로그: 왜 못 찾았는지 바로 확인 가능하게 후보 덤프
                int printed = 0;
                foreach (Tool tool in (IEnumerable)Document.Tools)
                {
                    if (tool == null) continue;
                    if (printed >= 20)
                    {
                        DentalLogger.Log("SelectTurningToolIdByNumber - tools 출력 생략(상한 20)");
                        break;
                    }

                    bool hasNo = TryGetToolNumber(tool, out int n);
                    DentalLogger.Log($"SelectTurningToolIdByNumber - Tool[{printed + 1}] ID='{tool.ToolID}', No={(hasNo ? n.ToString(CultureInfo.InvariantCulture) : "?")}, Style='{tool.ToolStyle}'");
                    printed++;
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"SelectTurningToolIdByNumber 실패(target={targetToolNumber}): {ex.GetType().Name}:{ex.Message}");
            }

            return null;
        }

        private static bool IsLatheOrTurningTool(Tool tool)
        {
            try
            {
                if (tool == null)
                {
                    return false;
                }

                string style = tool.ToolStyle.ToString();
                if (string.IsNullOrWhiteSpace(style))
                {
                    return false;
                }

                return style.IndexOf("Lathe", StringComparison.OrdinalIgnoreCase) >= 0
                    || style.IndexOf("Turn", StringComparison.OrdinalIgnoreCase) >= 0;
            }
            catch
            {
                return false;
            }
        }

        private static bool TryGetToolNumber(Tool tool, out int number)
        {
            number = 0;
            if (tool == null)
            {
                return false;
            }

            string[] propNames = new[]
            {
                "ToolNumber", "ToolNo", "Number", "Station", "StationNumber", "Pocket", "ToolPosition"
            };

            static bool TryParseRaw(object raw, out int parsed)
            {
                parsed = 0;
                if (raw == null) return false;
                if (raw is int i)
                {
                    parsed = i;
                    return true;
                }
                return int.TryParse(Convert.ToString(raw, CultureInfo.InvariantCulture), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed);
            }

            try
            {
                Type t = tool.GetType();
                foreach (string pn in propNames)
                {
                    try
                    {
                        PropertyInfo p = t.GetProperty(pn, BindingFlags.Public | BindingFlags.Instance);
                        if (p != null && p.CanRead)
                        {
                            object raw = p.GetValue(tool);
                            if (TryParseRaw(raw, out int parsed))
                            {
                                number = parsed;
                                return true;
                            }
                        }
                    }
                    catch { }

                    // COM IDispatch 속성 접근 (reflection이 못 잡는 경우)
                    try
                    {
                        object raw = t.InvokeMember(pn, BindingFlags.GetProperty, null, tool, null, CultureInfo.InvariantCulture);
                        if (TryParseRaw(raw, out int parsed))
                        {
                            number = parsed;
                            return true;
                        }
                    }
                    catch { }

                    // dynamic late-binding 접근
                    try
                    {
                        dynamic d = tool;
                        object raw = null;
                        switch (pn)
                        {
                            case "ToolNumber": raw = d.ToolNumber; break;
                            case "ToolNo": raw = d.ToolNo; break;
                            case "Number": raw = d.Number; break;
                            case "Station": raw = d.Station; break;
                            case "StationNumber": raw = d.StationNumber; break;
                            case "Pocket": raw = d.Pocket; break;
                            case "ToolPosition": raw = d.ToolPosition; break;
                        }
                        if (TryParseRaw(raw, out int parsed))
                        {
                            number = parsed;
                            return true;
                        }
                    }
                    catch { }
                }
            }
            catch
            {
                // ignore
            }

            return false;
        }

        private static List<TechLatheContour1> FilterTurningTechsByBarDiameter(IList<TechLatheContour1> source, string context)
        {
            List<TechLatheContour1> result = new List<TechLatheContour1>();
            if (source == null)
            {
                return result;
            }

            double barDiameter = Document?.LatheMachineSetup?.BarDiameter ?? 0.0;
            if (barDiameter <= 0.0)
            {
                // 기준 직경 정보가 없으면 기존 동작 유지
                foreach (TechLatheContour1 tech in source)
                {
                    if (tech != null) result.Add(tech);
                }
                return result;
            }

            int skipped = 0;
            int unresolved = 0;
            int considered = 0;
            foreach (TechLatheContour1 tech in source)
            {
                if (tech == null)
                {
                    continue;
                }
                considered++;

                if (TryResolveTechnologyToolDiameter(tech, out double toolDiameter, out string toolDesc))
                {
                    if (toolDiameter > barDiameter + 1e-6)
                    {
                        skipped++;
                        DentalLogger.Log($"{context} - {toolDesc} Dia={toolDiameter:0.###} > CAMDia(Bar)={barDiameter:0.###}, 불필요 가공으로 제외");
                        continue;
                    }
                }
                else
                {
                    unresolved++;
                    DentalLogger.Log($"{context} - ToolDiameter 해석 실패(techType={tech.GetType().Name}), CAMDia 필터 미적용");
                }

                result.Add(tech);
            }

            DentalLogger.Log($"{context} - CAMDia 필터 결과: considered={considered}, kept={result.Count}, skipped={skipped}, unresolved={unresolved}, CAMDia(Bar)={barDiameter:0.###}");
            return result;
        }

        internal static bool TryResolveTechnologyToolDiameter(object technology, out double diameter, out string toolDesc)
        {
            diameter = 0.0;
            toolDesc = "ToolID='<unknown>'";
            if (technology == null)
            {
                return false;
            }

            string toolId = null;
            try
            {
                object raw = technology.GetType().InvokeMember("ToolID", BindingFlags.GetProperty, null, technology, null, CultureInfo.InvariantCulture);
                toolId = raw as string;
            }
            catch
            {
                try
                {
                    dynamic d = technology;
                    toolId = d.ToolID as string;
                }
                catch { }
            }

            if (!string.IsNullOrWhiteSpace(toolId))
            {
                toolDesc = $"ToolID='{toolId}'";
            }

            // 1) Tech 객체 자체의 직경 속성 우선
            if (TryGetNumericProperty(technology, new[] { "ToolDiameter", "Diameter", "Dia" }, out double techDia))
            {
                diameter = techDia;
                toolDesc += "(from Tech)";
                return diameter > 0.0;
            }

            // 2) Document.Tools 매칭
            if (TryResolveToolDiameterByToolId(toolId, out double mappedDia))
            {
                diameter = mappedDia;
                toolDesc += "(from ToolTable)";
                return diameter > 0.0;
            }

            // 3) ToolID 문자열 파싱 fallback (예: D12, D10, DIA8)
            if (TryParseDiameterFromToolId(toolId, out double parsedDia))
            {
                diameter = parsedDia;
                toolDesc += "(from ToolID-parse)";
                return diameter > 0.0;
            }

            return false;
        }

        private static bool TryResolveToolDiameterByToolId(string toolId, out double diameter)
        {
            diameter = 0.0;
            if (string.IsNullOrWhiteSpace(toolId) || Document?.Tools == null)
            {
                return false;
            }

            try
            {
                foreach (Tool tool in (IEnumerable)Document.Tools)
                {
                    if (tool == null || string.IsNullOrWhiteSpace(tool.ToolID))
                    {
                        continue;
                    }

                    if (!string.Equals(tool.ToolID, toolId, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (TryGetToolDiameter(tool, out double resolved))
                    {
                        diameter = resolved;
                        return true;
                    }
                    return false;
                }
            }
            catch
            {
                // ignore
            }

            return false;
        }

        private static bool TryParseDiameterFromToolId(string toolId, out double diameter)
        {
            diameter = 0.0;
            if (string.IsNullOrWhiteSpace(toolId))
            {
                return false;
            }

            string id = toolId.Trim().ToUpperInvariant();
            int idx = id.IndexOf('D');
            if (idx >= 0)
            {
                int start = idx + 1;
                int end = start;
                while (end < id.Length && (char.IsDigit(id[end]) || id[end] == '.')) end++;
                if (end > start && double.TryParse(id.Substring(start, end - start), NumberStyles.Float, CultureInfo.InvariantCulture, out double dVal) && dVal > 0.0)
                {
                    diameter = dVal;
                    return true;
                }
            }

            idx = id.IndexOf("DIA", StringComparison.OrdinalIgnoreCase);
            if (idx >= 0)
            {
                int start = idx + 3;
                while (start < id.Length && (id[start] == '_' || id[start] == '-' || id[start] == ' ')) start++;
                int end = start;
                while (end < id.Length && (char.IsDigit(id[end]) || id[end] == '.')) end++;
                if (end > start && double.TryParse(id.Substring(start, end - start), NumberStyles.Float, CultureInfo.InvariantCulture, out double diaVal) && diaVal > 0.0)
                {
                    diameter = diaVal;
                    return true;
                }
            }

            return false;
        }

        private static bool TryGetNumericProperty(object target, string[] propNames, out double value)
        {
            value = 0.0;
            if (target == null || propNames == null || propNames.Length == 0)
            {
                return false;
            }

            Type t = target.GetType();
            foreach (string pn in propNames)
            {
                if (string.IsNullOrWhiteSpace(pn)) continue;

                try
                {
                    PropertyInfo p = t.GetProperty(pn, BindingFlags.Public | BindingFlags.Instance);
                    if (p != null && p.CanRead)
                    {
                        object raw = p.GetValue(target);
                        if (raw != null && double.TryParse(Convert.ToString(raw, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out double parsed) && parsed > 0.0)
                        {
                            value = parsed;
                            return true;
                        }
                    }
                }
                catch { }

                try
                {
                    object raw = t.InvokeMember(pn, BindingFlags.GetProperty, null, target, null, CultureInfo.InvariantCulture);
                    if (raw != null && double.TryParse(Convert.ToString(raw, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out double parsed) && parsed > 0.0)
                    {
                        value = parsed;
                        return true;
                    }
                }
                catch { }
            }

            return false;
        }

        private static bool TryGetToolDiameter(Tool tool, out double diameter)
        {
            diameter = 0.0;
            if (tool == null)
            {
                return false;
            }

            try
            {
                if (tool is ToolMillBallMill ball)
                {
                    diameter = ball.ToolDiameter;
                    return diameter > 0.0;
                }
            }
            catch { }

            string[] propNames = new[] { "ToolDiameter", "Diameter", "Dia" };
            Type t = tool.GetType();
            foreach (string pn in propNames)
            {
                try
                {
                    PropertyInfo p = t.GetProperty(pn, BindingFlags.Public | BindingFlags.Instance);
                    if (p != null && p.CanRead)
                    {
                        object raw = p.GetValue(tool);
                        if (raw != null && double.TryParse(Convert.ToString(raw, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out double parsed) && parsed > 0.0)
                        {
                            diameter = parsed;
                            return true;
                        }
                    }
                }
                catch { }

                try
                {
                    object raw = t.InvokeMember(pn, BindingFlags.GetProperty, null, tool, null, CultureInfo.InvariantCulture);
                    if (raw != null && double.TryParse(Convert.ToString(raw, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out double parsed) && parsed > 0.0)
                    {
                        diameter = parsed;
                        return true;
                    }
                }
                catch { }
            }

            return false;
        }

        // 3-stage turning 분할 준비: region(FRONT/MIDDLE/BACK)에 맞는 X 구간을 계산한다.
        // 기준:
        // - Splitline_1 = FrontPointX
        // - Splitline_2 = midpoint(Splitline_1, BackPointX)
        // - 경계 확장: ±2.2mm
        private static bool TryPrepareTurningRegionRange(string region, out double rangeMinX, out double rangeMaxX)
        {
            rangeMinX = 0.0;
            rangeMaxX = 0.0;
            try
            {
                if (!TryGetThreeStageSplitConfig(out double splitline1, out double splitline2, out double xMin, out double xMax))
                {
                    DentalLogger.Log("TurningOp 3-Stage - split config 계산 실패");
                    return false;
                }

                const double faceToRoughMm = 2.2;
                const double roughToTurnMm = 2.2;
                const double frontFaceOffsetMm = 0.5;
                const double middleRoughOverCutMm = 2.2;

                // Rough 경계(현재 정책)
                double frontRoughEnd = Math.Min(xMax, splitline1 + frontFaceOffsetMm + faceToRoughMm);
                double middleRoughStart = Math.Max(xMin, splitline1 - middleRoughOverCutMm);
                double middleRoughEnd = Math.Min(xMax, splitline2 + middleRoughOverCutMm);

                string normalized = (region ?? string.Empty).Trim().ToUpperInvariant();
                switch (normalized)
                {
                    case "FRONT":
                        // 요청사항: Front Turn 폭 = Front Rough 폭 + 2.2mm
                        rangeMinX = xMin;
                        rangeMaxX = Math.Min(xMax, frontRoughEnd + roughToTurnMm);
                        break;
                    case "MIDDLE":
                        // 요청사항: Middle Turn 폭 = Middle Rough 폭 + 2.2mm
                        rangeMinX = middleRoughStart;
                        rangeMaxX = Math.Min(xMax, middleRoughEnd + roughToTurnMm);
                        break;
                    case "BACK":
                        // 요청사항 반영(2026-07-01):
                        // 1) 시작점은 Front/Middle과 동일한 anchor(FrontPointX)로 통일한다.
                        //    - 증상: Back_Turn만 과도하게 좌측(-X)에서 시작해 에러/비정상 접근이 발생.
                        //    - 조치: 시작 하한을 FrontPointX로 고정해 세 구간의 시작 기준을 일치시킨다.
                        // 2) 끝점은 기존 Back_Turn 형상(수평 extension + 45도 퇴출)을 유지한다.
                        //    - 범위를 xMax로 자르면 퇴출부가 클리핑되어 수평+45 형상이 사라질 수 있다.
                        //    - 따라서 xMax + exitAllowance까지 허용해 기존 퇴출 형상을 보존한다.
                        rangeMinX = Clamp(MoveSTL_Module.FrontPointX, xMin + 1e-6, xMax - 1e-6);

                        double backTurningExtend = ResolveBackTurningExtendForBackTurnRange();
                        double exitAllowance = Math.Max(0.5, Math.Abs(backTurningExtend) + Math.Abs(BackTurn));
                        double chamferTan = Math.Abs(Math.Tan(Math.PI * Chamfer / 180.0));
                        if (Math.Abs(Chamfer - 90.0) > 0.001 && chamferTan > 1e-6)
                        {
                            double topY = Document?.LatheMachineSetup?.BarDiameter / 2.0 ?? 0.0;
                            double rise = Math.Max(0.0, topY - LowerY);
                            exitAllowance += rise / chamferTan;
                        }

                        rangeMaxX = xMax + exitAllowance;
                        break;
                    default:
                        DentalLogger.Log($"TurningOp 3-Stage - 미지원 region='{region}'");
                        return false;
                }

                if (rangeMaxX - rangeMinX < 1e-4)
                {
                    DentalLogger.Log($"TurningOp 3-Stage - 유효 구간 부족 region={region}, range=[{rangeMinX:0.###},{rangeMaxX:0.###}]");
                    return false;
                }

                DentalLogger.Log($"TurningOp 3-Stage - region={region}, range=[{rangeMinX:0.###},{rangeMaxX:0.###}], split1={splitline1:0.###}, split2={splitline2:0.###}");
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"TurningOp 3-Stage - 구간 준비 실패(region={region}): {ex.GetType().Name}:{ex.Message}");
                return false;
            }
        }

        private static double ResolveBackTurningExtendForBackTurnRange()
        {
            // Back_Turn range 계산의 TurningExtend SSOT.
            // 중요: TurningExtend(예: XML/Configurator 3.5)는 초기 seed이며,
            // 실제 Back_Turn range 계산에서는 아래 규칙으로 최종값을 재결정한다.
            // - finishLineMinZ 사용 가능: computed = 6.0 - minZ
            // - finishLineMinZ 미사용: computed = seed(TurningExtend)
            // - 공통 하한: applied = max(computed, 4.0)
            const double backTurningExtendMinMm = 4.0;

            double fallback = TurningExtend;
            string raw = Environment.GetEnvironmentVariable("ABUTS_FINISHLINE_MIN_Z");

            if (!string.IsNullOrWhiteSpace(raw)
                && double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out double finishLineMinZ)
                && !double.IsNaN(finishLineMinZ)
                && !double.IsInfinity(finishLineMinZ))
            {
                double computed = 6.0 - finishLineMinZ;
                double applied = Math.Max(backTurningExtendMinMm, computed);
                DentalLogger.Log($"TurningOp BACK - TurningExtend override: 6.0 - finishLineMinZ({finishLineMinZ.ToString("F4", CultureInfo.InvariantCulture)}) = {computed.ToString("F4", CultureInfo.InvariantCulture)}, applied={applied.ToString("F4", CultureInfo.InvariantCulture)} (min={backTurningExtendMinMm.ToString("F1", CultureInfo.InvariantCulture)}mm)");
                return applied;
            }

            double fallbackApplied = Math.Max(backTurningExtendMinMm, fallback);
            DentalLogger.Log($"TurningOp BACK - ABUTS_FINISHLINE_MIN_Z 미사용('{raw ?? ""}'), 기존 TurningExtend({fallback.ToString("F4", CultureInfo.InvariantCulture)}) -> applied({fallbackApplied.ToString("F4", CultureInfo.InvariantCulture)}) (min={backTurningExtendMinMm.ToString("F1", CultureInfo.InvariantCulture)}mm)");
            return fallbackApplied;
        }

        // 레거시 Turn_B(2-phase B) 구간 계산을 3-stage Back_Turn에 그대로 적용
        // - splitX는 기존 TryGetSplitABConfig 기준
        // - 시작점은 splitX - 0.5mm, 끝점은 xMax
        private static bool TryPrepareBackTurnRangeFromLegacyTurnB(out double rangeMinX, out double rangeMaxX)
        {
            rangeMinX = 0.0;
            rangeMaxX = 0.0;
            try
            {
                if (!TryGetSplitABConfig(out double splitX, out _, out _))
                {
                    DentalLogger.Log("TurningOp BACK - 레거시 Turn_B split 설정 미존재");
                    return false;
                }

                double frontBackMin = Math.Min(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);
                double xMin = Math.Min(0.0, frontBackMin);
                double xMax = Math.Max(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);

                if (!(splitX > xMin && splitX < xMax))
                {
                    DentalLogger.Log($"TurningOp BACK - 레거시 Turn_B splitX 범위 오류 splitX:{splitX:0.###}, xMin:{xMin:0.###}, xMax:{xMax:0.###}");
                    return false;
                }

                // 레거시 폴백에서도 시작점이 과도하게 -X로 멀어지지 않도록
                // FrontPointX(소재 근처 시작) 하한을 강제한다.
                double frontAnchorX = Clamp(MoveSTL_Module.FrontPointX, xMin + 1e-6, xMax - 1e-6);
                double effectiveSplitX = Math.Max(splitX - 0.5, frontAnchorX);
                rangeMinX = effectiveSplitX;

                // 끝점은 기존 Back_Turn 형상(수평 extension + 45도 퇴출)을 유지하도록 확장한다.
                double backTurningExtend = ResolveBackTurningExtendForBackTurnRange();
                double exitAllowance = Math.Max(0.5, Math.Abs(backTurningExtend) + Math.Abs(BackTurn));
                double chamferTan = Math.Abs(Math.Tan(Math.PI * Chamfer / 180.0));
                if (Math.Abs(Chamfer - 90.0) > 0.001 && chamferTan > 1e-6)
                {
                    double topY = Document?.LatheMachineSetup?.BarDiameter / 2.0 ?? 0.0;
                    double rise = Math.Max(0.0, topY - LowerY);
                    exitAllowance += rise / chamferTan;
                }

                rangeMaxX = xMax + exitAllowance;

                if (rangeMaxX - rangeMinX < 1e-4)
                {
                    DentalLogger.Log($"TurningOp BACK - 레거시 Turn_B 유효 구간 부족 range=[{rangeMinX:0.###},{rangeMaxX:0.###}]");
                    return false;
                }

                DentalLogger.Log($"TurningOp BACK - 레거시 Turn_B range 적용: splitX={splitX:0.###}, effectiveSplitX={effectiveSplitX:0.###}, range=[{rangeMinX:0.###},{rangeMaxX:0.###}]");
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"TurningOp BACK - 레거시 Turn_B range 준비 실패: {ex.GetType().Name}:{ex.Message}");
                return false;
            }
        }


        // turning 프로파일 체인(source)을 [minX, maxX] 구간으로 잘라 새 체인으로 생성한다.
        // arc/segment 혼합 프로파일을 PointAlong로 조밀 샘플링하여 polyline으로 재구성한다.
        private static FeatureChain BuildTurningRangeChain(FeatureChain source, double minX, double maxX, string newName)
        {
            try
            {
                if (source == null)
                {
                    return null;
                }

                if (maxX < minX)
                {
                    double t = minX;
                    minX = maxX;
                    maxX = t;
                }

                double len = 0.0;
                try { len = source.Length; } catch { }
                if (!(len > 1e-6))
                {
                    DentalLogger.Log("BuildTurningRangeChain - source length<=0");
                    return null;
                }

                const int targetSamples = 600;
                double step = len / targetSamples;
                if (step < 1e-4) step = 1e-4;

                List<double[]> pts = new List<double[]>();
                for (double s = 0.0; s <= len + 1e-9; s += step)
                {
                    double ss = Math.Min(s, len);
                    Point p = null;
                    try { p = source.PointAlong(ss); } catch { }
                    if (p == null) continue;

                    double[] np = new[] { p.X, p.Y, p.Z };
                    if (pts.Count == 0
                        || Math.Abs(np[0] - pts[pts.Count - 1][0]) > 1e-9
                        || Math.Abs(np[1] - pts[pts.Count - 1][1]) > 1e-9
                        || Math.Abs(np[2] - pts[pts.Count - 1][2]) > 1e-9)
                    {
                        pts.Add(np);
                    }
                }

                if (pts.Count < 2)
                {
                    return null;
                }

                const double eps = 1e-6;
                List<double[]> region = new List<double[]>();

                for (int idx = 0; idx < pts.Count; idx++)
                {
                    double[] curr = pts[idx];
                    bool currInside = curr[0] >= minX - eps && curr[0] <= maxX + eps;

                    if (currInside)
                    {
                        if (region.Count == 0 && idx > 0)
                        {
                            double[] prev = pts[idx - 1];
                            double[] cross = null;
                            if ((prev[0] < minX && curr[0] > minX) || (prev[0] > minX && curr[0] < minX))
                            {
                                cross = InterpolatePointAtX(prev, curr, minX);
                            }
                            else if ((prev[0] < maxX && curr[0] > maxX) || (prev[0] > maxX && curr[0] < maxX))
                            {
                                cross = InterpolatePointAtX(prev, curr, maxX);
                            }
                            if (cross != null)
                            {
                                region.Add(cross);
                            }
                        }

                        region.Add(curr);
                    }
                    else if (region.Count > 0)
                    {
                        double[] prev = pts[idx - 1];
                        double[] cross = null;
                        if ((prev[0] < minX && curr[0] > minX) || (prev[0] > minX && curr[0] < minX))
                        {
                            cross = InterpolatePointAtX(prev, curr, minX);
                        }
                        else if ((prev[0] < maxX && curr[0] > maxX) || (prev[0] > maxX && curr[0] < maxX))
                        {
                            cross = InterpolatePointAtX(prev, curr, maxX);
                        }

                        if (cross != null)
                        {
                            region.Add(cross);
                        }
                        break;
                    }
                }

                if (region.Count < 2)
                {
                    DentalLogger.Log($"BuildTurningRangeChain - region 포인트 부족(range=[{minX:0.###},{maxX:0.###}], count={region.Count})");
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
                try { if (source.Plane != null) fc.Plane = source.Plane; } catch { }
                DentalLogger.Log($"BuildTurningRangeChain - '{newName}' 생성 (range=[{minX:0.###},{maxX:0.###}], pts={region.Count})");
                return fc;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"BuildTurningRangeChain 실패: {ex.GetType().Name}:{ex.Message}");
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
