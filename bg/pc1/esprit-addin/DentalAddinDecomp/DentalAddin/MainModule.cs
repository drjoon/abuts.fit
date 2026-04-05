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

    [StandardModule]
    internal sealed partial class MainModule
    {
        [CompilerGenerated]
        [AccessedThroughProperty("EspritApp")]
        private static Application _EspritApp;

        public static Document Document;

        public static double[] NumData = new double[7];

        public static int[] NumCombobox = new int[7];

        public static string[] PrcFileName = new string[13];

        public static string[] PrcFilePath = new string[13];

        public static string PrcDirectory = EnsureTrailingSeparator(AppConfig.AddInRootDirectory);

        public static string DefaultXmlFileName = Path.Combine(AppConfig.AddInRootDirectory, "Viles", "DefaultPath", "Tech_Default_Path.xml");

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

        public static Plane GetOrCreatePlane(string name, params string[] alternateNames)
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
                double preferredRl = SpindleSide ? 2.0 : 1.0;
                if (RL != 1.0 && RL != 2.0)
                {
                    RL = preferredRl;
                    DentalLogger.Log($"Main - RL 기본값 보정 (SpindleSide:{SpindleSide}, RL:{RL})");
                }

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
                                            goto IL_007f;
                                        case 8:
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
                    Layer activeLayer = GetOrCreateLayer("RoughFreeFormLayer");
                    if (activeLayer == null)
                    {
                        DentalLogger.Log("Roughworkplane 중단 - RoughFreeFormLayer 레이어 생성/조회 실패");
                        return;
                    }
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

            if (TryRunComposite2SplitAB(freeFormFeature))
            {
                return;
            }
            string file = PrcFilePath[11];
            DentalLogger.Log($"Composite2 - OpenProcess: PRC[11]={file}");
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
            double rightOffset = (AppConfig.DefaultRightRatioOffset > 0.0) ? 0.0 : AppConfig.DefaultRightRatioOffset;
            double backXForComposite = MoveSTL_Module.BackPointX + rightOffset;
            double rightRatio = backXForComposite / 20.0;
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
            DentalLogger.Log($"Composite2 - PassPercent 계산: First={firstPercent:F2}%(X:{firstX:F3}), Last={lastPercent:F2}%(X:{lastX:F3}), Span:{absSpan:F3}, BackPointX:{MoveSTL_Module.BackPointX:F3}, RightOffsetUsed:{rightOffset:F3}");

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