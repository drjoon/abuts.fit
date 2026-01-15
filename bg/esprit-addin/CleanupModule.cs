using System;
using Esprit;

namespace DentalAddin
{
    /// <summary>
    /// 문서 정리 모듈
    /// </summary>
    public static class CleanupModule
    {
        public static void CleanDocument(DentalContext context)
        {
            try
            {
                Document doc = context.Document;

                // 기존 FeatureChain 제거
                int count = doc.FeatureChains.Count;
                if (count > 0)
                {
                    for (int i = count; i >= 1; i--)
                    {
                        doc.FeatureChains.Remove(i);
                    }
                }

                // 특정 레이어 제거
                string[] layersToRemove = new string[]
                {
                    "Boundry", "TurningLayer", "RoughMillingLayer", 
                    "RotateCenter", "GeoTemp", "FreeFormLayer",
                    "FaceDrill", "TurnOperation", "RoughMillingOperation",
                    "FreeFormMill", "EndTurning", "Temp"
                };

                for (int i = doc.Layers.Count; i >= 1; i--)
                {
                    Layer layer = doc.Layers[i];
                    foreach (string layerName in layersToRemove)
                    {
                        if (string.Equals(layer.Name, layerName, StringComparison.OrdinalIgnoreCase))
                        {
                            doc.Layers.Remove(layer.Name);
                            break;
                        }
                    }
                }

                context.Reset();
            }
            catch (Exception)
            {
                // 정리 실패 시 무시
            }
        }
    }
}
