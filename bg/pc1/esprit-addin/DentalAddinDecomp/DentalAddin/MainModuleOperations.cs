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
        }

        public static void CustomCycle()
        {
            string file = PrcFilePath[4];
            DentalLogger.Log($"CustomCycle - OpenProcess: PRC[4]={file}");
            TechLatheCustom pITechnology = (TechLatheCustom)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file))[0];
            Layer activeLayer = Document.Layers.Add("FaceDrill");
            Document.ActiveLayer = activeLayer;
            
            double stlShift = AppConfig.DefaultStlShift;
            try
            {
                dynamic tech = pITechnology;
                if (tech.ZLimit != null)
                {
                    double originalZ = tech.ZLimit;
                    tech.ZLimit = originalZ + stlShift;
                    DentalLogger.Log($"CustomCycle - FaceHole ZLimit shift 적용: {originalZ:F3} -> {tech.ZLimit:F3} (shift:{stlShift:F3})");
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"CustomCycle - FaceHole shift 적용 실패 (속성 없음 가능): {ex.Message}");
            }
            
            Document.Operations.Add(pITechnology, null, RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void CustomCycle2()
        {
            string file = PrcFilePath[8];
            DentalLogger.Log($"CustomCycle2 - OpenProcess: PRC[8]={file}");
            TechLatheCustom pITechnology = (TechLatheCustom)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file))[0];
            Layer activeLayer = Document.Layers.Add("EndTurning");
            Document.ActiveLayer = activeLayer;
            
            double stlShift = AppConfig.DefaultStlShift;
            try
            {
                dynamic tech = pITechnology;
                if (tech.ZLimit != null)
                {
                    double originalZ = tech.ZLimit;
                    tech.ZLimit = originalZ + stlShift;
                    DentalLogger.Log($"CustomCycle2 - Connection ZLimit shift 적용: {originalZ:F3} -> {tech.ZLimit:F3} (shift:{stlShift:F3})");
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"CustomCycle2 - Connection shift 적용 실패 (속성 없음 가능): {ex.Message}");
            }
            
            Document.Operations.Add(pITechnology, null, RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void TurningOp()
        {
            FeatureChain[] array = new FeatureChain[16];
            FeatureChain[] array2 = new FeatureChain[9];
            string file = PrcFilePath[1];
            DentalLogger.Log($"TurningOp - OpenProcess: PRC[1]={file}");
            TechLatheContour1 techLatheContour = (TechLatheContour1)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file))[0];
            TechLatheContour1 techLatheContour2 = default(TechLatheContour1);
            if (ReverseOn)
            {
                string file2 = PrcFilePath[2];
                DentalLogger.Log($"TurningOp - OpenProcess Reverse: PRC[2]={file2}");
                techLatheContour2 = (TechLatheContour1)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file2))[0];
            }
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
                    if (Operators.CompareString(layer.Name, "TurnOperation", false) == 0)
                    {
                        Document.Layers.Remove(i);
                        break;
                    }
                }
                layer = Document.Layers.Add("TurnOperation");
                Document.ActiveLayer = layer;
                double xStock = techLatheContour.XStock;
                double zStock = techLatheContour.ZStock;
                double xStock2 = default(double);
                double zStock2 = default(double);
                if (ReverseOn)
                {
                    xStock2 = techLatheContour2.XStock;
                    zStock2 = techLatheContour2.ZStock;
                }
                techLatheContour.XStock = 0.0;
                techLatheContour.ZStock = 0.0;
                if (ReverseOn)
                {
                    TechLatheContour1 techLatheContour3 = techLatheContour2;
                    techLatheContour3.XStock = 0.0;
                    techLatheContour3.ZStock = 0.0;
                }
                i = 1;
                do
                {
                    if (array2[9 - i] != null)
                    {
                        Document.Operations.Add(techLatheContour, array2[9 - i], RuntimeHelpers.GetObjectValue(Missing.Value));
                        if (ReverseOn)
                        {
                            Document.Operations.Add(techLatheContour2, array2[9 - i], RuntimeHelpers.GetObjectValue(Missing.Value));
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
                techLatheContour.XStock = xStock;
                techLatheContour.ZStock = zStock;
                if (ReverseOn)
                {
                    TechLatheContour1 techLatheContour4 = techLatheContour2;
                    techLatheContour4.XStock = xStock2;
                    techLatheContour4.ZStock = zStock2;
                }
                i = 1;
                do
                {
                    if (array[i] != null)
                    {
                        TryAddOperation(techLatheContour, array[i], "TurningOp array[i]");
                        if (ReverseOn)
                        {
                            TryAddOperation(techLatheContour2, array[i], "TurningOp array[i] ReverseOn");
                        }
                    }
                    i++;
                }
                while (i <= 15);
            }
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