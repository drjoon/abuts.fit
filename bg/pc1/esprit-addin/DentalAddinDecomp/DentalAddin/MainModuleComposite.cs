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
                // 기본값 정책
                // - A: 0.0
                // - B: 0.0
                // - C(B-Extension): 0.05
                if (label != null && label.Trim().Length > 0 && label.Trim().StartsWith("B-Extension", StringComparison.OrdinalIgnoreCase))
                {
                    stockAllowance = 0.05;
                }
                else if (label != null && label.Trim().Length > 0 && label.Trim().StartsWith("B", StringComparison.OrdinalIgnoreCase))
                {
                    stockAllowance = 0.0;
                }
                else if (label != null && label.Trim().Length > 0 && label.Trim().StartsWith("A", StringComparison.OrdinalIgnoreCase))
                {
                    stockAllowance = 0.0;
                }
                else
                {
                    DentalLogger.Log($"Composite2SplitAB - {label} StockAllowance 기본값 대상 아님 - 적용 생략");
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

        private static void TryDisableCompositeDynamicIfRequested(TechLatheMill5xComposite op, string label)
        {
            if (op == null)
            {
                return;
            }

            string disableRaw = GetEnvString("ABUTS_COMPOSITE_DYNAMIC_DISABLE");
            bool disable = string.Equals(disableRaw, "1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(disableRaw, "true", StringComparison.OrdinalIgnoreCase);
            if (!disable)
            {
                return;
            }

            try
            {
                // ESPRIT 버전에 따라 속성명이 다를 수 있으므로 반사적으로 시도한다.
                op.GetType().InvokeMember("Dynamic", BindingFlags.SetProperty, null, op, new object[] { false }, CultureInfo.InvariantCulture);
                DentalLogger.Log($"Composite2SplitAB - {label} Dynamic=false 적용 (env=ABUTS_COMPOSITE_DYNAMIC_DISABLE)");
            }
            catch
            {
                try
                {
                    op.GetType().InvokeMember("DynamicUpdate", BindingFlags.SetProperty, null, op, new object[] { false }, CultureInfo.InvariantCulture);
                    DentalLogger.Log($"Composite2SplitAB - {label} DynamicUpdate=false 적용 (env=ABUTS_COMPOSITE_DYNAMIC_DISABLE)");
                }
                catch (Exception ex)
                {
                    DentalLogger.Log($"Composite2SplitAB - {label} Dynamic 비활성화 미지원/실패: {ex.GetType().Name}:{ex.Message}");
                }
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

            // Last(우측 끝) 기본값은 원계산(raw)을 사용한다.
            // 필요 시에만 env로 상한 클램프를 건다: ABUTS_COMPOSITE_STARTEND_SAFE_LAST_PERCENT
            // (예: 60.98). env 미지정이면 클램프하지 않는다.
            double effectiveLastPercent = lastPercent;
            double effectiveBaseBackPercent = baseBackPercent;
            bool startEndOverflowGuardApplied = false;
            double? safeLastPercentOpt = GetEnvDoubleNullable("ABUTS_COMPOSITE_STARTEND_SAFE_LAST_PERCENT");
            if (safeLastPercentOpt.HasValue)
            {
                double safeLastPercent = Clamp(safeLastPercentOpt.Value, firstPercent + 0.5, 100.0);
                if (lastPercent > safeLastPercent + 1e-6)
                {
                    effectiveLastPercent = safeLastPercent;
                    // B-Extension 폭(약 0.5%)을 유지하도록 커넥션 시작점을 안전 상한 바로 좌측으로 재배치한다.
                    effectiveBaseBackPercent = Clamp(effectiveLastPercent - 0.5, firstPercent, effectiveLastPercent);
                    startEndOverflowGuardApplied = true;
                    DentalLogger.Log($"Composite2SplitAB - StartEnd 안전클램프 적용: rawLast={lastPercent:F2}, safeLast={effectiveLastPercent:F2}, rawBaseBack={baseBackPercent:F2}, safeBaseBack={effectiveBaseBackPercent:F2}, env=ABUTS_COMPOSITE_STARTEND_SAFE_LAST_PERCENT");
                }
            }

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


            double splitPercent = Clamp(splitRatio * 100.0, firstPercent, effectiveLastPercent);

            // StartEndPosition에서 B 시작 퍼센트가 높아지면(실측: ~38%) NC 계산 중 크래시 가능성이 높다.
            // 성공 케이스(약 25%)를 기준으로 기본 상한을 둔다. 필요 시 env로 조정 가능.
            // env: ABUTS_COMPOSITE_STARTEND_SAFE_B_FIRST_MAX (default: 30.0)
            // // 향기로운치과 이인용-41 케이스에서 36까지는 괜찮고 37에서 크래시 발생
            double safeBFirstMax = 35; //GetEnvDoubleNullable("ABUTS_COMPOSITE_STARTEND_SAFE_B_FIRST_MAX") ?? 30.0;
            safeBFirstMax = Clamp(safeBFirstMax, firstPercent + 0.1, effectiveLastPercent - 0.1);
            bool startEndBFirstGuardApplied = false;

            DentalLogger.Log($"Composite2SplitAB - enabled=1, splitX={splitX:F3}, prcA={prcA}, prcB={prcB}");

            if (Math.Abs(splitPercent - firstPercent) < 0.01 || Math.Abs(effectiveLastPercent - splitPercent) < 0.01)
            {
                DentalLogger.Log($"Composite2SplitAB - SplitPercent 범위가 너무 작음 (First={firstPercent:F2}, Split={splitPercent:F2}, Last={effectiveLastPercent:F2}), Split 건너뜀");
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

            DentalLogger.Log($"Composite2SplitAB - 시작: FrontPointX={MoveSTL_Module.FrontPointX:F3}, BackPointX={MoveSTL_Module.BackPointX:F3}, FinishLineTopZ={MoveSTL_Module.FinishLineTopZ:F3}, SurfaceNumber={SurfaceNumber}, ToolNs='{ToolNs ?? ""}'");

            opA.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
            // B는 A 오른쪽 구간부터 커넥션까지를 정확히 공간 기준으로 가공해야 하므로
            // Start/End 위치 기반 비율을 사용한다.
            opB.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
            double? firstPassPercentOverride = TryGetCompositeFirstPassPercentOverride();
            if (firstPassPercentOverride.HasValue)
            {
                opA.FirstPassPercent = Clamp(firstPassPercentOverride.Value, 0.0, splitPercent);
            }

            const double seamEpsilonPercent = 0.05;

            // B 시작 퍼센트 상한(안전값) 적용
            double splitPercentForA = splitPercent;
            double bFirst = splitPercent;
            if (effectiveLastPercent - splitPercent > seamEpsilonPercent * 2.0)
            {
                bFirst = Clamp(splitPercent + seamEpsilonPercent, firstPercent, effectiveLastPercent);
            }
            if (bFirst > safeBFirstMax + 1e-6)
            {
                bFirst = safeBFirstMax;
                splitPercentForA = Clamp(bFirst - seamEpsilonPercent, firstPercent, effectiveLastPercent);
                startEndBFirstGuardApplied = true;
                DentalLogger.Log($"Composite2SplitAB - B 시작 안전클램프 적용: rawSplit={splitPercent:F2}, rawBFirst={splitPercent + seamEpsilonPercent:F2}, safeBFirst={bFirst:F2}, safeSplitForA={splitPercentForA:F2}, env=ABUTS_COMPOSITE_STARTEND_SAFE_B_FIRST_MAX");
            }

            opA.LastPassPercent = splitPercentForA;
            opB.FirstPassPercent = bFirst;
            opB.LastPassPercent = effectiveLastPercent;

            // C(B-Extension) 기본 활성.
            // 필요 시 env(ABUTS_COMPOSITE_B_EXTENSION_ENABLE=0|false)로만 비활성화한다.
            string bExtEnableRaw = GetEnvString("ABUTS_COMPOSITE_B_EXTENSION_ENABLE");
            bool bExtensionEnabled = string.IsNullOrWhiteSpace(bExtEnableRaw)
                || string.Equals(bExtEnableRaw, "1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(bExtEnableRaw, "true", StringComparison.OrdinalIgnoreCase);

            bool hasRightExtensionSegmentCandidate = rightOffset > 0.0 && effectiveLastPercent - effectiveBaseBackPercent > 0.01;
            bool hasRightExtensionSegment = bExtensionEnabled && hasRightExtensionSegmentCandidate;
            double extensionStartPercent = Clamp(effectiveBaseBackPercent, splitPercent, effectiveLastPercent);

            // 요청사항: B와 C(B-Extension)가 닿는 경계를 1피치(=rightOffset 비율) 왼쪽으로 이동.
            // rightOffset(mm) -> pass-percent 변환: (rightOffset / 20.0) * 100.0
            double onePitchPercent = Math.Abs(rightOffset) / 20.0 * 100.0;
            double extensionContactPercent = Clamp(extensionStartPercent - onePitchPercent, splitPercent, effectiveLastPercent);

            if (hasRightExtensionSegment)
            {
                double bLast = extensionContactPercent;
                if (extensionContactPercent - opB.FirstPassPercent > seamEpsilonPercent * 2.0)
                {
                    bLast = Clamp(extensionContactPercent - seamEpsilonPercent, opB.FirstPassPercent, effectiveLastPercent);
                }
                opB.LastPassPercent = bLast;
            }
            else if (hasRightExtensionSegmentCandidate)
            {
                // Extension을 비활성화한 경우, B가 우측 끝(Last)까지 직접 진입하지 않도록
                // extension 시작점 직전에서 종료시켜 NC 계산 안정성을 높인다.
                double safeBLastWithoutExt = extensionContactPercent;
                if (extensionContactPercent - opB.FirstPassPercent > seamEpsilonPercent * 2.0)
                {
                    safeBLastWithoutExt = Clamp(extensionContactPercent - seamEpsilonPercent, opB.FirstPassPercent, effectiveLastPercent);
                }
                opB.LastPassPercent = safeBLastWithoutExt;
                DentalLogger.Log($"Composite2SplitAB - B-Extension 비활성(env). B.Last를 안전구간으로 제한: rawLast={effectiveLastPercent:F2} -> safeLast={opB.LastPassPercent:F2} (extRange={extensionStartPercent:F2}->{effectiveLastPercent:F2}, env=ABUTS_COMPOSITE_B_EXTENSION_ENABLE, raw='{bExtEnableRaw ?? ""}')");
            }

            DentalLogger.Log($"Composite2SplitAB - seam 보정: A.Last={opA.LastPassPercent:F2}, B.First={opB.FirstPassPercent:F2}, B.Last={opB.LastPassPercent:F2}, seamEps={seamEpsilonPercent:F2}, BFirstGuard={startEndBFirstGuardApplied}");

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

            // [중요] B ToolID 방어
            // - 증상: opB Add는 성공해도, NC 계산/저장 단계에서 크래시가 재현될 수 있음.
            // - 원인 후보: PRC_B의 ToolID 공백.
            // - 조치: B ToolID가 비면 A ToolID(우선) 또는 ToolNs로 보정하고 로그를 남긴다.
            if (string.IsNullOrWhiteSpace(opB.ToolID))
            {
                if (!string.IsNullOrWhiteSpace(opA.ToolID))
                {
                    opB.ToolID = opA.ToolID;
                    DentalLogger.Log($"Composite2SplitAB - B ToolID 비어있음, A ToolID로 보정: {opB.ToolID}");
                }
                else if (!string.IsNullOrWhiteSpace(ToolNs))
                {
                    opB.ToolID = ToolNs;
                    DentalLogger.Log($"Composite2SplitAB - B ToolID 비어있음, ToolNs로 보정: {opB.ToolID}");
                }
                else
                {
                    DentalLogger.Log("Composite2SplitAB 중단 - B ToolID가 비어있고 보정 소스(A ToolID/ToolNs)도 없습니다.");
                    return false;
                }
            }

            DentalLogger.Log($"Composite2SplitAB - PassPercent: A({opA.FirstPassPercent:F2}->{opA.LastPassPercent:F2}), B-Base({opB.FirstPassPercent:F2}->{opB.LastPassPercent:F2}), B-ExtEnabled={hasRightExtensionSegment}, B-ExtStart={extensionStartPercent:F2}, B-CContact={extensionContactPercent:F2}, Shift1Pitch={onePitchPercent:F2}, Last(raw={lastPercent:F2}/eff={effectiveLastPercent:F2}), LastGuard={startEndOverflowGuardApplied}, BFirstGuard={startEndBFirstGuardApplied}");

            // 포스트/NC 단계 안정화 목적: 기본은 Single-A(전체 구간) 모드.
            // AB 분할이 필요한 경우에만 env로 비활성화할 수 있다.
            // env: ABUTS_COMPOSITE_SINGLE_A_ENABLE (default=true)
            string singleARaw = GetEnvString("ABUTS_COMPOSITE_SINGLE_A_ENABLE");
            bool singleAEnabled = string.IsNullOrWhiteSpace(singleARaw)
                || string.Equals(singleARaw, "1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(singleARaw, "true", StringComparison.OrdinalIgnoreCase);

            if (singleAEnabled)
            {
                // 요청사항: Single-A에서도 C(B-Extension)가 사용될 때는
                // C 구간만큼 A 끝을 줄여 겹침을 방지한다.
                double singleALastPassPercent = effectiveLastPercent;
                if (hasRightExtensionSegment)
                {
                    singleALastPassPercent = opB.LastPassPercent;
                }
                opA.LastPassPercent = singleALastPassPercent;
                DentalLogger.Log($"Composite2SplitAB - Single-A 모드 적용: A({opA.FirstPassPercent:F2}->{opA.LastPassPercent:F2}), B 기본 Add 생략, C사용={hasRightExtensionSegment}, env=ABUTS_COMPOSITE_SINGLE_A_ENABLE(raw='{singleARaw ?? ""}')");

                DentalLogger.Log("Composite2SplitAB - Single-A StepIncrement/StockAllowance 적용 시작");
                TrySetCompositeStepIncrement(opA, "A");
                TrySetCompositeStockAllowance(opA, "A");
                DentalLogger.Log("Composite2SplitAB - Single-A StepIncrement/StockAllowance 적용 완료");

                int beforeAddCountSingle = Document?.Operations?.Count ?? -1;
                DentalLogger.Log($"Composite2SplitAB - Single-A Operation 추가 시작 (beforeCount={beforeAddCountSingle})");
                TryDisableCompositeDynamicIfRequested(opA, "A:Single");
                TryAddOperation(opA, freeFormFeature, "Composite2SplitAB:A:Single", false);
                int afterASingle = Document?.Operations?.Count ?? -1;
                DentalLogger.Log($"Composite2SplitAB - Single-A Operation 추가 완료: A (afterCount={afterASingle})");

                // 요청사항: Single-A에서도 C(B-Extension) 생성 가능해야 한다.
                if (hasRightExtensionSegment)
                {
                    DentalLogger.Log("Composite2SplitAB - Single-A 경로에서 B-Extension 준비 시작");
                    ITechnology[] techBExtSingle = TryOpenProcess(technologyUtility, prcB, "Composite2SplitAB:A:Single:B:Extension");
                    TechLatheMill5xComposite opBExtensionSingle = null;
                    if (techBExtSingle.Length > 0)
                    {
                        opBExtensionSingle = techBExtSingle[0] as TechLatheMill5xComposite;
                    }

                    if (opBExtensionSingle == null)
                    {
                        DentalLogger.Log("Composite2SplitAB - Single-A B-Extension PRC 로드/캐스팅 실패");
                    }
                    else
                    {
                        opBExtensionSingle.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
                        double bExtFirstSingle = extensionContactPercent;
                        if (effectiveLastPercent - extensionContactPercent > seamEpsilonPercent * 2.0)
                        {
                            bExtFirstSingle = Clamp(extensionContactPercent + seamEpsilonPercent, firstPercent, effectiveLastPercent);
                        }
                        opBExtensionSingle.FirstPassPercent = bExtFirstSingle;
                        opBExtensionSingle.LastPassPercent = effectiveLastPercent;
                        opBExtensionSingle.DriveSurface = opA.DriveSurface;
                        opBExtensionSingle.ToolID = !string.IsNullOrWhiteSpace(opA.ToolID) ? opA.ToolID : ToolNs;
                        TrySetCompositeStockAllowance(opBExtensionSingle, "B-Extension");
                        try
                        {
                            TryDisableCompositeDynamicIfRequested(opBExtensionSingle, "B-Extension:Single");
                            TryAddOperation(opBExtensionSingle, freeFormFeature, "Composite2SplitAB:A:Single:B:Extension", false);
                            int afterBExtSingle = Document?.Operations?.Count ?? -1;
                            DentalLogger.Log($"Composite2SplitAB - Single-A 경로 B-Extension 추가 완료 (afterCount={afterBExtSingle})");
                        }
                        catch (Exception exBExtSingle)
                        {
                            DentalLogger.Log($"Composite2SplitAB - Single-A 경로 B-Extension Add 실패(비치명): {exBExtSingle.GetType().Name}:{exBExtSingle.Message}");
                            DentalLogger.LogException("Composite2SplitAB:A:Single:B:Extension:Add", exBExtSingle);
                        }
                    }
                }

                int finalCountSingle = Document?.Operations?.Count ?? -1;
                DentalLogger.Log($"Composite2SplitAB - 종료(single-A, finalCount={finalCountSingle})");
                return true;
            }

            // [중요] StockAllowance 적용 범위
            // - 과거 장애: A만 적용하고 B 적용이 누락되면, B 활성화 시 후속 NC 단계 불안정 가능.
            // - 원칙: A/B 모두 명시적으로 적용(또는 미적용 사유 로그)한다.
            DentalLogger.Log("Composite2SplitAB - opA/opB StepIncrement/StockAllowance 적용 시작");
            TrySetCompositeStepIncrement(opA, "A");
            TrySetCompositeStepIncrement(opB, "B");
            TrySetCompositeStockAllowance(opA, "A");
            TrySetCompositeStockAllowance(opB, "B");
            DentalLogger.Log("Composite2SplitAB - opA/opB StepIncrement/StockAllowance 적용 완료");

            int beforeAddCount = Document?.Operations?.Count ?? -1;
            DentalLogger.Log($"Composite2SplitAB - Operation 추가 시작 (beforeCount={beforeAddCount})");

            // 공정 순서 정책: A(선행) → B(후행)
            TryDisableCompositeDynamicIfRequested(opA, "A");
            TryAddOperation(opA, freeFormFeature, "Composite2SplitAB:A", false);
            int afterA = Document?.Operations?.Count ?? -1;
            DentalLogger.Log($"Composite2SplitAB - Operation 추가 완료: A (afterCount={afterA})");

            // A/B 모드에서도 C(B-Extension) 사용.
            TryDisableCompositeDynamicIfRequested(opB, "B");
            TryAddOperation(opB, freeFormFeature, "Composite2SplitAB:B", false);
            int afterB = Document?.Operations?.Count ?? -1;
            DentalLogger.Log($"Composite2SplitAB - Operation 추가 완료: B (afterCount={afterB})");

            // C(B-Extension) 활성
            if (hasRightExtensionSegment)
            {
                DentalLogger.Log("Composite2SplitAB - B-Extension 준비 시작");
                ITechnology[] techBExt = TryOpenProcess(technologyUtility, prcB, "Composite2SplitAB:B:Extension");
                TechLatheMill5xComposite opBExtension = null;
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
                    // B-Extension은 커넥션 시작점에서 1피치(+rightOffset)만 추가 가공해야 하므로
                    // Start/End 위치 기반 비율을 사용한다.
                    opBExtension.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
                    double bExtFirst = extensionContactPercent;
                    if (effectiveLastPercent - extensionContactPercent > seamEpsilonPercent * 2.0)
                    {
                        bExtFirst = Clamp(extensionContactPercent + seamEpsilonPercent, firstPercent, effectiveLastPercent);
                    }
                    opBExtension.FirstPassPercent = bExtFirst;
                    opBExtension.LastPassPercent = effectiveLastPercent;
                    opBExtension.DriveSurface = opA.DriveSurface;
                    opBExtension.ToolID = !string.IsNullOrWhiteSpace(opB.ToolID) ? opB.ToolID : opA.ToolID;
                    TrySetCompositeStockAllowance(opBExtension, "B-Extension");
                    try
                    {
                        TryDisableCompositeDynamicIfRequested(opBExtension, "B-Extension");
                        TryAddOperation(opBExtension, freeFormFeature, "Composite2SplitAB:B:Extension", false);
                        int afterBExt = Document?.Operations?.Count ?? -1;
                        DentalLogger.Log($"Composite2SplitAB - Operation 추가 완료: B-Extension (afterCount={afterBExt})");
                    }
                    catch (Exception extAddEx)
                    {
                        DentalLogger.Log($"Composite2SplitAB - B-Extension Add 실패(비치명): {extAddEx.GetType().Name}:{extAddEx.Message}");
                        DentalLogger.LogException("Composite2SplitAB:B:Extension:Add", extAddEx);
                    }
                }
            }

            int finalCount = Document?.Operations?.Count ?? -1;
            DentalLogger.Log($"Composite2SplitAB - 종료 (finalCount={finalCount})");
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



        private static void TryAddOperation(object technology, IGraphicObject graphicObject, string context, object addOption = null)
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

            object option = addOption ?? Missing.Value;

            try
            {
                int beforeCount = Document?.Operations?.Count ?? -1;
                DentalLogger.Log($"TryAddOperation:{context} - Add 호출 전 (beforeCount={beforeCount}, techType={castTechnology.GetType().Name}, graphicType={graphicObject.GetType().Name}, option={(option == Missing.Value ? "Missing" : option)})");
                Document.Operations.Add(castTechnology, graphicObject, RuntimeHelpers.GetObjectValue(option));
                int afterCount = Document?.Operations?.Count ?? -1;
                DentalLogger.Log($"TryAddOperation:{context} - Add 호출 성공 (afterCount={afterCount})");
            }
            catch (Exception ex)
            {
                // option=false 등 비기본 옵션에서 실패하면 기본 옵션(Missing)으로 1회 재시도
                if (option != Missing.Value)
                {
                    try
                    {
                        DentalLogger.Log($"TryAddOperation:{context} - Add 재시도(option=Missing), firstErr={ex.GetType().Name}:{ex.Message}");
                        Document.Operations.Add(castTechnology, graphicObject, RuntimeHelpers.GetObjectValue(Missing.Value));
                        int afterRetry = Document?.Operations?.Count ?? -1;
                        DentalLogger.Log($"TryAddOperation:{context} - Add 재시도 성공 (afterCount={afterRetry})");
                        return;
                    }
                    catch (Exception retryEx)
                    {
                        DentalLogger.Log($"TryAddOperation:{context} - Add 재시도 실패: {retryEx.GetType().Name}:{retryEx.Message}");
                        DentalLogger.LogException("MainModule.TryAddOperation.Retry", retryEx);
                        throw;
                    }
                }

                DentalLogger.Log($"TryAddOperation:{context} - Document.Operations.Add 실패: {ex.GetType().Name}:{ex.Message}");
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
                DentalLogger.Log("RoughFreeFromMillSplitAB - TryGetSplitABConfig=false, SplitAB 비활성으로 기존 RoughFreeFromMill 경로 사용");
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
            // Turn_A/Turn_B와 동일 기준으로 finishline 기준 오프셋을 맞춘다.
            // Rough A는 finishline보다 0.5mm 왼쪽에서 종료,
            // Rough B는 finishline보다 2.5mm 왼쪽에서 시작 (겹침 허용)
            double roughAEnd = splitX - 0.5;
            double roughBStart = splitX - 2.5;
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

            // 요청 반영: FinishLine 기반 splitX에서 1.0mm 왼쪽으로 이동한 값을 defaultSplit으로 사용한다.
            // (값이 비정상/계산 불가일 때만 midpoint fallback)
            double defaultSplit;
            string defaultSplitSource;
            if (MoveSTL_Module.FinishLineTopZ > 0.001)
            {
                double stlShift = AppConfig.DefaultStlShift;
                double finishLineDistanceFromBack = MoveSTL_Module.FinishLineTopZ - stlShift;
                double frontBeforeShift = MoveSTL_Module.FrontPointX - stlShift;
                double backBeforeShift = MoveSTL_Module.BackPointX - stlShift;
                double spanBeforeShift = backBeforeShift - frontBeforeShift;
                double absSpanBeforeShift = Math.Abs(spanBeforeShift);
                if (absSpanBeforeShift < 1e-6)
                {
                    defaultSplit = (xMin + xMax) / 2.0;
                    defaultSplitSource = "midpoint-fallback(span~0)";
                }
                else
                {
                    double finishLinePositionBeforeShift = backBeforeShift - finishLineDistanceFromBack;
                    double finishLineSplitX = finishLinePositionBeforeShift + stlShift;
                    defaultSplit = finishLineSplitX - 1.0;
                    defaultSplitSource = "finishline-splitX-minus-1.0";
                }
            }
            else
            {
                defaultSplit = (xMin + xMax) / 2.0;
                defaultSplitSource = "midpoint-fallback(no-finishline)";
            }

            // TwoPhase split도 작업 영역으로 클램프한다.
            defaultSplit = Math.Max(xMin + 0.01, Math.Min(xMax - 0.01, defaultSplit));

            double? configured = GetEnvDoubleNullable(AppConfig.TwoPhaseSplitXEnv) ?? GetEnvDoubleNullable("ABUTS_ROUGHFREEFORM_SPLIT_X");
            splitX = configured ?? defaultSplit;

            bool anyConfigured = configured.HasValue || !string.IsNullOrWhiteSpace(prcA) || !string.IsNullOrWhiteSpace(prcB);
            DentalLogger.Log($"RoughFreeFromMillSplitAB Config - explicitEnable={explicitEnable}, splitEnableEnv='{enabled ?? ""}', twoPhaseEnableEnv='{twoPhaseEnabled ?? ""}', configuredSplitX={(configured.HasValue ? configured.Value.ToString("0.###", CultureInfo.InvariantCulture) : "null")}, defaultSplit={defaultSplit.ToString("0.###", CultureInfo.InvariantCulture)}, defaultSplitSource={defaultSplitSource}, xRange=[{xMin.ToString("0.###", CultureInfo.InvariantCulture)}~{xMax.ToString("0.###", CultureInfo.InvariantCulture)}], prcASet={!string.IsNullOrWhiteSpace(prcA)}, prcBSet={!string.IsNullOrWhiteSpace(prcB)}");
            if (!explicitEnable && !anyConfigured)
            {
                DentalLogger.Log("RoughFreeFromMillSplitAB Config - explicitEnable/anyConfigured 모두 false, SplitAB 미적용");
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
            // 안전성 우선:
            // A/B TwoPhase 실행 중 이미 Operation에서 참조 중인 Boundary 체인을 삭제하면
            // ESPRIT COM이 불안정해질 수 있으므로, 동일 이름 체인이 있으면 재사용한다.
            FeatureChain existing = FindFeatureChainByName(name);
            if (existing != null)
            {
                int existingKey = SafeParseKey(Convert.ToString(existing.Key, CultureInfo.InvariantCulture));
                DentalLogger.Log($"EnsureRectBoundary({name}) - 기존 체인 재사용 (Key:{existingKey})");
                return existing;
            }

            string targetName = name;

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
