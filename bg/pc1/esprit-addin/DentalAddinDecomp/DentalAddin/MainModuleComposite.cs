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
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace DentalAddin
{
    internal sealed partial class MainModule
    {
        private static string CompositePrcBackPath => Path.Combine(AppConfig.AddInRootDirectory, "AcroDent", "11_Composite prc", "5axisComposite_Back.prc");
        private static string CompositePrcAllPath => Path.Combine(AppConfig.AddInRootDirectory, "AcroDent", "11_Composite prc", "5axisComposite_All.prc");
        private static string CompositePrcFrontPath => Path.Combine(AppConfig.AddInRootDirectory, "AcroDent", "11_Composite prc", "5axisComposite_Front.prc");

        // Composite OrientationStrategy 매직넘버 SSOT
        // - 0: 모델쪽으로 법선 방향
        // - 1: 기본 전략(프로파일 미사용)
        // - 4: 프로파일 기반 공구축 (현장 검증값)
        private const int CompositeOrientationStrategyDefault = 0;
        private const int CompositeOrientationStrategyProfile = 0;

        // 진단용 env 키(선택에는 사용하지 않음).
        // startX SSOT는 MoveSTL_Module.FrontPointX이며, env/shadow 값은 로그 관찰 용도로만 읽는다.
        private const string CompositeOrientationProfileStartXEnv = "ABUTS_COMPOSITE_ORIENTATION_PROFILE_START_X";

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

                // PRC는 모드별 고정 파일을 사용하므로 env 비어도 Split 비활성화하지 않는다.
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitLine2 - 환경변수 로드 실패: {ex.GetType().Name}:{ex.Message}");
                enabled = false;
                return false;
            }
        }

        private static void ResolveCompositeFinishPrcPaths(bool finishAllMode, out string prcForA, out string prcForB)
        {
            // 정책(요청 반영):
            // - Finish_All  -> 5axisComposite_All.prc
            // - Finish_Front -> 5axisComposite_Front.prc
            // - Finish_Back  -> 5axisComposite_Back.prc
            if (finishAllMode)
            {
                prcForA = CompositePrcAllPath;
                prcForB = CompositePrcBackPath; // runB=false이면 사용되지 않음
            }
            else
            {
                prcForA = CompositePrcFrontPath;
                prcForB = CompositePrcBackPath;
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

            string normalizedLabel = (label ?? string.Empty).Trim();

            // A 대상일 경우 env(ABUTS_COMPOSITE_STOCK_ALLOWANCE_A)를 우선 확인한다.
            double? stockAllowanceOverride = null;
            if (normalizedLabel.StartsWith("A", StringComparison.OrdinalIgnoreCase))
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
                        DentalLogger.Log($"Composite2SplitLine2 - {label} StockAllowance env 파싱 실패 (raw='{rawEnv}'), env 무시");
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
                // - A(B): 0.0
                // - B(C): 0.0
                if (normalizedLabel.StartsWith("B", StringComparison.OrdinalIgnoreCase))
                {
                    stockAllowance = 0.0;
                }
                else if (normalizedLabel.StartsWith("A", StringComparison.OrdinalIgnoreCase))
                {
                    stockAllowance = 0.0;
                }
                else
                {
                    DentalLogger.Log($"Composite2SplitLine2 - {label} StockAllowance 기본값 대상 아님 - 적용 생략");
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
                DentalLogger.Log($"Composite2SplitLine2 - {label} StockAllowance={stockAllowance.ToString("0.###", CultureInfo.InvariantCulture)} 적용 (PRC 파일 무변경)");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitLine2 - {label} StockAllowance 설정 실패: {ex.GetType().Name}:{ex.Message}");
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
                DentalLogger.Log($"Composite2SplitLine2 - {label} Dynamic=false 적용 (env=ABUTS_COMPOSITE_DYNAMIC_DISABLE)");
            }
            catch
            {
                try
                {
                    op.GetType().InvokeMember("DynamicUpdate", BindingFlags.SetProperty, null, op, new object[] { false }, CultureInfo.InvariantCulture);
                    DentalLogger.Log($"Composite2SplitLine2 - {label} DynamicUpdate=false 적용 (env=ABUTS_COMPOSITE_DYNAMIC_DISABLE)");
                }
                catch (Exception ex)
                {
                    DentalLogger.Log($"Composite2SplitLine2 - {label} Dynamic 비활성화 미지원/실패: {ex.GetType().Name}:{ex.Message}");
                }
            }
        }

        private static bool TryGetCompositeOrientationVectorFromEnv(out double vx, out double vy, out double vz)
        {
            vx = 0.0;
            vy = 0.0;
            vz = 0.0;

            string raw = GetEnvString("ABUTS_COMPOSITE_ORIENTATION_VECTOR");
            if (string.IsNullOrWhiteSpace(raw))
            {
                return false;
            }

            string[] parts = raw
                .Replace(";", ",")
                .Replace("|", ",")
                .Replace("\t", ",")
                .Replace(" ", ",")
                .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);

            if (parts.Length < 3)
            {
                DentalLogger.Log($"Composite2SplitLine2 - OrientationVector env 형식 오류(raw='{raw}')");
                return false;
            }

            if (!double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out vx)
                || !double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out vy)
                || !double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out vz))
            {
                DentalLogger.Log($"Composite2SplitLine2 - OrientationVector env 파싱 실패(raw='{raw}')");
                return false;
            }

            double norm = Math.Sqrt(vx * vx + vy * vy + vz * vz);
            if (double.IsNaN(norm) || double.IsInfinity(norm) || norm < 1e-6)
            {
                DentalLogger.Log($"Composite2SplitLine2 - OrientationVector 크기 무효(raw='{raw}', norm={norm})");
                return false;
            }

            return true;
        }

        // OrientationProfile 시작점 진단용 shadow X 해석.
        // 선택 로직은 사용하지 않고, 로그 비교(FrontX/envX/shadowX) 목적으로만 사용한다.
        private static bool TryResolveCompositeOrientationStartXFromCurrentStl(out double startX)
        {
            startX = MoveSTL_Module.FrontPointX;

            if (Document?.GraphicsCollection == null || Document?.FeatureRecognition == null)
            {
                return false;
            }

            SelectionSet selectionSet = null;
            List<FeatureChain> createdChains = null;
            try
            {
                const string selectionName = "CompositeOrientationStartXTemp";
                try { selectionSet = Document.SelectionSets.Add(selectionName); }
                catch { selectionSet = Document.SelectionSets[selectionName]; }
                if (selectionSet == null)
                {
                    return false;
                }

                selectionSet.RemoveAll();
                int stlCount = 0;
                foreach (GraphicObject graphic in Document.GraphicsCollection)
                {
                    if (graphic?.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        selectionSet.Add(graphic, RuntimeHelpers.GetObjectValue(Missing.Value));
                        stlCount++;
                    }
                }

                if (stlCount <= 0)
                {
                    return false;
                }

                Plane plane = null;
                try { plane = Document.Planes["XYZ"]; } catch { }
                if (plane == null)
                {
                    try { plane = Document.Planes["YZX"]; } catch { }
                }
                if (plane == null)
                {
                    return false;
                }

                HashSet<string> beforeKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    foreach (FeatureChain fc in Document.FeatureChains)
                    {
                        if (fc?.Key != null)
                        {
                            beforeKeys.Add(fc.Key);
                        }
                    }
                }
                catch { }

                Document.FeatureRecognition.CreatePartProfileShadow(selectionSet, plane, espGraphicObjectReturnType.espFeatureChains);
                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));

                createdChains = new List<FeatureChain>();
                FeatureChain target = null;
                try
                {
                    foreach (FeatureChain fc in Document.FeatureChains)
                    {
                        if (fc?.Key == null)
                        {
                            continue;
                        }
                        if (!beforeKeys.Contains(fc.Key))
                        {
                            createdChains.Add(fc);
                            if (target == null)
                            {
                                target = fc;
                            }
                        }
                    }
                }
                catch { }

                if (target == null || target.Length <= 0.0)
                {
                    return false;
                }

                double minX = double.PositiveInfinity;
                int sampleCount = (int)Math.Max(20.0, Math.Floor(target.Length / 0.05));
                for (int i = 0; i <= sampleCount; i++)
                {
                    double along = target.Length * i / sampleCount;
                    Point p = null;
                    try { p = target.PointAlong(along); } catch { }
                    if (p == null || double.IsNaN(p.X) || double.IsInfinity(p.X))
                    {
                        continue;
                    }

                    if (p.X < minX)
                    {
                        minX = p.X;
                    }
                }

                if (double.IsInfinity(minX))
                {
                    return false;
                }

                startX = minX;
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitLine2 - OrientationProfile startX(STL shadow) 해석 실패: {ex.GetType().Name}:{ex.Message}");
                return false;
            }
            finally
            {
                try { selectionSet?.RemoveAll(); } catch { }

                if (createdChains != null)
                {
                    for (int i = createdChains.Count - 1; i >= 0; i--)
                    {
                        try { Document.FeatureChains.Remove(createdChains[i]); } catch { }
                    }
                }
            }
        }

        private static bool TryCreateCompositeOrientationProfileFromVector(double vx, double vy, double vz, string label, out string orientationProfile)
        {
            orientationProfile = null;
            try
            {
                if (Document == null)
                {
                    return false;
                }

                string profileName = string.IsNullOrWhiteSpace(label) ? "CompositeOrientationProfile" : $"CompositeOrientationProfile_{label}";

                // 중요: OrientationProfile은 각 케이스의 STL 이동/정렬 결과(FrontPointX)를 반드시 따라야 한다.
                // 동일 이름 체인을 재사용하면 이전 케이스 좌표가 남아 위치 불일치가 발생할 수 있으므로,
                // 기존 동일 이름 체인은 모두 제거 후 현재 좌표로 다시 생성한다.
                try
                {
                    int count = Document.FeatureChains?.Count ?? 0;
                    for (int i = count; i >= 1; i--)
                    {
                        FeatureChain candidate = null;
                        try { candidate = Document.FeatureChains[i]; } catch { }
                        if (candidate == null)
                        {
                            continue;
                        }
                        if (!string.Equals((candidate.Name ?? string.Empty).Trim(), profileName, StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        try
                        {
                            Document.FeatureChains.Remove(i);
                            DentalLogger.Log($"Composite2SplitLine2 - OrientationProfile 기존 체인 제거(label={label}, removedIndex={i}, name={profileName})");
                        }
                        catch { }
                    }
                }
                catch { }

                double vectorNorm = Math.Sqrt(vx * vx + vy * vy + vz * vz);
                if (vectorNorm < 1e-6)
                {
                    return false;
                }

                // backend 벡터는 STL 원좌표 기준이므로, 전처리와 동일한 회전을 적용해
                // 현재 ESPRIT 좌표계의 공구축 방향으로 변환한다.
                // 1) Rotate90Degrees: Y축 -90°
                double rx1 = -vz;
                double ry1 = vy;
                double rz1 = vx;

                // 2) RotateByWAxisDegrees: X축 +30° (StlFileProcessor.DefaultWAxisRotationDegrees)
                const double wAxisDeg = 30.0;
                double wAxisRad = wAxisDeg * Math.PI / 180.0;
                double cosX = Math.Cos(wAxisRad);
                double sinX = Math.Sin(wAxisRad);
                double rx2 = rx1;
                double ry2 = ry1 * cosX - rz1 * sinX;
                double rz2 = ry1 * sinX + rz1 * cosX;

                double rotatedNorm = Math.Sqrt(rx2 * rx2 + ry2 * ry2 + rz2 * rz2);
                if (rotatedNorm < 1e-6)
                {
                    return false;
                }

                double nx = rx2 / rotatedNorm;
                double ny = ry2 / rotatedNorm;
                double nz = rz2 / rotatedNorm;

                double profileLengthMm = GetEnvDoubleNullable("ABUTS_COMPOSITE_ORIENTATION_PROFILE_LENGTH_MM") ?? 20.0;
                profileLengthMm = Clamp(profileLengthMm, 1.0, 200.0);

                // [SSOT] OrientationProfile 시작점은 MoveSTL_Module.FrontPointX로만 고정한다.
                // env/shadow는 선택에 쓰지 않고 진단 로그에만 남긴다.
                double frontX = MoveSTL_Module.FrontPointX;
                double backX = MoveSTL_Module.BackPointX;
                double startX = frontX;
                string startXSource = "MoveSTL_Module.FrontPointX";

                double? startXFromEnv = GetEnvDoubleNullable(CompositeOrientationProfileStartXEnv);
                double? startXFromShadow = null;
                if (TryResolveCompositeOrientationStartXFromCurrentStl(out double resolvedShadowX))
                {
                    startXFromShadow = resolvedShadowX;
                }

                // 임시 가드: 어떤 경로로 startX가 바뀌었더라도 FrontPointX와 0.2mm 이상 차이면 강제 보정한다.
                const double startXGuardToleranceMm = 0.2;
                if (Math.Abs(startX - frontX) > startXGuardToleranceMm)
                {
                    DentalLogger.Log($"Composite2SplitLine2 - OrientationProfile startX guard override: chosen={startX.ToString("F3", CultureInfo.InvariantCulture)} -> front={frontX.ToString("F3", CultureInfo.InvariantCulture)}, tol={startXGuardToleranceMm.ToString("F3", CultureInfo.InvariantCulture)}");
                    startX = frontX;
                    startXSource = "MoveSTL_Module.FrontPointX(guard)";
                }

                DentalLogger.Log($"Composite2SplitLine2 - OrientationProfile startX 결정: frontX={frontX.ToString("F3", CultureInfo.InvariantCulture)}, backX={backX.ToString("F3", CultureInfo.InvariantCulture)}, envStartX={(startXFromEnv.HasValue ? startXFromEnv.Value.ToString("F3", CultureInfo.InvariantCulture) : "<null>")}, shadowStartX={(startXFromShadow.HasValue ? startXFromShadow.Value.ToString("F3", CultureInfo.InvariantCulture) : "<null>")}, chosenStartX={startX.ToString("F3", CultureInfo.InvariantCulture)}, source={startXSource}");

                Plane previousPlane = null;
                try { previousPlane = Document.ActivePlane; } catch { }
                try
                {
                    Plane xyz = null;
                    try { xyz = Document.Planes["XYZ"]; } catch { }
                    if (xyz != null)
                    {
                        Document.ActivePlane = xyz;
                    }
                }
                catch { }

                Point p0 = Document.GetPoint(startX, 0.0, 0.0);
                Point p1 = Document.GetPoint(startX + nx * profileLengthMm, ny * profileLengthMm, nz * profileLengthMm);

                FeatureChain fc = Document.FeatureChains.Add(p0);
                fc.Add(p1);
                fc.Name = profileName;
                try { fc.Layer = Document.Layers["CompositeMill"]; } catch { }

                // 생성 시점 active plane/좌표계 영향으로 실제 시작점이 의도값과 어긋나는 케이스 보정
                // (요청: 다른 피쳐와 동일하게 이동 결과를 따르도록 강제)
                try
                {
                    Point s = null;
                    Point e = null;
                    try { s = fc.Extremity(espExtremityType.espExtremityStart); } catch { }
                    try { e = fc.Extremity(espExtremityType.espExtremityEnd); } catch { }

                    Point chosen = s;
                    if (s != null && e != null)
                    {
                        double ds = Math.Abs(s.X - startX) + Math.Abs(s.Y) + Math.Abs(s.Z);
                        double de = Math.Abs(e.X - startX) + Math.Abs(e.Y) + Math.Abs(e.Z);
                        chosen = (de < ds) ? e : s;
                    }

                    if (chosen != null)
                    {
                        double dx = startX - chosen.X;
                        double dy = 0.0 - chosen.Y;
                        double dz = 0.0 - chosen.Z;
                        if (Math.Abs(dx) > 1e-4 || Math.Abs(dy) > 1e-4 || Math.Abs(dz) > 1e-4)
                        {
                            SelectionSet ss = null;
                            const string ssName = "CompositeOrientationProfileShiftTemp";
                            try { ss = Document.SelectionSets.Add(ssName); } catch { ss = Document.SelectionSets[ssName]; }
                            if (ss != null)
                            {
                                ss.RemoveAll();
                                ss.Add(fc, RuntimeHelpers.GetObjectValue(Missing.Value));
                                ss.Translate(dx, dy, dz, RuntimeHelpers.GetObjectValue(Missing.Value));
                                ss.RemoveAll();
                                DentalLogger.Log($"Composite2SplitLine2 - OrientationProfile 좌표 보정 이동: dX={dx.ToString("F3", CultureInfo.InvariantCulture)}, dY={dy.ToString("F3", CultureInfo.InvariantCulture)}, dZ={dz.ToString("F3", CultureInfo.InvariantCulture)}");
                            }
                        }
                    }
                }
                catch (Exception shiftEx)
                {
                    DentalLogger.Log($"Composite2SplitLine2 - OrientationProfile 좌표 보정 실패: {shiftEx.GetType().Name}:{shiftEx.Message}");
                }
                finally
                {
                    try
                    {
                        if (previousPlane != null)
                        {
                            Document.ActivePlane = previousPlane;
                        }
                    }
                    catch { }
                }

                int key = SafeParseKey(Convert.ToString(fc.Key, CultureInfo.InvariantCulture));
                if (key <= 0)
                {
                    DentalLogger.Log($"Composite2SplitLine2 - OrientationProfile 생성 실패(key<=0, label={label})");
                    return false;
                }

                orientationProfile = "6," + key.ToString(CultureInfo.InvariantCulture);
                Point actualStart = null;
                Point actualEnd = null;
                try { actualStart = fc.Extremity(espExtremityType.espExtremityStart); } catch { }
                try { actualEnd = fc.Extremity(espExtremityType.espExtremityEnd); } catch { }
                DentalLogger.Log($"Composite2SplitLine2 - OrientationProfile 생성 완료(label={label}, key={key}, profile='{orientationProfile}', startX={startX.ToString("F3", CultureInfo.InvariantCulture)}, startXSource={startXSource}, p0=({startX.ToString("F3", CultureInfo.InvariantCulture)},0,0), p1=({(startX + nx * profileLengthMm).ToString("F3", CultureInfo.InvariantCulture)},{(ny * profileLengthMm).ToString("F3", CultureInfo.InvariantCulture)},{(nz * profileLengthMm).ToString("F3", CultureInfo.InvariantCulture)}), actualStart=({(actualStart != null ? actualStart.X.ToString("F3", CultureInfo.InvariantCulture) : "<null>")},{(actualStart != null ? actualStart.Y.ToString("F3", CultureInfo.InvariantCulture) : "<null>")},{(actualStart != null ? actualStart.Z.ToString("F3", CultureInfo.InvariantCulture) : "<null>")}), actualEnd=({(actualEnd != null ? actualEnd.X.ToString("F3", CultureInfo.InvariantCulture) : "<null>")},{(actualEnd != null ? actualEnd.Y.ToString("F3", CultureInfo.InvariantCulture) : "<null>")},{(actualEnd != null ? actualEnd.Z.ToString("F3", CultureInfo.InvariantCulture) : "<null>")}), vectorRaw=({vx.ToString("F6", CultureInfo.InvariantCulture)},{vy.ToString("F6", CultureInfo.InvariantCulture)},{vz.ToString("F6", CultureInfo.InvariantCulture)}), vectorRot=({nx.ToString("F6", CultureInfo.InvariantCulture)},{ny.ToString("F6", CultureInfo.InvariantCulture)},{nz.ToString("F6", CultureInfo.InvariantCulture)}))");
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitLine2 - OrientationProfile 생성 예외(label={label}): {ex.GetType().Name}:{ex.Message}");
                return false;
            }
        }

        private static void TryApplyCompositeOrientationProfileFromEnv(TechLatheMill5xComposite op, string label)
        {
            if (op == null)
            {
                return;
            }

            if (!TryGetCompositeOrientationVectorFromEnv(out double vx, out double vy, out double vz))
            {
                // 벡터가 없으면 PRC가 OrientationStrategy=4 이어도 Add 단계에서
                // "할당되지 않은 공구 축" COM 예외가 날 수 있다.
                // 안전하게 기본 전략(1)으로 폴백한다.
                try
                {
                    op.GetType().InvokeMember("OrientationStrategy", BindingFlags.SetProperty, null, op, new object[] { CompositeOrientationStrategyDefault }, CultureInfo.InvariantCulture);
                    op.GetType().InvokeMember("OrientationProfile", BindingFlags.SetProperty, null, op, new object[] { string.Empty }, CultureInfo.InvariantCulture);
                    DentalLogger.Log($"Composite2SplitLine2 - {label} OrientationVector 없음: OrientationStrategy={CompositeOrientationStrategyDefault} 폴백 적용");
                }
                catch (Exception ex)
                {
                    DentalLogger.Log($"Composite2SplitLine2 - {label} OrientationStrategy 폴백 실패: {ex.GetType().Name}:{ex.Message}");
                }
                return;
            }

            if (!TryCreateCompositeOrientationProfileFromVector(vx, vy, vz, label, out string orientationProfile) || string.IsNullOrWhiteSpace(orientationProfile))
            {
                return;
            }

            try
            {
                op.GetType().InvokeMember("OrientationStrategy", BindingFlags.SetProperty, null, op, new object[] { CompositeOrientationStrategyProfile }, CultureInfo.InvariantCulture);
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitLine2 - {label} OrientationStrategy={CompositeOrientationStrategyProfile} 설정 실패: {ex.GetType().Name}:{ex.Message}");
            }

            try
            {
                op.GetType().InvokeMember("OrientationProfile", BindingFlags.SetProperty, null, op, new object[] { orientationProfile }, CultureInfo.InvariantCulture);
                DentalLogger.Log($"Composite2SplitLine2 - {label} OrientationProfile 적용: {orientationProfile}");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitLine2 - {label} OrientationProfile 설정 실패: {ex.GetType().Name}:{ex.Message}");
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
            double turnConnectionBoundaryX = ResolveTurnConnectionBoundaryX("Composite2SplitLine2");
            double backXForComposite = turnConnectionBoundaryX + rightOffset;
            double baseBackRatio = turnConnectionBoundaryX / 20.0;
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
            bool startEndOverflowGuardApplied = false;
            double? safeLastPercentOpt = GetEnvDoubleNullable("ABUTS_COMPOSITE_STARTEND_SAFE_LAST_PERCENT");
            if (safeLastPercentOpt.HasValue)
            {
                double safeLastPercent = Clamp(safeLastPercentOpt.Value, firstPercent + 0.5, 100.0);
                if (lastPercent > safeLastPercent + 1e-6)
                {
                    effectiveLastPercent = safeLastPercent;
                    startEndOverflowGuardApplied = true;
                    DentalLogger.Log($"Composite2SplitLine2 - StartEnd 안전클램프 적용: rawLast={lastPercent:F2}, safeLast={effectiveLastPercent:F2}, rawBaseBack={baseBackPercent:F2}, env=ABUTS_COMPOSITE_STARTEND_SAFE_LAST_PERCENT");
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
                    DentalLogger.Log($"Composite2SplitLine2 - FinishLine 기반 계산 불가(span~0), 기본 27% fallback splitX={splitX:F3}");
                }
                else
                {
                    double finishLinePositionBeforeShift = backBeforeShift - finishLineDistanceFromBack;
                    splitX = finishLinePositionBeforeShift + stlShift;
                    splitRatio = (finishLinePositionBeforeShift - frontBeforeShift) / absSpanBeforeShift;
                    splitRatio = Clamp(splitRatio, leftRatio, rightRatio);
                    DentalLogger.Log($"Composite2SplitLine2 - A/B 공식 splitX={splitX:F3} (ratio={splitRatio:F3}, finishLinePos={finishLinePositionBeforeShift:F3}, distFromBack={finishLineDistanceFromBack:F3}, envSplitXIgnored={(envSplitX > 0.001 ? envSplitX.ToString("F3", CultureInfo.InvariantCulture) : "none")})");
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
                DentalLogger.Log($"Composite2SplitLine2 - FinishLineTopZ 없음, env splitX fallback={splitX:F3} (ratio={splitRatio:F3})");
            }
            else
            {
                splitRatio = leftRatio + (rightRatio - leftRatio) * 0.27;
                splitX = MoveSTL_Module.FrontPointX + splitRatio * direction * absSpan;
                splitRatio = Clamp(splitRatio, leftRatio, rightRatio);
                DentalLogger.Log($"Composite2SplitLine2 - 기본 계산 splitX={splitX:F3} (27% 지점, FinishLineTopZ/envSplitX 없음)");
            }


            double splitPercent = Clamp(splitRatio * 100.0, firstPercent, effectiveLastPercent);

            // FINISH_FRONT/FINISH_BACK 경계는 TwoPhaseSplitLine을 기준으로 적용한다.
            // (TwoPhaseSplitLine은 finishLine topZ 상방 +1.0mm 정의를 사용)
            if (TryResolveTwoPhaseSplitLineTargetX(out double twoPhaseGuideX, out string twoPhaseGuideSource))
            {
                EnsureTwoPhaseSplitGuideLine(twoPhaseGuideX);
                DentalLogger.Log($"Composite2SplitLine2 - TwoPhaseSplitLine 등록/확인: X={twoPhaseGuideX:F3}, source={twoPhaseGuideSource}");
            }
            if (TryResolveTwoPhaseSplitLineX(out double splitXByGuideLine))
            {
                // StartEndPosition pass-percent는 x/20.0 스케일을 사용한다.
                double splitPercentByGuideLine = XToPassPercentByStartEndScale(splitXByGuideLine, firstPercent, effectiveLastPercent);
                if (!double.IsNaN(splitPercentByGuideLine) && !double.IsInfinity(splitPercentByGuideLine))
                {
                    double splitPercentBySpanDiag = XToPassPercentBySpan(splitXByGuideLine, MoveSTL_Module.FrontPointX, direction, absSpan, firstPercent, effectiveLastPercent);
                    DentalLogger.Log($"Composite2SplitLine2 - Front/Back 경계 TwoPhaseSplitLine 기준 적용: guideX={splitXByGuideLine:F3}, splitPercent(scale20) {splitPercent:F2}->{splitPercentByGuideLine:F2}, splitPercent(spanDiag)={splitPercentBySpanDiag:F2}");
                    splitX = splitXByGuideLine;
                    splitPercent = splitPercentByGuideLine;
                }
                else
                {
                    DentalLogger.Log($"Composite2SplitLine2 - TwoPhaseSplitLine 기준 무시: splitPercent 계산 불가(guideX={splitXByGuideLine:F3})");
                }
            }
            else
            {
                DentalLogger.Log("Composite2SplitLine2 - TwoPhaseSplitLine 해석 실패: 계산 splitX fallback 사용");
            }

            // StartEndPosition에서 B 시작 퍼센트가 높아지면(실측: ~38%) NC 계산 중 크래시 가능성이 높다.
            // 성공 케이스(약 25%)를 기준으로 기본 상한을 둔다. 필요 시 env로 조정 가능.
            // env: ABUTS_COMPOSITE_STARTEND_SAFE_B_FIRST_MAX (default: 30.0)
            // // 향기로운치과 이인용-41 케이스에서 36까지는 괜찮고 37에서 크래시 발생
            double safeBFirstMax = 35; //GetEnvDoubleNullable("ABUTS_COMPOSITE_STARTEND_SAFE_B_FIRST_MAX") ?? 30.0;
            safeBFirstMax = Clamp(safeBFirstMax, firstPercent + 0.1, effectiveLastPercent - 0.1);
            bool startEndBFirstGuardApplied = false;

            string phaseMode = (GetEnvString("ABUTS_COMPOSITE_PHASE_MODE") ?? string.Empty).Trim().ToUpperInvariant();
            string retentionGroove = (GetEnvString("ABUTS_RETENTION_GROOVE") ?? string.Empty).Trim().ToLowerInvariant();

            // Finish 정책(요청 반영):
            // - normalizedGroove/retentionGroove와 무관하게 항상 2단(Finish_Front + Finish_Back)
            // - phaseMode는 A/B 단독 실행 제어에만 사용한다.
            // - 레거시 ALL_PHASE가 들어와도 단일 Finish_All로 내리지 않고 A+B 실행으로 처리한다.
            bool explicitAllPhase = string.Equals(phaseMode, "ALL_PHASE", StringComparison.OrdinalIgnoreCase);
            bool explicitAPhase = string.Equals(phaseMode, "A_PHASE", StringComparison.OrdinalIgnoreCase);
            bool explicitBPhase = string.Equals(phaseMode, "B_PHASE", StringComparison.OrdinalIgnoreCase);
            bool grooveIsDeep = string.Equals(retentionGroove, "deep", StringComparison.OrdinalIgnoreCase);

            const bool finishAllMode = false;

            bool runA;
            bool runB;
            if (explicitAPhase)
            {
                runA = true;
                runB = false;
            }
            else if (explicitBPhase)
            {
                runA = false;
                runB = true;
            }
            else
            {
                // explicitAllPhase 포함 기본값: 항상 Front+Back
                runA = true;
                runB = true;
            }

            ResolveCompositeFinishPrcPaths(finishAllMode, out string resolvedPrcA, out string resolvedPrcB);
            string effectivePrcA = resolvedPrcA;
            string effectivePrcB = resolvedPrcB;

            DentalLogger.Log($"Composite2SplitLine2 - enabled=1, splitX={splitX:F3}, envPrcA={prcA}, envPrcB={prcB}, resolvedPrcA={effectivePrcA}, resolvedPrcB={effectivePrcB}, phaseMode='{phaseMode}', retentionGroove='{retentionGroove}', grooveIsDeep={grooveIsDeep}, finishAllMode={finishAllMode}, runA={runA}, runB={runB}");

            bool splitDegenerate = Math.Abs(splitPercent - firstPercent) < 0.01 || Math.Abs(effectiveLastPercent - splitPercent) < 0.01;
            if (splitDegenerate)
            {
                // 중요: 여기서 false를 반환하면 caller가 Composite2 단일 경로(A만)로 fallback 되어
                // FINISH_B가 누락될 수 있다. 따라서 SplitAB 경로를 유지한 채 최소 경계로 degrade한다.
                DentalLogger.Log($"Composite2SplitLine2 - SplitPercent 범위가 작음(First={firstPercent:F2}, Split={splitPercent:F2}, Last={effectiveLastPercent:F2}). SplitAB 중단 대신 최소 경계로 degrade하여 계속 진행");
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

            ITechnology[] techA = TryOpenProcess(technologyUtility, effectivePrcA, "Composite2SplitLine2:A");
            ITechnology[] techB = runB ? TryOpenProcess(technologyUtility, effectivePrcB, "Composite2SplitLine2:B") : Array.Empty<ITechnology>();

            if (techA.Length <= 0 || (runB && techB.Length <= 0))
            {
                DentalLogger.Log($"Composite2SplitLine2 - PRC 로드 실패 (A:{techA.Length}, B:{techB.Length}, runB={runB})");
                return false;
            }

            TechLatheMill5xComposite opA = techA[0] as TechLatheMill5xComposite;
            TechLatheMill5xComposite opB = runB ? (techB[0] as TechLatheMill5xComposite) : null;
            if (opA == null || (runB && opB == null))
            {
                DentalLogger.Log($"Composite2SplitLine2 - TechLatheMill5xComposite 캐스팅 실패 (A:{techA[0]?.GetType().Name}, B:{(runB && techB.Length > 0 ? techB[0]?.GetType().Name : "<skip>")})");
                return false;
            }

            DentalLogger.Log($"Composite2SplitLine2 - 시작: FrontPointX={MoveSTL_Module.FrontPointX:F3}, BackPointX={MoveSTL_Module.BackPointX:F3}, TurnConnBoundaryX={turnConnectionBoundaryX:F3}, FinishLineX={MoveSTL_Module.FinishLineX:F3}, FinishLineTopZ={MoveSTL_Module.FinishLineTopZ:F3}, SurfaceNumber={SurfaceNumber}, ToolNs='{ToolNs ?? ""}'");

            opA.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
            // B는 A 오른쪽 구간부터 커넥션까지를 정확히 공간 기준으로 가공해야 하므로
            // Start/End 위치 기반 비율을 사용한다.
            if (runB && opB != null)
            {
                opB.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
            }
            double? firstPassPercentOverride = TryGetCompositeFirstPassPercentOverride();
            // 요청 반영:
            // - FINISH_A(Finish_Front) 시작점 = Splitline_1 + 0.5mm
            // - 단, Splitline_2 - 1.0mm를 침범하지 않도록 상한 클램프
            const double finishFrontStartOffsetFromSplitline1Mm = 0.5;
            const double finishFrontStartMaxBySplitline2GapMm = 1.0;

            double splitline1X = MoveSTL_Module.FrontPointX;
            double splitline2X = splitX;
            bool splitlineResolved = TryGetThreeStageSplitConfig(out double resolvedSplitline1, out double resolvedSplitline2, out _, out _);
            if (splitlineResolved)
            {
                splitline1X = resolvedSplitline1;
                splitline2X = resolvedSplitline2;
            }

            double requestedAStartX = splitline1X + finishFrontStartOffsetFromSplitline1Mm;
            double finishFrontStartMaxX = splitline2X - finishFrontStartMaxBySplitline2GapMm;
            double appliedAStartX = requestedAStartX;
            bool finishFrontStartGuardApplied = false;
            if (appliedAStartX > finishFrontStartMaxX)
            {
                appliedAStartX = finishFrontStartMaxX;
                finishFrontStartGuardApplied = true;
            }

            double baseAFirstPercentBySplitline1X = XToPassPercentByStartEndScale(appliedAStartX, 0.0, splitPercent);
            double maxAFirstPercentBySplitline2 = XToPassPercentByStartEndScale(finishFrontStartMaxX, 0.0, splitPercent);
            double baseAFirstPercent = Clamp(baseAFirstPercentBySplitline1X, 0.0, splitPercent);
            bool overrideGuardApplied = false;
            if (firstPassPercentOverride.HasValue)
            {
                double overridePercent = Clamp(firstPassPercentOverride.Value, 0.0, splitPercent);
                if (overridePercent > maxAFirstPercentBySplitline2 + 1e-6)
                {
                    overridePercent = maxAFirstPercentBySplitline2;
                    overrideGuardApplied = true;
                }
                baseAFirstPercent = overridePercent;
            }

            DentalLogger.Log($"Composite2SplitLine2 - FINISH_FRONT 시작점 정책 적용: splitlineResolved={splitlineResolved}, splitline1X={splitline1X:F3}, splitline2X={splitline2X:F3}, requestedStartX(splitline1+0.5)={requestedAStartX:F3}, maxStartX(splitline2-1.0)={finishFrontStartMaxX:F3}, appliedStartX={appliedAStartX:F3}, guardApplied={finishFrontStartGuardApplied}, maxFirst%={maxAFirstPercentBySplitline2:F2}, overrideGuardApplied={overrideGuardApplied}");

            const double aEndOffsetFromSplitMm = 0.0; // 요청: FINISH_A 끝점 = 기준점(splitPercent)
            // 요청 반영: FINISH_B 시작점 오프셋 제거(정치수)
            const double bStartOffsetFromSplitMm = 0.0; // FINISH_B 시작점 = 기준점(splitPercent)
            // 요청 반영: FINISH_All / FINISH_Back 끝점 = BackPointX (오프셋 0.0)
            const double compositeEndOffsetFromBackPointMm = 0.0;

            // 기준점(splitPercent)을 기준으로 A/B 경계를 독립 적용한다.
            // - A.End: split + 0.0mm(=split)
            // - B.Start: split - 0.1mm (원통 시작각도 차이 seam 완화용 overlap)
            double requestedALastPass = ShiftPassPercentByStartEndScaleMm(splitPercent, aEndOffsetFromSplitMm, firstPercent, effectiveLastPercent);
            double requestedBFirstPass = ShiftPassPercentByStartEndScaleMm(splitPercent, bStartOffsetFromSplitMm, firstPercent, effectiveLastPercent);

            // B 시작 퍼센트 상한(안전값) 적용
            double bFirst = requestedBFirstPass;
            if (bFirst > safeBFirstMax + 1e-6)
            {
                bFirst = safeBFirstMax;
                startEndBFirstGuardApplied = true;
                DentalLogger.Log($"Composite2SplitLine2 - B 시작 안전클램프 적용: requestedBFirst={requestedBFirstPass:F2}, safeBFirst={bFirst:F2}, env=ABUTS_COMPOSITE_STARTEND_SAFE_B_FIRST_MAX");
            }

            opA.LastPassPercent = Clamp(requestedALastPass, firstPercent, effectiveLastPercent);
            if (runB && opB != null)
            {
                opB.FirstPassPercent = bFirst;
                opB.LastPassPercent = effectiveLastPercent;
            }

            // 정책: FINISH_B 종료 기준점은 BackPointX (+0.3mm 제거 적용)
            double compositeEndTargetX = MoveSTL_Module.BackPointX + compositeEndOffsetFromBackPointMm;
            double compositeEndPassPercent = XToPassPercentByStartEndScale(compositeEndTargetX, 0.0, 100.0);
            if (runB && opB != null)
            {
                opB.LastPassPercent = Clamp(compositeEndPassPercent, opB.FirstPassPercent, 100.0);
            }

            // FINISH_A 시작점 정책:
            // - 기본값: Splitline_1 + 0.5mm (단, Splitline_2 - 1.0mm 상한)
            // - env(ABUTS_COMPOSITE_FIRST_PASS_PERCENT_A) 지정 시 env(퍼센트) 우선
            double requestedAFirstPass = baseAFirstPercent;
            opA.FirstPassPercent = Clamp(requestedAFirstPass, 0.0, opA.LastPassPercent);

            // 극단적으로 A 구간이 거의 사라질 때만 최소 폭(1.0%) 보정한다.
            // 보정 시에도 0%가 아닌 leftRatio 기준 시작점(최소 1%)을 사용해 축 특이점을 피한다.
            const double minAWindowPercent = 1.0;
            double leftPercent = Clamp(leftRatio * 100.0, 0.0, 100.0);
            double aWindowPercent = opA.LastPassPercent - opA.FirstPassPercent;
            bool aFirstPassFallbackApplied = false;
            if (aWindowPercent < minAWindowPercent)
            {
                double before = opA.FirstPassPercent;
                double fallbackFirst = Clamp(Math.Max(leftPercent, 1.0), 0.0, opA.LastPassPercent);
                opA.FirstPassPercent = fallbackFirst;
                aWindowPercent = opA.LastPassPercent - opA.FirstPassPercent;
                aFirstPassFallbackApplied = true;
                DentalLogger.Log($"Composite2SplitLine2 - A 시작점 최소폭 보정 적용: requested={requestedAFirstPass:F2}, splitline1Based={baseAFirstPercentBySplitline1X:F2}, envOverride={(firstPassPercentOverride.HasValue ? firstPassPercentOverride.Value.ToString("F2", CultureInfo.InvariantCulture) : "none")}, applied={before:F2}->{opA.FirstPassPercent:F2}, LastPass={opA.LastPassPercent:F2}, window={aWindowPercent:F2} (<{minAWindowPercent:F2})");
            }
            else
            {
                DentalLogger.Log($"Composite2SplitLine2 - A 시작점 적용: Requested={requestedAFirstPass:F2}, splitline1Based={baseAFirstPercentBySplitline1X:F2}, envOverride={(firstPassPercentOverride.HasValue ? firstPassPercentOverride.Value.ToString("F2", CultureInfo.InvariantCulture) : "none")}, Applied={opA.FirstPassPercent:F2}, LastPass={opA.LastPassPercent:F2}, window={aWindowPercent:F2}");
            }

            // 정책 변경: Finish_All 단일 패스는 사용하지 않는다(항상 Front/Back 2단).

            // A/B 끝점 정책 재확인:
            // - FINISH_A 끝점: 기준점(splitPercent)
            // - FINISH_B 시작점: 기준점(splitPercent) (오프셋 제거)
            // - FINISH_B 끝점: BackPointX (+0.3mm 제거)
            double aLastBeforeClamp = opA.LastPassPercent;
            opA.LastPassPercent = Clamp(opA.LastPassPercent, opA.FirstPassPercent, effectiveLastPercent);

            double bLastBeforeAdjust = (runB && opB != null) ? opB.LastPassPercent : 0.0;
            double bTargetX = compositeEndTargetX;
            if (runB && opB != null)
            {
                opB.LastPassPercent = Clamp(compositeEndPassPercent, opB.FirstPassPercent, 100.0);
            }

            double aLastXBeforeClamp = PassPercentToX(aLastBeforeClamp, MoveSTL_Module.FrontPointX, direction, absSpan);
            double aLastXAfterClamp = PassPercentToX(opA.LastPassPercent, MoveSTL_Module.FrontPointX, direction, absSpan);
            double bLastXBeforeAdjust = runB && opB != null ? PassPercentToX(bLastBeforeAdjust, MoveSTL_Module.FrontPointX, direction, absSpan) : 0.0;
            double bLastXAfterAdjust = runB && opB != null ? PassPercentToX(opB.LastPassPercent, MoveSTL_Module.FrontPointX, direction, absSpan) : 0.0;
            string bRangeText = (runB && opB != null)
                ? "(" + opB.FirstPassPercent.ToString("F2", CultureInfo.InvariantCulture) + "->" + opB.LastPassPercent.ToString("F2", CultureInfo.InvariantCulture) + ")"
                : "<skip>";
            DentalLogger.Log($"Composite2SplitLine2 - A/B 끝점 정책 적용: A.Last% {aLastBeforeClamp:F2}->{opA.LastPassPercent:F2}, A.LastX {aLastXBeforeClamp:F3}->{aLastXAfterClamp:F3}, B.Enabled={runB}, B.First%={(runB && opB != null ? opB.FirstPassPercent.ToString("F2", CultureInfo.InvariantCulture) : "<skip>")}, B.Last% {(runB && opB != null ? bLastBeforeAdjust.ToString("F2", CultureInfo.InvariantCulture) : "<skip>")}->{(runB && opB != null ? opB.LastPassPercent.ToString("F2", CultureInfo.InvariantCulture) : "<skip>")}, B.LastX {(runB ? bLastXBeforeAdjust.ToString("F3", CultureInfo.InvariantCulture) : "<skip>")}->{(runB ? bLastXAfterAdjust.ToString("F3", CultureInfo.InvariantCulture) : "<skip>")}, B.TargetX={bTargetX:F3}");
            DentalLogger.Log($"Composite2SplitLine2 - seam 보정: A({opA.FirstPassPercent:F2}->{opA.LastPassPercent:F2}), B={bRangeText}, Split%={splitPercent:F2}, AEndOffsetFromSplitMm={aEndOffsetFromSplitMm:F2}, BStartOffsetFromSplitMm={bStartOffsetFromSplitMm:F2}, BEndOffsetFromBackMm={compositeEndOffsetFromBackPointMm:F2}, BFirstGuard={startEndBFirstGuardApplied}, AFirstFallback={aFirstPassFallbackApplied}");

            bool surfaceReady = TryEnsureCompositeSurfaceNumber("Composite2SplitLine2");

            // 요청 반영:
            // FINISH_A / FINISH_B 각각에 독립 DriveSurface를 새로 추가하여 사용한다.
            // (기본 SurfaceNumber는 생성 실패 시에만 fallback)
            int dedicatedAKey = 0;
            int dedicatedBKey = 0;
            bool dedicatedAReady = runA && TryCreateDedicatedCompositeDriveSurface("Composite2SplitLine2", "FINISH_FRONT", out dedicatedAKey);
            bool dedicatedBReady = runB && TryCreateDedicatedCompositeDriveSurface("Composite2SplitLine2", "FINISH_BACK", out dedicatedBKey);

            bool canUseFallbackBase = surfaceReady && SurfaceNumber > 0;
            bool hasDriveForA = !runA || dedicatedAReady || canUseFallbackBase;
            bool hasDriveForB = !runB || dedicatedBReady || canUseFallbackBase;
            if (!hasDriveForA || !hasDriveForB)
            {
                DentalLogger.Log($"Composite2SplitLine2 - DriveSurface 확보 실패: runA={runA}, runB={runB}, dedicatedAReady={dedicatedAReady}, dedicatedBReady={dedicatedBReady}, surfaceReady={surfaceReady}, SurfaceNumber={SurfaceNumber}");
                return false;
            }

            string fallbackDriveSurface = "19," + Conversions.ToString(SurfaceNumber);
            string driveA = dedicatedAReady ? "19," + Conversions.ToString(dedicatedAKey) : fallbackDriveSurface;
            string driveB = dedicatedBReady ? "19," + Conversions.ToString(dedicatedBKey) : fallbackDriveSurface;
            opA.DriveSurface = driveA;
            if (runB && opB != null)
            {
                opB.DriveSurface = driveB;
            }

            DentalLogger.Log($"Composite2SplitLine2 - DriveSurface 적용: A='{driveA}'(dedicated={dedicatedAReady}), B='{(runB ? driveB : "<skip>")}'(dedicated={dedicatedBReady}), baseSurface={SurfaceNumber}, SurfaceNumber2={SurfaceNumber2:0.###}");

            if (string.IsNullOrWhiteSpace(opA.ToolID))
            {
                if (!string.IsNullOrWhiteSpace(ToolNs))
                {
                    opA.ToolID = ToolNs;
                }
                else
                {
                    DentalLogger.Log("Composite2SplitLine2 중단 - PRC ToolID 비어있고 ToolNs도 없습니다.");
                    return false;
                }
            }

            // [중요] B ToolID 방어
            // - 증상: opB Add는 성공해도, NC 계산/저장 단계에서 크래시가 재현될 수 있음.
            // - 원인 후보: PRC_B의 ToolID 공백.
            // - 조치: B ToolID가 비면 A ToolID(우선) 또는 ToolNs로 보정하고 로그를 남긴다.
            if (runB && opB != null && string.IsNullOrWhiteSpace(opB.ToolID))
            {
                if (!string.IsNullOrWhiteSpace(opA.ToolID))
                {
                    opB.ToolID = opA.ToolID;
                    DentalLogger.Log($"Composite2SplitLine2 - B ToolID 비어있음, A ToolID로 보정: {opB.ToolID}");
                }
                else if (!string.IsNullOrWhiteSpace(ToolNs))
                {
                    opB.ToolID = ToolNs;
                    DentalLogger.Log($"Composite2SplitLine2 - B ToolID 비어있음, ToolNs로 보정: {opB.ToolID}");
                }
                else
                {
                    DentalLogger.Log("Composite2SplitLine2 중단 - B ToolID가 비어있고 보정 소스(A ToolID/ToolNs)도 없습니다.");
                    return false;
                }
            }

            string passRangeB = (runB && opB != null)
                ? "(" + opB.FirstPassPercent.ToString("F2", CultureInfo.InvariantCulture) + "->" + opB.LastPassPercent.ToString("F2", CultureInfo.InvariantCulture) + ")"
                : "<skip>";
            DentalLogger.Log($"Composite2SplitLine2 - PassPercent: A({opA.FirstPassPercent:F2}->{opA.LastPassPercent:F2}), B={passRangeB}, Last(raw={lastPercent:F2}/eff={effectiveLastPercent:F2}), LastGuard={startEndOverflowGuardApplied}, BFirstGuard={startEndBFirstGuardApplied}");



            // OrientationStrategy=프로파일(4) 지원:
            // - backend 경사축 벡터(ABUTS_COMPOSITE_ORIENTATION_VECTOR)가 있으면
            //   FINISH_FRONT(opA)에 OrientationProfile을 런타임 생성/적용한다.
            // - 벡터가 없으면 PRC 기본값을 그대로 사용한다.
            TryApplyCompositeOrientationProfileFromEnv(opA, "A");

            // [중요] StockAllowance 적용 범위
            // - 과거 장애: A만 적용하고 B 적용이 누락되면, B 활성화 시 후속 NC 단계 불안정 가능.
            // - 원칙: A/B 모두 명시적으로 적용(또는 미적용 사유 로그)한다.
            DentalLogger.Log("Composite2SplitLine2 - opA/opB StepIncrement/StockAllowance/MaxLinkDistance 적용 시작");
            TrySetCompositeStepIncrement(opA, "A");
            if (runB && opB != null) TrySetCompositeStepIncrement(opB, "B");
            TryTouchCompositeMaximumLinkDistanceOnTechnology(opA, "A");
            if (runB && opB != null) TryTouchCompositeMaximumLinkDistanceOnTechnology(opB, "B");
            TrySetCompositeStockAllowance(opA, "A");
            if (runB && opB != null) TrySetCompositeStockAllowance(opB, "B");
            DentalLogger.Log("Composite2SplitLine2 - opA/opB StepIncrement/StockAllowance/MaxLinkDistance 적용 완료");

            int beforeAddCount = Document?.Operations?.Count ?? -1;
            DentalLogger.Log($"Composite2SplitLine2 - Operation 추가 시작 (beforeCount={beforeAddCount})");

            // 공정 순서 정책:
            // - A_PHASE 모드: FINISH_A만 생성 (TURN_B 이전 배치용)
            // - B_PHASE 모드: FINISH_B만 생성 (원래 순서 유지용)
            // - 기본 모드: A → B 생성
            if (runA)
            {
                int beforeAddCountBaseA = Document?.Operations?.Count ?? -1;
                TryDisableCompositeDynamicIfRequested(opA, "A");
                TryAddOperation(opA, freeFormFeature, "Composite2SplitLine2:A");
                TryAppendCompositeSuffixToNewOperations(beforeAddCountBaseA, finishAllMode ? "ALL" : "FRONT");
                int afterA = Document?.Operations?.Count ?? -1;
                DentalLogger.Log($"Composite2SplitLine2 - Operation 추가 완료: FINISH_FRONT(opA) (afterCount={afterA})");

                // Finish_End 공정은 요청에 따라 임시 비활성화한다. (툴패스 생성 금지)
                // TryAddCompositeExitLap(technologyUtility, effectivePrcA, freeFormFeature, opA, opA.LastPassPercent, "END", "A");
                DentalLogger.Log("Composite2SplitLine2 - Finish_End(A) 생성 비활성화(주석 처리)");

                TryMoveCompositeFinishBeforeTurnB("FINISH_FRONT");
            }
            else
            {
                DentalLogger.Log("Composite2SplitLine2 - phaseMode=B_PHASE, FINISH_FRONT 생성 생략");
            }

            if (runB)
            {
                int beforeAddCountB = Document?.Operations?.Count ?? -1;
                TryDisableCompositeDynamicIfRequested(opB, "B");
                TryAddOperation(opB, freeFormFeature, "Composite2SplitLine2:B");
                TryAppendCompositeSuffixToNewOperations(beforeAddCountB, "BACK");
                int afterB = Document?.Operations?.Count ?? -1;
                DentalLogger.Log($"Composite2SplitLine2 - Operation 추가 완료: FINISH_BACK(opB) (afterCount={afterB})");

                // Finish_Back 끝점 End lap(Finish_End) 공정은 요청에 따라 임시 비활성화한다.
                // TryAddCompositeExitLap(technologyUtility, effectivePrcB, freeFormFeature, opB, opB.LastPassPercent, "END", "B");
                DentalLogger.Log("Composite2SplitLine2 - Finish_End(B) 생성 비활성화(주석 처리)");

                // FINISH_B 이후 추가 확장 공정은 생성하지 않는다.
            }
            else
            {
                DentalLogger.Log("Composite2SplitLine2 - phaseMode=A_PHASE, FINISH_BACK 생성 생략");
            }

            int finalCount = Document?.Operations?.Count ?? -1;
            DentalLogger.Log($"Composite2SplitLine2 - 종료 (finalCount={finalCount})");
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

        private static bool TryCreateDedicatedCompositeDriveSurface(string context, string label, out int surfaceKey)
        {
            surfaceKey = 0;
            try
            {
                string surfaceRoot = ResolveSurfaceRoot();
                string projectFile = RL == 2.0 ? "Project2.igs" : "Project1.igs";
                string surfacePath = Path.Combine(surfaceRoot, projectFile);
                if (!File.Exists(surfacePath))
                {
                    DentalLogger.Log($"{context} - {label} DriveSurface 생성 실패: 파일 없음 ({surfacePath})");
                    return false;
                }

                GraphicObject dedicatedSurface = MergeSurfaceWithLogging(surfacePath, $"{context}:{label}:DriveSurface");
                if (dedicatedSurface == null)
                {
                    DentalLogger.Log($"{context} - {label} DriveSurface 생성 실패: MergeSurface null");
                    return false;
                }

                surfaceKey = SafeParseKey(Convert.ToString(dedicatedSurface.Key, CultureInfo.InvariantCulture));
                if (surfaceKey <= 0)
                {
                    DentalLogger.Log($"{context} - {label} DriveSurface 생성 실패: key 파싱 실패 (raw='{Convert.ToString(dedicatedSurface.Key, CultureInfo.InvariantCulture)}')");
                    return false;
                }

                DentalLogger.Log($"{context} - {label} DriveSurface 생성 완료: key={surfaceKey}, file={projectFile}");
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"{context} - {label} DriveSurface 생성 예외: {ex.GetType().Name}:{ex.Message}");
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
                DentalLogger.Log($"Composite2SplitLine2 - FirstPassPercent env 파싱 실패 (env={AppConfig.CompositeFirstPassPercentAEnv}, raw='{raw}')");
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
                DentalLogger.Log($"Composite2SplitLine2 - {label} StepIncrement env 비어있음 (env={envKey}), PRC 기본값 사용");
                return;
            }
            if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out double stepIncrement))
            {
                DentalLogger.Log($"Composite2SplitLine2 - {label} StepIncrement env 파싱 실패 (raw='{raw}'), PRC 기본값 사용");
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
                DentalLogger.Log($"Composite2SplitLine2 - {label} StepIncrement={stepIncrement.ToString("0.###", CultureInfo.InvariantCulture)} 적용 (PRC 파일 무변경, env={envKey})");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitLine2 - {label} StepIncrement 설정 실패: {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static void TryTouchCompositeMaximumLinkDistanceOnTechnology(TechLatheMill5xComposite op, string label)
        {
            if (op == null)
            {
                return;
            }

            string[] propertyNames = new[]
            {
                "MaximumLinkDistance",
                "MaxLinkDistance"
            };

            foreach (string propertyName in propertyNames)
            {
                try
                {
                    object current = op.GetType().InvokeMember(
                        propertyName,
                        BindingFlags.GetProperty,
                        null,
                        op,
                        null,
                        CultureInfo.InvariantCulture);

                    if (current == null)
                    {
                        continue;
                    }

                    op.GetType().InvokeMember(
                        propertyName,
                        BindingFlags.SetProperty,
                        null,
                        op,
                        new object[] { current },
                        CultureInfo.InvariantCulture);

                    DentalLogger.Log($"Composite2SplitLine2 - {label} {propertyName} touch 적용(value={current})");
                    return;
                }
                catch
                {
                }
            }

            DentalLogger.Log($"Composite2SplitLine2 - {label} MaximumLinkDistance touch 미지원(속성명 미해결)");
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
                TryPruneJustAddedOperationByCamDiameter(context, beforeCount, afterCount);
            }
            catch (Exception ex)
            {
                // option=false 등 비기본 옵션에서 실패하면 기본 옵션(Missing)으로 1회 재시도
                if (option != Missing.Value)
                {
                    try
                    {
                        DentalLogger.Log($"TryAddOperation:{context} - Add 재시도(option=Missing), firstErr={ex.GetType().Name}:{ex.Message}");
                        int beforeRetry = Document?.Operations?.Count ?? -1;
                        Document.Operations.Add(castTechnology, graphicObject, RuntimeHelpers.GetObjectValue(Missing.Value));
                        int afterRetry = Document?.Operations?.Count ?? -1;
                        DentalLogger.Log($"TryAddOperation:{context} - Add 재시도 성공 (afterCount={afterRetry})");
                        TryPruneJustAddedOperationByCamDiameter(context, beforeRetry, afterRetry);
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

        private static void TryPruneJustAddedOperationByCamDiameter(string context, int beforeCount, int afterCount)
        {
            try
            {
                if (!IsCamDiameterPruneContext(context))
                {
                    return;
                }

                double camDiameter = Document?.LatheMachineSetup?.BarDiameter ?? 0.0;
                if (camDiameter <= 0.0)
                {
                    return;
                }

                if (afterCount <= beforeCount || afterCount <= 0 || Document?.Operations == null)
                {
                    return;
                }

                object op = null;
                try { op = Document.Operations[afterCount]; } catch { }
                if (op == null)
                {
                    return;
                }

                if (TryResolveTechnologyToolDiameter(op, out double opToolDia, out string toolDesc) && opToolDia > camDiameter + 1e-6)
                {
                    try
                    {
                        Document.Operations.Remove(afterCount);
                        DentalLogger.Log($"TryAddOperation:{context} - CAMDia 후검증 제거: {toolDesc} Dia={opToolDia:0.###} > CAMDia={camDiameter:0.###}");
                    }
                    catch (Exception rmEx)
                    {
                        DentalLogger.Log($"TryAddOperation:{context} - CAMDia 후검증 제거 실패: {rmEx.GetType().Name}:{rmEx.Message}");
                    }
                }
                else
                {
                    DentalLogger.Log($"TryAddOperation:{context} - CAMDia 후검증 통과/해석불가 (CAMDia={camDiameter:0.###})");
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"TryAddOperation:{context} - CAMDia 후검증 예외: {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static bool IsCamDiameterPruneContext(string context)
        {
            if (string.IsNullOrWhiteSpace(context))
            {
                return false;
            }

            string c = context.Trim();
            return c.IndexOf("TurningOp", StringComparison.OrdinalIgnoreCase) >= 0
                || c.IndexOf("Rough", StringComparison.OrdinalIgnoreCase) >= 0
                || c.IndexOf("SplitAB", StringComparison.OrdinalIgnoreCase) >= 0;
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

        // Finish_Back / Finish_All 종료부 홈(툴 퇴출 자국) 방지용 End lap.
        // BackPointX 끝점에서 약 360°(1회전) 추가 가공 후 퇴출한다.
        private static void TryAddCompositeExitLap(
            TechnologyUtility technologyUtility,
            string prcPath,
            FreeFormFeature freeFormFeature,
            TechLatheMill5xComposite sourceOp,
            double endPassPercent,
            string finishLabel,
            string stepStockLabel)
        {
            try
            {
                if (Document == null || freeFormFeature == null)
                {
                    return;
                }

                double fixedPercent = Clamp(endPassPercent, 0.0, 100.0);
                string abLabel = string.Equals(stepStockLabel, "B", StringComparison.OrdinalIgnoreCase) ? "B" : "A";

                ITechnology[] lapTech = TryOpenProcess(technologyUtility, prcPath, $"Composite2ExitLap:{finishLabel}");
                if (lapTech.Length == 0 || !(lapTech[0] is TechLatheMill5xComposite lapOp))
                {
                    DentalLogger.Log($"Composite2ExitLap - PRC 로드/캐스팅 실패 (label={finishLabel})");
                    return;
                }

                lapOp.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;

                // 완전 0폭(First==Last)은 ESPRIT에서 툴패스가 사라질 수 있으므로,
                // StepIncrement 1피치(mm)를 StartEndScale(20mm) 기준 pass-percent로 변환해
                // 약 1회전(360°)에 해당하는 최소 유효 폭을 만든다.
                string stepEnvKey = string.Equals(abLabel, "B", StringComparison.OrdinalIgnoreCase)
                    ? AppConfig.CompositeStepIncrementBEnv
                    : AppConfig.CompositeStepIncrementAEnv;
                double stepMm = GetEnvDoubleNullable(stepEnvKey) ?? 0.25;
                const double startEndScaleMm = 20.0;
                double endLapWindowPercent = Clamp((stepMm / startEndScaleMm) * 100.0, 0.2, 5.0);

                double startPercent = Clamp(fixedPercent - endLapWindowPercent, 0.0, fixedPercent);
                double endPercent = fixedPercent;
                if (Math.Abs(endPercent - startPercent) < 1e-6)
                {
                    endPercent = Clamp(fixedPercent + endLapWindowPercent, fixedPercent, 100.0);
                }

                lapOp.FirstPassPercent = startPercent;
                lapOp.LastPassPercent = endPercent;

                if (sourceOp != null && !string.IsNullOrWhiteSpace(sourceOp.DriveSurface))
                {
                    lapOp.DriveSurface = sourceOp.DriveSurface;
                }

                if (string.IsNullOrWhiteSpace(lapOp.ToolID))
                {
                    if (sourceOp != null && !string.IsNullOrWhiteSpace(sourceOp.ToolID))
                    {
                        lapOp.ToolID = sourceOp.ToolID;
                    }
                    else if (!string.IsNullOrWhiteSpace(ToolNs))
                    {
                        lapOp.ToolID = ToolNs;
                    }
                }

                TrySetCompositeStepIncrement(lapOp, abLabel);
                TrySetCompositeStockAllowance(lapOp, abLabel);
                TryDisableCompositeDynamicIfRequested(lapOp, abLabel);

                int before = Document?.Operations?.Count ?? -1;
                TryAddOperation(lapOp, freeFormFeature, $"Composite2ExitLap:{finishLabel}");
                TryAppendCompositeSuffixToNewOperations(before, finishLabel);

                DentalLogger.Log($"Composite2ExitLap - 추가 완료 (label={finishLabel}, pass%={startPercent:F3}->{endPercent:F3}, stepMm={stepMm:F3}, window%={endLapWindowPercent:F3}, ToolID='{lapOp.ToolID ?? ""}', DriveSurface='{lapOp.DriveSurface ?? ""}')");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2ExitLap - 예외 (label={finishLabel}): {ex.GetType().Name}:{ex.Message}");
            }
        }

        // Front Face 기본 절삭 깊이(mm)
        // 우선순위: PRC BottomZLimit(절대값) > 기본값
        private const double FrontFaceFixedDepthMm = 1.0;
        private static double LastAppliedFrontFaceDepthMm = FrontFaceFixedDepthMm;

        // Face(EM2_0BALL) 안전가드 상수:
        // Rough_A 우측 끝보다 Face 우측 끝이 우측으로 더 나가면 공구 파손 위험이 있어,
        // 최소 0.3mm의 선행 절삭 여유를 강제한다.
        private const double FaceRightGuardMinGapMm = 0.3;

        // Rough_A 우측 종료 오프셋
        // 요청 반영: 기존 끝점에서 +2.0mm 이동
        // 기존 roughAEnd = splitX - 0.5mm  ->  변경 roughAEnd = splitX + 1.5mm
        private const double RoughAEndOffsetFromSplitMm = -1.5;



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
                if (!TryGetThreeStageSplitConfig(out double splitline1, out _, out double xMin, out double xMax))
                {
                    DentalLogger.Log("FaceRoughGuard - 3-stage split 계산 실패로 Front Rough 끝점 계산 생략");
                    return false;
                }

                const double faceToRoughMm = 2.2;
                const double frontFaceOffsetMm = 0.5;
                splitXUsed = splitline1;
                roughARightEndX = Clamp(splitline1 + frontFaceOffsetMm + faceToRoughMm, xMin + 1e-6, xMax - 1e-6);
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"FaceRoughGuard - Front Rough 우측 끝 계산 실패: {ex.GetType().Name}:{ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Front Face(ParallelPlanes) 가공 끝점을 FrontPointX 기준으로 고정 적용한다.
        /// - 목표: Face.RightX = FrontPointX + 1.0mm
        /// - 추가 상한: Face.RightX <= Splitline_2 - 1.0mm
        /// - RL=1: BottomZLimit = -Face.RightX
        /// - RL=2: BottomZLimit = +Face.RightX
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

                // PRC의 BottomZLimit 절대값을 우선 사용한다. (예: 0.5)
                double configuredDepthMm = Math.Abs(oldBottom);
                if (double.IsNaN(configuredDepthMm) || double.IsInfinity(configuredDepthMm) || configuredDepthMm < 1e-6)
                {
                    configuredDepthMm = FrontFaceFixedDepthMm;
                    DentalLogger.Log($"FrontFaceDepth[{context}] - PRC BottomZLimit이 유효하지 않아 기본깊이 fallback 사용: {configuredDepthMm:F3}mm");
                }

                LastAppliedFrontFaceDepthMm = configuredDepthMm;

                // 사용자 요청(2026-07-04): Front_Face 끝점을 Splitline_1(=FrontPointX) + 2.5mm로 적용한다.
                // 단, Splitline_2 - 1.0mm를 침범하지 않도록 상한 클램프를 적용한다.
                // 주의:
                // - 아래 FinishLine 경계 클램프/FaceRoughGuard가 후속으로 더 보수적으로 조정할 수 있다.
                const double frontFaceEndOffsetFromFrontMm = 2.5;
                double requestedFaceRightX = MoveSTL_Module.FrontPointX + frontFaceEndOffsetFromFrontMm;
                double appliedFaceRightX = requestedFaceRightX;

                // FinishLine 경계가 정상적이고, 요청 끝점보다 충분히 우측일 때만 상한 클램프를 적용한다.
                // (경계값이 FrontPointX 근처로 비정상 해석되는 케이스에서 요청값이 0으로 꺾이는 것을 방지)
                double boundaryX = MoveSTL_Module.FinishLineX;
                double front = MoveSTL_Module.FrontPointX;
                double back = MoveSTL_Module.BackPointX;
                double xMin = Math.Min(front, back) - 0.5;
                double xMax = Math.Max(front, back) + 0.5;
                bool boundaryValid = !double.IsNaN(boundaryX) && !double.IsInfinity(boundaryX) && Math.Abs(boundaryX) > 1e-6 && boundaryX >= xMin && boundaryX <= xMax;
                if (!boundaryValid)
                {
                    boundaryX = ResolveTurnConnectionBoundaryX($"FrontFaceDepth[{context}]");
                }

                bool finishLineClampApplied = false;
                bool finishLineClampIgnored = false;
                if (!double.IsNaN(boundaryX) && !double.IsInfinity(boundaryX))
                {
                    if (boundaryX > requestedFaceRightX + 1e-6)
                    {
                        if (appliedFaceRightX > boundaryX)
                        {
                            appliedFaceRightX = boundaryX;
                            finishLineClampApplied = true;
                        }
                    }
                    else
                    {
                        finishLineClampIgnored = true;
                    }
                }

                // 추가 정책(요청 반영): Front_Face 끝점은 Splitline_2 - 1.0mm를 침범하면 안 된다.
                bool splitline2ClampApplied = false;
                double splitline2Used = double.NaN;
                if (TryGetThreeStageSplitConfig(out _, out double splitline2, out _, out _))
                {
                    splitline2Used = splitline2;
                    const double splitline2SafetyGapMm = 1.0;
                    double maxFaceRightBySplitline2 = splitline2 - splitline2SafetyGapMm;
                    if (appliedFaceRightX >= maxFaceRightBySplitline2)
                    {
                        double before = appliedFaceRightX;
                        appliedFaceRightX = maxFaceRightBySplitline2;
                        splitline2ClampApplied = true;
                        DentalLogger.Log($"FrontFaceDepth[{context}] - Splitline_2 안전간격 클램프 적용: Face.RightX {before:F3}->{appliedFaceRightX:F3}, Splitline_2={splitline2:F3}, gap={splitline2SafetyGapMm:F3}");
                    }
                }
                else
                {
                    DentalLogger.Log($"FrontFaceDepth[{context}] - Splitline_2 해석 실패로 좌측 클램프 생략");
                }

                faceOp.TopZLimit = 1.0;
                double oldBottom2 = faceOp.BottomZLimit;
                if (RL == 1.0)
                {
                    faceOp.BottomZLimit = -appliedFaceRightX;
                }
                else if (RL == 2.0)
                {
                    faceOp.BottomZLimit = appliedFaceRightX;
                }
                else
                {
                    // RL 비정상 값은 기존 default 흐름을 해치지 않기 위해 RL=1 기준으로 처리
                    faceOp.BottomZLimit = -appliedFaceRightX;
                    DentalLogger.Log($"FrontFaceDepth[{context}] - RL 비정상({RL}), RL=1 기준으로 적용");
                }

                DentalLogger.Log($"FrontFaceDepth[{context}] - FrontPoint 고정 오프셋 적용: requestRightX={requestedFaceRightX:F3}, appliedRightX={appliedFaceRightX:F3}, TopZ:{oldTop:F3}->{faceOp.TopZLimit:F3}, BottomZ:{oldBottom:F3}->{oldBottom2:F3}->{faceOp.BottomZLimit:F3}, PRCDepthRef={configuredDepthMm:F3}, FinishBoundaryX={boundaryX:F3}, ClampApplied={finishLineClampApplied}, ClampIgnored={finishLineClampIgnored}, Splitline2={splitline2Used:F3}, Splitline2Clamp={splitline2ClampApplied}");
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



        private static bool IsCompositeNameLike(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                return false;
            }

            string normalized = name.Trim();
            if (normalized.IndexOf("composite", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            // 현장 오타 호환: "5Axisomposite"(c 누락) 같은 케이스도 composite 계열로 인식
            bool hasOmp = normalized.IndexOf("omposite", StringComparison.OrdinalIgnoreCase) >= 0;
            bool hasAxis = normalized.IndexOf("axis", StringComparison.OrdinalIgnoreCase) >= 0;
            return hasOmp && hasAxis;
        }

        private static string BuildCompositeOperationName(string suffix)
        {
            // 표준 토큰: FINISH_FRONT / FINISH_BACK / FINISH_ALL
            // (FINISH_A/B는 레거시 입력 호환만 유지)
            if (string.Equals(suffix, "FINISH_FRONT", StringComparison.OrdinalIgnoreCase)
                || string.Equals(suffix, "FINISH_A", StringComparison.OrdinalIgnoreCase))
            {
                return "Finish_Front";
            }
            if (string.Equals(suffix, "FINISH_BACK", StringComparison.OrdinalIgnoreCase)
                || string.Equals(suffix, "FINISH_B", StringComparison.OrdinalIgnoreCase)
                || string.Equals(suffix, "FINISH_B1", StringComparison.OrdinalIgnoreCase))
            {
                return "Finish_Back";
            }
            if (string.Equals(suffix, "FINISH_ALL", StringComparison.OrdinalIgnoreCase))
            {
                return "Finish_All";
            }
            if (string.Equals(suffix, "FINISH_END", StringComparison.OrdinalIgnoreCase))
            {
                return "Finish_End";
            }
            return $"5 Axis Composite [{suffix}]";
        }

        private static string ResolveCompositeSuffixFromLabel(string label)
        {
            if (string.IsNullOrWhiteSpace(label))
            {
                return null;
            }

            string normalized = label.Trim();

            // 구분 정책(표준):
            // - ALL   -> FINISH_ALL
            // - FRONT -> FINISH_FRONT
            // - BACK  -> FINISH_BACK
            if (normalized.StartsWith("ALL", StringComparison.OrdinalIgnoreCase))
            {
                return "FINISH_ALL";
            }
            if (normalized.StartsWith("FRONT", StringComparison.OrdinalIgnoreCase))
            {
                return "FINISH_FRONT";
            }
            if (normalized.StartsWith("BACK", StringComparison.OrdinalIgnoreCase))
            {
                return "FINISH_BACK";
            }
            if (normalized.StartsWith("END", StringComparison.OrdinalIgnoreCase))
            {
                return "FINISH_END";
            }

            // 레거시 라벨(A/B)은 입력 호환만 허용하고 표준 토큰으로 승격한다.
            if (normalized.StartsWith("A", StringComparison.OrdinalIgnoreCase))
            {
                return "FINISH_FRONT";
            }
            if (normalized.StartsWith("B", StringComparison.OrdinalIgnoreCase))
            {
                return "FINISH_BACK";
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

                    string baseName = string.IsNullOrWhiteSpace(oldName) ? "5 Axis Composite" : oldName.Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "[FINISH_FRONT]").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "[FINISH_BACK]").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "[FINISH_ALL]").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "[FINISH_END]").Trim();

                    baseName = RemoveTokenIgnoreCase(baseName, "[Finish_Front]").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "[Finish_Back]").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "[Finish_All]").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "[Finish_End]").Trim();

                    // 레거시 토큰 정리
                    baseName = RemoveTokenIgnoreCase(baseName, "[FINISH_A]").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "[FINISH_B]").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "[Finish_A]").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "[Finish_B]").Trim();

                    // 구버전 토큰 정리(마이그레이션 호환)
                    baseName = RemoveTokenIgnoreCase(baseName, "[FINISH_B1]").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "[Finish_B1]").Trim();

                    baseName = RemoveTokenIgnoreCase(baseName, "_A").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "_B").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "_C").Trim();
                    baseName = RemoveTokenIgnoreCase(baseName, "_D").Trim();
                    while (baseName.IndexOf("  ", StringComparison.Ordinal) >= 0)
                    {
                        baseName = baseName.Replace("  ", " ");
                    }
                    if (string.IsNullOrWhiteSpace(baseName))
                    {
                        baseName = "5 Axis Composite";
                    }

                    // 이름은 항상 표준 표기로 강제한다.
                    string newName = BuildCompositeOperationName(suffix);

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

                    DentalLogger.Log($"Composite2SplitLine2 - 이름 접미사 적용({label}): '{baseName}' -> '{newName}'");
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitLine2 - 이름 접미사 적용 실패({label}): {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static void TryMoveCompositeFinishBeforeTurnB(string preferredFinishToken)
        {
            try
            {
                if (Document?.Operations == null)
                {
                    return;
                }

                bool IsMatch(int index, string token)
                {
                    object op = null;
                    try { op = Document.Operations[index]; } catch { }
                    if (op == null)
                    {
                        return false;
                    }

                    string name = null;
                    try
                    {
                        dynamic dynOp = op;
                        name = dynOp.Name as string;
                    }
                    catch
                    {
                        try { name = (string)op.GetType().InvokeMember("Name", BindingFlags.GetProperty, null, op, null); } catch { }
                    }

                    if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(token))
                    {
                        return false;
                    }

                    if (!IsCompositeNameLike(name))
                    {
                        return false;
                    }

                    return name.IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0;
                }

                int FindFirstIndex(Func<int, bool> predicate)
                {
                    int count = Document.Operations.Count;
                    for (int i = 1; i <= count; i++)
                    {
                        if (predicate(i))
                        {
                            return i;
                        }
                    }
                    return -1;
                }

                int finishIndex = FindFirstIndex(i => IsMatch(i, preferredFinishToken));
                int turnBIndex = FindFirstIndex(i =>
                {
                    object op = null;
                    try { op = Document.Operations[i]; } catch { }
                    if (op == null) return false;

                    string name = null;
                    try
                    {
                        dynamic dynOp = op;
                        name = dynOp.Name as string;
                    }
                    catch
                    {
                        try { name = (string)op.GetType().InvokeMember("Name", BindingFlags.GetProperty, null, op, null); } catch { }
                    }

                    if (string.IsNullOrWhiteSpace(name)) return false;
                    return name.IndexOf("[TURN_B]", StringComparison.OrdinalIgnoreCase) >= 0
                        || name.IndexOf("TURN_B", StringComparison.OrdinalIgnoreCase) >= 0;
                });

                if (finishIndex < 1 || turnBIndex < 1)
                {
                    DentalLogger.Log($"Composite2SplitLine2 - Finish/Turn_B 재정렬 스킵: finishIndex={finishIndex}, turnBIndex={turnBIndex}");
                    return;
                }

                if (finishIndex == turnBIndex - 1)
                {
                    DentalLogger.Log($"Composite2SplitLine2 - Finish/Turn_B 재정렬 불필요(이미 바로 위): finishIndex={finishIndex}, turnBIndex={turnBIndex}");
                    return;
                }

                object finishOp = null;
                object turnBOp = null;
                try { finishOp = Document.Operations[finishIndex]; } catch { }
                try { turnBOp = Document.Operations[turnBIndex]; } catch { }

                bool moved = false;
                object ops = Document.Operations;

                // 시도 1: 컬렉션 MoveBefore(op, target)
                try
                {
                    ops.GetType().InvokeMember("MoveBefore", BindingFlags.InvokeMethod, null, ops, new object[] { finishOp, turnBOp });
                    moved = true;
                }
                catch { }

                // 시도 2: 컬렉션 MoveBefore(fromIndex, toIndex)
                if (!moved)
                {
                    try
                    {
                        ops.GetType().InvokeMember("MoveBefore", BindingFlags.InvokeMethod, null, ops, new object[] { finishIndex, turnBIndex });
                        moved = true;
                    }
                    catch { }
                }

                // 시도 3: 컬렉션 Move(fromIndex, toIndex)
                if (!moved)
                {
                    try
                    {
                        int targetIndex = Math.Max(1, turnBIndex - 1);
                        ops.GetType().InvokeMember("Move", BindingFlags.InvokeMethod, null, ops, new object[] { finishIndex, targetIndex });
                        moved = true;
                    }
                    catch { }
                }

                // 시도 4: Op 단위 MoveBefore(targetOp)
                if (!moved && finishOp != null && turnBOp != null)
                {
                    try
                    {
                        finishOp.GetType().InvokeMember("MoveBefore", BindingFlags.InvokeMethod, null, finishOp, new object[] { turnBOp });
                        moved = true;
                    }
                    catch { }
                }

                DentalLogger.Log($"Composite2SplitLine2 - Finish/Turn_B 재정렬 시도 결과: moved={moved}, finishIndex={finishIndex}, turnBIndex={turnBIndex}");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitLine2 - Finish/Turn_B 재정렬 예외: {ex.GetType().Name}:{ex.Message}");
            }
        }

        internal static void TryNormalizeCompositeFinishOrderAfterFreeForm()
        {
            try
            {
                // FreeFormMill 종료 후 후처리 보정:
                // 1) 이름 포맷 표준화(5 Axis Composite [FINISH_*])
                // 2) FINISH_A를 TURN_B 바로 위로 재정렬
                if (Document?.Operations == null)
                {
                    return;
                }

                int count = Document.Operations.Count;
                if (count <= 0)
                {
                    return;
                }

                for (int i = 1; i <= count; i++)
                {
                    object op = null;
                    try { op = Document.Operations[i]; } catch { }
                    if (op == null) continue;

                    string oldName = null;
                    try
                    {
                        dynamic d = op;
                        oldName = d.Name as string;
                    }
                    catch
                    {
                        try { oldName = (string)op.GetType().InvokeMember("Name", BindingFlags.GetProperty, null, op, null); } catch { }
                    }

                    if (string.IsNullOrWhiteSpace(oldName)) continue;
                    if (!IsCompositeNameLike(oldName)) continue;

                    string mapped = null;
                    if (oldName.IndexOf("FINISH_FRONT", StringComparison.OrdinalIgnoreCase) >= 0
                        || oldName.IndexOf("Finish_Front", StringComparison.OrdinalIgnoreCase) >= 0
                        || oldName.IndexOf("FINISH_A", StringComparison.OrdinalIgnoreCase) >= 0
                        || oldName.IndexOf("Finish_A", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        mapped = "FINISH_FRONT";
                    }
                    else if (oldName.IndexOf("FINISH_BACK", StringComparison.OrdinalIgnoreCase) >= 0
                        || oldName.IndexOf("Finish_Back", StringComparison.OrdinalIgnoreCase) >= 0
                        || oldName.IndexOf("FINISH_B", StringComparison.OrdinalIgnoreCase) >= 0
                        || oldName.IndexOf("Finish_B", StringComparison.OrdinalIgnoreCase) >= 0
                        || oldName.IndexOf("FINISH_B1", StringComparison.OrdinalIgnoreCase) >= 0
                        || oldName.IndexOf("Finish_B1", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        mapped = "FINISH_BACK";
                    }
                    else if (oldName.IndexOf("FINISH_ALL", StringComparison.OrdinalIgnoreCase) >= 0 || oldName.IndexOf("Finish_All", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        mapped = "FINISH_ALL";
                    }
                    else if (oldName.IndexOf("FINISH_END", StringComparison.OrdinalIgnoreCase) >= 0 || oldName.IndexOf("Finish_End", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        mapped = "FINISH_END";
                    }



                    if (string.IsNullOrWhiteSpace(mapped)) continue;

                    string newName = BuildCompositeOperationName(mapped);
                    bool renamed = false;
                    try
                    {
                        dynamic d = op;
                        d.Name = newName;
                        renamed = true;
                    }
                    catch { }

                    if (!renamed)
                    {
                        try { op.GetType().InvokeMember("Name", BindingFlags.SetProperty, null, op, new object[] { newName }); } catch { }
                    }
                }

                TryMoveCompositeFinishBeforeTurnB("FINISH_FRONT");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitLine2 - FreeForm 후처리 정렬/정규화 실패: {ex.GetType().Name}:{ex.Message}");
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
                    DentalLogger.Log("RoughFreeFromMillSplitAB - RoughType==3은 현재 분할 미지원. 기존 로직으로 진행");
                }
                return false;
            }

            if (!TryGetSplitABConfig(out _, out string prcA, out string prcB))
            {
                DentalLogger.Log("RoughFreeFromMillSplitAB - Split 설정 비활성으로 기존 RoughFreeFromMill 경로 사용");
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
                DentalLogger.Log("RoughFreeFromMillSplitAB - FreeFormFeature(0/180) 누락. 분할 중단");
                return true;
            }

            if (!TryGetThreeStageSplitConfig(out double splitline1, out double splitline2, out double xMin, out double xMax))
            {
                DentalLogger.Log("RoughFreeFromMillSplitAB - 3-stage split 계산 실패");
                return true;
            }

            const double faceToRoughMm = 2.2;
            const double frontFaceOffsetMm = 0.5;
            const double middleRoughOverCutMm = 2.2;
            const double backRoughOverCutMm = 2.2;

            double frontStart = xMin;
            // 요청사항: Front Rough는 Face(FrontPointX+0.5)보다 +2.2mm 길게
            double frontEnd = Clamp(splitline1 + frontFaceOffsetMm + faceToRoughMm, xMin + 1e-6, xMax - 1e-6);

            double middleStart = Clamp(splitline1 - middleRoughOverCutMm, xMin + 1e-6, xMax - 1e-6);
            double middleEnd = Clamp(splitline2 + middleRoughOverCutMm, xMin + 1e-6, xMax - 1e-6);

            double backStart = Clamp(splitline2 - backRoughOverCutMm, xMin + 1e-6, xMax - 1e-6);
            double backEnd = xMax;

            double radius = (Document.LatheMachineSetup.BarDiameter + 10.0) / 2.0;
            FeatureChain frontBoundary = EnsureRectBoundary("RoughBoundryFront1", frontStart, frontEnd, radius, -radius);
            FeatureChain middleBoundary = EnsureRectBoundary("RoughBoundryMiddle1", middleStart, middleEnd, radius, -radius);
            FeatureChain backBoundary = EnsureRectBoundary("RoughBoundryBack1", backStart, backEnd, radius, -radius);
            if (frontBoundary == null || middleBoundary == null || backBoundary == null)
            {
                DentalLogger.Log("RoughFreeFromMillSplitAB - Front/Middle/Back 경계 체인 생성 실패");
                return true;
            }

            int keyFront = SafeParseKey(frontBoundary.Key);
            int keyMiddle = SafeParseKey(middleBoundary.Key);
            int keyBack = SafeParseKey(backBoundary.Key);
            double twoPhaseSplitLineDiag = 0.0;
            if (!TryResolveTwoPhaseSplitLineX(out twoPhaseSplitLineDiag))
            {
                TryResolveTwoPhaseSplitLineTargetX(out twoPhaseSplitLineDiag, out _);
            }
            DentalLogger.Log($"RoughFreeFromMillSplitAB - split1:{splitline1:0.###}, split2:{splitline2:0.###}, TwoPhaseSplitLine:{twoPhaseSplitLineDiag:0.###}, Front:[{frontStart:0.###}~{frontEnd:0.###}] key={keyFront}, Middle:[{middleStart:0.###}~{middleEnd:0.###}] key={keyMiddle}, Back:[{backStart:0.###}~{backEnd:0.###}] key={keyBack}, PRC_A:{prcA}, PRC_B:{prcB}");

            TechnologyUtility technologyUtility = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
            Layer activeLayer = GetOrCreateLayer("RoughFreeFormMill");
            if (activeLayer == null)
            {
                DentalLogger.Log("RoughFreeFromMillSplitAB - RoughFreeFormMill 레이어 확보 실패");
                return true;
            }
            Document.ActiveLayer = activeLayer;

            EnsureThreeStageSplitGuideLines(splitline1, splitline2);

            string region = (GetEnvString("ABUTS_ROUGHFREEFORM_SPLIT_REGION") ?? string.Empty).Trim().ToUpperInvariant();
            string sharedPrc = !string.IsNullOrWhiteSpace(prcA) ? prcA : prcB;
            if (string.Equals(region, "FRONT", StringComparison.OrdinalIgnoreCase))
            {
                AddSplitOpsForRegion("FRONT", sharedPrc, keyFront, technologyUtility, ff0, ff180);
            }
            else if (string.Equals(region, "MIDDLE", StringComparison.OrdinalIgnoreCase))
            {
                AddSplitOpsForRegion("MIDDLE", sharedPrc, keyMiddle, technologyUtility, ff0, ff180);
            }
            else if (string.Equals(region, "BACK", StringComparison.OrdinalIgnoreCase))
            {
                AddSplitOpsForRegion("BACK", sharedPrc, keyBack, technologyUtility, ff0, ff180);
            }
            else
            {
                AddSplitOpsForRegion("FRONT", sharedPrc, keyFront, technologyUtility, ff0, ff180);
                AddSplitOpsForRegion("MIDDLE", sharedPrc, keyMiddle, technologyUtility, ff0, ff180);
                AddSplitOpsForRegion("BACK", sharedPrc, keyBack, technologyUtility, ff0, ff180);
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

            double camDiameter = Document?.LatheMachineSetup?.BarDiameter ?? 0.0;

            if (tech[0] is TechLatheMoldRoughing roughing)
            {
                if (camDiameter > 0.0 && TryResolveTechnologyToolDiameter(roughing, out double roughToolDia, out string roughDesc) && roughToolDia > camDiameter + 1e-6)
                {
                    DentalLogger.Log($"RoughFreeFromMillSplitAB - Region:{region} Angle:{angleLabel} Roughing skip {roughDesc} Dia={roughToolDia:0.###} > CAMDia={camDiameter:0.###}");
                }
                else
                {
                    roughing.BoundaryProfiles = "";
                    roughing.BoundaryProfiles = "6," + boundaryKey.ToString(CultureInfo.InvariantCulture);
                    TryAddOperation(roughing, freeFormFeature, $"SplitAB:{region}:{angleLabel}:Roughing");
                }
            }

            if (tech.Length > 1 && tech[1] is TechLatheMoldZLevel zlevel)
            {
                if (camDiameter > 0.0 && TryResolveTechnologyToolDiameter(zlevel, out double zLevelToolDia, out string zLevelDesc) && zLevelToolDia > camDiameter + 1e-6)
                {
                    DentalLogger.Log($"RoughFreeFromMillSplitAB - Region:{region} Angle:{angleLabel} ZLevel skip {zLevelDesc} Dia={zLevelToolDia:0.###} > CAMDia={camDiameter:0.###}");
                }
                else
                {
                    zlevel.BoundaryProfiles = "";
                    zlevel.BoundaryProfiles = "6," + boundaryKey.ToString(CultureInfo.InvariantCulture);
                    TryAddOperation(zlevel, freeFormFeature, $"SplitAB:{region}:{angleLabel}:ZLevel");
                }
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

        // 3-stage 분할 기준
        // - Splitline_1: FrontPointX
        // - Splitline_2: Rough Middle/Back 경계용 선
        // - TwoPhaseSplitLine: Finish_Front/Finish_Back 경계용 선(= finishLineTopZ 상방 +1.0mm)
        private static bool TryGetThreeStageSplitConfig(out double splitline1, out double splitline2, out double xMin, out double xMax)
        {
            splitline1 = 0.0;
            splitline2 = 0.0;
            xMin = 0.0;
            xMax = 0.0;

            try
            {
                double front = MoveSTL_Module.FrontPointX;
                double back = MoveSTL_Module.BackPointX;
                double frontBackMin = Math.Min(front, back);
                xMin = Math.Min(0.0, frontBackMin);
                xMax = Math.Max(front, back);
                if (xMax - xMin < 1e-6)
                {
                    DentalLogger.Log($"ThreeStageSplit - 범위 부족: xMin={xMin:F3}, xMax={xMax:F3}");
                    return false;
                }

                splitline1 = Clamp(front, xMin + 1e-6, xMax - 1e-6);

                // Finish 경계용 TwoPhaseSplitLine은 항상 +1.0mm 정의를 사용
                if (!TryResolveTwoPhaseSplitLineTargetX(out double twoPhaseSplitLineX, out string twoPhaseSource))
                {
                    DentalLogger.Log("ThreeStageSplit - TwoPhaseSplitLine 계산 실패");
                    return false;
                }

                string retentionGroove = (GetEnvString("ABUTS_RETENTION_GROOVE") ?? string.Empty).Trim().ToLowerInvariant();

                // 정책 보정:
                // Splitline_2는 retentionGroove 값과 무관하게
                // finish line 기준(TwoPhaseSplitLine)과 동일 좌표를 사용한다.
                // (midpoint 분기는 finish line 기준이 중간값으로 내려가는 문제를 유발)
                splitline2 = twoPhaseSplitLineX;
                DentalLogger.Log($"ThreeStageSplit - Splitline_2=TwoPhaseSplitLine({splitline2:F3}) 고정 적용, retentionGroove='{retentionGroove}', source={twoPhaseSource}, xRange=[{xMin:F3}~{xMax:F3}], front={front:F3}, back={back:F3}");

                // 두 라인을 모두 유지한다.
                EnsureThreeStageSplitGuideLines(splitline1, splitline2);
                EnsureTwoPhaseSplitGuideLine(twoPhaseSplitLineX);

                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"ThreeStageSplit - 계산 실패: {ex.GetType().Name}:{ex.Message}");
                return false;
            }
        }

        private static bool TryResolveTwoPhaseSplitLineTargetX(out double splitX, out string source)
        {
            splitX = 0.0;
            source = "";

            try
            {
                double front = MoveSTL_Module.FrontPointX;
                double back = MoveSTL_Module.BackPointX;
                double frontBackMin = Math.Min(front, back);
                double xMin = Math.Min(0.0, frontBackMin);
                double xMax = Math.Max(front, back);

                double? envSplitX = GetEnvDoubleNullable(AppConfig.TwoPhaseSplitXEnv) ?? GetEnvDoubleNullable("ABUTS_ROUGHFREEFORM_SPLIT_X");
                if (envSplitX.HasValue && !double.IsNaN(envSplitX.Value) && !double.IsInfinity(envSplitX.Value))
                {
                    splitX = Clamp(envSplitX.Value, xMin + 1e-6, xMax - 1e-6);
                    source = "env";
                    return true;
                }

                // [SSOT] TwoPhaseSplitLine 오프셋 정책(2026-07-01)
                // - 기준점: finish line 최상단(top Z)이 변환된 X 좌표
                // - 가공 요청 보정: 기준점에서 X축 -1.0mm(좌측) 이동
                //   * 본 코드베이스 좌표계에서 "좌측"은 X 감소 방향이다.
                // - 동일 오프셋을 StlFileProcessor.TryApplyTwoPhaseSplitByFinishLine에도 동일 적용해야 한다.
                //   (env 주입 경로 / 재계산 경로 불일치 방지)
                const double twoPhaseSplitOffsetMm = -1.0;

                double finishLineTopZ = MoveSTL_Module.FinishLineTopZ;
                if (!double.IsNaN(finishLineTopZ) && !double.IsInfinity(finishLineTopZ) && finishLineTopZ > 0.001)
                {
                    // FinishLineTopZ -> X 변환식
                    //   finishLineTopX = back - finishLineTopZ + DefaultStlShift
                    // 최종 split X
                    //   splitX = finishLineTopX + (-1.0mm)
                    double finishLineTopX = back - finishLineTopZ + AppConfig.DefaultStlShift;
                    double requested = finishLineTopX + twoPhaseSplitOffsetMm;
                    splitX = Clamp(requested, xMin + 1e-6, xMax - 1e-6);
                    source = "finishlineTopZ-1mm";
                    return true;
                }

                // topZ가 없을 때만 FinishLineX를 보조 사용한다.
                // 동일 정책 유지를 위해 fallback에도 -1.0mm 오프셋을 동일 적용한다.
                double finishLineX = MoveSTL_Module.FinishLineX;
                if (!double.IsNaN(finishLineX) && !double.IsInfinity(finishLineX) && Math.Abs(finishLineX) > 1e-6)
                {
                    double requested = finishLineX + twoPhaseSplitOffsetMm;
                    splitX = Clamp(requested, xMin + 1e-6, xMax - 1e-6);
                    source = "finishlinex-fallback-1mm";
                    return true;
                }

                splitX = Clamp((front + back) / 2.0, xMin + 1e-6, xMax - 1e-6);
                source = "midpoint-fallback";
                return true;
            }
            catch
            {
                source = "error";
                return false;
            }
        }

        private static void EnsureTwoPhaseSplitGuideLine(double splitX)
        {
            try
            {
                if (Document == null || Document.LatheMachineSetup == null)
                {
                    return;
                }

                Layer layer = GetOrCreateLayer("TwoPhaseGuides");
                if (layer != null)
                {
                    Document.ActiveLayer = layer;
                }



                double radius = (Document.LatheMachineSetup.BarDiameter + 10.0) / 2.0;
                FeatureChain existing = FindFeatureChainByName("TwoPhaseSplitLine");
                if (existing != null)
                {
                    double? existingX = null;
                    try
                    {
                        Point p0 = existing.PointAlong(0.0);
                        Point p1 = existing.PointAlong(1.0);
                        if (p0 != null && p1 != null && !double.IsNaN(p0.X) && !double.IsNaN(p1.X) && !double.IsInfinity(p0.X) && !double.IsInfinity(p1.X))
                        {
                            existingX = (p0.X + p1.X) / 2.0;
                        }
                        else if (p0 != null && !double.IsNaN(p0.X) && !double.IsInfinity(p0.X))
                        {
                            existingX = p0.X;
                        }
                        else if (p1 != null && !double.IsNaN(p1.X) && !double.IsInfinity(p1.X))
                        {
                            existingX = p1.X;
                        }
                    }
                    catch { }

                    // 기존 라인이 현재 기준과 다르면 갱신한다.
                    if (existingX.HasValue && Math.Abs(existingX.Value - splitX) <= 0.001)
                    {
                        return;
                    }

                    try
                    {
                        Document.FeatureChains.Remove(existing);
                        DentalLogger.Log($"TwoPhaseSplitGuideLine - 기존 라인 갱신: oldX={(existingX.HasValue ? existingX.Value.ToString("0.###", CultureInfo.InvariantCulture) : "<unknown>")} -> newX={splitX.ToString("0.###", CultureInfo.InvariantCulture)}");
                    }
                    catch (Exception removeEx)
                    {
                        DentalLogger.Log($"TwoPhaseSplitGuideLine - 기존 라인 제거 실패: {removeEx.GetType().Name}:{removeEx.Message}");
                        return;
                    }
                }

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

        private static void EnsureThreeStageSplitGuideLines(double splitline1, double splitline2)
        {
            try
            {
                if (Document == null || Document.LatheMachineSetup == null)
                {
                    return;
                }

                Layer layer = GetOrCreateLayer("ThreeStageGuides");
                if (layer != null)
                {
                    Document.ActiveLayer = layer;
                }

                double radius = (Document.LatheMachineSetup.BarDiameter + 10.0) / 2.0;

                FeatureChain line1 = FindFeatureChainByName("Splitline_1");
                if (line1 != null)
                {
                    try
                    {
                        Point l1p0 = line1.PointAlong(0.0);
                        Point l1p1 = line1.PointAlong(1.0);
                        double currentX = (l1p0 != null && l1p1 != null) ? (l1p0.X + l1p1.X) / 2.0 : (l1p0 != null ? l1p0.X : (l1p1 != null ? l1p1.X : double.NaN));
                        if (double.IsNaN(currentX) || Math.Abs(currentX - splitline1) > 0.001)
                        {
                            Document.FeatureChains.Remove(line1);
                            line1 = null;
                        }
                    }
                    catch
                    {
                        try { Document.FeatureChains.Remove(line1); } catch { }
                        line1 = null;
                    }
                }

                if (line1 == null)
                {
                    Point pTop1 = Document.GetPoint(splitline1, radius, 0);
                    Point pBottom1 = Document.GetPoint(splitline1, -radius, 0);
                    line1 = Document.FeatureChains.Add(pTop1);
                    line1.Add(Document.GetSegment(pTop1, pBottom1));
                    line1.Name = "Splitline_1";
                }

                FeatureChain line2 = FindFeatureChainByName("Splitline_2");
                if (line2 != null)
                {
                    try
                    {
                        Point l2p0 = line2.PointAlong(0.0);
                        Point l2p1 = line2.PointAlong(1.0);
                        double currentX = (l2p0 != null && l2p1 != null) ? (l2p0.X + l2p1.X) / 2.0 : (l2p0 != null ? l2p0.X : (l2p1 != null ? l2p1.X : double.NaN));
                        if (double.IsNaN(currentX) || Math.Abs(currentX - splitline2) > 0.001)
                        {
                            Document.FeatureChains.Remove(line2);
                            line2 = null;
                        }
                    }
                    catch
                    {
                        try { Document.FeatureChains.Remove(line2); } catch { }
                        line2 = null;
                    }
                }

                if (line2 == null)
                {
                    Point pTop2 = Document.GetPoint(splitline2, radius, 0);
                    Point pBottom2 = Document.GetPoint(splitline2, -radius, 0);
                    line2 = Document.FeatureChains.Add(pTop2);
                    line2.Add(Document.GetSegment(pTop2, pBottom2));
                    line2.Name = "Splitline_2";
                }

                DentalLogger.Log($"ThreeStageSplitGuideLine - splitline1:{splitline1:0.###}, splitline2:{splitline2:0.###} 생성/확인 완료");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"ThreeStageSplitGuideLine 생성 실패: {ex.GetType().Name}:{ex.Message}");
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

        private static double PassPercentToX(double passPercent, double frontX, double direction, double absSpan)
        {
            if (double.IsNaN(passPercent) || double.IsInfinity(passPercent) || Math.Abs(absSpan) < 1e-6 || Math.Abs(direction) < 1e-9)
            {
                return frontX;
            }

            double ratio = passPercent / 100.0;
            return frontX + direction * absSpan * ratio;
        }

        // StartEndPosition pass-percent 기준 길이(mm).
        // Composite Start/End 계산(특히 D 고정폭, TwoPhaseSplitLine 경계 환산)은 이 스케일을 SSOT로 사용한다.
        private const double StartEndScaleMm = 20.0;

        // X(mm) -> pass-percent (StartEndScale 기준)
        // 규칙: passPercent = (x / StartEndScaleMm) * 100
        // 주의: Front~Back span 기반 변환과 혼용하지 않는다.
        private static double XToPassPercentByStartEndScale(double x, double minPercent, double maxPercent)
        {
            if (double.IsNaN(x) || double.IsInfinity(x))
            {
                return Clamp(minPercent, minPercent, maxPercent);
            }

            double passPercent = x / StartEndScaleMm * 100.0;
            return Clamp(passPercent, minPercent, maxPercent);
        }

        // X(mm) -> pass-percent (Front~Back span 기반)
        // 디버그/비교용. StartEndScale 기준과 결과가 다를 수 있으므로 정책 결정에 임의 사용 금지.
        private static double XToPassPercentBySpan(double x, double frontX, double direction, double absSpan, double minPercent, double maxPercent)
        {
            if (double.IsNaN(x) || double.IsInfinity(x) || Math.Abs(absSpan) < 1e-6 || Math.Abs(direction) < 1e-9)
            {
                return Clamp(minPercent, minPercent, maxPercent);
            }

            double passPercent = (x - frontX) / (direction * absSpan) * 100.0;
            return Clamp(passPercent, minPercent, maxPercent);
        }

        // StartEndPosition pass-percent는 공정 기준 길이(20mm) 스케일로 해석한다.
        // mm -> percent 변환: deltaPercent = (mm / StartEndScaleMm) * 100.0
        private static double ShiftPassPercentByStartEndScaleMm(
            double passPercent,
            double offsetMm,
            double minPercent,
            double maxPercent)
        {
            if (double.IsNaN(passPercent) || double.IsInfinity(passPercent))
            {
                return Clamp(minPercent, minPercent, maxPercent);
            }

            double deltaPercent = (offsetMm / StartEndScaleMm) * 100.0;
            double shiftedPercent = passPercent + deltaPercent;
            return Clamp(shiftedPercent, minPercent, maxPercent);
        }



        private static double PassPercentDeltaToMmByStartEndScale(double deltaPercent)
        {
            if (double.IsNaN(deltaPercent) || double.IsInfinity(deltaPercent))
            {
                return 0.0;
            }

            return deltaPercent / 100.0 * StartEndScaleMm;
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

        private static bool TryResolveTwoPhaseSplitLineX(out double splitX)
        {
            splitX = 0.0;

            try
            {
                FeatureChain splitLine = FindFeatureChainByName("TwoPhaseSplitLine");
                if (splitLine == null)
                {
                    return false;
                }

                Point p0 = splitLine.PointAlong(0.0);
                Point p1 = splitLine.PointAlong(1.0);
                if (p0 == null && p1 == null)
                {
                    return false;
                }

                if (p0 != null && !double.IsNaN(p0.X) && !double.IsInfinity(p0.X))
                {
                    splitX = p0.X;
                }
                else if (p1 != null && !double.IsNaN(p1.X) && !double.IsInfinity(p1.X))
                {
                    splitX = p1.X;
                }
                else
                {
                    return false;
                }

                // 가이드 라인은 수직선이므로 두 점 X가 조금 다르면 평균으로 안정화한다.
                if (p0 != null && p1 != null
                    && !double.IsNaN(p0.X) && !double.IsInfinity(p0.X)
                    && !double.IsNaN(p1.X) && !double.IsInfinity(p1.X))
                {
                    splitX = (p0.X + p1.X) / 2.0;
                }

                DentalLogger.Log($"Composite2SplitLine2 - TwoPhaseSplitLine X 해석: X={splitX:F3}");
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Composite2SplitLine2 - TwoPhaseSplitLine X 해석 실패: {ex.GetType().Name}:{ex.Message}");
                return false;
            }
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
