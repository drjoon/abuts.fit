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
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

#pragma warning disable CS0162, CS0164, CS0649

namespace DentalAddin
{

    [StandardModule]
    internal sealed class MainModule
    {
        [CompilerGenerated]
        [AccessedThroughProperty("EspritApp")]
        private static Application _EspritApp;

        public static Document Document;

        public static double[] NumData = new double[7];

        public static int[] NumCombobox = new int[7];

        public static string[] PrcFileName = new string[13];

        public static string[] PrcFilePath = new string[13];

        public static string PrcDirectory = "C:\\Program Files (x86)\\D.P.Technology\\ESPRIT\\AddIns\\DentalAddin\\";

        public static string DefaultXmlFileName = "C:\\Program Files (x86)\\D.P.Technology\\ESPRIT\\AddIns\\DentalAddin\\Viles\\DefaultPath\\Tech_Default_Path.xml";

        private static int SurfaceNumber;

        public static int Jump;

        public static int machinetype;

        public static double EndXValue;

        public static double Chamfer;

        public static double DownZ;

        public static double MillingDepth;

        public static double TurningExtend;

        public static double TurningDepth;

        public static double BackTurn;

        public static double SL;

        public static string[] FSName = new string[13];

        public static double[] NumberT = new double[9];

        public static string ToolNs;

        public static string FilPath;

        public static FeatureChain tfc;

        public static int ProfileType;

        public static int ProfileT;

        public static double LowerY;

        public static double HighY;

        public static double iLine;

        public static double HighY1;

        public static double HighY2;

        public static double FirstYy;

        public static double Hdepth;

        public static double Bdepth;

        public static double FrontYvalue;

        public static double FirstH;

        public static int Dayu;

        public static double EndX;

        public static double EndY;

        public static int Eror;

        public static int TurningTimes;

        public static Point Pt12;

        public static double MaxX;

        public static double MaxY;

        public static FeatureChain[] Fcb2 = new FeatureChain[13];

        public static int GrFeature;

        public static int FirstFeatureNeed;

        public static int NeedFirstFeature;

        public static int MinF;

        public static FeatureChain Fcb1;

        public static Segment seg;

        public static Point[] ptp = new Point[7];

        public static int[] FcNumber = new int[7];

        public static Plane Wp;

        public static double[] Matrix1 = new double[19];

        public static double[] Matrix2 = new double[19];

        public static double[] Matrix3 = new double[37];

        public static int[] P = new int[37];

        public static int[] Q = new int[9];

        public static FeatureChain FC1;

        public static FeatureChain FC2;

        public static FeatureChain FC3;

        public static FeatureChain FC4;

        public static FeatureChain FC5;

        public static FeatureChain Fcc;

        public static double Ang;

        public static double BtmY;

        public static double[] Percent = new double[5];

        public static double[] PercentB = new double[5];

        public static double MidX;

        public static double Xmin;

        public static double YWant;

        public static int roughm;

        public static int n;

        public static int m;

        public static int tek;

        public static int CPen;

        public static SelectionSet SS1;

        public static double MidXc;

        public static SelectionSet Ss;

        public static int NeedEndPart;

        public static int EndTimes;

        public static int NeediLine;

        public static double Px;

        public static double Py;

        public static int DeleteLine;

        public static int DeleteOLine;

        public static double Incline;

        public static FeatureChain FcM;

        public static IComPoint[] IntPt;

        public static int Intersect;

        public static string fcname;

        public static bool SpindleSide;

        public static double RL;

        public static double ExtendX;

        public static double COMX1;

        public static double COMX2;

        public static double XT;

        public static double ZT;

        public static double SurfaceNumber2;

        public static double ZH;

        public static GraphicObject Gas;

        public static int AngNumber;

        public static int AngType1;

        public static int AngType2;

        public static bool ReverseOn;

        public static double AngleNumber;

        public static double SemiAngle;

        public static double RoughType;

        public static double x3;

        private static bool HasPoints(params int[] indices)
        {
            if (ptp == null)
            {
                return false;
            }
            foreach (var idx in indices)
            {
                if (idx <= 0 || idx >= ptp.Length || ptp[idx] == null)
                {
                    return false;
                }
            }
            return true;
        }

        private static Plane GetOrCreatePlane(string name, params string[] alternateNames)
        {
            if (string.IsNullOrWhiteSpace(name) || Document?.Planes == null)
            {
                return null;
            }

            Plane TryFindPlane(string planeName)
            {
                if (string.IsNullOrWhiteSpace(planeName))
                {
                    return null;
                }

                try
                {
                    Plane direct = Document.Planes[planeName];
                    if (direct != null)
                    {
                        return direct;
                    }
                }
                catch
                {
                }

                int count = Document.Planes.Count;
                for (int i = 1; i <= count; i++)
                {
                    Plane candidate = Document.Planes[i];
                    if (candidate != null && Operators.CompareString(candidate.Name, planeName, false) == 0)
                    {
                        return candidate;
                    }
                }

                return null;
            }

            Plane plane = TryFindPlane(name);
            if (plane != null)
            {
                return plane;
            }

            if (alternateNames != null)
            {
                foreach (string alt in alternateNames)
                {
                    plane = TryFindPlane(alt);
                    if (plane != null)
                    {
                        return plane;
                    }
                }
            }

            try
            {
                return Document.Planes.Add(name);
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"PlaneHelper: '{name}' 평면 생성 실패 - {ex.Message}");
                return null;
            }
        }

