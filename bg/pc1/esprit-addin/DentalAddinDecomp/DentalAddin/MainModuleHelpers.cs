using Abuts.EspritAddIns.ESPRIT2025AddinProject;
using Esprit;
using EspritConstants;
using EspritGeometry;
using Microsoft.VisualBasic.CompilerServices;
using System;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;

namespace DentalAddin
{
    internal sealed partial class MainModule
    {
        private static string EnsureTrailingSeparator(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return string.Empty;
            }

            if (path.EndsWith("\\", StringComparison.Ordinal) || path.EndsWith("/", StringComparison.Ordinal))
            {
                return path;
            }

            return path + Path.DirectorySeparatorChar;
        }

        private static string ResolveSurfaceRoot()
        {
            string preferred = AppConfig.SurfaceRootDirectory;
            if (!string.IsNullOrWhiteSpace(preferred) && Directory.Exists(preferred))
            {
                return preferred;
            }

            string fallback = Path.Combine(AppConfig.AddInRootDirectory, "Surface");
            if (!Directory.Exists(fallback))
            {
                try
                {
                    Directory.CreateDirectory(fallback);
                }
                catch (Exception ex)
                {
                    DentalLogger.Log($"ResolveSurfaceRoot - Surface 디렉터리 생성 실패: {ex.Message}");
                }
            }

            return fallback;
        }

        private static SelectionSet EnsureSelectionSet(string name)
        {
            if (Document?.SelectionSets == null)
            {
                DentalLogger.Log($"SelectionSet 확보 실패 - Document.SelectionSets null (name:{name})");
                return null;
            }

            SelectionSet selectionSet = null;
            try
            {
                selectionSet = Document.SelectionSets[name];
            }
            catch
            {
            }

            if (selectionSet != null)
            {
                return selectionSet;
            }

            try
            {
                selectionSet = Document.SelectionSets.Add(name);
            }
            catch (Exception ex)
            {
                DentalLogger.Log($"SelectionSet 생성 실패 - name:{name}, msg:{ex.Message}");
            }

            return selectionSet;
        }

        private static bool TryAddToSelectionSet(SelectionSet selectionSet, object item, string context)
        {
            if (selectionSet == null)
            {
                DentalLogger.Log($"TryAddToSelectionSet 실패 - SelectionSet null ({context})");
                return false;
            }
            if (item == null)
            {
                DentalLogger.Log($"TryAddToSelectionSet 건너뜀 - item null ({context})");
                return false;
            }

            try
            {
                selectionSet.Add(item, RuntimeHelpers.GetObjectValue(Missing.Value));
                return true;
            }
            catch (Exception ex)
            {
                string typeName = null;
                try { typeName = item.GetType().Name; } catch { }
                DentalLogger.Log($"TryAddToSelectionSet 실패 ({context}) itemType={typeName ?? "unknown"}, err={ex.GetType().Name}:{ex.Message}");
                return false;
            }
        }

        private static GraphicObject GetLatestSurface(string context)
        {
            if (Document?.GraphicsCollection == null)
            {
                DentalLogger.Log($"{context} - GraphicsCollection null");
                return null;
            }

            int count = Document.GraphicsCollection.Count;
            if (count <= 0)
            {
                DentalLogger.Log($"{context} - GraphicsCollection 비어있음");
                return null;
            }

            GraphicObject result = null;
            for (int i = count; i >= 1; i--)
            {
                try
                {
                    GraphicObject item = (GraphicObject)Document.GraphicsCollection[i];
                    if (item?.GraphicObjectType == espGraphicObjectType.espSurface)
                    {
                        result = item;
                        break;
                    }
                }
                catch
                {
                }
            }

            if (result == null)
            {
                DentalLogger.Log($"{context} - Surface 타입 GraphicObject를 찾지 못함 (total:{count})");
            }

            return result;
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

        private static Plane GetOrCreatePlane(string name, string fallbackName = null)
        {
            if (string.IsNullOrWhiteSpace(name) || Document?.Planes == null)
            {
                return null;
            }

            try
            {
                Plane direct = Document.Planes[name];
                if (direct != null)
                {
                    return direct;
                }
            }
            catch
            {
            }

            if (!string.IsNullOrWhiteSpace(fallbackName))
            {
                try
                {
                    Plane fallback = Document.Planes[fallbackName];
                    if (fallback != null)
                    {
                        return fallback;
                    }
                }
                catch
                {
                }
            }

            int count = Document.Planes.Count;
            for (int i = 1; i <= count; i++)
            {
                Plane candidate = Document.Planes[i];
                if (candidate != null && Operators.CompareString(candidate.Name, name, false) == 0)
                {
                    return candidate;
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

        private static bool LogGraphicObjectIsNull(object obj, string context, string suggestion = null, bool stopProcess = false)
        {
            if (obj != null)
            {
                return false;
            }

            string msg = $"{context} - GraphicObject null";
            if (!string.IsNullOrWhiteSpace(suggestion))
            {
                msg += $" | 제안: {suggestion}";
            }
            if (stopProcess)
            {
                msg += " | 공정 중단";
            }
            DentalLogger.Log(msg);
            return true;
        }

        private static void LogFeatureChainSummary(string context, string[] requiredNames = null)
        {
            if (Document?.FeatureChains == null)
            {
                DentalLogger.Log($"{context} - FeatureChains null");
                return;
            }

            int count = Document.FeatureChains.Count;
            DentalLogger.Log($"{context} - FeatureChains.Count={count}");

            if (requiredNames != null && requiredNames.Length > 0)
            {
                foreach (string name in requiredNames)
                {
                    bool found = false;
                    for (int i = 1; i <= count; i++)
                    {
                        try
                        {
                            FeatureChain fc = Document.FeatureChains[i];
                            if (fc != null && Operators.CompareString(fc.Name, name, false) == 0)
                            {
                                found = true;
                                DentalLogger.Log($"{context} - Required FeatureChain '{name}' 확보됨 (Key:{fc.Key})");
                                break;
                            }
                        }
                        catch
                        {
                        }
                    }
                    if (!found)
                    {
                        DentalLogger.Log($"{context} - Required FeatureChain '{name}' 누락");
                    }
                }
            }
        }

        private static void LogFreeFormFeatureSummary(string context, string[] requiredNames = null)
        {
            if (Document?.FreeFormFeatures == null)
            {
                DentalLogger.Log($"{context} - FreeFormFeatures null");
                return;
            }

            int count = Document.FreeFormFeatures.Count;
            DentalLogger.Log($"{context} - FreeFormFeatures.Count={count}");

            if (requiredNames != null && requiredNames.Length > 0)
            {
                foreach (string name in requiredNames)
                {
                    bool found = false;
                    for (int i = 1; i <= count; i++)
                    {
                        try
                        {
                            FreeFormFeature ff = Document.FreeFormFeatures[i];
                            if (ff != null && Operators.CompareString(ff.Name, name, false) == 0)
                            {
                                found = true;
                                DentalLogger.Log($"{context} - Required FreeFormFeature '{name}' 확보됨");
                                break;
                            }
                        }
                        catch
                        {
                        }
                    }
                    if (!found)
                    {
                        DentalLogger.Log($"{context} - Required FreeFormFeature '{name}' 누락");
                    }
                }
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
    }
}
