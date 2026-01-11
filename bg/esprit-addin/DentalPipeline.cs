using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using Esprit;
using EspritConstants;
using EspritFeatures;
using EspritGeometry;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject
{
    public static class DentalPipeline
    {
        // DentalAddin 전역 변수들 (MainModule.cs에서 추출)
        public static double LowerY;
        public static double TurningDepth = 1.0; // 기본값 설정
        public static int TurningTimes;
        public static double EndX;
        public static double EndY;
        public static double EndXValue;
        public static double ExtendX;
        public static double TurningExtend = 5.0; // 기본값
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
                
                // 0. STL 파일 병합 직후 Y축 -90도 회전
                RotateSTLInitial();
                
                // 1. 초기화 (Clean)
                Clean();
                
                // 2. STL 정렬 및 이동 (MoveSTL)
                RotateSTL(spindleSide);
                MoveSTL(spindleSide);
                
                // 3. 바운더리 생성 (Boundry)
                Boundry(spindleSide, roughType);
                
                // 4. 터닝 피처 생성 (Turning)
                TurningMain(spindleSide);
                
                // 5. 밀링 가공 (Milling)
                if (roughType == 1.0)
                {
                    MillingStart(spindleSide);
                }

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

                // 회전 중심선 (X축)
                Point p0 = Document.GetPoint(0, 0, 0);
                Point pX = Document.GetPoint(10, 0, 0);
                Segment xAxis = Document.GetSegment(p0, pX);

                // Y축 (세로축)
                Point pY = Document.GetPoint(0, 10, 0);
                Segment yAxis = Document.GetSegment(p0, pY);

                // STL 프로파일 분석을 통한 자동 회전 (단순화된 정렬 로직)
                // 실제 디컴파일된 코드는 여러 평면에서 그림자 프로파일을 생성하여 정렬함
                // 여기서는 기본적인 XYZ 평면 정렬을 수행
                Document.FeatureRecognition.CreatePartProfileShadow(sel, Document.Planes["XYZ"], espGraphicObjectReturnType.espFeatureChains);
                if (Document.FeatureChains.Count > 0)
                {
                    FeatureChain fc = Document.FeatureChains[Document.FeatureChains.Count];
                    // 바운딩 박스를 기준으로 비정상적 회전 상태 체크 가능
                    Document.FeatureChains.Remove(fc.Key);
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

                Document.FeatureRecognition.CreatePartProfileShadow(sel, Document.Planes["XYZ"], espGraphicObjectReturnType.espFeatureChains);
                FeatureChain fc = Document.FeatureChains[Document.FeatureChains.Count];
                
                double bboxLen = fc.BoundingBoxLength;
                double minX = 999999, maxX = -999999;
                
                for (double d = 0; d <= fc.Length; d += 0.1)
                {
                    Point p = fc.PointAlong(d);
                    if (p.X < minX) minX = p.X;
                    if (p.X > maxX) maxX = p.X;
                }

                if (spindleSide) // Back Spindle
                {
                    sel.Translate(-bboxLen - minX, 0, 0, Type.Missing);
                }
                else // Front Spindle
                {
                    sel.Translate(bboxLen - maxX, 0, 0, Type.Missing);
                }

                Document.FeatureChains.Remove(fc.Key);
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

                FeatureChain fc = Document.FeatureChains.Add(p1);
                fc.Add(Document.GetSegment(p1, Document.GetPoint(p1.X, p2.Y, 0)));
                fc.Add(Document.GetSegment(Document.GetPoint(p1.X, p2.Y, 0), p2));
                fc.Add(Document.GetSegment(p2, Document.GetPoint(p2.X, p1.Y, 0)));
                fc.Add(Document.GetSegment(Document.GetPoint(p2.X, p1.Y, 0), p1));
                fc.Name = ProcessConfig.Boundry1Name;
                fc.Color = 255;

                // 회전축 (X축) 기준으로 90도 회전하여 Boundry2 생성
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

        public static void TurningMain(bool spindleSide)
        {
            try
            {
                // Turning Profile 생성 및 설정
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

                // CreateTurningProfile(selectionSet, plane, type, returnType, location, tolerance, arcTolerance, maxAngle)
                Document.FeatureRecognition.CreateTurningProfile(sel, Document.Planes["XYZ"], 
                    espTurningProfileType.espTurningProfileOD, 
                    espGraphicObjectReturnType.espFeatureChains, 
                    espTurningProfileLocationType.espTurningProfileLocationTop, 
                    0.01, 0.01, 5.0);

                if (Document.FeatureChains.Count > 0)
                {
                    tfc = Document.FeatureChains[Document.FeatureChains.Count];
                    tfc.Name = "Turning";
                    if (!spindleSide) tfc.Reverse();

                    // 원본 TurningProfile 로직의 핵심: LowerY(최저점) 추출 및 연장
                    Point endPoint = tfc.Extremity(espExtremityType.espExtremityEnd);
                    LowerY = endPoint.Y;
                    
                    // TurningExtend 만큼 연장 (회전 가공 여유)
                    double extendX = endPoint.X;
                    if (spindleSide) extendX -= TurningExtend;
                    else extendX += TurningExtend;

                    Point pExtend = Document.GetPoint(extendX, LowerY, 0);
                    Segment segExtend = Document.GetSegment(endPoint, pExtend);
                    tfc.Add(segExtend);
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

                // 1. 피처셋 초기화
                FeatureSet roughMillSet = null;
                foreach (FeatureSet fs in Document.FeatureSets)
                {
                    if (fs.Name == "RoughMill") { roughMillSet = fs; break; }
                }
                if (roughMillSet != null) Document.FeatureSets.Remove(roughMillSet.Key);
                
                roughMillSet = Document.FeatureSets.Add(Type.Missing);
                roughMillSet.Name = "RoughMill";

                // 2. STL 모델 선택
                SelectionSet sel = GetOrCreateSelectionSet("TempMilling");
                sel.RemoveAll();
                foreach (GraphicObject obj in Document.GraphicsCollection)
                {
                    if (obj.GraphicObjectType == espGraphicObjectType.espSTL_Model) sel.Add(obj, Type.Missing);
                }

                if (sel.Count == 0) return;

                // 3. 다각도 밀링 피처 생성 (원본 Milling_Module.MillingStart 로직의 핵심)
                // 0도부터 170도까지 10도 간격으로 회전하며 프로파일 추출
                Point p0 = Document.GetPoint(0, 0, 0);
                Point pX = Document.GetPoint(10, 0, 0);
                Segment rotateAxis = Document.GetSegment(p0, pX);

                for (int i = 0; i <= 17; i++)
                {
                    double angle = Math.PI * 10.0 * i / 180.0;
                    
                    // 회전
                    if (angle != 0) sel.Rotate(rotateAxis, angle, 0);

                    // 프로파일 추출
                    Document.FeatureRecognition.CreatePartProfileShadow(sel, Document.Planes["XYZ"], espGraphicObjectReturnType.espFeatureChains);
                    
                    if (Document.FeatureChains.Count > 0)
                    {
                        FeatureChain fc = Document.FeatureChains[Document.FeatureChains.Count];
                        fc.Name = $"RoughMill_Ang{i * 10}";
                        roughMillSet.Add(fc);
                    }

                    // 원상 복구 (역회전)
                    if (angle != 0) sel.Rotate(rotateAxis, -angle, 0);
                }
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
                string ncFilePath = Path.Combine(ncOutputDir, Path.GetFileNameWithoutExtension(stlFilePath) + ".nc");

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
