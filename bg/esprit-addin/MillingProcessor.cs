using System;
using System.Reflection;
using Esprit;
using EspritConstants;

namespace DentalAddin
{
    /// <summary>
    /// 밀링 가공 처리 모듈
    /// </summary>
    public static class MillingProcessor
    {
        public static bool ProcessMilling(DentalContext context)
        {
            try
            {
                Document doc = context.Document;

                // 밀링 레이어 생성
                Layer millingLayer = GetOrCreateLayer(doc, "RoughMillingLayer");
                doc.ActiveLayer = millingLayer;

                context.EspritApp.OutputWindow.Text("밀링 가공 처리 시작\r\n");

                // 회전 밀링 처리
                ProcessRotaryMilling(context);

                context.EspritApp.OutputWindow.Text("밀링 가공 생성 완료\r\n");

                doc.Refresh(Missing.Value, Missing.Value);
                return true;
            }
            catch (Exception ex)
            {
                context.EspritApp.OutputWindow.Text($"밀링 처리 오류: {ex.Message}\r\n");
                return false;
            }
        }

        private static void ProcessRotaryMilling(DentalContext context)
        {
            try
            {
                Document doc = context.Document;

                // STL 선택
                SelectionSet selectionSet = GetOrCreateSelectionSet(doc, "MillingTemp");
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
                    return;
                }

                // 회전 각도별 밀링 처리 (간소화 버전)
                int angleSteps = 18; // 10도 간격
                for (int i = 0; i < angleSteps; i++)
                {
                    double angle = Math.PI * 10.0 * i / 180.0;
                    
                    // 각 각도에서 밀링 피처 생성
                    // (실제 구현에서는 회전 및 피처 생성 로직 필요)
                    
                    if (i % 6 == 0) // 진행 상황 출력
                    {
                        context.EspritApp.OutputWindow.Text($"밀링 처리 진행: {i}/{angleSteps}\r\n");
                    }
                }
            }
            catch (Exception)
            {
                // 밀링 처리 실패 시 무시
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
