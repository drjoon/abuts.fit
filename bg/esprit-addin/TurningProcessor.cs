using System;
using System.Reflection;
using Esprit;
using EspritConstants;

namespace DentalAddin
{
    /// <summary>
    /// 선삭 가공 처리 모듈
    /// </summary>
    public static class TurningProcessor
    {
        public static bool ProcessTurning(DentalContext context)
        {
            try
            {
                Document doc = context.Document;

                // 선삭 프로파일 생성
                if (!CreateTurningProfile(context))
                {
                    return false;
                }

                // 선삭 횟수 계산
                CalculateTurningPasses(context);

                context.EspritApp.OutputWindow.Text($"선삭 가공 생성 완료 (패스 수: {context.TurningTimes})\r\n");

                doc.Refresh(Missing.Value, Missing.Value);
                return true;
            }
            catch (Exception ex)
            {
                context.EspritApp.OutputWindow.Text($"선삭 처리 오류: {ex.Message}\r\n");
                return false;
            }
        }

        private static bool CreateTurningProfile(DentalContext context)
        {
            try
            {
                Document doc = context.Document;

                // STL 선택
                SelectionSet selectionSet = GetOrCreateSelectionSet(doc, "TurningTemp");
                selectionSet.RemoveAll();

                foreach (GraphicObject item in doc.GraphicsCollection)
                {
                    if (item.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        selectionSet.Add(item, Missing.Value);
                        break;
                    }
                }

                if (selectionSet.Count == 0)
                {
                    return false;
                }

                // 선삭 레이어 생성
                Layer turningLayer = GetOrCreateLayer(doc, "TurningLayer");
                doc.ActiveLayer = turningLayer;

                Plane xyzPlane = doc.Planes["XYZ"];

                // 선삭 프로파일 생성
                doc.FeatureRecognition.CreateTurningProfile(
                    selectionSet,
                    xyzPlane,
                    espTurningProfileType.espTurningProfileOD,
                    espGraphicObjectReturnType.espFeatureChains,
                    espTurningProfileLocationType.espTurningProfileLocationTop,
                    0.01,
                    0.01,
                    5.0);

                // 최신 FeatureChain 찾기
                FeatureChain turningProfile = FindLatestFeatureChain(doc);
                if (turningProfile != null)
                {
                    turningProfile.Name = "Turning";
                    
                    // 스핀들 방향에 따라 반전
                    if (!context.SpindleSide)
                    {
                        turningProfile.Reverse();
                    }

                    // 끝점 정보 저장
                    Point endPoint = turningProfile.Extremity(espExtremityType.espExtremityEnd);
                    context.LowerY = endPoint.Y;
                    context.EndX = endPoint.X;
                    context.EndY = endPoint.Y;
                }

                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        private static void CalculateTurningPasses(DentalContext context)
        {
            try
            {
                Document doc = context.Document;
                double barDiameter = doc.LatheMachineSetup.BarDiameter;
                double depth = (barDiameter / 2.0 - context.LowerY) / context.TurningDepth;

                context.TurningTimes = (int)Math.Floor(depth);

                // 최소/최대 패스 수 조정
                if (context.TurningTimes < 2)
                {
                    context.TurningTimes = 2;
                }
                else if (context.TurningTimes > 15)
                {
                    context.TurningTimes = 15;
                }
            }
            catch (Exception)
            {
                context.TurningTimes = 3; // 기본값
            }
        }

        private static FeatureChain FindLatestFeatureChain(Document doc)
        {
            int maxKey = 0;
            FeatureChain latestChain = null;

            foreach (FeatureChain fc in doc.FeatureChains)
            {
                int key = int.Parse(fc.Key);
                if (key > maxKey)
                {
                    maxKey = key;
                    latestChain = fc;
                }
            }

            return latestChain;
        }

        private static SelectionSet GetOrCreateSelectionSet(Document doc, string name)
        {
            try
            {
                return doc.SelectionSets[name];
            }
            catch
            {
                return doc.SelectionSets.Add(name);
            }
        }

        private static Layer GetOrCreateLayer(Document doc, string name)
        {
            try
            {
                return doc.Layers[name];
            }
            catch
            {
                return doc.Layers.Add(name);
            }
        }
    }
}
