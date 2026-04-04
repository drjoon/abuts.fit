using System;
using System.Collections.Generic;
using System.Reflection;
using Esprit;
using EspritConstants;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers
{
    /// <summary>
    /// ESPRIT Document, Layer, SelectionSet 관련 유틸리티
    /// </summary>
    public static class EspritDocumentHelper
    {
        private const string StlImportLayerName = "AbutsStlImport";

        public static void LogBoundingBox(Document document, string context)
        {
            try
            {
                SelectionSet ss = GetOrCreateSelectionSet(document, "BoundingBoxLogger");
                ss?.RemoveAll();
                foreach (GraphicObject graphic in document.GraphicsCollection)
                {
                    if (graphic?.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        ss?.Add(graphic, Missing.Value);
                    }
                }
                if (ss == null || ss.Count == 0)
                {
                    AppLogger.Log($"{context}: BoundingBox - STL 미확인");
                    return;
                }
                double minX = double.PositiveInfinity, minY = double.PositiveInfinity, minZ = double.PositiveInfinity;
                double maxX = double.NegativeInfinity, maxY = double.NegativeInfinity, maxZ = double.NegativeInfinity;
                foreach (GraphicObject g in ss)
                {
                    try
                    {
                        dynamic dg = g;
                        var bbox = dg?.BoundingBox;
                        if (bbox == null) continue;
                        minX = Math.Min(minX, (double)bbox.MinX);
                        minY = Math.Min(minY, (double)bbox.MinY);
                        minZ = Math.Min(minZ, (double)bbox.MinZ);
                        maxX = Math.Max(maxX, (double)bbox.MaxX);
                        maxY = Math.Max(maxY, (double)bbox.MaxY);
                        maxZ = Math.Max(maxZ, (double)bbox.MaxZ);
                    }
                    catch { }
                }
                AppLogger.Log($"{context}: STL BoundingBox -> X[{minX:F3},{maxX:F3}] Y[{minY:F3},{maxY:F3}] Z[{minZ:F3},{maxZ:F3}]");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"{context}: BoundingBox 로깅 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        public static double? TryComputeFeatureChainMaxZ(FeatureChain chain, List<string> createdKeys)
        {
            if (chain == null)
            {
                return null;
            }
            double maxZ = double.NegativeInfinity;
            try
            {
                double length = chain.Length;
                double step = Math.Max(0.05, length / 800.0);
                for (double t = 0.0; t <= length; t += step)
                {
                    Point pt = chain.PointAlong(t);
                    if (pt == null) continue;
                    double z = pt.Z;
                    if (double.IsNaN(z) || double.IsInfinity(z)) continue;
                    if (z > maxZ) maxZ = z;
                }
                if (!double.IsNegativeInfinity(maxZ))
                {
                    AppLogger.Log($"EspritDocumentHelper: FeatureChain maxZ={maxZ:F4} (Points~{Math.Ceiling(chain.Length / step)})");
                    return maxZ;
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"EspritDocumentHelper: FeatureChain maxZ 계산 실패 - {ex.GetType().Name}:{ex.Message}");
            }
            return null;
        }

        public static SelectionSet GetOrCreateSelectionSet(Document document, string name)
        {
            if (document?.SelectionSets == null || string.IsNullOrWhiteSpace(name)) return null;
            try
            {
                SelectionSet existing = null;
                try { existing = document.SelectionSets[name]; } catch { }
                if (existing != null) return existing;
                return document.SelectionSets.Add(name);
            }
            catch
            {
                return null;
            }
        }

        public static Layer GetOrCreateLayer(Document document, string layerName)
        {
            if (document?.Layers == null || string.IsNullOrWhiteSpace(layerName))
            {
                return null;
            }
            try
            {
                Layer existing = null;
                try { existing = document.Layers[layerName]; } catch { }
                if (existing != null)
                {
                    return existing;
                }
                return document.Layers.Add(layerName);
            }
            catch
            {
                return null;
            }
        }

        public static void RemoveLayerIfExists(Document document, string layerName)
        {
            if (document?.Layers == null || string.IsNullOrWhiteSpace(layerName))
            {
                return;
            }
            try
            {
                Layer existing = null;
                try { existing = document.Layers[layerName]; } catch { }
                if (existing == null)
                {
                    return;
                }
                document.Layers.Remove(layerName);
                document.Refresh();
                AppLogger.Log($"EspritDocumentHelper: 레이어 제거 - {layerName}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"EspritDocumentHelper: 레이어 제거 실패 - {layerName} ({ex.GetType().Name}:{ex.Message})");
            }
        }

        public static string GetStlImportLayerName()
        {
            return StlImportLayerName;
        }
    }
}
