using System;
using System.Reflection;
using Esprit;
using EspritConstants;

namespace DentalAddin
{
    /// <summary>
    /// STL 모델 처리 모듈
    /// </summary>
    public static class STLProcessor
    {
        public static bool ProcessSTLModel(DentalContext context)
        {
            try
            {
                Document doc = context.Document;

                // STL 모델 찾기
                SelectionSet selectionSet = GetOrCreateSelectionSet(doc, "STLTemp");
                selectionSet.RemoveAll();

                GraphicObject stlModel = null;
                foreach (GraphicObject item in doc.GraphicsCollection)
                {
                    if (item.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        stlModel = item;
                        selectionSet.Add(item, Missing.Value);
                        break;
                    }
                }

                if (stlModel == null)
                {
                    context.EspritApp.OutputWindow.Text("STL 모델을 찾을 수 없습니다.\r\n");
                    return false;
                }

                // STL 위치 및 방향 분석
                AnalyzeSTLOrientation(context, selectionSet);

                return true;
            }
            catch (Exception ex)
            {
                context.EspritApp.OutputWindow.Text($"STL 처리 오류: {ex.Message}\r\n");
                return false;
            }
        }

        private static void AnalyzeSTLOrientation(DentalContext context, SelectionSet selectionSet)
        {
            try
            {
                Document doc = context.Document;
                Plane xyzPlane = doc.Planes["XYZ"];

                // 임시 레이어 생성
                Layer tempLayer = GetOrCreateLayer(doc, "STLAnalysisTemp");
                doc.ActiveLayer = tempLayer;

                // 단면 프로파일 생성
                doc.FeatureRecognition.CreatePartProfileCrossSection(
                    selectionSet, 
                    xyzPlane, 
                    espGraphicObjectReturnType.espFeatureChains, 
                    false);

                doc.Refresh(Missing.Value, Missing.Value);

                // 분석 후 임시 레이어 제거
                try
                {
                    doc.Layers.Remove("STLAnalysisTemp");
                }
                catch { }
            }
            catch (Exception)
            {
                // 방향 분석 실패 시 기본값 사용
            }
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