        private static Layer GetOrCreateLayer(string name)
        {
            if (string.IsNullOrWhiteSpace(name) || Document?.Layers == null)
            {
                return null;
            }

            try
            {
                Layer direct = Document.Layers[name];
                if (direct != null)
                {
                    return direct;
                }
            }
            catch
            {
            }

            int count = Document.Layers.Count;
            for (int i = 1; i <= count; i++)
            {
                Layer candidate = Document.Layers[i];
                if (candidate != null && Operators.CompareString(candidate.Name, name, false) == 0)
                {
                    return candidate;
                }
            }

            try
            {
                return Document.Layers.Add(name);
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"LayerHelper: '{name}' 레이어 생성 실패 - {ex.Message}");
                return null;
            }
        }

        private static void LogFreeFormFeatureSummary(string context, params string[] targetNames)
        {
            try
            {
                if (Document?.FreeFormFeatures == null)
                {
                    DentalLogger.Log($"{context} - Document.FreeFormFeatures 가 null");
                    return;
                }

                int count = Document.FreeFormFeatures.Count;
                DentalLogger.Log($"{context} - FreeFormFeatures.Count: {count}");
                if (count == 0)
                {
                    return;
                }

                var targetSet = (targetNames == null || targetNames.Length == 0)
                    ? null
                    : new HashSet<string>(targetNames, StringComparer.OrdinalIgnoreCase);

                int index = 1;
                foreach (FreeFormFeature feature in Document.FreeFormFeatures)
                {
                    if (feature == null)
                    {
                        DentalLogger.Log($"{context} - Feature[{index}] null");
                    }
                    else
                    {
                        string name = feature.Name ?? "(no-name)";
                        DentalLogger.Log($"{context} - Feature[{index}] {name}");
                        if (targetSet != null && targetSet.Contains(name))
                        {
                            targetSet.Remove(name);
                        }
                    }
                    index++;
                    if (index > 40)
                    {
                        DentalLogger.Log($"{context} - 로그 제한으로 40개까지만 출력");
                        break;
                    }
                }

                if (targetSet != null && targetSet.Count > 0)
                {
                    DentalLogger.Log($"{context} - 미발견 FreeFormFeature: {string.Join(", ", targetSet)}");
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"{context} - FreeFormFeatures 로깅 중 예외 {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static void LogFeatureChainSummary(string context, params string[] targetNames)
        {
            try
            {
                if (Document?.FeatureChains == null)
                {
                    DentalLogger.Log($"{context} - Document.FeatureChains 가 null");
                    return;
                }

                int count = Document.FeatureChains.Count;
                DentalLogger.Log($"{context} - FeatureChains.Count: {count}");
                if (count == 0)
                {
                    return;
                }

                var targetSet = (targetNames == null || targetNames.Length == 0)
                    ? null
                    : new HashSet<string>(targetNames, StringComparer.OrdinalIgnoreCase);

                int index = 1;
                foreach (FeatureChain fc in Document.FeatureChains)
                {
                    if (fc == null)
                    {
                        DentalLogger.Log($"{context} - FeatureChain[{index}] null");
                    }
                    else
                    {
                        string name = fc.Name ?? "(no-name)";
                        DentalLogger.Log($"{context} - FeatureChain[{index}] {name}");
                        if (targetSet != null && targetSet.Contains(name))
                        {
                            targetSet.Remove(name);
                        }
                    }

                    index++;
                    if (index > 40)
                    {
                        DentalLogger.Log($"{context} - 로그 제한으로 40개까지만 출력");
                        break;
                    }
                }

                if (targetSet != null && targetSet.Count > 0)
                {
                    DentalLogger.Log($"{context} - 미발견 FeatureChain: {string.Join(", ", targetSet)}");
                }
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"{context} - FeatureChains 로깅 중 예외 {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static void ValidateBeforeOperation(string operationName, string[] requiredFeatureChains, string[] requiredFreeFormFeatures)
        {
            string context = $"PreOp:{operationName}";

            if (requiredFeatureChains != null && requiredFeatureChains.Length > 0)
            {
                LogFeatureChainSummary(context, requiredFeatureChains);
            }
            else
            {
                LogFeatureChainSummary(context);
            }

            if (requiredFreeFormFeatures != null && requiredFreeFormFeatures.Length > 0)
            {
                LogFreeFormFeatureSummary(context, requiredFreeFormFeatures);
            }
            else
            {
                LogFreeFormFeatureSummary(context);
            }
        }

        public static Application EspritApp
        {
            [CompilerGenerated]
            get
            {
                return _EspritApp;
            }
            [MethodImpl(MethodImplOptions.Synchronized)]
            [CompilerGenerated]
            set
            {
                _IApplicationEvents_AfterDocumentOpenEventHandler handler = EspritApp_AfterDocumentOpen;
                _IApplicationEvents_AfterNewDocumentOpenEventHandler handler2 = EspritApp_AfterNewDocumentOpen;
                _IApplicationEvents_AfterTemplateOpenEventHandler handler3 = EspritApp_AfterTemplateOpen;
                Application espritApp = _EspritApp;
                if (espritApp != null)
                {
                    new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterDocumentOpen").RemoveEventHandler(espritApp, handler);
                    new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterNewDocumentOpen").RemoveEventHandler(espritApp, handler2);
                    new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterTemplateOpen").RemoveEventHandler(espritApp, handler3);
                }
                _EspritApp = value;
                espritApp = _EspritApp;
                if (espritApp != null)
                {
                    new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterDocumentOpen").AddEventHandler(espritApp, handler);
                    new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterNewDocumentOpen").AddEventHandler(espritApp, handler2);
                    new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterTemplateOpen").AddEventHandler(espritApp, handler3);
                }
            }
        }

        public static void Bind(Application application, Document document)
        {
            if (application == null || document == null)
            {
                return;
            }
            EspritApp = application;
            Document = document;
        }

        public static void Main()
        {
            DentalLogger.Log($"Main 시작 - Document:{(Document != null)}, EspritApp:{(EspritApp != null)}, Jump:{Jump}, RL:{RL}, SpindleSide:{SpindleSide}");

            if (Document == null || EspritApp == null)
            {
                DentalLogger.Log("Main 중단: Document 혹은 EspritApp 이 null 입니다.");
                return;
            }

            try
            {
                Clean_Module.Clean();
                DentalLogger.Log("Main - Clean 완료");

                if (Document?.Windows?.ActiveWindow != null)
                {
                    Document.Windows.ActiveWindow.Fit();
                    Document.Windows.ActiveWindow.Fit();
                }
                else
                {
                    DentalLogger.Log("Main 경고: ActiveWindow 가 null 입니다.");
                }

                if (Jump != 1)
                {
                    if (!SpindleSide)
                    {
                        RL = 1.0;
                    }
                    else
                    {
                        RL = 2.0;
                    }

                    DentalLogger.Log($"Main - Boundry 호출 준비 (RL:{RL})");
                    MoveSTL_Module.Boundry();
                    Document.Windows.ActiveWindow?.Fit();
                    TurningFeature_Module.TurningMain();
                    Document.Windows.ActiveWindow?.Fit();
                    if (Mark.MarkSign)
                    {
                        Mark.OutputNumberFeature();
                    }
                    Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                    if (Eror != 1)
                    {
                        if (RoughType == 1.0)
                        {
                            Milling_Module.MillingStart();
                            Document.Windows.ActiveWindow?.Fit();
                            Feature36_Module.Main_Feature();
                        }
                        else
                        {
                            Roughworkplane();
                        }
                        Document.Windows.ActiveWindow?.Fit();
                        WorkPlane();
                        MoveSTL_Module.Delete36Feature();
                        Document.Windows.ActiveWindow?.Fit();
                        OperationSeq();
                        Document.Windows.ActiveWindow?.Fit();
                    }
                }

                DentalLogger.Log("Main 종료 단계 - EspritApp 처리 상태 종료");
                EspritApp.Processing = false;
                EspritApp.OutputWindow.Text(Conversions.ToString(DateAndTime.Now) + "\r\n");
            }
            catch (Exception ex)
            {
                DentalLogger.LogException("MainModule.Main", ex);
                throw;
            }
        }

        public static void ToolName()
        {
            //IL_00d2: Unknown result type (might be due to invalid IL or missing references)
            //IL_01a7: Unknown result type (might be due to invalid IL or missing references)
            //IL_027c: Unknown result type (might be due to invalid IL or missing references)
            //IL_0359: Unknown result type (might be due to invalid IL or missing references)
            //IL_0427: Unknown result type (might be due to invalid IL or missing references)
            //IL_04f5: Unknown result type (might be due to invalid IL or missing references)
            //IL_05d4: Unknown result type (might be due to invalid IL or missing references)
            //IL_06b3: Unknown result type (might be due to invalid IL or missing references)
            //IL_07b3: Unknown result type (might be due to invalid IL or missing references)
            int try0000_dispatch = -1;
            int num2 = default(int);
            TechnologyUtility technologyUtility = default(TechnologyUtility);
            int num = default(int);
            int num3 = default(int);
            string file = default(string);
            ITechnology[] array = default(ITechnology[]);
            TechLatheContour1 techLatheContour = default(TechLatheContour1);
            string toolID = default(string);
            IEnumerator enumerator = default(IEnumerator);
            Tool tool = default(Tool);
            int num5 = default(int);
            TechLatheMold3dContour techLatheMold3dContour = default(TechLatheMold3dContour);
            TechLatheMillContour1 techLatheMillContour = default(TechLatheMillContour1);
            IEnumerator enumerator2 = default(IEnumerator);
            IEnumerator enumerator3 = default(IEnumerator);
            IEnumerator enumerator4 = default(IEnumerator);
            TechLatheMoldParallelPlanes techLatheMoldParallelPlanes = default(TechLatheMoldParallelPlanes);
            IEnumerator enumerator5 = default(IEnumerator);
            TechLatheMoldParallelPlanes techLatheMoldParallelPlanes2 = default(TechLatheMoldParallelPlanes);
            IEnumerator enumerator6 = default(IEnumerator);
            TechLatheMoldParallelPlanes techLatheMoldParallelPlanes3 = default(TechLatheMoldParallelPlanes);
            IEnumerator enumerator7 = default(IEnumerator);
            TechLatheMill5xComposite techLatheMill5xComposite = default(TechLatheMill5xComposite);
            IEnumerator enumerator8 = default(IEnumerator);
            TechLatheMill5xComposite techLatheMill5xComposite2 = default(TechLatheMill5xComposite);
            IEnumerator enumerator9 = default(IEnumerator);
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
                                num2 = 1;
                                technologyUtility = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
                                goto IL_001d;
                            case 2582:
                                {
                                    num = num2;
                                    switch (num3)
                                    {
                                        case 1:
                                            break;
                                        default:
                                            goto end_IL_0000;
                                    }
                                    int num4 = unchecked(num + 1);
                                    num = 0;
                                    switch (num4)
                                    {
                                        case 1:
                                            break;
                                        case 2:
                                            goto IL_001d;
                                        case 3:
                                            goto IL_0027;
                                        case 4:
                                            goto IL_0038;
                                        case 5:
                                            goto IL_003f;
                                        case 6:
                                            goto IL_004c;
                                        case 7:
                                            goto IL_0057;
                                        case 8:
                                            goto IL_007f;
                                        case 9:
                                            goto IL_0092;
                                        case 11:
                                            goto IL_009d;
                                        case 10:
                                        case 12:
                                            goto IL_00a9;
                                        case 13:
                                            goto IL_00c1;
                                        case 14:
                                            goto IL_00c8;
                                        case 15:
                                            goto IL_00d8;
                                        case 17:
                                            goto IL_00e6;
                                        case 18:
                                            goto IL_00f1;
                                        case 19:
                                            goto IL_0103;
                                        case 20:
                                            goto IL_010a;
                                        case 21:
                                            goto IL_0118;
                                        case 22:
                                            goto IL_0124;
                                        case 23:
                                            goto IL_012a;
                                        case 24:
                                            goto IL_0153;
                                        case 25:
                                            goto IL_0167;
                                        case 27:
                                            goto IL_0172;
                                        case 26:
                                        case 28:
                                            goto IL_017e;
                                        case 29:
                                            goto IL_0196;
                                        case 30:
                                            goto IL_019d;
                                        case 31:
                                            goto IL_01ad;
                                        case 33:
                                            goto IL_01bb;
                                        case 34:
                                            goto IL_01c6;
                                        case 35:
                                            goto IL_01d8;
                                        case 36:
                                            goto IL_01df;
                                        case 37:
                                            goto IL_01ed;
                                        case 38:
                                            goto IL_01f9;
                                        case 39:
                                            goto IL_01ff;
                                        case 40:
                                            goto IL_0228;
                                        case 41:
                                            goto IL_023c;
                                        case 43:
                                            goto IL_0247;
                                        case 42:
                                        case 44:
                                            goto IL_0253;
                                        case 45:
                                            goto IL_026b;
                                        case 46:
                                            goto IL_0272;
                                        case 47:
                                            goto IL_0282;
                                        case 49:
                                            goto IL_0290;
                                        case 50:
                                            goto IL_029f;
                                        case 51:
                                            goto IL_02aa;
                                        case 52:
                                            goto IL_02bc;
                                        case 53:
                                            goto IL_02ca;
                                        case 54:
                                            goto IL_02d6;
                                        case 55:
                                            goto IL_02dc;
                                        case 56:
                                            goto IL_0305;
                                        case 57:
                                            goto IL_0319;
                                        case 59:
                                            goto IL_0324;
                                        case 58:
                                        case 60:
                                            goto IL_0330;
                                        case 61:
                                            goto IL_0348;
                                        case 62:
                                            goto IL_034f;
                                        case 63:
                                            goto IL_035f;
                                        case 65:
                                            goto IL_036d;
                                        case 66:
                                            goto IL_0378;
                                        case 67:
                                            goto IL_038a;
                                        case 68:
                                            goto IL_0398;
                                        case 69:
                                            goto IL_03a4;
                                        case 70:
                                            goto IL_03aa;
                                        case 71:
                                            goto IL_03d3;
                                        case 72:
                                            goto IL_03e7;
                                        case 74:
                                            goto IL_03f2;
                                        case 73:
                                        case 75:
                                            goto IL_03fe;
                                        case 76:
                                            goto IL_0416;
                                        case 77:
                                            goto IL_041d;
                                        case 78:
                                            goto IL_042d;
                                        case 80:
                                            goto IL_043b;
                                        case 81:
                                            goto IL_0446;
                                        case 82:
                                            goto IL_0458;
                                        case 83:
                                            goto IL_0466;
                                        case 84:
                                            goto IL_0472;
                                        case 85:
                                            goto IL_0478;
                                        case 86:
                                            goto IL_04a1;
                                        case 87:
                                            goto IL_04b5;
                                        case 89:
                                            goto IL_04c0;
                                        case 88:
                                        case 90:
                                            goto IL_04cc;
                                        case 91:
                                            goto IL_04e4;
                                        case 92:
                                            goto IL_04eb;
                                        case 93:
                                            goto IL_04fb;
                                        case 95:
                                            goto IL_0509;
                                        case 96:
                                            goto IL_0519;
                                        case 97:
                                            goto IL_0525;
                                        case 98:
                                            goto IL_0537;
                                        case 99:
                                            goto IL_0545;
                                        case 100:
                                            goto IL_0551;
                                        case 101:
                                            goto IL_0557;
                                        case 102:
                                            goto IL_0580;
                                        case 103:
                                            goto IL_0594;
                                        case 105:
                                            goto IL_059f;
                                        case 104:
                                        case 106:
                                            goto IL_05ab;
                                        case 107:
                                            goto IL_05c3;
                                        case 108:
                                            goto IL_05ca;
                                        case 109:
                                            goto IL_05da;
                                        case 111:
                                            goto IL_05e8;
                                        case 112:
                                            goto IL_05f8;
                                        case 113:
                                            goto IL_0604;
                                        case 114:
                                            goto IL_0616;
                                        case 115:
                                            goto IL_0624;
                                        case 116:
                                            goto IL_0630;
                                        case 117:
                                            goto IL_0636;
                                        case 118:
                                            goto IL_065f;
                                        case 119:
                                            goto IL_0673;
                                        case 121:
                                            goto IL_067e;
                                        case 120:
                                        case 122:
                                            goto IL_068a;
                                        case 123:
                                            goto IL_06a2;
                                        case 124:
                                            goto IL_06a9;
                                        case 125:
                                            goto IL_06b9;
                                        case 127:
                                            goto IL_06c7;
                                        case 128:
                                            goto IL_06d4;
                                        case 129:
                                            goto IL_06e3;
                                        case 130:
                                            goto IL_06f8;
                                        case 131:
                                            goto IL_0709;
                                        case 132:
                                            goto IL_0718;
                                        case 133:
                                            goto IL_0721;
                                        case 134:
                                            goto IL_074d;
                                        case 135:
                                            goto IL_0764;
                                        case 137:
                                            goto IL_0772;
                                        case 136:
                                        case 138:
                                            goto IL_0781;
                                        case 139:
                                            goto IL_079c;
                                        case 140:
                                            goto IL_07a6;
                                        case 141:
                                            goto end_IL_0000_2;
                                        default:
                                            goto end_IL_0000;
                                        case 16:
                                        case 32:
                                        case 48:
                                        case 64:
                                        case 79:
                                        case 94:
                                        case 110:
                                        case 126:
                                        case 142:
                                        case 143:
                                            goto end_IL_0000_3;
                                    }
                                    goto default;
                                }
                            IL_06d4:
                                num2 = 128;
                                file = PrcFilePath[11];
                                goto IL_06e3;
                            IL_001d:
                                num2 = 2;
                                file = PrcFilePath[1];
                                goto IL_0027;
                            IL_0027:
                                num2 = 3;
                                array = (ITechnology[])technologyUtility.OpenProcess(file);
                                goto IL_0038;
                            IL_0038:
                                ProjectData.ClearProjectError();
                                num3 = 1;
                                goto IL_003f;
                            IL_003f:
                                num2 = 5;
                                techLatheContour = (TechLatheContour1)array[0];
                                goto IL_004c;
                            IL_004c:
                                num2 = 6;
                                toolID = techLatheContour.ToolID;
                                goto IL_0057;
                            IL_0057:
                                num2 = 7;
                                enumerator = ((IEnumerable)Document.Tools).GetEnumerator();
                                goto IL_00a0;
                            IL_00a0:
                                if (enumerator.MoveNext())
                                {
                                    tool = (Tool)enumerator.Current;
                                    goto IL_007f;
                                }
                                goto IL_00a9;
                            IL_06e3:
                                num2 = 129;
                                array = (ITechnology[])technologyUtility.OpenProcess(file);
                                goto IL_06f8;
                            IL_007f:
                                num2 = 8;
                                if (Operators.CompareString(tool.ToolID, toolID, false) == 0)
                                {
                                    goto IL_0092;
                                }
                                goto IL_009d;
                            IL_0092:
                                num2 = 9;
                                num5++;
                                goto IL_00a9;
                            IL_00a9:
                                num2 = 12;
                                if (enumerator is IDisposable)
                                {
                                    (enumerator as IDisposable).Dispose();
                                }
                                goto IL_00c1;
                            IL_06f8:
                                num2 = 130;
                                techLatheMold3dContour = (TechLatheMold3dContour)array[0];
                                goto IL_0709;
                            IL_00c1:
                                num2 = 13;
                                if (num5 == 0)
                                {
                                    goto IL_00c8;
                                }
                                goto IL_00e6;
                            IL_00c8:
                                num2 = 14;
                                Trace.WriteLine("Turning Tool didn't matched (MessageBox suppressed)");
                                goto IL_00d8;
                            IL_00d8:
                                num2 = 15;
                                Jump = 1;
                                goto end_IL_0000_3;
                            IL_00e6:
                                num2 = 17;
                                file = PrcFilePath[2];
                                goto IL_00f1;
                            IL_00f1:
                                num2 = 18;
                                array = (ITechnology[])technologyUtility.OpenProcess(file);
                                goto IL_0103;
                            IL_0103:
                                ProjectData.ClearProjectError();
                                num3 = 1;
                                goto IL_010a;
                            IL_010a:
                                num2 = 20;
                                techLatheMillContour = (TechLatheMillContour1)array[0];
                                goto IL_0118;
                            IL_0118:
                                num2 = 21;
                                toolID = techLatheMillContour.ToolID;
                                goto IL_0124;
                            IL_0124:
                                num2 = 22;
                                num5 = 0;
                                goto IL_012a;
                            IL_012a:
                                num2 = 23;
                                enumerator2 = ((IEnumerable)Document.Tools).GetEnumerator();
                                goto IL_0175;
                            IL_0175:
                                if (enumerator2.MoveNext())
                                {
                                    tool = (Tool)enumerator2.Current;
                                    goto IL_0153;
                                }
                                goto IL_017e;
                            IL_0709:
                                num2 = 131;
                                toolID = techLatheMold3dContour.ToolID;
                                goto IL_0718;
                            IL_0153:
                                num2 = 24;
                                if (Operators.CompareString(tool.ToolID, toolID, false) == 0)
                                {
                                    goto IL_0167;
                                }
                                goto IL_0172;
                            IL_0167:
                                num2 = 25;
                                num5++;
                                goto IL_017e;
                            IL_017e:
                                num2 = 28;
                                if (enumerator2 is IDisposable)
                                {
                                    (enumerator2 as IDisposable).Dispose();
                                }
                                goto IL_0196;
                            IL_0718:
                                num2 = 132;
                                num5 = 0;
                                goto IL_0721;
                            IL_0196:
                                num2 = 29;
                                if (num5 == 0)
                                {
                                    goto IL_019d;
                                }
                                goto IL_01bb;
                            IL_019d:
                                num2 = 30;
                                Trace.WriteLine("EndMill Tool didn't matched (MessageBox suppressed)");
                                goto IL_01ad;
                            IL_01ad:
                                num2 = 31;
                                Jump = 1;
                                goto end_IL_0000_3;
                            IL_01bb:
                                num2 = 33;
                                file = PrcFilePath[8];
                                goto IL_01c6;
                            IL_01c6:
                                num2 = 34;
                                array = (ITechnology[])technologyUtility.OpenProcess(file);
                                goto IL_01d8;
                            IL_01d8:
                                ProjectData.ClearProjectError();
                                num3 = 1;
                                goto IL_01df;
                            IL_01df:
                                num2 = 36;
                                techLatheMillContour = (TechLatheMillContour1)array[0];
                                goto IL_01ed;
                            IL_01ed:
                                num2 = 37;
                                toolID = techLatheMillContour.ToolID;
                                goto IL_01f9;
                            IL_01f9:
                                num2 = 38;
                                num5 = 0;
                                goto IL_01ff;
                            IL_01ff:
                                num2 = 39;
                                enumerator3 = ((IEnumerable)Document.Tools).GetEnumerator();
                                goto IL_024a;
                            IL_024a:
                                if (enumerator3.MoveNext())
                                {
                                    tool = (Tool)enumerator3.Current;
                                    goto IL_0228;
                                }
                                goto IL_0253;
                            IL_0721:
                                num2 = 133;
                                enumerator4 = ((IEnumerable)Document.Tools).GetEnumerator();
                                goto IL_0778;
                            IL_0228:
                                num2 = 40;
                                if (Operators.CompareString(tool.ToolID, toolID, false) == 0)
                                {
                                    goto IL_023c;
                                }
                                goto IL_0247;
                            IL_023c:
                                num2 = 41;
                                num5++;
                                goto IL_0253;
                            IL_0253:
                                num2 = 44;
                                if (enumerator3 is IDisposable)
                                {
                                    (enumerator3 as IDisposable).Dispose();
                                }
                                goto IL_026b;
                            IL_0778:
                                if (enumerator4.MoveNext())
                                {
                                    tool = (Tool)enumerator4.Current;
                                    goto IL_074d;
                                }
                                goto IL_0781;
                            IL_026b:
                                num2 = 45;
                                if (num5 == 0)
                                {
                                    goto IL_0272;
                                }
                                goto IL_0290;
                            IL_0272:
                                num2 = 46;
                                Trace.WriteLine("EndMill Tool didn't matched (MessageBox suppressed)");
                                goto IL_0282;
                            IL_0282:
                                num2 = 47;
                                Jump = 1;
                                goto end_IL_0000_3;
                            IL_0290:
                                num2 = 49;
                                if (NumCombobox[1] == 0)
                                {
                                    goto IL_029f;
                                }
                                goto IL_043b;
                            IL_029f:
                                num2 = 50;
                                file = PrcFilePath[5];
                                goto IL_02aa;
                            IL_02aa:
                                num2 = 51;
                                array = (ITechnology[])technologyUtility.OpenProcess(file);
                                goto IL_02bc;
                            IL_02bc:
                                num2 = 52;
                                techLatheMoldParallelPlanes = (TechLatheMoldParallelPlanes)array[0];
                                goto IL_02ca;
                            IL_02ca:
                                num2 = 53;
                                toolID = techLatheMoldParallelPlanes.ToolID;
                                goto IL_02d6;
                            IL_02d6:
                                num2 = 54;
                                num5 = 0;
                                goto IL_02dc;
                            IL_02dc:
                                num2 = 55;
                                enumerator5 = ((IEnumerable)Document.Tools).GetEnumerator();
                                goto IL_0327;
                            IL_0327:
                                if (enumerator5.MoveNext())
                                {
                                    tool = (Tool)enumerator5.Current;
                                    goto IL_0305;
                                }
                                goto IL_0330;
                            IL_0172:
                                num2 = 27;
                                goto IL_0175;
                            IL_0305:
                                num2 = 56;
                                if (Operators.CompareString(tool.ToolID, toolID, false) == 0)
                                {
                                    goto IL_0319;
                                }
                                goto IL_0324;
                            IL_0319:
                                num2 = 57;
                                num5++;
                                goto IL_0330;
                            IL_0330:
                                num2 = 60;
                                if (enumerator5 is IDisposable)
                                {
                                    (enumerator5 as IDisposable).Dispose();
                                }
                                goto IL_0348;
                            IL_074d:
                                num2 = 134;
                                if (Operators.CompareString(tool.ToolID, toolID, false) == 0)
                                {
                                    goto IL_0764;
                                }
                                goto IL_0772;
                            IL_0348:
                                num2 = 61;
                                if (num5 == 0)
                                {
                                    goto IL_034f;
                                }
                                goto IL_036d;
                            IL_034f:
                                num2 = 62;
                                Trace.WriteLine("BallMilling Tool didn't matched (MessageBox suppressed)");
                                goto IL_035f;
                            IL_035f:
                                num2 = 63;
                                Jump = 1;
                                goto end_IL_0000_3;
                            IL_036d:
                                num2 = 65;
                                file = PrcFilePath[6];
                                goto IL_0378;
                            IL_0378:
                                num2 = 66;
                                array = (ITechnology[])technologyUtility.OpenProcess(file);
                                goto IL_038a;
                            IL_038a:
                                num2 = 67;
                                techLatheMoldParallelPlanes2 = (TechLatheMoldParallelPlanes)array[0];
                                goto IL_0398;
                            IL_0398:
                                num2 = 68;
                                toolID = techLatheMoldParallelPlanes2.ToolID;
                                goto IL_03a4;
                            IL_03a4:
                                num2 = 69;
                                num5 = 0;
                                goto IL_03aa;
                            IL_03aa:
                                num2 = 70;
                                enumerator6 = ((IEnumerable)Document.Tools).GetEnumerator();
                                goto IL_03f5;
                            IL_03f5:
                                if (enumerator6.MoveNext())
                                {
                                    tool = (Tool)enumerator6.Current;
                                    goto IL_03d3;
                                }
                                goto IL_03fe;
                            IL_0764:
                                num2 = 135;
                                num5++;
                                goto IL_0781;
                            IL_03d3:
                                num2 = 71;
                                if (Operators.CompareString(tool.ToolID, toolID, false) == 0)
                                {
                                    goto IL_03e7;
                                }
                                goto IL_03f2;
                            IL_03e7:
                                num2 = 72;
                                num5++;
                                goto IL_03fe;
                            IL_03fe:
                                num2 = 75;
                                if (enumerator6 is IDisposable)
                                {
                                    (enumerator6 as IDisposable).Dispose();
                                }
                                goto IL_0416;
                            IL_0781:
                                num2 = 138;
                                if (enumerator4 is IDisposable)
                                {
                                    (enumerator4 as IDisposable).Dispose();
                                }
                                goto IL_079c;
                            IL_0416:
                                num2 = 76;
                                if (num5 == 0)
                                {
                                    goto IL_041d;
                                }
                                goto IL_043b;
                            IL_041d:
                                num2 = 77;
                                Trace.WriteLine("BallMilling Tool didn't matched (MessageBox suppressed)");
                                goto IL_042d;
                            IL_042d:
                                num2 = 78;
                                Jump = 1;
                                goto end_IL_0000_3;
                            IL_03f2:
                                num2 = 74;
                                goto IL_03f5;
                            IL_0324:
                                num2 = 59;
                                goto IL_0327;
                            IL_043b:
                                num2 = 80;
                                file = PrcFilePath[4];
                                goto IL_0446;
                            IL_0446:
                                num2 = 81;
                                array = (ITechnology[])technologyUtility.OpenProcess(file);
                                goto IL_0458;
                            IL_0458:
                                num2 = 82;
                                techLatheMoldParallelPlanes3 = (TechLatheMoldParallelPlanes)array[0];
                                goto IL_0466;
                            IL_0466:
                                num2 = 83;
                                toolID = techLatheMoldParallelPlanes3.ToolID;
                                goto IL_0472;
                            IL_0472:
                                num2 = 84;
                                num5 = 0;
                                goto IL_0478;
                            IL_0478:
                                num2 = 85;
                                enumerator7 = ((IEnumerable)Document.Tools).GetEnumerator();
                                goto IL_04c3;
                            IL_04c3:
                                if (enumerator7.MoveNext())
                                {
                                    tool = (Tool)enumerator7.Current;
                                    goto IL_04a1;
                                }
                                goto IL_04cc;
                            IL_009d:
                                num2 = 11;
                                goto IL_00a0;
                            IL_04a1:
                                num2 = 86;
                                if (Operators.CompareString(tool.ToolID, toolID, false) == 0)
                                {
                                    goto IL_04b5;
                                }
                                goto IL_04c0;
                            IL_04b5:
                                num2 = 87;
                                num5++;
                                goto IL_04cc;
                            IL_04cc:
                                num2 = 90;
                                if (enumerator7 is IDisposable)
                                {
                                    (enumerator7 as IDisposable).Dispose();
                                }
                                goto IL_04e4;
                            IL_079c:
                                num2 = 139;
                                if (num5 != 0)
                                {
                                    goto end_IL_0000_3;
                                }
                                goto IL_07a6;
                            IL_04e4:
                                num2 = 91;
                                if (num5 == 0)
                                {
                                    goto IL_04eb;
                                }
                                goto IL_0509;
                            IL_04eb:
                                num2 = 92;
                                Trace.WriteLine("FaceBallMilling Tool didn't matched (MessageBox suppressed)");
                                goto IL_04fb;
                            IL_04fb:
                                num2 = 93;
                                Jump = 1;
                                goto end_IL_0000_3;
                            IL_0509:
                                num2 = 95;
                                if (NumCombobox[1] == 1)
                                {
                                    goto IL_0519;
                                }
                                goto IL_05e8;
                            IL_0519:
                                num2 = 96;
                                file = PrcFilePath[9];
                                goto IL_0525;
                            IL_0525:
                                num2 = 97;
                                array = (ITechnology[])technologyUtility.OpenProcess(file);
                                goto IL_0537;
                            IL_0537:
                                num2 = 98;
                                techLatheMill5xComposite = (TechLatheMill5xComposite)array[0];
                                goto IL_0545;
                            IL_0545:
                                num2 = 99;
                                toolID = techLatheMill5xComposite.ToolID;
                                goto IL_0551;
                            IL_0551:
                                num2 = 100;
                                num5 = 0;
                                goto IL_0557;
                            IL_0557:
                                num2 = 101;
                                enumerator8 = ((IEnumerable)Document.Tools).GetEnumerator();
                                goto IL_05a2;
                            IL_05a2:
                                if (enumerator8.MoveNext())
                                {
                                    tool = (Tool)enumerator8.Current;
                                    goto IL_0580;
                                }
                                goto IL_05ab;
                            IL_07a6:
                                num2 = 140;
                                Trace.WriteLine("Mark_BallMilling Tool didn't matched (MessageBox suppressed)");
                                break;
                            IL_0580:
                                num2 = 102;
                                if (Operators.CompareString(tool.ToolID, toolID, false) == 0)
                                {
                                    goto IL_0594;
                                }
                                goto IL_059f;
                            IL_0594:
                                num2 = 103;
                                num5++;
                                goto IL_05ab;
                            IL_05ab:
                                num2 = 106;
                                if (enumerator8 is IDisposable)
                                {
                                    (enumerator8 as IDisposable).Dispose();
                                }
                                goto IL_05c3;
                            IL_0772:
                                num2 = 137;
                                goto IL_0778;
                            IL_05c3:
                                num2 = 107;
                                if (num5 == 0)
                                {
                                    goto IL_05ca;
                                }
                                goto IL_05e8;
                            IL_05ca:
                                num2 = 108;
                                Trace.WriteLine("BallMilling Tool didn't matched (MessageBox suppressed)");
                                goto IL_05da;
                            IL_05da:
                                num2 = 109;
                                Jump = 1;
                                goto end_IL_0000_3;
                            IL_059f:
                                num2 = 105;
                                goto IL_05a2;
                            IL_05e8:
                                num2 = 111;
                                if (NumCombobox[3] == 1)
                                {
                                    goto IL_05f8;
                                }
                                goto IL_06c7;
                            IL_05f8:
                                num2 = 112;
                                file = PrcFilePath[10];
                                goto IL_0604;
                            IL_0604:
                                num2 = 113;
                                array = (ITechnology[])technologyUtility.OpenProcess(file);
                                goto IL_0616;
                            IL_0616:
                                num2 = 114;
                                techLatheMill5xComposite2 = (TechLatheMill5xComposite)array[0];
                                goto IL_0624;
                            IL_0624:
                                num2 = 115;
                                toolID = techLatheMill5xComposite2.ToolID;
                                goto IL_0630;
                            IL_0630:
                                num2 = 116;
                                num5 = 0;
                                goto IL_0636;
                            IL_0636:
                                num2 = 117;
                                enumerator9 = ((IEnumerable)Document.Tools).GetEnumerator();
                                goto IL_0681;
                            IL_0681:
                                if (enumerator9.MoveNext())
                                {
                                    tool = (Tool)enumerator9.Current;
                                    goto IL_065f;
                                }
                                goto IL_068a;
                            IL_04c0:
                                num2 = 89;
                                goto IL_04c3;
                            IL_065f:
                                num2 = 118;
                                if (Operators.CompareString(tool.ToolID, toolID, false) == 0)
                                {
                                    goto IL_0673;
                                }
                                goto IL_067e;
                            IL_0673:
                                num2 = 119;
                                num5++;
                                goto IL_068a;
                            IL_068a:
                                num2 = 122;
                                if (enumerator9 is IDisposable)
                                {
                                    (enumerator9 as IDisposable).Dispose();
                                }
                                goto IL_06a2;
                            IL_0247:
                                num2 = 43;
                                goto IL_024a;
                            IL_06a2:
                                num2 = 123;
                                if (num5 == 0)
                                {
                                    goto IL_06a9;
                                }
                                goto IL_06c7;
                            IL_06a9:
                                num2 = 124;
                                Trace.WriteLine("4-Axis BallMilling Tool didn't matched (MessageBox suppressed)");
                                goto IL_06b9;
                            IL_06b9:
                                num2 = 125;
                                Jump = 1;
                                goto end_IL_0000_3;
                            IL_067e:
                                num2 = 121;
                                goto IL_0681;
                            IL_06c7:
                                num2 = 127;
                                if (!Mark.MarkSign)
                                {
                                    goto end_IL_0000_3;
                                }
                                goto IL_06d4;
                            end_IL_0000_2:
                                break;
                        }
                        num2 = 141;
                        Jump = 1;
                        break;
                    }
                end_IL_0000:;
                }
                catch (Exception ex) when (num3 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 2582;
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

        public static void Roughworkplane()
        {
            object obj = default(object);
            DentalLogger.Log($"Roughworkplane 시작 - RoughType:{RoughType}");
            foreach (GraphicObject item in Document.GraphicsCollection)
            {
                if (item.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                {
                    obj = item;
                }
            }
            if (obj == null)
            {
                DentalLogger.Log("Roughworkplane 중단 - espSTL_Model STL 객체를 찾지 못했습니다.");
                return;
            }
            checked
            {
                Plane plane;
                if (RoughType == 2.0)
                {
                    plane = GetOrCreatePlane("Rough180Degree");
                    if (plane == null)
                    {
                        DentalLogger.Log("Roughworkplane: Rough180Degree plane 생성 실패");
                        return;
                    }
                    Plane plane2 = plane;
                    plane2.X = 0.0;
                    plane2.Y = 0.0;
                    plane2.Z = 0.0;
                    plane2.Ux = 1.0;
                    plane2.Uy = 0.0;
                    plane2.Uz = 0.0;
                    plane2.Vx = 0.0;
                    plane2.Vy = -1.0;
                    plane2.Vz = 0.0;
                    plane2.Wx = 0.0;
                    plane2.Wy = 0.0;
                    plane2.Wz = -1.0;
                    plane2.IsView = false;
                    Layer activeLayer = Document.Layers.Add("RoughFreeFormLayer");
                    Document.ActiveLayer = activeLayer;
                    Document.ActivePlane = plane;
                    FreeFormFeature freeFormFeature = Document.FreeFormFeatures.Add();
                    freeFormFeature.Name = "3DRoughMilling_180Degree";
                    freeFormFeature.Add(RuntimeHelpers.GetObjectValue(obj), espFreeFormElementType.espFreeFormPartSurfaceItem);
                    plane = Document.Planes["XYZ"];
                    Document.ActivePlane = plane;
                    FreeFormFeature freeFormFeature2 = Document.FreeFormFeatures.Add();
                    freeFormFeature2.Name = "3DRoughMilling_0Degree";
                    freeFormFeature2.Add(RuntimeHelpers.GetObjectValue(obj), espFreeFormElementType.espFreeFormPartSurfaceItem);
                }
                if (RoughType != 3.0)
                {
                    return;
                }
                plane = Document.Planes["XYZ"];
                Document.ActivePlane = plane;
                FreeFormFeature freeFormFeature3 = Document.FreeFormFeatures.Add();
                freeFormFeature3.Name = "3DRoughMilling_0Degree";
                freeFormFeature3.Add(RuntimeHelpers.GetObjectValue(obj), espFreeFormElementType.espFreeFormPartSurfaceItem);
                plane = GetOrCreatePlane("Rough120Degree");
                if (plane == null)
                {
                    DentalLogger.Log("Roughworkplane: Rough120Degree plane 생성 실패");
                    return;
                }
                Plane plane3 = plane;
                plane3.X = 0.0;
                plane3.Y = 0.0;
                plane3.Z = 0.0;
                plane3.Ux = 1.0;
                plane3.Uy = 0.0;
                plane3.Uz = 0.0;
                plane3.Vx = 0.0;
                plane3.Vy = -0.5;
                plane3.Vz = 0.866025;
                plane3.Wx = 0.0;
                plane3.Wy = -0.866025;
                plane3.Wz = -0.5;
                plane3.IsView = false;
                Document.ActivePlane = plane;
                FreeFormFeature freeFormFeature4 = Document.FreeFormFeatures.Add();
                freeFormFeature4.Name = "3DRoughMilling_120Degree";
                freeFormFeature4.Add(RuntimeHelpers.GetObjectValue(obj), espFreeFormElementType.espFreeFormPartSurfaceItem);
                plane = GetOrCreatePlane("Rough240Degree");
                if (plane == null)
                {
                    DentalLogger.Log("Roughworkplane: Rough240Degree plane 생성 실패");
                    return;
                }
                Plane plane4 = plane;
                plane4.X = 0.0;
                plane4.Y = 0.0;
                plane4.Z = 0.0;
                plane4.Ux = 1.0;
                plane4.Uy = 0.0;
                plane4.Uz = 0.0;
                plane4.Vx = 0.0;
                plane4.Vy = -0.5;
                plane4.Vz = -0.866025;
                plane4.Wx = 0.0;
                plane4.Wy = 0.866025;
                plane4.Wz = -0.5;
                plane4.IsView = false;
                Document.ActivePlane = plane;
                FreeFormFeature freeFormFeature5 = Document.FreeFormFeatures.Add();
                freeFormFeature5.Name = "3DRoughMilling_240Degree";
                freeFormFeature5.Add(RuntimeHelpers.GetObjectValue(obj), espFreeFormElementType.espFreeFormPartSurfaceItem);
            }
        }

        public static void WorkPlane()
        {
            int try0000_dispatch = -1;
            object obj = default(object);
            int num2 = default(int);
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
                                    IEnumerator enumerator = Document.GraphicsCollection.GetEnumerator();
                                    try
                                    {
                                        while (enumerator.MoveNext())
                                        {
                                            GraphicObject graphicObject = (GraphicObject)enumerator.Current;
                                            if (graphicObject.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                                            {
                                                obj = graphicObject;
                                            }
                                        }
                                    }
                                    finally
                                    {
                                        (enumerator as IDisposable)?.Dispose();
                                    }
                                    Plane plane = GetOrCreatePlane("180", "180Degree");
                                    if (plane == null)
                                    {
                                        DentalLogger.Log("WorkPlane: 180 plane 확보 실패");
                                        return;
                                    }
                                    Plane plane2 = plane;
                                    plane2.X = 0.0;
                                    plane2.Y = 0.0;
                                    plane2.Z = 0.0;
                                    plane2.Ux = 1.0;
                                    plane2.Uy = 0.0;
                                    plane2.Uz = 0.0;
                                    plane2.Vx = 0.0;
                                    plane2.Vy = -1.0;
                                    plane2.Vz = 0.0;
                                    plane2.Wx = 0.0;
                                    plane2.Wy = 0.0;
                                    plane2.Wz = -1.0;
                                    plane2.IsView = false;
                                    Layer activeLayer = Document.Layers.Add("FreeFormLayer");
                                    Document.ActiveLayer = activeLayer;
                                    Document.ActivePlane = plane;
                                    FreeFormFeature freeFormFeature = Document.FreeFormFeatures.Add();
                                    freeFormFeature.Name = "3DMilling_180Degree";
                                    freeFormFeature.Add(RuntimeHelpers.GetObjectValue(obj), espFreeFormElementType.espFreeFormPartSurfaceItem);
                                    plane = GetOrCreatePlane("270", "270Degree");
                                    if (plane == null)
                                    {
                                        DentalLogger.Log("WorkPlane: 270 plane 확보 실패");
                                        return;
                                    }
                                    Plane plane3 = plane;
                                    plane3.X = 0.0;
                                    plane3.Y = 0.0;
                                    plane3.Z = 0.0;
                                    plane3.Ux = 1.0;
                                    plane3.Uy = 0.0;
                                    plane3.Uz = 0.0;
                                    plane3.Vx = 0.0;
                                    plane3.Vy = 0.0;
                                    plane3.Vz = 1.0;
                                    plane3.Wx = 0.0;
                                    plane3.Wy = -1.0;
                                    plane3.Wz = 0.0;
                                    plane3.IsView = false;
                                    Document.ActivePlane = plane;
                                    FreeFormFeature freeFormFeature2 = Document.FreeFormFeatures.Add();
                                    freeFormFeature2.Name = "3DMilling_270Degree";
                                    freeFormFeature2.Add(RuntimeHelpers.GetObjectValue(obj), espFreeFormElementType.espFreeFormPartSurfaceItem);
                                    plane = Document.Planes["XYZ"];
                                    Document.ActivePlane = plane;
                                    FreeFormFeature freeFormFeature3 = Document.FreeFormFeatures.Add();
                                    freeFormFeature3.Name = "3DMilling_0Degree";
                                    freeFormFeature3.Add(RuntimeHelpers.GetObjectValue(obj), espFreeFormElementType.espFreeFormPartSurfaceItem);
                                    plane = GetOrCreatePlane("90");
                                    if (plane == null)
                                    {
                                        DentalLogger.Log("WorkPlane: 90 plane 확보 실패");
                                        return;
                                    }
                                    Plane plane4 = plane;
                                    plane4.X = 0.0;
                                    plane4.Y = 0.0;
                                    plane4.Z = 0.0;
                                    plane4.Ux = 1.0;
                                    plane4.Uy = 0.0;
                                    plane4.Uz = 0.0;
                                    plane4.Vx = 0.0;
                                    plane4.Vy = 0.0;
                                    plane4.Vz = -1.0;
                                    plane4.Wx = 0.0;
                                    plane4.Wy = 1.0;
                                    plane4.Wz = 0.0;
                                    plane4.IsView = false;
                                    Document.ActivePlane = plane;
                                    FreeFormFeature freeFormFeature4 = Document.FreeFormFeatures.Add();
                                    freeFormFeature4.Name = "3DMilling_90Degree";
                                    freeFormFeature4.Add(RuntimeHelpers.GetObjectValue(obj), espFreeFormElementType.espFreeFormPartSurfaceItem);
                                    plane = GetOrCreatePlane("Face");
                                    if (plane == null)
                                    {
                                        DentalLogger.Log("WorkPlane: Face plane 확보 실패");
                                        return;
                                    }
                                    Plane plane5 = plane;
                                    plane5.X = 0.0;
                                    plane5.Y = 0.0;
                                    plane5.Z = 0.0;
                                    plane5.Ux = 0.0;
                                    plane5.Uy = 1.0;
                                    plane5.Uz = 0.0;
                                    plane5.Vx = 0.0;
                                    plane5.Vy = 0.0;
                                    plane5.Vz = -1.0;
                                    plane5.Wx = -1.0;
                                    plane5.Wy = 0.0;
                                    plane5.Wz = 0.0;
                                    plane5.IsView = false;
                                    if (RL == 1.0)
                                    {
                                        Document.ActivePlane = plane;
                                    }
                                    else
                                    {
                                        Document.ActivePlane = Document.Planes["YZX"];
                                    }
                                    FreeFormFeature freeFormFeature5 = Document.FreeFormFeatures.Add();
                                    freeFormFeature5.Name = "3DMilling_FrontFace";
                                    freeFormFeature5.Add(RuntimeHelpers.GetObjectValue(obj), espFreeFormElementType.espFreeFormPartSurfaceItem);
                                    ProjectData.ClearProjectError();
                                    num2 = 2;
                                    if (Mark.MarkSign && Mark.SsNumber.Count > 0)
                                    {
                                        FeatureChain featureChain = (FeatureChain)Mark.SsNumber[1];
                                        Document.ActivePlane = Document.Planes[featureChain.Plane.Name];
                                        FreeFormFeature freeFormFeature6 = Document.FreeFormFeatures.Add();
                                        freeFormFeature6.Name = "3DProject_Mark";
                                        freeFormFeature6.Add(RuntimeHelpers.GetObjectValue(obj), espFreeFormElementType.espFreeFormPartSurfaceItem);
                                    }
                                    break;
                                }
                            case 1603:
                                num = -1;
                                switch (num2)
                                {
                                    case 2:
                                        break;
                                    default:
                                        goto IL_0679;
                                }
                                break;
                        }
                    }
                }
                catch (Exception ex2) when (num2 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex2);
                    try0000_dispatch = 1603;
                    continue;
                }
                break;
            IL_0679:
                throw ProjectData.CreateProjectError(-2146828237);
            }
            if (num != 0)
            {
                ProjectData.ClearProjectError();
            }
        }

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
            TechLatheCustom pITechnology = (TechLatheCustom)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file))[0];
            Layer activeLayer = Document.Layers.Add("FaceDrill");
            Document.ActiveLayer = activeLayer;
            Document.Operations.Add(pITechnology, null, RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void TurningOp()
        {
            FeatureChain[] array = new FeatureChain[16];
            FeatureChain[] array2 = new FeatureChain[9];
            string file = PrcFilePath[1];
            TechLatheContour1 techLatheContour = (TechLatheContour1)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file))[0];
            TechLatheContour1 techLatheContour2 = default(TechLatheContour1);
            if (ReverseOn)
            {
                string file2 = PrcFilePath[2];
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

        public static void RoughFreeFromMill()
        {
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

        private static bool LogGraphicObjectIsNull(IGraphicObject graphicObject, string context, string resolutionHint = null, bool stopProcess = false)
        {
            if (graphicObject != null)
            {
                return false;
            }

            DentalLogger.Log($"{context} - 대상 그래픽 객체가 null이라 작업을 건너뜁니다.");
            if (!string.IsNullOrWhiteSpace(resolutionHint))
            {
                DentalLogger.Log($"{context} - 조치 안내: {resolutionHint}");
            }
            if (stopProcess)
            {
                DentalLogger.Log($"{context} - 예외 예방을 위해 전체 공정을 즉시 중단합니다.");
            }
            return true;
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

            if (string.IsNullOrWhiteSpace(filePath))
            {
                DentalLogger.Log($"OpenProcess:{context} - PRC 경로가 비어 있음");
                return Array.Empty<ITechnology>();
            }

            try
            {
                ITechnology[] result = (ITechnology[])technologyUtility.OpenProcess(filePath);
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

        public static void FreeFormMill()
        {
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
                DentalLogger.Log("FreeFormMill - FinishingMethod==1, Emerge/Composite2 실행");
                Emerge();
                DentalLogger.Log("FreeFormMill - Emerge 완료");
                Composite2();
                DentalLogger.Log("FreeFormMill - Composite2 완료");
            }
            else
            {
                DentalLogger.Log($"FreeFormMill - FinishingMethod!=1({finishingMethod}), Emerge/Composite2 건너뜀");
            }
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
                            if (RL == 1.0)
                            {
                                goto IL_0290;
                            }
                            goto IL_02c9;
                        IL_0290:
                            num2 = 38;
                            techLatheMoldParallelPlanes.TopZLimit = 1.0;
                            goto IL_02a3;
                        IL_02a3:
                            num2 = 39;
                            techLatheMoldParallelPlanes.BottomZLimit = -1.0 * (MoveSTL_Module.FrontPointX + Math.Abs(DownZ));
                            goto IL_0309;
                        IL_02c9:
                            num2 = 41;
                            if (RL == 2.0)
                            {
                                goto IL_02dc;
                            }
                            goto IL_0309;
                        IL_02dc:
                            num2 = 42;
                            techLatheMoldParallelPlanes.BottomZLimit = MoveSTL_Module.FrontPointX - Math.Abs(DownZ);
                            goto IL_02f6;
                        IL_02f6:
                            num2 = 43;
                            techLatheMoldParallelPlanes.TopZLimit = 1.0;
                            goto IL_0309;
                        IL_0309:
                            num2 = 44;
                            ZH = Math.Abs(MoveSTL_Module.FrontPointX);
                            goto IL_031b;
                        IL_031b:
                            num2 = 45;
                            if (LogGraphicObjectIsNull(array[5], "free array[5]", "Document.FreeFormFeatures에서 '3DMilling_FrontFace' FreeFormFeature를 준비하세요.", stopProcess: true))
                            {
                                DentalLogger.Log("free - FrontFace FreeFormFeature 누락으로 공정을 중단합니다.");
                                return;
                            }
                            Document.Operations.Add(techLatheMoldParallelPlanes, array[5], RuntimeHelpers.GetObjectValue(Missing.Value));
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
                    MainFree();
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
            MoveSTL_Module.MoveSurface();
            Emerge();
            Composite();
            int count = Document.GraphicsCollection.Count;
            for (int i = 1; i <= count; i = checked(i + 1))
            {
                GraphicObject graphicObject = (GraphicObject)Document.GraphicsCollection[i];
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espSurface)
                {
                    graphicObject.Layer.Visible = false;
                }
            }
        }

        public static void Emerge()
        {
            string mergeFileName = default(string);
            string mergeFileName2 = default(string);
            if (RL == 1.0)
            {
                mergeFileName = "C:\\Program Files (x86)\\D.P.Technology\\ESPRIT\\AddIns\\DentalAddin\\Viles\\Surface\\Project1.igs";
                mergeFileName2 = "C:\\Program Files (x86)\\D.P.Technology\\ESPRIT\\AddIns\\DentalAddin\\Viles\\Surface\\ExtrudeR.igs";
            }
            else if (RL == 2.0)
            {
                mergeFileName = "C:\\Program Files (x86)\\D.P.Technology\\ESPRIT\\AddIns\\DentalAddin\\Viles\\Surface\\Project2.igs";
                mergeFileName2 = "C:\\Program Files (x86)\\D.P.Technology\\ESPRIT\\AddIns\\DentalAddin\\Viles\\Surface\\ExtrudeL.igs";
            }
            DentalLogger.Log($"Emerge - MergeFile1: {mergeFileName}");
            Document.MergeFile(mergeFileName, RuntimeHelpers.GetObjectValue(Missing.Value));
            SelectionSet selectionSet = Document.SelectionSets["Smove"];
            if (selectionSet == null)
            {
                selectionSet = Document.SelectionSets.Add("Smove");
            }
            selectionSet.RemoveAll();
            int count = Document.GraphicsCollection.Count;
            checked
            {
                GraphicObject graphicObject = default(GraphicObject);
                for (int i = 1; i <= count; i++)
                {
                    graphicObject = (GraphicObject)Document.GraphicsCollection[i];
                    if (graphicObject.GraphicObjectType == espGraphicObjectType.espSurface)
                    {
                        graphicObject.Layer.Visible = false;
                        break;
                    }
                }
                SurfaceNumber = Conversions.ToInteger(graphicObject.Key);
                if (MoveSTL_Module.NeedMove)
                {
                    selectionSet.Add(graphicObject, RuntimeHelpers.GetObjectValue(Missing.Value));
                    selectionSet.Translate(0.0, MoveSTL_Module.NeedMoveY, MoveSTL_Module.NeedMoveZ, 0);
                }
                int finishingMethod = (NumCombobox != null && NumCombobox.Length > 1) ? NumCombobox[1] : 0;
                if (finishingMethod == 1)
                {
                    DentalLogger.Log("Emerge - FinishingMethod==1, Extrude 파일 로드 생략");
                    return;
                }
                DentalLogger.Log($"Emerge - MergeFile2: {mergeFileName2}");
                Document.MergeFile(mergeFileName2, RuntimeHelpers.GetObjectValue(Missing.Value));
                int count2 = Document.GraphicsCollection.Count;
                for (int i = 1; i <= count2; i++)
                {
                    graphicObject = (GraphicObject)Document.GraphicsCollection[i];
                    if (graphicObject.GraphicObjectType == espGraphicObjectType.espSurface && Conversions.ToDouble(graphicObject.Key) != (double)SurfaceNumber)
                    {
                        graphicObject.Layer.Visible = false;
                        Gas = graphicObject;
                        break;
                    }
                }
                SurfaceNumber2 = Conversions.ToDouble(graphicObject.Key);
            }
        }

        public static void Composite()
        {
            int try0000_dispatch = -1;
            int num2 = default(int);
            int count = default(int);
            int num5 = default(int);
            int num = default(int);
            int num3 = default(int);
            FreeFormFeature freeFormFeature = default(FreeFormFeature);
            Point point = default(Point);
            SelectionSet selectionSet = default(SelectionSet);
            string file = default(string);
            TechnologyUtility technologyUtility = default(TechnologyUtility);
            ITechnology[] array = default(ITechnology[]);
            int count2 = default(int);
            Layer layer = default(Layer);
            TechLatheMill5xComposite techLatheMill5xComposite = default(TechLatheMill5xComposite);
            TechLatheMill5xComposite techLatheMill5xComposite2 = default(TechLatheMill5xComposite);
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
                            count = Document.FreeFormFeatures.Count;
                            num5 = 1;
                            goto IL_004e;
                        case 831:
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
                                        goto IL_0018;
                                    case 3:
                                        goto IL_0031;
                                    case 5:
                                        goto IL_0046;
                                    case 4:
                                    case 6:
                                        goto IL_0054;
                                    case 7:
                                        goto IL_0074;
                                    case 8:
                                        goto IL_008c;
                                    case 9:
                                        goto IL_0092;
                                    case 10:
                                        goto IL_00ab;
                                    case 11:
                                        goto IL_00b5;
                                    case 12:
                                        goto IL_00ce;
                                    case 13:
                                        goto IL_00ea;
                                    case 14:
                                        goto IL_0111;
                                    case 15:
                                        goto IL_0121;
                                    case 16:
                                        goto IL_012e;
                                    case 17:
                                        goto IL_014c;
                                    case 18:
                                        goto IL_015f;
                                    case 19:
                                        goto IL_0178;
                                    case 20:
                                        goto IL_0193;
                                    case 21:
                                        goto IL_01aa;
                                    case 23:
                                        goto IL_01c3;
                                    case 22:
                                    case 24:
                                        goto IL_01d2;
                                    case 25:
                                        goto IL_01eb;
                                    case 26:
                                        goto IL_01fa;
                                    case 27:
                                        goto IL_0208;
                                    case 28:
                                        goto IL_020f;
                                    case 29:
                                        goto IL_0216;
                                    case 30:
                                        goto IL_0221;
                                    case 31:
                                        goto IL_023f;
                                    case 32:
                                        goto IL_025d;
                                    case 33:
                                        goto IL_027b;
                                    case 34:
                                        goto end_IL_0000_2;
                                    default:
                                        goto end_IL_0000;
                                    case 35:
                                        goto end_IL_0000_3;
                                }
                                goto default;
                            }
                        IL_01c3:
                            num2 = 23;
                            num5 = checked(num5 + 1);
                            goto IL_01cc;
                        IL_004e:
                            if (num5 <= count)
                            {
                                goto IL_0018;
                            }
                            goto IL_0054;
                        IL_0018:
                            num2 = 2;
                            freeFormFeature = Document.FreeFormFeatures[num5];
                            goto IL_0031;
                        IL_0031:
                            num2 = 3;
                            if (Operators.CompareString(freeFormFeature.Name, "3DMilling_0Degree", false) != 0)
                            {
                                goto IL_0046;
                            }
                            goto IL_0054;
                        IL_0046:
                            num2 = 5;
                            num5 = checked(num5 + 1);
                            goto IL_004e;
                        IL_0054:
                            num2 = 6;
                            point = Document.GetPoint(0, 0, 0);
                            goto IL_0074;
                        IL_0074:
                            num2 = 7;
                            selectionSet = Document.SelectionSets["Sss"];
                            goto IL_008c;
                        IL_008c:
                            num2 = 8;
                            if (selectionSet == null)
                            {
                                goto IL_0092;
                            }
                            goto IL_00ab;
                        IL_0092:
                            num2 = 9;
                            selectionSet = Document.SelectionSets.Add("Sss");
                            goto IL_00ab;
                        IL_00ab:
                            num2 = 10;
                            selectionSet.RemoveAll();
                            goto IL_00b5;
                        IL_00b5:
                            num2 = 11;
                            selectionSet.Add(Gas, RuntimeHelpers.GetObjectValue(Missing.Value));
                            goto IL_00ce;
                        IL_00ce:
                            num2 = 12;
                            selectionSet.ScaleUniform(point, Math.Abs(XT), 0);
                            goto IL_00ea;
                        IL_00ea:
                            num2 = 13;
                            selectionSet.Translate(ZT, 0.0, 0.0, 0);
                            goto IL_0111;
                        IL_0111:
                            num2 = 14;
                            freeFormFeature.Add(Gas, espFreeFormElementType.espFreeFormPartSurfaceItem);
                            goto IL_0121;
                        IL_0121:
                            num2 = 15;
                            file = PrcFilePath[10];
                            goto IL_012e;
                        IL_012e:
                            num2 = 16;
                            technologyUtility = (TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")));
                            goto IL_014c;
                        IL_014c:
                            num2 = 17;
                            array = (ITechnology[])technologyUtility.OpenProcess(file);
                            goto IL_015f;
                        IL_015f:
                            num2 = 18;
                            count2 = Document.Layers.Count;
                            num5 = 1;
                            goto IL_01cc;
                        IL_01cc:
                            if (num5 <= count2)
                            {
                                goto IL_0178;
                            }
                            goto IL_01d2;
                        IL_0178:
                            num2 = 19;
                            layer = Document.Layers[num5];
                            goto IL_0193;
                        IL_0193:
                            num2 = 20;
                            if (Operators.CompareString(layer.Name, "CompositeMill", false) == 0)
                            {
                                goto IL_01aa;
                            }
                            goto IL_01c3;
                        IL_01aa:
                            num2 = 21;
                            Document.Layers.Remove("CompositeMill");
                            goto IL_01d2;
                        IL_01d2:
                            num2 = 24;
                            layer = Document.Layers.Add("CompositeMill");
                            goto IL_01eb;
                        IL_01eb:
                            num2 = 25;
                            Document.ActiveLayer = layer;
                            goto IL_01fa;
                        IL_01fa:
                            num2 = 26;
                            techLatheMill5xComposite = (TechLatheMill5xComposite)array[0];
                            goto IL_0208;
                        IL_0208:
                            ProjectData.ClearProjectError();
                            num3 = 1;
                            goto IL_020f;
                        IL_020f:
                            num2 = 28;
                            techLatheMill5xComposite2 = techLatheMill5xComposite;
                            goto IL_0216;
                        IL_0216:
                            num2 = 29;
                            techLatheMill5xComposite2.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;
                            goto IL_0221;
                        IL_0221:
                            num2 = 30;
                            techLatheMill5xComposite2.FirstPassPercent = Math.Abs(MoveSTL_Module.FrontPointX) * 5.0;
                            goto IL_023f;
                        IL_023f:
                            num2 = 31;
                            techLatheMill5xComposite2.LastPassPercent = Math.Abs(MoveSTL_Module.MTI) * 5.0;
                            goto IL_025d;
                        IL_025d:
                            num2 = 32;
                            techLatheMill5xComposite2.DriveSurface = "19," + Conversions.ToString(SurfaceNumber);
                            goto IL_027b;
                        IL_027b:
                            break;
                        end_IL_0000_2:
                            break;
                    }
                    num2 = 34;
                    Document.Operations.Add(techLatheMill5xComposite, freeFormFeature, RuntimeHelpers.GetObjectValue(Missing.Value));
                    break;
                end_IL_0000:;
                }
                catch (Exception ex) when (num3 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 831;
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

        public static void Composite2()
        {
            int count = Document.FreeFormFeatures.Count;
            FreeFormFeature freeFormFeature = default(FreeFormFeature);
            for (int i = 1; i <= count; i = checked(i + 1))
            {
                freeFormFeature = Document.FreeFormFeatures[i];
                if (Operators.CompareString(freeFormFeature.Name, "3DMilling_0Degree", false) == 0)
                {
                    break;
                }
            }
            string file = PrcFilePath[11];
            ITechnology[] array = (ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file);
            Layer activeLayer;
            try
            {
                activeLayer = Document.Layers.Add("CompositeMill");
            }
            catch (Exception ex)
            {
                ProjectData.SetProjectError(ex);
                Exception ex2 = ex;
                activeLayer = Document.Layers["CompositeMill"];
                ProjectData.ClearProjectError();
            }
            Document.ActiveLayer = activeLayer;
            TechLatheMill5xComposite techLatheMill5xComposite = (TechLatheMill5xComposite)array[0];
            techLatheMill5xComposite.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;

            const double leftRatio = AppConfig.DefaultLeftRatio;
            double rightRatio = (MoveSTL_Module.BackPointX + AppConfig.DefaultRightRatioOffset) / 20.0;
            rightRatio = Clamp(rightRatio, leftRatio, 1.0);
            double span = MoveSTL_Module.BackPointX - MoveSTL_Module.FrontPointX;
            double absSpan = Math.Abs(span);
            double direction = span >= 0 ? 1.0 : -1.0;

            if (absSpan < 0.001)
            {
                absSpan = 1.0;
                direction = 1.0;
            }

            double firstPercent = Clamp(leftRatio * 100.0, 0.0, 100.0);
            double lastPercent = Clamp(rightRatio * 100.0, firstPercent, 100.0);
            double firstX = MoveSTL_Module.FrontPointX + direction * absSpan * leftRatio;
            double lastX = MoveSTL_Module.FrontPointX + direction * absSpan * rightRatio;

            techLatheMill5xComposite.FirstPassPercent = firstPercent;
            techLatheMill5xComposite.LastPassPercent = lastPercent;
            DentalLogger.Log($"Composite2 - PassPercent 계산: First={firstPercent:F2}%(X:{firstX:F3}), Last={lastPercent:F2}%(X:{lastX:F3}), Span:{absSpan:F3}");
            techLatheMill5xComposite.DriveSurface = "19," + Conversions.ToString(SurfaceNumber);
            if (string.IsNullOrWhiteSpace(techLatheMill5xComposite.ToolID))
            {
                if (!string.IsNullOrWhiteSpace(ToolNs))
                {
                    techLatheMill5xComposite.ToolID = ToolNs;
                    DentalLogger.Log($"Composite2 - PRC ToolID 비어있음, ToolNs로 매핑: {ToolNs}");
                }
                else
                {
                    DentalLogger.Log("Composite2 중단 - PRC ToolID 비어있고 ToolNs도 없습니다.");
                    return;
                }
            }

            int found = 0;
            try
            {
                foreach (Tool item in (IEnumerable)Document.Tools)
                {
                    if (Operators.CompareString(item.ToolID, techLatheMill5xComposite.ToolID, false) == 0)
                    {
                        found = 1;
                        break;
                    }
                }
            }
            catch (Exception ex3)
            {
                DentalLogger.Log($"Composite2 - Tool 검증 실패: {ex3.Message}");
            }

            if (found != 1)
            {
                DentalLogger.Log($"Composite2 중단 - Document.Tools에 ToolID가 없습니다: {techLatheMill5xComposite.ToolID}");
                try
                {
                    int printed = 0;
                    foreach (Tool item2 in (IEnumerable)Document.Tools)
                    {
                        if (printed >= 40)
                        {
                            DentalLogger.Log("Composite2 - Tools 출력 생략(상한 40)");
                            break;
                        }
                        DentalLogger.Log($"Composite2 - Tool[{printed + 1}] {item2.ToolID} {item2.ToolStyle}");
                        printed++;
                    }
                }
                catch
                {
                }
                return;
            }
            Document.Operations.Add(techLatheMill5xComposite, freeFormFeature, RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        private static double Clamp(double value, double min, double max)
        {
            if (value < min)
            {
                return min;
            }
            if (value > max)
            {
                return max;
            }
            return value;
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

        public static void BackTurning()
        {
            FeatureChain[] array = new FeatureChain[7];
            string file = PrcFilePath[1];
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

        public static void CustomCycle2()
        {
            string file = PrcFilePath[8];
            TechLatheCustom pITechnology = (TechLatheCustom)((ITechnology[])((TechnologyUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("C30D1110-1549-48C5-84D0-F66DCAD0F16F")))).OpenProcess(file))[0];
            Layer activeLayer = Document.Layers.Add("EndTurning");
            Document.ActiveLayer = activeLayer;
            Document.Operations.Add(pITechnology, null, RuntimeHelpers.GetObjectValue(Missing.Value));
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

        public static void SearchSubNumberX(int Count, double Hvalue, int Th)
        {
            double num = Count;
            Point point = default(Point);
            Point point2 = default(Point);
            for (iLine = 1.0; iLine <= num; iLine += 1.0)
            {
                GraphicObject graphicObject = checked((Th != 1) ? ((GraphicObject)((IFeatureChain)FC2).get_Item((int)Math.Round(iLine))) : ((GraphicObject)((IFeatureChain)FC1).get_Item((int)Math.Round(iLine))));
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                {
                    Arc obj = (Arc)graphicObject;
                    point = obj.Extremity(espExtremityType.espExtremityStart);
                    point2 = obj.Extremity(espExtremityType.espExtremityEnd);
                    if (point.X > point2.X)
                    {
                        double x = point2.X;
                        double y = point2.Y;
                        point2.X = point.X;
                        point2.Y = point.Y;
                        point.X = x;
                        point.Y = y;
                    }
                }
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                {
                    Segment obj2 = (Segment)graphicObject;
                    point = obj2.Extremity(espExtremityType.espExtremityStart);
                    point2 = obj2.Extremity(espExtremityType.espExtremityEnd);
                    if (point.X > point2.X)
                    {
                        double x = point2.X;
                        double y = point2.Y;
                        point2.X = point.X;
                        point2.Y = point.Y;
                        point.X = x;
                        point.Y = y;
                    }
                }
                if (SpindleSide)
                {
                    if ((Hvalue > point.X) & (Hvalue <= point2.X))
                    {
                        break;
                    }
                }
                else if ((Hvalue > point.X) & (Hvalue <= point2.X))
                {
                    break;
                }
            }
        }

        public static void SearchSubNumberSpecial(int Count, double Hvalue, int Th)
        {
            Point point = FC1.Extremity(espExtremityType.espExtremityStart);
            if (Hvalue < point.Y)
            {
                Hvalue = point.Y + 0.2;
            }
            double num = Count;
            Point point2 = default(Point);
            Point point3 = default(Point);
            for (iLine = 1.0; iLine <= num; iLine += 1.0)
            {
                GraphicObject graphicObject = checked((Th != 1) ? ((GraphicObject)((IFeatureChain)FC2).get_Item((int)Math.Round(iLine))) : ((GraphicObject)((IFeatureChain)FC1).get_Item((int)Math.Round(iLine))));
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                {
                    Arc obj = (Arc)graphicObject;
                    point2 = obj.Extremity(espExtremityType.espExtremityStart);
                    point3 = obj.Extremity(espExtremityType.espExtremityEnd);
                    if (point2.X > point3.X)
                    {
                        double x = point3.X;
                        double y = point3.Y;
                        point3.X = point2.X;
                        point3.Y = point2.Y;
                        point2.X = x;
                        point2.Y = y;
                    }
                }
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                {
                    Segment obj2 = (Segment)graphicObject;
                    point2 = obj2.Extremity(espExtremityType.espExtremityStart);
                    point3 = obj2.Extremity(espExtremityType.espExtremityEnd);
                    if (point2.X > point3.X)
                    {
                        double x = point3.X;
                        double y = point3.Y;
                        point3.X = point2.X;
                        point3.Y = point2.Y;
                        point2.X = x;
                        point2.Y = y;
                    }
                }
                if (Math.Abs(point2.Y) > Math.Abs(point3.Y))
                {
                    if ((Hvalue < point2.Y) & (Hvalue >= point3.Y))
                    {
                        break;
                    }
                }
                else if ((Hvalue >= point2.Y) & (Hvalue < point3.Y))
                {
                    break;
                }
            }
        }

        public static void DeleteFeature(int I, int j)
        {
            Fcb2[j].Reverse();
            checked
            {
                if (Fcb2[j].Count - I == 1)
                {
                    Fcb2[j].RemoveEnd(Fcb2[j].Count - I + 2);
                }
                else
                {
                    Fcb2[j].RemoveEnd(Fcb2[j].Count - I + 1);
                }
                Point point = Fcb2[j].Extremity(espExtremityType.espExtremityEnd);
                Point point2 = ((!SpindleSide) ? Document.Points.Add(point.X - 0.4, point.Y + 0.4, 0.0) : Document.Points.Add(point.X + 0.4, point.Y + 0.4, 0.0));
                Segment segment = Document.Segments.Add(point, point2);
                Fcb2[j].Add(segment);
                Fcb2[j].Reverse();
                if (Strings.Len(Fcb2[j].Name) == 15)
                {
                    Fcb2[j].Name = Fcb2[j].Name + "-Gr" + Strings.Right(Fcb2[j].Name, 1);
                }
                if (Strings.Len(Fcb2[j].Name) == 16)
                {
                    Fcb2[j].Name = Fcb2[j].Name + "-Gr" + Strings.Right(Fcb2[j].Name, 2);
                }
                Document.Points.Remove(point2.Key);
                point2 = null;
                Document.Segments.Remove(segment.Key);
                segment = null;
            }
        }

        public static void CopyFeature(int I)
        {
            SelectionSet selectionSet = Document.SelectionSets["123"];
            if (selectionSet == null)
            {
                selectionSet = Document.SelectionSets.Add("123");
            }
            selectionSet.RemoveAll();
            selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
            selectionSet.Translate(0.0, 0.0, 0.0, 1);
            int count = Document.FeatureChains.Count;
            for (int i = 1; i <= count; i = checked(i + 1))
            {
                FeatureChain featureChain = Document.FeatureChains[i];
                if ((Operators.CompareString(featureChain.Key, FC1.Key, false) != 0) & (Operators.CompareString(featureChain.Name, FC1.Name, false) == 0))
                {
                    Fcb2[I] = featureChain;
                    featureChain = null;
                    break;
                }
            }
        }

        public static void Connect2Feature()
        {
            int num = 1;
            checked
            {
                Point point;
                do
                {
                    point = FC1.Extremity(espExtremityType.espExtremityEnd);
                    if (!(point.Y > Document.LatheMachineSetup.BarDiameter / 2.0))
                    {
                        break;
                    }
                    FC1.RemoveEnd(FC1.Count);
                    num++;
                }
                while (num <= 3);
                Point endPoint = FC2.Extremity(espExtremityType.espExtremityStart);
                Segment segment = Document.Segments.Add(point, endPoint);
                FC1.Add(segment);
                Document.Segments.Remove(segment.Key);
                segment = null;
                int count = FC2.Count;
                for (num = 1; num <= count; num++)
                {
                    GraphicObject graphicObject = (GraphicObject)((IFeatureChain)FC2).get_Item(num);
                    if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                    {
                        Arc pIGraphicObject = (Arc)graphicObject;
                        FC1.Add(pIGraphicObject);
                    }
                    if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                    {
                        segment = (Segment)graphicObject;
                        FC1.Add(segment);
                    }
                }
            }
        }

        public static void MaxYPoint(FeatureChain Fc)
        {
            MaxX = 0.0;
            MaxY = 0.0;
            NeedFirstFeature = 0;
            double num = Math.Round(Fc.Length / 0.01, 0);
            double num2 = num;
            for (double num3 = 1.0; num3 <= num2; num3 += 1.0)
            {
                Pt12 = Fc.PointAlong((num3 - 1.0) * 0.01);
                if (Pt12.Y > MaxY)
                {
                    MaxY = Pt12.Y;
                    MaxX = Pt12.X;
                }
            }
            if (!(MaxY > Document.LatheMachineSetup.BarDiameter / 2.0))
            {
                return;
            }
            double num4 = num;
            for (double num3 = 1.0; num3 <= num4; num3 += 1.0)
            {
                Pt12 = Fc.PointAlong((num3 - 1.0) * 0.01);
                if (Math.Abs(Pt12.Y - Document.LatheMachineSetup.BarDiameter / 2.0) <= 0.15)
                {
                    MaxY = Pt12.Y;
                    MaxX = Pt12.X;
                    break;
                }
            }
        }

        public static void TurningBoth()
        {
            Layer activeLayer = Document.Layers.Add("MyLayer");
            Document.ActiveLayer = activeLayer;
            Document.FeatureRecognition.CreateTurningProfile(SS1, Wp, espTurningProfileType.espTurningProfileOD, espGraphicObjectReturnType.espFeatureChains, espTurningProfileLocationType.espTurningProfileLocationBoth, 0.01, 0.01, 5.0);
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
            int count = Document.FeatureChains.Count;
            checked
            {
                for (int i = 1; i <= count; i++)
                {
                    FC1 = Document.FeatureChains[i];
                    if (Operators.CompareString(FC1.Layer.Name, "MyLayer", false) != 0)
                    {
                        continue;
                    }
                    Point point;
                    Point point3;
                    Point point2;
                    Segment segment;
                    if (FC1.Extremity(espExtremityType.espExtremityMiddle).Y > 0.0)
                    {
                        FC1.Name = "TopTurn";
                        if (RL == 1.0)
                        {
                            if (!(FC1.PointAlong(0.0).X < FC1.PointAlong(FC1.Length).X))
                            {
                                FC1.Reverse();
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                            }
                        }
                        else if (RL == 2.0 && FC1.PointAlong(0.0).X < FC1.PointAlong(FC1.Length).X)
                        {
                            FC1.Reverse();
                            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                        FC1.Layer = Document.Layers["RoughMillingLayer"];
                        if (!MoveSTL_Module.NonConnection)
                        {
                            SearchSubNumber(FC1.Count, MoveSTL_Module.BackPointX, 1);
                            FC1.RemoveEnd(iLine);
                        }
                        point = FC1.Extremity(espExtremityType.espExtremityEnd);
                        point2 = Document.GetPoint(point.X, 0, 0);
                        segment = Document.GetSegment(point, point2);
                        FC1.Add(segment);
                        point = FC1.Extremity(espExtremityType.espExtremityStart);
                        point3 = Document.GetPoint(point.X, 0, 0);
                        segment = Document.GetSegment(point2, point3);
                        FC1.Add(segment);
                        point2 = Document.GetPoint(point.X, point.Y, 0);
                        segment = Document.GetSegment(point3, point2);
                        FC1.Add(segment);
                        continue;
                    }
                    FC1.Name = "BottomTurn";
                    if (RL == 1.0)
                    {
                        if (!(FC1.PointAlong(0.0).X < FC1.PointAlong(FC1.Length).X))
                        {
                            FC1.Reverse();
                            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                        }
                    }
                    else if (RL == 2.0 && FC1.PointAlong(0.0).X < FC1.PointAlong(FC1.Length).X)
                    {
                        FC1.Reverse();
                        Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                    point = FC1.Extremity(espExtremityType.espExtremityStart);
                    BtmY = point.Y;
                    FC1.Layer = Document.Layers["RoughMillingLayer"];
                    if (!MoveSTL_Module.NonConnection)
                    {
                        SearchSubNumber(FC1.Count, MoveSTL_Module.BackPointX, 1);
                        FC1.RemoveEnd(iLine);
                    }
                    point = FC1.Extremity(espExtremityType.espExtremityEnd);
                    point2 = Document.GetPoint(point.X, 0, 0);
                    segment = Document.GetSegment(point, point2);
                    FC1.Add(segment);
                    point = FC1.Extremity(espExtremityType.espExtremityStart);
                    point3 = Document.GetPoint(point.X, 0, 0);
                    segment = Document.GetSegment(point2, point3);
                    FC1.Add(segment);
                    point2 = Document.GetPoint(point.X, point.Y, 0);
                    segment = Document.GetSegment(point3, point2);
                    FC1.Add(segment);
                }
                int count2 = Document.FeatureChains.Count;
                for (int j = 1; j <= count2; j++)
                {
                    if (Operators.CompareString(Document.FeatureChains[j].Name, "TopTurn", false) == 0)
                    {
                        FC1 = Document.FeatureChains[j];
                    }
                    if (Operators.CompareString(Document.FeatureChains[j].Name, "BottomTurn", false) == 0)
                    {
                        FC2 = Document.FeatureChains[j];
                    }
                }
                Document.Layers.Remove("MyLayer");
            }
        }

        public static void TurningMaxYPoint(FeatureChain Fc)
        {
            HighY = 0.0;
            double length = Fc.Length;
            for (double num = 0.0; num <= length; num += 0.02)
            {
                Pt12 = Fc.PointAlong(num);
                if (Pt12.Y > HighY)
                {
                    HighY = Pt12.Y;
                }
            }
        }

        public static void GenerateGeo()
        {
            int try0000_dispatch = -1;
            int num2 = default(int);
            int num6 = default(int);
            int num = default(int);
            int num3 = default(int);
            int num5 = default(int);
            int num7 = default(int);
            int num8 = default(int);
            int num9 = default(int);
            int count = default(int);
            Layer activeLayer = default(Layer);
            FeatureChain featureChain = default(FeatureChain);
            Arc arc = default(Arc);
            Point point = default(Point);
            Segment segment = default(Segment);
            Point point2 = default(Point);
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
                                num2 = 1;
                                num6 = 1;
                                goto IL_0004;
                            case 938:
                                {
                                    num = num2;
                                    switch (num3)
                                    {
                                        case 1:
                                            break;
                                        default:
                                            goto end_IL_0000;
                                    }
                                    int num4 = unchecked(num + 1);
                                    num = 0;
                                    switch (num4)
                                    {
                                        case 1:
                                            break;
                                        case 2:
                                            goto IL_0004;
                                        case 3:
                                            goto IL_0032;
                                        case 4:
                                            goto IL_004c;
                                        case 5:
                                            goto IL_0069;
                                        case 6:
                                            goto IL_0070;
                                        case 7:
                                            goto IL_008b;
                                        case 8:
                                            goto IL_0094;
                                        case 9:
                                            goto IL_00af;
                                        case 10:
                                            goto IL_00bc;
                                        case 11:
                                            goto IL_00d0;
                                        case 12:
                                            goto IL_00dc;
                                        case 13:
                                            goto IL_00f7;
                                        case 14:
                                            goto IL_0113;
                                        case 15:
                                            goto IL_0120;
                                        case 16:
                                            goto IL_0131;
                                        case 17:
                                            goto IL_014a;
                                        case 18:
                                            goto IL_0159;
                                        case 19:
                                            goto IL_016d;
                                        case 20:
                                            goto IL_0179;
                                        case 21:
                                            goto IL_0194;
                                        case 22:
                                            goto IL_01b0;
                                        case 23:
                                            goto IL_01bd;
                                        case 24:
                                            goto IL_01ce;
                                        case 25:
                                            goto IL_01e7;
                                        case 26:
                                            goto IL_01f6;
                                        case 27:
                                            goto IL_020e;
                                        case 28:
                                            goto IL_0214;
                                        case 29:
                                            goto IL_022d;
                                        case 30:
                                            goto IL_0248;
                                        case 31:
                                            goto IL_0264;
                                        case 32:
                                            goto IL_026d;
                                        case 33:
                                            goto IL_027c;
                                        case 34:
                                            goto IL_0293;
                                        case 35:
                                            goto IL_02ac;
                                        case 36:
                                            goto IL_02bb;
                                        case 38:
                                            goto end_IL_0000_2;
                                        case 37:
                                        case 40:
                                            goto IL_02e3;
                                        default:
                                            goto end_IL_0000;
                                        case 39:
                                        case 41:
                                            goto end_IL_0000_3;
                                    }
                                    goto default;
                                }
                            IL_014a:
                                num2 = 17;
                                num5++;
                                goto IL_0153;
                            IL_0004:
                                num2 = 2;
                                EspritApp.Configuration.ConfigurationFeatureRecognition.Tolerance = 0.01 + 0.03 * (double)(num6 - 1);
                                goto IL_0032;
                            IL_0032:
                                num2 = 3;
                                EspritApp.Configuration.GapTolerance = 0.01;
                                goto IL_004c;
                            IL_004c:
                                num2 = 4;
                                Document.FeatureRecognition.CreatePartProfileShadow(SS1, Wp, espGraphicObjectReturnType.espSegmentsArcs);
                                goto IL_0069;
                            IL_0069:
                                ProjectData.ClearProjectError();
                                num3 = 1;
                                goto IL_0070;
                            IL_0070:
                                num2 = 6;
                                Ss = Document.SelectionSets["Temp"];
                                goto IL_008b;
                            IL_008b:
                                num2 = 7;
                                if (Ss == null)
                                {
                                    goto IL_0094;
                                }
                                goto IL_00af;
                            IL_0094:
                                num2 = 8;
                                Ss = Document.SelectionSets.Add("Temp");
                                goto IL_00af;
                            IL_00af:
                                num2 = 9;
                                Ss.RemoveAll();
                                goto IL_00bc;
                            IL_00bc:
                                num2 = 10;
                                num7 = Document.Segments.Count;
                                goto IL_00d0;
                            IL_00d0:
                                num2 = 11;
                                num8 = num7;
                                num5 = 1;
                                goto IL_0153;
                            IL_0153:
                                if (num5 <= num8)
                                {
                                    goto IL_00dc;
                                }
                                goto IL_0159;
                            IL_0159:
                                num2 = 18;
                                num7 = Document.Arcs.Count;
                                goto IL_016d;
                            IL_016d:
                                num2 = 19;
                                num9 = num7;
                                num5 = 1;
                                goto IL_01f0;
                            IL_01f0:
                                if (num5 <= num9)
                                {
                                    goto IL_0179;
                                }
                                goto IL_01f6;
                            IL_01f6:
                                num2 = 26;
                                Document.FeatureRecognition.CreateAutoChains(Ss);
                                goto IL_020e;
                            IL_020e:
                                num2 = 27;
                                num7 = 0;
                                goto IL_0214;
                            IL_0214:
                                num2 = 28;
                                count = Document.FeatureChains.Count;
                                num5 = 1;
                                goto IL_0276;
                            IL_0276:
                                if (num5 <= count)
                                {
                                    goto IL_022d;
                                }
                                goto IL_027c;
                            IL_027c:
                                num2 = 33;
                                Document.Layers.Remove("MillingGeoLayer");
                                goto IL_0293;
                            IL_0293:
                                num2 = 34;
                                activeLayer = Document.Layers.Add("MillingGeoLayer");
                                goto IL_02ac;
                            IL_02ac:
                                num2 = 35;
                                Document.ActiveLayer = activeLayer;
                                goto IL_02bb;
                            IL_02bb:
                                num2 = 36;
                                if (num7 <= 1)
                                {
                                    break;
                                }
                                goto IL_02e3;
                            IL_02e3:
                                num2 = 40;
                                num6++;
                                if (num6 > 4)
                                {
                                    goto end_IL_0000_3;
                                }
                                goto IL_0004;
                            IL_022d:
                                num2 = 29;
                                featureChain = Document.FeatureChains[num5];
                                goto IL_0248;
                            IL_0248:
                                num2 = 30;
                                if (Operators.CompareString(featureChain.Layer.Name, "MillingGeoLayer", false) == 0)
                                {
                                    goto IL_0264;
                                }
                                goto IL_026d;
                            IL_0264:
                                num2 = 31;
                                num7++;
                                goto IL_026d;
                            IL_026d:
                                num2 = 32;
                                num5++;
                                goto IL_0276;
                            IL_0179:
                                num2 = 20;
                                arc = Document.Arcs[num5];
                                goto IL_0194;
                            IL_0194:
                                num2 = 21;
                                if (Operators.CompareString(arc.Layer.Name, "MillingGeoLayer", false) == 0)
                                {
                                    goto IL_01b0;
                                }
                                goto IL_01e7;
                            IL_01b0:
                                num2 = 22;
                                point = arc.Extremity(espExtremityType.espExtremityMiddle);
                                goto IL_01bd;
                            IL_01bd:
                                num2 = 23;
                                if (point.X <= MoveSTL_Module.BackPointX)
                                {
                                    goto IL_01ce;
                                }
                                goto IL_01e7;
                            IL_01ce:
                                num2 = 24;
                                Ss.Add(arc, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_01e7;
                            IL_01e7:
                                num2 = 25;
                                num5++;
                                goto IL_01f0;
                            IL_00dc:
                                num2 = 12;
                                segment = Document.Segments[num5];
                                goto IL_00f7;
                            IL_00f7:
                                num2 = 13;
                                if (Operators.CompareString(segment.Layer.Name, "MillingGeoLayer", false) == 0)
                                {
                                    goto IL_0113;
                                }
                                goto IL_014a;
                            IL_0113:
                                num2 = 14;
                                point2 = segment.Extremity(espExtremityType.espExtremityMiddle);
                                goto IL_0120;
                            IL_0120:
                                num2 = 15;
                                if (point2.X <= MoveSTL_Module.BackPointX)
                                {
                                    goto IL_0131;
                                }
                                goto IL_014a;
                            IL_0131:
                                num2 = 16;
                                Ss.Add(segment, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_014a;
                            end_IL_0000_2:
                                break;
                        }
                        num2 = 38;
                        Document.FeatureRecognition.CreatePartProfileShadow(SS1, Wp, espGraphicObjectReturnType.espSegmentsArcs);
                        break;
                    }
                end_IL_0000:;
                }
                catch (Exception ex) when (num3 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 938;
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

        public static void OffsetMulti(int w)
        {
            int try0000_dispatch = -1;
            int num2 = default(int);
            int count = default(int);
            int num5 = default(int);
            int num = default(int);
            int num3 = default(int);
            SelectionSet selectionSet = default(SelectionSet);
            FeatureChain fC = default(FeatureChain);
            Point point = default(Point);
            int num6 = default(int);
            int num7 = default(int);
            GraphicObject graphicObject = default(GraphicObject);
            Segment segment = default(Segment);
            Arc arc = default(Arc);
            int count2 = default(int);
            int num8 = default(int);
            int count3 = default(int);
            int count4 = default(int);
            int count5 = default(int);
            int count6 = default(int);
            int count7 = default(int);
            int count8 = default(int);
            SelectionSet selectionSet2 = default(SelectionSet);
            int count9 = default(int);
            Layer activeLayer = default(Layer);
            int count10 = default(int);
            int num9 = default(int);
            int count11 = default(int);
            int count12 = default(int);
            int num10 = default(int);
            int count13 = default(int);
            int count14 = default(int);
            FeatureChain featureChain = default(FeatureChain);
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
                                num2 = 1;
                                count = Document.FeatureChains.Count;
                                num5 = 1;
                                goto IL_0052;
                            case 11501:
                                {
                                    num = num2;
                                    switch (num3)
                                    {
                                        case 1:
                                            break;
                                        default:
                                            goto end_IL_0000;
                                    }
                                    int num4 = unchecked(num + 1);
                                    num = 0;
                                    switch (num4)
                                    {
                                        case 1:
                                            break;
                                        case 2:
                                            goto IL_0017;
                                        case 3:
                                            goto IL_0033;
                                        case 5:
                                            goto IL_004c;
                                        case 4:
                                        case 6:
                                            goto IL_0057;
                                        case 7:
                                            goto IL_005e;
                                        case 8:
                                            goto IL_0076;
                                        case 9:
                                            goto IL_007c;
                                        case 10:
                                            goto IL_0095;
                                        case 11:
                                            goto IL_009f;
                                        case 12:
                                            goto IL_00b8;
                                        case 13:
                                            goto IL_00c3;
                                        case 14:
                                            goto IL_00ee;
                                        case 15:
                                            goto IL_0108;
                                        case 16:
                                            goto IL_0129;
                                        case 17:
                                            goto IL_0139;
                                        case 18:
                                            goto IL_015a;
                                        case 19:
                                            goto IL_016d;
                                        case 21:
                                            goto IL_018f;
                                        case 22:
                                            goto IL_01a2;
                                        case 20:
                                        case 23:
                                            goto IL_01c2;
                                        case 24:
                                            goto IL_01d9;
                                        case 25:
                                            goto IL_01e3;
                                        case 26:
                                            goto IL_01ff;
                                        case 27:
                                            goto IL_0220;
                                        case 28:
                                            goto IL_022a;
                                        case 29:
                                            goto IL_0237;
                                        case 30:
                                            goto IL_0258;
                                        case 31:
                                            goto IL_02aa;
                                        case 32:
                                            goto IL_02b9;
                                        case 33:
                                            goto IL_02da;
                                        case 34:
                                            goto IL_02fb;
                                        case 35:
                                            goto IL_0308;
                                        case 36:
                                            goto IL_030e;
                                        case 37:
                                            goto IL_032f;
                                        case 38:
                                            goto IL_0340;
                                        case 39:
                                            goto IL_0365;
                                        case 40:
                                            goto IL_0373;
                                        case 41:
                                            goto IL_0390;
                                        case 42:
                                            goto IL_03a3;
                                        case 45:
                                            goto IL_03b7;
                                        case 46:
                                            goto IL_03c8;
                                        case 47:
                                            goto IL_03d7;
                                        case 49:
                                            goto IL_03e8;
                                        case 50:
                                            goto IL_03fb;
                                        case 53:
                                            goto IL_040c;
                                        case 54:
                                            goto IL_041d;
                                        case 55:
                                            goto IL_042c;
                                        case 44:
                                        case 48:
                                        case 52:
                                        case 56:
                                            goto IL_043b;
                                        case 43:
                                        case 51:
                                        case 57:
                                            goto IL_044a;
                                        case 58:
                                            goto IL_0452;
                                        case 59:
                                            goto IL_0470;
                                        case 60:
                                            goto IL_047d;
                                        case 61:
                                            goto IL_0489;
                                        case 62:
                                            goto IL_049e;
                                        case 63:
                                            goto IL_04ba;
                                        case 64:
                                            goto IL_04c7;
                                        case 65:
                                            goto IL_04d3;
                                        case 66:
                                            goto IL_04e8;
                                        case 67:
                                            goto IL_0504;
                                        case 68:
                                            goto IL_051d;
                                        case 69:
                                            goto IL_052f;
                                        case 70:
                                            goto IL_0542;
                                        case 72:
                                            goto IL_0564;
                                        case 73:
                                            goto IL_0577;
                                        case 71:
                                        case 74:
                                            goto IL_0597;
                                        case 75:
                                            goto IL_05b1;
                                        case 76:
                                            goto IL_05bb;
                                        case 77:
                                            goto IL_05dc;
                                        case 78:
                                            goto IL_05fd;
                                        case 79:
                                            goto IL_061e;
                                        case 80:
                                            goto IL_063a;
                                        case 81:
                                            goto IL_0658;
                                        case 82:
                                            goto IL_0677;
                                        case 83:
                                            goto IL_0698;
                                        case 85:
                                            goto IL_06bb;
                                        case 84:
                                        case 86:
                                            goto IL_06cd;
                                        case 87:
                                            goto IL_06d3;
                                        case 88:
                                            goto IL_06ea;
                                        case 89:
                                            goto IL_0700;
                                        case 90:
                                            goto IL_070d;
                                        case 91:
                                            goto IL_0719;
                                        case 92:
                                            goto IL_0765;
                                        case 93:
                                            goto IL_076e;
                                        case 94:
                                            goto IL_0780;
                                        case 95:
                                            goto IL_078b;
                                        case 96:
                                            goto IL_07a7;
                                        case 97:
                                            goto IL_07c0;
                                        case 98:
                                            goto IL_07de;
                                        case 100:
                                            goto IL_07f8;
                                        case 99:
                                        case 101:
                                            goto IL_0807;
                                        case 102:
                                            goto IL_0820;
                                        case 103:
                                            goto IL_0833;
                                        case 105:
                                            goto IL_0855;
                                        case 106:
                                            goto IL_0868;
                                        case 104:
                                        case 107:
                                            goto IL_0888;
                                        case 108:
                                            goto IL_0892;
                                        case 109:
                                            goto IL_08ae;
                                        case 110:
                                            goto IL_08c7;
                                        case 111:
                                            goto IL_08e5;
                                        case 113:
                                            goto IL_08ff;
                                        case 112:
                                        case 114:
                                            goto IL_090e;
                                        case 115:
                                            goto IL_0927;
                                        case 116:
                                            goto IL_093a;
                                        case 118:
                                            goto IL_095c;
                                        case 119:
                                            goto IL_096f;
                                        case 117:
                                        case 120:
                                            goto IL_098f;
                                        case 121:
                                            goto IL_0999;
                                        case 122:
                                            goto IL_09b5;
                                        case 123:
                                            goto IL_09d6;
                                        case 124:
                                            goto IL_09ee;
                                        case 125:
                                            goto IL_0a0b;
                                        case 126:
                                            goto IL_0a25;
                                        case 128:
                                            goto IL_0a4b;
                                        case 130:
                                            goto IL_0a5f;
                                        case 131:
                                            goto IL_0a7b;
                                        case 132:
                                            goto IL_0a9c;
                                        case 134:
                                            goto IL_0ab9;
                                        case 133:
                                        case 135:
                                            goto IL_0acb;
                                        case 136:
                                            goto IL_0aea;
                                        case 137:
                                            goto IL_0b06;
                                        case 138:
                                            goto IL_0b27;
                                        case 139:
                                            goto IL_0b4e;
                                        case 141:
                                            goto IL_0b65;
                                        case 127:
                                        case 129:
                                        case 140:
                                        case 142:
                                            goto IL_0b77;
                                        case 143:
                                            goto IL_0b9b;
                                        case 144:
                                            goto IL_0ba8;
                                        case 146:
                                            goto IL_0bb5;
                                        case 145:
                                        case 147:
                                            goto IL_0bc0;
                                        case 148:
                                            goto IL_0be4;
                                        case 149:
                                            goto IL_0bf1;
                                        case 150:
                                            goto IL_0c0d;
                                        case 151:
                                            goto IL_0c17;
                                        case 152:
                                            goto IL_0c33;
                                        case 153:
                                            goto IL_0c40;
                                        case 154:
                                            goto IL_0c48;
                                        case 155:
                                            goto IL_0c64;
                                        case 156:
                                            goto IL_0c85;
                                        case 158:
                                            goto IL_0ca2;
                                        case 157:
                                        case 159:
                                            goto IL_0cb4;
                                        case 160:
                                            goto IL_0cd0;
                                        case 161:
                                            goto IL_0ce6;
                                        case 163:
                                            goto IL_0d0a;
                                        case 164:
                                            goto IL_0d20;
                                        case 162:
                                        case 165:
                                            goto IL_0d42;
                                        case 166:
                                            goto IL_0d5f;
                                        case 167:
                                            goto IL_0d6c;
                                        case 168:
                                            goto IL_0d90;
                                        case 169:
                                            goto IL_0db5;
                                        case 170:
                                            goto IL_0dd9;
                                        case 171:
                                            goto IL_0de4;
                                        case 172:
                                            goto IL_0df5;
                                        case 173:
                                            goto IL_0e04;
                                        case 174:
                                            goto IL_0e23;
                                        case 177:
                                            goto IL_0e34;
                                        case 178:
                                            goto IL_0e46;
                                        case 179:
                                            goto IL_0f1b;
                                        case 182:
                                            goto IL_0f3f;
                                        case 183:
                                            goto IL_0f5d;
                                        case 184:
                                            goto IL_0f6d;
                                        case 185:
                                            goto IL_0f91;
                                        case 186:
                                            goto IL_0fba;
                                        case 187:
                                            goto IL_0fde;
                                        case 188:
                                            goto IL_0fe9;
                                        case 189:
                                            goto IL_0ff9;
                                        case 191:
                                            goto IL_1022;
                                        case 192:
                                            goto IL_1034;
                                        case 193:
                                            goto IL_110c;
                                        case 194:
                                            goto IL_111e;
                                        case 195:
                                            goto IL_113c;
                                        case 196:
                                            goto IL_114c;
                                        case 197:
                                            goto IL_1170;
                                        case 198:
                                            goto IL_1199;
                                        case 199:
                                            goto IL_11bd;
                                        case 200:
                                            goto IL_11c8;
                                        case 201:
                                            goto IL_11d8;
                                        case 203:
                                            goto IL_1201;
                                        case 204:
                                            goto IL_125e;
                                        case 207:
                                            goto IL_1282;
                                        case 208:
                                            goto IL_12a0;
                                        case 209:
                                            goto IL_12b0;
                                        case 210:
                                            goto IL_12d9;
                                        case 211:
                                            goto IL_12e4;
                                        case 213:
                                            goto IL_12f9;
                                        case 214:
                                            goto IL_1308;
                                        case 216:
                                            goto IL_132b;
                                        case 217:
                                            goto IL_1403;
                                        case 218:
                                            goto IL_1421;
                                        case 219:
                                            goto IL_1431;
                                        case 220:
                                            goto IL_1455;
                                        case 221:
                                            goto IL_147e;
                                        case 222:
                                            goto IL_14a2;
                                        case 223:
                                            goto IL_14ad;
                                        case 224:
                                            goto IL_14bd;
                                        case 226:
                                            goto IL_14e6;
                                        case 227:
                                            goto IL_1563;
                                        case 229:
                                            goto IL_1586;
                                        case 230:
                                            goto IL_15a2;
                                        case 231:
                                            goto IL_15be;
                                        case 232:
                                            goto IL_15d0;
                                        case 233:
                                            goto IL_15fe;
                                        case 234:
                                            goto IL_160b;
                                        case 235:
                                            goto IL_1629;
                                        case 236:
                                            goto IL_164b;
                                        case 237:
                                            goto IL_1656;
                                        case 238:
                                            goto IL_167a;
                                        case 239:
                                            goto IL_1699;
                                        case 240:
                                            goto IL_16ba;
                                        case 241:
                                            goto IL_16dc;
                                        case 242:
                                            goto IL_16fc;
                                        case 243:
                                            goto IL_1706;
                                        case 245:
                                            goto IL_172c;
                                        case 244:
                                        case 246:
                                            goto IL_1741;
                                        case 247:
                                            goto IL_175f;
                                        case 248:
                                            goto IL_176f;
                                        case 249:
                                            goto IL_1798;
                                        case 250:
                                            goto IL_17a3;
                                        case 251:
                                            goto IL_17b3;
                                        case 253:
                                            goto IL_17d2;
                                        case 254:
                                            goto IL_18aa;
                                        case 255:
                                            goto IL_18bc;
                                        case 256:
                                            goto IL_1919;
                                        case 257:
                                            goto IL_1938;
                                        case 260:
                                            goto IL_1949;
                                        case 261:
                                            goto IL_1967;
                                        case 262:
                                            goto IL_1977;
                                        case 263:
                                            goto IL_19a0;
                                        case 264:
                                            goto IL_19ab;
                                        case 266:
                                            goto IL_19c0;
                                        case 267:
                                            goto IL_1a98;
                                        case 268:
                                            goto IL_1af5;
                                        case 271:
                                            goto IL_1b19;
                                        case 272:
                                            goto IL_1b37;
                                        case 273:
                                            goto IL_1b47;
                                        case 274:
                                            goto IL_1b70;
                                        case 275:
                                            goto IL_1b7b;
                                        case 277:
                                            goto IL_1b90;
                                        case 278:
                                            goto IL_1bed;
                                        case 279:
                                            goto IL_1c0b;
                                        case 280:
                                            goto IL_1c1b;
                                        case 281:
                                            goto IL_1c44;
                                        case 282:
                                            goto IL_1c4f;
                                        case 284:
                                            goto IL_1c64;
                                        case 285:
                                            goto IL_1c82;
                                        case 286:
                                            goto IL_1c92;
                                        case 287:
                                            goto IL_1cbb;
                                        case 288:
                                            goto IL_1cc6;
                                        case 290:
                                            goto IL_1cdb;
                                        case 291:
                                            goto IL_1ced;
                                        case 292:
                                            goto IL_1d4a;
                                        case 293:
                                            goto IL_1d68;
                                        case 294:
                                            goto IL_1d78;
                                        case 295:
                                            goto IL_1da1;
                                        case 296:
                                            goto IL_1dac;
                                        case 298:
                                            goto IL_1dc1;
                                        case 299:
                                            goto IL_1ddd;
                                        case 300:
                                            goto IL_1df9;
                                        case 301:
                                            goto IL_1e0b;
                                        case 302:
                                            goto IL_1e39;
                                        case 303:
                                            goto IL_1e46;
                                        case 304:
                                            goto IL_1e64;
                                        case 305:
                                            goto IL_1e86;
                                        case 306:
                                            goto IL_1e91;
                                        case 307:
                                            goto IL_1eb0;
                                        case 308:
                                            goto IL_1ed1;
                                        case 309:
                                            goto IL_1ef3;
                                        case 310:
                                            goto IL_1f13;
                                        case 311:
                                            goto IL_1f1d;
                                        case 313:
                                            goto IL_1f43;
                                        case 312:
                                        case 314:
                                            goto IL_1f58;
                                        case 315:
                                            goto IL_1f76;
                                        case 316:
                                            goto IL_1f86;
                                        case 317:
                                            goto IL_1faf;
                                        case 318:
                                            goto IL_1fba;
                                        case 319:
                                            goto IL_1fca;
                                        case 321:
                                            goto IL_1fe9;
                                        case 322:
                                            goto IL_20c1;
                                        case 323:
                                            goto IL_211e;
                                        case 324:
                                            goto IL_213c;
                                        case 325:
                                            goto IL_214c;
                                        case 326:
                                            goto IL_2175;
                                        case 327:
                                            goto IL_2180;
                                        case 329:
                                            goto IL_2195;
                                        case 330:
                                            goto IL_21b1;
                                        case 331:
                                            goto IL_21cd;
                                        case 332:
                                            goto IL_21df;
                                        case 333:
                                            goto IL_220d;
                                        case 334:
                                            goto IL_221a;
                                        case 335:
                                            goto IL_2238;
                                        case 336:
                                            goto IL_225a;
                                        case 337:
                                            goto IL_2265;
                                        case 338:
                                            goto IL_2284;
                                        case 339:
                                            goto IL_22a5;
                                        case 340:
                                            goto IL_22c7;
                                        case 341:
                                            goto IL_22e7;
                                        case 342:
                                            goto IL_22f1;
                                        case 344:
                                            goto IL_2317;
                                        case 343:
                                        case 345:
                                            goto IL_232c;
                                        case 346:
                                            goto IL_234a;
                                        case 347:
                                            goto IL_235a;
                                        case 348:
                                            goto IL_2383;
                                        case 349:
                                            goto IL_238e;
                                        case 350:
                                            goto IL_239e;
                                        case 352:
                                            goto IL_23bd;
                                        case 353:
                                            goto IL_241a;
                                        case 355:
                                            goto IL_243a;
                                        case 176:
                                        case 181:
                                        case 190:
                                        case 202:
                                        case 206:
                                        case 212:
                                        case 215:
                                        case 225:
                                        case 228:
                                        case 252:
                                        case 259:
                                        case 265:
                                        case 270:
                                        case 276:
                                        case 283:
                                        case 289:
                                        case 297:
                                        case 320:
                                        case 328:
                                        case 351:
                                        case 354:
                                        case 356:
                                            goto IL_2458;
                                        case 357:
                                            goto IL_2463;
                                        case 358:
                                            goto IL_2487;
                                        case 359:
                                            goto IL_24a3;
                                        case 175:
                                        case 180:
                                        case 205:
                                        case 258:
                                        case 269:
                                        case 360:
                                            goto IL_24b5;
                                        case 361:
                                            goto IL_24d4;
                                        case 362:
                                            goto IL_24f8;
                                        case 363:
                                            goto IL_2530;
                                        case 364:
                                            goto IL_2549;
                                        case 366:
                                            goto IL_2557;
                                        case 367:
                                            goto IL_2575;
                                        case 369:
                                            goto IL_2580;
                                        case 370:
                                            goto IL_259e;
                                        case 372:
                                            goto IL_25a9;
                                        case 373:
                                            goto IL_25bd;
                                        case 375:
                                            goto IL_25df;
                                        case 365:
                                        case 368:
                                        case 371:
                                        case 374:
                                        case 376:
                                            goto IL_25ff;
                                        case 377:
                                            goto IL_260e;
                                        case 378:
                                            goto IL_2618;
                                        case 380:
                                            goto IL_2628;
                                        case 381:
                                            goto IL_263b;
                                        case 384:
                                            goto IL_2649;
                                        case 385:
                                            goto IL_2668;
                                        case 383:
                                        case 386:
                                            goto IL_2684;
                                        case 379:
                                        case 382:
                                        case 387:
                                            goto IL_2693;
                                        case 388:
                                            goto end_IL_0000_2;
                                        default:
                                            goto end_IL_0000;
                                        case 389:
                                            goto end_IL_0000_3;
                                    }
                                    goto default;
                                }
                            IL_043b:
                                num2 = 56;
                                num5++;
                                goto IL_0442;
                            IL_0052:
                                if (num5 <= count)
                                {
                                    goto IL_0017;
                                }
                                goto IL_0057;
                            IL_0017:
                                num2 = 2;
                                FC2 = Document.FeatureChains[num5];
                                goto IL_0033;
                            IL_0033:
                                num2 = 3;
                                if (Operators.CompareString(FC2.Name, "Turning", false) != 0)
                                {
                                    goto IL_004c;
                                }
                                goto IL_0057;
                            IL_004c:
                                num2 = 5;
                                num5++;
                                goto IL_0052;
                            IL_0057:
                                ProjectData.ClearProjectError();
                                num3 = 1;
                                goto IL_005e;
                            IL_005e:
                                num2 = 7;
                                selectionSet = Document.SelectionSets["Temp3"];
                                goto IL_0076;
                            IL_0076:
                                num2 = 8;
                                if (selectionSet == null)
                                {
                                    goto IL_007c;
                                }
                                goto IL_0095;
                            IL_007c:
                                num2 = 9;
                                selectionSet = Document.SelectionSets.Add("Temp3");
                                goto IL_0095;
                            IL_0095:
                                num2 = 10;
                                selectionSet.RemoveAll();
                                goto IL_009f;
                            IL_009f:
                                num2 = 11;
                                selectionSet.Add(FC2, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_00b8;
                            IL_00b8:
                                num2 = 12;
                                selectionSet.AddCopiesToSelectionSet = true;
                                goto IL_00c3;
                            IL_00c3:
                                num2 = 13;
                                selectionSet.Translate(0.0, 0.0, 0.0, 1);
                                goto IL_00ee;
                            IL_00ee:
                                num2 = 14;
                                FC2 = (FeatureChain)selectionSet[2];
                                goto IL_0108;
                            IL_0108:
                                num2 = 15;
                                FC2.Layer = Document.Layers["TurningLayer"];
                                goto IL_0129;
                            IL_0129:
                                num2 = 16;
                                selectionSet.Remove(1);
                                goto IL_0139;
                            IL_0139:
                                num2 = 17;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_015a;
                            IL_015a:
                                num2 = 18;
                                if (RL == 1.0)
                                {
                                    goto IL_016d;
                                }
                                goto IL_018f;
                            IL_016d:
                                num2 = 19;
                                selectionSet.Offset(0.2, espOffsetSide.espOffsetLeft, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_01c2;
                            IL_018f:
                                num2 = 21;
                                if (RL == 2.0)
                                {
                                    goto IL_01a2;
                                }
                                goto IL_01c2;
                            IL_01a2:
                                num2 = 22;
                                selectionSet.Offset(0.2, espOffsetSide.espOffsetRight, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_01c2;
                            IL_01c2:
                                num2 = 23;
                                fC = (FeatureChain)selectionSet[2];
                                goto IL_01d9;
                            IL_01d9:
                                num2 = 24;
                                selectionSet.RemoveAll();
                                goto IL_01e3;
                            IL_01e3:
                                num2 = 25;
                                Document.FeatureChains.Remove(FC2.Key);
                                goto IL_01ff;
                            IL_01ff:
                                num2 = 26;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0220;
                            IL_0220:
                                num2 = 27;
                                FC2 = fC;
                                goto IL_022a;
                            IL_022a:
                                num2 = 28;
                                FC2.Reverse();
                                goto IL_0237;
                            IL_0237:
                                num2 = 29;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0258;
                            IL_0258:
                                num2 = 30;
                                point = Document.GetPoint(FC2.Extremity(espExtremityType.espExtremityEnd).X, -1.0 * Document.LatheMachineSetup.BarDiameter / 2.0, 0);
                                goto IL_02aa;
                            IL_02aa:
                                num2 = 31;
                                FC2.Add(point);
                                goto IL_02b9;
                            IL_02b9:
                                num2 = 32;
                                FC2.Name += "Compare";
                                goto IL_02da;
                            IL_02da:
                                num2 = 33;
                                FC2.Layer = Document.Layers["TurningLayer"];
                                goto IL_02fb;
                            IL_02fb:
                                num2 = 34;
                                FC2.Reverse();
                                goto IL_0308;
                            IL_0308:
                                num2 = 35;
                                point = null;
                                goto IL_030e;
                            IL_030e:
                                num2 = 36;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_032f;
                            IL_032f:
                                num2 = 37;
                                Py = 0.0;
                                goto IL_0340;
                            IL_0340:
                                num2 = 38;
                                num6 = (int)Math.Round(Math.Round(FC2.Length / 0.2, 0));
                                goto IL_0365;
                            IL_0365:
                                num2 = 39;
                                num7 = num6;
                                num5 = 1;
                                goto IL_0442;
                            IL_0442:
                                if (num5 <= num7)
                                {
                                    goto IL_0373;
                                }
                                goto IL_044a;
                            IL_0373:
                                num2 = 40;
                                point = FC2.PointAlong((double)(num5 - 1) * 0.2);
                                goto IL_0390;
                            IL_0390:
                                num2 = 41;
                                if (RL == 1.0)
                                {
                                    goto IL_03a3;
                                }
                                goto IL_03e8;
                            IL_03a3:
                                num2 = 42;
                                if (!(point.X >= MoveSTL_Module.BackPointX))
                                {
                                    goto IL_03b7;
                                }
                                goto IL_044a;
                            IL_03b7:
                                num2 = 45;
                                if (point.Y >= Py)
                                {
                                    goto IL_03c8;
                                }
                                goto IL_043b;
                            IL_03c8:
                                num2 = 46;
                                Py = point.Y;
                                goto IL_03d7;
                            IL_03d7:
                                num2 = 47;
                                Px = point.X;
                                goto IL_043b;
                            IL_03e8:
                                num2 = 49;
                                if (RL == 2.0)
                                {
                                    goto IL_03fb;
                                }
                                goto IL_043b;
                            IL_03fb:
                                num2 = 50;
                                if (!(point.X <= MoveSTL_Module.BackPointX))
                                {
                                    goto IL_040c;
                                }
                                goto IL_044a;
                            IL_040c:
                                num2 = 53;
                                if (point.Y >= Py)
                                {
                                    goto IL_041d;
                                }
                                goto IL_043b;
                            IL_041d:
                                num2 = 54;
                                Py = point.Y;
                                goto IL_042c;
                            IL_042c:
                                num2 = 55;
                                Px = point.X;
                                goto IL_043b;
                            IL_044a:
                                num2 = 57;
                                Extend();
                                goto IL_0452;
                            IL_0452:
                                num2 = 58;
                                graphicObject = (GraphicObject)((IFeatureChain)FC1).get_Item(FC1.Count);
                                goto IL_0470;
                            IL_0470:
                                num2 = 59;
                                if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                                {
                                    goto IL_047d;
                                }
                                goto IL_04ba;
                            IL_047d:
                                num2 = 60;
                                segment = (Segment)graphicObject;
                                goto IL_0489;
                            IL_0489:
                                num2 = 61;
                                if (segment.Length <= 0.01)
                                {
                                    goto IL_049e;
                                }
                                goto IL_04ba;
                            IL_049e:
                                num2 = 62;
                                FC1.RemoveEnd(FC1.Count);
                                goto IL_04ba;
                            IL_04ba:
                                num2 = 63;
                                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                                {
                                    goto IL_04c7;
                                }
                                goto IL_0504;
                            IL_04c7:
                                num2 = 64;
                                arc = (Arc)graphicObject;
                                goto IL_04d3;
                            IL_04d3:
                                num2 = 65;
                                if (arc.Length <= 0.01)
                                {
                                    goto IL_04e8;
                                }
                                goto IL_0504;
                            IL_04e8:
                                num2 = 66;
                                FC1.RemoveEnd(FC1.Count);
                                goto IL_0504;
                            IL_0504:
                                num2 = 67;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_051d;
                            IL_051d:
                                num2 = 68;
                                fcname = FC1.Name;
                                goto IL_052f;
                            IL_052f:
                                num2 = 69;
                                if (RL == 1.0)
                                {
                                    goto IL_0542;
                                }
                                goto IL_0564;
                            IL_0542:
                                num2 = 70;
                                selectionSet.Offset(0.2, espOffsetSide.espOffsetLeft, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0597;
                            IL_0564:
                                num2 = 72;
                                if (RL == 2.0)
                                {
                                    goto IL_0577;
                                }
                                goto IL_0597;
                            IL_0577:
                                num2 = 73;
                                selectionSet.Offset(0.2, espOffsetSide.espOffsetRight, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0597;
                            IL_0597:
                                num2 = 74;
                                FC1 = (FeatureChain)selectionSet[2];
                                goto IL_05b1;
                            IL_05b1:
                                num2 = 75;
                                selectionSet.RemoveAll();
                                goto IL_05bb;
                            IL_05bb:
                                num2 = 76;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_05dc;
                            IL_05dc:
                                num2 = 77;
                                FC1.Name += "T";
                                goto IL_05fd;
                            IL_05fd:
                                num2 = 78;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_061e;
                            IL_061e:
                                num2 = 79;
                                count2 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_06c4;
                            IL_06c4:
                                if (num6 <= count2)
                                {
                                    goto IL_063a;
                                }
                                goto IL_06cd;
                            IL_063a:
                                num2 = 80;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_0658;
                            IL_0658:
                                num2 = 81;
                                if (Operators.CompareString(FC1.Layer.Name, "Temp", false) == 0)
                                {
                                    goto IL_0677;
                                }
                                goto IL_06bb;
                            IL_0677:
                                num2 = 82;
                                FC1.Name += "T";
                                goto IL_0698;
                            IL_0698:
                                num2 = 83;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_06cd;
                            IL_06cd:
                                num2 = 86;
                                num8 = 0;
                                goto IL_06d3;
                            IL_06d3:
                                num2 = 87;
                                count3 = FC1.Count;
                                num6 = 1;
                                goto IL_0777;
                            IL_0777:
                                if (num6 <= count3)
                                {
                                    goto IL_06ea;
                                }
                                goto IL_0780;
                            IL_0780:
                                num2 = 94;
                                if (num8 == 2)
                                {
                                    goto IL_078b;
                                }
                                goto IL_0a5f;
                            IL_078b:
                                num2 = 95;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_07a7;
                            IL_07a7:
                                num2 = 96;
                                count4 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_0801;
                            IL_0801:
                                if (num6 <= count4)
                                {
                                    goto IL_07c0;
                                }
                                goto IL_0807;
                            IL_07c0:
                                num2 = 97;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_07de;
                            IL_07de:
                                num2 = 98;
                                if (Operators.CompareString(FC1.Name, fcname, false) != 0)
                                {
                                    goto IL_07f8;
                                }
                                goto IL_0807;
                            IL_07f8:
                                num2 = 100;
                                num6++;
                                goto IL_0801;
                            IL_0807:
                                num2 = 101;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0820;
                            IL_0820:
                                num2 = 102;
                                if (RL == 1.0)
                                {
                                    goto IL_0833;
                                }
                                goto IL_0855;
                            IL_0833:
                                num2 = 103;
                                selectionSet.Offset(0.01, espOffsetSide.espOffsetRight, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0888;
                            IL_0855:
                                num2 = 105;
                                if (RL == 2.0)
                                {
                                    goto IL_0868;
                                }
                                goto IL_0888;
                            IL_0868:
                                num2 = 106;
                                selectionSet.Offset(0.01, espOffsetSide.espOffsetLeft, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0888;
                            IL_0888:
                                num2 = 107;
                                selectionSet.RemoveAll();
                                goto IL_0892;
                            IL_0892:
                                num2 = 108;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_08ae;
                            IL_08ae:
                                num2 = 109;
                                count5 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_0908;
                            IL_0908:
                                if (num6 <= count5)
                                {
                                    goto IL_08c7;
                                }
                                goto IL_090e;
                            IL_08c7:
                                num2 = 110;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_08e5;
                            IL_08e5:
                                num2 = 111;
                                if (Operators.CompareString(FC1.Name, fcname, false) != 0)
                                {
                                    goto IL_08ff;
                                }
                                goto IL_090e;
                            IL_08ff:
                                num2 = 113;
                                num6++;
                                goto IL_0908;
                            IL_090e:
                                num2 = 114;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0927;
                            IL_0927:
                                num2 = 115;
                                if (RL == 1.0)
                                {
                                    goto IL_093a;
                                }
                                goto IL_095c;
                            IL_093a:
                                num2 = 116;
                                selectionSet.Offset(0.21, espOffsetSide.espOffsetLeft, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_098f;
                            IL_095c:
                                num2 = 118;
                                if (RL == 2.0)
                                {
                                    goto IL_096f;
                                }
                                goto IL_098f;
                            IL_096f:
                                num2 = 119;
                                selectionSet.Offset(0.21, espOffsetSide.espOffsetRight, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_098f;
                            IL_098f:
                                num2 = 120;
                                selectionSet.RemoveAll();
                                goto IL_0999;
                            IL_0999:
                                num2 = 121;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_09b5;
                            IL_09b5:
                                num2 = 122;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_09d6;
                            IL_09d6:
                                num2 = 123;
                                count6 = Document.FeatureChains.Count;
                                num5 = 1;
                                goto IL_0a55;
                            IL_0a55:
                                if (num5 <= count6)
                                {
                                    goto IL_09ee;
                                }
                                goto IL_0b77;
                            IL_09ee:
                                num2 = 124;
                                FC1 = Document.FeatureChains[num5];
                                goto IL_0a0b;
                            IL_0a0b:
                                num2 = 125;
                                if (Operators.CompareString(FC1.Name, fcname, false) == 0)
                                {
                                    goto IL_0a25;
                                }
                                goto IL_0a4b;
                            IL_0a25:
                                num2 = 126;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_0b77;
                            IL_0a4b:
                                num2 = 128;
                                num5++;
                                goto IL_0a55;
                            IL_0a5f:
                                num2 = 130;
                                count7 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_0ac5;
                            IL_0ac5:
                                if (num6 <= count7)
                                {
                                    goto IL_0a7b;
                                }
                                goto IL_0acb;
                            IL_0a7b:
                                num2 = 131;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_0a9c;
                            IL_0a9c:
                                num2 = 132;
                                if (Operators.CompareString(FC1.Name, fcname, false) != 0)
                                {
                                    goto IL_0ab9;
                                }
                                goto IL_0acb;
                            IL_0ab9:
                                num2 = 134;
                                num6++;
                                goto IL_0ac5;
                            IL_0acb:
                                num2 = 135;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_0aea;
                            IL_0aea:
                                num2 = 136;
                                count8 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_0b71;
                            IL_0b71:
                                if (num6 <= count8)
                                {
                                    goto IL_0b06;
                                }
                                goto IL_0b77;
                            IL_0b06:
                                num2 = 137;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_0b27;
                            IL_0b27:
                                num2 = 138;
                                if (Operators.CompareString(FC1.Name, fcname + "T", false) == 0)
                                {
                                    goto IL_0b4e;
                                }
                                goto IL_0b65;
                            IL_0b4e:
                                num2 = 139;
                                FC1.Name = fcname;
                                goto IL_0b77;
                            IL_0b77:
                                num2 = 142;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0b9b;
                            IL_0b9b:
                                num2 = 143;
                                if (NeedEndPart == 0)
                                {
                                    goto IL_0ba8;
                                }
                                goto IL_0bb5;
                            IL_0ba8:
                                num2 = 144;
                                ExtendEnd();
                                goto IL_0bc0;
                            IL_0bb5:
                                num2 = 146;
                                ExtendEndFirst();
                                goto IL_0bc0;
                            IL_0bc0:
                                num2 = 147;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0be4;
                            IL_0be4:
                                num2 = 148;
                                selectionSet.RemoveAll();
                                goto IL_0bf1;
                            IL_0bf1:
                                num2 = 149;
                                selectionSet2 = Document.SelectionSets["Tem"];
                                goto IL_0c0d;
                            IL_0c0d:
                                num2 = 150;
                                if (selectionSet2 == null)
                                {
                                    goto IL_0c17;
                                }
                                goto IL_0c33;
                            IL_0c17:
                                num2 = 151;
                                selectionSet2 = Document.SelectionSets.Add("Tem");
                                goto IL_0c33;
                            IL_0c33:
                                num2 = 152;
                                selectionSet2.RemoveAll();
                                goto IL_0c40;
                            IL_0c40:
                                num2 = 153;
                                num5 = 1;
                                goto IL_0c48;
                            IL_0c48:
                                num2 = 154;
                                count9 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_0cae;
                            IL_0cae:
                                if (num6 <= count9)
                                {
                                    goto IL_0c64;
                                }
                                goto IL_0cb4;
                            IL_0c64:
                                num2 = 155;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_0c85;
                            IL_0c85:
                                num2 = 156;
                                if (Operators.CompareString(FC1.Name, fcname, false) != 0)
                                {
                                    goto IL_0ca2;
                                }
                                goto IL_0cb4;
                            IL_0ca2:
                                num2 = 158;
                                num6++;
                                goto IL_0cae;
                            IL_0cb4:
                                num2 = 159;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0cd0;
                            IL_0cd0:
                                num2 = 160;
                                if (RL == 1.0)
                                {
                                    goto IL_0ce6;
                                }
                                goto IL_0d0a;
                            IL_0ce6:
                                num2 = 161;
                                selectionSet.Offset(MillingDepth * (double)num5, espOffsetSide.espOffsetLeft, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0d42;
                            IL_0d0a:
                                num2 = 163;
                                if (RL == 2.0)
                                {
                                    goto IL_0d20;
                                }
                                goto IL_0d42;
                            IL_0d20:
                                num2 = 164;
                                selectionSet.Offset(MillingDepth * (double)num5, espOffsetSide.espOffsetRight, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0d42;
                            IL_0d42:
                                num2 = 165;
                                FC1 = (FeatureChain)selectionSet[2];
                                goto IL_0d5f;
                            IL_0d5f:
                                num2 = 166;
                                selectionSet.RemoveAll();
                                goto IL_0d6c;
                            IL_0d6c:
                                num2 = 167;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0d90;
                            IL_0d90:
                                num2 = 168;
                                FC1.Name += Conversions.ToString(num5);
                                goto IL_0db5;
                            IL_0db5:
                                num2 = 169;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_0dd9;
                            IL_0dd9:
                                num2 = 170;
                                Intersection.DemoFc();
                                goto IL_0de4;
                            IL_0de4:
                                num2 = 171;
                                _ = FC1.Count;
                                goto IL_0df5;
                            IL_0df5:
                                num2 = 172;
                                if (FcNumber[1] == 0)
                                {
                                    goto IL_0e04;
                                }
                                goto IL_0e34;
                            IL_0e04:
                                num2 = 173;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_0e23;
                            IL_0e23:
                                num2 = 174;
                                FC1 = null;
                                goto IL_24b5;
                            IL_0e34:
                                num2 = 177;
                                if (FcNumber[3] == 0)
                                {
                                    goto IL_0e46;
                                }
                                goto IL_1022;
                            IL_0e46:
                                num2 = 178;
                                if (((Math.Abs(ptp[1].X - ptp[2].X) <= 2.5) & (Math.Abs(ptp[1].Y - ptp[2].Y) <= MillingDepth)) | (Math.Sqrt((ptp[1].X - ptp[2].X) * (ptp[1].X - ptp[2].X) + (ptp[1].Y - ptp[2].Y) * (ptp[1].Y - ptp[2].Y)) < 1.8))
                                {
                                    goto IL_0f1b;
                                }
                                goto IL_0f3f;
                            IL_0f1b:
                                num2 = 179;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_24b5;
                            IL_0f3f:
                                num2 = 182;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_0f5d;
                            IL_0f5d:
                                num2 = 183;
                                FC1.Reverse();
                                goto IL_0f6d;
                            IL_0f6d:
                                num2 = 184;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0f91;
                            IL_0f91:
                                num2 = 185;
                                FC1.RemoveEnd(FC1.Count - FcNumber[1] + 2);
                                goto IL_0fba;
                            IL_0fba:
                                num2 = 186;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0fde;
                            IL_0fde:
                                num2 = 187;
                                ExtendEnd2();
                                goto IL_0fe9;
                            IL_0fe9:
                                num2 = 188;
                                FC1.Reverse();
                                goto IL_0ff9;
                            IL_0ff9:
                                num2 = 189;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_2458;
                            IL_1022:
                                num2 = 191;
                                if (FcNumber[5] == 0)
                                {
                                    goto IL_1034;
                                }
                                goto IL_17d2;
                            IL_1034:
                                num2 = 192;
                                if (((Math.Abs(ptp[1].X - ptp[2].X) <= 2.5) & (Math.Abs(ptp[1].Y - ptp[2].Y) <= MillingDepth)) | (Math.Sqrt((ptp[1].X - ptp[2].X) * (ptp[1].X - ptp[2].X) + (ptp[1].Y - ptp[2].Y) * (ptp[1].Y - ptp[2].Y)) < 1.8))
                                {
                                    goto IL_110c;
                                }
                                goto IL_12f9;
                            IL_110c:
                                num2 = 193;
                                if (FcNumber[4] == 0)
                                {
                                    goto IL_111e;
                                }
                                goto IL_1201;
                            IL_111e:
                                num2 = 194;
                                FC1.RemoveEnd(FcNumber[3] + 1);
                                goto IL_113c;
                            IL_113c:
                                num2 = 195;
                                FC1.Reverse();
                                goto IL_114c;
                            IL_114c:
                                num2 = 196;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_1170;
                            IL_1170:
                                num2 = 197;
                                FC1.RemoveEnd(FC1.Count - FcNumber[2] + 2);
                                goto IL_1199;
                            IL_1199:
                                num2 = 198;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_11bd;
                            IL_11bd:
                                num2 = 199;
                                ExtendEnd2();
                                goto IL_11c8;
                            IL_11c8:
                                num2 = 200;
                                FC1.Reverse();
                                goto IL_11d8;
                            IL_11d8:
                                num2 = 201;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_2458;
                            IL_1201:
                                num2 = 203;
                                if ((Math.Abs(ptp[3].X - ptp[4].X) <= 2.5) & (Math.Abs(ptp[3].Y - ptp[4].Y) <= MillingDepth))
                                {
                                    goto IL_125e;
                                }
                                goto IL_1282;
                            IL_125e:
                                num2 = 204;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_24b5;
                            IL_1282:
                                num2 = 207;
                                FC1.RemoveEnd(FcNumber[4] + 1);
                                goto IL_12a0;
                            IL_12a0:
                                num2 = 208;
                                FC1.Reverse();
                                goto IL_12b0;
                            IL_12b0:
                                num2 = 209;
                                FC1.RemoveEnd(FC1.Count - FcNumber[3] + 2);
                                goto IL_12d9;
                            IL_12d9:
                                num2 = 210;
                                ExtendEnd2();
                                goto IL_12e4;
                            IL_12e4:
                                num2 = 211;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_12f9:
                                num2 = 213;
                                if (FcNumber[4] == 0)
                                {
                                    goto IL_1308;
                                }
                                goto IL_132b;
                            IL_1308:
                                num2 = 214;
                                FC1.RemoveEnd(FcNumber[3] + 1);
                                goto IL_2458;
                            IL_132b:
                                num2 = 216;
                                if (((Math.Abs(ptp[3].X - ptp[4].X) <= 2.5) & (Math.Abs(ptp[3].Y - ptp[4].Y) <= MillingDepth)) | (Math.Sqrt((ptp[3].X - ptp[4].X) * (ptp[3].X - ptp[4].X) + (ptp[3].Y - ptp[4].Y) * (ptp[3].Y - ptp[4].Y)) < 1.8))
                                {
                                    goto IL_1403;
                                }
                                goto IL_14e6;
                            IL_1403:
                                num2 = 217;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_1421;
                            IL_1421:
                                num2 = 218;
                                FC1.Reverse();
                                goto IL_1431;
                            IL_1431:
                                num2 = 219;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_1455;
                            IL_1455:
                                num2 = 220;
                                FC1.RemoveEnd(FC1.Count - FcNumber[1] + 2);
                                goto IL_147e;
                            IL_147e:
                                num2 = 221;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_14a2;
                            IL_14a2:
                                num2 = 222;
                                ExtendEnd2();
                                goto IL_14ad;
                            IL_14ad:
                                num2 = 223;
                                FC1.Reverse();
                                goto IL_14bd;
                            IL_14bd:
                                num2 = 224;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_2458;
                            IL_14e6:
                                num2 = 226;
                                if (Math.Sqrt((ptp[2].X - ptp[3].X) * (ptp[2].X - ptp[3].X) + (ptp[2].Y - ptp[3].Y) * (ptp[2].Y - ptp[3].Y)) <= 4.0)
                                {
                                    goto IL_1563;
                                }
                                goto IL_1586;
                            IL_1563:
                                num2 = 227;
                                FC1.RemoveEnd(FcNumber[4] + 1);
                                goto IL_2458;
                            IL_1586:
                                num2 = 229;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_15a2;
                            IL_15a2:
                                num2 = 230;
                                activeLayer = Document.Layers.Add("Temp");
                                goto IL_15be;
                            IL_15be:
                                num2 = 231;
                                Document.ActiveLayer = activeLayer;
                                goto IL_15d0;
                            IL_15d0:
                                num2 = 232;
                                selectionSet.Translate(0.0, 0.0, 0.0, 1);
                                goto IL_15fe;
                            IL_15fe:
                                num2 = 233;
                                selectionSet.RemoveAll();
                                goto IL_160b;
                            IL_160b:
                                num2 = 234;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_1629;
                            IL_1629:
                                num2 = 235;
                                FC1.Name = fcname + Conversions.ToString(num5 + 1);
                                goto IL_164b;
                            IL_164b:
                                num2 = 236;
                                ExtendEnd();
                                goto IL_1656;
                            IL_1656:
                                num2 = 237;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_167a;
                            IL_167a:
                                num2 = 238;
                                count10 = Document.FeatureChains.Count;
                                num9 = 1;
                                goto IL_1738;
                            IL_1738:
                                if (num9 <= count10)
                                {
                                    goto IL_1699;
                                }
                                goto IL_1741;
                            IL_1699:
                                num2 = 239;
                                FC1 = Document.FeatureChains[num9];
                                goto IL_16ba;
                            IL_16ba:
                                num2 = 240;
                                if (Operators.CompareString(FC1.Layer.Name, "Temp", false) == 0)
                                {
                                    goto IL_16dc;
                                }
                                goto IL_172c;
                            IL_16dc:
                                num2 = 241;
                                FC1.Name = fcname + Conversions.ToString(num5);
                                goto IL_16fc;
                            IL_16fc:
                                num2 = 242;
                                num5++;
                                goto IL_1706;
                            IL_1706:
                                num2 = 243;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_1741;
                            IL_1741:
                                num2 = 246;
                                FC1.RemoveEnd(FcNumber[4] + 1);
                                goto IL_175f;
                            IL_175f:
                                num2 = 247;
                                FC1.Reverse();
                                goto IL_176f;
                            IL_176f:
                                num2 = 248;
                                FC1.RemoveEnd(FC1.Count - FcNumber[3] + 2);
                                goto IL_1798;
                            IL_1798:
                                num2 = 249;
                                ExtendEnd2();
                                goto IL_17a3;
                            IL_17a3:
                                num2 = 250;
                                FC1.Reverse();
                                goto IL_17b3;
                            IL_17b3:
                                num2 = 251;
                                Document.Layers.Remove("Temp");
                                goto IL_2458;
                            IL_172c:
                                num2 = 245;
                                num9++;
                                goto IL_1738;
                            IL_17d2:
                                num2 = 253;
                                if (((Math.Abs(ptp[1].X - ptp[2].X) <= 2.5) & (Math.Abs(ptp[1].Y - ptp[2].Y) <= MillingDepth)) | (Math.Sqrt((ptp[1].X - ptp[2].X) * (ptp[1].X - ptp[2].X) + (ptp[1].Y - ptp[2].Y) * (ptp[1].Y - ptp[2].Y)) < 1.8))
                                {
                                    goto IL_18aa;
                                }
                                goto IL_1cdb;
                            IL_18aa:
                                num2 = 254;
                                if (FcNumber[6] == 0)
                                {
                                    goto IL_18bc;
                                }
                                goto IL_19c0;
                            IL_18bc:
                                num2 = 255;
                                if ((Math.Abs(ptp[5].X - ptp[4].X) <= 2.0) & (Math.Abs(ptp[5].Y - ptp[4].Y) <= MillingDepth))
                                {
                                    goto IL_1919;
                                }
                                goto IL_1949;
                            IL_1919:
                                num2 = 256;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_1938;
                            IL_1938:
                                num2 = 257;
                                FC1 = null;
                                goto IL_24b5;
                            IL_1949:
                                num2 = 260;
                                FC1.RemoveEnd(FcNumber[5] + 1);
                                goto IL_1967;
                            IL_1967:
                                num2 = 261;
                                FC1.Reverse();
                                goto IL_1977;
                            IL_1977:
                                num2 = 262;
                                FC1.RemoveEnd(FC1.Count - FcNumber[4] + 2);
                                goto IL_19a0;
                            IL_19a0:
                                num2 = 263;
                                ExtendEnd2();
                                goto IL_19ab;
                            IL_19ab:
                                num2 = 264;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_19c0:
                                num2 = 266;
                                if (((Math.Abs(ptp[3].X - ptp[4].X) <= 2.5) & (Math.Abs(ptp[3].Y - ptp[4].Y) <= MillingDepth)) | (Math.Sqrt((ptp[3].X - ptp[4].X) * (ptp[3].X - ptp[4].X) + (ptp[3].Y - ptp[4].Y) * (ptp[3].Y - ptp[4].Y)) < 1.8))
                                {
                                    goto IL_1a98;
                                }
                                goto IL_1b90;
                            IL_1a98:
                                num2 = 267;
                                if ((Math.Abs(ptp[5].X - ptp[6].X) <= 2.0) & (Math.Abs(ptp[5].Y - ptp[6].Y) <= MillingDepth))
                                {
                                    goto IL_1af5;
                                }
                                goto IL_1b19;
                            IL_1af5:
                                num2 = 268;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_24b5;
                            IL_1b19:
                                num2 = 271;
                                FC1.RemoveEnd(FcNumber[6] + 1);
                                goto IL_1b37;
                            IL_1b37:
                                num2 = 272;
                                FC1.Reverse();
                                goto IL_1b47;
                            IL_1b47:
                                num2 = 273;
                                FC1.RemoveEnd(FC1.Count - FcNumber[5] + 2);
                                goto IL_1b70;
                            IL_1b70:
                                num2 = 274;
                                ExtendEnd2();
                                goto IL_1b7b;
                            IL_1b7b:
                                num2 = 275;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_1b90:
                                num2 = 277;
                                if ((Math.Abs(ptp[5].X - ptp[6].X) <= 2.5) & (Math.Abs(ptp[5].Y - ptp[6].Y) <= MillingDepth))
                                {
                                    goto IL_1bed;
                                }
                                goto IL_1c64;
                            IL_1bed:
                                num2 = 278;
                                FC1.RemoveEnd(FcNumber[4] + 1);
                                goto IL_1c0b;
                            IL_1c0b:
                                num2 = 279;
                                FC1.Reverse();
                                goto IL_1c1b;
                            IL_1c1b:
                                num2 = 280;
                                FC1.RemoveEnd(FC1.Count - FcNumber[3] + 2);
                                goto IL_1c44;
                            IL_1c44:
                                num2 = 281;
                                ExtendEnd2();
                                goto IL_1c4f;
                            IL_1c4f:
                                num2 = 282;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_1c64:
                                num2 = 284;
                                FC1.RemoveEnd(FcNumber[6] + 1);
                                goto IL_1c82;
                            IL_1c82:
                                num2 = 285;
                                FC1.Reverse();
                                goto IL_1c92;
                            IL_1c92:
                                num2 = 286;
                                FC1.RemoveEnd(FC1.Count - FcNumber[3] + 2);
                                goto IL_1cbb;
                            IL_1cbb:
                                num2 = 287;
                                ExtendEnd2();
                                goto IL_1cc6;
                            IL_1cc6:
                                num2 = 288;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_1cdb:
                                num2 = 290;
                                if (FcNumber[6] == 0)
                                {
                                    goto IL_1ced;
                                }
                                goto IL_1fe9;
                            IL_1ced:
                                num2 = 291;
                                if ((Math.Abs(ptp[5].X - ptp[4].X) <= 2.5) & (Math.Abs(ptp[5].Y - ptp[4].Y) <= MillingDepth))
                                {
                                    goto IL_1d4a;
                                }
                                goto IL_1dc1;
                            IL_1d4a:
                                num2 = 292;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_1d68;
                            IL_1d68:
                                num2 = 293;
                                FC1.Reverse();
                                goto IL_1d78;
                            IL_1d78:
                                num2 = 294;
                                FC1.RemoveEnd(FC1.Count - FcNumber[1] + 2);
                                goto IL_1da1;
                            IL_1da1:
                                num2 = 295;
                                ExtendEnd2();
                                goto IL_1dac;
                            IL_1dac:
                                num2 = 296;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_1dc1:
                                num2 = 298;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_1ddd;
                            IL_1ddd:
                                num2 = 299;
                                activeLayer = Document.Layers.Add("Temp");
                                goto IL_1df9;
                            IL_1df9:
                                num2 = 300;
                                Document.ActiveLayer = activeLayer;
                                goto IL_1e0b;
                            IL_1e0b:
                                num2 = 301;
                                selectionSet.Translate(0.0, 0.0, 0.0, 1);
                                goto IL_1e39;
                            IL_1e39:
                                num2 = 302;
                                selectionSet.RemoveAll();
                                goto IL_1e46;
                            IL_1e46:
                                num2 = 303;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_1e64;
                            IL_1e64:
                                num2 = 304;
                                FC1.Name = fcname + Conversions.ToString(num5 + 1);
                                goto IL_1e86;
                            IL_1e86:
                                num2 = 305;
                                ExtendEnd();
                                goto IL_1e91;
                            IL_1e91:
                                num2 = 306;
                                count11 = Document.FeatureChains.Count;
                                num9 = 1;
                                goto IL_1f4f;
                            IL_1f4f:
                                if (num9 <= count11)
                                {
                                    goto IL_1eb0;
                                }
                                goto IL_1f58;
                            IL_1eb0:
                                num2 = 307;
                                FC1 = Document.FeatureChains[num9];
                                goto IL_1ed1;
                            IL_1ed1:
                                num2 = 308;
                                if (Operators.CompareString(FC1.Layer.Name, "Temp", false) == 0)
                                {
                                    goto IL_1ef3;
                                }
                                goto IL_1f43;
                            IL_1ef3:
                                num2 = 309;
                                FC1.Name = fcname + Conversions.ToString(num5);
                                goto IL_1f13;
                            IL_1f13:
                                num2 = 310;
                                num5++;
                                goto IL_1f1d;
                            IL_1f1d:
                                num2 = 311;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_1f58;
                            IL_1f58:
                                num2 = 314;
                                FC1.RemoveEnd(FcNumber[5] + 1);
                                goto IL_1f76;
                            IL_1f76:
                                num2 = 315;
                                FC1.Reverse();
                                goto IL_1f86;
                            IL_1f86:
                                num2 = 316;
                                FC1.RemoveEnd(FC1.Count - FcNumber[4] + 2);
                                goto IL_1faf;
                            IL_1faf:
                                num2 = 317;
                                ExtendEnd2();
                                goto IL_1fba;
                            IL_1fba:
                                num2 = 318;
                                FC1.Reverse();
                                goto IL_1fca;
                            IL_1fca:
                                num2 = 319;
                                Document.Layers.Remove("Temp");
                                goto IL_2458;
                            IL_1f43:
                                num2 = 313;
                                num9++;
                                goto IL_1f4f;
                            IL_1fe9:
                                num2 = 321;
                                if (((Math.Abs(ptp[3].X - ptp[4].X) <= 2.5) & (Math.Abs(ptp[3].Y - ptp[4].Y) <= MillingDepth)) | (Math.Sqrt((ptp[3].X - ptp[4].X) * (ptp[3].X - ptp[4].X) + (ptp[3].Y - ptp[4].Y) * (ptp[3].Y - ptp[4].Y)) < 1.8))
                                {
                                    goto IL_20c1;
                                }
                                goto IL_23bd;
                            IL_20c1:
                                num2 = 322;
                                if ((Math.Abs(ptp[5].X - ptp[6].X) <= 2.5) & (Math.Abs(ptp[5].Y - ptp[6].Y) <= MillingDepth))
                                {
                                    goto IL_211e;
                                }
                                goto IL_2195;
                            IL_211e:
                                num2 = 323;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_213c;
                            IL_213c:
                                num2 = 324;
                                FC1.Reverse();
                                goto IL_214c;
                            IL_214c:
                                num2 = 325;
                                FC1.RemoveEnd(FC1.Count - FcNumber[1] + 2);
                                goto IL_2175;
                            IL_2175:
                                num2 = 326;
                                ExtendEnd2();
                                goto IL_2180;
                            IL_2180:
                                num2 = 327;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_2195:
                                num2 = 329;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_21b1;
                            IL_21b1:
                                num2 = 330;
                                activeLayer = Document.Layers.Add("Temp");
                                goto IL_21cd;
                            IL_21cd:
                                num2 = 331;
                                Document.ActiveLayer = activeLayer;
                                goto IL_21df;
                            IL_21df:
                                num2 = 332;
                                selectionSet.Translate(0.0, 0.0, 0.0, 1);
                                goto IL_220d;
                            IL_220d:
                                num2 = 333;
                                selectionSet.RemoveAll();
                                goto IL_221a;
                            IL_221a:
                                num2 = 334;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_2238;
                            IL_2238:
                                num2 = 335;
                                FC1.Name = fcname + Conversions.ToString(num5 + 1);
                                goto IL_225a;
                            IL_225a:
                                num2 = 336;
                                ExtendEnd();
                                goto IL_2265;
                            IL_2265:
                                num2 = 337;
                                count12 = Document.FeatureChains.Count;
                                num9 = 1;
                                goto IL_2323;
                            IL_2323:
                                if (num9 <= count12)
                                {
                                    goto IL_2284;
                                }
                                goto IL_232c;
                            IL_2284:
                                num2 = 338;
                                FC1 = Document.FeatureChains[num9];
                                goto IL_22a5;
                            IL_22a5:
                                num2 = 339;
                                if (Operators.CompareString(FC1.Layer.Name, "Temp", false) == 0)
                                {
                                    goto IL_22c7;
                                }
                                goto IL_2317;
                            IL_22c7:
                                num2 = 340;
                                FC1.Name = fcname + Conversions.ToString(num5);
                                goto IL_22e7;
                            IL_22e7:
                                num2 = 341;
                                num5++;
                                goto IL_22f1;
                            IL_22f1:
                                num2 = 342;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_232c;
                            IL_232c:
                                num2 = 345;
                                FC1.RemoveEnd(FcNumber[6] + 1);
                                goto IL_234a;
                            IL_234a:
                                num2 = 346;
                                FC1.Reverse();
                                goto IL_235a;
                            IL_235a:
                                num2 = 347;
                                FC1.RemoveEnd(FC1.Count - FcNumber[5] + 2);
                                goto IL_2383;
                            IL_2383:
                                num2 = 348;
                                ExtendEnd2();
                                goto IL_238e;
                            IL_238e:
                                num2 = 349;
                                FC1.Reverse();
                                goto IL_239e;
                            IL_239e:
                                num2 = 350;
                                Document.Layers.Remove("Temp");
                                goto IL_2458;
                            IL_2317:
                                num2 = 344;
                                num9++;
                                goto IL_2323;
                            IL_23bd:
                                num2 = 352;
                                if ((Math.Abs(ptp[5].X - ptp[6].X) <= 2.5) & (Math.Abs(ptp[5].Y - ptp[6].Y) <= MillingDepth))
                                {
                                    goto IL_241a;
                                }
                                goto IL_243a;
                            IL_241a:
                                num2 = 353;
                                FC1.RemoveEnd(FcNumber[4] + 1);
                                goto IL_2458;
                            IL_243a:
                                num2 = 355;
                                FC1.RemoveEnd(FcNumber[6] + 1);
                                goto IL_2458;
                            IL_2458:
                                num2 = 356;
                                ExtendEnd();
                                goto IL_2463;
                            IL_2463:
                                num2 = 357;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_2487;
                            IL_2487:
                                num2 = 358;
                                selectionSet2.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_24a3;
                            IL_24a3:
                                num2 = 359;
                                num5++;
                                if (num5 <= 19)
                                {
                                    goto IL_0c48;
                                }
                                goto IL_24b5;
                            IL_24b5:
                                num2 = 360;
                                Document.FeatureChains.Remove(FC2.Key);
                                goto IL_24d4;
                            IL_24d4:
                                num2 = 361;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_24f8;
                            IL_24f8:
                                num2 = 362;
                                num10 = (int)Math.Round((double)selectionSet2.Count / 2.0 - Conversion.Int((double)selectionSet2.Count / 2.0));
                                goto IL_2530;
                            IL_2530:
                                num2 = 363;
                                if ((AngNumber == 4) & (AngType1 == 1))
                                {
                                    goto IL_2549;
                                }
                                goto IL_2557;
                            IL_2549:
                                num2 = 364;
                                num10 = 1;
                                goto IL_25ff;
                            IL_2557:
                                num2 = 366;
                                if (unchecked(AngNumber == 5 && w == 4) & (AngType1 == 1))
                                {
                                    goto IL_2575;
                                }
                                goto IL_2580;
                            IL_2575:
                                num2 = 367;
                                num10 = 1;
                                goto IL_25ff;
                            IL_2580:
                                num2 = 369;
                                if (unchecked(AngNumber == 5 && w == 5) & (AngType2 == 1))
                                {
                                    goto IL_259e;
                                }
                                goto IL_25a9;
                            IL_259e:
                                num2 = 370;
                                num10 = 1;
                                goto IL_25ff;
                            IL_25a9:
                                num2 = 372;
                                if ((double)num10 <= 0.001)
                                {
                                    goto IL_25bd;
                                }
                                goto IL_25df;
                            IL_25bd:
                                num2 = 373;
                                num10 = (int)Conversion.Int((double)selectionSet2.Count / 2.0);
                                goto IL_25ff;
                            IL_25df:
                                num2 = 375;
                                num10 = (int)Conversion.Int((double)selectionSet2.Count / 2.0);
                                goto IL_25ff;
                            IL_25ff:
                                num2 = 376;
                                count13 = selectionSet2.Count;
                                goto IL_260e;
                            IL_260e:
                                num2 = 377;
                                if (w > 3)
                                {
                                    goto IL_2618;
                                }
                                goto IL_2693;
                            IL_2618:
                                num2 = 378;
                                if (selectionSet2.Count != 1)
                                {
                                    goto IL_2628;
                                }
                                goto IL_2693;
                            IL_2628:
                                num2 = 380;
                                count14 = selectionSet2.Count;
                                num5 = 1;
                                goto IL_268e;
                            IL_268e:
                                if (num5 <= count14)
                                {
                                    goto IL_263b;
                                }
                                goto IL_2693;
                            IL_263b:
                                num2 = 381;
                                if (count13 - num5 >= num10)
                                {
                                    goto IL_2649;
                                }
                                goto IL_2693;
                            IL_2649:
                                num2 = 384;
                                featureChain = (FeatureChain)selectionSet2[count13 - num5 + 1];
                                goto IL_2668;
                            IL_2668:
                                num2 = 385;
                                Document.FeatureChains.Remove(featureChain.Key);
                                goto IL_2684;
                            IL_2684:
                                num2 = 386;
                                num5++;
                                goto IL_268e;
                            IL_2693:
                                num2 = 387;
                                selectionSet2.RemoveAll();
                                break;
                            IL_0b65:
                                num2 = 141;
                                num6++;
                                goto IL_0b71;
                            IL_06ea:
                                num2 = 88;
                                graphicObject = (GraphicObject)((IFeatureChain)FC1).get_Item(num6);
                                goto IL_0700;
                            IL_0700:
                                num2 = 89;
                                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                                {
                                    goto IL_070d;
                                }
                                goto IL_076e;
                            IL_070d:
                                num2 = 90;
                                arc = (Arc)graphicObject;
                                goto IL_0719;
                            IL_0719:
                                num2 = 91;
                                if ((Math.Abs(arc.Radius - 0.2) <= 0.01) & (Math.Abs(arc.EndAngle - arc.StartAngle) >= 2.45))
                                {
                                    goto IL_0765;
                                }
                                goto IL_076e;
                            IL_0765:
                                num2 = 92;
                                num8++;
                                goto IL_076e;
                            IL_076e:
                                num2 = 93;
                                num6++;
                                goto IL_0777;
                            IL_06bb:
                                num2 = 85;
                                num6++;
                                goto IL_06c4;
                            end_IL_0000_2:
                                break;
                        }
                        num2 = 388;
                        Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                        break;
                    }
                end_IL_0000:;
                }
                catch (Exception ex) when (num3 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 11501;
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

        public static void Extend()
        {
            Point[] array = new Point[3];
            FC1.Reverse();
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
            FC1.Extremity(espExtremityType.espExtremityEnd);
            object obj = ((IFeatureChain)FC1).get_Item(FC1.Count);
            Point point = default(Point);
            if (RL == 1.0)
            {
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espSegment, false))
                {
                    IComSegment comSegment = (IComSegment)obj;
                    array[1] = Document.GetPoint(comSegment.PointAlong(0.0).X, comSegment.PointAlong(0.0).Y, comSegment.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comSegment.PointAlong(comSegment.Length).X, comSegment.PointAlong(comSegment.Length).Y, comSegment.PointAlong(comSegment.Length).Z);
                    if (array[1].X < array[2].X)
                    {
                        IComVector comVector = comSegment.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z * comVector.Z) : Document.GetPoint(array[1].X - 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comSegment.TangentAlong(comSegment.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X - 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espArc, false))
                {
                    IComArc comArc = (IComArc)obj;
                    array[1] = Document.GetPoint(comArc.PointAlong(0.0).X, comArc.PointAlong(0.0).Y, comArc.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comArc.PointAlong(comArc.Length).X, comArc.PointAlong(comArc.Length).Y, comArc.PointAlong(comArc.Length).Z);
                    if (array[1].X < array[2].X)
                    {
                        IComVector comVector = comArc.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X - 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comArc.TangentAlong(comArc.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X - 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
            }
            else if (RL == 2.0)
            {
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espSegment, false))
                {
                    IComSegment comSegment = (IComSegment)obj;
                    array[1] = Document.GetPoint(comSegment.PointAlong(0.0).X, comSegment.PointAlong(0.0).Y, comSegment.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comSegment.PointAlong(comSegment.Length).X, comSegment.PointAlong(comSegment.Length).Y, comSegment.PointAlong(comSegment.Length).Z);
                    if (array[1].X > array[2].X)
                    {
                        IComVector comVector = comSegment.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X + 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comSegment.TangentAlong(comSegment.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X + 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espArc, false))
                {
                    IComArc comArc = (IComArc)obj;
                    array[1] = Document.GetPoint(comArc.PointAlong(0.0).X, comArc.PointAlong(0.0).Y, comArc.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comArc.PointAlong(comArc.Length).X, comArc.PointAlong(comArc.Length).Y, comArc.PointAlong(comArc.Length).Z);
                    if (array[1].X > array[2].X)
                    {
                        IComVector comVector = comArc.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X + 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comArc.TangentAlong(comArc.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X + 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
            }
            if (point != null)
            {
                FC1.Add(point);
            }
            FC1.Reverse();
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void ExtendEnd()
        {
            Point point = FC1.Extremity(espExtremityType.espExtremityEnd);
            Point v = default(Point);
            if (RL == 1.0)
            {
                v = ((!(point.X < MoveSTL_Module.FirstPX)) ? Document.GetPoint(point.X + 2.0, point.Y + 1.0, 0) : Document.GetPoint(point.X - 0.5, point.Y + 3.0, 0));
            }
            else if (RL == 2.0)
            {
                v = ((!(point.X > MoveSTL_Module.FirstPX)) ? Document.GetPoint(point.X - 2.0, point.Y + 1.0, 0) : Document.GetPoint(point.X + 0.5, point.Y + 3.0, 0));
            }
            Segment segment = Document.GetSegment(point, v);
            FC1.Add(segment);
            v = null;
            point = null;
            segment = null;
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void ExtendEnd3()
        {
            Point point = FC1.Extremity(espExtremityType.espExtremityEnd);
            Point point2 = default(Point);
            if (RL == 1.0)
            {
                point2 = Document.Points.Add(point.X + Math.Sqrt(6.75), point.Y + 1.5, 0.0);
            }
            else if (RL == 2.0)
            {
                point2 = Document.Points.Add(point.X - Math.Sqrt(6.75), point.Y + 1.5, 0.0);
            }
            Segment segment = Document.Segments.Add(point, point2);
            FC1.Add(segment);
            Document.Points.Remove(point2.Key);
            Document.Segments.Remove(segment.Key);
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void ExtendEnd2()
        {
            Point[] array = new Point[3];
            FC1.Extremity(espExtremityType.espExtremityEnd);
            object obj = ((IFeatureChain)FC1).get_Item(FC1.Count);
            Point point = default(Point);
            if (RL == 1.0)
            {
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espSegment, false))
                {
                    IComSegment comSegment = (IComSegment)obj;
                    array[1] = Document.GetPoint(comSegment.PointAlong(0.0).X, comSegment.PointAlong(0.0).Y, comSegment.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comSegment.PointAlong(comSegment.Length).X, comSegment.PointAlong(comSegment.Length).Y, comSegment.PointAlong(comSegment.Length).Z);
                    if (array[1].X < array[2].X)
                    {
                        IComVector comVector = comSegment.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z * comVector.Z) : Document.GetPoint(array[1].X - 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comSegment.TangentAlong(comSegment.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X - 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espArc, false))
                {
                    IComArc comArc = (IComArc)obj;
                    array[1] = Document.GetPoint(comArc.PointAlong(0.0).X, comArc.PointAlong(0.0).Y, comArc.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comArc.PointAlong(comArc.Length).X, comArc.PointAlong(comArc.Length).Y, comArc.PointAlong(comArc.Length).Z);
                    if (array[1].X < array[2].X)
                    {
                        IComVector comVector = comArc.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X - 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comArc.TangentAlong(comArc.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X - 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
            }
            else if (RL == 2.0)
            {
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espSegment, false))
                {
                    IComSegment comSegment = (IComSegment)obj;
                    array[1] = Document.GetPoint(comSegment.PointAlong(0.0).X, comSegment.PointAlong(0.0).Y, comSegment.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comSegment.PointAlong(comSegment.Length).X, comSegment.PointAlong(comSegment.Length).Y, comSegment.PointAlong(comSegment.Length).Z);
                    if (array[1].X > array[2].X)
                    {
                        IComVector comVector = comSegment.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X + 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comSegment.TangentAlong(comSegment.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X + 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espArc, false))
                {
                    IComArc comArc = (IComArc)obj;
                    array[1] = Document.GetPoint(comArc.PointAlong(0.0).X, comArc.PointAlong(0.0).Y, comArc.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comArc.PointAlong(comArc.Length).X, comArc.PointAlong(comArc.Length).Y, comArc.PointAlong(comArc.Length).Z);
                    if (array[1].X > array[2].X)
                    {
                        IComVector comVector = comArc.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X + 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comArc.TangentAlong(comArc.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X + 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
            }
            if (point != null)
            {
                FC1.Add(point);
            }
        }

        public static void ExtendEndFirst()
        {
            Point point = FC1.Extremity(espExtremityType.espExtremityEnd);
            Point point2 = default(Point);
            if (RL == 1.0)
            {
                point2 = Document.Points.Add(point.X + 2.0, point.Y + 1.0, 0.0);
            }
            else if (RL == 2.0)
            {
                point2 = Document.Points.Add(point.X - 2.0, point.Y + 1.0, 0.0);
            }
            Segment segment = Document.Segments.Add(point, point2);
            FC1.Add(segment);
            Document.Points.Remove(point2.Key);
            Document.Segments.Remove(segment.Key);
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void GenerateMillFeature(int I)
        {
            Ang = Math.PI * 10.0 * (double)checked(Q[I] - 1) / 180.0;
            Milling_Module.RotatePart();
            Layer activeLayer = Document.Layers.Add("MillingGeoLayer");
            Document.ActiveLayer = activeLayer;
            m = 1;
            GenerateGeometry();
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
            HandleTopFeature(I);
            Document.Layers.Remove("MillingGeoLayer");
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void HandleTopFeature(int k)
        {
            Incline = 0.0;
            try
            {
                Ss = Document.SelectionSets.Add("Temp");
            }
            catch (Exception ex)
            {
                ProjectData.SetProjectError(ex);
                Exception ex2 = ex;
                Ss = Document.SelectionSets["Temp"];
                ProjectData.ClearProjectError();
            }
            Ss.RemoveAll();
            int num = Document.Segments.Count;
            Layer activeLayer;
            try
            {
                activeLayer = Document.Layers.Add("MyLayer");
            }
            catch (Exception ex3)
            {
                ProjectData.SetProjectError(ex3);
                Exception ex4 = ex3;
                activeLayer = Document.Layers["MyLayer"];
                ProjectData.ClearProjectError();
            }
            Document.ActiveLayer = activeLayer;
            FeatureChain featureChain = null;
            int count = Document.FeatureChains.Count;
            checked
            {
                for (int i = 1; i <= count; i++)
                {
                    featureChain = Document.FeatureChains[i];
                    if (Operators.CompareString(featureChain.Layer.Name, "MillingGeoLayer", false) == 0)
                    {
                        break;
                    }
                    featureChain = null;
                }
                if (featureChain != null)
                {
                    featureChain = ChangeStartPointFc(featureChain);
                }
                Point point = featureChain.PointAlong(0.0);
                Point point2 = featureChain.PointAlong(1.0);
                if (Math.Abs(point.X - point2.X) <= 0.01)
                {
                    featureChain.Reverse();
                    Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                    point = featureChain.PointAlong(0.0);
                    point2 = featureChain.PointAlong(1.0);
                }
                if (Math.Abs(point.X) < Math.Abs(point2.X))
                {
                    featureChain.Reverse();
                    Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                }
                FC1 = featureChain;
                FC1.Name = "RoughMill" + Conversions.ToString(k);
                FC1.Layer = Document.Layers["MillingGeoLayer"];
                double num2 = 20.0;
                int count2 = FC1.Count;
                for (int i = 1; i <= count2; i++)
                {
                    GraphicObject graphicObject = (GraphicObject)((IFeatureChain)FC1).get_Item(i);
                    if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                    {
                        point = ((Segment)graphicObject).Extremity(espExtremityType.espExtremityMiddle);
                    }
                    if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                    {
                        Arc arc = (Arc)graphicObject;
                        point = arc.Extremity(espExtremityType.espExtremityMiddle);
                    }
                    if (Math.Abs(point.X) < num2)
                    {
                        num2 = Math.Abs(point.X);
                        num = i;
                    }
                }
                FC1.RemoveEnd(num + 1);
                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                num = 0;
                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                int count3 = FC1.Count;
                for (int i = 1; i <= count3; i++)
                {
                    GraphicObject graphicObject2 = (GraphicObject)((IFeatureChain)FC1).get_Item(i);
                    if (graphicObject2.GraphicObjectType == espGraphicObjectType.espSegment)
                    {
                        Segment obj = (Segment)graphicObject2;
                        if (obj.Length <= 0.05)
                        {
                            num++;
                        }
                        if (obj.Length > 0.05)
                        {
                            break;
                        }
                    }
                    if (graphicObject2.GraphicObjectType == espGraphicObjectType.espArc)
                    {
                        Arc arc = (Arc)graphicObject2;
                        if (arc.Length > 0.05)
                        {
                            break;
                        }
                        if (arc.Length <= 0.05)
                        {
                            num++;
                        }
                    }
                }
                FC1.Reverse();
                FC1.RemoveEnd(FC1.Count - num + 1);
                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                num = 0;
                int count4 = FC1.Count;
                for (int i = 1; i <= count4; i++)
                {
                    GraphicObject graphicObject2 = (GraphicObject)((IFeatureChain)FC1).get_Item(i);
                    if (graphicObject2.GraphicObjectType == espGraphicObjectType.espSegment)
                    {
                        Segment obj2 = (Segment)graphicObject2;
                        if (obj2.Length <= 0.015)
                        {
                            num++;
                        }
                        if (obj2.Length > 0.015)
                        {
                            break;
                        }
                    }
                    if (graphicObject2.GraphicObjectType == espGraphicObjectType.espArc)
                    {
                        Arc arc = (Arc)graphicObject2;
                        if (arc.Length > 0.015)
                        {
                            break;
                        }
                        if (arc.Length <= 0.015)
                        {
                            num++;
                        }
                    }
                }
                FC1.Reverse();
                if (num != 0)
                {
                    FC1.RemoveEnd(FC1.Count - num + 1);
                }
                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                LeftMaterialEnd();
                FC1.Layer = Document.Layers["RoughMillingLayer"];
                Document.Layers.Remove("MyLayer");
                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
            }
        }

        public static FeatureChain ChangeStartPointFc(FeatureChain Fc)
        {
            //IL_0000: Unknown result type (might be due to invalid IL or missing references)
            //IL_0007: Expected O, but got Unknown
            //IL_001c: Unknown result type (might be due to invalid IL or missing references)
            //IL_0022: Expected O, but got Unknown
            //IL_019b: Unknown result type (might be due to invalid IL or missing references)
            //IL_01a7: Expected O, but got Unknown
            //IL_01a7: Unknown result type (might be due to invalid IL or missing references)
            //IL_01ad: Expected O, but got Unknown
            //IL_020a: Unknown result type (might be due to invalid IL or missing references)
            //IL_0215: Expected O, but got Unknown
            //IL_0250: Unknown result type (might be due to invalid IL or missing references)
            //IL_025b: Expected O, but got Unknown
            int try0000_dispatch = -1;
            int num2 = default(int);
            Point point = default(Point);
            FeatureChain result = default(FeatureChain);
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
                                    FeatureUtility val = (FeatureUtility)new FeatureUtilityClass();
                                    Point[] array = new Point[3];
                                    ProjectData.ClearProjectError();
                                    num2 = 2;
                                    IComChainFeature val2 = (IComChainFeature)Fc.ComGraphicObject;
                                    double num3 = 1000.0;
                                    int count = Fc.Count;
                                    for (int i = 1; i <= count; i++)
                                    {
                                        GraphicObject graphicObject = (GraphicObject)((IFeatureChain)Fc).get_Item(i);
                                        if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                                        {
                                            Segment segment = (Segment)graphicObject;
                                            array[1] = segment.Extremity(espExtremityType.espExtremityStart);
                                            array[2] = segment.Extremity(espExtremityType.espExtremityEnd);
                                        }
                                        if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                                        {
                                            Arc arc = (Arc)graphicObject;
                                            array[1] = arc.Extremity(espExtremityType.espExtremityStart);
                                            array[2] = arc.Extremity(espExtremityType.espExtremityEnd);
                                        }
                                        if (Math.Abs(Math.Abs(MoveSTL_Module.BackPointX) - Math.Abs(array[1].X)) < Math.Abs(Math.Abs(MoveSTL_Module.BackPointX) - Math.Abs(array[2].X)))
                                        {
                                            array[0] = array[1];
                                        }
                                        else
                                        {
                                            array[0] = array[2];
                                        }
                                        if ((Math.Abs(Math.Abs(MoveSTL_Module.BackPointX) - Math.Abs(array[0].X)) < num3) & (array[0].Y >= 0.0))
                                        {
                                            num3 = Math.Abs(Math.Abs(MoveSTL_Module.BackPointX) - Math.Abs(array[0].X));
                                            point = array[0];
                                        }
                                    }
                                    IComPoint comPoint = (IComPoint)Document.GetPoint(point.X, point.Y, point.Z);
                                    val2 = (IComChainFeature)((IFeatureUtility)val).ChangeStartPoint((ComFeature)val2, comPoint);
                                    FeatureChain featureChain = Document.FeatureChains.Add(point);
                                    int count2 = val2.Count;
                                    for (int i = 1; i <= count2; i++)
                                    {
                                        ComFeatureElement val3 = val2[i];
                                        if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(((IComFeatureElement)val3).ElementObject, (Type)null, "Type", new object[0], (string[])null, (Type[])null, (bool[])null), (object)geoElementType.geoSegment, false))
                                        {
                                            Segment segment = ComSegmentToSegment((ComSegment)((IComFeatureElement)val3).ElementObject, CreateVirtual: true);
                                            featureChain.Add(segment);
                                        }
                                        if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(((IComFeatureElement)val3).ElementObject, (Type)null, "Type", new object[0], (string[])null, (Type[])null, (bool[])null), (object)geoElementType.geoArc, false))
                                        {
                                            Arc arc = ComArcToArc((ComArc)((IComFeatureElement)val3).ElementObject, CreateVirtual: true);
                                            featureChain.Add(arc);
                                        }
                                    }
                                    result = featureChain;
                                    Document.FeatureChains.Remove(Fc.Key);
                                    Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                    break;
                                }
                            case 685:
                                num = -1;
                                switch (num2)
                                {
                                    case 2:
                                        break;
                                    default:
                                        goto IL_02e3;
                                }
                                break;
                        }
                    }
                }
                catch (Exception ex) when (num2 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 685;
                    continue;
                }
                break;
            IL_02e3:
                throw ProjectData.CreateProjectError(-2146828237);
            }
            if (num != 0)
            {
                ProjectData.ClearProjectError();
            }
            return result;
        }

        public static Segment ComSegmentToSegment(ComSegment ComSegmentObj, bool CreateVirtual = false)
        {
            Segment result = default(Segment);
            if (ComSegmentObj != null)
            {
                Point[] array = new Point[3];
                IComPoint startPoint = ((IComSegment)ComSegmentObj).StartPoint;
                array[1] = Document.GetPoint(startPoint.X, startPoint.Y, startPoint.Z);
                IComPoint endPoint = ((IComSegment)ComSegmentObj).EndPoint;
                array[2] = Document.GetPoint(endPoint.X, endPoint.Y, endPoint.Z);
                result = ((!CreateVirtual) ? Document.Segments.Add(array[1], array[2]) : Document.GetSegment(array[1], array[2]));
            }
            return result;
        }

        public static Arc ComArcToArc(ComArc ComArcObj, bool CreateVirtual = false)
        {
            Arc arc = default(Arc);
            if (ComArcObj != null)
            {
                ComArc val = ComArcObj;
                IComPoint centerPoint = ((IComArc)val).CenterPoint;
                Point point = Document.GetPoint(centerPoint.X, centerPoint.Y, centerPoint.Z);
                arc = ((!CreateVirtual) ? Document.Arcs.Add(point, ((IComArc)val).Radius, ((IComArc)val).StartAngle, ((IComArc)val).EndAngle) : Document.GetArc(point, ((IComArc)val).Radius, ((IComArc)val).StartAngle, ((IComArc)val).EndAngle));
                IComVector u = ((IComArc)val).U;
                arc.Ux = u.X;
                arc.Uy = u.Y;
                arc.Uz = u.Z;
                IComVector v = ((IComArc)val).V;
                arc.Vx = v.X;
                arc.Vy = v.Y;
                arc.Vz = v.Z;
            }
            return arc;
        }

        public static void LeftMaterialEnd()
        {
            Point[] array = new Point[3];
            checked
            {
                int value = (int)Math.Round(Math.Round(FC1.Length, 1) / 0.1);
                value = Convert.ToInt32(Math.Round(new decimal(value), 0));
                double length = 0.0;
                bool flag = false;
                Document.Layers.Add("123");
                Document.ActiveLayer = Document.Layers["123"];
                SelectionSet selectionSet = Document.SelectionSets["STL"];
                if (selectionSet == null)
                {
                    selectionSet = Document.SelectionSets.Add("STL");
                }
                selectionSet.RemoveAll();
                foreach (GraphicObject item in Document.GraphicsCollection)
                {
                    if (item.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        selectionSet.Add(item, RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                }
                Document.FeatureRecognition.CreateTurningProfile(selectionSet, Wp, espTurningProfileType.espTurningProfileOD, espGraphicObjectReturnType.espFeatureChains, espTurningProfileLocationType.espTurningProfileLocationTop, 0.01, 0.01, 5.0);
                selectionSet.RemoveAll();
                FeatureChain featureChain = null;
                int count = Document.FeatureChains.Count;
                for (int i = 1; i <= count; i++)
                {
                    featureChain = Document.FeatureChains[i];
                    if (Operators.CompareString(featureChain.Layer.Name, "123", false) == 0)
                    {
                        break;
                    }
                }
                if (featureChain != null)
                {
                    int num = value;
                    Point point = default(Point);
                    int num2 = default(int);
                    int i;
                    for (i = 1; i <= num; i++)
                    {
                        point = FC1.PointAlong(length);
                        Point point2 = Document.GetPoint(point.X, point.Y + 10.0, point.Z);
                        Point point3 = Document.GetPoint(point.X, point.Y - 10.0, point.Z);
                        Intersection2.Calculate(Document.GetSegment(point3, point2), featureChain);
                        if (ptp[1] != null && Math.Abs(ptp[1].Y - point.Y) > 0.2)
                        {
                            num2 = i;
                            break;
                        }
                        length = (double)i * 0.1;
                    }
                    double num3 = (double)num2 * 0.1;
                    length = 0.0;
                    value = 0;
                    int count2 = FC1.Count;
                    for (i = 1; i <= count2; i++)
                    {
                        GraphicObject graphicObject = (GraphicObject)((IFeatureChain)FC1).get_Item(i);
                        if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                        {
                            seg = (Segment)graphicObject;
                            length = seg.Length + length;
                            value = 1;
                        }
                        if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                        {
                            Arc arc = (Arc)graphicObject;
                            length = arc.Length + length;
                            value = 2;
                        }
                        if (length > num3)
                        {
                            break;
                        }
                    }
                    do
                    {
                        GraphicObject graphicObject = (GraphicObject)((IFeatureChain)FC1).get_Item(i);
                        if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                        {
                            seg = (Segment)graphicObject;
                            array[1] = seg.Extremity(espExtremityType.espExtremityStart);
                            array[2] = seg.Extremity(espExtremityType.espExtremityEnd);
                            if (!(Math.Abs(array[1].X) > Math.Abs(array[2].X)))
                            {
                                array[1] = seg.Extremity(espExtremityType.espExtremityEnd);
                                array[2] = seg.Extremity(espExtremityType.espExtremityStart);
                            }
                        }
                        else if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                        {
                            Arc arc = (Arc)graphicObject;
                            array[1] = arc.Extremity(espExtremityType.espExtremityStart);
                            array[2] = arc.Extremity(espExtremityType.espExtremityEnd);
                            if (!(Math.Abs(array[1].X) > Math.Abs(array[2].X)))
                            {
                                array[1] = arc.Extremity(espExtremityType.espExtremityEnd);
                                array[2] = arc.Extremity(espExtremityType.espExtremityStart);
                            }
                        }
                        if (array[2].Y > array[1].Y)
                        {
                            break;
                        }
                        flag = true;
                        i--;
                    }
                    while (i != 0);
                    if (flag)
                    {
                        FC1.Reverse();
                        if (i != 0)
                        {
                            FC1.RemoveEnd(FC1.Count - i + 1);
                        }
                        Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                    else
                    {
                        Point p = FC1.PointAlong(num3 + 0.01);
                        FC1.Reverse();
                        if (num3 != 0.0)
                        {
                            FC1.RemoveEnd(FC1.Count - i + 1);
                            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                            switch (value)
                            {
                                case 1:
                                    if (point != null)
                                    {
                                        FC1.Add(point);
                                    }
                                    break;
                                case 2:
                                    {
                                        Point p2 = FC1.Extremity(espExtremityType.espExtremityEnd);
                                        Point p3 = point;
                                        Arc pIGraphicObject = GenerateArc3(p2, p, p3);
                                        FC1.Add(pIGraphicObject);
                                        break;
                                    }
                            }
                        }
                    }
                }
                Document.Layers.Remove("123");
            }
        }

        public static Arc GenerateArc3(Point P1, Point P2, Point P3)
        {
            //IL_0034: Unknown result type (might be due to invalid IL or missing references)
            //IL_003a: Expected O, but got Unknown
            //IL_0067: Unknown result type (might be due to invalid IL or missing references)
            //IL_006d: Expected O, but got Unknown
            //IL_009a: Unknown result type (might be due to invalid IL or missing references)
            //IL_00a0: Expected O, but got Unknown
            //IL_00d0: Unknown result type (might be due to invalid IL or missing references)
            //IL_00db: Expected O, but got Unknown
            ComPoint[] array = (ComPoint[])(object)new ComPoint[4]
            {
            default(ComPoint),
            (ComPoint)Document.GetPoint(P1.X, P1.Y, P1.Z),
            (ComPoint)Document.GetPoint(P2.X, P2.Y, P2.Z),
            (ComPoint)Document.GetPoint(P3.X, P3.Y, P3.Z)
            };
            Arc result = NewComArcToArc((ComArc)((GeoUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("53AB9AB1-52F3-4CAA-91AC-991BE20E3085")))).Arc3((ComGeoBase)array[1], (IComPoint)array[1], (ComGeoBase)array[2], (IComPoint)array[2], (ComGeoBase)array[3], (IComPoint)array[3]));
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
            return result;
        }

        public static Arc NewComArcToArc(ComArc ComArcObj, bool CreateVirtual = false)
        {
            ComArc val = ComArcObj;
            IComPoint centerPoint = ((IComArc)val).CenterPoint;
            Point point = Document.GetPoint(centerPoint.X, centerPoint.Y, centerPoint.Z);
            centerPoint = null;
            Arc arc = ((!CreateVirtual) ? Document.Arcs.Add(point, ((IComArc)val).Radius, ((IComArc)val).StartAngle, ((IComArc)val).EndAngle) : Document.GetArc(point, ((IComArc)val).Radius, ((IComArc)val).StartAngle, ((IComArc)val).EndAngle));
            IComVector u = ((IComArc)val).U;
            arc.Ux = u.X;
            arc.Uy = u.Y;
            arc.Uz = u.Z;
            u = null;
            IComVector v = ((IComArc)val).V;
            arc.Vx = v.X;
            arc.Vy = v.Y;
            arc.Vz = v.Z;
            v = null;
            val = null;
            return arc;
        }

        public static void PickupFinal()
        {
            int num = 1;
            int num3 = default(int);
            int num2;
            int num4;
            int num5;
            checked
            {
                do
                {
                    Matrix3[num] = Matrix1[num];
                    num++;
                }
                while (num <= 18);
                num = 1;
                do
                {
                    Matrix3[num + 18] = Matrix2[num];
                    num++;
                }
                while (num <= 18);
                num = 1;
                do
                {
                    num2 = 1;
                    do
                    {
                        if (Matrix3[num] >= Matrix3[num2])
                        {
                            num3++;
                        }
                        num2++;
                    }
                    while (num2 <= 36);
                    if (num3 == 36)
                    {
                        P[1] = num;
                    }
                    if (num3 == 35)
                    {
                        P[2] = num;
                    }
                    if (num3 == 34)
                    {
                        P[3] = num;
                    }
                    if (num3 == 33)
                    {
                        P[4] = num;
                    }
                    if (num3 == 32)
                    {
                        P[5] = num;
                    }
                    if (num3 == 31)
                    {
                        P[6] = num;
                    }
                    if (num3 == 30)
                    {
                        P[7] = num;
                    }
                    if (num3 == 29)
                    {
                        P[8] = num;
                    }
                    if (num3 == 28)
                    {
                        P[9] = num;
                    }
                    if (num3 == 27)
                    {
                        P[10] = num;
                    }
                    if (num3 == 26)
                    {
                        P[11] = num;
                    }
                    if (num3 == 25)
                    {
                        P[12] = num;
                    }
                    if (num3 == 24)
                    {
                        P[13] = num;
                    }
                    if (num3 == 23)
                    {
                        P[14] = num;
                    }
                    if (num3 == 22)
                    {
                        P[15] = num;
                    }
                    if (num3 == 21)
                    {
                        P[16] = num;
                    }
                    if (num3 == 20)
                    {
                        P[17] = num;
                    }
                    if (num3 == 19)
                    {
                        P[18] = num;
                    }
                    if (num3 == 18)
                    {
                        P[19] = num;
                    }
                    if (num3 == 17)
                    {
                        P[20] = num;
                    }
                    if (num3 == 16)
                    {
                        P[21] = num;
                    }
                    if (num3 == 15)
                    {
                        P[22] = num;
                    }
                    if (num3 == 14)
                    {
                        P[23] = num;
                    }
                    if (num3 == 13)
                    {
                        P[24] = num;
                    }
                    if (num3 == 12)
                    {
                        P[25] = num;
                    }
                    if (num3 == 11)
                    {
                        P[26] = num;
                    }
                    if (num3 == 10)
                    {
                        P[27] = num;
                    }
                    if (num3 == 9)
                    {
                        P[28] = num;
                    }
                    if (num3 == 8)
                    {
                        P[29] = num;
                    }
                    if (num3 == 7)
                    {
                        P[30] = num;
                    }
                    if (num3 == 6)
                    {
                        P[31] = num;
                    }
                    if (num3 == 5)
                    {
                        P[32] = num;
                    }
                    if (num3 == 4)
                    {
                        P[33] = num;
                    }
                    if (num3 == 3)
                    {
                        P[34] = num;
                    }
                    if (num3 == 2)
                    {
                        P[35] = num;
                    }
                    if (num3 == 1)
                    {
                        P[36] = num;
                    }
                    num3 = 0;
                    num++;
                }
                while (num <= 36);
                Q[1] = P[1];
                num = 2;
                do
                {
                    try
                    {
                        if (Math.Abs(P[num] - P[1]) >= Math.Abs(9))
                        {
                            if ((P[1] <= 9) & (P[num] >= 27))
                            {
                                if (Math.Abs(P[1] - (P[num] - 36)) >= 9)
                                {
                                    break;
                                }
                            }
                            else if (!((P[num] <= 9) & (P[1] >= 27)) || Math.Abs(P[num] - (P[1] - 36)) >= 9)
                            {
                                break;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        ProjectData.SetProjectError(ex);
                        Exception ex2 = ex;
                        ProjectData.ClearProjectError();
                    }
                    num++;
                }
                while (num <= 24);
                Q[2] = P[num];
                num3 = 3;
                do
                {
                    if ((Math.Abs(P[num3] - P[1]) >= 9) & (Math.Abs(P[num3] - P[num]) >= 9))
                    {
                        if ((P[1] <= 9) & (P[num3] >= 26))
                        {
                            if (Math.Abs(P[1] - (P[num3] - 36)) >= 9)
                            {
                                if ((P[num] <= 9) & (P[num3] >= 27))
                                {
                                    if (Math.Abs(P[num] - (P[num3] - 36)) >= 9)
                                    {
                                        break;
                                    }
                                }
                                else if (!((P[num3] <= 9) & (P[num] >= 27)) || Math.Abs(P[num3] - (P[num] - 36)) >= 9)
                                {
                                    break;
                                }
                            }
                        }
                        else
                        {
                            if (!((P[num3] <= 9) & (P[1] >= 27)))
                            {
                                break;
                            }
                            if (Math.Abs(P[num3] - (P[1] - 36)) >= 9)
                            {
                                if ((P[num] <= 9) & (P[num3] >= 27))
                                {
                                    if (Math.Abs(P[num] - (P[num3] - 36)) >= 9)
                                    {
                                        break;
                                    }
                                }
                                else if (!((P[num3] <= 9) & (P[num] >= 27)) || Math.Abs(P[num3] - (P[num] - 36)) >= 9)
                                {
                                    break;
                                }
                            }
                        }
                    }
                    num3++;
                }
                while (num3 <= 24);
                Q[3] = P[num3];
                num3 = 0;
                num2 = 0;
                num4 = 0;
                num5 = 0;
                num = 1;
                do
                {
                    if (Q[num] == 1)
                    {
                        num3++;
                    }
                    if (Q[num] == 19)
                    {
                        num2++;
                    }
                    if ((Q[num] == 0) | (Q[num] == 2))
                    {
                        num4++;
                    }
                    if ((Q[num] == 18) | (Q[num] == 20))
                    {
                        num5++;
                    }
                    num++;
                }
                while (num <= 3);
                AngType1 = 0;
                AngType2 = 0;
            }
            if (num3 == 1 && num2 == 1)
            {
                AngNumber = 3;
                return;
            }
            if (num3 == 1 && num2 == 0)
            {
                Q[4] = 19;
                AngNumber = 4;
                if (num5 == 1)
                {
                    AngType1 = 1;
                }
            }
            if (num3 == 0 && num2 == 1)
            {
                Q[4] = 1;
                AngNumber = 4;
                if (num4 == 1)
                {
                    AngType1 = 1;
                }
            }
            if (num3 == 0 && num2 == 0)
            {
                Q[4] = 1;
                Q[5] = 19;
                AngNumber = 5;
                if (num5 == 1)
                {
                    AngType2 = 1;
                }
                if (num4 == 1)
                {
                    AngType1 = 1;
                }
            }
        }

        private static void SearchSubNumberY(int Count, double Hvalue, int Th)
        {
            double num = Count;
            iLine = 1.0;
            Point point = default(Point);
            Point point2 = default(Point);
            while (iLine <= num)
            {
                GraphicObject graphicObject = checked((Th != 1) ? ((GraphicObject)((IFeatureChain)FC2).get_Item((int)Math.Round(iLine))) : ((GraphicObject)((IFeatureChain)FC1).get_Item((int)Math.Round(iLine))));
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                {
                    Arc obj = (Arc)graphicObject;
                    point = obj.Extremity(espExtremityType.espExtremityStart);
                    point2 = obj.Extremity(espExtremityType.espExtremityEnd);
                    Point point3 = obj.Extremity(espExtremityType.espExtremityMiddle);
                    if (point.X > point2.X)
                    {
                        double x = point2.X;
                        double y = point2.Y;
                        point2.X = point.X;
                        point2.Y = point.Y;
                        point.X = x;
                        point.Y = y;
                    }
                    if ((point3.Y < point.Y) & (point3.Y < point2.Y))
                    {
                        if (point.Y < point2.Y)
                        {
                            point.Y = point3.Y;
                        }
                        else
                        {
                            point2.Y = point3.Y;
                        }
                    }
                    else if ((point3.Y > point.Y) & (point3.Y > point2.Y))
                    {
                        if (point.Y > point2.Y)
                        {
                            point.Y = point3.Y;
                        }
                        else
                        {
                            point2.Y = point3.Y;
                        }
                    }
                }
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                {
                    Segment obj2 = (Segment)graphicObject;
                    point = obj2.Extremity(espExtremityType.espExtremityStart);
                    point2 = obj2.Extremity(espExtremityType.espExtremityEnd);
                    if (point.X > point2.X)
                    {
                        double x = point2.X;
                        double y = point2.Y;
                        point2.X = point.X;
                        point2.Y = point.Y;
                        point.X = x;
                        point.Y = y;
                    }
                }
                if (!((Hvalue >= point.Y) & (Hvalue <= point2.Y)) && !((Hvalue <= point.Y) & (Hvalue >= point2.Y)))
                {
                    iLine += 1.0;
                    continue;
                }
                break;
            }
        }

        private static void SearchSubNumberYy(int Count, double Hvalue, int Th)
        {
            double num = Count;
            double x2 = default(double);
            double y2 = default(double);
            double num2 = default(double);
            double num3 = default(double);
            for (iLine = 1.0; iLine <= num; iLine += 1.0)
            {
                GraphicObject graphicObject = (GraphicObject)((IFeatureChain)Fcc).get_Item(checked((int)Math.Round(iLine)));
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                {
                    Arc obj = (Arc)graphicObject;
                    Point point = obj.Extremity(espExtremityType.espExtremityStart);
                    Point point2 = obj.Extremity(espExtremityType.espExtremityEnd);
                    if (point.X > point2.X)
                    {
                        double x = point2.X;
                        double y = point2.Y;
                        x2 = point.X;
                        y2 = point.Y;
                        num2 = x;
                        num3 = y;
                    }
                }
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                {
                    Segment obj2 = (Segment)graphicObject;
                    Point point = obj2.Extremity(espExtremityType.espExtremityStart);
                    Point point2 = obj2.Extremity(espExtremityType.espExtremityEnd);
                    if (point.X > point2.X)
                    {
                        double x = point2.X;
                        double y3 = point2.Y;
                        x2 = point.X;
                        y2 = point.Y;
                        num2 = x;
                        num3 = y3;
                    }
                }
                if (RL == 1.0)
                {
                    if (((Hvalue > num3 && Hvalue <= y2) & (num2 > MoveSTL_Module.BackPointX)) || ((Hvalue < num3 && Hvalue >= y2) & (num2 > MoveSTL_Module.BackPointX)))
                    {
                        break;
                    }
                }
                else if (RL == 2.0 && (((Hvalue > num3 && Hvalue <= y2) & (x2 < MoveSTL_Module.BackPointX)) || ((Hvalue < num3 && Hvalue >= y2) & (x2 < MoveSTL_Module.BackPointX))))
                {
                    break;
                }
            }
        }

        private static void SearchSubNumber(int Count, double Hvalue, int Th)
        {
            double num = Count;
            iLine = 1.0;
            Point point = default(Point);
            Point point2 = default(Point);
            while (iLine <= num)
            {
                GraphicObject graphicObject = checked((Th != 1) ? ((GraphicObject)((IFeatureChain)FC2).get_Item((int)Math.Round(iLine))) : ((GraphicObject)((IFeatureChain)FC1).get_Item((int)Math.Round(iLine))));
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                {
                    Arc obj = (Arc)graphicObject;
                    point = obj.Extremity(espExtremityType.espExtremityStart);
                    point2 = obj.Extremity(espExtremityType.espExtremityEnd);
                    if (point.X > point2.X)
                    {
                        double x = point2.X;
                        double y = point2.Y;
                        point2.X = point.X;
                        point2.Y = point.Y;
                        point.X = x;
                        point.Y = y;
                    }
                }
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                {
                    Segment obj2 = (Segment)graphicObject;
                    point = obj2.Extremity(espExtremityType.espExtremityStart);
                    point2 = obj2.Extremity(espExtremityType.espExtremityEnd);
                    if (point.X > point2.X)
                    {
                        double x = point2.X;
                        double y = point2.Y;
                        point2.X = point.X;
                        point2.Y = point.Y;
                        point.X = x;
                        point.Y = y;
                    }
                }
                if (!((Hvalue > point.X) & (Hvalue <= point2.X)) && !((Hvalue < point.X) & (Hvalue >= point2.X)))
                {
                    iLine += 1.0;
                    continue;
                }
                break;
            }
        }

        public static void GenerateGeometry()
        {
            int try0000_dispatch = -1;
            int num2 = default(int);
            int num6 = default(int);
            int num = default(int);
            int num3 = default(int);
            int num5 = default(int);
            int num7 = default(int);
            int num8 = default(int);
            int num9 = default(int);
            int count = default(int);
            Arc arc = default(Arc);
            Point point = default(Point);
            Segment segment = default(Segment);
            Layer activeLayer = default(Layer);
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
                                num2 = 1;
                                num6 = 1;
                                goto IL_0004;
                            case 1363:
                                {
                                    num = num2;
                                    switch (num3)
                                    {
                                        case 1:
                                            break;
                                        default:
                                            goto end_IL_0000;
                                    }
                                    int num4 = unchecked(num + 1);
                                    num = 0;
                                    switch (num4)
                                    {
                                        case 1:
                                            break;
                                        case 2:
                                            goto IL_0004;
                                        case 3:
                                            goto IL_0032;
                                        case 4:
                                            goto IL_004c;
                                        case 5:
                                            goto IL_0069;
                                        case 6:
                                            goto IL_0070;
                                        case 7:
                                            goto IL_008b;
                                        case 8:
                                            goto IL_0094;
                                        case 9:
                                            goto IL_00af;
                                        case 10:
                                            goto IL_00bc;
                                        case 11:
                                            goto IL_00d0;
                                        case 12:
                                            goto IL_00dc;
                                        case 13:
                                            goto IL_00f7;
                                        case 14:
                                            goto IL_0113;
                                        case 15:
                                            goto IL_012c;
                                        case 16:
                                            goto IL_013b;
                                        case 17:
                                            goto IL_014f;
                                        case 18:
                                            goto IL_015b;
                                        case 19:
                                            goto IL_0176;
                                        case 20:
                                            goto IL_0192;
                                        case 21:
                                            goto IL_01ab;
                                        case 22:
                                            goto IL_01ba;
                                        case 23:
                                            goto IL_01d2;
                                        case 24:
                                            goto IL_01d8;
                                        case 25:
                                            goto IL_01f1;
                                        case 26:
                                            goto IL_020f;
                                        case 27:
                                            goto IL_022e;
                                        case 28:
                                            goto IL_0237;
                                        case 29:
                                            goto IL_0246;
                                        case 31:
                                            goto IL_0253;
                                        case 32:
                                            goto IL_025e;
                                        case 33:
                                            goto IL_026c;
                                        case 34:
                                            goto IL_0288;
                                        case 35:
                                            goto IL_02a8;
                                        case 36:
                                            goto IL_02c7;
                                        case 37:
                                            goto IL_02d4;
                                        case 38:
                                            goto IL_02f4;
                                        case 39:
                                            goto IL_0313;
                                        case 40:
                                            goto IL_0320;
                                        case 41:
                                            goto IL_032f;
                                        case 42:
                                            goto IL_0344;
                                        case 43:
                                            goto IL_0355;
                                        case 44:
                                            goto IL_0368;
                                        case 46:
                                            goto IL_0372;
                                        case 47:
                                            goto IL_0385;
                                        case 30:
                                        case 45:
                                        case 48:
                                            goto IL_038d;
                                        case 49:
                                            goto IL_03a4;
                                        case 50:
                                            goto IL_03bd;
                                        case 51:
                                            goto IL_03cc;
                                        case 53:
                                            goto IL_03d4;
                                        case 54:
                                            goto IL_03df;
                                        case 56:
                                            goto IL_03ff;
                                        case 55:
                                        case 57:
                                            goto end_IL_0000_2;
                                        case 52:
                                        case 59:
                                            goto IL_0440;
                                        default:
                                            goto end_IL_0000;
                                        case 58:
                                        case 60:
                                            goto end_IL_0000_3;
                                    }
                                    goto default;
                                }
                            IL_012c:
                                num2 = 15;
                                num5++;
                                goto IL_0135;
                            IL_0004:
                                num2 = 2;
                                EspritApp.Configuration.ConfigurationFeatureRecognition.Tolerance = 0.01 + 0.02 * (double)(num6 - 1);
                                goto IL_0032;
                            IL_0032:
                                num2 = 3;
                                EspritApp.Configuration.GapTolerance = 0.01;
                                goto IL_004c;
                            IL_004c:
                                num2 = 4;
                                Document.FeatureRecognition.CreatePartProfileShadow(SS1, Wp, espGraphicObjectReturnType.espSegmentsArcs);
                                goto IL_0069;
                            IL_0069:
                                ProjectData.ClearProjectError();
                                num3 = 1;
                                goto IL_0070;
                            IL_0070:
                                num2 = 6;
                                Ss = Document.SelectionSets["Temp"];
                                goto IL_008b;
                            IL_008b:
                                num2 = 7;
                                if (Ss == null)
                                {
                                    goto IL_0094;
                                }
                                goto IL_00af;
                            IL_0094:
                                num2 = 8;
                                Ss = Document.SelectionSets.Add("Temp");
                                goto IL_00af;
                            IL_00af:
                                num2 = 9;
                                Ss.RemoveAll();
                                goto IL_00bc;
                            IL_00bc:
                                num2 = 10;
                                num7 = Document.Segments.Count;
                                goto IL_00d0;
                            IL_00d0:
                                num2 = 11;
                                num8 = num7;
                                num5 = 1;
                                goto IL_0135;
                            IL_0135:
                                if (num5 <= num8)
                                {
                                    goto IL_00dc;
                                }
                                goto IL_013b;
                            IL_013b:
                                num2 = 16;
                                num7 = Document.Arcs.Count;
                                goto IL_014f;
                            IL_014f:
                                num2 = 17;
                                num9 = num7;
                                num5 = 1;
                                goto IL_01b4;
                            IL_01b4:
                                if (num5 <= num9)
                                {
                                    goto IL_015b;
                                }
                                goto IL_01ba;
                            IL_01ba:
                                num2 = 22;
                                Document.FeatureRecognition.CreateAutoChains(Ss);
                                goto IL_01d2;
                            IL_01d2:
                                num2 = 23;
                                num7 = 0;
                                goto IL_01d8;
                            IL_01d8:
                                num2 = 24;
                                count = Document.FeatureChains.Count;
                                num5 = 1;
                                goto IL_0240;
                            IL_0240:
                                if (num5 <= count)
                                {
                                    goto IL_01f1;
                                }
                                goto IL_0246;
                            IL_0246:
                                num2 = 29;
                                if (!MoveSTL_Module.NonConnection)
                                {
                                    goto IL_0253;
                                }
                                goto IL_038d;
                            IL_0253:
                                num2 = 31;
                                if (num7 == 1)
                                {
                                    goto IL_025e;
                                }
                                goto IL_038d;
                            IL_025e:
                                num2 = 32;
                                if (roughm == 1)
                                {
                                    goto IL_026c;
                                }
                                goto IL_0355;
                            IL_026c:
                                num2 = 33;
                                SearchSubNumberYy(Fcc.Count, 0.0, 2);
                                goto IL_0288;
                            IL_0288:
                                num2 = 34;
                                if (((IFeatureChain)Fcc).get_Item((int)Math.Round(iLine)).GraphicObjectType == espGraphicObjectType.espArc)
                                {
                                    goto IL_02a8;
                                }
                                goto IL_02d4;
                            IL_02a8:
                                num2 = 35;
                                arc = (Arc)((IFeatureChain)Fcc).get_Item((int)Math.Round(iLine));
                                goto IL_02c7;
                            IL_02c7:
                                num2 = 36;
                                point = arc.Extremity(espExtremityType.espExtremityMiddle);
                                goto IL_02d4;
                            IL_02d4:
                                num2 = 37;
                                if (((IFeatureChain)Fcc).get_Item((int)Math.Round(iLine)).GraphicObjectType == espGraphicObjectType.espSegment)
                                {
                                    goto IL_02f4;
                                }
                                goto IL_0320;
                            IL_02f4:
                                num2 = 38;
                                segment = (Segment)((IFeatureChain)Fcc).get_Item((int)Math.Round(iLine));
                                goto IL_0313;
                            IL_0313:
                                num2 = 39;
                                point = segment.Extremity(espExtremityType.espExtremityMiddle);
                                goto IL_0320;
                            IL_0320:
                                num2 = 40;
                                MidXc = point.X;
                                goto IL_032f;
                            IL_032f:
                                num2 = 41;
                                if (point.X < 0.5)
                                {
                                    goto IL_0344;
                                }
                                goto IL_0355;
                            IL_0344:
                                num2 = 42;
                                BtmY = -0.5;
                                goto IL_0355;
                            IL_0355:
                                num2 = 43;
                                if (Xmin == 50.0)
                                {
                                    goto IL_0368;
                                }
                                goto IL_0372;
                            IL_0368:
                                num2 = 44;
                                FindMinX();
                                goto IL_038d;
                            IL_0372:
                                num2 = 46;
                                if (Xmin == -50.0)
                                {
                                    goto IL_0385;
                                }
                                goto IL_038d;
                            IL_0385:
                                num2 = 47;
                                FindMinXNegtive();
                                goto IL_038d;
                            IL_038d:
                                num2 = 48;
                                Document.Layers.Remove("MillingGeoLayer");
                                goto IL_03a4;
                            IL_03a4:
                                num2 = 49;
                                activeLayer = Document.Layers.Add("MillingGeoLayer");
                                goto IL_03bd;
                            IL_03bd:
                                num2 = 50;
                                Document.ActiveLayer = activeLayer;
                                goto IL_03cc;
                            IL_03cc:
                                num2 = 51;
                                if (num7 <= 1)
                                {
                                    goto IL_03d4;
                                }
                                goto IL_0440;
                            IL_03d4:
                                num2 = 53;
                                if (roughm == 1)
                                {
                                    goto IL_03df;
                                }
                                goto IL_03ff;
                            IL_03df:
                                num2 = 54;
                                Document.FeatureRecognition.CreatePartProfileShadow(SS1, Wp, espGraphicObjectReturnType.espFeatureChains);
                                break;
                            IL_03ff:
                                num2 = 56;
                                Document.FeatureRecognition.CreatePartProfileShadow(SS1, Wp, espGraphicObjectReturnType.espSegmentsArcs);
                                break;
                            IL_0440:
                                num2 = 59;
                                num6++;
                                if (num6 > 6)
                                {
                                    goto end_IL_0000_3;
                                }
                                goto IL_0004;
                            IL_01f1:
                                num2 = 25;
                                Fcc = Document.FeatureChains[num5];
                                goto IL_020f;
                            IL_020f:
                                num2 = 26;
                                if (Operators.CompareString(Fcc.Layer.Name, "MillingGeoLayer", false) == 0)
                                {
                                    goto IL_022e;
                                }
                                goto IL_0237;
                            IL_022e:
                                num2 = 27;
                                num7++;
                                goto IL_0237;
                            IL_0237:
                                num2 = 28;
                                num5++;
                                goto IL_0240;
                            IL_015b:
                                num2 = 18;
                                arc = Document.Arcs[num5];
                                goto IL_0176;
                            IL_0176:
                                num2 = 19;
                                if (Operators.CompareString(arc.Layer.Name, "MillingGeoLayer", false) == 0)
                                {
                                    goto IL_0192;
                                }
                                goto IL_01ab;
                            IL_0192:
                                num2 = 20;
                                Ss.Add(arc, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_01ab;
                            IL_01ab:
                                num2 = 21;
                                num5++;
                                goto IL_01b4;
                            IL_00dc:
                                num2 = 12;
                                segment = Document.Segments[num5];
                                goto IL_00f7;
                            IL_00f7:
                                num2 = 13;
                                if (Operators.CompareString(segment.Layer.Name, "MillingGeoLayer", false) == 0)
                                {
                                    goto IL_0113;
                                }
                                goto IL_012c;
                            IL_0113:
                                num2 = 14;
                                Ss.Add(segment, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_012c;
                            end_IL_0000_2:
                                break;
                        }
                        num2 = 57;
                        Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                        break;
                    }
                end_IL_0000:;
                }
                catch (Exception ex) when (num3 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 1363;
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

        public static void FindMinX()
        {
            double num = Fcc.Length / 150.0;
            Xmin = 20.0;
            int num2 = 1;
            do
            {
                Point point = Fcc.PointAlong(num * (double)num2);
                if (point != null && Xmin >= point.X)
                {
                    Xmin = point.X;
                    YWant = point.Y;
                }
                num2 = checked(num2 + 1);
            }
            while (num2 <= 148);
            if (YWant >= 0.0)
            {
                YWant = 0.0;
            }
        }

        public static void FindMinXNegtive()
        {
            double num = Fcc.Length / 150.0;
            Xmin = -20.0;
            long num2 = 1L;
            do
            {
                Point point = Fcc.PointAlong(num * (double)num2);
                if (point != null && Xmin <= point.X)
                {
                    Xmin = point.X;
                    YWant = point.Y;
                }
                num2 = checked(num2 + 1);
            }
            while (num2 <= 148);
            if (YWant >= 0.0)
            {
                YWant = 0.0;
            }
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void CompareArea()
        {
            FeatureChain featureChain = null;
            FeatureChain featureChain2 = null;
            int count = Document.FeatureChains.Count;
            checked
            {
                for (int i = 1; i <= count; i++)
                {
                    if (Operators.CompareString(Document.FeatureChains[i].Name, "TopChain", false) == 0)
                    {
                        featureChain2 = Document.FeatureChains[i];
                    }
                    if (Operators.CompareString(Document.FeatureChains[i].Name, "BottomChain", false) == 0)
                    {
                        featureChain = Document.FeatureChains[i];
                    }
                }
                if (featureChain2 == null)
                {
                    Matrix1[n + 1] = 0.0;
                }
                else
                {
                    Matrix1[n + 1] = FC1.Area - featureChain2.Area;
                    Document.FeatureChains.Remove(featureChain2.Key);
                }
                if (featureChain == null)
                {
                    Matrix2[n + 1] = 0.0;
                    return;
                }
                Matrix2[n + 1] = FC2.Area - featureChain.Area;
                Document.FeatureChains.Remove(featureChain.Key);
            }
        }

        public static void HandleFeature()
        {
            Point point = Document.GetPoint(-20, 0, 0);
            FeatureChain featureChain = Document.FeatureChains.Add(point);
            point = Document.GetPoint(20, 0, 0);
            featureChain.Add(point);
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
            Ss = Document.SelectionSets["Temp"];
            if (Ss == null)
            {
                Ss = Document.SelectionSets.Add("Temp");
            }
            Ss.RemoveAll();
            int count = Document.Segments.Count;
            checked
            {
                for (int i = 1; i <= count && i <= Document.Segments.Count; i++)
                {
                    Segment segment = Document.Segments[i];
                    Point point2 = segment.Extremity(espExtremityType.espExtremityStart);
                    Point point3 = segment.Extremity(espExtremityType.espExtremityEnd);
                    if (Operators.CompareString(segment.Layer.Name, "MillingGeoLayer", false) == 0 && (((point2.Y < 0.0) & (point3.Y > 0.0) & (Math.Abs(point2.X) < Math.Abs(MoveSTL_Module.BackPointX)) & (Math.Abs(point3.X) < Math.Abs(MoveSTL_Module.BackPointX))) | ((point2.Y > 0.0) & (point3.Y < 0.0) & (Math.Abs(point2.X) < Math.Abs(MoveSTL_Module.BackPointX)) & (Math.Abs(point3.X) < Math.Abs(MoveSTL_Module.BackPointX)))))
                    {
                        Intersection2.Calculate(segment, featureChain);
                        Document.Segments.Add(ptp[1], segment.Extremity(espExtremityType.espExtremityStart));
                        Document.Segments.Add(ptp[1], segment.Extremity(espExtremityType.espExtremityEnd));
                        Document.Segments.Remove(segment.Key);
                        Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                        i = 0;
                    }
                }
                Document.FeatureChains.Remove(featureChain.Key);
                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                Layer activeLayer = Document.Layers.Add("MyLayer");
                Document.ActiveLayer = activeLayer;
                int count2 = Document.Segments.Count;
                if (RL == 1.0)
                {
                    int num = count2;
                    for (int i = 1; i <= num; i++)
                    {
                        Segment segment = Document.Segments[i];
                        if (Operators.CompareString(segment.Layer.Name, "MillingGeoLayer", false) == 0)
                        {
                            Point point2 = segment.Extremity(espExtremityType.espExtremityStart);
                            Point point3 = segment.Extremity(espExtremityType.espExtremityEnd);
                            if ((point2.Y >= 0.0) & (point3.Y >= 0.0) & ((point2.X < MoveSTL_Module.BackPointX) & (point3.X < MoveSTL_Module.BackPointX)))
                            {
                                Ss.Add(segment, RuntimeHelpers.GetObjectValue(Missing.Value));
                            }
                            if (((point2.Y < 0.0) & (point3.Y > 0.0) & (point2.X < MoveSTL_Module.BackPointX) & (point3.X < MoveSTL_Module.BackPointX)) | ((point2.Y > 0.0) & (point3.Y < 0.0) & (point2.X < MoveSTL_Module.BackPointX) & (point3.X < MoveSTL_Module.BackPointX)))
                            {
                                MidX = point2.X - (point3.X - point2.X) * point2.Y / (point3.Y - point2.Y);
                            }
                        }
                    }
                }
                else if (RL == 2.0)
                {
                    int num2 = count2;
                    for (int i = 1; i <= num2; i++)
                    {
                        Segment segment = Document.Segments[i];
                        if (Operators.CompareString(segment.Layer.Name, "MillingGeoLayer", false) == 0)
                        {
                            Point point2 = segment.Extremity(espExtremityType.espExtremityStart);
                            Point point3 = segment.Extremity(espExtremityType.espExtremityEnd);
                            if ((point2.Y >= 0.0) & (point3.Y >= 0.0) & ((point2.X > MoveSTL_Module.BackPointX) & (point3.X > MoveSTL_Module.BackPointX)))
                            {
                                Ss.Add(segment, RuntimeHelpers.GetObjectValue(Missing.Value));
                            }
                            if (((point2.Y < 0.0) & (point3.Y > 0.0) & (point2.X > MoveSTL_Module.BackPointX) & (point3.X > MoveSTL_Module.BackPointX)) | ((point2.Y > 0.0) & (point3.Y < 0.0) & (point2.X > MoveSTL_Module.BackPointX) & (point3.X > MoveSTL_Module.BackPointX)))
                            {
                                MidX = point2.X - (point3.X - point2.X) * point2.Y / (point3.Y - point2.Y);
                            }
                        }
                    }
                }
                count2 = Document.Arcs.Count;
                if (RL == 1.0)
                {
                    int num3 = count2;
                    for (int i = 1; i <= num3; i++)
                    {
                        Arc arc = Document.Arcs[i];
                        if (Operators.CompareString(arc.Layer.Name, "MillingGeoLayer", false) == 0)
                        {
                            Point point2 = arc.Extremity(espExtremityType.espExtremityStart);
                            Point point3 = arc.Extremity(espExtremityType.espExtremityEnd);
                            if ((point2.Y >= 0.0) & (point3.Y >= 0.0) & ((point2.X < MoveSTL_Module.BackPointX) & (point3.X < MoveSTL_Module.BackPointX)))
                            {
                                Ss.Add(arc, RuntimeHelpers.GetObjectValue(Missing.Value));
                            }
                            if (((point2.Y < 0.0) & (point3.Y > 0.0) & (point2.X < MoveSTL_Module.BackPointX) & (point3.X < MoveSTL_Module.BackPointX)) | ((point2.Y > 0.0) & (point3.Y < 0.0) & (point2.X < MoveSTL_Module.BackPointX) & (point3.X < MoveSTL_Module.BackPointX)))
                            {
                                MidX = point2.X - (point3.X - point2.X) * point2.Y / (point3.Y - point2.Y);
                            }
                        }
                    }
                }
                else if (RL == 2.0)
                {
                    int num4 = count2;
                    for (int i = 1; i <= num4; i++)
                    {
                        Arc arc = Document.Arcs[i];
                        if (Operators.CompareString(arc.Layer.Name, "MillingGeoLayer", false) == 0)
                        {
                            Point point2 = arc.Extremity(espExtremityType.espExtremityStart);
                            Point point3 = arc.Extremity(espExtremityType.espExtremityEnd);
                            if ((point2.Y >= 0.0) & (point3.Y >= 0.0) & ((point2.X > MoveSTL_Module.BackPointX) & (point3.X > MoveSTL_Module.BackPointX)))
                            {
                                Ss.Add(arc, RuntimeHelpers.GetObjectValue(Missing.Value));
                            }
                            if (((point2.Y < 0.0) & (point3.Y > 0.0) & (point2.X > MoveSTL_Module.BackPointX) & (point3.X > MoveSTL_Module.BackPointX)) | ((point2.Y > 0.0) & (point3.Y < 0.0) & (point2.X > MoveSTL_Module.BackPointX) & (point3.X > MoveSTL_Module.BackPointX)))
                            {
                                MidX = point2.X - (point3.X - point2.X) * point2.Y / (point3.Y - point2.Y);
                            }
                        }
                    }
                }
                Document.FeatureRecognition.CreateAutoChains(Ss);
                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                FeatureChain featureChain2 = null;
                int count3 = Document.FeatureChains.Count;
                for (int i = 1; i <= count3; i++)
                {
                    featureChain2 = Document.FeatureChains[i];
                    if (Operators.CompareString(featureChain2.Layer.Name, "MyLayer", false) == 0)
                    {
                        if (featureChain2.Length >= 2.0)
                        {
                            break;
                        }
                    }
                    else
                    {
                        featureChain2 = null;
                    }
                }
                if (featureChain2 != null)
                {
                    featureChain2.Name = "TopChain";
                    featureChain2.Layer = Document.Layers["RoughMillingLayer"];
                    Point point2 = featureChain2.Extremity(espExtremityType.espExtremityStart);
                    Point point3 = featureChain2.PointAlong(0.2);
                    if (Math.Abs(point3.X) > Math.Abs(point2.X))
                    {
                        featureChain2.Reverse();
                    }
                    point2 = featureChain2.Extremity(espExtremityType.espExtremityStart);
                    featureChain2.Add(point2);
                    featureChain2 = null;
                    Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                    Ss.RemoveAll();
                    count2 = Document.Segments.Count;
                    if (RL == 1.0)
                    {
                        int num5 = count2;
                        for (int i = 1; i <= num5; i++)
                        {
                            Segment segment = Document.Segments[i];
                            if (Operators.CompareString(segment.Layer.Name, "MillingGeoLayer", false) == 0)
                            {
                                point2 = segment.Extremity(espExtremityType.espExtremityStart);
                                point3 = segment.Extremity(espExtremityType.espExtremityEnd);
                                if ((point2.Y <= 0.0) & (point3.Y <= 0.0) & ((point2.X < MoveSTL_Module.BackPointX) & (point3.X < MoveSTL_Module.BackPointX)))
                                {
                                    Ss.Add(segment, RuntimeHelpers.GetObjectValue(Missing.Value));
                                }
                            }
                        }
                    }
                    else if (RL == 2.0)
                    {
                        int num6 = count2;
                        for (int i = 1; i <= num6; i++)
                        {
                            Segment segment = Document.Segments[i];
                            if (Operators.CompareString(segment.Layer.Name, "MillingGeoLayer", false) == 0)
                            {
                                point2 = segment.Extremity(espExtremityType.espExtremityStart);
                                point3 = segment.Extremity(espExtremityType.espExtremityEnd);
                                if ((point2.Y <= 0.0) & (point3.Y <= 0.0) & ((point2.X > MoveSTL_Module.BackPointX) & (point3.X > MoveSTL_Module.BackPointX)))
                                {
                                    Ss.Add(segment, RuntimeHelpers.GetObjectValue(Missing.Value));
                                }
                            }
                        }
                    }
                    count2 = Document.Arcs.Count;
                    if (RL == 1.0)
                    {
                        int num7 = count2;
                        for (int i = 1; i <= num7; i++)
                        {
                            Arc arc = Document.Arcs[i];
                            if (Operators.CompareString(arc.Layer.Name, "MillingGeoLayer", false) == 0)
                            {
                                point2 = arc.Extremity(espExtremityType.espExtremityStart);
                                point3 = arc.Extremity(espExtremityType.espExtremityEnd);
                                if ((point2.Y <= 0.0) & (point3.Y <= 0.0) & ((point2.X < MoveSTL_Module.BackPointX) & (point3.X < MoveSTL_Module.BackPointX)))
                                {
                                    Ss.Add(arc, RuntimeHelpers.GetObjectValue(Missing.Value));
                                }
                            }
                        }
                    }
                    else if (RL == 2.0)
                    {
                        int num8 = count2;
                        for (int i = 1; i <= num8; i++)
                        {
                            Arc arc = Document.Arcs[i];
                            if (Operators.CompareString(arc.Layer.Name, "MillingGeoLayer", false) == 0)
                            {
                                point2 = arc.Extremity(espExtremityType.espExtremityStart);
                                point3 = arc.Extremity(espExtremityType.espExtremityEnd);
                                if ((point2.Y <= 0.0) & (point3.Y <= 0.0) & ((point2.X > MoveSTL_Module.BackPointX) & (point3.X > MoveSTL_Module.BackPointX)))
                                {
                                    Ss.Add(arc, RuntimeHelpers.GetObjectValue(Missing.Value));
                                }
                            }
                        }
                    }
                    Document.FeatureRecognition.CreateAutoChains(Ss);
                    Ss.RemoveAll();
                    Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                    featureChain2 = null;
                    int count4 = Document.FeatureChains.Count;
                    for (int i = 1; i <= count4; i++)
                    {
                        featureChain2 = Document.FeatureChains[i];
                        if (Operators.CompareString(featureChain2.Layer.Name, "MyLayer", false) == 0)
                        {
                            if (featureChain2.Length >= 2.0)
                            {
                                break;
                            }
                        }
                        else
                        {
                            featureChain2 = null;
                        }
                    }
                    if (featureChain2 != null)
                    {
                        featureChain2.Name = "BottomChain";
                        featureChain2.Layer = Document.Layers["RoughMillingLayer"];
                        point2 = featureChain2.Extremity(espExtremityType.espExtremityStart);
                        point3 = featureChain2.PointAlong(0.2);
                        if (Math.Abs(point3.X) > Math.Abs(point2.X))
                        {
                            featureChain2.Reverse();
                        }
                        point2 = featureChain2.Extremity(espExtremityType.espExtremityStart);
                        featureChain2.Add(point2);
                        Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                    }
                }
                Document.Layers.Remove("MyLayer");
                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
            }
        }

        private static void EspritApp_AfterDocumentOpen(string FileName)
        {
            Document = EspritApp.Document;
        }

        private static void EspritApp_AfterNewDocumentOpen()
        {
            Document = EspritApp.Document;
        }

        private static void EspritApp_AfterTemplateOpen(string FileName)
        {
            Document = EspritApp.Document;
        }

#pragma warning restore CS0162, CS0649
    }
}
