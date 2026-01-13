using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using Esprit;
using EspritConstants;
using EspritFeatures;
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

        private static string _compositeDriveSurfaceKey;

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
                // RotateSTL(spindleSide); // 원본 플로우에 따라 불필요한 경우 제외 가능하나 일단 유지
                MoveSTL(spindleSide);
                
                // 4. 바운더리 생성 (Boundry)
                Boundry(spindleSide, roughType);
                
                // 5. 터닝 피처 생성 (Turning)
                TurningMain(spindleSide);
                
                // 6. 밀링 가공 (Milling)
                if (roughType == 1.0)
                {
                    // MillingStart 호출 제거
                }

                // UVW 평면 및 표시 설정
                EnsureWorkPlanes();
                EnsureFreeFormFeatures(spindleSide);

                // 7. 기본 공정(Operation) 생성 시도 (prc 기반)
                TryAddDefaultOperations(reverseOn, roughType);

                // 8. NC 코드 생성
                if (!string.IsNullOrEmpty(stlFilePath))
                {
                    GenerateNCCode(stlFilePath);
                }

                Trace.WriteLine("[AbutsFitAddin] Pipeline completed successfully.");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[AbutsFitAddin] Pipeline failed: {ex.Message}");
                throw;
            }
        }

        // Turning FeatureChain의 Y 좌표 절대값 최대치를 계산해 정렬에 사용
        private static double GetMaxAbsY(FeatureChain fc)
        {
            if (fc == null) return double.MinValue;
            double maxAbs = double.MinValue;
            try
            {
                for (double d = 0; d <= fc.Length; d += 0.1)
                {
                    Point p = fc.PointAlong(d);
                    double ay = Math.Abs(p.Y);
                    if (ay > maxAbs) maxAbs = ay;
                }
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[GetMaxAbsY] Error: {ex.Message}");
            }
            return maxAbs;
        }

        private static FreeFormFeature FindFreeFormFeatureByName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            foreach (FreeFormFeature ff in Document.FreeFormFeatures)
            {
                if (string.Equals(ff.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    return ff;
                }
            }
            return null;
        }

        private static FeatureChain FindFeatureChainByName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            foreach (FeatureChain fc in Document.FeatureChains)
            {
                if (string.Equals(fc.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    return fc;
                }
            }
            return null;
        }

        private static FeatureSet GetOrCreateFeatureSet(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            try
            {
                var existing = Document.FeatureSets[name];
                if (existing != null) return existing;
            }
            catch { }

            try
            {
                var created = Document.FeatureSets.Add(Type.Missing);
                created.Name = name;
                return created;
            }
            catch
            {
                return null;
            }
        }

        private static Plane CreateOrUpdatePlane(string name, double ux, double uy, double uz, double vx, double vy, double vz, double wx, double wy, double wz, bool isView = false)
        {
            Plane plane = null;
            try { plane = Document.Planes[name]; } catch { }

            if (plane == null)
            {
                try { plane = Document.Planes.Add(name); } catch { }
            }

            if (plane != null)
            {
                plane.X = 0.0;
                plane.Y = 0.0;
                plane.Z = 0.0;
                plane.Ux = ux; plane.Uy = uy; plane.Uz = uz;
                plane.Vx = vx; plane.Vy = vy; plane.Vz = vz;
                plane.Wx = wx; plane.Wy = wy; plane.Wz = wz;
                plane.IsView = isView;
            }
            return plane;
        }

        private static void EnsureFreeFormFeatures(bool spindleSide)
        {
            try
            {
                GraphicObject stl = null;
                foreach (GraphicObject obj in Document.GraphicsCollection)
                {
                    if (obj.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        stl = obj;
                        break;
                    }
                }
                if (stl == null) return;

                Layer layer = null;
                try { layer = Document.Layers["FreeFormLayer"]; } catch { }
                if (layer == null)
                {
                    try { layer = Document.Layers.Add("FreeFormLayer"); } catch { }
                }
                if (layer != null)
                {
                    Document.ActiveLayer = layer;
                }

                var fs0180 = GetOrCreateFeatureSet("0-180Degree");
                var fs90270 = GetOrCreateFeatureSet("90-270Degree");

                if (FindFreeFormFeatureByName("3DMilling_180Degree") == null)
                {
                    var p180 = CreateOrUpdatePlane("180", 1.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, -1.0, false);
                    if (p180 != null) Document.ActivePlane = p180;
                    var ff180 = Document.FreeFormFeatures.Add();
                    ff180.Name = "3DMilling_180Degree";
                    ff180.Add(stl, espFreeFormElementType.espFreeFormPartSurfaceItem);
                    fs0180?.Add(ff180);
                }

                if (FindFreeFormFeatureByName("3DMilling_270Degree") == null)
                {
                    var p270 = CreateOrUpdatePlane("270", 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, -1.0, 0.0, false);
                    if (p270 != null) Document.ActivePlane = p270;
                    var ff270 = Document.FreeFormFeatures.Add();
                    ff270.Name = "3DMilling_270Degree";
                    ff270.Add(stl, espFreeFormElementType.espFreeFormPartSurfaceItem);
                    fs90270?.Add(ff270);
                }

                if (FindFreeFormFeatureByName("3DMilling_0Degree") == null)
                {
                    Plane p0 = null;
                    try { p0 = Document.Planes["XYZ"]; } catch { }
                    if (p0 != null) Document.ActivePlane = p0;
                    var ff0 = Document.FreeFormFeatures.Add();
                    ff0.Name = "3DMilling_0Degree";
                    ff0.Add(stl, espFreeFormElementType.espFreeFormPartSurfaceItem);
                    fs0180?.Add(ff0);
                }

                if (FindFreeFormFeatureByName("3DMilling_90Degree") == null)
                {
                    var p90 = CreateOrUpdatePlane("90", 1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0, false);
                    if (p90 != null) Document.ActivePlane = p90;
                    var ff90 = Document.FreeFormFeatures.Add();
                    ff90.Name = "3DMilling_90Degree";
                    ff90.Add(stl, espFreeFormElementType.espFreeFormPartSurfaceItem);
                    fs90270?.Add(ff90);
                }

                if (FindFreeFormFeatureByName("3DMilling_FrontFace") == null)
                {
                    var pFace = CreateOrUpdatePlane("Face", 0.0, 1.0, 0.0, 0.0, 0.0, -1.0, -1.0, 0.0, 0.0, false);
                    Plane pYzx = null;
                    try { pYzx = Document.Planes["YZX"]; } catch { }
                    if (spindleSide)
                    {
                        if (pFace != null) Document.ActivePlane = pFace;
                    }
                    else
                    {
                        if (pYzx != null) Document.ActivePlane = pYzx;
                        else if (pFace != null) Document.ActivePlane = pFace;
                    }
                    var ffFront = Document.FreeFormFeatures.Add();
                    ffFront.Name = "3DMilling_FrontFace";
                    ffFront.Add(stl, espFreeFormElementType.espFreeFormPartSurfaceItem);
                }

                var roughSet = GetOrCreateFeatureSet("Rough_0-180Degree");
                if (FindFreeFormFeatureByName("3DRoughMilling_0Degree") == null)
                {
                    Plane p0r = null;
                    try { p0r = Document.Planes["XYZ"]; } catch { }
                    if (p0r != null) Document.ActivePlane = p0r;
                    var r0 = Document.FreeFormFeatures.Add();
                    r0.Name = "3DRoughMilling_0Degree";
                    r0.Add(stl, espFreeFormElementType.espFreeFormPartSurfaceItem);
                    roughSet?.Add(r0);
                }
                if (FindFreeFormFeatureByName("3DRoughMilling_180Degree") == null)
                {
                    Plane p180r = null;
                    try { p180r = Document.Planes["180"]; } catch { }
                    if (p180r != null) Document.ActivePlane = p180r;
                    var r180 = Document.FreeFormFeatures.Add();
                    r180.Name = "3DRoughMilling_180Degree";
                    r180.Add(stl, espFreeFormElementType.espFreeFormPartSurfaceItem);
                    roughSet?.Add(r180);
                }
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[EnsureFreeFormFeatures] Error: {ex.Message}");
            }
        }

        /// <summary>
        /// 기본 공정(Operation) 생성: 설정된 prc 파일을 로드해 현재 FeatureChains에 매핑
        /// </summary>
        private static void TryAddDefaultOperations(bool reverseOn, double roughType)
        { 
            try
            {
                string techDir = ProcessConfig.TechRootDirectory;
                if (string.IsNullOrEmpty(techDir) || !Directory.Exists(techDir))
                {
                    Trace.WriteLine($"[TryAddDefaultOperations] Technology directory not found: {techDir}");
                    return;
                }

                var ffFront = FindFreeFormFeatureByName("3DMilling_FrontFace");
                // FACE DRILL 최상단 배치
                if (ffFront != null)
                {
                    AddOperation(techDir, ProcessConfig.FaceHoleProcessFile, "FaceDrill", ffFront);
                }

                // Turning 순서: X 좌표 절대값이 큰 것부터 작은 것 순
                var turningNames = new[] { "Turning", "TurningProfile1", "TurningProfile2", "TurningProfile3" };
                var orderedTurning = turningNames
                    .Select(name => new { Name = name, Fc = FindFeatureChainByName(name) })
                    .Where(x => x.Fc != null)
                    .Select(x => new { x.Name, x.Fc, Score = GetMaxAbsY(x.Fc) })
                    .OrderByDescending(x => x.Score)
                    .ToList();

                foreach (var item in orderedTurning)
                {
                    AddOperation(techDir, ProcessConfig.TurningProcessFile, "TurnOperation", item.Fc);
                }

                if (reverseOn)
                {
                    var backs = FindFeatureChainsBySuffix("_Back");
                    foreach (var fc in backs)
                    {
                        AddOperation(techDir, ProcessConfig.ReverseTurningProcessFile, "TurnOperation", fc);
                    }
                }

                // 2. Rough Milling (RoughMill) - ONLY to 3DRoughMilling features (첨1 기준 2줄)
                if (roughType == 1.0)
                {
                    var r0 = FindFreeFormFeatureByName("3DRoughMilling_0Degree");
                    var r180 = FindFreeFormFeatureByName("3DRoughMilling_180Degree");
                    if (r0 != null) AddOperation(techDir, ProcessConfig.RoughMillingProcessFile, "RoughMillingOperation", r0);
                    if (r180 != null) AddOperation(techDir, ProcessConfig.RoughMillingProcessFile, "RoughMillingOperation", r180);
                }

                // 3. FreeForm Milling & Face Finish & Composite
                var ff0 = FindFreeFormFeatureByName("3DMilling_0Degree");
                var ff90 = FindFreeFormFeatureByName("3DMilling_90Degree");
                var ff180 = FindFreeFormFeatureByName("3DMilling_180Degree");
                var ff270 = FindFreeFormFeatureByName("3DMilling_270Degree");

                // 90/270 Ball (BM_D2 목표) - 1개만 추가
                var ff90Target = ff90 ?? ff270;
                if (ff90Target != null && !OperationExistsByName("BM_D2"))
                {
                    AddOperation(techDir, ProcessConfig.O90_270BallMillingProcessFile, "FreeFormMill", ff90Target);
                }

                // 0/180 Ball (BM_D1.2 목표) - 1개만 추가
                var ff0Target = ff0 ?? ff180;
                if (ff0Target != null) AddOperation(techDir, ProcessConfig.O180BallMillingProcessFile, "FreeFormMill", ff0Target);

                // Face Finish (EM2.0BALL)
                if (ffFront != null)
                {
                    AddOperation(techDir, ProcessConfig.FaceMachiningProcessFile, "FreeFormMill", ffFront);
                    if (!OperationExistsByName("EM2.0BALL"))
                    {
                        AddOperation(techDir, ProcessConfig.FaceMachiningProcessFile, "FreeFormMill", ffFront);
                    }
                }

                // 5Axis Composite
                if (ff0 != null)
                {
                    if (!OperationExistsByName("5Axis_Composite"))
                    {
                        TryCreateCompositeSurfacesFromStl();
                        AddOperation(techDir, ProcessConfig.CompositeProcessFile, "CompositeMill", ff0);
                    }
                }

                // Connection 은 마지막에 추가 (요구: NEO_CONNECTION 맨 끝)
                if (ffFront != null)
                {
                    AddOperation(techDir, ProcessConfig.ConnectionProcessFile, "FreeFormMill", ffFront);
                }

                Trace.WriteLine($"[TryAddDefaultOperations] Summary: total Operations={Document.Operations.Count}");

                RemoveDuplicateBallOperations();
                // 추가 제거 규칙: BM_D4만 제거 (BM_D2는 유지)
                RemoveSpecificBallOperations();
                // 원본앱 대비: BM_D2 공정은 유지하되 Tool 리스트에 BM_D2는 표시되지 않도록 제거
                RemoveBallMillToolById("BM_D2");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[TryAddDefaultOperations] ERROR: {ex.Message}");
            }
        }

        private static void AddOperation(string techDir, string prcName, string layerName, IGraphicObject target)
        {
            if (string.IsNullOrWhiteSpace(prcName)) return;
            var prcPath = ResolvePrcPath(techDir, prcName);
            if (string.IsNullOrEmpty(prcPath))
            {
                Trace.WriteLine($"[AddOperation] prc not found: {prcName}");
                return;
            }

            try
            {
                var util = new TechnologyUtilityClass();
                var result = util.OpenProcess(prcPath);
                if (result == null)
                {
                    Trace.WriteLine($"[AddOperation] OpenProcess returned null for {prcName}");
                    return;
                }

                IEnumerable techs = (result is IEnumerable en) ? en : new[] { result };
                
                // 레이어 설정
                Layer layer = null;
                try { layer = Document.Layers[layerName]; } catch { }
                if (layer == null) layer = Document.Layers.Add(layerName);
                Document.ActiveLayer = layer;

                foreach (var techObj in techs)
                {
                    if (techObj is ITechnology tech)
                    {
                        try
                        {
                            // 템플릿(EST)에 설정된 공구를 사용하도록 ToolID 처리
                            string currentToolID = GetToolIDFromTech(tech);
                            Trace.WriteLine($"[AddOperation] Tech {prcName} ToolID from PRC: {currentToolID}");

                            string fileName = Path.GetFileName(prcPath);

                            // PRC별로 기대되는 ToolID가 명확한 경우(특히 90/270) 강제 매핑
                            // - 3D_2.prc: BM_D2 1회만 남겨야 하므로 PRC에 잘못된 힌트가 있어도 BM_D2로 강제
                            if (fileName.Equals(ProcessConfig.O90_270BallMillingProcessFile, StringComparison.OrdinalIgnoreCase))
                            {
                                // 원본: 90/270 세트는 항상 BM_D2 한 번씩만 남음
                                var forced = FindBallMillByDiameter(2.0, true) ?? FindBallMillByDiameter(2.0, false);
                                if (!string.IsNullOrWhiteSpace(forced))
                                {
                                    SetToolIDOnTech(tech, forced);
                                    currentToolID = forced;
                                    Trace.WriteLine($"[AddOperation] Forced ToolID for {fileName}: {currentToolID}");
                                }
                                else
                                {
                                    // 공구를 못 찾는 경우에도 이름은 BM_D2로 고정되도록 currentToolID 설정
                                    currentToolID = "BM_D2";
                                    Trace.WriteLine($"[AddOperation] WARNING: No BallMill tool found for diameter=2.0. Force name to BM_D2.");
                                }
                            }
                            if (fileName.Equals(ProcessConfig.O180BallMillingProcessFile, StringComparison.OrdinalIgnoreCase))
                            {
                                // 요구: 0/180은 BM_D1.2만 사용
                                var forced = FindBallMillByDiameter(1.2, true) ?? FindBallMillByDiameter(1.2, false);
                                if (!string.IsNullOrWhiteSpace(forced))
                                {
                                    SetToolIDOnTech(tech, forced);
                                    currentToolID = forced;
                                    Trace.WriteLine($"[AddOperation] Forced ToolID for {fileName} (diameter=1.2): {currentToolID}");
                                }
                                else
                                {
                                    Trace.WriteLine($"[AddOperation] WARNING: No BallMill tool found for diameter=1.2. Keep PRC ToolID={currentToolID}");
                                }
                            }

                            if (!string.IsNullOrEmpty(currentToolID) && !ToolExistsInDocument(currentToolID))
                            {
                                var mappedToolID = TryFindToolIdByHint(currentToolID, prcName);
                                if (!string.IsNullOrEmpty(mappedToolID))
                                {
                                    SetToolIDOnTech(tech, mappedToolID);
                                    currentToolID = mappedToolID;
                                    Trace.WriteLine($"[AddOperation] ToolID remapped. prc={prcName}, toolId={currentToolID}");
                                }

                                if (!ToolExistsInDocument(currentToolID))
                                {
                                    Trace.WriteLine($"[AddOperation] ToolID not found in current document tools. prc={prcName}, toolId={currentToolID}");
                                    continue;
                                }
                            }

                            if (IsCompositeProcess(prcName) && tech is ITechLatheMill5xComposite composite)
                            {
                                TryConfigureComposite(composite);
                            }
                            bool skipDedupe = fileName.Equals(ProcessConfig.FaceMachiningProcessFile, StringComparison.OrdinalIgnoreCase)
                                              || fileName.Equals(ProcessConfig.O90_270BallMillingProcessFile, StringComparison.OrdinalIgnoreCase);

                            var intendedName = GetIntendedOperationName(fileName, currentToolID);
                            if (!skipDedupe && !string.IsNullOrWhiteSpace(intendedName) && ShouldDedupeByName(fileName, intendedName) && OperationExistsByName(intendedName))
                            {
                                Trace.WriteLine($"[AddOperation] Skip duplicate operation: {fileName} -> {intendedName}");
                                continue;
                            }

                            TrySetTechBoundaryProfiles(tech, fileName);
                            TrySetTechZLimits(tech, fileName);

                            var op = Document.Operations.Add(tech, target, Type.Missing);
                            
                            if (fileName.Equals(ProcessConfig.TurningProcessFile, StringComparison.OrdinalIgnoreCase) || 
                                fileName.Equals(ProcessConfig.ReverseTurningProcessFile, StringComparison.OrdinalIgnoreCase)) 
                                op.Name = "솔리드턴-윤곽가공";
                            else if (fileName.Equals(ProcessConfig.RoughMillingProcessFile, StringComparison.OrdinalIgnoreCase)) 
                                op.Name = "Rough Mill 3D";
                            else if (fileName.Equals(ProcessConfig.CompositeProcessFile, StringComparison.OrdinalIgnoreCase)) 
                                op.Name = "5Axis_Composite";
                            else if (fileName.Equals(ProcessConfig.FaceMachiningProcessFile, StringComparison.OrdinalIgnoreCase)) 
                                op.Name = "EM2.0BALL";
                            else if (fileName.Equals(ProcessConfig.FaceHoleProcessFile, StringComparison.OrdinalIgnoreCase)) 
                                op.Name = "NEO_FACE DRILL";
                            else if (fileName.Equals(ProcessConfig.ConnectionProcessFile, StringComparison.OrdinalIgnoreCase)) 
                                op.Name = "NEO_CONNECTION";
                            else if (fileName.Equals(ProcessConfig.O180BallMillingProcessFile, StringComparison.OrdinalIgnoreCase)) 
                                op.Name = GetBallMillOperationName(currentToolID, "3D");
                            else if (fileName.Equals(ProcessConfig.O90_270BallMillingProcessFile, StringComparison.OrdinalIgnoreCase)) 
                                op.Name = GetBallMillOperationName(currentToolID, "3D_2");
                            
                            Trace.WriteLine($"[AddOperation] Successfully added operation: {fileName} -> {op.Name}");
                        }
                        catch (Exception innerEx)
                        {
                            Trace.WriteLine($"[AddOperation] Failed to Add operation from {prcName}: {innerEx.Message}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[AddOperation] CRITICAL ERROR for {prcName}: {ex.Message}");
            }
        }

        private static bool OperationExistsByName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return false;
            foreach (Operation op in (IEnumerable)Document.Operations)
            {
                if (op == null) continue;
                if (string.Equals(op.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        private static bool ShouldDedupeByName(string prcFileName, string intendedOpName)
        {
            if (string.IsNullOrWhiteSpace(prcFileName)) return false;

            if (prcFileName.Equals(ProcessConfig.CompositeProcessFile, StringComparison.OrdinalIgnoreCase)) return true;
            if (prcFileName.Equals(ProcessConfig.FaceMachiningProcessFile, StringComparison.OrdinalIgnoreCase)) return true;
            if (prcFileName.Equals(ProcessConfig.FaceHoleProcessFile, StringComparison.OrdinalIgnoreCase)) return true;
            if (prcFileName.Equals(ProcessConfig.ConnectionProcessFile, StringComparison.OrdinalIgnoreCase)) return true;
            if (prcFileName.Equals(ProcessConfig.O180BallMillingProcessFile, StringComparison.OrdinalIgnoreCase)) return true;
            if (prcFileName.Equals(ProcessConfig.O90_270BallMillingProcessFile, StringComparison.OrdinalIgnoreCase)) return true;

            return false;
        }

        private static string GetIntendedOperationName(string prcFileName, string currentToolID)
        {
            if (string.IsNullOrWhiteSpace(prcFileName)) return null;

            if (prcFileName.Equals(ProcessConfig.CompositeProcessFile, StringComparison.OrdinalIgnoreCase)) return "5Axis_Composite";
            if (prcFileName.Equals(ProcessConfig.FaceMachiningProcessFile, StringComparison.OrdinalIgnoreCase)) return "EM2.0BALL";
            if (prcFileName.Equals(ProcessConfig.FaceHoleProcessFile, StringComparison.OrdinalIgnoreCase)) return "NEO_FACE DRILL";
            if (prcFileName.Equals(ProcessConfig.ConnectionProcessFile, StringComparison.OrdinalIgnoreCase)) return "NEO_CONNECTION";

            if (prcFileName.Equals(ProcessConfig.O180BallMillingProcessFile, StringComparison.OrdinalIgnoreCase))
            {
                return GetBallMillOperationName(currentToolID, "3D");
            }
            if (prcFileName.Equals(ProcessConfig.O90_270BallMillingProcessFile, StringComparison.OrdinalIgnoreCase))
            {
                return GetBallMillOperationName(currentToolID, "3D_2");
            }
            return null;
        }

        private static bool IsCompositeProcess(string prcName)
        {
            return !string.IsNullOrWhiteSpace(prcName) && prcName.Equals(ProcessConfig.CompositeProcessFile, StringComparison.OrdinalIgnoreCase);
        }

        private static void TryConfigureComposite(ITechLatheMill5xComposite composite)
        {
            try
            {
                composite.PassPosition = espMill5xCompositePassPosition.espMill5xCompositePassPositionStartEndPosition;

                var surfaceKey = _compositeDriveSurfaceKey;
                if (string.IsNullOrWhiteSpace(surfaceKey))
                {
                    var surfaceInfo = TryGetAnySurfaceInfo();
                    if (surfaceInfo == null || surfaceInfo.Item1 != 19)
                    {
                        TryCreateCompositeGuideSurfaces();
                        surfaceInfo = TryGetAnySurfaceInfo();
                    }
                    if (surfaceInfo != null && surfaceInfo.Item1 == 19)
                    {
                        surfaceKey = surfaceInfo.Item2;
                    }
                }

                if (string.IsNullOrWhiteSpace(surfaceKey))
                {
                    throw new InvalidOperationException("No suitable guide surface (espSurface) found for 5Axis_Composite DriveSurface.");
                }

                composite.DriveSurface = "19," + surfaceKey;
                Trace.WriteLine($"[TryConfigureComposite] DriveSurface set to: {composite.DriveSurface}");

                if (composite.FirstPassPercent <= 0) composite.FirstPassPercent = 10;
                if (composite.LastPassPercent <= 0) composite.LastPassPercent = 50;
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[TryConfigureComposite] Error: {ex.Message}");
            }
        }

        private static void TryCreateCompositeSurfacesFromStl()
        {
            try
            {
                bool hasCompositeGuideSurface = false;
                foreach (GraphicObject go in Document.GraphicsCollection)
                {
                    if (go.GraphicObjectType != espGraphicObjectType.espSurface) continue;
                    try
                    {
                        if (go.Layer != null && string.Equals(go.Layer.Name, "CompositeGuide", StringComparison.OrdinalIgnoreCase))
                        {
                            hasCompositeGuideSurface = true;
                            break;
                        }
                    }
                    catch { }
                }
                if (hasCompositeGuideSurface) return;

                GraphicObject stl = null;
                foreach (GraphicObject go in Document.GraphicsCollection)
                {
                    if (go.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        stl = go;
                        break;
                    }
                }
                if (stl == null) return;

                Layer layer = null;
                try { layer = Document.Layers["CompositeGuide"]; } catch { }
                if (layer == null) layer = Document.Layers.Add("CompositeGuide");
                Document.ActiveLayer = layer;
                try { layer.Visible = true; } catch { }

                SelectionSet sel = GetOrCreateSelectionSet("CompositeGuide");
                sel.RemoveAll();
                sel.Add(stl, Type.Missing);
                sel.Smash(false, true, false, espWireFrameElementType.espWireFrameElementAll, 0.01, 10.0);

                Trace.WriteLine("[TryCreateCompositeSurfacesFromStl] Surfaces created from STL via Smash.");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[TryCreateCompositeSurfacesFromStl] Error: {ex.Message}");
            }
        }

        private static void TryCreateCompositeGuideSurfaces()
        {
            try
            {
                if (TryCreateCompositeSurfacesFromIges())
                {
                    return;
                }
                TryCreateCompositeSurfacesFromStl();
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[TryCreateCompositeGuideSurfaces] Error: {ex.Message}");
            }
        }

        private static bool TryCreateCompositeSurfacesFromIges()
        {
            try
            {
                var baseDirs = new List<string>();
                try
                {
                    var d = Connect.DentalHost?.CurrentData?.PrcDirectory;
                    if (!string.IsNullOrWhiteSpace(d)) baseDirs.Add(d);
                }
                catch { }
                baseDirs.Add(@"C:\Program Files (x86)\D.P.Technology\ESPRIT\AddIns\DentalAddin");

                string surfaceDir = null;
                foreach (var baseDir in baseDirs)
                {
                    if (string.IsNullOrWhiteSpace(baseDir)) continue;
                    if (!Directory.Exists(baseDir)) continue;
                    var candidate = Path.Combine(baseDir, "Viles", "Surface");
                    if (Directory.Exists(candidate))
                    {
                        surfaceDir = candidate;
                        break;
                    }
                }
                if (string.IsNullOrWhiteSpace(surfaceDir)) return false;

                bool spindleSide = GetSpindleSideFromDocument();

                var project = spindleSide ? "Project2.igs" : "Project1.igs";
                var extrude = spindleSide ? "ExtrudeL.igs" : "ExtrudeR.igs";

                var projectPath = Path.Combine(surfaceDir, project);
                var extrudePath = Path.Combine(surfaceDir, extrude);

                if (!File.Exists(projectPath) || !File.Exists(extrudePath))
                {
                    return false;
                }

                if (Document == null)
                {
                    return false;
                }

                Document.MergeFile(projectPath, Type.Missing);
                var firstSurfaceKey = FindFirstSurfaceKey();
                if (string.IsNullOrWhiteSpace(firstSurfaceKey))
                {
                    return false;
                }

                _compositeDriveSurfaceKey = firstSurfaceKey;

                Document.MergeFile(extrudePath, Type.Missing);
                Trace.WriteLine($"[TryCreateCompositeSurfacesFromIges] Merged IGES: {project} + {extrude}, firstSurfaceKey={firstSurfaceKey}");
                return true;
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[TryCreateCompositeSurfacesFromIges] Error: {ex.Message}");
                return false;
            }
        }

        private static bool GetSpindleSideFromDocument()
        {
            try
            {
                var setup = Document?.LatheMachineSetup;
                if (setup?.Spindles == null || setup.Spindles.Count < 1)
                {
                    return true;
                }
                var spindle = setup.Spindles[1];
                if (spindle == null) return true;
                switch (spindle.Orientation)
                {
                    case espSpindleOrientation.espSpindleOrientationRightPositive:
                        return false;
                    case espSpindleOrientation.espSpindleOrientationLeftPositive:
                        return true;
                    default:
                        return true;
                }
            }
            catch
            {
                return true;
            }
        }

        private static string FindFirstSurfaceKey()
        {
            try
            {
                int count = Document.GraphicsCollection.Count;
                for (int i = 1; i <= count; i++)
                {
                    var go = Document.GraphicsCollection[i] as GraphicObject;
                    if (go == null) continue;
                    if (go.GraphicObjectType == espGraphicObjectType.espSurface)
                    {
                        return go.Key;
                    }
                }
            }
            catch { }
            return null;
        }

        private static Tuple<int, string> TryGetAnySurfaceInfo()
        {
            try
            {
                GraphicObject bestSurface = null;
                double bestKey = double.MinValue;
                foreach (GraphicObject go in Document.GraphicsCollection)
                {
                    if (go.GraphicObjectType != espGraphicObjectType.espSurface) continue;
                    try
                    {
                        if (go.Layer == null || !string.Equals(go.Layer.Name, "CompositeGuide", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }
                    }
                    catch
                    {
                        continue;
                    }

                    var keyStr = go.Key;
                    if (!double.TryParse(keyStr, NumberStyles.Float, CultureInfo.InvariantCulture, out var keyNum))
                    {
                        keyNum = 0;
                    }

                    if (bestSurface == null || keyNum > bestKey)
                    {
                        bestSurface = go;
                        bestKey = keyNum;
                    }
                }
                if (bestSurface == null)
                {
                    foreach (GraphicObject go in Document.GraphicsCollection)
                    {
                        if (go.GraphicObjectType != espGraphicObjectType.espSurface) continue;

                        var keyStr = go.Key;
                        if (!double.TryParse(keyStr, NumberStyles.Float, CultureInfo.InvariantCulture, out var keyNum))
                        {
                            keyNum = 0;
                        }

                        if (bestSurface == null || keyNum > bestKey)
                        {
                            bestSurface = go;
                            bestKey = keyNum;
                        }
                    }
                }
                if (bestSurface != null)
                {
                    Trace.WriteLine($"[TryGetAnySurfaceInfo] Selected espSurface: Key={bestSurface.Key}");
                    return new Tuple<int, string>(19, bestSurface.Key);
                }
                foreach (GraphicObject go in Document.GraphicsCollection)
                {
                    if (go.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        Trace.WriteLine($"[TryGetAnySurfaceInfo] Found espSTL_Model: Key={go.Key}, Type={(int)go.GraphicObjectType}");
                        return new Tuple<int, string>((int)go.GraphicObjectType, go.Key);
                    }
                }
            }
            catch (Exception ex) { Trace.WriteLine($"[TryGetAnySurfaceInfo] Error: {ex.Message}"); }
            return null;
        }

        private static bool ToolExistsInDocument(string toolId)
        {
            if (string.IsNullOrWhiteSpace(toolId)) return false;
            foreach (Tool t in (IEnumerable)Document.Tools)
            {
                if (string.Equals(t.ToolID, toolId, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        private static void RemoveBallMillToolById(string toolId)
        {
            if (string.IsNullOrWhiteSpace(toolId)) return;
            try
            {
                var tools = Document.Tools;
                if (tools == null) return;

                var toolsType = tools.GetType();
                var countProp = toolsType.GetProperty("Count");
                var itemProp = toolsType.GetProperty("Item");
                var removeMethod = toolsType.GetMethod("Remove");
                if (countProp == null || itemProp == null || removeMethod == null) return;

                int count = 0;
                try { count = (int)countProp.GetValue(tools); } catch { return; }

                for (int i = count; i >= 1; i--)
                {
                    Tool tool = null;
                    try { tool = itemProp.GetValue(tools, new object[] { i }) as Tool; } catch { }
                    if (tool == null) continue;

                    var id = tool.ToolID ?? string.Empty;
                    var upper = id.ToUpperInvariant().Trim();
                    var targetUpper = toolId.ToUpperInvariant().Trim();

                    // ToolStyle와 무관하게 ToolID에 BM_D2가 포함되면 제거
                    if (upper.Contains(targetUpper))
                    {
                        try { removeMethod.Invoke(tools, new object[] { i }); } catch { }
                        Trace.WriteLine($"[RemoveBallMillToolById] Removed tool: {id}");
                    }
                }
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[RemoveBallMillToolById] Error: {ex.Message}");
            }
        }

        private static string GetBallMillOperationName(string toolId, string fallback)
        {
            if (!string.IsNullOrWhiteSpace(toolId))
            {
                var upper = toolId.Trim().ToUpperInvariant();
                if (upper.StartsWith("BM_D", StringComparison.Ordinal))
                {
                    return upper;
                }

                if (TryParseDiameterFromHint(upper, out var diameter) && diameter > 0)
                {
                    var rounded = Math.Round(diameter, 3);
                    if (Math.Abs(rounded - Math.Round(rounded)) < 0.001)
                    {
                        return "BM_D" + ((int)Math.Round(rounded)).ToString(CultureInfo.InvariantCulture);
                    }
                    return "BM_D" + rounded.ToString("0.###", CultureInfo.InvariantCulture);
                }
            }
            return fallback;
        }

        private static FeatureChain FindLatestFeatureChainInLayer(string layerName, string excludeKey = null)
        {
            if (string.IsNullOrWhiteSpace(layerName)) return null;

            FeatureChain best = null;
            double bestKey = double.MinValue;

            foreach (FeatureChain fc in Document.FeatureChains)
            {
                if (fc?.Layer == null) continue;
                if (!string.Equals(fc.Layer.Name, layerName, StringComparison.OrdinalIgnoreCase)) continue;
                if (!string.IsNullOrWhiteSpace(excludeKey) && string.Equals(fc.Key, excludeKey, StringComparison.OrdinalIgnoreCase)) continue;

                if (double.TryParse(fc.Key, NumberStyles.Float, CultureInfo.InvariantCulture, out var keyNum))
                {
                    if (best == null || keyNum > bestKey)
                    {
                        best = fc;
                        bestKey = keyNum;
                    }
                }
                else
                {
                    if (best == null)
                    {
                        best = fc;
                        bestKey = 0;
                    }
                }
            }

            return best;
        }

        private static double CalculateMinY(FeatureChain fc)
        {
            if (fc == null) return 0;

            double minY = double.MaxValue;
            double step = 0.01;
            int steps;

            try
            {
                steps = (int)Math.Round(fc.Length / step, 0);
            }
            catch
            {
                steps = 0;
            }

            if (steps <= 0)
            {
                try
                {
                    var p = fc.Extremity(espExtremityType.espExtremityEnd);
                    minY = Math.Min(minY, p.Y);
                }
                catch { }
                try
                {
                    var p = fc.Extremity(espExtremityType.espExtremityStart);
                    minY = Math.Min(minY, p.Y);
                }
                catch { }

                return minY == double.MaxValue ? 0 : minY;
            }

            for (int i = 0; i <= steps; i++)
            {
                try
                {
                    var p = fc.PointAlong(i * step);
                    if (p != null && p.Y < minY) minY = p.Y;
                }
                catch { }
            }

            return minY == double.MaxValue ? 0 : minY;
        }

        private static void EnsureTurningProfiles(FeatureChain turning, bool spindleSide, string turningLayerName)
        {
            if (turning == null) return;

            double barRadius = Document.LatheMachineSetup.BarDiameter / 2.0;
            LowerY = CalculateMinY(turning);

            try
            {
                TurningTimes = (int)Math.Floor((barRadius - LowerY) / TurningDepth);
                double ratio = (barRadius - LowerY) / TurningDepth;
                if (ratio - TurningTimes > 0.1 && ratio - TurningTimes + TurningDepth > 1.05)
                {
                    TurningTimes++;
                }
                if (TurningTimes == 2) TurningTimes = 3;
                if (TurningTimes == 1) TurningTimes = 2;
                if (TurningTimes >= 15) TurningTimes = 15;
            }
            catch
            {
                TurningTimes = 4;
            }

            int baseTimes = Math.Max(TurningTimes, 4);

            for (int i = 1; i <= 3; i++)
            {
                string tempLayerName = "TurningProfileTemp" + i.ToString(CultureInfo.InvariantCulture);
                try { Document.Layers.Remove(tempLayerName); } catch { }
                Layer tempLayer = null;
                try { tempLayer = Document.Layers.Add(tempLayerName); } catch { tempLayer = Document.Layers[tempLayerName]; }
                Document.ActiveLayer = tempLayer;

                SelectionSet sel = GetOrCreateSelectionSet("Temp");
                sel.RemoveAll();
                try { sel.AddCopiesToSelectionSet = true; } catch { }
                sel.Add(turning, Type.Missing);

                double offsetY = (baseTimes - i) * TurningDepth;
                sel.Translate(0.0, offsetY, 0.0, 1);
                Document.Refresh(Type.Missing, Type.Missing);

                var created = FindLatestFeatureChainInLayer(tempLayerName, turning.Key);
                if (created != null)
                {
                    if (!spindleSide)
                    {
                        try { created.Reverse(); } catch { }
                    }
                    created.Name = "TurningProfile" + i.ToString(CultureInfo.InvariantCulture);
                    try { created.Layer = Document.Layers[turningLayerName]; } catch { }
                }

                try { Document.Layers.Remove(tempLayerName); } catch { }
            }
        }

        private static string GetToolIDFromTech(ITechnology tech)
        {
            if (tech is ITechLatheMillContour latheMill) return latheMill.ToolID;
            if (tech is ITechLatheContour latheContour) return latheContour.ToolID;
            if (tech is ITechLatheMill5xComposite composite) return composite.ToolID;
            if (tech is ITechLatheMoldRoughing roughing) return roughing.ToolID;
            if (tech is ITechLatheMoldZLevel zlevel) return zlevel.ToolID;
            try
            {
                var prop = tech?.GetType().GetProperty("ToolID");
                if (prop != null && prop.PropertyType == typeof(string))
                {
                    return prop.GetValue(tech, null) as string;
                }
            }
            catch { }
            return null;
        }

        private static void SetToolIDOnTech(ITechnology tech, string toolId)
        {
            if (tech == null || string.IsNullOrWhiteSpace(toolId)) return;
            if (tech is ITechLatheMillContour latheMill) latheMill.ToolID = toolId;
            else if (tech is ITechLatheContour latheContour) latheContour.ToolID = toolId;
            else if (tech is ITechLatheMill5xComposite composite) composite.ToolID = toolId;
            else if (tech is ITechLatheMoldRoughing roughing) roughing.ToolID = toolId;
            else if (tech is ITechLatheMoldZLevel zlevel) zlevel.ToolID = toolId;
            else
            {
                try
                {
                    var prop = tech.GetType().GetProperty("ToolID");
                    if (prop != null && prop.CanWrite && prop.PropertyType == typeof(string))
                    {
                        prop.SetValue(tech, toolId, null);
                    }
                }
                catch { }
            }
        }

        private static void TrySetTechBoundaryProfiles(ITechnology tech, string prcFileName)
        {
            if (tech == null || string.IsNullOrWhiteSpace(prcFileName)) return;

            string boundaryName = null;
            if (prcFileName.Equals(ProcessConfig.RoughMillingProcessFile, StringComparison.OrdinalIgnoreCase)) boundaryName = "RoughBoundry1";
            else if (prcFileName.Equals(ProcessConfig.O180BallMillingProcessFile, StringComparison.OrdinalIgnoreCase)) boundaryName = "Boundry1";
            else if (prcFileName.Equals(ProcessConfig.O90_270BallMillingProcessFile, StringComparison.OrdinalIgnoreCase)) boundaryName = "Boundry2";
            else return;

            FeatureChain fc = null;
            try { fc = FindFeatureChainByName(boundaryName); } catch { }
            if (fc == null) return;

            try
            {
                var prop = tech.GetType().GetProperty("BoundaryProfiles");
                if (prop == null || !prop.CanWrite || prop.PropertyType != typeof(string)) return;
                prop.SetValue(tech, "6," + fc.Key, null);
            }
            catch { }
        }

        private static void TrySetTechZLimits(ITechnology tech, string prcFileName)
        {
            if (tech == null || string.IsNullOrWhiteSpace(prcFileName)) return;
            if (!prcFileName.Equals(ProcessConfig.O180BallMillingProcessFile, StringComparison.OrdinalIgnoreCase) &&
                !prcFileName.Equals(ProcessConfig.O90_270BallMillingProcessFile, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            try
            {
                var topProp = tech.GetType().GetProperty("TopZLimit");
                var bottomProp = tech.GetType().GetProperty("BottomZLimit");
                if (topProp == null || bottomProp == null) return;
                if (!topProp.CanWrite || !bottomProp.CanWrite) return;

                double top = 1.0;
                double bottom = -1.0 * (Math.Abs(EndXValue) + Math.Abs(DownZ));

                if (topProp.PropertyType == typeof(double)) topProp.SetValue(tech, top, null);
                if (bottomProp.PropertyType == typeof(double)) bottomProp.SetValue(tech, bottom, null);
            }
            catch { }
        }

        private static string TryFindToolIdByHint(string toolIdHint, string prcName)
        {
            if (string.IsNullOrWhiteSpace(toolIdHint)) return null;
            var hint = toolIdHint.Trim();
            var upper = hint.ToUpperInvariant();

            double diameter;
            var wantsBall = upper.Contains("BM") || upper.Contains("BALL") || (!string.IsNullOrWhiteSpace(prcName) && prcName.ToUpperInvariant().Contains("BALL"));
            if (!TryParseDiameterFromHint(upper, out diameter))
            {
                return null;
            }

            if (wantsBall)
            {
                var preferred = FindBallMillByDiameter(diameter, true);
                if (!string.IsNullOrEmpty(preferred)) return preferred;
                var any = FindBallMillByDiameter(diameter, false);
                if (!string.IsNullOrEmpty(any)) return any;
            }
            return null;
        }

        private static bool TryParseDiameterFromHint(string upperHint, out double diameter)
        {
            diameter = 0;
            if (string.IsNullOrWhiteSpace(upperHint)) return false;

            var idx = upperHint.IndexOf("BM_D", StringComparison.Ordinal);
            if (idx >= 0)
            {
                return TryParseNumberToken(upperHint, idx + 4, out diameter);
            }

            idx = upperHint.IndexOf("EM", StringComparison.Ordinal);
            if (idx >= 0)
            {
                return TryParseNumberToken(upperHint, idx + 2, out diameter);
            }

            idx = upperHint.LastIndexOf('D');
            if (idx >= 0)
            {
                return TryParseNumberToken(upperHint, idx + 1, out diameter);
            }

            return false;
        }

        private static bool TryParseNumberToken(string s, int startIndex, out double value)
        {
            value = 0;
            if (string.IsNullOrEmpty(s) || startIndex < 0 || startIndex >= s.Length) return false;
            var i = startIndex;
            while (i < s.Length)
            {
                var c = s[i];
                if ((c >= '0' && c <= '9') || c == '.')
                {
                    i++;
                    continue;
                }
                break;
            }
            if (i <= startIndex) return false;
            var token = s.Substring(startIndex, i - startIndex);
            return double.TryParse(token, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
        }

        private static string FindBallMillByDiameter(double diameter, bool preferYPlus)
        {
            string fallback = null;
            foreach (Tool item in (IEnumerable)Document.Tools)
            {
                if (item.ToolStyle != espToolType.espMillToolBallMill) continue;
                var bm = item as ToolMillBallMill;
                if (bm == null) continue;
                if (Math.Abs(bm.ToolDiameter - diameter) > 0.1) continue;

                if (preferYPlus)
                {
                    if (bm.Orientation == espMillToolOrientation.espMillToolOrientationYPlus)
                    {
                        return bm.ToolID;
                    }
                    if (fallback == null) fallback = bm.ToolID;
                }
                else
                {
                    return bm.ToolID;
                }
            }

            // 일부 템플릿에서는 BallMill 캐스팅이 실패하거나 ToolStyle이 다른데 ToolDiameter만 제공되는 경우가 있어 fallback
            foreach (Tool item in (IEnumerable)Document.Tools)
            {
                if (!TryGetToolDiameter(item, out var d)) continue;
                if (Math.Abs(d - diameter) > 0.1) continue;

                if (preferYPlus)
                {
                    if (IsOrientationYPlus(item))
                    {
                        return item.ToolID;
                    }
                    if (fallback == null) fallback = item.ToolID;
                }
                else
                {
                    return item.ToolID;
                }
            }

            return fallback;
        }

        private static bool TryGetToolDiameter(object tool, out double diameter)
        {
            diameter = 0;
            if (tool == null) return false;
            try
            {
                var prop = tool.GetType().GetProperty("ToolDiameter");
                if (prop == null) return false;
                var v = prop.GetValue(tool, null);
                if (v is double dd)
                {
                    diameter = dd;
                    return true;
                }
                if (v is float ff)
                {
                    diameter = ff;
                    return true;
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        private static bool IsOrientationYPlus(object tool)
        {
            if (tool == null) return false;
            try
            {
                var prop = tool.GetType().GetProperty("Orientation");
                if (prop == null) return false;
                var v = prop.GetValue(tool, null);
                if (v is espMillToolOrientation o)
                {
                    return o == espMillToolOrientation.espMillToolOrientationYPlus;
                }
                if (v is int i)
                {
                    return i == (int)espMillToolOrientation.espMillToolOrientationYPlus;
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        private static List<FeatureChain> FindFeatureChainsBySuffix(string suffix)
        {
            var list = new List<FeatureChain>();
            foreach (FeatureChain fc in Document.FeatureChains)
            {
                if (fc.Name != null && fc.Name.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                {
                    list.Add(fc);
                }
            }
            return list;
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
                var fromSettings = TryResolvePrcFromDentalHost(targetFileName);
                if (!string.IsNullOrWhiteSpace(fromSettings))
                {
                    Trace.WriteLine($"[ResolvePrcPath] PRC resolved from settings: {fromSettings}");
                    return fromSettings;
                }

                var files = Directory.GetFiles(rootDir, "*.prc", SearchOption.AllDirectories);
                foreach (var f in files)
                {
                    if (string.Equals(Path.GetFileName(f), targetFileName, StringComparison.OrdinalIgnoreCase))
                    {
                        Trace.WriteLine($"[ResolvePrcPath] Found PRC file: {f}");
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

        private static string TryResolvePrcFromDentalHost(string prcFileName)
        {
            try
            {
                var data = Connect.DentalHost?.CurrentData;
                if (data == null || data.PrcFilePath == null)
                {
                    return null;
                }

                for (int i = 1; i < data.PrcFilePath.Length; i++)
                {
                    var raw = data.PrcFilePath[i];
                    if (string.IsNullOrWhiteSpace(raw)) continue;
                    var path = raw.Trim();
                    if (!Path.IsPathRooted(path) && !string.IsNullOrWhiteSpace(data.PrcDirectory))
                    {
                        path = Path.Combine(data.PrcDirectory, path);
                    }

                    if (File.Exists(path))
                    {
                        if (string.Equals(Path.GetFileName(path), prcFileName, StringComparison.OrdinalIgnoreCase))
                        {
                            return path;
                        }
                        continue;
                    }

                    if (Directory.Exists(path))
                    {
                        var candidate = Path.Combine(path, prcFileName);
                        if (File.Exists(candidate))
                        {
                            return candidate;
                        }

                        var files = Directory.GetFiles(path, "*.prc", SearchOption.TopDirectoryOnly);
                        foreach (var f in files)
                        {
                            if (string.Equals(Path.GetFileName(f), prcFileName, StringComparison.OrdinalIgnoreCase))
                            {
                                return f;
                            }
                        }
                    }
                }
            }
            catch
            {
                return null;
            }

            return null;
        }

        private static void RemoveDuplicateBallOperations()
        {
            try
            {
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var targets = new[] { "BM_D4", "BM_D2", "BM_D1.2", "BM_D1,2", "BM_D1_2" };

                for (int i = Document.Operations.Count; i >= 1; i--)
                {
                    Operation op = null;
                    try { op = Document.Operations[i]; } catch { }
                    if (op == null) continue;

                    var name = op.Name?.Trim();
                    if (string.IsNullOrWhiteSpace(name)) continue;

                    var upper = name.ToUpperInvariant();
                    var isBall = upper.StartsWith("BM_D");
                    var isTarget = targets.Any(t => upper.Equals(t.Replace(",", ".").ToUpperInvariant()));

                    if (!isBall && !isTarget) continue;

                    if (seen.Contains(upper))
                    {
                        try { Document.Operations.Remove(i); } catch { }
                        continue;
                    }
                    seen.Add(upper);
                }
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[RemoveDuplicateBallOperations] Error: {ex.Message}");
            }
        }

        /// <summary>
        /// 요구사항: 0-180의 BM_D4, 90-270의 BM_D2 제거
        /// </summary>
        private static void RemoveSpecificBallOperations()
        {
            try
            {
                for (int i = Document.Operations.Count; i >= 1; i--)
                {
                    Operation op = null;
                    try { op = Document.Operations[i]; } catch { }
                    if (op == null) continue;

                    var name = op.Name?.Trim();
                    if (string.IsNullOrWhiteSpace(name)) continue;

                    var upper = name.ToUpperInvariant();
                    // BM_D4만 제거 (BM_D2는 유지)
                    if (upper.StartsWith("BM_D4"))
                    {
                        try { Document.Operations.Remove(i); } catch { }
                        continue;
                    }
                }
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"[RemoveSpecificBallOperations] Error: {ex.Message}");
            }
        }

        public static void Clean()
        {
            try
            {
                _compositeDriveSurfaceKey = null;

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
                    "RoughMillingOperation", "FreeFormMill", "CompositeMill", "EndTurning" 
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
                SelectionSet sel = GetOrCreateSelectionSet("Temp");
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

                // MoveSTL_Module.RotateSTL() 로직
                try { Document.Layers.Remove("Temp"); } catch { }
                Document.Layers.Add("Temp");
                Document.ActiveLayer = Document.Layers["Temp"];

                Document.FeatureRecognition.CreatePartProfileCrossSection(sel, Document.Planes["XYZ"], 
                    espGraphicObjectReturnType.espFeatureChains, false);
                
                bool flag = false;
                if (Document.FeatureChains.Count == 0) flag = true;
                else
                {
                    int maxAreaIdx = -1;
                    double maxArea = -1000;
                    for (int i = 1; i <= Document.FeatureChains.Count; i++)
                    {
                        var fc = Document.FeatureChains[i];
                        if (fc.IsClosed && fc.Area > maxArea)
                        {
                            maxArea = fc.Area;
                            maxAreaIdx = i;
                        }
                    }

                    if (maxAreaIdx > 0)
                    {
                        var profileFC = Document.FeatureChains[maxAreaIdx];
                        double minX = 1000, maxX = -1000;
                        for (int i = 0; i <= (int)Math.Round(profileFC.Length / 0.1); i++)
                        {
                            Point p = profileFC.PointAlong(i * 0.1);
                            if (p.X > maxX) maxX = p.X;
                            if (p.X < minX) minX = p.X;
                        }
                        if (minX < 0.0 && maxX > 0.0) flag = true;
                    }
                }

                try { Document.Layers.Remove("Temp"); } catch { }

                if (flag)
                {
                    Point p0 = Document.GetPoint(0, 0, 0);
                    Point pZ = Document.GetPoint(0, 0, 1);
                    Segment segmentZ = Document.GetSegment(p0, pZ);
                    Point pY = Document.GetPoint(0, 1, 0);
                    Segment segmentY = Document.GetSegment(p0, pY);

                    // CreatePartProfileShadow for Y-axis check
                    Document.Layers.Add("Temp");
                    Document.ActiveLayer = Document.Layers["Temp"];
                    Document.FeatureRecognition.CreatePartProfileShadow(sel, Document.Planes["XYZ"], espGraphicObjectReturnType.espFeatureChains);
                    
                    if (Document.FeatureChains.Count > 0)
                    {
                        var fc = Document.FeatureChains[Document.FeatureChains.Count];
                        double minY = 1000, maxY = -1000;
                        for (int i = 0; i <= (int)Math.Round(fc.Length / 0.1); i++)
                        {
                            Point p = fc.PointAlong(i * 0.1);
                            if (p.Y > maxY) maxY = p.Y;
                            if (p.Y < minY) minY = p.Y;
                        }

                        int num10 = 0, num11 = 0;
                        if (minY <= 0.1 && maxY <= 0.1) { num10 = 3; num11 = -1; }
                        else if (minY >= -0.1 && maxY >= 0.0) { num10 = 3; num11 = 1; }
                        else if (minY < 0.1 && maxY > -0.1) { num10 = 2; }

                        if (num10 == 2)
                        {
                            Document.FeatureRecognition.CreatePartProfileShadow(sel, Document.Planes["YZX"], espGraphicObjectReturnType.espFeatureChains);
                            var fcYZ = Document.FeatureChains[Document.FeatureChains.Count];
                            double minZ = 1000, maxZ = -1000;
                            for (int i = 0; i <= (int)Math.Round(fcYZ.Length / 0.1); i++)
                            {
                                Point p = fcYZ.PointAlong(i * 0.1);
                                if (p.Z > maxZ) maxZ = p.Z;
                                if (p.Z < minZ) minZ = p.Z;
                            }
                            if (minZ <= 0.1 && maxZ <= 0.1) num11 = -1;
                            else if (minZ >= -0.1 && maxZ >= 0.0) num11 = 1;
                        }

                        if (num10 == 3 && num11 == -1) sel.Rotate(segmentZ, spindleSide ? Math.PI / 2.0 : -Math.PI / 2.0, Type.Missing);
                        else if (num10 == 3 && num11 == 1) sel.Rotate(segmentZ, spindleSide ? -Math.PI / 2.0 : Math.PI / 2.0, Type.Missing);
                        else if (num10 == 2 && num11 == -1) sel.Rotate(segmentY, spindleSide ? -Math.PI / 2.0 : Math.PI / 2.0, Type.Missing);
                        else if (num10 == 2 && num11 == 1) sel.Rotate(segmentY, spindleSide ? Math.PI / 2.0 : -Math.PI / 2.0, Type.Missing);
                    }
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
                SelectionSet sel = GetOrCreateSelectionSet("Temp");
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

                // MoveSTL_Module.MoveSTL() 로직
                // 섀도우 프로파일을 생성하여 X축(ESPRIT의 Z축 방향) 경계를 찾음
                Document.FeatureRecognition.CreatePartProfileShadow(sel, Document.Planes["XYZ"], espGraphicObjectReturnType.espFeatureChains);
                FeatureChain fc = Document.FeatureChains[Document.FeatureChains.Count];
                
                double minX = 9999999, maxX = -9999999;
                for (double d = 0; d <= fc.Length; d += 0.01)
                {
                    Point p = fc.PointAlong(d);
                    if (p.X < minX) minX = p.X;
                    if (p.X > maxX) maxX = p.X;
                }

                // 원점 정렬: 모델의 왼쪽 끝(minX)을 X=0으로 이동 (사용자 요청: Z_max가 원점으로)
                // ESPRIT의 터닝 환경에서 모델의 왼쪽 끝이 원점(0)에 위치해야 함
                double shiftX = -minX;
                sel.Translate(shiftX, 0, 0, Type.Missing);

                EndXValue = maxX + shiftX;
                
                Trace.WriteLine($"[MoveSTL] Alignment: minX={minX:F4}, maxX={maxX:F4}, shift={shiftX:F4}, EndXValue={EndXValue:F4}.");

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
                try { Document.Layers.Remove("Boundry"); } catch { }
                Layer layer = Document.Layers.Add("Boundry");
                Document.ActiveLayer = layer;

                double barDia = 10.0;
                // 피드백 반영: Boundry1이 제품을 충분히 포함하도록 Point1Y(-0.68), Point2Y(-8.0) 기반으로 생성
                // ESPRIT 좌표계: X축이 길이방향, Y축이 직경방향
                Point p1 = Document.GetPoint(0, barDia / 2.0, 0);
                Point p2 = Document.GetPoint(ProcessConfig.Point2Y, -barDia / 2.0, 0);

                // Boundry1 (Blue)
                FeatureChain fc1 = Document.FeatureChains.Add(p1);
                fc1.Add(Document.GetSegment(p1, Document.GetPoint(p1.X, p2.Y, 0)));
                fc1.Add(Document.GetSegment(Document.GetPoint(p1.X, p2.Y, 0), p2));
                fc1.Add(Document.GetSegment(p2, Document.GetPoint(p2.X, p1.Y, 0)));
                fc1.Add(Document.GetSegment(Document.GetPoint(p2.X, p1.Y, 0), p1));
                fc1.Color = 0xFF0000; // Blue (ESPRIT BGR)
                fc1.Name = "Boundry1";

                // RoughBoundry1 (Green) - Rough Mill 3D용 바운더리 (Boundry1과 동일 영역)
                FeatureChain rfc = Document.FeatureChains.Add(p1);
                rfc.Add(Document.GetSegment(p1, Document.GetPoint(p1.X, p2.Y, 0)));
                rfc.Add(Document.GetSegment(Document.GetPoint(p1.X, p2.Y, 0), p2));
                rfc.Add(Document.GetSegment(p2, Document.GetPoint(p2.X, p1.Y, 0)));
                rfc.Add(Document.GetSegment(Document.GetPoint(p2.X, p1.Y, 0), p1));
                rfc.Color = 0x00FF00; // Green
                rfc.Name = "RoughBoundry1";

                // Boundry2 (Blue - Rotated from fc1)
                Point axisStart = Document.GetPoint(-20, 0, 0);
                Point axisEnd = Document.GetPoint(20, 0, 0);
                Segment axis = Document.GetSegment(axisStart, axisEnd);

                SelectionSet sel = GetOrCreateSelectionSet("Temp");
                sel.RemoveAll();
                sel.Add(fc1, Type.Missing);
                sel.Rotate(axis, Math.PI / 2.0, 1);
                
                foreach (FeatureChain childFc in Document.FeatureChains)
                {
                    if (childFc.Key != fc1.Key && childFc.Key != rfc.Key && (string.IsNullOrEmpty(childFc.Name) || childFc.Name == "Boundry1"))
                    {
                        childFc.Name = "Boundry2";
                        childFc.Color = 0xFF0000;
                        break;
                    }
                }
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
            plane.IsView = true; // UVW 축 표시를 위해 IsView를 true로 설정
            plane.Activate(); // 평면 활성화
        }

        public static void TurningMain(bool spindleSide)
        {
            try
            {
                SelectionSet sel = GetOrCreateSelectionSet("Temp");
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

                Plane plane = Document.Planes["XYZ"];
                Document.FeatureRecognition.CreateTurningProfile(sel, plane, 
                    espTurningProfileType.espTurningProfileOD,
                    espGraphicObjectReturnType.espFeatureChains,
                    espTurningProfileLocationType.espTurningProfileLocationTop,
                    0.01, 0.01, 5.0);

                tfc = FindLatestFeatureChainInLayer("TurningLayer");
                if (tfc == null) return;
                if (!spindleSide)
                {
                    try { tfc.Reverse(); } catch { }
                }
                tfc.Name = "Turning";

                EnsureTurningProfiles(tfc, spindleSide, "TurningLayer");

                Trace.WriteLine("[TurningMain] Turning and TurningProfile1~3 created.");
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
                return;
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
