// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - web/backend/controllers/requests/common.review.controller.js
using System;
using System.Collections;
using System.Reflection;
using System.Runtime.CompilerServices;
using Esprit;
using EspritConstants;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;
using Abuts.EspritAddIns.ESPRIT2025AddinProject;

#pragma warning disable CS0649

namespace DentalAddin
{

    [StandardModule]
    internal sealed class MoveSTL_Module
    {
        public static double Chazhi;

        public static bool NeedMove;

        public static double NeedMoveY;

        public static double NeedMoveZ;

        public static double RMTI;

        public static double MTI;

        public static bool NonConnection;

        public static double FrontStock;

        public static double FirstPX;

        public static double BackPointX;

        public static double FrontPointX;

        public static double ExtendMill;

        public static double FinishLineTopZ;

        public static double FinishLineX;

        public static double FinishLineR;

        private static int[] FeaList;

        public static void RotateSTL()
        {
            //IL_0028: Unknown result type (might be due to invalid IL or missing references)
            //IL_0087: Unknown result type (might be due to invalid IL or missing references)
            //IL_01ab: Unknown result type (might be due to invalid IL or missing references)
            //IL_04cf: Unknown result type (might be due to invalid IL or missing references)
            //IL_0628: Unknown result type (might be due to invalid IL or missing references)
            Plane plane;
            int num = default(int);
            try
            {
                plane = MainModule.Document.Planes["XYZ"];
            }
            catch (Exception ex)
            {
                ProjectData.SetProjectError(ex, num);
                Exception ex2 = ex;
                DentalLogger.Log("No XYZ work Plane?");
                ProjectData.ClearProjectError();
                return;
            }
            plane.Activate();
            SelectionSet selectionSet;
            try
            {
                selectionSet = MainModule.Document.SelectionSets.Add("Tempp");
            }
            catch (Exception ex3)
            {
                ProjectData.SetProjectError(ex3, num);
                Exception ex4 = ex3;
                DentalLogger.Log("Error Create Selectionsets,MoveSTL_Module-MoveSTL");
                ProjectData.ClearProjectError();
                return;
            }
            selectionSet.RemoveAll();
            foreach (GraphicObject item in MainModule.Document.GraphicsCollection)
            {
                if (item.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                {
                    selectionSet.Add(item, RuntimeHelpers.GetObjectValue(Missing.Value));
                    break;
                }
            }
            FeatureList();
            int count = MainModule.Document.Layers.Count;
            for (int i = 1; i <= count; i = checked(i + 1))
            {
                if (Operators.CompareString(MainModule.Document.Layers[i].Name, "Temp", false) == 0)
                {
                    MainModule.Document.Layers.Remove(i);
                    break;
                }
            }
            MainModule.Document.Layers.Add("Temp");
            MainModule.Document.ActiveLayer = MainModule.Document.Layers["Temp"];
            if (selectionSet.Count == 0)
            {
                DentalLogger.Log("No Stl part");
            }
            else
            {
                MainModule.Document.FeatureRecognition.CreatePartProfileCrossSection(selectionSet, MainModule.Document.Planes["XYZ"], espGraphicObjectReturnType.espFeatureChains, SplitPart: false);
                MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                FeatureChain featureChain = null;
                int num2 = -1000;
                bool flag = default(bool);
                Point point;
                if (MainModule.Document.FeatureChains.Count == 0)
                {
                    flag = true;
                }
                else
                {
                    int count2 = MainModule.Document.FeatureChains.Count;
                    int i = 1;
                    int num3 = default(int);
                    while (true)
                    {
                        double num4;
                        double num5;
                        checked
                        {
                            if (i <= count2)
                            {
                                featureChain = MainModule.Document.FeatureChains[i];
                                if (featureChain.IsClosed)
                                {
                                    if (featureChain.Area > (double)num2)
                                    {
                                        num2 = (int)Math.Round(featureChain.Area);
                                        num3 = i;
                                    }
                                    i++;
                                    continue;
                                }
                                flag = false;
                                break;
                            }
                            featureChain = MainModule.Document.FeatureChains[num3];
                            num4 = -1000.0;
                            num5 = 1000.0;
                            int num6 = (int)Math.Round(Conversion.Int(featureChain.Length / 0.1));
                            for (i = 0; i <= num6; i++)
                            {
                                point = featureChain.PointAlong((double)i * 0.1);
                                if (point.X > num4)
                                {
                                    num4 = point.X;
                                }
                                if (point.X < num5)
                                {
                                    num5 = point.X;
                                }
                            }
                        }
                        if (num5 <= 0.0 && num4 <= 0.1)
                        {
                            flag = false;
                        }
                        else if (num5 >= -0.1 && num4 >= 0.0)
                        {
                            flag = false;
                        }
                        else if (num5 < 0.0 && num4 > 0.0)
                        {
                            flag = true;
                        }
                        break;
                    }
                    num = 1;
                }
                MainModule.Document.Layers.Remove("Temp");
                MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                point = MainModule.Document.GetPoint(0, 0, 0);
                Point point2 = MainModule.Document.GetPoint(0, 0, 1);
                Segment segment = MainModule.Document.GetSegment(point, point2);
                point = MainModule.Document.GetPoint(0, 0, 0);
                point2 = MainModule.Document.GetPoint(0, 1, 0);
                Segment segment2 = MainModule.Document.GetSegment(point, point2);
                MainModule.Document.Layers.Add("Temp");
                MainModule.Document.ActiveLayer = MainModule.Document.Layers["Temp"];
                if (flag)
                {
                    FeatureList();
                    MainModule.Document.FeatureRecognition.CreatePartProfileShadow(selectionSet, MainModule.Document.Planes["XYZ"], espGraphicObjectReturnType.espFeatureChains);
                    featureChain = NewFeature();
                    if (featureChain == null)
                    {
                        DentalLogger.Log("Cannot find any feature,no STL model maybe.");
                        return;
                    }
                    double num7 = -1000.0;
                    double num8 = 1000.0;
                    checked
                    {
                        int num9 = (int)Math.Round(Conversion.Int(featureChain.Length / 0.1));
                        for (int i = 0; i <= num9; i++)
                        {
                            point = featureChain.PointAlong((double)i * 0.1);
                            if (point.Y > num7)
                            {
                                num7 = point.Y;
                            }
                            if (point.Y < num8)
                            {
                                num8 = point.Y;
                            }
                        }
                    }
                    int num10 = default(int);
                    int num11 = default(int);
                    if (num8 <= 0.1 && num7 <= 0.1)
                    {
                        num10 = 3;
                        num11 = -1;
                    }
                    else if (num8 >= -0.1 && num7 >= 0.0)
                    {
                        num10 = 3;
                        num11 = 1;
                    }
                    else if (num8 < 0.1 && num7 > -0.1)
                    {
                        num10 = 2;
                    }
                    num = 2;
                    MainModule.Document.FeatureChains.Remove(featureChain.Key);
                    if (num10 == 2)
                    {
                        FeatureList();
                        MainModule.Document.FeatureRecognition.CreatePartProfileShadow(selectionSet, MainModule.Document.Planes["YZX"], espGraphicObjectReturnType.espFeatureChains);
                        featureChain = NewFeature();
                        if (featureChain == null)
                        {
                            DentalLogger.Log("Cannot find any feature,no STL model maybe.");
                            return;
                        }
                        double num12 = -1000.0;
                        double num13 = 1000.0;
                        checked
                        {
                            int num14 = (int)Math.Round(Conversion.Int(featureChain.Length / 0.1));
                            for (int i = 0; i <= num14; i++)
                            {
                                point = featureChain.PointAlong((double)i * 0.1);
                                if (point.Z > num12)
                                {
                                    num12 = point.Z;
                                }
                                if (point.Z < num13)
                                {
                                    num13 = point.Z;
                                }
                            }
                        }
                        if (num13 <= 0.1 && num12 <= 0.1)
                        {
                            num11 = -1;
                        }
                        if (num13 >= -0.1 && num12 >= 0.0)
                        {
                            num11 = 1;
                        }
                        MainModule.Document.FeatureChains.Remove(featureChain.Key);
                    }
                    if (num10 == 3 && num11 == -1)
                    {
                        if (MainModule.SpindleSide)
                        {
                            selectionSet.Rotate(segment, Math.PI / 2.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                        else
                        {
                            selectionSet.Rotate(segment, -Math.PI / 2.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                    }
                    if (num10 == 3 && num11 == 1)
                    {
                        if (MainModule.SpindleSide)
                        {
                            selectionSet.Rotate(segment, -Math.PI / 2.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                        else
                        {
                            selectionSet.Rotate(segment, Math.PI / 2.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                    }
                    if (num10 == 2 && num11 == -1)
                    {
                        if (MainModule.SpindleSide)
                        {
                            selectionSet.Rotate(segment2, -Math.PI / 2.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                        else
                        {
                            selectionSet.Rotate(segment2, Math.PI / 2.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                    }
                    if (num10 == 2 && num11 == 1)
                    {
                        if (MainModule.SpindleSide)
                        {
                            selectionSet.Rotate(segment2, Math.PI / 2.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                        else
                        {
                            selectionSet.Rotate(segment2, -Math.PI / 2.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                    }
                }
            }
            MainModule.Document.Layers.Remove("Temp");
            MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void MoveSTL()
        {
            //IL_0026: Unknown result type (might be due to invalid IL or missing references)
            //IL_0081: Unknown result type (might be due to invalid IL or missing references)
            //IL_010b: Unknown result type (might be due to invalid IL or missing references)
            //IL_014d: Unknown result type (might be due to invalid IL or missing references)
            Plane plane;
            try
            {
                plane = MainModule.Document.Planes["XYZ"];
            }
            catch (Exception ex)
            {
                ProjectData.SetProjectError(ex);
                DentalLogger.Log("MoveSTL - XYZ work Plane 없음");
                ProjectData.ClearProjectError();
                return;
            }
            plane.Activate();
            SelectionSet selectionSet;
            try
            {
                selectionSet = MainModule.Document.SelectionSets.Add("Temp");
            }
            catch (Exception ex3)
            {
                ProjectData.SetProjectError(ex3);
                Exception ex4 = ex3;
                try
                {
                    selectionSet = MainModule.Document.SelectionSets["Temp"];
                }
                catch (Exception ex5)
                {
                    ProjectData.SetProjectError(ex5);
                    Exception ex6 = ex5;
                    DentalLogger.Log("MoveSTL - SelectionSet 생성 실패");
                    ProjectData.ClearProjectError();
                    return;
                }
                ProjectData.ClearProjectError();
            }
            selectionSet.RemoveAll();
            int stlCount = 0;
            int surfaceCount = 0;
            int orientationProfileCount = 0;
            foreach (GraphicObject item in MainModule.Document.GraphicsCollection)
            {
                if (item.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                {
                    selectionSet.Add(item, RuntimeHelpers.GetObjectValue(Missing.Value));
                    stlCount++;
                }
                else if (item.GraphicObjectType == espGraphicObjectType.espSurface)
                {
                    selectionSet.Add(item, RuntimeHelpers.GetObjectValue(Missing.Value));
                    surfaceCount++;
                }
            }

            // OrientationProfile 커브도 MoveSTL과 함께 같은 deltaX로 이동시켜 좌표 불일치를 방지한다.
            // (이미 생성된 CompositeOrientationProfile_* 체인이 있을 때만 함께 선택)
            try
            {
                foreach (FeatureChain fc in MainModule.Document.FeatureChains)
                {
                    if (fc == null)
                    {
                        continue;
                    }

                    string name = (fc.Name ?? string.Empty).Trim();
                    if (!name.StartsWith("CompositeOrientationProfile", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    selectionSet.Add(fc, RuntimeHelpers.GetObjectValue(Missing.Value));
                    orientationProfileCount++;
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"MoveSTL - OrientationProfile 선택 추가 실패: {ex.GetType().Name}:{ex.Message}");
            }
            if (stlCount == 0)
            {
                DentalLogger.Log("MoveSTL - STL 모델을 찾지 못함");
                return;
            }
            DentalLogger.Log($"MoveSTL - shift 대상: STL={stlCount}, Surface={surfaceCount}, OrientationProfile={orientationProfileCount}");
            FeatureChain featureChain = CreateStlShadowChainWithRetry(selectionSet);
            double boundingBoxLength;
            double stlMinX = 9999999.0;
            double stlMaxX = -9999999.0;
            if (featureChain != null)
            {
                boundingBoxLength = featureChain.BoundingBoxLength;
                double chainLen = featureChain.Length;
                for (double t = 0.0; t <= chainLen; t += 0.01)
                {
                    Point pt = featureChain.PointAlong(t);
                    if (pt.X < stlMinX) stlMinX = pt.X;
                    if (pt.X > stlMaxX) stlMaxX = pt.X;
                }
            }
            else if (TryGetStlAxialRangeByRotation(selectionSet, out stlMinX, out stlMaxX))
            {
                // XYZ 평면 shadow가 비어 오는 경우(ESPRIT이 일부 메시에서 투영 윤곽을 못 만듦) 회전 우회로 X 범위를 잰다.
                boundingBoxLength = stlMaxX - stlMinX;
                DentalLogger.Log($"MoveSTL - 회전 우회로 X 범위 측정: minX={stlMinX:0.####}, maxX={stlMaxX:0.####}, length={boundingBoxLength:0.####}");
            }
            else
            {
                // 조용히 return하면 STL이 이동하지 않은 채 NC(#520 등)가 생성돼 오가공된다. 작업을 실패시킨다.
                DentalLogger.Log("MoveSTL - FeatureChain 생성 실패(Shadow) - 재시도·우회 모두 실패, 작업 중단");
                throw new InvalidOperationException("MoveSTL: STL shadow FeatureChain 생성 실패 - STL 이동 불가");
            }
            if (MainModule.SpindleSide)
            {
                double num = stlMinX;
                FrontStock = 0.0 - boundingBoxLength;
                double deltaX = 0.0 - boundingBoxLength - num;
                double stlShift = AppConfig.DefaultStlShift;
                double totalDeltaX = deltaX + stlShift;
                selectionSet.Translate(totalDeltaX, 0.0, 0.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                FrontPointX += totalDeltaX;
                BackPointX += totalDeltaX;
                if (FinishLineTopZ > 0.001)
                {
                    FinishLineTopZ += stlShift;
                }
                // FinishLineX는 tip 쪽(음수, X=-finishLineTopZ)일 수 있음.
                // >0.001 가드는 시프트를 건너뛰어 seam이 스테일 값에 고정됨 → Splitline_2 FL 침범/tip 미삭.
                if (Math.Abs(FinishLineX) > 1e-6)
                {
                    FinishLineX += totalDeltaX;
                }
                DentalLogger.Log($"MoveSTL - 초기 X이동(SpindleSide) dX:{deltaX:0.###} + shift:{stlShift:0.###} = {totalDeltaX:0.###}, FrontPointX:{FrontPointX:0.###}, BackPointX:{BackPointX:0.###}, FinishLineX:{FinishLineX:0.###}, FinishLineTopZ:{FinishLineTopZ:0.###}");
            }
            else
            {
                double num = stlMaxX;
                FrontStock = boundingBoxLength;
                double deltaX = boundingBoxLength - num;
                double stlShift = AppConfig.DefaultStlShift;
                double totalDeltaX = deltaX + stlShift;
                selectionSet.Translate(totalDeltaX, 0.0, 0.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                FrontPointX += totalDeltaX;
                BackPointX += totalDeltaX;
                if (FinishLineTopZ > 0.001)
                {
                    FinishLineTopZ += stlShift;
                }
                if (Math.Abs(FinishLineX) > 1e-6)
                {
                    FinishLineX += totalDeltaX;
                }
                DentalLogger.Log($"MoveSTL - 초기 X이동 dX:{deltaX:0.###} + shift:{stlShift:0.###} = {totalDeltaX:0.###}, FrontPointX:{FrontPointX:0.###}, BackPointX:{BackPointX:0.###}, FinishLineX:{FinishLineX:0.###}, FinishLineTopZ:{FinishLineTopZ:0.###}");
            }

            selectionSet.RemoveAll();
            if (featureChain != null)
            {
                MainModule.Document.FeatureChains.Remove(featureChain.Key);
            }
            featureChain = null;
        }

        /// <summary>
        /// XYZ 평면 shadow가 비어 올 때의 우회. STL을 Y축 기준 +90° 돌려 축 방향(X)을 Z로 눕힌 뒤
        /// 동작이 확인된 YZX 평면 shadow로 Z 범위를 재고, 원위치로 되돌린다.
        /// 회전 부호는 선택 집합에 같이 넣은 탐침점 (1,0,0)이 어디로 가는지 읽어 결정한다.
        /// 어떤 경우에도 STL은 원위치로 복원한다.
        /// </summary>
        private static bool TryGetStlAxialRangeByRotation(SelectionSet stlSet, out double minX, out double maxX)
        {
            minX = 0.0; maxX = 0.0;
            const string layerName = "AbutsRotProbe";
            Layer prevLayer = null;
            bool rotated = false;
            SelectionSet rotSet = null;
            Segment yAxis = null;
            FeatureChain chain = null;
            try
            {
                prevLayer = MainModule.Document.ActiveLayer;
                Layer layer;
                try { layer = MainModule.Document.Layers.Add(layerName); }
                catch { layer = MainModule.Document.Layers[layerName]; }
                MainModule.Document.ActiveLayer = layer;

                Point o = MainModule.Document.GetPoint(0, 0, 0);
                Point oy = MainModule.Document.GetPoint(0, 1, 0);
                yAxis = MainModule.Document.GetSegment(o, oy);
                Point probe = MainModule.Document.GetPoint(1, 0, 0);

                try { rotSet = MainModule.Document.SelectionSets.Add("RotProbeSet"); }
                catch { rotSet = MainModule.Document.SelectionSets["RotProbeSet"]; }
                rotSet.RemoveAll();
                foreach (object g in stlSet) { rotSet.Add(g, RuntimeHelpers.GetObjectValue(Missing.Value)); }
                rotSet.Add(probe, RuntimeHelpers.GetObjectValue(Missing.Value));

                rotSet.Rotate(yAxis, Math.PI / 2.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                rotated = true;
                double px = probe.X, py = probe.Y, pz = probe.Z;
                DentalLogger.Log($"MoveSTL - 회전 탐침 (1,0,0)->({px:0.###},{py:0.###},{pz:0.###})");
                if (Math.Abs(Math.Abs(pz) - 1.0) > 1e-3)
                {
                    DentalLogger.Log("MoveSTL - 회전 탐침이 Z축으로 가지 않음, 우회 불가");
                    return false;
                }
                double sign = pz > 0 ? 1.0 : -1.0; // x = sign * z'

                chain = null;
                RemoveStaleTempChains();
                FeatureList();
                MainModule.Document.FeatureRecognition.CreatePartProfileShadow(stlSet, MainModule.Document.Planes["YZX"], espGraphicObjectReturnType.espFeatureChains);
                MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                chain = NewFeature();
                if (chain == null || chain.Length <= 0.0)
                {
                    DentalLogger.Log("MoveSTL - 회전 후 YZX shadow 실패");
                    return false;
                }
                double zMin = 1e9, zMax = -1e9;
                double len = chain.Length;
                double step = Math.Max(0.01, len / 4000.0);
                for (double t = 0.0; t <= len; t += step)
                {
                    Point pt = chain.PointAlong(t);
                    if (pt == null) continue;
                    if (pt.Z < zMin) zMin = pt.Z;
                    if (pt.Z > zMax) zMax = pt.Z;
                }
                if (zMax < zMin) return false;
                if (sign > 0) { minX = zMin; maxX = zMax; }
                else { minX = -zMax; maxX = -zMin; }
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"MoveSTL - 회전 우회 예외: {ex.GetType().Name}:{ex.Message}");
                return false;
            }
            finally
            {
                try { if (chain != null) MainModule.Document.FeatureChains.Remove(chain.Key); } catch { }
                try
                {
                    if (rotated && rotSet != null)
                    {
                        rotSet.Rotate(yAxis, -Math.PI / 2.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                }
                catch (Exception ex)
                {
                    DentalLogger.Log($"MoveSTL - 회전 복원 실패(치명): {ex.GetType().Name}:{ex.Message}");
                }
                try { if (rotSet != null) rotSet.RemoveAll(); } catch { }
                try { if (prevLayer != null) MainModule.Document.ActiveLayer = prevLayer; } catch { }
                try { MainModule.Document.Layers.Remove(layerName); } catch { }
            }
        }

        public static void Boundry()
        {
            string step = "init";
            try
            {
                step = "start";
                DentalLogger.Log($"Boundry 시작 - Document:{(MainModule.Document != null)}, RL:{MainModule.RL}, MTI:{MTI}, FrontPointX:{FrontPointX}, BackPointX:{BackPointX}, machinetype:{MainModule.machinetype}");

                // Legacy: Boundry1/2는 machinetype==1(3축 병렬평면 finish)에서만 BoundaryProfiles로 사용된다.
                // RoughBoundry1/2/3는 SplitAB 비활성 레거시 RoughFreeFromMill에서만 사용된다.
                // 현행 강제 4축(machinetype=2) + RoughFreeFromMillSplitAB는 RoughBoundryFront/Back만 생성하므로
                // 이 Boundry 피쳐들은 툴패스에 관여하지 않는 레거시다.
                if (MainModule.machinetype != 1)
                {
                    DentalLogger.Log($"Boundry - skipped(legacy unused feature: Boundry1/2, RoughBoundry1.. for machinetype={MainModule.machinetype})");
                    return;
                }

                step = "validate_document";
                if (MainModule.Document == null)
                {
                    DentalLogger.Log("Boundry 실패: MainModule.Document is null");
                    throw new InvalidOperationException("MainModule.Document is null");
                }

                if (MainModule.Document.Layers == null)
                {
                    DentalLogger.Log("Boundry 실패: MainModule.Document.Layers is null");
                    throw new InvalidOperationException("MainModule.Document.Layers is null");
                }

                if (MainModule.Document.SelectionSets == null)
                {
                    DentalLogger.Log("Boundry 실패: MainModule.Document.SelectionSets is null");
                    throw new InvalidOperationException("MainModule.Document.SelectionSets is null");
                }

                if (MainModule.Document.FeatureChains == null)
                {
                    DentalLogger.Log("Boundry 실패: MainModule.Document.FeatureChains is null");
                    throw new InvalidOperationException("MainModule.Document.FeatureChains is null");
                }

                if (MainModule.Document.LatheMachineSetup == null)
                {
                    DentalLogger.Log("Boundry 실패: MainModule.Document.LatheMachineSetup is null");
                    throw new InvalidOperationException("MainModule.Document.LatheMachineSetup is null");
                }

                DentalLogger.Log($"Boundry - LatheMachineSetup.BarDiameter:{MainModule.Document.LatheMachineSetup.BarDiameter}");

                step = "layers_remove";
                try
                {
                    MainModule.Document.Layers.Remove("Boundry");
                }
                catch (Exception ex)
                {
                    ProjectData.SetProjectError(ex);
                    Exception ex2 = ex;
                    ProjectData.ClearProjectError();
                }
                Layer activeLayer;
                step = "layers_add";
                try
                {
                    activeLayer = MainModule.Document.Layers.Add("Boundry");
                }
                catch (Exception ex3)
                {
                    ProjectData.SetProjectError(ex3);
                    Exception ex4 = ex3;
                    activeLayer = MainModule.Document.Layers["Boundry"];
                    ProjectData.ClearProjectError();
                }

                if (activeLayer == null)
                {
                    DentalLogger.Log("Boundry 실패: activeLayer is null");
                    throw new InvalidOperationException("Boundry activeLayer is null");
                }

                MainModule.Document.ActiveLayer = activeLayer;

                step = "points";
                Point point = ((MainModule.RL != 1.0) ? MainModule.Document.GetPoint(MTI, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0, 0) : MainModule.Document.GetPoint(MTI, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0, 0));
                Point point2 = MainModule.Document.GetPoint(FrontPointX, -1.0 * MainModule.Document.LatheMachineSetup.BarDiameter / 2.0, 0);
                if (point == null || point2 == null)
                {
                    DentalLogger.Log($"Boundry 실패: GetPoint returned null (point:{(point != null)}, point2:{(point2 != null)})");
                    throw new InvalidOperationException("Boundry GetPoint returned null");
                }

                step = "featurechains_add";
                FeatureChain featureChain = MainModule.Document.FeatureChains.Add(point);
                if (featureChain == null)
                {
                    DentalLogger.Log("Boundry 실패: FeatureChains.Add returned null");
                    throw new InvalidOperationException("Boundry FeatureChains.Add returned null");
                }

                step = "featurechain_add_segments";
                featureChain.Add(MainModule.Document.GetSegment(point, MainModule.Document.GetPoint(point.X, point2.Y, 0)));
                featureChain.Add(MainModule.Document.GetSegment(MainModule.Document.GetPoint(point.X, point2.Y, 0), point2));
                featureChain.Add(MainModule.Document.GetSegment(point2, MainModule.Document.GetPoint(point2.X, point.Y, 0)));
                featureChain.Add(MainModule.Document.GetSegment(MainModule.Document.GetPoint(point2.X, point.Y, 0), point));

                checked
                {
                    featureChain.Color = (uint)Information.RGB(0, 0, 255);
                    featureChain.Name = "Boundry1";
                    SelectionSet selectionSet;
                    step = "selectionset_get_temp";
                    try
                    {
                        selectionSet = MainModule.Document.SelectionSets["Temp"];
                    }
                    catch (Exception ex5)
                    {
                        ProjectData.SetProjectError(ex5);
                        Exception ex6 = ex5;
                        selectionSet = MainModule.Document.SelectionSets.Add("Temp");
                        ProjectData.ClearProjectError();
                    }
                    if (selectionSet == null)
                    {
                        step = "selectionset_add_temp";
                        try
                        {
                            selectionSet = MainModule.Document.SelectionSets.Add("Temp");
                        }
                        catch (Exception ex7)
                        {
                            ProjectData.SetProjectError(ex7);
                            ProjectData.ClearProjectError();
                            return;
                        }
                        if (selectionSet == null)
                        {
                            return;
                        }
                    }

                    step = "selectionset_removeall";
                    selectionSet.RemoveAll();

                    step = "seg_create";
                    point = MainModule.Document.GetPoint(-20, 0, 0);
                    point2 = MainModule.Document.GetPoint(20, 0, 0);
                    MainModule.seg = MainModule.Document.GetSegment(point, point2);
                    if (MainModule.seg == null)
                    {
                        DentalLogger.Log("Boundry 실패: MainModule.seg is null");
                        throw new InvalidOperationException("Boundry MainModule.seg is null");
                    }

                    step = "selection_add_featurechains";
                    foreach (FeatureChain featureChain3 in MainModule.Document.FeatureChains)
                    {
                        if (Operators.CompareString(featureChain3.Name, featureChain.Name, false) == 0)
                        {
                            selectionSet.Add(featureChain3, RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                    }

                    step = "selection_rotate";
                    selectionSet.Rotate(MainModule.seg, Math.PI / 2.0, 1);

                    step = "rename_boundry2";
                    int count = MainModule.Document.FeatureChains.Count;
                    for (int i = 1; i <= count; i++)
                    {
                        FeatureChain featureChain2 = MainModule.Document.FeatureChains[i];
                        if (Operators.CompareString(featureChain2.Key, featureChain.Key, false) != 0 && Operators.CompareString(featureChain2.Name, "Boundry1", false) == 0)
                        {
                            featureChain2.Name = "Boundry2";
                        }
                    }

                    step = "selection_removeall_2";
                    selectionSet.RemoveAll();
                    if (MainModule.RoughType > 1.0)
                    {
                        step = "rough_boundry";
                        double roughRadius = (MainModule.Document.LatheMachineSetup.BarDiameter + 10.0) / 2.0;
                        double roughY = -1.0 * roughRadius;
                        point = MainModule.Document.GetPoint(MTI, roughRadius, 0);
                        string point1Desc = (point != null) ? $"X:{point.X:F3}, Y:{point.Y:F3}" : "null";
                        double limitX = Math.Max(FrontPointX, BackPointX);
                        if (limitX < 5.0)
                        {
                            limitX = 5.0;
                        }
                        Point originalPoint2 = MainModule.Document.GetPoint((MainModule.RL == 1.0) ? -5 : 5, roughY, 0);
                        Point desiredPoint2 = MainModule.Document.GetPoint(limitX, roughY, 0);
                        string originalDesc = (originalPoint2 != null) ? $"X:{originalPoint2.X:F3}, Y:{originalPoint2.Y:F3}" : "null";
                        string desiredDesc = (desiredPoint2 != null) ? $"X:{desiredPoint2.X:F3}, Y:{desiredPoint2.Y:F3}" : "null";
                        DentalLogger.Log($"Boundry: RoughBoundry point1({point1Desc}), point2 원래({originalDesc}) -> 수정({desiredDesc})");
                        point2 = ((desiredPoint2 != null) ? desiredPoint2 : originalPoint2);
                        featureChain = MainModule.Document.FeatureChains.Add(point);
                        featureChain.Add(MainModule.Document.GetSegment(point, MainModule.Document.GetPoint(point.X, point2.Y, 0)));
                        featureChain.Add(MainModule.Document.GetSegment(MainModule.Document.GetPoint(point.X, point2.Y, 0), point2));
                        featureChain.Add(MainModule.Document.GetSegment(point2, MainModule.Document.GetPoint(point2.X, point.Y, 0)));
                        featureChain.Add(MainModule.Document.GetSegment(MainModule.Document.GetPoint(point2.X, point.Y, 0), point));
                        featureChain.Color = (uint)Information.RGB(0, 0, 255);
                        featureChain.Name = "RoughBoundry1";
                        selectionSet.Add(featureChain, RuntimeHelpers.GetObjectValue(Missing.Value));
                        if (MainModule.RoughType == 3.0)
                        {
                            selectionSet.AddCopiesToSelectionSet = true;
                            selectionSet.Rotate(MainModule.seg, Math.PI * 2.0 / 3.0, 1);
                            featureChain = (FeatureChain)selectionSet[2];
                            featureChain.Name = "RoughBoundry2";
                            selectionSet.Remove(2);
                            MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                            selectionSet.Rotate(MainModule.seg, 4.1887902047863905, 1);
                            featureChain = (FeatureChain)selectionSet[2];
                            featureChain.Name = "RoughBoundry3";
                            selectionSet.RemoveAll();
                            MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                    }

                    step = "restore_activelayer";
                    if (MainModule.Document.Layers.Count < 1 || MainModule.Document.Layers[1] == null)
                    {
                        DentalLogger.Log($"Boundry 경고: Layers[1] 접근 불가 (Count:{MainModule.Document.Layers.Count})");
                        return;
                    }
                    MainModule.Document.ActiveLayer = MainModule.Document.Layers[1];
                }
            }
            catch (Exception ex8)
            {
                DentalLogger.Log($"MoveSTL_Module.Boundry 예외 - Step:{step}, Type:{ex8.GetType().Name}");
                DentalLogger.LogException("MoveSTL_Module.Boundry", ex8);
                throw;
            }
        }

        public static void FeatureList()
        {
            checked
            {
                FeaList = new int[MainModule.Document.FeatureChains.Count + 1];
                int num = Information.UBound((Array)FeaList, 1);
                for (int i = 1; i <= num; i++)
                {
                    FeaList[i] = Conversions.ToInteger(MainModule.Document.FeatureChains[i].Key);
                }
            }
        }

        public static void Delete36Feature()
        {
            SelectionSet selectionSet = MainModule.Document.SelectionSets["FcSs"];
            if (selectionSet == null)
            {
                selectionSet = MainModule.Document.SelectionSets.Add("FcSs");
            }
            selectionSet.RemoveAll();
            int count = MainModule.Document.FeatureChains.Count;
            checked
            {
                for (int i = 1; i <= count; i++)
                {
                    FeatureChain featureChain = MainModule.Document.FeatureChains[i];
                    if (featureChain.Length <= 0.01)
                    {
                        selectionSet.Add(featureChain, RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                }
                int count2 = selectionSet.Count;
                int num = count2;
                for (int i = 1; i <= num; i++)
                {
                    FeatureChain featureChain = (FeatureChain)selectionSet[count2 - i + 1];
                    MainModule.Document.FeatureChains.Remove(featureChain.Key);
                }
                MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
            }
        }

        /// <summary>
        /// STL 그림자 윤곽(FeatureChain)을 만든다. ESPRIT은 Shadow 직후 컬렉션에 새 체인이 바로 안 보이거나
        /// 한 번 no-op일 수 있어 Refresh 후 재조회, 같은 평면 재시도, XYZ 평면 재활성화 순으로 재시도한다.
        /// 각 시도의 체인 수·길이를 로그로 남긴다.
        /// </summary>
        /// <summary>
        /// 이전 단계(STL bounding 등)가 지우지 못하고 남긴 임시 체인을 제거한다.
        /// CompositeOrientationProfile*은 MoveSTL과 같이 이동해야 하므로 남긴다.
        /// </summary>
        private static void RemoveStaleTempChains()
        {
            try
            {
                var keys = new System.Collections.Generic.List<string>();
                foreach (FeatureChain fc in MainModule.Document.FeatureChains)
                {
                    if (fc == null) continue;
                    string name = (fc.Name ?? string.Empty).Trim();
                    if (name.StartsWith("CompositeOrientationProfile", StringComparison.OrdinalIgnoreCase)) continue;
                    keys.Add(fc.Key);
                }
                foreach (string key in keys)
                {
                    try { MainModule.Document.FeatureChains.Remove(key); } catch { }
                }
                if (keys.Count > 0)
                {
                    DentalLogger.Log($"MoveSTL - 잔여 임시 FeatureChain {keys.Count}개 제거");
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"MoveSTL - 잔여 체인 정리 실패: {ex.GetType().Name}:{ex.Message}");
            }
        }

        /// <summary>
        /// Shadow가 모두 실패했을 때 원인 좁히기용 진단. 평면별로 STL 단독 shadow를 만들어 개수·XYZ 범위를 로그한다.
        /// STL 그래픽 객체의 공개 속성도 함께 남긴다.
        /// </summary>
        private static void DiagnoseShadowFailure()
        {
            try
            {
                SelectionSet ss;
                try { ss = MainModule.Document.SelectionSets.Add("DiagShadow"); }
                catch { ss = MainModule.Document.SelectionSets["DiagShadow"]; }
                ss.RemoveAll();
                GraphicObject stl = null;
                foreach (GraphicObject g in MainModule.Document.GraphicsCollection)
                {
                    if (g.GraphicObjectType == espGraphicObjectType.espSTL_Model) { stl = g; ss.Add(g, RuntimeHelpers.GetObjectValue(Missing.Value)); break; }
                }
                if (stl == null) { DentalLogger.Log("Diag - STL 그래픽 없음"); return; }
                try
                {
                    var sb = new System.Text.StringBuilder();
                    foreach (var p in stl.GetType().GetProperties())
                    {
                        try
                        {
                            if (p.GetIndexParameters().Length > 0) continue;
                            object v = p.GetValue(stl, null);
                            sb.Append(p.Name).Append('=').Append(v == null ? "null" : v.ToString()).Append("; ");
                        }
                        catch { }
                    }
                    DentalLogger.Log("Diag - STL props: " + sb);
                }
                catch { }
                foreach (string pn in new[] { "XYZ", "YZX", "ZXY", "XZY", "YXZ", "ZYX" })
                {
                    try
                    {
                        Plane pl = MainModule.Document.Planes[pn];
                        if (pl == null) { DentalLogger.Log($"Diag - plane {pn} 없음"); continue; }
                        FeatureList();
                        Array r = MainModule.Document.FeatureRecognition.CreatePartProfileShadow(ss, pl, espGraphicObjectReturnType.espFeatureChains);
                        MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                        FeatureChain c = NewFeature();
                        if (c == null) { DentalLogger.Log($"Diag - plane {pn}: 결과 없음 (array={(r == null ? -1 : r.Length)})"); continue; }
                        double minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
                        double len = c.Length;
                        double step = Math.Max(0.05, len / 800.0);
                        for (double t = 0; t <= len; t += step)
                        {
                            Point pt = c.PointAlong(t);
                            if (pt == null) continue;
                            minX = Math.Min(minX, pt.X); maxX = Math.Max(maxX, pt.X);
                            minY = Math.Min(minY, pt.Y); maxY = Math.Max(maxY, pt.Y);
                            minZ = Math.Min(minZ, pt.Z); maxZ = Math.Max(maxZ, pt.Z);
                        }
                        DentalLogger.Log($"Diag - plane {pn}: len={len:0.###}, X[{minX:0.###},{maxX:0.###}] Y[{minY:0.###},{maxY:0.###}] Z[{minZ:0.###},{maxZ:0.###}]");
                        try { MainModule.Document.FeatureChains.Remove(c.Key); } catch { }
                    }
                    catch (Exception ex)
                    {
                        DentalLogger.Log($"Diag - plane {pn} 예외: {ex.GetType().Name}:{ex.Message}");
                    }
                }
                ss.RemoveAll();
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"Diag 실패: {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static FeatureChain CreateStlShadowChainWithRetry(SelectionSet selectionSet)
        {
            const int maxAttempts = 4;
            for (int attempt = 1; attempt <= maxAttempts; attempt++)
            {
                try
                {
                    Plane plane = MainModule.Document.Planes["XYZ"];
                    if (attempt >= 3)
                    {
                        plane.Activate();
                    }
                    RemoveStaleTempChains();
                    FeatureList();
                    int before = MainModule.Document.FeatureChains.Count;
                    Array shadowResult = MainModule.Document.FeatureRecognition.CreatePartProfileShadow(selectionSet, plane, espGraphicObjectReturnType.espFeatureChains);
                    MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                    int after = MainModule.Document.FeatureChains.Count;
                    FeatureChain chain = NewFeature();
                    if (chain == null && shadowResult != null)
                    {
                        // 컬렉션 diff로 못 찾으면 API가 돌려준 배열에서 직접 꺼낸다.
                        foreach (object o in shadowResult)
                        {
                            FeatureChain fc = o as FeatureChain;
                            if (fc != null) { chain = fc; break; }
                        }
                        DentalLogger.Log($"MoveSTL - Shadow 반환 배열 len={shadowResult.Length}, 사용={(chain != null)}");
                    }
                    double len = chain != null ? chain.Length : -1.0;
                    DentalLogger.Log($"MoveSTL - Shadow 시도 {attempt}/{maxAttempts}: selection={selectionSet.Count}, chains {before}->{after}, new={(chain != null)}, length={len:0.###}");
                    if (chain != null && len > 0.0)
                    {
                        return chain;
                    }
                    if (chain != null)
                    {
                        try { MainModule.Document.FeatureChains.Remove(chain.Key); } catch { }
                    }
                }
                catch (Exception ex)
                {
                    DentalLogger.Log($"MoveSTL - Shadow 시도 {attempt}/{maxAttempts} 예외: {ex.GetType().Name}:{ex.Message}");
                }
            }
            // 진단(DiagnoseShadowFailure)은 평면별 결과를 이미 확인했으므로 기본 경로에서는 돌리지 않는다.
            return null;
        }

        public static FeatureChain NewFeature()
        {
            bool flag = false;
            FeatureChain result = default(FeatureChain);
            foreach (FeatureChain featureChain in MainModule.Document.FeatureChains)
            {
                flag = false;
                int num = Information.UBound((Array)FeaList, 1);
                for (int i = 1; i <= num; i++)
                {
                    if (Conversions.ToDouble(featureChain.Key) == (double)FeaList[i])
                    {
                        flag = true;
                    }
                }
                if (!flag)
                {
                    result = featureChain;
                    return result;
                }
            }
            return result;
        }

        public static void FindExactX()
        {
            int try0000_dispatch = -1;
            SelectionSet selectionSet = default(SelectionSet);
            int num2 = default(int);
            FeatureChain featureChain = default(FeatureChain);
            double mTI = default(double);
            Point point = default(Point);
            int num5 = default(int);
            int num9 = default(int);
            int num11 = default(int);
            int num = default(int);
            while (true)
            {
                try
                {
                    /*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/
                    ;
                    checked
                    {
                        switch (try0000_dispatch)
                        {
                            default:
                                {
                                    selectionSet = MainModule.Document.SelectionSets["SsS"];
                                    if (selectionSet == null)
                                    {
                                        selectionSet = MainModule.Document.SelectionSets.Add("SsS");
                                    }
                                    selectionSet.RemoveAll();
                                    SelectionSet selectionSet2 = MainModule.Document.SelectionSets["SsG"];
                                    if (selectionSet2 == null)
                                    {
                                        selectionSet2 = MainModule.Document.SelectionSets.Add("SsG");
                                    }
                                    selectionSet2.RemoveAll();
                                    IEnumerator enumerator = MainModule.Document.GraphicsCollection.GetEnumerator();
                                    while (enumerator.MoveNext())
                                    {
                                        GraphicObject graphicObject = (GraphicObject)enumerator.Current;
                                        if (graphicObject.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                                        {
                                            selectionSet.Add(graphicObject, RuntimeHelpers.GetObjectValue(Missing.Value));
                                            break;
                                        }
                                    }
                                    if (enumerator is IDisposable)
                                    {
                                        (enumerator as IDisposable).Dispose();
                                    }
                                    MainModule.Document.Layers.Add("LayG");
                                    MainModule.Document.ActiveLayer = MainModule.Document.Layers["LayG"];
                                    ProjectData.ClearProjectError();
                                    num2 = 2;
                                    selectionSet.Smash(CreateWireFrame: true, CreateSurfaces: false, CreateSTL: false, espWireFrameElementType.espWireFrameElementAll, 0.01, 10.0);
                                    IEnumerator enumerator2 = MainModule.Document.GraphicsCollection.GetEnumerator();
                                    while (enumerator2.MoveNext())
                                    {
                                        GraphicObject graphicObject = (GraphicObject)enumerator2.Current;
                                        if (Operators.CompareString(graphicObject.Layer.Name, "LayG", false) != 0)
                                        {
                                            continue;
                                        }
                                        if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                                        {
                                            Arc arc = (Arc)graphicObject;
                                            if (((Math.Abs(arc.CenterPoint.X) < Math.Abs(BackPointX) + 0.25) & (Math.Abs(arc.CenterPoint.X) > Math.Abs(BackPointX) - 0.25)) && Math.Abs(arc.Extremity(espExtremityType.espExtremityStart).X - arc.Extremity(espExtremityType.espExtremityEnd).X) <= 0.01)
                                            {
                                                selectionSet2.Add(arc, RuntimeHelpers.GetObjectValue(Missing.Value));
                                            }
                                        }
                                        if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                                        {
                                            Segment segment = (Segment)graphicObject;
                                            if (((Math.Abs(segment.XStart) < Math.Abs(BackPointX) + 0.25) & (Math.Abs(segment.XStart) > Math.Abs(BackPointX) - 0.25)) && Math.Abs(segment.XEnd - segment.XStart) <= 0.01)
                                            {
                                                selectionSet2.Add(segment, RuntimeHelpers.GetObjectValue(Missing.Value));
                                            }
                                        }
                                    }
                                    if (enumerator2 is IDisposable)
                                    {
                                        (enumerator2 as IDisposable).Dispose();
                                    }
                                    double[] array = new double[501];
                                    double[] array2 = new double[501];
                                    if (selectionSet2.Count == 0)
                                    {
                                        Plane plane = MainModule.Document.Planes["XYZ"];
                                        MainModule.Document.ActivePlane = MainModule.Document.Planes["XYZ"];
                                        MainModule.Document.FeatureRecognition.CreateTurningProfile(selectionSet, plane, espTurningProfileType.espTurningProfileOD, espGraphicObjectReturnType.espFeatureChains, espTurningProfileLocationType.espTurningProfileLocationTop, 0.01, 0.01, 5.0);
                                        int count = MainModule.Document.FeatureChains.Count;
                                        for (int i = 1; i <= count; i++)
                                        {
                                            featureChain = MainModule.Document.FeatureChains[i];
                                            if (Operators.CompareString(featureChain.Layer.Name, "LayG", false) == 0)
                                            {
                                                break;
                                            }
                                        }
                                        Arc arc = null;
                                        Segment segment = null;
                                        double num3 = 10.0;
                                        int count2 = featureChain.Count;
                                        for (int i = 1; i <= count2; i++)
                                        {
                                            GraphicObject graphicObject = (GraphicObject)((IFeatureChain)featureChain).get_Item(i);
                                            if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                                            {
                                                arc = (Arc)graphicObject;
                                                if (Math.Abs(Math.Abs(arc.Extremity(espExtremityType.espExtremityStart).X) - Math.Abs(BackPointX)) > Math.Abs(Math.Abs(arc.Extremity(espExtremityType.espExtremityEnd).X) - Math.Abs(BackPointX)))
                                                {
                                                    if (Math.Abs(Math.Abs(arc.Extremity(espExtremityType.espExtremityEnd).X) - Math.Abs(BackPointX)) < num3)
                                                    {
                                                        num3 = Math.Abs(Math.Abs(arc.Extremity(espExtremityType.espExtremityEnd).X) - Math.Abs(BackPointX));
                                                        mTI = arc.Extremity(espExtremityType.espExtremityEnd).X;
                                                    }
                                                }
                                                else if (Math.Abs(Math.Abs(arc.Extremity(espExtremityType.espExtremityStart).X) - Math.Abs(BackPointX)) < num3)
                                                {
                                                    num3 = Math.Abs(Math.Abs(arc.Extremity(espExtremityType.espExtremityStart).X) - Math.Abs(BackPointX));
                                                    mTI = arc.Extremity(espExtremityType.espExtremityStart).X;
                                                }
                                            }
                                            if (graphicObject.GraphicObjectType != espGraphicObjectType.espSegment)
                                            {
                                                continue;
                                            }
                                            segment = (Segment)graphicObject;
                                            if (Math.Abs(Math.Abs(segment.XStart) - Math.Abs(BackPointX)) > Math.Abs(Math.Abs(segment.XEnd) - Math.Abs(BackPointX)))
                                            {
                                                if (Math.Abs(Math.Abs(segment.XEnd) - Math.Abs(BackPointX)) < Math.Abs(num3))
                                                {
                                                    num3 = Math.Abs(Math.Abs(segment.XEnd) - Math.Abs(BackPointX));
                                                    mTI = segment.XEnd;
                                                }
                                            }
                                            else if (Math.Abs(Math.Abs(segment.XStart) - Math.Abs(BackPointX)) < Math.Abs(num3))
                                            {
                                                num3 = Math.Abs(Math.Abs(segment.XStart) - Math.Abs(BackPointX));
                                                mTI = segment.XStart;
                                            }
                                        }
                                        MTI = mTI;
                                    }
                                    else
                                    {
                                        int num4 = 1;
                                        int count3 = selectionSet2.Count;
                                        for (int i = 1; i <= count3; i++)
                                        {
                                            GraphicObject graphicObject = (GraphicObject)selectionSet2[i];
                                            if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                                            {
                                                Arc arc = (Arc)graphicObject;
                                                point = arc.CenterPoint;
                                            }
                                            if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                                            {
                                                Segment segment = (Segment)graphicObject;
                                                point = segment.Extremity(espExtremityType.espExtremityStart);
                                            }
                                            num5 = 1;
                                            do
                                            {
                                                if (Math.Abs(point.X - array[num5]) <= 0.01)
                                                {
                                                    array2[num5] += 1.0;
                                                    break;
                                                }
                                                num5++;
                                            }
                                            while (num5 <= 10);
                                            if (num5 == 11)
                                            {
                                                array[num4] = point.X;
                                                array2[num4] += 1.0;
                                                num4++;
                                            }
                                        }
                                        double num6 = -10.0;
                                        int num7 = num4 - 1;
                                        for (int i = 1; i <= num7; i++)
                                        {
                                            if (array2[i] > num6)
                                            {
                                                num6 = array2[i];
                                                num5 = i;
                                            }
                                        }
                                        num6 = -10.0;
                                        int num8 = num4 - 1;
                                        for (int i = 1; i <= num8; i++)
                                        {
                                            if ((array2[i] > num6) & (array2[i] < array2[num5]))
                                            {
                                                num6 = array2[i];
                                                num9 = i;
                                            }
                                        }
                                        num6 = -10.0;
                                        int num10 = num4 - 1;
                                        for (int i = 1; i <= num10; i++)
                                        {
                                            if ((array2[i] > num6) & (array2[i] < array2[num5]) & (array2[i] < array2[num9]))
                                            {
                                                num6 = array2[i];
                                                num11 = i;
                                            }
                                        }
                                        if (Math.Abs(array[num9]) <= 0.01)
                                        {
                                            array[num9] = 100.0;
                                        }
                                        if (Math.Abs(array[num11]) <= 0.01)
                                        {
                                            array[num11] = 100.0;
                                        }
                                        if ((Math.Abs(Math.Abs(array[num5]) - Math.Abs(BackPointX)) < Math.Abs(Math.Abs(array[num9]) - Math.Abs(BackPointX))) & (Math.Abs(Math.Abs(array[num5]) - Math.Abs(BackPointX)) < Math.Abs(Math.Abs(array[num11]) - Math.Abs(BackPointX))))
                                        {
                                            MTI = array[num5];
                                        }
                                        else if ((Math.Abs(Math.Abs(array[num9]) - Math.Abs(BackPointX)) < Math.Abs(Math.Abs(array[num5]) - Math.Abs(BackPointX))) & (Math.Abs(Math.Abs(array[num9]) - Math.Abs(BackPointX)) < Math.Abs(Math.Abs(array[num11]) - Math.Abs(BackPointX))))
                                        {
                                            MTI = array[num9];
                                        }
                                        else if ((Math.Abs(Math.Abs(array[num11]) - Math.Abs(BackPointX)) < Math.Abs(Math.Abs(array[num5]) - Math.Abs(BackPointX))) & (Math.Abs(Math.Abs(array[num11]) - Math.Abs(BackPointX)) < Math.Abs(Math.Abs(array[num9]) - Math.Abs(BackPointX))))
                                        {
                                            MTI = array[num11];
                                        }
                                    }
                                    if (Math.Abs(Math.Abs(Math.Abs(MTI) - Math.Abs(BackPointX))) >= 1.0)
                                    {
                                        MTI = BackPointX;
                                    }
                                    break;
                                }
                            case 2749:
                                num = -1;
                                switch (num2)
                                {
                                    case 2:
                                        break;
                                    default:
                                        goto end_IL_0000;
                                }
                                break;
                        }
                        RMTI = MTI;
                        MTI = Math.Abs(MTI);
                        MTI = (int)Math.Round(MTI);
                        if (Math.Abs(RMTI) > MTI)
                        {
                            MTI += 0.5;
                        }
                        Chazhi = Math.Abs(MTI - Math.Abs(RMTI));
                        if (MainModule.SpindleSide)
                        {
                            Chazhi = 0.0 - Chazhi;
                            selectionSet.Translate(Chazhi, 0.0, 0.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                            FrontStock += Chazhi;
                            MTI = 0.0 - MTI;
                        }
                        else
                        {
                            selectionSet.Translate(Chazhi, 0.0, 0.0, RuntimeHelpers.GetObjectValue(Missing.Value));
                            FrontStock += Chazhi;
                        }
                        if (Math.Abs(MTI - FrontStock) <= 0.01)
                        {
                            NonConnection = true;
                        }
                        else
                        {
                            NonConnection = false;
                        }
                        MainModule.Document.Layers.Remove("LayG");
                        FrontPointX += Chazhi;
                        BackPointX += Chazhi;
                        if (Math.Abs(FinishLineX) > 1e-6)
                        {
                            FinishLineX += Chazhi;
                        }
                        break;
                    }
                end_IL_0000:;
                }
                catch (Exception ex) when (num2 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 2749;
                    continue;
                }
                throw ProjectData.CreateProjectError(-2146828237);
            }
            if (num != 0)
            {
                ProjectData.ClearProjectError();
            }
        }

        public static void MoveSurface()
        {
            Plane plane = MainModule.GetOrCreatePlane("CutPlane");
            if (plane == null)
            {
                DentalLogger.Log("MoveSurface: CutPlane 생성/조회 실패로 종료");
                return;
            }

            Plane plane2 = plane;
            plane2.Ux = 0.0;
            plane2.Uy = 1.0;
            plane2.Uz = 0.0;
            plane2.Vx = 0.0;
            plane2.Vy = 0.0;
            plane2.Vz = 1.0;
            plane2.Wx = 1.0;
            plane2.Wy = 0.0;
            plane2.Wz = 0.0;
            if (MainModule.SpindleSide)
            {
                plane2.X = 0.0 - MainModule.ZH + 0.05;
            }
            else
            {
                plane2.X = MainModule.ZH - 0.05;
            }
            plane2.Y = 0.0;
            plane2.Z = 0.0;
            plane2 = null;
            SelectionSet selectionSet;
            try
            {
                selectionSet = MainModule.Document.SelectionSets.Add("Tempcut");
            }
            catch (Exception ex)
            {
                ProjectData.SetProjectError(ex);
                Exception ex2 = ex;
                try
                {
                    selectionSet = MainModule.Document.SelectionSets["Tempcut"];
                }
                catch (Exception ex3)
                {
                    ProjectData.SetProjectError(ex3);
                    Exception ex4 = ex3;
                    DentalLogger.Log("Error Create Selectionsets");
                    ProjectData.ClearProjectError();
                    return;
                }
                ProjectData.ClearProjectError();
            }
            selectionSet.RemoveAll();
            foreach (GraphicObject item in MainModule.Document.GraphicsCollection)
            {
                if (item.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                {
                    selectionSet.Add(item, RuntimeHelpers.GetObjectValue(Missing.Value));
                    break;
                }
            }
            MainModule.Document.Layers.Add("Temp");
            MainModule.Document.ActiveLayer = MainModule.Document.Layers["Temp"];
            MainModule.Document.FeatureRecognition.CreatePartProfileCrossSection(selectionSet, plane, espGraphicObjectReturnType.espFeatureChains, SplitPart: false);
            int count = MainModule.Document.FeatureChains.Count;
            checked
            {
                FeatureChain featureChain = default(FeatureChain);
                for (int i = 1; i <= count; i++)
                {
                    featureChain = MainModule.Document.FeatureChains[i];
                    if (Operators.CompareString(featureChain.Layer.Name, "Temp", false) == 0)
                    {
                        break;
                    }
                }
                double[] array = new double[5];
                if (featureChain != null)
                {
                    int num = (int)Math.Round(Math.Round(featureChain.Length / 0.01, 0));
                    int num2 = num;
                    for (int i = 0; i <= num2; i++)
                    {
                        Point point = featureChain.PointAlong(0.01 * (double)i);
                        if ((point.Y > 0.0) & (point.Z > 0.0))
                        {
                            array[1] = 1.0;
                        }
                        if ((point.Y > 0.0) & (point.Z < 0.0))
                        {
                            array[2] = 1.0;
                        }
                        if ((point.Y < 0.0) & (point.Z < 0.0))
                        {
                            array[3] = 1.0;
                        }
                        if ((point.Y < 0.0) & (point.Z > 0.0))
                        {
                            array[4] = 1.0;
                        }
                    }
                    if ((array[1] == 1.0) & (array[2] == 1.0) & (array[3] == 1.0) & (array[4] == 1.0))
                    {
                        NeedMove = false;
                    }
                    else
                    {
                        NeedMove = true;
                    }
                    double num3 = 1000.0;
                    int num4 = num;
                    double y = default(double);
                    double z = default(double);
                    for (int i = 0; i <= num4; i++)
                    {
                        Point point = featureChain.PointAlong(0.01 * (double)i);
                        if (Math.Sqrt(Math.Pow(point.Y, 2.0) + Math.Pow(point.Z, 2.0)) < num3)
                        {
                            num3 = Math.Sqrt(Math.Pow(point.Y, 2.0) + Math.Pow(point.Z, 2.0));
                            y = point.Y;
                            z = point.Z;
                        }
                    }
                    NeedMoveY = y;
                    NeedMoveZ = z;
                }
                MainModule.Document.Layers.Remove("Temp");
            }
        }

#pragma warning restore CS0649, CS0162
    }
}
