using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Esprit;
using EspritConstants;
using EspritTechnology;
using EspritGeometry;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject
{
    public static class DentalPipeline
    {
        // DentalAddin 전역 변수들 (MainModule.cs에서 추출 및 통합)
        public static double Chamfer = ProcessConfig.DefaultChamfer;
        public static double DownZ = ProcessConfig.DefaultDownZ;
        public static double TurningExtend = ProcessConfig.DefaultTurningExtend;
        public static double TurningDepth = ProcessConfig.DefaultTurningDepth;
        public static double MillingDepth = ProcessConfig.DefaultMillingDepth;
        public static double ExtendMill = ProcessConfig.DefaultExtendMill;
        public static double LowerY;
        public static int TurningTimes;
        public static double EndX;
        public static double EndY;
        public static double EndXValue;
        public static double ExtendX;
        public static FeatureChain tfc;
        public static double XT;
        public static double ZT;
        public static double Ang;
        public static int n;
        public static double Xmin;
        public static double YWant;
        public static FeatureChain FC1;
        public static FeatureChain FC2;
        public static SelectionSet SS1;
        public static Plane Wp;
        public static Segment seg;

        private static Application EspritApp => Connect.EspritApp;
        private static Document Document => Connect.Document;

        public static void Run(bool spindleSide, double roughType, string stlFilePath = null)
        {
            try
            {
                Trace.WriteLine("[AbutsFitAddin] Pipeline started.");

                bool reverseOn = ProcessConfig.DefaultReverseOn;
                
                // 1. 초기화 (Clean)
                Clean();

                // 2. STL 파일 병합 직후 Y축 -90도 회전
                RotateSTLInitial();
                
                // 3. STL 정렬 및 이동 (MoveSTL)
                RotateSTL(spindleSide);
                MoveSTL(spindleSide);
                
                // 4. 바운더리 생성 (Boundry)
                Boundry(spindleSide, roughType);
                
                // 4. 터닝 피처 생성 (Turning)
                TurningMain(spindleSide);
                
                // 5. 밀링 가공 (Milling)
                if (roughType == 1.0)
                {
                    MillingStart(spindleSide);
                }

                // 6. 기본 공정(Operation) 생성 시도 (prc 기반)
                TryAddDefaultOperations(reverseOn);

                // 6. NC 코드 생성
                if (!string.IsNullOrEmpty(stlFilePath))
                {
                    GenerateNCCode(stlFilePath);
                }

                // 7. 정리 (Operations, Features, STL 삭제) - 요청으로 일시 비활성화
                // CleanupAfterProcessing();
                

                
                Trace.WriteLine("[AbutsFitAddin] Pipeline completed successfully.");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[AbutsFitAddin] Pipeline failed: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 기본 공정(Operation) 생성: 설정된 prc 파일을 로드해 현재 FeatureChains에 매핑
        /// </summary>
        private static void TryAddDefaultOperations(bool reverseOn)
        {
            try
            {
                string techDir = ProcessConfig.TechRootDirectory;
                if (string.IsNullOrEmpty(techDir) || !Directory.Exists(techDir))
                {
                    Trace.WriteLine($"[TryAddDefaultOperations] Technology directory not found: {techDir}");
                    return;
                }

                var boundry1 = FindFeatureChain(ProcessConfig.Boundry1Name);
                var turning = FindFeatureChain(ProcessConfig.TurningName);
                // RoughMill1~5 패턴 찾기 (원본 DentalAddin 로직)
                var roughMill1List = FindFeatureChainsByPrefix("RoughMill1");
                var roughMill2List = FindFeatureChainsByPrefix("RoughMill2");
                var roughMill3List = FindFeatureChainsByPrefix("RoughMill3");
                var roughMill4List = FindFeatureChainsByPrefix("RoughMill4");
                var roughMill5List = FindFeatureChainsByPrefix("RoughMill5");
                var allRoughList = roughMill1List.Concat(roughMill2List).Concat(roughMill3List).Concat(roughMill4List).Concat(roughMill5List).ToList();

                // TurningProfile 패턴 찾기 (TurningOp 대응)
                var turningProfiles = FindFeatureChainsByPrefix("TurningProfile");
                var allTurningTargets = new List<FeatureChain> { turning }.Concat(turningProfiles).Where(x => x != null).ToList();

                // FeatureChain 패턴 찾기
                var angleFeatures = FindFeatureChainsByPattern("FeatureChain"); // "0 FeatureChain", "1 FeatureChain" 등

                var targets = new List<(string prcName, IEnumerable<FeatureChain> fcs, bool active)>
                {
                    // PrcFilePath[1] = Turning
                    (ProcessConfig.TurningProcessFile, allTurningTargets, true),
                    // PrcFilePath[2] = Reverse Turning (ReverseOn일 때만)
                    (ProcessConfig.ReverseTurningProcessFile, allTurningTargets, reverseOn),
                    // PrcFilePath[3] = RoughMill (모든 RoughMill1~5)
                    (ProcessConfig.RoughMillingProcessFile, allRoughList, true),
                    // PrcFilePath[4] = CustomCycle (FaceDrill) - null FeatureChain
                    (ProcessConfig.FaceHoleProcessFile, new FeatureChain[] { null }, true),
                    // PrcFilePath[5] = 0-180 BallMilling
                    (ProcessConfig.O180BallMillingProcessFile, allRoughList, true),
                    // PrcFilePath[6] = 90-270 BallMilling
                    (ProcessConfig.O90_270BallMillingProcessFile, allRoughList, true),
                    // PrcFilePath[8] = CustomCycle2 (EndTurning) - null FeatureChain
                    (ProcessConfig.ConnectionProcessFile, new FeatureChain[] { null }, true),
                    // PrcFilePath[9] = OP36 (SemiRough) - angle features
                    (ProcessConfig.SemiRoughMillingProcessFile, angleFeatures, true),
                    // PrcFilePath[10] = 5axis Composite
                    (ProcessConfig.CompositeProcessFile, allRoughList, true)
                };

                Trace.WriteLine($"[TryAddDefaultOperations] Tech root: {techDir}, FeatureChains={Document.FeatureChains.Count}, reverseOn={reverseOn}");

                int addedOps = 0;

                foreach (var t in targets)
                {
                    if (!t.active)
                    {
                        Trace.WriteLine($"[TryAddDefaultOperations] Skip {t.prcName} - not active (reverseOn={reverseOn})");
                        continue;
                    }
                    if (string.IsNullOrWhiteSpace(t.prcName)) continue;
                    var prcPath = ResolvePrcPath(techDir, t.prcName);
                    if (string.IsNullOrEmpty(prcPath))
                    {
                        Trace.WriteLine($"[TryAddDefaultOperations] prc not found: {t.prcName}");
                        continue;
                    }

                    var fcList = t.fcs.ToList();
                    if (fcList.Count == 0)
                    {
                        Trace.WriteLine($"[TryAddDefaultOperations] Skip {t.prcName} ({prcPath}) - no target FeatureChain");
                        continue;
                    }
                    var targetNames = string.Join(",", fcList.Select(f => f?.Name ?? "null"));
                    Trace.WriteLine($"[TryAddDefaultOperations] Using {t.prcName} ({prcPath}), targets: {targetNames}");

                    foreach (var fc in fcList)
                    {
                        try
                        {
                            var util = new TechnologyUtilityClass();
                            object result = null;
                            try {
                                result = util.OpenProcess(prcPath);
                            } catch (Exception openEx) {
                                Trace.WriteLine($"[TryAddDefaultOperations] OpenProcess CRASHED for {prcPath}: {openEx.Message}");
                                continue;
                            }

                            if (result == null)
                            {
                                Trace.WriteLine($"[TryAddDefaultOperations] OpenProcess returned null for {prcPath}");
                                continue;
                            }

                            IEnumerable techs;
                            if (result is IEnumerable en) techs = en;
                            else techs = new[] { result };

                            foreach (var techObj in techs)
                            {
                                if (techObj is ITechnology tech)
                                {
                                    try
                                    {
                                        // FeatureChain이 없을 경우 두 번째 인자는 명시적 null (IGraphicObject)로 전달
                                        IGraphicObject fcObj = fc as IGraphicObject;
                                        string fcName = fc?.Name ?? "null";
                                        Document.Operations.Add(tech, fcObj, Type.Missing);
                                        Trace.WriteLine($"[TryAddDefaultOperations] Added operation from {prcPath} on {fcName}");
                                        addedOps++;
                                    }
                                    catch (Exception opEx)
                                    {
                                        string fcName = fc?.Name ?? "null";
                                        Trace.WriteLine($"[TryAddDefaultOperations] Failed to Add operation {prcPath} on {fcName}: {opEx.Message}");
                                    }
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Trace.WriteLine($"[TryAddDefaultOperations] Failed to add operation {prcPath}: {ex.Message}");
                        }
                    }
                }

                Trace.WriteLine($"[TryAddDefaultOperations] Summary: added {addedOps} operations, total Operations={Document.Operations.Count}");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[TryAddDefaultOperations] Error: {ex.Message}");
            }
        }

        private static void EnsureToolExists(ITechnology tech)
        {
            // 임의 공구 생성 로직 제거 (사용자 요청)
        }

        private static FeatureChain FindFeatureChain(string name)
        {
            foreach (FeatureChain fc in Document.FeatureChains)
            {
                if (string.Equals(fc.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    return fc;
                }
            }
            return null;
        }

        private static List<FeatureChain> FindFeatureChainsByPrefix(string prefix)
        {
            var list = new List<FeatureChain>();
            foreach (FeatureChain fc in Document.FeatureChains)
            {
                if (fc.Name != null && fc.Name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    list.Add(fc);
                }
            }
            return list;
        }

        private static List<FeatureChain> FindFeatureChainsByPattern(string pattern)
        {
            var result = new List<FeatureChain>();
            foreach (FeatureChain fc in Document.FeatureChains)
            {
                if (fc.Name != null && fc.Name.Contains(pattern))
                {
                    result.Add(fc);
                }
            }
            return result;
        }

        private static string ResolvePrcPath(string rootDir, string targetFileName)
        {
            try
            {
                var files = Directory.GetFiles(rootDir, "*.prc", SearchOption.AllDirectories);
                foreach (var f in files)
                {
                    if (string.Equals(Path.GetFileName(f), targetFileName, StringComparison.OrdinalIgnoreCase))
                    {
                        return f;
                    }
                }
                return null;
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[ResolvePrcPath] Error: {ex.Message}");
                return null;
            }
        }

        public static void Clean()
        {
            try
            {
                // FeatureChains 삭제
                while (Document.FeatureChains.Count > 0)
                {
                    Document.FeatureChains.Remove(1);
                }

                // 관련 레이어 삭제
                string[] layersToCleanup = { 
                    ProcessConfig.BoundryLayerName, ProcessConfig.TurningLayerName, 
                    ProcessConfig.RoughMillingLayerName, "RotateCenter", 
                    "GeoTemp", "FreeFormLayer", "FaceDrill", "TurnOperation", 
                    "RoughMillingOperation", "FreeFormMill", "EndTurning" 
                };

                foreach (string layerName in layersToCleanup)
                {
                    try { Document.Layers.Remove(layerName); } catch { }
                }
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[Clean] Error: {ex.Message}");
            }
        }

        public static void RotateSTL(bool spindleSide)
        {
            try
            {
                SelectionSet sel = GetOrCreateSelectionSet("TempAlign");
                sel.RemoveAll();

                foreach (GraphicObject obj in Document.GraphicsCollection)
                {
                    if (obj.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        sel.Add(obj, Type.Missing);
                        break;
                    }
                }

                if (sel.Count == 0) return;

                // 원본 MoveSTL_Module.RotateSTL() 로직 반영
                // XYZ 평면에서 프로파일 분석을 통해 STL 방향 감지
                try { Document.Layers.Remove("Temp"); } catch { }
                Document.Layers.Add("Temp");
                Document.ActiveLayer = Document.Layers["Temp"];

                Document.FeatureRecognition.CreatePartProfileCrossSection(sel, Document.Planes["XYZ"], 
                    espGraphicObjectReturnType.espFeatureChains, false);
                
                FeatureChain profileFC = null;
                int maxArea = -1000;
                int maxAreaIndex = -1;
                
                for (int i = 1; i <= Document.FeatureChains.Count; i++)
                {
                    FeatureChain fc = Document.FeatureChains[i];
                    if (fc.IsClosed && fc.Area > maxArea)
                    {
                        maxArea = (int)Math.Round(fc.Area);
                        maxAreaIndex = i;
                    }
                }

                if (maxAreaIndex > 0)
                {
                    profileFC = Document.FeatureChains[maxAreaIndex];
                    double minX = 1000, maxX = -1000;
                    
                    for (double d = 0; d <= profileFC.Length; d += 0.1)
                    {
                        Point p = profileFC.PointAlong(d);
                        if (p.X < minX) minX = p.X;
                        if (p.X > maxX) maxX = p.X;
                    }

                    // 회전 필요 여부 판단
                    bool needRotate = false;
                    if (minX < 0 && maxX > 0) needRotate = true;

                    Document.Layers.Remove("Temp");

                    if (needRotate)
                    {
                        // Y축 기준 회전 (원본 로직에서는 Z축 또는 Y축 기준 회전)
                        Point p0 = Document.GetPoint(0, 0, 0);
                        Point pZ = Document.GetPoint(0, 0, 1);
                        Segment zAxis = Document.GetSegment(p0, pZ);
                        
                        if (spindleSide)
                        {
                            sel.Rotate(zAxis, Math.PI / 2.0, Type.Missing);
                        }
                        else
                        {
                            sel.Rotate(zAxis, -Math.PI / 2.0, Type.Missing);
                        }
                        
                        Trace.WriteLine($"[RotateSTL] STL rotated for alignment, spindleSide={spindleSide}");
                    }
                }
                else
                {
                    try { Document.Layers.Remove("Temp"); } catch { }
                }
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[RotateSTL] Error: {ex.Message}");
            }
        }

        public static void MoveSTL(bool spindleSide)
        {
            try
            {
                SelectionSet sel = GetOrCreateSelectionSet("TempMove");
                sel.RemoveAll();

                foreach (GraphicObject obj in Document.GraphicsCollection)
                {
                    if (obj.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        sel.Add(obj, Type.Missing);
                        break;
                    }
                }

                if (sel.Count == 0) return;

                // 원본 MoveSTL_Module.MoveSTL() 로직 반영
                Document.FeatureRecognition.CreatePartProfileShadow(sel, Document.Planes["XYZ"], espGraphicObjectReturnType.espFeatureChains);
                FeatureChain fc = Document.FeatureChains[Document.FeatureChains.Count];
                
                double bboxLen = fc.BoundingBoxLength;
                double minX = 9999999, maxX = -9999999;
                
                for (double d = 0; d <= fc.Length; d += 0.01)
                {
                    Point p = fc.PointAlong(d);
                    if (p.X < minX) minX = p.X;
                    if (p.X > maxX) maxX = p.X;
                }

                // 원본 로직: spindleSide에 따라 다른 이동
                if (spindleSide)
                {
                    // Back Spindle: 좌측으로 이동
                    sel.Translate(-bboxLen - minX, 0, 0, Type.Missing);
                    Trace.WriteLine($"[MoveSTL] Back spindle: minX={minX:F4}, shift={-bboxLen - minX:F4}");
                }
                else
                {
                    // Front Spindle: 우측으로 이동
                    sel.Translate(bboxLen - maxX, 0, 0, Type.Missing);
                    Trace.WriteLine($"[MoveSTL] Front spindle: maxX={maxX:F4}, shift={bboxLen - maxX:F4}");
                }

                // 임시 FeatureChain 정리
                try { Document.FeatureChains.Remove(fc.Key); } catch { }
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[MoveSTL] Error: {ex.Message}");
            }
        }

        public static void Boundry(bool spindleSide, double roughType)
        {
            try
            {
                try { Document.Layers.Remove(ProcessConfig.BoundryLayerName); } catch { }
                Layer layer = Document.Layers.Add(ProcessConfig.BoundryLayerName);
                Document.ActiveLayer = layer;

                // ProcessConfig에서 Point1Y, Point2Y 값 사용
                Point p1 = Document.GetPoint(0, ProcessConfig.Point1Y, 0); 
                Point p2 = Document.GetPoint(-20.0, ProcessConfig.Point2Y, 0);

                // 세그먼트로 경계 생성 (Line.Add 시 U/V/W 벡터 인자 누락 오류 방지)
                Segment segment = Document.GetSegment(p1, p2);
                FeatureChain fc = Document.FeatureChains.Add(p1);
                fc.Add(segment);
                fc.Name = ProcessConfig.Boundry1Name;

                // UVW 평면 설정 (정답 앱과 동일하게)
                EnsureWorkPlanes();
                Point axisStart = Document.GetPoint(-20, 0, 0);
                Point axisEnd = Document.GetPoint(20, 0, 0);
                Segment axis = Document.GetSegment(axisStart, axisEnd);

                SelectionSet sel = GetOrCreateSelectionSet("TempBoundry");
                sel.RemoveAll();
                sel.Add(fc, Type.Missing);
                sel.AddCopiesToSelectionSet = true;
                sel.Rotate(axis, Math.PI / 2.0, 1);
                
                if (sel.Count > 1)
                {
                    FeatureChain fc2 = (FeatureChain)sel[2];
                    fc2.Name = ProcessConfig.Boundry2Name;
                }
                sel.RemoveAll();
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[Boundry] Error: {ex.Message}");
            }
        }

        private static void EnsureWorkPlanes()
        {
            try
            {
                // 정답 앱에서 사용하는 UVW 평면과 동일한 매트릭스 구성
                CreateOrUpdatePlane("180", 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1);
                CreateOrUpdatePlane("270", 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -1, 0);
                CreateOrUpdatePlane("90", 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 1, 0);
                CreateOrUpdatePlane("Face", 0, 0, 0, 0, 1, 0, 0, 0, -1, -1, 0, 0);
                Trace.WriteLine("[EnsureWorkPlanes] UVW WorkPlanes created/updated.");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[EnsureWorkPlanes] Error: {ex.Message}");
            }
        }

        private static void CreateOrUpdatePlane(string name, double x, double y, double z, double ux, double uy, double uz, double vx, double vy, double vz, double wx, double wy, double wz)
        {
            Plane plane = null;
            try { plane = Document.Planes[name]; } catch { }

            if (plane != null)
            {
                try { Document.Planes.Remove(name); } catch { }
            }

            plane = Document.Planes.Add(name);
            plane.X = x; plane.Y = y; plane.Z = z;
            plane.Ux = ux; plane.Uy = uy; plane.Uz = uz;
            plane.Vx = vx; plane.Vy = vy; plane.Vz = vz;
            plane.Wx = wx; plane.Wy = wy; plane.Wz = wz;
            plane.IsView = false;
        }

        public static void TurningMain(bool spindleSide)
        {
            try
            {
                // 원본 TurningFeature_Module.TurningMain() 로직 반영
                SelectionSet sel = GetOrCreateSelectionSet("TempTurning");
                sel.RemoveAll();

                foreach (GraphicObject obj in Document.GraphicsCollection)
                {
                    if (obj.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        sel.Add(obj, Type.Missing);
                        break;
                    }
                }

                if (sel.Count == 0) return;

                Layer turningLayer;
                try { Document.Layers.Remove("TurningLayer"); } catch { }
                turningLayer = Document.Layers.Add("TurningLayer");
                Document.ActiveLayer = turningLayer;

                // CreateTurningProfile - 원본과 동일한 파라미터
                Document.FeatureRecognition.CreateTurningProfile(sel, Document.Planes["XYZ"], 
                    espTurningProfileType.espTurningProfileOD, 
                    espGraphicObjectReturnType.espFeatureChains, 
                    espTurningProfileLocationType.espTurningProfileLocationTop, 
                    0.01, 0.01, 5.0);

                // 가장 최근에 생성된 FeatureChain 찾기 (원본 로직)
                int maxKey = 0;
                foreach (FeatureChain fc in Document.FeatureChains)
                {
                    if (Convert.ToInt32(fc.Key) > maxKey)
                    {
                        maxKey = Convert.ToInt32(fc.Key);
                    }
                }

                foreach (FeatureChain fc in Document.FeatureChains)
                {
                    if (Convert.ToInt32(fc.Key) == maxKey)
                    {
                        tfc = fc;
                        break;
                    }
                }

                if (tfc != null)
                {
                    if (!spindleSide) tfc.Reverse();
                    tfc.Name = "Turning";

                    // 원본 로직: 끝점 추출 및 LowerY 저장
                    Point endPoint = tfc.Extremity(espExtremityType.espExtremityEnd);
                    double y = endPoint.Y;
                    double x = endPoint.X;
                    
                    LowerY = y;
                    EndXValue = x;
                    
                    // TurningExtend 만큼 연장
                    if (spindleSide)
                    {
                        x -= TurningExtend;
                    }
                    else
                    {
                        x += TurningExtend;
                    }

                    Point pExtend = Document.GetPoint(x, y, 0);
                    Point pEnd = Document.GetPoint(endPoint.X, y, 0);
                    Segment segExtend = Document.GetSegment(pEnd, pExtend);
                    
                    EndX = x;
                    EndY = y;
                    ExtendX = x;
                    
                    tfc.Add(segExtend);
                    
                    Trace.WriteLine($"[TurningMain] Turning profile created: LowerY={LowerY:F4}, EndX={EndX:F4}, ExtendX={ExtendX:F4}");
                }
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[TurningMain] Error: {ex.Message}");
            }
        }

        public static void MillingStart(bool spindleSide)
        {
            try
            {
                try { Document.Layers.Remove("RoughMillingLayer"); } catch { }
                Layer millingLayer = Document.Layers.Add("RoughMillingLayer");
                Document.ActiveLayer = millingLayer;

                SelectionSet sel = GetOrCreateSelectionSet("TempMilling");
                sel.RemoveAll();

                foreach (GraphicObject obj in Document.GraphicsCollection)
                {
                    if (obj.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        sel.Add(obj, Type.Missing);
                        break;
                    }
                }

                if (sel.Count == 0) return;

                // 원본: X축 기준 회전 (0, 0, 0) ~ (10, 0, 0)
                Point p0 = Document.GetPoint(0, 0, 0);
                Point pX = Document.GetPoint(10, 0, 0);
                Segment xAxis = Document.GetSegment(p0, pX);

                Wp = Document.Planes["XYZ"];

                // 원본: n=0 ~ 17 (0도 ~ 170도, 10도 간격)
                int angleCount = 0;
                for (int n = 0; n <= 17; n++)
                {
                    double Ang = Math.PI * 10.0 * n / 180.0;
                    
                    // STL 회전
                    sel.Rotate(xAxis, Ang, 0);
                    
                    // 프로파일 생성 (원본은 YZX 평면 사용)
                    try
                    {
                        Document.FeatureRecognition.CreatePartProfileShadow(sel, Document.Planes["YZX"], espGraphicObjectReturnType.espFeatureChains);
                        
                        // 생성된 FeatureChain에 이름 지정
                        if (Document.FeatureChains.Count > 0)
                        {
                            FeatureChain fc = Document.FeatureChains[Document.FeatureChains.Count];
                            fc.Name = $"RoughMill{angleCount + 1}_{n}";
                            Trace.WriteLine($"[MillingStart] Created profile at angle {n * 10}°: {fc.Name}");
                        }
                    }
                    catch (Exception ex)
                    {
                        Trace.WriteLine($"[MillingStart] Profile creation failed at angle {n * 10}°: {ex.Message}");
                    }
                    
                    // 회전 복귀
                    sel.Rotate(xAxis, -Ang, 0);
                }
                
                Trace.WriteLine($"[MillingStart] Completed milling profile generation for {angleCount} angles");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[MillingStart] Error: {ex.Message}");
            }
        }

        /// <summary>
        /// STL 파일 병합 직후 Y축 기준 -90도 회전
        /// </summary>
        public static void RotateSTLInitial()
        {
            try
            {
                SelectionSet sel = GetOrCreateSelectionSet("InitialRotation");
                sel.RemoveAll();

                foreach (GraphicObject obj in Document.GraphicsCollection)
                {
                    if (obj.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        sel.Add(obj, Type.Missing);
                    }
                }

                if (sel.Count == 0)
                {
                    Trace.WriteLine("[RotateSTLInitial] No STL model found.");
                    return;
                }

                // Y축 회전 (0,0,0)에서 (0,10,0) 방향
                Point p0 = Document.GetPoint(0, 0, 0);
                Point pY = Document.GetPoint(0, 10, 0);
                Segment yAxis = Document.GetSegment(p0, pY);

                // -90도 회전 (라디안: -π/2)
                double angleRad = ProcessConfig.InitialRotationAngleY * Math.PI / 180.0;
                sel.Rotate(yAxis, angleRad, 0);

                Trace.WriteLine($"[RotateSTLInitial] Rotated STL by {ProcessConfig.InitialRotationAngleY} degrees around Y-axis.");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[RotateSTLInitial] Error: {ex.Message}");
            }
        }

        /// <summary>
        /// NC 코드 생성 및 저장
        /// </summary>
        public static void GenerateNCCode(string stlFilePath)
        {
            try
            {
                Trace.WriteLine("[GenerateNCCode] Starting NC code generation...");

                // 출력 디렉토리 확인 및 생성
                ProcessConfig.EnsureNCCodeDirectoryExists();

                // NC 파일 경로 생성 (STL이 위치한 storage의 형제 폴더 3-nc 사용)
                var stlDir = Path.GetDirectoryName(Path.GetFullPath(stlFilePath));
                var storageDir = Path.GetDirectoryName(stlDir); // .../storage
                var ncOutputDir = Path.Combine(storageDir ?? stlDir ?? ".", "3-nc");
                Directory.CreateDirectory(ncOutputDir);
                string ncFilePath = Path.Combine(ncOutputDir, ProcessConfig.GetNCBaseName(stlFilePath) + ".nc");

                // 포스트프로세서 파일 경로
                string postProcessorDir = EspritApp.Configuration.GetFileDirectory(espFileType.espFileTypePostProcessor);
                string postProcessorPath = Path.Combine(postProcessorDir, ProcessConfig.PostProcessorFileName);

                if (!File.Exists(postProcessorPath))
                {
                    Trace.WriteLine($"[GenerateNCCode] Warning: Post processor not found at {postProcessorPath}");
                    Trace.WriteLine("[GenerateNCCode] Attempting to use default post processor...");
                    // 기본 포스트프로세서 사용 시도
                    postProcessorPath = null;
                }

                // NC 코드 생성
                Document.NCCode.AddAll();
                
                // Execute는 string 인수를 요구하므로 포스트프로세서가 없을 경우 빈 문자열 전달
                var postPathOrEmpty = postProcessorPath ?? string.Empty;
                Document.NCCode.Execute(postPathOrEmpty, ncFilePath);

                Trace.WriteLine($"[GenerateNCCode] NC code saved to: {ncFilePath}");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[GenerateNCCode] Error: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 프로세스 완료 후 정리 (Operations, Features, STL 삭제)
        /// </summary>
        public static void CleanupAfterProcessing()
        {
            try
            {
                Trace.WriteLine("[CleanupAfterProcessing] Starting cleanup...");

                // 역순으로 삭제: Operations → Features → STL
                for (int idx = Document.GraphicsCollection.Count; idx >= 1; idx--)
                {
                    try
                    {
                        GraphicObject go = Document.GraphicsCollection[idx] as GraphicObject;
                        if (go == null) continue;

                        espGraphicObjectType objType = go.GraphicObjectType;

                        // Operations (Toolpaths) 삭제
                        if (objType == espGraphicObjectType.espOperation)
                        {
                            Trace.WriteLine($"[CleanupAfterProcessing] Removing operation: {go.GuiTypeName}");
                            Document.GraphicsCollection.Remove(idx);
                        }
                        // FeatureChains 삭제
                        else if (objType == espGraphicObjectType.espFeatureChain)
                        {
                            Trace.WriteLine($"[CleanupAfterProcessing] Removing feature chain: {go.GuiTypeName}");
                            Document.GraphicsCollection.Remove(idx);
                        }
                        // FreeFormFeatures 삭제
                        else if (objType == espGraphicObjectType.espFreeFormFeature)
                        {
                            Trace.WriteLine($"[CleanupAfterProcessing] Removing free form feature: {go.GuiTypeName}");
                            Document.GraphicsCollection.Remove(idx);
                        }
                        // FeatureSets 삭제
                        else if (objType == espGraphicObjectType.espFeatureSet)
                        {
                            Trace.WriteLine($"[CleanupAfterProcessing] Removing feature set: {go.GuiTypeName}");
                            Document.GraphicsCollection.Remove(idx);
                        }
                        // STL Models 삭제
                        else if (objType == espGraphicObjectType.espSTL_Model)
                        {
                            Trace.WriteLine($"[CleanupAfterProcessing] Removing STL model: {go.GuiTypeName}");
                            Document.GraphicsCollection.Remove(idx);
                        }
                    }
                    catch (Exception ex)
                    {
                        Trace.WriteLine($"[CleanupAfterProcessing] Error removing item at index {idx}: {ex.Message}");
                    }
                }

                // 화면 갱신
                Document.Refresh();
                Trace.WriteLine("[CleanupAfterProcessing] Cleanup completed.");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[CleanupAfterProcessing] Error: {ex.Message}");
            }
        }

        private static SelectionSet GetOrCreateSelectionSet(string name)
        {
            if (Document == null) return null;
            SelectionSet set = null;
            try { set = Document.SelectionSets[name]; } catch { }
            if (set == null)
            {
                try { set = Document.SelectionSets.Add(name); } catch { }
            }
            return set;
        }
    }
}
