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

        public static void FreeFormMill()
        {
            try
            {
                DentalLogger.Log("FreeFormMill - TryRunFreeFormMillSafe 시도");
                if (TryRunFreeFormMillSafe())
                {
                    DentalLogger.Log("FreeFormMill - Safe 경로 완료");

                    int safeFinishingMethod = (NumCombobox != null && NumCombobox.Length > 1) ? NumCombobox[1] : 0;
                    if (safeFinishingMethod == 1)
                    {
                        DentalLogger.Log("FreeFormMill - Safe 경로 후 FinishingMethod==1, Composite2 실행");
                        Composite2();
                        DentalLogger.Log("FreeFormMill - Safe 경로 후 Composite2 완료");
                    }
                    else
                    {
                        DentalLogger.Log($"FreeFormMill - Safe 경로 후 FinishingMethod!=1({safeFinishingMethod}), Emerge/Composite2 건너뜀");
                    }
                    return;
                }

                DentalLogger.Log("FreeFormMill - Safe 경로에서 false 반환, legacy free() 폴백 실행");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"FreeFormMill - Safe 경로 예외, legacy free() 폴백: {ex.GetType().Name}:{ex.Message}");
                DentalLogger.LogException("MainModule.FreeFormMill.Safe", ex);
            }

            try
            {
                DentalLogger.Log("FreeFormMill - free() 호출");
                free();
                DentalLogger.Log("FreeFormMill - free() 완료");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"FreeFormMill - free() 예외: {ex.Message}");
                DentalLogger.LogException("MainModule.FreeFormMill.free", ex);
                throw;
            }
            int finishingMethod = (NumCombobox != null && NumCombobox.Length > 1) ? NumCombobox[1] : 0;
            if (finishingMethod == 1)
            {
                DentalLogger.Log("FreeFormMill - FinishingMethod==1, Composite2 실행");
                Composite2();
                DentalLogger.Log("FreeFormMill - Composite2 완료");
            }
            else
            {
                DentalLogger.Log($"FreeFormMill - FinishingMethod!=1({finishingMethod}), Emerge/Composite2 건너뜀");
            }
        }

        private static bool TryRunFreeFormMillSafe()
        {
            try
            {
                DentalLogger.Log("TryRunFreeFormMillSafe - 시작");

                TechnologyUtility technologyUtility = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
                Layer activeLayer = GetOrCreateLayer("FreeFormMill");
                if (activeLayer == null)
                {
                    DentalLogger.Log("TryRunFreeFormMillSafe - FreeFormMill 레이어 확보 실패");
                    return false;
                }
                Document.ActiveLayer = activeLayer;

                bool skipFrontFace = ShouldSkipFrontFaceInFreeForm();
                DentalLogger.Log($"TryRunFreeFormMillSafe - skipFrontFace={skipFrontFace}, machinetype={machinetype}, RL={RL}");

                if (!skipFrontFace)
                {
                    FreeFormFeature frontFace = FindFreeFormFeatureByNameLocal("3DMilling_FrontFace");
                    if (LogGraphicObjectIsNull(frontFace, "TryRunFreeFormMillSafe frontFace", "Document.FreeFormFeatures에서 '3DMilling_FrontFace' FreeFormFeature를 준비하세요.", stopProcess: true))
                    {
                        DentalLogger.Log("TryRunFreeFormMillSafe - FrontFace feature 누락");
                        return false;
                    }

                    string faceFile = PrcFilePath[5];
                    ITechnology[] faceTech = TryOpenProcess(technologyUtility, faceFile, "TryRunFreeFormMillSafe:PRC[5] FrontFace");
                    if (faceTech.Length == 0 || !(faceTech[0] is TechLatheMoldParallelPlanes faceOp))
                    {
                        DentalLogger.Log("TryRunFreeFormMillSafe - FrontFace PRC 로드/캐스팅 실패");
                        return false;
                    }

                    // Front Face 끝점 정책:
                    // - Face.RightX = FrontPointX + 0.5mm 로 고정 적용한다.
                    // - 이후 Rough 대비 안전가드(0.3mm)를 추가 적용해 공구 파손 위험을 방지한다.
                    ApplyFrontFaceFixedDepth(faceOp, "TryRunFreeFormMillSafe:FrontFace");

                    ZH = Math.Abs(MoveSTL_Module.FrontPointX);

                    // 안전가드: Rough_A 우측 선행절삭이 Face보다 최소 0.3mm 더 우측에 있도록 보정.
                    // (Face가 더 우측으로 나가면 공구 파손 위험)
                    TryApplyFaceRightEndGuard(faceOp, "TryRunFreeFormMillSafe:FrontFace");

                    TryAddOperation(faceOp, frontFace, "TryRunFreeFormMillSafe FrontFace");
                    DentalLogger.Log("TryRunFreeFormMillSafe - FrontFace 완료");
                }
                else
                {
                    DentalLogger.Log("TryRunFreeFormMillSafe - FrontFace 스킵");
                }

                if (machinetype == 1)
                {
                    int boundry1Key = FindFeatureChainKeyByNameLocal("Boundry1");
                    int boundry2Key = FindFeatureChainKeyByNameLocal("Boundry2");
                    DentalLogger.Log($"TryRunFreeFormMillSafe - machinetype=1, Boundry1={boundry1Key}, Boundry2={boundry2Key}");

                    if (boundry1Key <= 0 || boundry2Key <= 0)
                    {
                        DentalLogger.Log("TryRunFreeFormMillSafe - Boundry1/2 키 누락");
                        return false;
                    }

                    FreeFormFeature ff0 = FindFreeFormFeatureByNameLocal("3DMilling_0Degree");
                    FreeFormFeature ff90 = FindFreeFormFeatureByNameLocal("3DMilling_90Degree");
                    FreeFormFeature ff180 = FindFreeFormFeatureByNameLocal("3DMilling_180Degree");
                    FreeFormFeature ff270 = FindFreeFormFeatureByNameLocal("3DMilling_270Degree");
                    if (ff0 == null || ff90 == null || ff180 == null || ff270 == null)
                    {
                        DentalLogger.Log("TryRunFreeFormMillSafe - 0/90/180/270 FreeFormFeature 누락");
                        return false;
                    }

                    string file6 = PrcFilePath[6];
                    string file7 = PrcFilePath[7];

                    ITechnology[] tech6a = TryOpenProcess(technologyUtility, file6, "TryRunFreeFormMillSafe:PRC[6]-0");
                    ITechnology[] tech7a = TryOpenProcess(technologyUtility, file7, "TryRunFreeFormMillSafe:PRC[7]-90");
                    ITechnology[] tech6b = TryOpenProcess(technologyUtility, file6, "TryRunFreeFormMillSafe:PRC[6]-180");
                    ITechnology[] tech7b = TryOpenProcess(technologyUtility, file7, "TryRunFreeFormMillSafe:PRC[7]-270");
                    if (tech6a.Length == 0 || tech7a.Length == 0 || tech6b.Length == 0 || tech7b.Length == 0)
                    {
                        DentalLogger.Log("TryRunFreeFormMillSafe - PRC[6]/PRC[7] 로드 실패");
                        return false;
                    }

                    if (!(tech6a[0] is TechLatheMoldParallelPlanes op0) ||
                        !(tech7a[0] is TechLatheMoldParallelPlanes op90) ||
                        !(tech6b[0] is TechLatheMoldParallelPlanes op180) ||
                        !(tech7b[0] is TechLatheMoldParallelPlanes op270))
                    {
                        DentalLogger.Log("TryRunFreeFormMillSafe - PRC[6]/PRC[7] 캐스팅 실패");
                        return false;
                    }

                    op0.BoundaryProfiles = $"6,{boundry1Key}";
                    op90.BoundaryProfiles = $"6,{boundry2Key}";
                    op180.BoundaryProfiles = $"6,{boundry1Key}";
                    op270.BoundaryProfiles = $"6,{boundry2Key}";

                    TryAddOperation(op0, ff0, "TryRunFreeFormMillSafe 0Degree");
                    TryAddOperation(op90, ff90, "TryRunFreeFormMillSafe 90Degree");
                    TryAddOperation(op180, ff180, "TryRunFreeFormMillSafe 180Degree");
                    TryAddOperation(op270, ff270, "TryRunFreeFormMillSafe 270Degree");
                    DentalLogger.Log("TryRunFreeFormMillSafe - machinetype=1 병렬 평면 완료");
                }

                DentalLogger.Log("TryRunFreeFormMillSafe - MainFree 호출");
                MainFree();
                DentalLogger.Log("TryRunFreeFormMillSafe - MainFree 완료");
                return true;
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"TryRunFreeFormMillSafe 실패: {ex.GetType().Name}:{ex.Message}");
                DentalLogger.LogException("MainModule.TryRunFreeFormMillSafe", ex);
                return false;
            }
        }

        private static bool ShouldSkipFrontFaceInFreeForm()
        {
            try
            {
                string raw = Environment.GetEnvironmentVariable("ABUTS_SKIP_FRONTFACE_IN_FREEFORM");
                return string.Equals(raw, "1", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(raw, "true", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static FreeFormFeature FindFreeFormFeatureByNameLocal(string name)
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
                    FreeFormFeature feature = Document.FreeFormFeatures[i];
                    if (feature != null && string.Equals(feature.Name, name, StringComparison.OrdinalIgnoreCase))
                    {
                        return feature;
                    }
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"FindFreeFormFeatureByNameLocal({name}) 실패: {ex.GetType().Name}:{ex.Message}");
            }
            return null;
        }

        private static int FindFeatureChainKeyByNameLocal(string name)
        {
            try
            {
                if (Document?.FeatureChains == null)
                {
                    return 0;
                }

                int count = Document.FeatureChains.Count;
                for (int i = 1; i <= count; i++)
                {
                    FeatureChain chain = Document.FeatureChains[i];
                    if (chain != null && string.Equals(chain.Name, name, StringComparison.OrdinalIgnoreCase))
                    {
                        return Conversions.ToInteger(chain.Key);
                    }
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"FindFeatureChainKeyByNameLocal({name}) 실패: {ex.GetType().Name}:{ex.Message}");
            }
            return 0;
        }

        public static void free()
        {
            DentalLogger.Log("free() 시작");
                int try0000_dispatch = -1;
            int num2 = default(int);
            FreeFormFeature[] array = default(FreeFormFeature[]);
            int num = default(int);
            int num3 = default(int);
            int num5 = default(int);
            int count = default(int);
            FeatureSet featureSet = default(FeatureSet);
            FeatureSet featureSet2 = default(FeatureSet);
            int count2 = default(int);
            TechnologyUtility technologyUtility = default(TechnologyUtility);
            Layer activeLayer = default(Layer);
            string file = default(string);
            ITechnology[] array2 = default(ITechnology[]);
            TechLatheMoldParallelPlanes techLatheMoldParallelPlanes = default(TechLatheMoldParallelPlanes);
            string file2 = default(string);
            int num6 = default(int);
            int num7 = default(int);
            FreeFormFeature freeFormFeature = default(FreeFormFeature);
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
                            array = new FreeFormFeature[6];
                            goto IL_0009;
                        case 1677:
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
                                        goto IL_0009;
                                    case 3:
                                        goto IL_0021;
                                    case 4:
                                        goto IL_003b;
                                    case 5:
                                        goto IL_0051;
                                    case 6:
                                        goto IL_0061;
                                    case 7:
                                        goto IL_0077;
                                    case 8:
                                        goto IL_0087;
                                    case 9:
                                        goto IL_0095;
                                    case 10:
                                        goto IL_00b3;
                                    case 11:
                                        goto IL_00c2;
                                    case 12:
                                        goto IL_00e0;
                                    case 13:
                                        goto IL_00ef;
                                    case 14:
                                        goto IL_010b;
                                    case 15:
                                        goto IL_0126;
                                    case 16:
                                        goto IL_013d;
                                    case 17:
                                        goto IL_0145;
                                    case 18:
                                        goto IL_0151;
                                    case 19:
                                        goto IL_0168;
                                    case 20:
                                        goto IL_0170;
                                    case 21:
                                        goto IL_017c;
                                    case 22:
                                        goto IL_0193;
                                    case 23:
                                        goto IL_019b;
                                    case 24:
                                        goto IL_01a7;
                                    case 25:
                                        goto IL_01be;
                                    case 26:
                                        goto IL_01c6;
                                    case 27:
                                        goto IL_01d2;
                                    case 28:
                                        goto IL_01e9;
                                    case 29:
                                        goto IL_01f1;
                                    case 30:
                                        goto IL_0203;
                                    case 31:
                                        goto IL_020a;
                                    case 32:
                                        goto IL_0228;
                                    case 33:
                                        goto IL_0241;
                                    case 34:
                                        goto IL_0250;
                                    case 35:
                                        goto IL_025c;
                                    case 36:
                                        goto IL_026f;
                                    case 37:
                                        goto IL_027d;
                                    case 38:
                                        goto IL_0290;
                                    case 39:
                                        goto IL_02a3;
                                    case 41:
                                        goto IL_02c9;
                                    case 42:
                                        goto IL_02dc;
                                    case 43:
                                        goto IL_02f6;
                                    case 40:
                                    case 44:
                                        goto IL_0309;
                                    case 45:
                                        goto IL_031b;
                                    case 46:
                                        goto IL_033d;
                                    case 47:
                                        goto IL_0349;
                                    case 48:
                                        goto IL_0355;
                                    case 49:
                                        goto IL_0363;
                                    case 50:
                                        goto IL_0376;
                                    case 51:
                                        goto IL_0384;
                                    case 52:
                                        goto IL_0393;
                                    case 53:
                                        goto IL_03ae;
                                    case 54:
                                        goto IL_03b5;
                                    case 55:
                                        goto IL_03d7;
                                    case 56:
                                        goto IL_03ea;
                                    case 57:
                                        goto IL_03f8;
                                    case 58:
                                        goto IL_0407;
                                    case 59:
                                        goto IL_0422;
                                    case 60:
                                        goto IL_0429;
                                    case 61:
                                        goto IL_044b;
                                    case 62:
                                        goto IL_045e;
                                    case 63:
                                        goto IL_046c;
                                    case 64:
                                        goto IL_047b;
                                    case 65:
                                        goto IL_0496;
                                    case 66:
                                        goto IL_049d;
                                    case 67:
                                        goto IL_04bf;
                                    case 68:
                                        goto IL_04d2;
                                    case 69:
                                        goto IL_04e0;
                                    case 70:
                                        goto IL_04ef;
                                    case 71:
                                        goto IL_050a;
                                    case 72:
                                        goto IL_0511;
                                    case 74:
                                        goto IL_0535;
                                    case 75:
                                        goto end_IL_0000_2;
                                    default:
                                        goto end_IL_0000;
                                    case 73:
                                    case 76:
                                        goto end_IL_0000_3;
                                }
                                goto default;
                            }
                        IL_0087:
                            num2 = 8;
                            num5 = checked(num5 + 1);
                            goto IL_008f;
                        IL_0009:
                            num2 = 2;
                            count = Document.FeatureChains.Count;
                            num5 = 1;
                            goto IL_008f;
                        IL_008f:
                            if (num5 <= count)
                            {
                                goto IL_0021;
                            }
                            goto IL_0095;
                        IL_0095:
                            num2 = 9;
                            featureSet = Document.FeatureSets.Add(RuntimeHelpers.GetObjectValue(Missing.Value));
                            goto IL_00b3;
                        IL_00b3:
                            num2 = 10;
                            featureSet.Name = "0-180Degree";
                            goto IL_00c2;
                        IL_00c2:
                            num2 = 11;
                            featureSet2 = Document.FeatureSets.Add(RuntimeHelpers.GetObjectValue(Missing.Value));
                            goto IL_00e0;
                        IL_00e0:
                            num2 = 12;
                            featureSet2.Name = "90-270Degree";
                            goto IL_00ef;
                        IL_00ef:
                            num2 = 13;
                            count2 = Document.FreeFormFeatures.Count;
                            num5 = 1;
                            goto IL_01fa;
                        IL_01fa:
                            if (num5 <= count2)
                            {
                                goto IL_010b;
                            }
                            goto IL_0203;
                        IL_0203:
                            ProjectData.ClearProjectError();
                            num3 = 1;
                            goto IL_020a;
                        IL_020a:
                            num2 = 31;
                            technologyUtility = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
                            goto IL_0228;
                        IL_0228:
                            num2 = 32;
                            activeLayer = Document.Layers.Add("FreeFormMill");
                            goto IL_0241;
                        IL_0241:
                            num2 = 33;
                            Document.ActiveLayer = activeLayer;
                            goto IL_0250;
                        IL_0250:
                            num2 = 34;
                            file = PrcFilePath[5];
                            goto IL_025c;
                        IL_025c:
                            num2 = 35;
                            array2 = TryOpenProcess(technologyUtility, file, "free:PRC[5] ParallelPlanes");
                            if (array2.Length == 0)
                            {
                                DentalLogger.Log("free - PRC[5] 로드 실패로 가공을 중단합니다.");
                                return;
                            }
                            goto IL_026f;
                        IL_026f:
                            num2 = 36;
                            techLatheMoldParallelPlanes = (TechLatheMoldParallelPlanes)array2[0];
                            goto IL_027d;
                        IL_027d:
                            num2 = 37;
                            // legacy free() 경로도 FrontFaceMill/Safe 경로와 동일한 끝점 정책을 사용한다.
                            ApplyFrontFaceFixedDepth(techLatheMoldParallelPlanes, "free:FrontFace");
                            TryApplyFaceRightEndGuard(techLatheMoldParallelPlanes, "free:FrontFace");
                            goto IL_0309;
                        // 디컴파일된 상태머신(case 38/39/41/42/43) 호환용 라벨 유지
                        // (기존 RL 분기 코드를 정책 통합으로 축약했지만, 재진입 goto 타깃은 남겨둔다)
                        IL_0290:
                            num2 = 38;
                            goto IL_027d;
                        IL_02a3:
                            num2 = 39;
                            goto IL_027d;
                        IL_02c9:
                            num2 = 41;
                            goto IL_027d;
                        IL_02dc:
                            num2 = 42;
                            goto IL_027d;
                        IL_02f6:
                            num2 = 43;
                            goto IL_027d;
                        IL_0309:
                            num2 = 44;
                            ZH = Math.Abs(MoveSTL_Module.FrontPointX);
                            goto IL_031b;
                        IL_031b:
                            num2 = 45;
                            if (string.Equals(Environment.GetEnvironmentVariable("ABUTS_SKIP_FRONTFACE_IN_FREEFORM"), "1", StringComparison.OrdinalIgnoreCase)
                                || string.Equals(Environment.GetEnvironmentVariable("ABUTS_SKIP_FRONTFACE_IN_FREEFORM"), "true", StringComparison.OrdinalIgnoreCase))
                            {
                                DentalLogger.Log("free - ABUTS_SKIP_FRONTFACE_IN_FREEFORM 설정으로 FrontFace 단계를 건너뜁니다.");
                                goto IL_033d;
                            }
                            if (LogGraphicObjectIsNull(array[5], "free array[5]", "Document.FreeFormFeatures에서 '3DMilling_FrontFace' FreeFormFeature를 준비하세요.", stopProcess: true))
                            {
                                DentalLogger.Log("free - FrontFace FreeFormFeature 누락으로 공정을 중단합니다.");
                                return;
                            }
                            Document.Operations.Add(techLatheMoldParallelPlanes, array[5], RuntimeHelpers.GetObjectValue(Missing.Value));
                            try
                            {
                                DentalLogger.Log($"free - FrontFace Add 직후 Ops.Count={Document.Operations.Count}");
                                for (int i = 1; i <= Document.Operations.Count; i++)
                                {
                                    object op = null;
                                    try { op = Document.Operations[i]; } catch { }
                                    if (op == null)
                                    {
                                        DentalLogger.Log($"free - FrontFace Add 직후 Op[{i}] null");
                                        continue;
                                    }
                                    string name = null;
                                    string key = null;
                                    try { name = (string)op.GetType().InvokeMember("Name", BindingFlags.GetProperty, null, op, null); } catch { }
                                    try { key = (string)op.GetType().InvokeMember("Key", BindingFlags.GetProperty, null, op, null); } catch { }
                                    DentalLogger.Log($"free - FrontFace Add 직후 Op[{i}] {name ?? "(no-name)"} Key:{key}");
                                }
                            }
                            catch (Exception ex)
                            {
                                DentalLogger.Log($"free - FrontFace Add 후 Ops Count 확인 실패: {ex.GetType().Name}:{ex.Message}");
                            }
                            goto IL_033d;
                        IL_033d:
                            num2 = 46;
                            file = PrcFilePath[6];
                            goto IL_0349;
                        IL_0349:
                            num2 = 47;
                            file2 = PrcFilePath[7];
                            goto IL_0355;
                        IL_0355:
                            num2 = 48;
                            if (machinetype == 1)
                            {
                                goto IL_0363;
                            }
                            goto IL_0535;
                        IL_0363:
                            num2 = 49;
                            array2 = (ITechnology[])technologyUtility.OpenProcess(file);
                            goto IL_0376;
                        IL_0376:
                            num2 = 50;
                            techLatheMoldParallelPlanes = (TechLatheMoldParallelPlanes)array2[0];
                            goto IL_0384;
                        IL_0384:
                            num2 = 51;
                            techLatheMoldParallelPlanes.BoundaryProfiles = "";
                            goto IL_0393;
                        IL_0393:
                            num2 = 52;
                            techLatheMoldParallelPlanes.BoundaryProfiles = "6," + Conversions.ToString(num6);
                            goto IL_03ae;
                        IL_03ae:
                            ProjectData.ClearProjectError();
                            num3 = 1;
                            goto IL_03b5;
                        IL_03b5:
                            num2 = 54;
                            if (LogGraphicObjectIsNull(array[1], "free array[1]", "Document.FreeFormFeatures에서 '3DMilling_0Degree' FreeFormFeature를 준비하세요.", stopProcess: true))
                            {
                                DentalLogger.Log("free - 0도 FreeFormFeature 누락으로 공정을 중단합니다.");
                                return;
                            }
                            Document.Operations.Add(techLatheMoldParallelPlanes, array[1], RuntimeHelpers.GetObjectValue(Missing.Value));
                            goto IL_03d7;
                        IL_03d7:
                            num2 = 55;
                            array2 = TryOpenProcess(technologyUtility, file2, "free:PRC[7] ParallelPlanes");
                            if (array2.Length == 0)
                            {
                                DentalLogger.Log("free - PRC[7] 로드 실패로 가공을 중단합니다.");
                                return;
                            }
                            goto IL_03ea;
                        IL_03ea:
                            num2 = 56;
                            techLatheMoldParallelPlanes = (TechLatheMoldParallelPlanes)array2[0];
                            goto IL_03f8;
                        IL_03f8:
                            num2 = 57;
                            techLatheMoldParallelPlanes.BoundaryProfiles = "";
                            goto IL_0407;
                        IL_0407:
                            num2 = 58;
                            techLatheMoldParallelPlanes.BoundaryProfiles = "6," + Conversions.ToString(num7);
                            goto IL_0422;
                        IL_0422:
                            ProjectData.ClearProjectError();
                            num3 = 1;
                            goto IL_0429;
                        IL_0429:
                            num2 = 60;
                            if (LogGraphicObjectIsNull(array[2], "free array[2]", "Document.FreeFormFeatures에서 '3DMilling_90Degree' FreeFormFeature를 준비하세요.", stopProcess: true))
                            {
                                DentalLogger.Log("free - 90도 FreeFormFeature 누락으로 공정을 중단합니다.");
                                return;
                            }
                            Document.Operations.Add(techLatheMoldParallelPlanes, array[2], RuntimeHelpers.GetObjectValue(Missing.Value));
                            goto IL_044b;
                        IL_044b:
                            num2 = 61;
                            array2 = (ITechnology[])technologyUtility.OpenProcess(file);
                            goto IL_045e;
                        IL_045e:
                            num2 = 62;
                            techLatheMoldParallelPlanes = (TechLatheMoldParallelPlanes)array2[0];
                            goto IL_046c;
                        IL_046c:
                            num2 = 63;
                            techLatheMoldParallelPlanes.BoundaryProfiles = "";
                            goto IL_047b;
                        IL_047b:
                            num2 = 64;
                            techLatheMoldParallelPlanes.BoundaryProfiles = "6," + Conversions.ToString(num6);
                            goto IL_0496;
                        IL_0496:
                            ProjectData.ClearProjectError();
                            num3 = 1;
                            goto IL_049d;
                        IL_049d:
                            num2 = 66;
                            if (LogGraphicObjectIsNull(array[3], "free array[3]", "Document.FreeFormFeatures에서 '3DMilling_180Degree' FreeFormFeature를 준비하세요.", stopProcess: true))
                            {
                                DentalLogger.Log("free - 180도 FreeFormFeature 누락으로 공정을 중단합니다.");
                                return;
                            }
                            Document.Operations.Add(techLatheMoldParallelPlanes, array[3], RuntimeHelpers.GetObjectValue(Missing.Value));
                            goto IL_04bf;
                        IL_04bf:
                            num2 = 67;
                            array2 = (ITechnology[])technologyUtility.OpenProcess(file2);
                            goto IL_04d2;
                        IL_04d2:
                            num2 = 68;
                            techLatheMoldParallelPlanes = (TechLatheMoldParallelPlanes)array2[0];
                            goto IL_04e0;
                        IL_04e0:
                            num2 = 69;
                            techLatheMoldParallelPlanes.BoundaryProfiles = "";
                            goto IL_04ef;
                        IL_04ef:
                            num2 = 70;
                            techLatheMoldParallelPlanes.BoundaryProfiles = "6," + Conversions.ToString(num7);
                            goto IL_050a;
                        IL_050a:
                            ProjectData.ClearProjectError();
                            num3 = 1;
                            goto IL_0511;
                        IL_0511:
                            num2 = 72;
                            if (LogGraphicObjectIsNull(array[4], "free array[4]", "Document.FreeFormFeatures에서 '3DMilling_270Degree' FreeFormFeature를 준비하세요.", stopProcess: true))
                            {
                                DentalLogger.Log("free - 270도 FreeFormFeature 누락으로 공정을 중단합니다.");
                                return;
                            }
                            Document.Operations.Add(techLatheMoldParallelPlanes, array[4], RuntimeHelpers.GetObjectValue(Missing.Value));
                            goto end_IL_0000_3;
                        IL_0535:
                            num2 = 74;
                            if (machinetype != 2)
                            {
                                goto end_IL_0000_3;
                            }
                            break;
                        IL_010b:
                            num2 = 14;
                            freeFormFeature = Document.FreeFormFeatures[num5];
                            goto IL_0126;
                        IL_0126:
                            num2 = 15;
                            if (Operators.CompareString(freeFormFeature.Name, "3DMilling_0Degree", false) == 0)
                            {
                                goto IL_013d;
                            }
                            goto IL_0151;
                        IL_013d:
                            num2 = 16;
                            array[1] = freeFormFeature;
                            goto IL_0145;
                        IL_0145:
                            num2 = 17;
                            featureSet.Add(freeFormFeature);
                            goto IL_0151;
                        IL_0151:
                            num2 = 18;
                            if (Operators.CompareString(freeFormFeature.Name, "3DMilling_180Degree", false) == 0)
                            {
                                goto IL_0168;
                            }
                            goto IL_017c;
                        IL_0168:
                            num2 = 19;
                            array[3] = freeFormFeature;
                            goto IL_0170;
                        IL_0170:
                            num2 = 20;
                            featureSet.Add(freeFormFeature);
                            goto IL_017c;
                        IL_017c:
                            num2 = 21;
                            if (Operators.CompareString(freeFormFeature.Name, "3DMilling_90Degree", false) == 0)
                            {
                                goto IL_0193;
                            }
                            goto IL_01a7;
                        IL_0193:
                            num2 = 22;
                            array[2] = freeFormFeature;
                            goto IL_019b;
                        IL_019b:
                            num2 = 23;
                            featureSet2.Add(freeFormFeature);
                            goto IL_01a7;
                        IL_01a7:
                            num2 = 24;
                            if (Operators.CompareString(freeFormFeature.Name, "3DMilling_270Degree", false) == 0)
                            {
                                goto IL_01be;
                            }
                            goto IL_01d2;
                        IL_01be:
                            num2 = 25;
                            array[4] = freeFormFeature;
                            goto IL_01c6;
                        IL_01c6:
                            num2 = 26;
                            featureSet2.Add(freeFormFeature);
                            goto IL_01d2;
                        IL_01d2:
                            num2 = 27;
                            if (Operators.CompareString(freeFormFeature.Name, "3DMilling_FrontFace", false) == 0)
                            {
                                goto IL_01e9;
                            }
                            goto IL_01f1;
                        IL_01e9:
                            num2 = 28;
                            array[5] = freeFormFeature;
                            goto IL_01f1;
                        IL_01f1:
                            num2 = 29;
                            num5 = checked(num5 + 1);
                            goto IL_01fa;
                        IL_0021:
                            num2 = 3;
                            featureChain = Document.FeatureChains[num5];
                            goto IL_003b;
                        IL_003b:
                            num2 = 4;
                            if (Operators.CompareString(featureChain.Name, "Boundry1", false) == 0)
                            {
                                goto IL_0051;
                            }
                            goto IL_0061;
                        IL_0051:
                            num2 = 5;
                            num6 = Conversions.ToInteger(featureChain.Key);
                            goto IL_0061;
                        IL_0061:
                            num2 = 6;
                            if (Operators.CompareString(featureChain.Name, "Boundry2", false) == 0)
                            {
                                goto IL_0077;
                            }
                            goto IL_0087;
                        IL_0077:
                            num2 = 7;
                            num7 = Conversions.ToInteger(featureChain.Key);
                            goto IL_0087;
                        end_IL_0000_2:
                            break;
                    }
                    num2 = 75;
                    DentalLogger.Log("free - MainFree 호출 직전");
                    MainFree();
                    try
                    {
                        DentalLogger.Log("free - MainFree 호출 직후");
                        DentalLogger.Log($"free - 종료 직전 Ops.Count={Document.Operations.Count}");
                        for (int i = 1; i <= Document.Operations.Count; i++)
                        {
                            object op = null;
                            try { op = Document.Operations[i]; } catch { }
                            if (op == null)
                            {
                                DentalLogger.Log($"free - Op[{i}] null");
                                continue;
                            }
                            string name = null;
                            string key = null;
                            try { name = (string)op.GetType().InvokeMember("Name", BindingFlags.GetProperty, null, op, null); } catch { }
                            try { key = (string)op.GetType().InvokeMember("Key", BindingFlags.GetProperty, null, op, null); } catch { }
                            DentalLogger.Log($"free - Op[{i}] {name ?? "(no-name)"} Key:{key}");
                        }
                    }
                    catch (Exception ex)
                    {
                        DentalLogger.Log($"free - 종료 직전 Ops 로깅 실패: {ex.GetType().Name}:{ex.Message}");
                    }
                    break;
                end_IL_0000:;
                }
                catch (Exception ex) when (num3 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 1677;
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

        public static void MainFree()
        {
            DentalLogger.Log("MainFree - 시작");

            try
            {
                DentalLogger.Log("MainFree - MoveSurface 시작");
                MoveSTL_Module.MoveSurface();
                DentalLogger.Log($"MainFree - MoveSurface 완료 NeedMove:{MoveSTL_Module.NeedMove}, dY:{MoveSTL_Module.NeedMoveY:0.000}, dZ:{MoveSTL_Module.NeedMoveZ:0.000}");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"MainFree - MoveSurface 실패: {ex.GetType().Name}:{ex.Message}");
                throw;
            }

            try
            {
                DentalLogger.Log("MainFree - Emerge 시작");
                Emerge();
                DentalLogger.Log("MainFree - Emerge 완료");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"MainFree - Emerge 실패: {ex.GetType().Name}:{ex.Message}");
                throw;
            }

            try
            {
                DentalLogger.Log("MainFree - Composite 시작");
                Composite();
                DentalLogger.Log("MainFree - Composite 완료");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"MainFree - Composite 실패: {ex.GetType().Name}:{ex.Message}");
                throw;
            }

            try
            {
                int count = Document.GraphicsCollection.Count;
                int hidden = 0;
                DentalLogger.Log($"MainFree - Surface 숨김 시작 Graphics.Count={count}");
                for (int i = 1; i <= count; i = checked(i + 1))
                {
                    GraphicObject graphicObject = (GraphicObject)Document.GraphicsCollection[i];
                    if (graphicObject.GraphicObjectType == espGraphicObjectType.espSurface)
                    {
                        graphicObject.Layer.Visible = false;
                        hidden++;
                    }
                }
                DentalLogger.Log($"MainFree - Surface 숨김 완료 hidden={hidden}");
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"MainFree - Surface 숨김 실패: {ex.GetType().Name}:{ex.Message}");
                throw;
            }

            DentalLogger.Log("MainFree - 종료");
        }

                public static void RoughFreeFromMill()
        {
            try
            {
                if (TryRunRoughFreeFromMillSplitAB())
                {
                    return;
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"RoughFreeFromMill - SplitAB 예외: {ex.GetType().Name}:{ex.Message}");
                DentalLogger.LogException("MainModule.RoughFreeFromMill.SplitAB", ex);
            }

            int try0000_dispatch = -1;
            int num2 = default(int);
            FreeFormFeature[] array = default(FreeFormFeature[]);
            int num = default(int);
            int num3 = default(int);
            int count = default(int);
            int num5 = default(int);
            FeatureSet featureSet = default(FeatureSet);
            int count2 = default(int);
            TechnologyUtility technologyUtility = default(TechnologyUtility);
            Layer activeLayer = default(Layer);
            string file = default(string);
            ITechnology[] array2 = default(ITechnology[]);
            TechLatheMoldRoughing techLatheMoldRoughing = default(TechLatheMoldRoughing);
            int num6 = default(int);
            TechLatheMoldZLevel techLatheMoldZLevel = default(TechLatheMoldZLevel);
            FreeFormFeature freeFormFeature = default(FreeFormFeature);
            FeatureChain featureChain = default(FeatureChain);
            int count3 = default(int);
            int count4 = default(int);
            int num7 = default(int);
            int num8 = default(int);
            bool hasRough0Degree = false;
            bool hasRough180Degree = false;
            bool hasRough120Degree = false;
            bool hasRough240Degree = false;
            while (true)
            {
                try
                {
                    /*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/
                    ;
                    checked
                    {
                        int num4;
                        switch (try0000_dispatch)
                        {
                            default:
                                num2 = 1;
                                array = new FreeFormFeature[6];
                                goto IL_0009;
                            case 2470:
                                {
                                    num = num2;
                                    switch (num3)
                                    {
                                        case 2:
                                        case 3:
                                            break;
                                        case 1:
                                            goto IL_07f2;
                                        default:
                                            goto IL_09e0;
                                    }
                                    goto end_IL_0000;
                                }
                            IL_07f2:
                                num4 = unchecked(num + 1);
                                num = 0;
                                switch (num4)
                                {
                                    case 1:
                                        break;
                                    case 2:
                                        goto IL_0009;
                                    case 3:
                                        goto IL_001e;
                                    case 4:
                                        goto IL_0036;
                                    case 5:
                                        goto IL_0050;
                                    case 6:
                                        goto IL_0066;
                                    case 7:
                                        goto IL_0076;
                                    case 8:
                                        goto IL_0084;
                                    case 9:
                                        goto IL_00a1;
                                    case 10:
                                        goto IL_00b0;
                                    case 11:
                                        goto IL_00c9;
                                    case 12:
                                        goto IL_00e4;
                                    case 13:
                                        goto IL_00fb;
                                    case 14:
                                        goto IL_0103;
                                    case 15:
                                        goto IL_010f;
                                    case 16:
                                        goto IL_0126;
                                    case 17:
                                        goto IL_012e;
                                    case 18:
                                        goto IL_013a;
                                    case 19:
                                        DentalLogger.Log($"RoughFreeFromMill - 3DRoughMilling_0Degree {(hasRough0Degree ? "확보" : "없음")}, 180Degree {(hasRough180Degree ? "확보" : "없음")}");
                                goto IL_0149;
                                    case 20:
                                        goto IL_0150;
                                    case 21:
                                        goto IL_016e;
                                    case 22:
                                        goto IL_0187;
                                    case 23:
                                        goto IL_0196;
                                    case 24:
                                        goto IL_01a2;
                                    case 25:
                                        goto IL_01b5;
                                    case 26:
                                        goto IL_01bc;
                                    case 27:
                                        goto IL_01ca;
                                    case 28:
                                        goto IL_01d9;
                                    case 29:
                                        goto IL_01f4;
                                    case 30:
                                        goto IL_0216;
                                    case 31:
                                        goto IL_0223;
                                    case 32:
                                        goto IL_0231;
                                    case 33:
                                        goto IL_0240;
                                    case 34:
                                        goto IL_025b;
                                    case 35:
                                        goto IL_027d;
                                    case 36:
                                        goto IL_0290;
                                    case 37:
                                        goto IL_029e;
                                    case 38:
                                        goto IL_02ad;
                                    case 39:
                                        goto IL_02c8;
                                    case 40:
                                        goto IL_02ea;
                                    case 41:
                                        goto IL_02fa;
                                    case 42:
                                        goto IL_0308;
                                    case 43:
                                        goto IL_0317;
                                    case 44:
                                        goto IL_0332;
                                    case 46:
                                        goto IL_0359;
                                    case 47:
                                        goto IL_0375;
                                    case 48:
                                        goto IL_0390;
                                    case 49:
                                        goto IL_03a7;
                                    case 50:
                                        goto IL_03b8;
                                    case 51:
                                        goto IL_03cf;
                                    case 52:
                                        goto IL_03e0;
                                    case 53:
                                        goto IL_03f7;
                                    case 54:
                                        goto IL_0408;
                                    case 55:
                                        goto IL_041a;
                                    case 56:
                                        goto IL_0438;
                                    case 57:
                                        goto IL_0447;
                                    case 58:
                                        goto IL_0463;
                                    case 59:
                                        goto IL_047e;
                                    case 60:
                                        goto IL_0495;
                                    case 61:
                                        goto IL_049d;
                                    case 62:
                                        goto IL_04a9;
                                    case 63:
                                        goto IL_04c0;
                                    case 64:
                                        goto IL_04c8;
                                    case 65:
                                        goto IL_04d4;
                                    case 66:
                                        goto IL_04eb;
                                    case 67:
                                        goto IL_04f3;
                                    case 68:
                                        goto IL_04ff;
                                    case 69:
                                        DentalLogger.Log($"RoughFreeFromMill - 3DRoughMilling_0Degree {(hasRough0Degree ? "확보" : "없음")}, 120Degree {(hasRough120Degree ? "확보" : "없음")}, 240Degree {(hasRough240Degree ? "확보" : "없음")}");
                                goto IL_0511;
                                    case 70:
                                        goto IL_0518;
                                    case 71:
                                        goto IL_0536;
                                    case 72:
                                        goto IL_054f;
                                    case 73:
                                        goto IL_055e;
                                    case 74:
                                        goto IL_056a;
                                    case 75:
                                        goto IL_057d;
                                    case 76:
                                        goto IL_0584;
                                    case 77:
                                        goto IL_0592;
                                    case 78:
                                        goto IL_05a1;
                                    case 79:
                                        goto IL_05bc;
                                    case 80:
                                        goto IL_05de;
                                    case 81:
                                        goto IL_05eb;
                                    case 82:
                                        goto IL_05f9;
                                    case 83:
                                        goto IL_0608;
                                    case 84:
                                        goto IL_0623;
                                    case 85:
                                        goto IL_0645;
                                    case 86:
                                        goto IL_0658;
                                    case 87:
                                        goto IL_0666;
                                    case 88:
                                        goto IL_0675;
                                    case 89:
                                        goto IL_0690;
                                    case 90:
                                        goto IL_06b2;
                                    case 91:
                                        goto IL_06bf;
                                    case 92:
                                        goto IL_06cd;
                                    case 93:
                                        goto IL_06dc;
                                    case 94:
                                        goto IL_06f7;
                                    case 95:
                                        goto IL_0719;
                                    case 96:
                                        goto IL_072c;
                                    case 97:
                                        goto IL_073a;
                                    case 98:
                                        goto IL_0749;
                                    case 99:
                                        goto IL_0764;
                                    case 100:
                                        goto IL_0786;
                                    case 101:
                                        goto IL_0793;
                                    case 102:
                                        goto IL_07a1;
                                    case 103:
                                        goto IL_07b0;
                                    case 104:
                                        goto end_IL_0000_2;
                                    case 45:
                                    case 105:
                                        goto end_IL_0000;
                                    default:
                                        goto IL_09e0;
                                }
                                goto default;
                            IL_0009:
                                num2 = 2;
                                if (RoughType == 2.0)
                                {
                                    goto IL_001e;
                                }
                                goto IL_0359;
                            IL_001e:
                                num2 = 3;
                                count = Document.FeatureChains.Count;
                                num5 = 1;
                                goto IL_007e;
                            IL_007e:
                                if (num5 <= count)
                                {
                                    goto IL_0036;
                                }
                                goto IL_0084;
                            IL_0084:
                                num2 = 8;
                                featureSet = Document.FeatureSets.Add(RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_00a1;
                            IL_00a1:
                                num2 = 9;
                                featureSet.Name = "Rough_0-180Degree";
                                goto IL_00b0;
                            IL_00b0:
                                num2 = 10;
                                count2 = Document.FreeFormFeatures.Count;
                                num5 = 1;
                                goto IL_0143;
                            IL_0143:
                                if (num5 <= count2)
                                {
                                    goto IL_00c9;
                                }
                                goto IL_0149;
                            IL_0149:
                                ProjectData.ClearProjectError();
                                num3 = 1;
                                goto IL_0150;
                            IL_0150:
                                num2 = 20;
                                technologyUtility = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
                                goto IL_016e;
                            IL_016e:
                                num2 = 21;
                                activeLayer = GetOrCreateLayer("RoughFreeFormMill");
                                if (activeLayer == null)
                                {
                                    DentalLogger.Log("RoughFreeFromMill: 'RoughFreeFormMill' 레이어 확보 실패");
                                    return;
                                }
                                goto IL_0187;
                            IL_0187:
                                num2 = 22;
                                Document.ActiveLayer = activeLayer;
                                goto IL_0196;
                            IL_0196:
                                num2 = 23;
                                file = PrcFilePath[3];
                                goto IL_01a2;
                            IL_01a2:
                                num2 = 24;
                                array2 = TryOpenProcess(technologyUtility, file, "RoughFreeFromMill:PRC[3] 0-180");
                                if (array2.Length == 0)
                                {
                                    DentalLogger.Log("RoughFreeFromMill - PRC[3] 로드 실패로 중단");
                                    return;
                                }
                                goto IL_01b5;
                            IL_01b5:
                                ProjectData.ClearProjectError();
                                num3 = 2;
                                goto IL_01bc;
                            IL_01bc:
                                num2 = 26;
                                techLatheMoldRoughing = (TechLatheMoldRoughing)array2[0];
                                goto IL_01ca;
                            IL_01ca:
                                num2 = 27;
                                techLatheMoldRoughing.BoundaryProfiles = "";
                                goto IL_01d9;
                            IL_01d9:
                                num2 = 28;
                                techLatheMoldRoughing.BoundaryProfiles = "6," + Conversions.ToString(num6);
                                goto IL_01f4;
                            IL_01f4:
                                num2 = 29;
                                if (!LogGraphicObjectIsNull(array[1], "RoughFreeFromMill array[1]"))
                                {
                                    TryAddOperation(techLatheMoldRoughing, array[1], "LatheMoldRoughing array[1]");
                                }
                                goto IL_0216;
                            IL_0216:
                                num2 = 30;
                                if (array2.Count() > 1)
                                {
                                    goto IL_0223;
                                }
                                goto IL_027d;
                            IL_0223:
                                num2 = 31;
                                techLatheMoldZLevel = (TechLatheMoldZLevel)array2[1];
                                goto IL_0231;
                            IL_0231:
                                num2 = 32;
                                techLatheMoldZLevel.BoundaryProfiles = "";
                                goto IL_0240;
                            IL_0240:
                                num2 = 33;
                                techLatheMoldZLevel.BoundaryProfiles = "6," + Conversions.ToString(num6);
                                goto IL_025b;
                            IL_025b:
                                num2 = 34;
                                if (LogGraphicObjectIsNull(array[1], "RoughFreeFromMill array[1]", "Document.FreeFormFeatures에서 '3DRoughMilling_0Degree' FreeFormFeature 준비 여부를 확인하세요.", stopProcess: true))
                                {
                                    DentalLogger.Log("RoughFreeFromMill - 0/180도 가공에 필요한 FreeFormFeature가 없어 흐름을 종료합니다.");
                                    return;
                                }
                                TryAddOperation(techLatheMoldZLevel, array[1], "LatheMoldZLevel array[1]");
                                goto IL_027d;
                            IL_027d:
                                num2 = 35;
                                if (RoughType == 2.0 && PrcFilePath != null && PrcFilePath.Length > 0 && !string.IsNullOrWhiteSpace(PrcFilePath[0]))
                                {
                                    file = PrcFilePath[0];
                                    DentalLogger.Log($"RoughFreeFromMill - 180Degree PRC override 적용: {file}");
                                }
                                array2 = TryOpenProcess(technologyUtility, file, "RoughFreeFromMill:PRC[3] 재호출");
                                if (array2.Length == 0)
                                {
                                    DentalLogger.Log("RoughFreeFromMill - PRC[3] 재호출 실패로 중단");
                                    return;
                                }
                                goto IL_0290;
                            IL_0290:
                                num2 = 36;
                                techLatheMoldRoughing = (TechLatheMoldRoughing)array2[0];
                                goto IL_029e;
                            IL_029e:
                                num2 = 37;
                                techLatheMoldRoughing.BoundaryProfiles = "";
                                goto IL_02ad;
                            IL_02ad:
                                num2 = 38;
                                techLatheMoldRoughing.BoundaryProfiles = "6," + Conversions.ToString(num6);
                                goto IL_02c8;
                            IL_02c8:
                                num2 = 39;
                                if (LogGraphicObjectIsNull(array[2], "RoughFreeFromMill array[2]", "Document.FreeFormFeatures에서 '3DRoughMilling_180Degree' FreeFormFeature를 생성했는지 확인하세요.", stopProcess: true))
                                {
                                    DentalLogger.Log("RoughFreeFromMill - 180도 FreeFormFeature 누락으로 공정을 중단합니다.");
                                    return;
                                }
                                TryAddOperation(techLatheMoldRoughing, array[2], "LatheMoldRoughing array[2]");
                                goto IL_02ea;
                            IL_02ea:
                                num2 = 40;
                                if (array2.Count() > 1)
                                {
                                    goto IL_02fa;
                                }
                                goto end_IL_0000;
                            IL_02fa:
                                num2 = 41;
                                techLatheMoldZLevel = (TechLatheMoldZLevel)array2[1];
                                goto IL_0308;
                            IL_0308:
                                num2 = 42;
                                techLatheMoldZLevel.BoundaryProfiles = "";
                                goto IL_0317;
                            IL_0317:
                                num2 = 43;
                                techLatheMoldZLevel.BoundaryProfiles = "6," + Conversions.ToString(num6);
                                goto IL_0332;
                            IL_0332:
                                num2 = 44;
                                if (LogGraphicObjectIsNull(array[2], "RoughFreeFromMill array[2]", "Document.FreeFormFeatures에서 '3DRoughMilling_180Degree' FreeFormFeature를 생성했는지 확인하세요.", stopProcess: true))
                                {
                                    DentalLogger.Log("RoughFreeFromMill - 180도 FreeFormFeature 누락으로 공정을 중단합니다.");
                                    return;
                                }
                                TryAddOperation(techLatheMoldZLevel, array[2], "LatheMoldZLevel array[2]");
                                goto end_IL_0000;
                            IL_00c9:
                                num2 = 11;
                                freeFormFeature = Document.FreeFormFeatures[num5];
                                goto IL_00e4;
                            IL_00e4:
                                num2 = 12;
                                if (Operators.CompareString(freeFormFeature.Name, "3DRoughMilling_0Degree", false) == 0)
                                {
                                    goto IL_00fb;
                                }
                                goto IL_010f;
                            IL_00fb:
                                num2 = 13;
                                array[1] = freeFormFeature;
                                hasRough0Degree = true;
                                goto IL_0103;
                            IL_0103:
                                num2 = 14;
                                featureSet.Add(freeFormFeature);
                                goto IL_010f;
                            IL_010f:
                                num2 = 15;
                                if (Operators.CompareString(freeFormFeature.Name, "3DRoughMilling_180Degree", false) == 0)
                                {
                                    goto IL_0126;
                                }
                                goto IL_013a;
                            IL_0126:
                                num2 = 16;
                                array[2] = freeFormFeature;
                                hasRough180Degree = true;
                                goto IL_012e;
                            IL_012e:
                                num2 = 17;
                                featureSet.Add(freeFormFeature);
                                goto IL_013a;
                            IL_013a:
                                num2 = 18;
                                num5++;
                                goto IL_0143;
                            IL_0036:
                                num2 = 4;
                                featureChain = Document.FeatureChains[num5];
                                goto IL_0050;
                            IL_0050:
                                num2 = 5;
                                if (Operators.CompareString(featureChain.Name, "RoughBoundry1", false) == 0)
                                {
                                    goto IL_0066;
                                }
                                goto IL_0076;
                            IL_0066:
                                num2 = 6;
                                num6 = Conversions.ToInteger(featureChain.Key);
                                goto IL_0076;
                            IL_0076:
                                num2 = 7;
                                num5++;
                                goto IL_007e;
                            IL_0359:
                                num2 = 46;
                                count3 = Document.FeatureChains.Count;
                                num5 = 1;
                                goto IL_0411;
                            IL_0411:
                                if (num5 <= count3)
                                {
                                    goto IL_0375;
                                }
                                goto IL_041a;
                            IL_041a:
                                num2 = 55;
                                featureSet = Document.FeatureSets.Add(RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0438;
                            IL_0438:
                                num2 = 56;
                                featureSet.Name = "Rough_0-120-240Degree";
                                goto IL_0447;
                            IL_0447:
                                num2 = 57;
                                count4 = Document.FreeFormFeatures.Count;
                                num5 = 1;
                                goto IL_0508;
                            IL_0508:
                                if (num5 <= count4)
                                {
                                    goto IL_0463;
                                }
                                goto IL_0511;
                            IL_0511:
                                ProjectData.ClearProjectError();
                                num3 = 1;
                                goto IL_0518;
                            IL_0518:
                                num2 = 70;
                                technologyUtility = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
                                goto IL_0536;
                            IL_0536:
                                num2 = 71;
                                activeLayer = Document.Layers.Add("RoughFreeFormMill");
                                goto IL_054f;
                            IL_054f:
                                num2 = 72;
                                Document.ActiveLayer = activeLayer;
                                goto IL_055e;
                            IL_055e:
                                num2 = 73;
                                file = PrcFilePath[3];
                                goto IL_056a;
                            IL_056a:
                                num2 = 74;
                                array2 = TryOpenProcess(technologyUtility, file, "RoughFreeFromMill:PRC[3] 0-120-240");
                                if (array2.Length == 0)
                                {
                                    DentalLogger.Log("RoughFreeFromMill - PRC[3] 로드 실패로 중단");
                                    return;
                                }
                                goto IL_057d;
                            IL_057d:
                                ProjectData.ClearProjectError();
                                num3 = 3;
                                goto IL_0584;
                            IL_0584:
                                num2 = 76;
                                techLatheMoldRoughing = (TechLatheMoldRoughing)array2[0];
                                goto IL_0592;
                            IL_0592:
                                num2 = 77;
                                techLatheMoldRoughing.BoundaryProfiles = "";
                                goto IL_05a1;
                            IL_05a1:
                                num2 = 78;
                                techLatheMoldRoughing.BoundaryProfiles = "6," + Conversions.ToString(num6);
                                goto IL_05bc;
                            IL_05bc:
                                num2 = 79;
                                if (LogGraphicObjectIsNull(array[1], "RoughFreeFromMill array[1]", "Document.FreeFormFeatures에서 '3DRoughMilling_0Degree' FreeFormFeature를 준비했는지 확인하세요.", stopProcess: true))
                                {
                                    DentalLogger.Log("RoughFreeFromMill - 0도 FreeFormFeature 누락으로 공정을 중단합니다.");
                                    return;
                                }
                                TryAddOperation(techLatheMoldRoughing, array[1], "LatheMoldRoughing array[1]");
                                goto IL_05de;
                            IL_05de:
                                num2 = 80;
                                if (array2.Count() > 1)
                                {
                                    goto IL_05eb;
                                }
                                goto IL_0645;
                            IL_05eb:
                                num2 = 81;
                                techLatheMoldZLevel = (TechLatheMoldZLevel)array2[1];
                                goto IL_05f9;
                            IL_05f9:
                                num2 = 82;
                                techLatheMoldZLevel.BoundaryProfiles = "";
                                goto IL_0608;
                            IL_0608:
                                num2 = 83;
                                techLatheMoldZLevel.BoundaryProfiles = "6," + Conversions.ToString(num6);
                                goto IL_0623;
                            IL_0623:
                                num2 = 84;
                                if (LogGraphicObjectIsNull(array[1], "RoughFreeFromMill array[1]", "Document.FreeFormFeatures에서 '3DRoughMilling_0Degree' FreeFormFeature를 준비했는지 확인하세요.", stopProcess: true))
                                {
                                    DentalLogger.Log("RoughFreeFromMill - 0도 FreeFormFeature 누락으로 공정을 중단합니다.");
                                    return;
                                }
                                TryAddOperation(techLatheMoldZLevel, array[1], "LatheMoldZLevel array[1]");
                                goto IL_0645;
                            IL_0645:
                                num2 = 85;
                                array2 = TryOpenProcess(technologyUtility, file, "RoughFreeFromMill:PRC[3] 120/240");
                                if (array2.Length == 0)
                                {
                                    DentalLogger.Log("RoughFreeFromMill - PRC[3] 재호출 실패로 중단");
                                    return;
                                }
                                goto IL_0658;
                            IL_0658:
                                num2 = 86;
                                techLatheMoldRoughing = (TechLatheMoldRoughing)array2[0];
                                goto IL_0666;
                            IL_0666:
                                num2 = 87;
                                techLatheMoldRoughing.BoundaryProfiles = "";
                                goto IL_0675;
                            IL_0675:
                                num2 = 88;
                                techLatheMoldRoughing.BoundaryProfiles = "6," + Conversions.ToString(num7);
                                goto IL_0690;
                            IL_0690:
                                num2 = 89;
                                if (LogGraphicObjectIsNull(array[2], "RoughFreeFromMill array[2]", "Document.FreeFormFeatures에서 '3DRoughMilling_120Degree' FreeFormFeature를 생성했는지 확인하세요.", stopProcess: true))
                                {
                                    DentalLogger.Log("RoughFreeFromMill - 120도 FreeFormFeature 누락으로 공정을 중단합니다.");
                                    return;
                                }
                                TryAddOperation(techLatheMoldRoughing, array[2], "LatheMoldRoughing array[2]");
                                goto IL_06b2;
                            IL_06b2:
                                num2 = 90;
                                if (array2.Count() > 1)
                                {
                                    goto IL_06bf;
                                }
                                goto IL_0719;
                            IL_06bf:
                                num2 = 91;
                                techLatheMoldZLevel = (TechLatheMoldZLevel)array2[1];
                                goto IL_06cd;
                            IL_06cd:
                                num2 = 92;
                                techLatheMoldZLevel.BoundaryProfiles = "";
                                goto IL_06dc;
                            IL_06dc:
                                num2 = 93;
                                techLatheMoldZLevel.BoundaryProfiles = "6," + Conversions.ToString(num7);
                                goto IL_06f7;
                            IL_06f7:
                                num2 = 94;
                                TryAddOperation(techLatheMoldZLevel, array[2], "LatheMoldZLevel array[2]");
                                goto IL_0719;
                            IL_0719:
                                num2 = 95;
                                array2 = TryOpenProcess(technologyUtility, file, "free:PRC[6] ParallelPlanes");
                            if (array2.Length == 0)
                            {
                                DentalLogger.Log("free - PRC[6] 로드 실패로 가공을 중단합니다.");
                                return;
                            }
                                goto IL_072c;
                            IL_072c:
                                num2 = 96;
                                techLatheMoldRoughing = (TechLatheMoldRoughing)array2[0];
                                goto IL_073a;
                            IL_073a:
                                num2 = 97;
                                techLatheMoldRoughing.BoundaryProfiles = "";
                                goto IL_0749;
                            IL_0749:
                                num2 = 98;
                                techLatheMoldRoughing.BoundaryProfiles = "6," + Conversions.ToString(num8);
                                goto IL_0764;
                            IL_0764:
                                num2 = 99;
                                if (LogGraphicObjectIsNull(array[3], "RoughFreeFromMill array[3]", "Document.FreeFormFeatures에서 '3DRoughMilling_240Degree' FreeFormFeature를 생성했는지 확인하세요.", stopProcess: true))
                                {
                                    DentalLogger.Log("RoughFreeFromMill - 240도 FreeFormFeature 누락으로 공정을 중단합니다.");
                                    return;
                                }
                                TryAddOperation(techLatheMoldRoughing, array[3], "LatheMoldRoughing array[3]");
                                goto IL_0786;
                            IL_0786:
                                num2 = 100;
                                if (array2.Count() > 1)
                                {
                                    goto IL_0793;
                                }
                                goto end_IL_0000;
                            IL_0793:
                                num2 = 101;
                                techLatheMoldZLevel = (TechLatheMoldZLevel)array2[1];
                                goto IL_07a1;
                            IL_07a1:
                                num2 = 102;
                                techLatheMoldZLevel.BoundaryProfiles = "";
                                goto IL_07b0;
                            IL_07b0:
                                num2 = 103;
                                techLatheMoldZLevel.BoundaryProfiles = "6," + Conversions.ToString(num8);
                                break;
                        IL_0203:
                            DentalLogger.Log("RoughFreeFromMill - 0/180도 FreeFormFeature를 찾지 못했습니다.");
                            goto IL_0149;
                            IL_0463:
                                num2 = 58;
                                freeFormFeature = Document.FreeFormFeatures[num5];
                                goto IL_047e;
                            IL_047e:
                                num2 = 59;
                                if (Operators.CompareString(freeFormFeature.Name, "3DRoughMilling_0Degree", false) == 0)
                                {
                                    goto IL_0495;
                                }
                                goto IL_04a9;
                            IL_0495:
                                num2 = 60;
                                array[1] = freeFormFeature;
                                hasRough0Degree = true;
                                goto IL_049d;
                            IL_049d:
                                num2 = 61;
                                featureSet.Add(freeFormFeature);
                                goto IL_04a9;
                            IL_04a9:
                                num2 = 62;
                                if (Operators.CompareString(freeFormFeature.Name, "3DRoughMilling_120Degree", false) == 0)
                                {
                                    goto IL_04c0;
                                }
                                goto IL_04d4;
                            IL_04c0:
                                num2 = 63;
                                array[2] = freeFormFeature;
                                hasRough120Degree = true;
                                goto IL_04c8;
                            IL_04c8:
                                num2 = 64;
                                featureSet.Add(freeFormFeature);
                                goto IL_04d4;
                            IL_04d4:
                                num2 = 65;
                                if (Operators.CompareString(freeFormFeature.Name, "3DRoughMilling_240Degree", false) == 0)
                                {
                                    goto IL_04eb;
                                }
                                goto IL_04ff;
                            IL_04eb:
                                num2 = 66;
                                array[3] = freeFormFeature;
                                hasRough240Degree = true;
                                goto IL_04f3;
                            IL_04f3:
                                num2 = 67;
                                featureSet.Add(freeFormFeature);
                                goto IL_04ff;
                            IL_04ff:
                                num2 = 68;
                                num5++;
                                goto IL_0508;
                            IL_0375:
                                num2 = 47;
                                featureChain = Document.FeatureChains[num5];
                                goto IL_0390;
                            IL_0390:
                                num2 = 48;
                                if (Operators.CompareString(featureChain.Name, "RoughBoundry1", false) == 0)
                                {
                                    goto IL_03a7;
                                }
                                goto IL_03b8;
                            IL_03a7:
                                num2 = 49;
                                num6 = Conversions.ToInteger(featureChain.Key);
                                goto IL_03b8;
                            IL_03b8:
                                num2 = 50;
                                if (Operators.CompareString(featureChain.Name, "RoughBoundry2", false) == 0)
                                {
                                    goto IL_03cf;
                                }
                                goto IL_03e0;
                            IL_03cf:
                                num2 = 51;
                                num7 = Conversions.ToInteger(featureChain.Key);
                                goto IL_03e0;
                            IL_03e0:
                                num2 = 52;
                                if (Operators.CompareString(featureChain.Name, "RoughBoundry3", false) == 0)
                                {
                                    goto IL_03f7;
                                }
                                goto IL_0408;
                            IL_03f7:
                                num2 = 53;
                                num8 = Conversions.ToInteger(featureChain.Key);
                                goto IL_0408;
                            IL_0408:
                                num2 = 54;
                                num5++;
                                goto IL_0411;
                            end_IL_0000_2:
                                break;
                        }
                        num2 = 104;
                        TryAddOperation(techLatheMoldZLevel, array[3], "LatheMoldZLevel array[3]");
                    }
                end_IL_0000:;
                }
                catch (Exception ex) when (num3 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 2470;
                    continue;
                }
                break;
            IL_09e0:
                throw ProjectData.CreateProjectError(-2146828237);
            }
            if (num != 0)
            {
                ProjectData.ClearProjectError();
            }
        }


        public static void OP36()
        {
            SelectionSet selectionSet = Document.SelectionSets["tf"];
            if (selectionSet == null)
            {
                selectionSet = Document.SelectionSets.Add("tf");
            }
            selectionSet.RemoveAll();
            checked
            {
                int num = (int)Math.Round(AngleNumber - 1.0);
                FeatureChain featureChain = default(FeatureChain);
                for (int i = 0; i <= num; i++)
                {
                    int count = Document.FeatureChains.Count;
                    for (int j = 1; j <= count; j++)
                    {
                        featureChain = Document.FeatureChains[j];
                        if (Operators.CompareString(featureChain.Name, Conversions.ToString(i) + " FeatureChain", false) == 0)
                        {
                            break;
                        }
                    }
                    selectionSet.Add(featureChain, RuntimeHelpers.GetObjectValue(Missing.Value));
                }
                string file = PrcFilePath[9];
                DentalLogger.Log($"OP36 - OpenProcess: PRC[9]={file}");
                TechLatheMillContour1 techLatheMillContour = (TechLatheMillContour1)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file))[0];
                bool flag = false;
                int count2 = Document.Layers.Count;
                for (int j = 1; j <= count2; j++)
                {
                    if (Operators.CompareString(Document.Layers[j].Name, "GeoTemp", false) == 0)
                    {
                        flag = true;
                        break;
                    }
                }
                if (flag)
                {
                    Document.ActiveLayer = Document.Layers["GeoTemp"];
                }
                int num2 = (int)Math.Round(AngleNumber);
                for (int j = 1; j <= num2; j++)
                {
                    if (Math.Abs(Conversion.Int((double)j / 2.0) * 2.0 - (double)j) <= 0.001)
                    {
                        TechLatheMillContour1 techLatheMillContour2 = techLatheMillContour;
                        if (RL == 1.0)
                        {
                            techLatheMillContour2.OffsetSideComputer = espMillContourOffsetSide.espMillContourOffsetRight;
                            techLatheMillContour2.CuttingStrategy = espMillCuttingStrategy.espMillCuttingStrategyClimb;
                        }
                        else
                        {
                            techLatheMillContour2.OffsetSideComputer = espMillContourOffsetSide.espMillContourOffsetLeft;
                            techLatheMillContour2.CuttingStrategy = espMillCuttingStrategy.espMillCuttingStrategyConventional;
                        }
                        techLatheMillContour2.OperationName = "Semi_Rough" + Conversions.ToString(j);
                    }
                    else
                    {
                        TechLatheMillContour1 techLatheMillContour3 = techLatheMillContour;
                        if (RL == 1.0)
                        {
                            techLatheMillContour3.OffsetSideComputer = espMillContourOffsetSide.espMillContourOffsetLeft;
                            techLatheMillContour3.CuttingStrategy = espMillCuttingStrategy.espMillCuttingStrategyConventional;
                        }
                        else
                        {
                            techLatheMillContour3.OffsetSideComputer = espMillContourOffsetSide.espMillContourOffsetRight;
                            techLatheMillContour3.CuttingStrategy = espMillCuttingStrategy.espMillCuttingStrategyClimb;
                        }
                        techLatheMillContour3.OperationName = "Semi_Rough" + Conversions.ToString(j);
                    }
                    featureChain = (FeatureChain)selectionSet[j];
                    if (j > 1)
                    {
                        techLatheMillContour.IncrementalDepth = 0.0;
                    }
                    Document.Operations.Add(techLatheMillContour, featureChain, RuntimeHelpers.GetObjectValue(Missing.Value));
                }
            }
        }


#pragma warning restore CS0162, CS0649
    }
}
