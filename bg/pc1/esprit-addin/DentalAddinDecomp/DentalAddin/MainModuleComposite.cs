using Abuts.EspritAddIns.ESPRIT2025AddinProject;
using Esprit;
using EspritConstants;
using EspritFeatures;
using EspritTechnology;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;
using System;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace DentalAddin
{
    internal sealed partial class MainModule
    {
        private static bool TryGetComposite2SplitABConfig(out bool enabled, out double splitX, out string prcA, out string prcB)
        {
            enabled = false;
            splitX = 0.0;
            prcA = null;
            prcB = null;

            try
            {
                string enableRaw = Environment.GetEnvironmentVariable("ABUTS_COMPOSITE_SPLIT_ENABLE");
                enabled = enableRaw == "1" || string.Equals(enableRaw, "true", StringComparison.OrdinalIgnoreCase);
                if (!enabled)
                {
                    return true;
                }

                string splitXRaw = Environment.GetEnvironmentVariable("ABUTS_COMPOSITE_SPLIT_X");
                if (!string.IsNullOrWhiteSpace(splitXRaw))
                {
                    double.TryParse(splitXRaw, NumberStyles.Float, CultureInfo.InvariantCulture, out splitX);
                }

                prcA = Environment.GetEnvironmentVariable("ABUTS_COMPOSITE_PRC_A");
                prcB = Environment.GetEnvironmentVariable("ABUTS_COMPOSITE_PRC_B");

                if (string.IsNullOrWhiteSpace(prcA) || string.IsNullOrWhiteSpace(prcB))
                {
                    DentalLogger.Log("Composite2SplitAB - PRC_A/PRC_B 환경변수가 비어 있어 Split 비활성 처리");
                    enabled = false;
                }
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitAB - 환경변수 로드 실패: {ex.GetType().Name}:{ex.Message}");
                enabled = false;
                return false;
            }
        }

        // Composite_B(+rightOffset 구간) 가공여유 보정.
        // PRC의 StockAllowance(DispId 272) 기본값을 수정하지 않고 런타임으로만 오버라이드한다.
        private static void TrySetCompositeStockAllowance(TechLatheMill5xComposite op, string label)
        {
            if (op == null)
            {
                return;
            }

            // A 대상일 경우 env(ABUTS_COMPOSITE_STOCK_ALLOWANCE_A)를 우선 확인한다.
            double? stockAllowanceOverride = null;
            if (label != null && label.Trim().Length > 0 && label.Trim().StartsWith("A", StringComparison.OrdinalIgnoreCase))
            {
                string rawEnv = Environment.GetEnvironmentVariable(AppConfig.CompositeStockAllowanceAEnv);
                if (!string.IsNullOrWhiteSpace(rawEnv))
                {
                    if (double.TryParse(rawEnv, NumberStyles.Float, CultureInfo.InvariantCulture, out double parsed))
                    {
                        stockAllowanceOverride = parsed;
                    }
                    else
                    {
                        DentalLogger.Log($"Composite2SplitAB - {label} StockAllowance env 파싱 실패 (raw='{rawEnv}'), env 무시");
                    }
                }
            }

            double stockAllowance;
            if (stockAllowanceOverride.HasValue)
            {
                stockAllowance = stockAllowanceOverride.Value;
            }
            else
            {
                // B(및 B-Extension) 구간의 기본 보정값을 사용. A에 대해서는 env가 없으면 PRC 기본값을 유지(적용하지 않음).
                if (label != null && label.Trim().Length > 0 && label.Trim().StartsWith("B", StringComparison.OrdinalIgnoreCase))
                {
                    stockAllowance = AppConfig.DefaultCompositeBStockAllowanceForRightOffset;
                    if (stockAllowance <= 0.0)
                    {
                        DentalLogger.Log($"Composite2SplitAB - {label} StockAllowance 보정값이 0 이하라 적용 생략 ({stockAllowance.ToString("0.###", CultureInfo.InvariantCulture)})");
                        return;
                    }
                }
                else
                {
                    // A이고 env도 없으면 적용하지 않음(원본 PRC 유지)
                    DentalLogger.Log($"Composite2SplitAB - {label} StockAllowance env 미지정 - PRC 기본값 유지");
                    return;
                }
            }

            try
            {
                op.GetType().InvokeMember(
                    "StockAllowance",
                    BindingFlags.SetProperty,
                    null,
                    op,
                    new object[] { stockAllowance },
                    CultureInfo.InvariantCulture);
                DentalLogger.Log($"Composite2SplitAB - {label} StockAllowance={stockAllowance.ToString("0.###", CultureInfo.InvariantCulture)} 적용 (PRC 파일 무변경)");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitAB - {label} StockAllowance 설정 실패: {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static bool TryRunComposite2SplitAB(FreeFormFeature freeFormFeature)
        {
            if (Document == null || freeFormFeature == null)
            {
                return false;
            }

            if (!TryGetComposite2SplitABConfig(out bool enabled, out double splitX, out string prcA, out string prcB))
            {
                return false;
            }

            if (!enabled)
            {
                return false;
            }

            const double leftRatio = AppConfig.DefaultLeftRatio;
            double rightOffset = AppConfig.DefaultRightRatioOffset;
            double backXForComposite = MoveSTL_Module.BackPointX + rightOffset;
            double baseBackRatio = MoveSTL_Module.BackPointX / 20.0;
            double rightRatio = backXForComposite / 20.0;
            rightRatio = Clamp(rightRatio, leftRatio, 1.0);
            baseBackRatio = Clamp(baseBackRatio, leftRatio, rightRatio);
            double span = MoveSTL_Module.BackPointX - MoveSTL_Module.FrontPointX;
            double absSpan = Math.Abs(span);
            double direction = span >= 0 ? 1.0 : -1.0;
            if (absSpan < 0.001)
            {
                absSpan = 1.0;
                direction = 1.0;
            }

            double firstPercent = Clamp(leftRatio * 100.0, 0.0, 100.0);
            double baseBackPercent = Clamp(baseBackRatio * 100.0, firstPercent, 100.0);
            double lastPercent = Clamp(rightRatio * 100.0, firstPercent, 100.0);

            double splitRatio;
            if (splitX > 0.001)
            {
                splitRatio = (splitX - MoveSTL_Module.FrontPointX) / (direction * absSpan);
                if (double.IsNaN(splitRatio) || double.IsInfinity(splitRatio))
                {
                    splitRatio = leftRatio + (rightRatio - leftRatio) * 0.27;
                    splitX = MoveSTL_Module.FrontPointX + splitRatio * direction * absSpan;
                }
                splitRatio = Clamp(splitRatio, leftRatio, rightRatio);
                DentalLogger.Log($"Composite2SplitAB - 환경변수 splitX={splitX:F3} (ratio={splitRatio:F3})");
            }
            else if (MoveSTL_Module.FinishLineTopZ > 0.001)
            {
                double stlShift = AppConfig.DefaultStlShift;
                double finishLineDistanceFromBack = MoveSTL_Module.FinishLineTopZ - stlShift;
                double frontBeforeShift = MoveSTL_Module.FrontPointX - stlShift;
                double backBeforeShift = MoveSTL_Module.BackPointX - stlShift;
                double spanBeforeShift = backBeforeShift - frontBeforeShift;
                double absSpanBeforeShift = Math.Abs(spanBeforeShift);

                double finishLinePositionBeforeShift = backBeforeShift - finishLineDistanceFromBack;
                splitX = finishLinePositionBeforeShift + stlShift;
                splitRatio = (finishLinePositionBeforeShift - frontBeforeShift) / absSpanBeforeShift;
                splitRatio = Clamp(splitRatio, leftRatio, rightRatio);
                DentalLogger.Log($"Composite2SplitAB - FinishLine 기반 splitX={splitX:F3} (ratio={splitRatio:F3}, finishLinePos={finishLinePositionBeforeShift:F3}, distFromBack={finishLineDistanceFromBack:F3})");
            }
            else
            {
                splitRatio = leftRatio + (rightRatio - leftRatio) * 0.27;
                splitX = MoveSTL_Module.FrontPointX + splitRatio * direction * absSpan;
                splitRatio = Clamp(splitRatio, leftRatio, rightRatio);
                DentalLogger.Log($"Composite2SplitAB - 기본 계산 splitX={splitX:F3} (27% 지점, FinishLineTopZ 없음)");
            }
            double splitPercent = Clamp(splitRatio * 100.0, firstPercent, lastPercent);

            DentalLogger.Log($"Composite2SplitAB - enabled=1, splitX={splitX:F3}, prcA={prcA}, prcB={prcB}");

            if (Math.Abs(splitPercent - firstPercent) < 0.01 || Math.Abs(lastPercent - splitPercent) < 0.01)
            {
                DentalLogger.Log($"Composite2SplitAB - SplitPercent 범위가 너무 작음 (First={firstPercent:F2}, Split={splitPercent:F2}, Last={lastPercent:F2}), Split 건너뜀");
                return false;
            }

            Layer activeLayer;
            try
            {
                activeLayer = Document.Layers.Add("CompositeMill");
            }
            catch
            {
                activeLayer = Document.Layers["CompositeMill"];
            }
            Document.ActiveLayer = activeLayer;

            var technologyUtility = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));

            ITechnology[] techA = TryOpenProcess(technologyUtility, prcA, "Composite2SplitAB:A");
            ITechnology[] techB = TryOpenProcess(technologyUtility, prcB, "Composite2SplitAB:B");

            if (techA.Length <= 0 || techB.Length <= 0)
            {
                DentalLogger.Log($"Composite2SplitAB - PRC 로드 실패 (A:{techA.Length}, B:{techB.Length})");
                return false;
            }

            TechLatheMill5xComposite opA = techA[0] as TechLatheMill5xComposite;
            TechLatheMill5xComposite opB = techB[0] as TechLatheMill5xComposite;
            if (opA == null || opB == null)
            {
                DentalLogger.Log($"Composite2SplitAB - TechLatheMill5xComposite 캐스팅 실패 (A:{techA[0]?.GetType().Name}, B:{techB[0]?.GetType().Name})");
                return false;
            }

            opA.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
            opB.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
            double? firstPassPercentOverride = TryGetCompositeFirstPassPercentOverride();
            if (firstPassPercentOverride.HasValue)
            {
                opA.FirstPassPercent = Clamp(firstPassPercentOverride.Value, 0.0, splitPercent);
            }
            opA.LastPassPercent = splitPercent;
            opB.FirstPassPercent = splitPercent;
            opB.LastPassPercent = lastPercent;

            bool hasRightExtensionSegment = rightOffset > 0.0 && lastPercent - baseBackPercent > 0.01;
            double extensionStartPercent = Clamp(baseBackPercent, splitPercent, lastPercent);
            if (hasRightExtensionSegment)
            {
                opB.LastPassPercent = extensionStartPercent;
            }

            opA.DriveSurface = "19," + Conversions.ToString(SurfaceNumber);
            opB.DriveSurface = opA.DriveSurface;

            if (string.IsNullOrWhiteSpace(opA.ToolID))
            {
                if (!string.IsNullOrWhiteSpace(ToolNs))
                {
                    opA.ToolID = ToolNs;
                }
                else
                {
                    DentalLogger.Log("Composite2SplitAB 중단 - PRC ToolID 비어있고 ToolNs도 없습니다.");
                    return false;
                }
            }
            if (string.IsNullOrWhiteSpace(opB.ToolID))
            {
                opB.ToolID = opA.ToolID;
            }

            DentalLogger.Log($"Composite2SplitAB - PassPercent: A({opA.FirstPassPercent:F2}->{opA.LastPassPercent:F2}), B-Base({opB.FirstPassPercent:F2}->{opB.LastPassPercent:F2}), B-ExtEnabled={hasRightExtensionSegment}, B-ExtStart={extensionStartPercent:F2}, B-Last={lastPercent:F2}");

            // 유지홈(retentionGroove) -> StepIncrement 적용 (DispId 217 기준 IDispatch 늦은 바인딩).
            // env: ABUTS_COMPOSITE_STEP_INCREMENT_A (예: 0.1 / 0.2 / 0.3) — A에 대해 런타임 오버라이드 가능
            // PRC 파일 원본은 변경하지 않으며, 런타임으로 opA에 StepIncrement 및 StockAllowance를 적용한다. opB의 StepIncrement는
            // 유지홈 옵션과 무관하게 PRC에 정의된 기본값(예: 0.08)을 사용해야 한다.
            TrySetCompositeStepIncrement(opA, "A");
            // opB는 retentionGroove에 의해 StepIncrement를 오버라이드하지 않음; PRC 기본값 유지.
            TrySetCompositeStepIncrement(opB, "B");
            // A의 경우 가공여유(StockAllowance) 런타임 오버라이드도 허용한다 (env: ABUTS_COMPOSITE_STOCK_ALLOWANCE_A)
            TrySetCompositeStockAllowance(opA, "A");
            TechLatheMill5xComposite opBExtension = null;
            if (hasRightExtensionSegment)
            {
                ITechnology[] techBExt = TryOpenProcess(technologyUtility, prcB, "Composite2SplitAB:B:Extension");
                if (techBExt.Length > 0)
                {
                    opBExtension = techBExt[0] as TechLatheMill5xComposite;
                }

                if (opBExtension == null)
                {
                    DentalLogger.Log("Composite2SplitAB - B Extension PRC 로드/캐스팅 실패, Extension 구간 가공여유 보정 생략");
                }
                else
                {
                    opBExtension.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
                    opBExtension.FirstPassPercent = extensionStartPercent;
                    opBExtension.LastPassPercent = lastPercent;
                    opBExtension.DriveSurface = opA.DriveSurface;
                    opBExtension.ToolID = opB.ToolID;
                    // #520 기준 +rightOffset 구간(연장 0.1mm)에만 가공여유 +0.05 적용.
                    // PRC 원본(StockAllowance=0)은 유지하고, 런타임 COM 속성으로만 적용한다.
                    TrySetCompositeStockAllowance(opBExtension, "B-Extension");
                }
            }

            TryAddOperation(opA, freeFormFeature, "Composite2SplitAB:A");
            TryAddOperation(opB, freeFormFeature, "Composite2SplitAB:B");
            if (opBExtension != null)
            {
                TryAddOperation(opBExtension, freeFormFeature, "Composite2SplitAB:B:Extension");
            }
            return true;
        }

        private static double? TryGetCompositeFirstPassPercentOverride()
        {
            string raw = Environment.GetEnvironmentVariable(AppConfig.CompositeFirstPassPercentAEnv);
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out double value))
            {
                DentalLogger.Log($"Composite2SplitAB - FirstPassPercent env 파싱 실패 (env={AppConfig.CompositeFirstPassPercentAEnv}, raw='{raw}')");
                return null;
            }

            return Clamp(value, 0.0, 100.0);
        }

        // retentionGroove(유지홈) → StepIncrement 적용. PRC 파일을 건드리지 않고
        // Esprit COM 객체(IDispatch)에 직접 SetProperty 한다. 대상 DispId 는 PRC 의
        // `StepIncrement; 217;` 토큰과 동일하다. 환경변수 ABUTS_COMPOSITE_STEP_INCREMENT_A
        // 가 비어 있으면 PRC 기본값을 그대로 사용한다.
        private static void TrySetCompositeStepIncrement(TechLatheMill5xComposite op, string label)
        {
            if (op == null)
            {
                return;
            }
            string envKey = AppConfig.CompositeStepIncrementAEnv;
            if (string.Equals(label, "B", StringComparison.OrdinalIgnoreCase))
            {
                envKey = AppConfig.CompositeStepIncrementBEnv;
            }
            string raw = Environment.GetEnvironmentVariable(envKey);
            if (string.IsNullOrWhiteSpace(raw))
            {
                DentalLogger.Log($"Composite2SplitAB - {label} StepIncrement env 비어있음 (env={envKey}), PRC 기본값 사용");
                return;
            }
            if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out double stepIncrement))
            {
                DentalLogger.Log($"Composite2SplitAB - {label} StepIncrement env 파싱 실패 (raw='{raw}'), PRC 기본값 사용");
                return;
            }
            try
            {
                op.GetType().InvokeMember(
                    "StepIncrement",
                    BindingFlags.SetProperty,
                    null,
                    op,
                    new object[] { stepIncrement },
                    CultureInfo.InvariantCulture);
                DentalLogger.Log($"Composite2SplitAB - {label} StepIncrement={stepIncrement.ToString("0.###", CultureInfo.InvariantCulture)} 적용 (PRC 파일 무변경, env={envKey})");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitAB - {label} StepIncrement 설정 실패: {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static void TryAddOperation(object technology, IGraphicObject graphicObject, string context)
        {
            if (Document == null)
            {
                DentalLogger.Log($"TryAddOperation:{context} - Document is null");
                return;
            }
            if (Document.Operations == null)
            {
                DentalLogger.Log($"TryAddOperation:{context} - Document.Operations is null");
                return;
            }
            if (technology == null)
            {
                DentalLogger.Log($"TryAddOperation:{context} - technology is null");
                return;
            }
            if (graphicObject == null)
            {
                DentalLogger.Log($"TryAddOperation:{context} - graphicObject is null");
                return;
            }

            ITechnology castTechnology = technology as ITechnology;
            if (castTechnology == null)
            {
                DentalLogger.Log($"TryAddOperation:{context} - technology는 ITechnology로 캐스팅 불가 ({technology.GetType()})");
                return;
            }

            try
            {
                Document.Operations.Add(castTechnology, graphicObject, RuntimeHelpers.GetObjectValue(Missing.Value));
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"TryAddOperation:{context} - Document.Operations.Add 실패: {ex.Message}");
                DentalLogger.LogException("MainModule.TryAddOperation", ex);
                throw;
            }
        }

        private static ITechnology[] TryOpenProcess(TechnologyUtility technologyUtility, string filePath, string context)
        {
            string fullPath;
            try
            {
                fullPath = string.IsNullOrWhiteSpace(filePath) ? filePath : Path.GetFullPath(filePath);
            }
            catch
            {
                fullPath = filePath;
            }

            DentalLogger.Log($"OpenProcess:{context} - PRC 경로: {fullPath}");

            if (technologyUtility == null)
            {
                DentalLogger.Log($"OpenProcess:{context} - technologyUtility가 null");
                return Array.Empty<ITechnology>();
            }

            if (string.IsNullOrWhiteSpace(fullPath))
            {
                DentalLogger.Log($"OpenProcess:{context} - PRC 경로가 비어 있음");
                return Array.Empty<ITechnology>();
            }

            if (!File.Exists(fullPath))
            {
                DentalLogger.Log($"OpenProcess:{context} - PRC 파일이 존재하지 않음");
                return Array.Empty<ITechnology>();
            }

            try
            {
                ITechnology[] result = (ITechnology[])technologyUtility.OpenProcess(fullPath);
                DentalLogger.Log($"OpenProcess:{context} - PRC 파일 열기 성공 (Count:{result?.Length ?? 0})");
                return result ?? Array.Empty<ITechnology>();
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"OpenProcess:{context} - OpenProcess 실패: {ex.Message}");
                DentalLogger.LogException("MainModule.TryOpenProcess", ex);
                return Array.Empty<ITechnology>();
            }
        }

        private static bool TryRunRoughFreeFromMillSplitAB()
        {
            if (Document == null)
            {
                return false;
            }

            if (RoughType <= 1.0)
            {
                return false;
            }

            if (RoughType == 3.0)
            {
                string enabled3 = GetEnvString("ABUTS_ROUGHFREEFORM_SPLIT_ENABLE");
                if (string.Equals(enabled3, "1", StringComparison.OrdinalIgnoreCase) || string.Equals(enabled3, "true", StringComparison.OrdinalIgnoreCase))
                {
                    DentalLogger.Log("RoughFreeFromMillSplitAB - RoughType==3은 현재 SplitAB 미지원. 기존 로직으로 진행");
                }
                return false;
            }

            if (!TryGetSplitABConfig(out double splitX, out string prcA, out string prcB))
            {
                return false;
            }

            if (Document?.LatheMachineSetup == null)
            {
                DentalLogger.Log("RoughFreeFromMillSplitAB - LatheMachineSetup null");
                return true;
            }

            FreeFormFeature ff0 = FindFreeFormFeatureByName("3DRoughMilling_0Degree");
            FreeFormFeature ff180 = FindFreeFormFeatureByName("3DRoughMilling_180Degree");
            if (ff0 == null || ff180 == null)
            {
                DentalLogger.Log("RoughFreeFromMillSplitAB - FreeFormFeature(0/180) 누락. SplitAB 중단");
                return true;
            }

            // 좌측 시작점을 U축(x=0)로 강제
            double frontBackMin = Math.Min(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);
            double xMin = Math.Min(0.0, frontBackMin);
            double xMax = Math.Max(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);
            if (!(splitX > xMin && splitX < xMax))
            {
                DentalLogger.Log($"RoughFreeFromMillSplitAB - splitX 범위 오류 (splitX:{splitX:0.###}, xMin:{xMin:0.###}, xMax:{xMax:0.###})");
                return true;
            }

            double radius = (Document.LatheMachineSetup.BarDiameter + 10.0) / 2.0;
            // Rough A는 finishline (splitX) 그대로 사용 (offset 0mm),
            // Rough B는 finishline에서 2mm 왼쪽에서 시작하도록 설정 (겹침 허용)
            double roughAEnd = splitX + 0.0;
            double roughBStart = splitX - 2.0;
            // 범위 내 클램프
            if (roughAEnd <= xMin + 1e-6) roughAEnd = xMin + 1e-6;
            if (roughAEnd >= xMax - 1e-6) roughAEnd = Math.Max(xMin + 1e-6, xMax - 1e-6);
            if (roughBStart <= xMin + 1e-6) roughBStart = xMin + 1e-6;
            if (roughBStart >= xMax - 1e-6) roughBStart = Math.Max(xMin + 1e-6, xMax - 1e-6);

            FeatureChain a1 = EnsureRectBoundary("RoughBoundryA1", xMin, roughAEnd, radius, -radius);
            FeatureChain b1 = EnsureRectBoundary("RoughBoundryB1", roughBStart, xMax, radius, -radius);
            if (a1 == null || b1 == null)
            {
                DentalLogger.Log("RoughFreeFromMillSplitAB - 경계 체인 생성 실패");
                return true;
            }

            int keyA = SafeParseKey(a1.Key);
            int keyB = SafeParseKey(b1.Key);
            DentalLogger.Log($"RoughFreeFromMillSplitAB - splitX:{splitX:0.###}, roughAEnd:{roughAEnd:0.###}, roughBStart:{roughBStart:0.###}, AKey:{keyA}, BKey:{keyB}, PRC_A:{prcA}, PRC_B:{prcB}");

            TechnologyUtility technologyUtility = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
            Layer activeLayer = GetOrCreateLayer("RoughFreeFormMill");
            if (activeLayer == null)
            {
                DentalLogger.Log("RoughFreeFromMillSplitAB - RoughFreeFormMill 레이어 확보 실패");
                return true;
            }
            Document.ActiveLayer = activeLayer;

            // 가이드 분할선 생성(작업창에서 분할 위치 확인용)
            EnsureTwoPhaseSplitGuideLine(splitX);

            string region = GetEnvString("ABUTS_ROUGHFREEFORM_SPLIT_REGION");
            if (string.Equals(region, "A", StringComparison.OrdinalIgnoreCase))
            {
                AddSplitOpsForRegion("A", prcA, keyA, technologyUtility, ff0, ff180);
            }
            else if (string.Equals(region, "B", StringComparison.OrdinalIgnoreCase))
            {
                AddSplitOpsForRegion("B", prcB, keyB, technologyUtility, ff0, ff180);
            }
            else
            {
                AddSplitOpsForRegion("A", prcA, keyA, technologyUtility, ff0, ff180);
                AddSplitOpsForRegion("B", prcB, keyB, technologyUtility, ff0, ff180);
            }

            return true;
        }

        private static void AddSplitOpsForRegion(string region, string prcFile, int boundaryKey, TechnologyUtility technologyUtility, FreeFormFeature ff0, FreeFormFeature ff180)
        {
            if (string.IsNullOrWhiteSpace(prcFile))
            {
                prcFile = (PrcFilePath != null && PrcFilePath.Length > 3) ? PrcFilePath[3] : null;
                DentalLogger.Log($"RoughFreeFromMillSplitAB - {region} 기본 PRC 사용: PRC[3]={prcFile}");
            }

            AddSplitOp(region, "0Degree", boundaryKey, ff0, prcFile, technologyUtility);
            AddSplitOp(region, "180Degree", boundaryKey, ff180, prcFile, technologyUtility);
        }

        private static void AddSplitOp(string region, string angleLabel, int boundaryKey, FreeFormFeature freeFormFeature, string prcFile, TechnologyUtility technologyUtility)
        {
            if (freeFormFeature == null)
            {
                return;
            }

            ITechnology[] tech = TryOpenProcess(technologyUtility, prcFile, $"RoughFreeFromMillSplitAB:{region}:{angleLabel}");
            if (tech.Length == 0)
            {
                DentalLogger.Log($"RoughFreeFromMillSplitAB - Region:{region} {angleLabel} PRC 로드 실패");
                return;
            }

            if (tech[0] is TechLatheMoldRoughing roughing)
            {
                roughing.BoundaryProfiles = "";
                roughing.BoundaryProfiles = "6," + boundaryKey.ToString(CultureInfo.InvariantCulture);
                TryAddOperation(roughing, freeFormFeature, $"SplitAB:{region}:{angleLabel}:Roughing");
            }

            if (tech.Length > 1 && tech[1] is TechLatheMoldZLevel zlevel)
            {
                zlevel.BoundaryProfiles = "";
                zlevel.BoundaryProfiles = "6," + boundaryKey.ToString(CultureInfo.InvariantCulture);
                TryAddOperation(zlevel, freeFormFeature, $"SplitAB:{region}:{angleLabel}:ZLevel");
            }

            DentalLogger.Log($"RoughFreeFromMillSplitAB - AddOp 완료 Region:{region} Angle:{angleLabel} BoundaryKey:{boundaryKey}");
        }

        private static bool TryGetSplitABConfig(out double splitX, out string prcA, out string prcB)
        {
            splitX = 0;
            prcA = GetEnvString("ABUTS_ROUGHFREEFORM_PRC_A");
            prcB = GetEnvString("ABUTS_ROUGHFREEFORM_PRC_B");

            string enabled = GetEnvString("ABUTS_ROUGHFREEFORM_SPLIT_ENABLE");
            string twoPhaseEnabled = GetEnvString(AppConfig.TwoPhaseEnableEnv);
            bool explicitEnable =
                string.Equals(enabled, "1", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(enabled, "true", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(twoPhaseEnabled, "1", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(twoPhaseEnabled, "true", StringComparison.OrdinalIgnoreCase);

            double frontBackMin = Math.Min(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);
            double xMin = Math.Min(0.0, frontBackMin);
            double xMax = Math.Max(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);
            double defaultSplit = (xMin + xMax) / 2.0;

            double? configured = GetEnvDoubleNullable(AppConfig.TwoPhaseSplitXEnv) ?? GetEnvDoubleNullable("ABUTS_ROUGHFREEFORM_SPLIT_X");
            splitX = configured ?? defaultSplit;

            bool anyConfigured = configured.HasValue || !string.IsNullOrWhiteSpace(prcA) || !string.IsNullOrWhiteSpace(prcB);
            if (!explicitEnable && !anyConfigured)
            {
                return false;
            }

            if (string.IsNullOrWhiteSpace(prcA))
            {
                prcA = (PrcFilePath != null && PrcFilePath.Length > 3) ? PrcFilePath[3] : null;
                DentalLogger.Log($"RoughFreeFromMillSplitAB - prcA 기본값 사용: PRC[3]={prcA}");
            }
            if (string.IsNullOrWhiteSpace(prcB))
            {
                prcB = (PrcFilePath != null && PrcFilePath.Length > 3) ? PrcFilePath[3] : null;
                DentalLogger.Log($"RoughFreeFromMillSplitAB - prcB 기본값 사용: PRC[3]={prcB}");
            }

            return true;
        }

        private static void EnsureTwoPhaseSplitGuideLine(double splitX)
        {
            try
            {
                if (Document == null || Document.LatheMachineSetup == null)
                {
                    return;
                }

                FeatureChain existing = FindFeatureChainByName("TwoPhaseSplitLine");
                if (existing != null)
                {
                    return;
                }

                Layer layer = GetOrCreateLayer("TwoPhaseGuides");
                if (layer != null)
                {
                    Document.ActiveLayer = layer;
                }

                double radius = (Document.LatheMachineSetup.BarDiameter + 10.0) / 2.0;
                Point pTop = Document.GetPoint(splitX, radius, 0);
                Point pBottom = Document.GetPoint(splitX, -radius, 0);
                FeatureChain line = Document.FeatureChains.Add(pTop);
                line.Add(Document.GetSegment(pTop, pBottom));
                line.Name = "TwoPhaseSplitLine";
                DentalLogger.Log($"TwoPhaseSplitGuideLine - splitX:{splitX:0.###} 생성 완료");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"TwoPhaseSplitGuideLine 생성 실패: {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static string GetEnvString(string key)
        {
            try
            {
                return Environment.GetEnvironmentVariable(key);
            }
            catch
            {
                return null;
            }
        }

        private static double? GetEnvDoubleNullable(string key)
        {
            string raw = GetEnvString(key);
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            if (double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out double v))
            {
                return v;
            }

            return null;
        }

        private static FreeFormFeature FindFreeFormFeatureByName(string name)
        {
            try
            {
                if (Document?.FreeFormFeatures == null)
                {
                    return null;
                }

                int count = Document.FreeFormFeatures.Count;
                for (int i = 1; i <= count; i++)
                {
                    FreeFormFeature ff = Document.FreeFormFeatures[i];
                    if (ff != null && string.Equals(ff.Name, name, StringComparison.OrdinalIgnoreCase))
                    {
                        return ff;
                    }
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"FindFreeFormFeatureByName({name}) 실패: {ex.GetType().Name}:{ex.Message}");
            }
            return null;
        }

        private static FeatureChain FindFeatureChainByName(string name)
        {
            try
            {
                if (Document?.FeatureChains == null)
                {
                    return null;
                }

                foreach (FeatureChain fc in Document.FeatureChains)
                {
                    if (fc != null && string.Equals(fc.Name, name, StringComparison.OrdinalIgnoreCase))
                    {
                        return fc;
                    }
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"FindFeatureChainByName({name}) 실패: {ex.GetType().Name}:{ex.Message}");
            }
            return null;
        }

        private static int SafeParseKey(string key)
        {
            if (int.TryParse(key, NumberStyles.Integer, CultureInfo.InvariantCulture, out int result))
            {
                return result;
            }
            return 0;
        }

        private static FeatureChain EnsureRectBoundary(string name, double x1, double x2, double yTop, double yBottom)
        {
            string targetName = name;

            // 기존 동일 이름 체인이 있으면 재사용하지 않고 삭제 후 재생성한다.
            // (이전 실행에서 남은 비정상/비직사각형 체인이 split 경계를 왜곡하는 것을 방지)
            FeatureChain existing = FindFeatureChainByName(name);
            if (existing != null)
            {
                try
                {
                    // 일부 ESPRIT interop에서 FeatureChain.Delete()가 노출되지 않으므로
                    // GraphicsCollection.Remove(key) 방식으로 삭제한다.
                    int existingKey = SafeParseKey(Convert.ToString(existing.Key, CultureInfo.InvariantCulture));
                    if (existingKey > 0 && Document?.GraphicsCollection != null)
                    {
                        Document.GraphicsCollection.Remove(existingKey);
                        DentalLogger.Log($"EnsureRectBoundary({name}) - 기존 체인 제거 후 재생성 (Key:{existingKey})");
                    }
                    else
                    {
                        targetName = name + "_" + DateTime.Now.ToString("HHmmssfff", CultureInfo.InvariantCulture);
                        DentalLogger.Log($"EnsureRectBoundary({name}) - 기존 체인 key 파싱 실패/GraphicsCollection 접근 불가, 새 이름으로 생성: {targetName}");
                    }
                }
                catch (Exception ex)
                {
                    // 제거 실패 시에도 새 체인을 만들기 위해 이름 충돌을 피한다.
                    targetName = name + "_" + DateTime.Now.ToString("HHmmssfff", CultureInfo.InvariantCulture);
                    DentalLogger.Log($"EnsureRectBoundary({name}) - 기존 체인 제거 실패({ex.GetType().Name}:{ex.Message}), 새 이름으로 생성: {targetName}");
                }
            }

            try
            {
                double xLeft = Math.Min(x1, x2);
                double xRight = Math.Max(x1, x2);
                double yUpper = Math.Max(yTop, yBottom);
                double yLower = Math.Min(yTop, yBottom);

                if (Math.Abs(xRight - xLeft) < 1e-6)
                {
                    xRight = xLeft + 1e-6;
                }
                if (Math.Abs(yUpper - yLower) < 1e-6)
                {
                    yUpper = yLower + 1e-6;
                }

                Point p1 = Document.GetPoint(xLeft, yUpper, 0);
                Point p2 = Document.GetPoint(xLeft, yLower, 0);
                Point p3 = Document.GetPoint(xRight, yLower, 0);
                Point p4 = Document.GetPoint(xRight, yUpper, 0);

                FeatureChain fc = Document.FeatureChains.Add(p1);
                fc.Add(Document.GetSegment(p1, p2));
                fc.Add(Document.GetSegment(p2, p3));
                fc.Add(Document.GetSegment(p3, p4));
                fc.Add(Document.GetSegment(p4, p1));
                fc.Name = targetName;

                DentalLogger.Log($"EnsureRectBoundary({targetName}) 생성 - X[{xLeft:0.###}~{xRight:0.###}], Y[{yLower:0.###}~{yUpper:0.###}]");
                return fc;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"EnsureRectBoundary({name}) 실패: {ex.GetType().Name}:{ex.Message}");
                return null;
            }
        }
    }
}
