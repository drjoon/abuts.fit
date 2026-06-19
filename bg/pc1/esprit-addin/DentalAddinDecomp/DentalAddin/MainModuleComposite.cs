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

            string newAOnlyRaw = GetEnvString("ABUTS_COMPOSITE_NEWA_ONLY");
            bool newAOnlyMode = string.Equals(newAOnlyRaw, "1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(newAOnlyRaw, "true", StringComparison.OrdinalIgnoreCase);
            string newAPreAddedRaw = GetEnvString("ABUTS_COMPOSITE_NEWA_PRE_ADDED");
            bool newAPreAdded = string.Equals(newAPreAddedRaw, "1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(newAPreAddedRaw, "true", StringComparison.OrdinalIgnoreCase);
            bool newAAddedThisCall = false;
            if (DisableCompositeNewA && newAOnlyMode)
            {
                DentalLogger.Log("Composite2SplitAB - NewAOnly 요청이나 DisableCompositeNewA=true 이므로 NewA 생성 없이 종료");
                return true;
            }

            const double leftRatio = AppConfig.DefaultLeftRatio;
            double rightOffset = AppConfig.DefaultRightRatioOffset;
            double turnConnectionBoundaryX = ResolveTurnConnectionBoundaryX("Composite2SplitAB");
            double backXForComposite = turnConnectionBoundaryX + rightOffset;
            double baseBackRatio = turnConnectionBoundaryX / 20.0;
            double rightRatio = backXForComposite / 20.0;
            // D(B-Extension) 끝점은 Turn 경계 클램프와 분리해 물리 우측 꼬리(BackPointX+rightOffset) 기준으로 사용한다.
            double physicalBackXForExtension = MoveSTL_Module.BackPointX + rightOffset;
            double physicalRightRatioForExtension = physicalBackXForExtension / 20.0;
            rightRatio = Clamp(rightRatio, leftRatio, 1.0);
            physicalRightRatioForExtension = Clamp(physicalRightRatioForExtension, leftRatio, 1.0);
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
            double extensionRawLastPercent = Clamp(physicalRightRatioForExtension * 100.0, firstPercent, 100.0);

            // Last(우측 끝) 기본값은 원계산(raw)을 사용한다.
            // 필요 시에만 env로 상한 클램프를 건다: ABUTS_COMPOSITE_STARTEND_SAFE_LAST_PERCENT
            // (예: 60.98). env 미지정이면 클램프하지 않는다.
            double effectiveLastPercent = lastPercent;
            double effectiveBaseBackPercent = baseBackPercent;
            double extensionEffectiveLastPercent = extensionRawLastPercent;
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
                    DentalLogger.Log($"Composite2SplitAB - StartEnd 안전클램프 적용: rawLast={lastPercent:F2}, safeLast={effectiveLastPercent:F2}, rawBaseBack={baseBackPercent:F2}, safeBaseBack={effectiveBaseBackPercent:F2}, extLast(raw/eff)={extensionRawLastPercent:F2}/{extensionEffectiveLastPercent:F2}, env=ABUTS_COMPOSITE_STARTEND_SAFE_LAST_PERCENT");
                }
            }

            // 정책: ABUTS_COMPOSITE_SPLIT_X와 무관하게 A/B 경계 공식(FinishLineTopZ 역산식)을 우선 사용한다.
            // env splitX는 FinishLineTopZ가 없을 때에만 fallback으로 사용한다.
            double splitRatio;
            double envSplitX = splitX;
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
                    splitRatio = leftRatio + (rightRatio - leftRatio) * 0.27;
                    splitX = MoveSTL_Module.FrontPointX + splitRatio * direction * absSpan;
                    splitRatio = Clamp(splitRatio, leftRatio, rightRatio);
                    DentalLogger.Log($"Composite2SplitAB - FinishLine 기반 계산 불가(span~0), 기본 27% fallback splitX={splitX:F3}");
                }
                else
                {
                    double finishLinePositionBeforeShift = backBeforeShift - finishLineDistanceFromBack;
                    splitX = finishLinePositionBeforeShift + stlShift;
                    splitRatio = (finishLinePositionBeforeShift - frontBeforeShift) / absSpanBeforeShift;
                    splitRatio = Clamp(splitRatio, leftRatio, rightRatio);
                    DentalLogger.Log($"Composite2SplitAB - A/B 공식 splitX={splitX:F3} (ratio={splitRatio:F3}, finishLinePos={finishLinePositionBeforeShift:F3}, distFromBack={finishLineDistanceFromBack:F3}, envSplitXIgnored={(envSplitX > 0.001 ? envSplitX.ToString("F3", CultureInfo.InvariantCulture) : "none")})");
                }
            }
            else if (envSplitX > 0.001)
            {
                splitRatio = (envSplitX - MoveSTL_Module.FrontPointX) / (direction * absSpan);
                if (double.IsNaN(splitRatio) || double.IsInfinity(splitRatio))
                {
                    splitRatio = leftRatio + (rightRatio - leftRatio) * 0.27;
                    splitX = MoveSTL_Module.FrontPointX + splitRatio * direction * absSpan;
                }
                else
                {
                    splitX = envSplitX;
                }
                splitRatio = Clamp(splitRatio, leftRatio, rightRatio);
                DentalLogger.Log($"Composite2SplitAB - FinishLineTopZ 없음, env splitX fallback={splitX:F3} (ratio={splitRatio:F3})");
            }
            else
            {
                splitRatio = leftRatio + (rightRatio - leftRatio) * 0.27;
                splitX = MoveSTL_Module.FrontPointX + splitRatio * direction * absSpan;
                splitRatio = Clamp(splitRatio, leftRatio, rightRatio);
                DentalLogger.Log($"Composite2SplitAB - 기본 계산 splitX={splitX:F3} (27% 지점, FinishLineTopZ/envSplitX 없음)");
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

            bool splitDegenerate = Math.Abs(splitPercent - firstPercent) < 0.01 || Math.Abs(effectiveLastPercent - splitPercent) < 0.01;
            if (splitDegenerate)
            {
                // 중요: 여기서 false를 반환하면 caller가 Composite2 단일 경로(A만)로 fallback 되어
                // C(B-Extension)가 누락될 수 있다. 따라서 SplitAB 경로를 유지한 채 Single-A(+C)로 degrade한다.
                DentalLogger.Log($"Composite2SplitAB - SplitPercent 범위가 작음(First={firstPercent:F2}, Split={splitPercent:F2}, Last={effectiveLastPercent:F2}). SplitAB 중단 대신 Single-A(+C) degrade로 계속 진행");
                splitPercent = firstPercent;
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

            DentalLogger.Log($"Composite2SplitAB - 시작: FrontPointX={MoveSTL_Module.FrontPointX:F3}, BackPointX={MoveSTL_Module.BackPointX:F3}, TurnConnBoundaryX={turnConnectionBoundaryX:F3}, FinishLineX={MoveSTL_Module.FinishLineX:F3}, FinishLineTopZ={MoveSTL_Module.FinishLineTopZ:F3}, SurfaceNumber={SurfaceNumber}, ToolNs='{ToolNs ?? ""}'");

            opA.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
            // B는 A 오른쪽 구간부터 커넥션까지를 정확히 공간 기준으로 가공해야 하므로
            // Start/End 위치 기반 비율을 사용한다.
            opB.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
            double? firstPassPercentOverride = TryGetCompositeFirstPassPercentOverride();
            double baseAFirstPercent = firstPassPercentOverride.HasValue
                ? Clamp(firstPassPercentOverride.Value, 0.0, splitPercent)
                : firstPercent;

            const double seamEpsilonPercent = 0.05;
            const double compositeBcdBoundaryShiftMm = 0.3; // 요청사항: B/C 종료 +0.3mm

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

            bool hasRightExtensionSegmentCandidate = rightOffset > 0.0 && extensionEffectiveLastPercent - effectiveBaseBackPercent > 0.01;
            bool hasRightExtensionSegment = bExtensionEnabled && hasRightExtensionSegmentCandidate;
            double extensionStartPercent = Clamp(effectiveBaseBackPercent, splitPercent, extensionEffectiveLastPercent);

            // 요청사항: B와 C(B-Extension)가 닿는 경계를 1피치(=rightOffset 비율) 왼쪽으로 이동.
            // rightOffset(mm) -> pass-percent 변환: (rightOffset / 20.0) * 100.0
            double onePitchPercent = Math.Abs(rightOffset) / 20.0 * 100.0;
            double extensionContactPercent = Clamp(extensionStartPercent - onePitchPercent, splitPercent, extensionEffectiveLastPercent);

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

            // A 시작점 정책:
            // - 기존(치아번호/기본값) first-pass를 기본으로 삼고,
            // - 사용자 요청에 따라 Front Face 우측 끝보다 0.1mm 좌측 지점을 우선 적용한다.
            opA.FirstPassPercent = Clamp(baseAFirstPercent, 0.0, opA.LastPassPercent);
            if (TryResolveCompositeAFirstPassPercentByFrontFace(opA.LastPassPercent, out double aFirstByFacePercent, out double aStartX))
            {
                opA.FirstPassPercent = aFirstByFacePercent;
                DentalLogger.Log($"Composite2SplitAB - A 시작점(FrontFace-0.4) 적용: StartX={aStartX:F3}, FirstPass={opA.FirstPassPercent:F2}, LastPass={opA.LastPassPercent:F2}");
            }
            else
            {
                DentalLogger.Log($"Composite2SplitAB - A 시작점 계산 실패, 기본 FirstPass 사용: {opA.FirstPassPercent:F2}");
            }

            // 요청사항: Composite B(=opA) 종료, C(=opB) 종료를 현재 위치 +0.3mm로 이동
            double bLastBeforeShift = opA.LastPassPercent;
            opA.LastPassPercent = ShiftPassPercentByXOffsetMm(
                opA.LastPassPercent,
                compositeBcdBoundaryShiftMm,
                opA.FirstPassPercent,
                effectiveLastPercent,
                MoveSTL_Module.FrontPointX,
                direction,
                absSpan);

            double cLastBeforeShift = opB.LastPassPercent;
            opB.LastPassPercent = ShiftPassPercentByXOffsetMm(
                opB.LastPassPercent,
                compositeBcdBoundaryShiftMm,
                opB.FirstPassPercent,
                effectiveLastPercent,
                MoveSTL_Module.FrontPointX,
                direction,
                absSpan);

            DentalLogger.Log($"Composite2SplitAB - B/C 종료 +0.3mm 적용: B.Last {bLastBeforeShift:F2}->{opA.LastPassPercent:F2}, C.Last {cLastBeforeShift:F2}->{opB.LastPassPercent:F2}");
            DentalLogger.Log($"Composite2SplitAB - seam 보정: A({opA.FirstPassPercent:F2}->{opA.LastPassPercent:F2}), B({opB.FirstPassPercent:F2}->{opB.LastPassPercent:F2}), seamEps={seamEpsilonPercent:F2}, BFirstGuard={startEndBFirstGuardApplied}");

            bool surfaceReady = TryEnsureCompositeSurfaceNumber("Composite2SplitAB");
            opA.DriveSurface = "19," + Conversions.ToString(SurfaceNumber);
            opB.DriveSurface = opA.DriveSurface;
            if (!surfaceReady)
            {
                DentalLogger.Log($"Composite2SplitAB - SurfaceNumber 보정 실패 상태에서 진행 (DriveSurface='{opA.DriveSurface}')");
            }

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
                // 요청사항: Single-A에서도 Composite B(=opA) 종료를 +0.3mm 이동
                double singleBLastBeforeShift = opA.LastPassPercent;
                opA.LastPassPercent = ShiftPassPercentByXOffsetMm(
                    opA.LastPassPercent,
                    compositeBcdBoundaryShiftMm,
                    opA.FirstPassPercent,
                    effectiveLastPercent,
                    MoveSTL_Module.FrontPointX,
                    direction,
                    absSpan);
                if (TryResolveCompositeAFirstPassPercentByFrontFace(opA.LastPassPercent, out double singleAFirstByFacePercent, out double singleAStartX))
                {
                    opA.FirstPassPercent = singleAFirstByFacePercent;
                    DentalLogger.Log($"Composite2SplitAB - Single-A 시작점(FrontFace-0.4) 적용: StartX={singleAStartX:F3}, FirstPass={opA.FirstPassPercent:F2}, LastPass={opA.LastPassPercent:F2}");
                }
                else
                {
                    opA.FirstPassPercent = Clamp(opA.FirstPassPercent, 0.0, opA.LastPassPercent);
                }
                DentalLogger.Log($"Composite2SplitAB - Single-A 모드 적용: A({opA.FirstPassPercent:F2}->{opA.LastPassPercent:F2}), B기준종료+0.3mm({singleBLastBeforeShift:F2}->{opA.LastPassPercent:F2}), B 기본 Add 생략, C사용={hasRightExtensionSegment}, env=ABUTS_COMPOSITE_SINGLE_A_ENABLE(raw='{singleARaw ?? ""}')");

                DentalLogger.Log("Composite2SplitAB - Single-A StepIncrement/StockAllowance 적용 시작");
                TrySetCompositeStepIncrement(opA, "A");
                TrySetCompositeStockAllowance(opA, "A");
                DentalLogger.Log("Composite2SplitAB - Single-A StepIncrement/StockAllowance 적용 완료");

                // 신규 A 추가: Front Face 구간과 Composite B(opB) 구간의 겹치는 영역만 가공
                if (!DisableCompositeNewA && !newAPreAdded)
                {
                    if (TryResolveCompositeNewALeftRange(opB.FirstPassPercent, opB.LastPassPercent, out double newAFirstSingle, out double newALastSingle))
                    {
                        ITechnology[] techANewSingle = TryOpenProcess(technologyUtility, prcA, "Composite2SplitAB:A:Single:NewA");
                        TechLatheMill5xComposite opANewSingle = null;
                        if (techANewSingle.Length > 0)
                        {
                            opANewSingle = techANewSingle[0] as TechLatheMill5xComposite;
                        }

                        if (opANewSingle != null)
                        {
                            opANewSingle.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
                            opANewSingle.FirstPassPercent = newAFirstSingle;
                            opANewSingle.LastPassPercent = newALastSingle;
                            opANewSingle.DriveSurface = opA.DriveSurface;
                            opANewSingle.ToolID = !string.IsNullOrWhiteSpace(opA.ToolID) ? opA.ToolID : ToolNs;
                            TrySetCompositeStepIncrement(opANewSingle, "A");
                            TrySetCompositeStockAllowance(opANewSingle, "A");

                            int beforeAddNewASingle = Document?.Operations?.Count ?? -1;
                            TryDisableCompositeDynamicIfRequested(opANewSingle, "A-New:Single");
                            TryAddOperation(opANewSingle, freeFormFeature, "Composite2SplitAB:A:Single:NewA", false);
                            TryAppendCompositeSuffixToNewOperations(beforeAddNewASingle, "A-New");
                            int afterAddNewASingle = Document?.Operations?.Count ?? -1;
                            DentalLogger.Log($"Composite2SplitAB - Single-A 경로 신규 A 추가 완료: A({newAFirstSingle:F2}->{newALastSingle:F2}) (afterCount={afterAddNewASingle})");
                            newAAddedThisCall = true;
                        }
                        else
                        {
                            DentalLogger.Log("Composite2SplitAB - Single-A 경로 신규 A PRC 로드/캐스팅 실패");
                        }
                    }
                    else
                    {
                        DentalLogger.Log($"Composite2SplitAB - Single-A 경로 신규 A 범위 계산 실패/폭 부족 (base={opA.FirstPassPercent:F2}->{opA.LastPassPercent:F2})");
                    }
                }
                else
                {
                    DentalLogger.Log("Composite2SplitAB - Single-A 경로 신규 A 비활성화(DisableCompositeNewA=true)로 생성 생략");
                }

                if (newAOnlyMode)
                {
                    if (newAAddedThisCall)
                    {
                        try { Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_NEWA_PRE_ADDED", "1"); } catch { }
                    }
                    DentalLogger.Log($"Composite2SplitAB - NewAOnly 모드 종료(single-A). added={newAAddedThisCall}, preAdded={newAPreAdded}");
                    return true;
                }

                int beforeAddCountSingle = Document?.Operations?.Count ?? -1;
                DentalLogger.Log($"Composite2SplitAB - Single-A Operation 추가 시작 (beforeCount={beforeAddCountSingle})");
                TryDisableCompositeDynamicIfRequested(opA, "A:Single");
                TryAddOperation(opA, freeFormFeature, "Composite2SplitAB:A:Single", false);
                TryAppendCompositeSuffixToNewOperations(beforeAddCountSingle, "A");
                int afterASingle = Document?.Operations?.Count ?? -1;
                DentalLogger.Log($"Composite2SplitAB - Single-A Operation 추가 완료: B(기존 A) (afterCount={afterASingle})");

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
                        // 요청사항: D는 B/C 끝점에서 시작(겹침 방지)
                        // Single-A 경로에서는 선행 공정 B가 opA이므로 D 시작을 opA.Last에 맞춘다.
                        double dFirstBeforeShiftSingle = bExtFirstSingle;
                        opBExtensionSingle.FirstPassPercent = Clamp(opA.LastPassPercent, firstPercent, extensionEffectiveLastPercent);
                        opBExtensionSingle.LastPassPercent = extensionEffectiveLastPercent;
                        opBExtensionSingle.DriveSurface = opA.DriveSurface;
                        opBExtensionSingle.ToolID = !string.IsNullOrWhiteSpace(opA.ToolID) ? opA.ToolID : ToolNs;
                        TrySetCompositeStockAllowance(opBExtensionSingle, "B-Extension");
                        try
                        {
                            int beforeBExtSingle = Document?.Operations?.Count ?? -1;
                            TryDisableCompositeDynamicIfRequested(opBExtensionSingle, "B-Extension:Single");
                            TryAddOperation(opBExtensionSingle, freeFormFeature, "Composite2SplitAB:A:Single:B:Extension", false);
                            TryAppendCompositeSuffixToNewOperations(beforeBExtSingle, "B-Extension");
                            int afterBExtSingle = Document?.Operations?.Count ?? -1;
                            DentalLogger.Log($"Composite2SplitAB - Single-A 경로 B-Extension 추가 완료 (D.Start=B.End: {dFirstBeforeShiftSingle:F2}->{opBExtensionSingle.FirstPassPercent:F2}, afterCount={afterBExtSingle})");
                        }
                        catch (Exception exBExtSingle)
                        {
                            DentalLogger.Log($"Composite2SplitAB - Single-A 경로 B-Extension Add 실패(비치명): {exBExtSingle.GetType().Name}:{exBExtSingle.Message}");
                            DentalLogger.LogException("Composite2SplitAB:A:Single:B:Extension:Add", exBExtSingle);
                        }
                    }
                }

                int finalCountSingle = Document?.Operations?.Count ?? -1;
                if (newAAddedThisCall)
                {
                    try { Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_NEWA_PRE_ADDED", "1"); } catch { }
                }
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

            // 신규 A 추가: Front Face 구간과 Composite B(opB) 구간의 겹치는 영역만 가공
            if (!DisableCompositeNewA && !newAPreAdded && !newAAddedThisCall)
            {
                if (TryResolveCompositeNewALeftRange(opB.FirstPassPercent, opB.LastPassPercent, out double newAFirst, out double newALast))
                {
                    ITechnology[] techANew = TryOpenProcess(technologyUtility, prcA, "Composite2SplitAB:NewA");
                    TechLatheMill5xComposite opANew = null;
                    if (techANew.Length > 0)
                    {
                        opANew = techANew[0] as TechLatheMill5xComposite;
                    }

                    if (opANew != null)
                    {
                        opANew.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
                        opANew.FirstPassPercent = newAFirst;
                        opANew.LastPassPercent = newALast;
                        opANew.DriveSurface = opA.DriveSurface;
                        opANew.ToolID = !string.IsNullOrWhiteSpace(opA.ToolID) ? opA.ToolID : ToolNs;
                        TrySetCompositeStepIncrement(opANew, "A");
                        TrySetCompositeStockAllowance(opANew, "A");

                        int beforeAddNewA = Document?.Operations?.Count ?? -1;
                        TryDisableCompositeDynamicIfRequested(opANew, "A-New");
                        TryAddOperation(opANew, freeFormFeature, "Composite2SplitAB:NewA", false);
                        TryAppendCompositeSuffixToNewOperations(beforeAddNewA, "A-New");
                        int afterNewA = Document?.Operations?.Count ?? -1;
                        DentalLogger.Log($"Composite2SplitAB - 신규 A 추가 완료: A({newAFirst:F2}->{newALast:F2}) (afterCount={afterNewA})");
                        newAAddedThisCall = true;
                    }
                    else
                    {
                        DentalLogger.Log("Composite2SplitAB - 신규 A PRC 로드/캐스팅 실패");
                    }
                }
                else
                {
                    DentalLogger.Log($"Composite2SplitAB - 신규 A 범위 계산 실패/폭 부족 (base={opA.FirstPassPercent:F2}->{opA.LastPassPercent:F2})");
                }
            }
            else
            {
                DentalLogger.Log("Composite2SplitAB - 신규 A 비활성화(DisableCompositeNewA=true)로 생성 생략");
            }

            if (newAOnlyMode)
            {
                if (newAAddedThisCall)
                {
                    try { Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_NEWA_PRE_ADDED", "1"); } catch { }
                }
                DentalLogger.Log($"Composite2SplitAB - NewAOnly 모드 종료(AB). added={newAAddedThisCall}, preAdded={newAPreAdded}");
                return true;
            }

            // 공정 순서 정책: NewA(신규 A) → A(기존, 현재 B) → B(기존, 현재 C)
            int beforeAddCountBaseA = Document?.Operations?.Count ?? -1;
            TryDisableCompositeDynamicIfRequested(opA, "A");
            TryAddOperation(opA, freeFormFeature, "Composite2SplitAB:A", false);
            TryAppendCompositeSuffixToNewOperations(beforeAddCountBaseA, "A");
            int afterA = Document?.Operations?.Count ?? -1;
            DentalLogger.Log($"Composite2SplitAB - Operation 추가 완료: B(기존 A) (afterCount={afterA})");

            // A/B 모드에서도 C(B-Extension) 사용.
            int beforeAddCountB = Document?.Operations?.Count ?? -1;
            TryDisableCompositeDynamicIfRequested(opB, "B");
            TryAddOperation(opB, freeFormFeature, "Composite2SplitAB:B", false);
            TryAppendCompositeSuffixToNewOperations(beforeAddCountB, "B");
            int afterB = Document?.Operations?.Count ?? -1;
            DentalLogger.Log($"Composite2SplitAB - Operation 추가 완료: C(기존 B) (afterCount={afterB})");

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
                    // 요청사항: D는 B/C 끝점에서 시작(겹침 방지)
                    // AB 경로에서는 선행 공정 C가 opB이므로 D 시작을 opB.Last에 맞춘다.
                    double dFirstBeforeShift = bExtFirst;
                    opBExtension.FirstPassPercent = Clamp(opB.LastPassPercent, firstPercent, extensionEffectiveLastPercent);
                    opBExtension.LastPassPercent = extensionEffectiveLastPercent;
                    opBExtension.DriveSurface = opA.DriveSurface;
                    opBExtension.ToolID = !string.IsNullOrWhiteSpace(opB.ToolID) ? opB.ToolID : opA.ToolID;
                    TrySetCompositeStockAllowance(opBExtension, "B-Extension");
                    try
                    {
                        int beforeBExt = Document?.Operations?.Count ?? -1;
                        TryDisableCompositeDynamicIfRequested(opBExtension, "B-Extension");
                        TryAddOperation(opBExtension, freeFormFeature, "Composite2SplitAB:B:Extension", false);
                        TryAppendCompositeSuffixToNewOperations(beforeBExt, "B-Extension");
                        int afterBExt = Document?.Operations?.Count ?? -1;
                        DentalLogger.Log($"Composite2SplitAB - Operation 추가 완료: B-Extension (D.Start=C.End: {dFirstBeforeShift:F2}->{opBExtension.FirstPassPercent:F2}, afterCount={afterBExt})");
                    }
                    catch (Exception extAddEx)
                    {
                        DentalLogger.Log($"Composite2SplitAB - B-Extension Add 실패(비치명): {extAddEx.GetType().Name}:{extAddEx.Message}");
                        DentalLogger.LogException("Composite2SplitAB:B:Extension:Add", extAddEx);
                    }
                }
            }

            int finalCount = Document?.Operations?.Count ?? -1;
            if (newAAddedThisCall)
            {
                try { Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_NEWA_PRE_ADDED", "1"); } catch { }
            }
            DentalLogger.Log($"Composite2SplitAB - 종료 (finalCount={finalCount})");
            return true;
        }

        private static bool TryEnsureCompositeSurfaceNumber(string context)
        {
            try
            {
                if (SurfaceNumber > 0)
                {
                    return true;
                }

                if (Document?.GraphicsCollection == null)
                {
                    DentalLogger.Log($"{context} - SurfaceNumber 보정 실패: GraphicsCollection null");
                    return false;
                }

                int count = Document.GraphicsCollection.Count;
                for (int i = count; i >= 1; i--)
                {
                    GraphicObject graphicObject = null;
                    try { graphicObject = (GraphicObject)Document.GraphicsCollection[i]; } catch { }
                    if (graphicObject == null)
                    {
                        continue;
                    }

                    if (graphicObject.GraphicObjectType != espGraphicObjectType.espSurface)
                    {
                        continue;
                    }

                    int key = SafeParseKey(Convert.ToString(graphicObject.Key, CultureInfo.InvariantCulture));
                    if (key <= 0)
                    {
                        continue;
                    }

                    SurfaceNumber = key;
                    DentalLogger.Log($"{context} - SurfaceNumber 자동 보정: {SurfaceNumber} (graphicIndex={i})");
                    return true;
                }

                DentalLogger.Log($"{context} - SurfaceNumber 자동 보정 실패: surface graphic 미발견");
                return false;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"{context} - SurfaceNumber 자동 보정 예외: {ex.GetType().Name}:{ex.Message}");
                return false;
            }
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

        // Front Face 고정 절삭 깊이(mm)
        // 사용자 요청: Front Face는 % 개념이 아니라 절대 깊이 1.0mm로 가공한다.
        private const double FrontFaceFixedDepthMm = 1.0;

        // Face(EM2_0BALL) 안전가드 상수:
        // Rough_A 우측 끝보다 Face 우측 끝이 우측으로 더 나가면 공구 파손 위험이 있어,
        // 최소 0.3mm의 선행 절삭 여유를 강제한다.
        private const double FaceRightGuardMinGapMm = 0.3;

        // Rough_A 우측 종료 오프셋(기존 TwoPhase Rough 로직과 동일)
        // roughAEnd = splitX - 0.5mm
        private const double RoughAEndOffsetFromSplitMm = 0.5;

        // 사용자 요청: 5axis_Composite A 시작점은 Front Face 우측 끝과 0.4mm 겹치도록 설정
        // (Front Face가 기본 1.0mm 또는 Rough 안전가드로 더 얕아진 경우를 모두 반영)
        private const double CompositeAStartLeftFromFrontFaceMm = 0.4;

        // NewA 계산 시 Face∩B가 점으로 수렴하면 NewA가 사라질 수 있어,
        // seam 근처에서 Front 내부 방향으로 최소 폭 fallback을 부여한다.
        private const double CompositeNewASeamFallbackWidthMm = 0.15;

        // 사용자 요청: 5axis_Composite_A(NewA) 툴패스 비활성화
        // true면 NewA 생성 경로를 전부 건너뛴다.
        private const bool DisableCompositeNewA = true;

        // 사용자 요청: 신규 5Axis_Composite_A 범위는 Face 시작점~Face 끝점과 동일

        /// <summary>
        /// TwoPhase Rough_A의 우측 끝(X) 좌표를 기존 Rough 분할 규칙과 동일하게 계산한다.
        /// 실패 시 false를 반환하며 caller는 Face 보정을 건너뛴다.
        /// </summary>
        private static bool TryGetRoughARightEndX(out double roughARightEndX, out double splitXUsed)
        {
            roughARightEndX = 0.0;
            splitXUsed = 0.0;

            try
            {
                string prcA;
                string prcB;
                if (!TryGetSplitABConfig(out double splitX, out prcA, out prcB))
                {
                    DentalLogger.Log("FaceRoughGuard - SplitAB 설정 미활성/부족으로 Rough_A 우측 끝 계산 생략");
                    return false;
                }

                double frontBackMin = Math.Min(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);
                double xMin = Math.Min(0.0, frontBackMin);
                double xMax = Math.Max(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);

                splitXUsed = Clamp(splitX, xMin + 1e-6, xMax - 1e-6);

                double roughAEnd = splitXUsed - RoughAEndOffsetFromSplitMm;
                roughAEnd = Clamp(roughAEnd, xMin + 1e-6, xMax - 1e-6);

                roughARightEndX = roughAEnd;
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"FaceRoughGuard - Rough_A 우측 끝 계산 실패: {ex.GetType().Name}:{ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Front Face(ParallelPlanes) 가공 깊이를 고정 1.0mm로 적용한다.
        /// - RL=1: BottomZLimit = -(FrontPointX + depth)
        /// - RL=2: BottomZLimit = +(FrontPointX - depth)
        /// 주의: 이 설정 이후에 Rough 안전가드(TryApplyFaceRightEndGuard)가 추가 보정할 수 있다.
        /// </summary>
        private static void ApplyFrontFaceFixedDepth(TechLatheMoldParallelPlanes faceOp, string context)
        {
            if (faceOp == null)
            {
                return;
            }

            try
            {
                double oldTop = faceOp.TopZLimit;
                double oldBottom = faceOp.BottomZLimit;

                if (RL == 1.0)
                {
                    faceOp.TopZLimit = 1.0;
                    faceOp.BottomZLimit = -1.0 * (MoveSTL_Module.FrontPointX + FrontFaceFixedDepthMm);
                }
                else if (RL == 2.0)
                {
                    faceOp.BottomZLimit = 1.0 * (MoveSTL_Module.FrontPointX - FrontFaceFixedDepthMm);
                    faceOp.TopZLimit = 1.0;
                }
                else
                {
                    // RL 비정상 값은 기존 default 흐름을 해치지 않기 위해 RL=1 기준으로 처리
                    faceOp.TopZLimit = 1.0;
                    faceOp.BottomZLimit = -1.0 * (MoveSTL_Module.FrontPointX + FrontFaceFixedDepthMm);
                    DentalLogger.Log($"FrontFaceDepth[{context}] - RL 비정상({RL}), RL=1 기준으로 적용");
                }

                double faceRightX = (RL == 1.0) ? -faceOp.BottomZLimit : faceOp.BottomZLimit;
                DentalLogger.Log($"FrontFaceDepth[{context}] - 고정깊이 적용: depth={FrontFaceFixedDepthMm:F3}mm, TopZ:{oldTop:F3}->{faceOp.TopZLimit:F3}, BottomZ:{oldBottom:F3}->{faceOp.BottomZLimit:F3}, Face.RightX={faceRightX:F3}");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"FrontFaceDepth[{context}] - 적용 실패: {ex.GetType().Name}:{ex.Message}");
            }
        }

        /// <summary>
        /// Face(ParallelPlanes)의 우측 끝을 Rough_A 우측 끝 기준으로 안전 보정한다.
        /// 규칙: (Rough_A.RightX - Face.RightX) < 0.3mm 이면 Face.RightX = Rough_A.RightX - 0.3mm 로 조정.
        /// </summary>
        private static bool TryApplyFaceRightEndGuard(TechLatheMoldParallelPlanes faceOp, string context)
        {
            if (faceOp == null)
            {
                return false;
            }

            if (!TryGetRoughARightEndX(out double roughARightX, out double splitXUsed))
            {
                return false;
            }

            try
            {
                // 현재 Face 우측 끝(X) 해석:
                // RL=1: BottomZLimit 부호가 반대(-X), RL=2: BottomZLimit이 곧 X.
                double currentFaceRightX = (RL == 1.0) ? -faceOp.BottomZLimit : faceOp.BottomZLimit;
                if (double.IsNaN(currentFaceRightX) || double.IsInfinity(currentFaceRightX))
                {
                    DentalLogger.Log($"FaceRoughGuard[{context}] - Face.RightX 해석 실패(BottomZLimit={faceOp.BottomZLimit})");
                    return false;
                }

                double currentGap = roughARightX - currentFaceRightX;
                if (currentGap >= FaceRightGuardMinGapMm)
                {
                    DentalLogger.Log($"FaceRoughGuard[{context}] - 유지 (gap={currentGap:F3}mm >= {FaceRightGuardMinGapMm:F3}mm, RoughA.RightX={roughARightX:F3}, Face.RightX={currentFaceRightX:F3}, splitX={splitXUsed:F3})");
                    return false;
                }

                double adjustedFaceRightX = roughARightX - FaceRightGuardMinGapMm;
                double oldBottom = faceOp.BottomZLimit;
                faceOp.BottomZLimit = (RL == 1.0) ? -adjustedFaceRightX : adjustedFaceRightX;

                DentalLogger.Log($"FaceRoughGuard[{context}] - 보정 적용 (RoughA.RightX={roughARightX:F3}, Face.RightX:{currentFaceRightX:F3}->{adjustedFaceRightX:F3}, gap:{currentGap:F3}->{FaceRightGuardMinGapMm:F3}, BottomZLimit:{oldBottom:F3}->{faceOp.BottomZLimit:F3}, splitX={splitXUsed:F3})");
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"FaceRoughGuard[{context}] - 보정 실패: {ex.GetType().Name}:{ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Front Face 최종 우측 끝(X)을 추정한다.
        /// - 기본: FrontPointX + 1.0mm
        /// - TwoPhase Rough 안전가드가 더 엄격하면: RoughA.RightX - 0.3mm
        /// </summary>
        private static double ResolveFrontFaceRightXForCompositeStart()
        {
            double faceRightX = MoveSTL_Module.FrontPointX + FrontFaceFixedDepthMm;

            if (TryGetRoughARightEndX(out double roughARightX, out double _))
            {
                double guardedFaceRightX = roughARightX - FaceRightGuardMinGapMm;
                if (guardedFaceRightX < faceRightX)
                {
                    faceRightX = guardedFaceRightX;
                }
            }

            return faceRightX;
        }

        /// <summary>
        /// 사용자 요청 반영:
        /// Composite A 시작점(X) = Front Face 우측 끝(X) - 0.4mm
        /// 반환값은 Start/End pass-percent(0~100) 기준이다.
        /// </summary>
        private static bool TryResolveCompositeAFirstPassPercentByFrontFace(double maxPercent, out double firstPassPercent, out double targetStartX)
        {
            firstPassPercent = 0.0;
            targetStartX = 0.0;

            try
            {
                double span = MoveSTL_Module.BackPointX - MoveSTL_Module.FrontPointX;
                double absSpan = Math.Abs(span);
                if (absSpan < 1e-6)
                {
                    return false;
                }

                double direction = span >= 0 ? 1.0 : -1.0;
                double faceRightX = ResolveFrontFaceRightXForCompositeStart();
                // 안전조건: Composite A 시작점은 X<0으로 내려가지 않도록 하한을 0.0으로 고정
                targetStartX = Math.Max(0.0, faceRightX - CompositeAStartLeftFromFrontFaceMm);

                double ratio = (targetStartX - MoveSTL_Module.FrontPointX) / (direction * absSpan);
                if (double.IsNaN(ratio) || double.IsInfinity(ratio))
                {
                    return false;
                }

                firstPassPercent = Clamp(ratio * 100.0, 0.0, Math.Max(0.0, maxPercent));
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static string ResolveCompositeSuffixFromLabel(string label)
        {
            if (string.IsNullOrWhiteSpace(label))
            {
                return null;
            }

            string normalized = label.Trim();

            // 신규 구분 정책:
            // - New A (Face 시작~끝 범위): A
            // - 기존 A                    : B
            // - 기존 B                    : C
            // - 기존 B-Extension          : D
            if (normalized.StartsWith("A-New", StringComparison.OrdinalIgnoreCase))
            {
                return "A";
            }
            if (normalized.StartsWith("B-Extension", StringComparison.OrdinalIgnoreCase))
            {
                return "D";
            }
            if (normalized.StartsWith("A", StringComparison.OrdinalIgnoreCase))
            {
                return "B";
            }
            if (normalized.StartsWith("B", StringComparison.OrdinalIgnoreCase))
            {
                return "C";
            }

            return null;
        }

        private static void TryAppendCompositeSuffixToNewOperations(int startCount, string label)
        {
            string suffix = ResolveCompositeSuffixFromLabel(label);
            if (string.IsNullOrWhiteSpace(suffix) || Document?.Operations == null)
            {
                return;
            }

            try
            {
                int end = Document.Operations.Count;
                for (int i = Math.Max(1, startCount + 1); i <= end; i++)
                {
                    object op = null;
                    try { op = Document.Operations[i]; } catch { }
                    if (op == null)
                    {
                        continue;
                    }

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

                    string baseName = string.IsNullOrWhiteSpace(oldName) ? "5Axis_Composite" : oldName.Trim();
                    string newName;
                    if (baseName.StartsWith("5Axis_Composite", StringComparison.OrdinalIgnoreCase))
                    {
                        newName = $"5Axis_Composite_{suffix}";
                    }
                    else if (baseName.EndsWith($"_{suffix}", StringComparison.OrdinalIgnoreCase))
                    {
                        newName = baseName;
                    }
                    else
                    {
                        newName = $"{baseName}_{suffix}";
                    }

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

                    DentalLogger.Log($"Composite2SplitAB - 이름 접미사 적용({label}): '{baseName}' -> '{newName}'");
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitAB - 이름 접미사 적용 실패({label}): {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static bool TryResolveCompositeNewALeftRange(double compositeBFirstPercent, double compositeBLastPercent, out double newAFirstPercent, out double newALastPercent)
        {
            newAFirstPercent = 0.0;
            newALastPercent = 0.0;

            try
            {
                double span = MoveSTL_Module.BackPointX - MoveSTL_Module.FrontPointX;
                double absSpan = Math.Abs(span);
                if (absSpan < 1e-6)
                {
                    return false;
                }

                double direction = span >= 0 ? 1.0 : -1.0;
                double faceStartX = MoveSTL_Module.FrontPointX;
                double faceRightX = ResolveFrontFaceRightXForCompositeStart();

                // 중요: 화면에서 보이는 FrontFace 툴패스 유효 끝을 기준으로 교집합을 계산한다.
                // (형상 경계(faceRightX) 그대로 쓰면 A가 Front 우측으로 과확장되어 보일 수 있음)
                // FrontFace와 동일 기준으로 0.4mm를 빼서 pass-end를 맞춘다.
                double facePassEndX = faceRightX - direction * CompositeAStartLeftFromFrontFaceMm;
                if (direction > 0)
                {
                    facePassEndX = Clamp(facePassEndX, faceStartX, faceRightX);
                }
                else
                {
                    facePassEndX = Clamp(facePassEndX, faceRightX, faceStartX);
                }

                double startRatio = (faceStartX - MoveSTL_Module.FrontPointX) / (direction * absSpan);
                double endRatio = (facePassEndX - MoveSTL_Module.FrontPointX) / (direction * absSpan);
                if (double.IsNaN(startRatio) || double.IsInfinity(startRatio) || double.IsNaN(endRatio) || double.IsInfinity(endRatio))
                {
                    return false;
                }

                // Front Face 구간(%): [faceMin, faceMax]
                double faceStartPercent = startRatio * 100.0;
                double faceEndPercent = endRatio * 100.0;
                double faceMin = Math.Min(faceStartPercent, faceEndPercent);
                double faceMax = Math.Max(faceStartPercent, faceEndPercent);

                // Composite B(opB) 구간(%): [srcMin, srcMax]
                double srcMin = Math.Min(compositeBFirstPercent, compositeBLastPercent);
                double srcMax = Math.Max(compositeBFirstPercent, compositeBLastPercent);

                // 요청사항: Composite A(NewA)는 Front Face와 Composite B의 교집합만 가공
                double overlapMin = Math.Max(faceMin, srcMin);
                double overlapMax = Math.Min(faceMax, srcMax);

                // 완전 비겹침(서로 떨어져 있음)인 경우에는 fallback을 만들지 않는다.
                if (overlapMax < overlapMin - 0.01)
                {
                    DentalLogger.Log($"Composite2SplitAB - NewA overlap 없음(완전 비겹침): face=[{faceMin:F2},{faceMax:F2}], B=[{srcMin:F2},{srcMax:F2}], overlap=[{overlapMin:F2},{overlapMax:F2}]");
                    return false;
                }

                if (overlapMax - overlapMin <= 0.01)
                {
                    // 교집합이 점으로 수렴하는 경우(예: faceMax == srcMin),
                    // NewA가 완전히 사라지지 않도록 seam 직전 Front 내부에 최소 폭 fallback 적용
                    double fallbackWidthPercent = CompositeNewASeamFallbackWidthMm / absSpan * 100.0;
                    if (!double.IsNaN(fallbackWidthPercent) && !double.IsInfinity(fallbackWidthPercent) && fallbackWidthPercent > 0.01)
                    {
                        double seamPercent = Clamp(srcMin, faceMin, faceMax);
                        double fallbackFirst = Clamp(seamPercent - fallbackWidthPercent, faceMin, seamPercent);
                        double fallbackLast = seamPercent;
                        if (fallbackLast - fallbackFirst > 0.01)
                        {
                            newAFirstPercent = Clamp(fallbackFirst, 0.0, 100.0);
                            newALastPercent = Clamp(fallbackLast, newAFirstPercent, 100.0);
                            DentalLogger.Log($"Composite2SplitAB - NewA overlap 점수렴 fallback 적용: face=[{faceMin:F2},{faceMax:F2}], B=[{srcMin:F2},{srcMax:F2}], seam={seamPercent:F2}, fallback=[{newAFirstPercent:F2},{newALastPercent:F2}], widthMm={CompositeNewASeamFallbackWidthMm:F2}");
                            return true;
                        }
                    }

                    DentalLogger.Log($"Composite2SplitAB - NewA overlap 미소: face=[{faceMin:F2},{faceMax:F2}], B=[{srcMin:F2},{srcMax:F2}], overlap=[{overlapMin:F2},{overlapMax:F2}]");
                    return false;
                }

                newAFirstPercent = Clamp(overlapMin, 0.0, 100.0);
                newALastPercent = Clamp(overlapMax, newAFirstPercent, 100.0);
                DentalLogger.Log($"Composite2SplitAB - NewA overlap 적용: face=[{faceMin:F2},{faceMax:F2}], B=[{srcMin:F2},{srcMax:F2}], overlap=[{newAFirstPercent:F2},{newALastPercent:F2}]");
                return newALastPercent - newAFirstPercent > 0.01;
            }
            catch
            {
                return false;
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
            double xMaxPhysical = Math.Max(MoveSTL_Module.FrontPointX, MoveSTL_Module.BackPointX);
            if (!(splitX > xMin && splitX < xMaxPhysical))
            {
                DentalLogger.Log($"RoughFreeFromMillSplitAB - splitX 범위 오류 (splitX:{splitX:0.###}, xMin:{xMin:0.###}, xMaxPhysical:{xMaxPhysical:0.###})");
                return true;
            }

            // Turn_B와 동일 기준의 Connection 경계까지만 Rough_B 우측 끝을 제한한다.
            double turnConnectionBoundaryX = ResolveTurnConnectionBoundaryX("RoughFreeFromMillSplitAB");
            double xMax = Clamp(turnConnectionBoundaryX, xMin + 1e-6, xMaxPhysical);

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
            DentalLogger.Log($"RoughFreeFromMillSplitAB - splitX:{splitX:0.###}, roughAEnd:{roughAEnd:0.###}, roughBStart:{roughBStart:0.###}, xMaxBoundary:{xMax:0.###}, xMaxPhysical:{xMaxPhysical:0.###}, AKey:{keyA}, BKey:{keyB}, PRC_A:{prcA}, PRC_B:{prcB}");

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

            // 요청 반영:
            // TwoPhase split은 ABUTS_COMPOSITE_SPLIT_X(env)와 무관하게,
            // Composite A/B 경계 계산식(FinishLineTopZ 역산식)을 그대로 사용한다.
            // 1순위: FinishLineTopZ 기반 공식
            // 2순위: midpoint fallback
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
                    defaultSplit = finishLineSplitX;
                    defaultSplitSource = "finishline-splitX(formula)";
                }
            }
            else
            {
                defaultSplit = (xMin + xMax) / 2.0;
                defaultSplitSource = "midpoint-fallback(no-finishline)";
            }

            // TwoPhase split도 작업 영역으로 클램프한다.
            defaultSplit = Math.Max(xMin + 0.5, Math.Min(xMax - 0.5, defaultSplit));

            double? configured = GetEnvDoubleNullable(AppConfig.TwoPhaseSplitXEnv) ?? GetEnvDoubleNullable("ABUTS_ROUGHFREEFORM_SPLIT_X");
            splitX = configured ?? defaultSplit;

            bool anyConfigured = configured.HasValue
                || !string.IsNullOrWhiteSpace(prcA)
                || !string.IsNullOrWhiteSpace(prcB);
            DentalLogger.Log($"RoughFreeFromMillSplitAB Config - explicitEnable={explicitEnable}, splitEnableEnv='{enabled ?? ""}', twoPhaseEnableEnv='{twoPhaseEnabled ?? ""}', configuredSplitX={(configured.HasValue ? configured.Value.ToString("0.###", CultureInfo.InvariantCulture) : "null")}, compositeSplitX=ignored, defaultSplit={defaultSplit.ToString("0.###", CultureInfo.InvariantCulture)}, defaultSplitSource={defaultSplitSource}, selectedSplitX={splitX.ToString("0.###", CultureInfo.InvariantCulture)}, xRange=[{xMin.ToString("0.###", CultureInfo.InvariantCulture)}~{xMax.ToString("0.###", CultureInfo.InvariantCulture)}], prcASet={!string.IsNullOrWhiteSpace(prcA)}, prcBSet={!string.IsNullOrWhiteSpace(prcB)}");
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

        private static double ShiftPassPercentByXOffsetMm(
            double passPercent,
            double offsetMm,
            double minPercent,
            double maxPercent,
            double frontX,
            double direction,
            double absSpan)
        {
            if (double.IsNaN(passPercent) || double.IsInfinity(passPercent))
            {
                return Clamp(minPercent, minPercent, maxPercent);
            }

            if (Math.Abs(absSpan) < 1e-6 || Math.Abs(direction) < 1e-9)
            {
                return Clamp(passPercent, minPercent, maxPercent);
            }

            double ratio = passPercent / 100.0;
            double x = frontX + direction * absSpan * ratio;
            double shiftedX = x + offsetMm;
            double shiftedRatio = (shiftedX - frontX) / (direction * absSpan);
            double shiftedPercent = shiftedRatio * 100.0;
            return Clamp(shiftedPercent, minPercent, maxPercent);
        }



        // Turn_B와 Connection 경계 X를 공정 결과 기준으로 해석한다.
        // 우선순위:
        //   1) TurningProfile 결과 EndXValue (실제 Turn 끝 경계)
        //   2) FinishLineX(유효 시)
        //   3) BackPointX
        // 목적: Rough_B/Composite_B 끝점이 Turn_B-Connection 실제 경계와 일치하도록 기준점을 통일.
        private static double ResolveTurnConnectionBoundaryX(string context)
        {
            try
            {
                double front = MoveSTL_Module.FrontPointX;
                double back = MoveSTL_Module.BackPointX;
                double xMin = Math.Min(0.0, Math.Min(front, back));
                double xMax = Math.Max(front, back);

                // 1) TurningProfile 결과를 최우선 사용
                double endX = EndXValue;
                if (!double.IsNaN(endX) && !double.IsInfinity(endX) && Math.Abs(endX) > 1e-6)
                {
                    if (endX >= xMin - 0.5 && endX <= xMax + 0.5)
                    {
                        DentalLogger.Log($"{context} - 경계 X 선택: EndXValue={endX:F3} (Front={front:F3}, Back={back:F3})");
                        return endX;
                    }

                    DentalLogger.Log($"{context} - EndXValue 범위 이탈({endX:F3}), 다음 후보(FinishLineX)로 진행");
                }

                // 2) FinishLineX 보조 사용
                double finishX = MoveSTL_Module.FinishLineX;
                if (!double.IsNaN(finishX) && !double.IsInfinity(finishX) && Math.Abs(finishX) > 1e-6)
                {
                    // 이동/회전 오차를 고려해 소폭 여유 범위 내면 유효로 본다.
                    if (finishX >= xMin - 0.5 && finishX <= xMax + 0.5)
                    {
                        DentalLogger.Log($"{context} - 경계 X 선택: FinishLineX={finishX:F3} (Front={front:F3}, Back={back:F3})");
                        return finishX;
                    }

                    DentalLogger.Log($"{context} - FinishLineX 범위 이탈({finishX:F3}), BackPointX 사용");
                }

                // 3) 최종 fallback
                DentalLogger.Log($"{context} - 경계 X 선택: BackPointX={back:F3} (EndXValue={endX:F3}, FinishLineX={finishX:F3})");
                return back;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"{context} - 경계 X 해석 실패, BackPointX fallback: {ex.GetType().Name}:{ex.Message}");
                return MoveSTL_Module.BackPointX;
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
