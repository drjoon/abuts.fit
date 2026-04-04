using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using Esprit;
using EspritConstants;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers
{
    /// <summary>
    /// ESPRIT Document 관리 및 초기화 유틸리티
    /// </summary>
    public class EspritDocumentManager
    {
        private readonly Application _espApp;

        public EspritDocumentManager(Application espApp)
        {
            _espApp = espApp ?? throw new ArgumentNullException(nameof(espApp));
        }

        public void EnsureCleanDocument(Document document)
        {
            if (document == null)
            {
                return;
            }

            try
            {
                AppLogger.Log($"EspritDocumentManager: 초기화 전 - Ops:{SafeCount(document?.Operations)}, Chains:{SafeCount(document?.FeatureChains)}, FreeForms:{SafeCount(document?.FreeFormFeatures)}, Graphics:{SafeCount(document?.GraphicsCollection)}");

                try
                {
                    if (document.SelectionSets != null)
                    {
                        int ssCount = document.SelectionSets.Count;
                        for (int i = 1; i <= ssCount && i <= document.SelectionSets.Count; i++)
                        {
                            SelectionSet ss = document.SelectionSets[i];
                            ss?.RemoveAll();
                        }
                    }
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"EspritDocumentManager: SelectionSets 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                try
                {
                    if (document.Operations != null)
                    {
                        for (int i = document.Operations.Count; i >= 1; i--)
                        {
                            document.Operations.Remove(i);
                        }
                    }
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"EspritDocumentManager: Operations 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                try
                {
                    if (document.FeatureChains != null)
                    {
                        for (int i = document.FeatureChains.Count; i >= 1; i--)
                        {
                            document.FeatureChains.Remove(i);
                        }
                    }
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"EspritDocumentManager: FeatureChains 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                try
                {
                    if (document.FreeFormFeatures != null)
                    {
                        for (int i = document.FreeFormFeatures.Count; i >= 1; i--)
                        {
                            document.FreeFormFeatures.Remove(i);
                        }
                    }
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"EspritDocumentManager: FreeFormFeatures 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                try
                {
                    if (document.FeatureSets != null)
                    {
                        for (int i = document.FeatureSets.Count; i >= 1; i--)
                        {
                            document.FeatureSets.Remove(i);
                        }
                    }
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"EspritDocumentManager: FeatureSets 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                try
                {
                    RemoveDentalAddinLayers(document);
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"EspritDocumentManager: DentalAddin 레이어 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                try
                {
                    CleanupGraphics(document);
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"EspritDocumentManager: GraphicsCollection 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                document.Refresh();
                AppLogger.Log($"EspritDocumentManager: 초기화 후 - Ops:{SafeCount(document?.Operations)}, Chains:{SafeCount(document?.FeatureChains)}, FreeForms:{SafeCount(document?.FreeFormFeatures)}, Graphics:{SafeCount(document?.GraphicsCollection)}");
                LogGraphicsTypeSummary(document, "EspritDocumentManager: 초기화 후");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"EspritDocumentManager: 문서 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static void RemoveDentalAddinLayers(Document document)
        {
            if (document?.Layers == null)
            {
                return;
            }

            string[] layerNames = new[]
            {
                "Boundry",
                "TurningLayer",
                "RoughMillingLayer",
                "RotateCenter",
                "GeoTemp",
                "FreeFormLayer",
                "FaceDrill",
                "TurnOperation",
                "RoughMillingOperation",
                "FreeFormMill",
                "RoughFreeFormMill",
                "CompositeMill",
                "EndTurning",
                EspritDocumentHelper.GetStlImportLayerName(),
            };

            foreach (string layerName in layerNames)
            {
                EspritDocumentHelper.RemoveLayerIfExists(document, layerName);
            }
        }

        private static void CleanupGraphics(Document document)
        {
            if (document == null || document.GraphicsCollection == null) return;

            int initialCount = document.GraphicsCollection.Count;
            if (initialCount == 0) return;

            if (initialCount > 1000)
            {
                int deletedSurfaceCount = CleanupTargetGraphics(document);
                AppLogger.Log($"EspritDocumentManager: CleanupGraphics 대량 모드 - count:{initialCount}, line/surface/segment/stl 삭제:{deletedSurfaceCount}, 남음:{SafeCount(document?.GraphicsCollection)}");
                return;
            }

            int totalDeletedCount = 0;
            for (int pass = 1; pass <= 3; pass++)
            {
                int passInitialCount = document.GraphicsCollection.Count;
                if (passInitialCount <= 0)
                {
                    break;
                }

                int deletedCount = 0;
                for (int i = passInitialCount; i >= 1; i--)
                {
                    try
                    {
                        int curCount = document.GraphicsCollection.Count;
                        if (curCount <= 0) break;
                        int idx = i > curCount ? curCount : i;
                        if (idx <= 0) continue;

                        dynamic obj = document.GraphicsCollection[idx];
                        if (obj == null) continue;

                        int rawType;
                        try { rawType = Convert.ToInt32(obj.GraphicObjectType); }
                        catch { continue; }

                        espGraphicObjectType type = (espGraphicObjectType)rawType;
                        bool shouldDelete =
                            type == espGraphicObjectType.espOperation ||
                            type == espGraphicObjectType.espFeatureChain ||
                            type == espGraphicObjectType.espFreeFormFeature ||
                            type == espGraphicObjectType.espFeatureSet ||
                            type == espGraphicObjectType.espSurface ||
                            type == espGraphicObjectType.espSTL_Model ||
                            type == espGraphicObjectType.espUnknown;
                        if (!shouldDelete) continue;

                        try
                        {
                            obj.Delete();
                            deletedCount++;
                        }
                        catch
                        {
                            try
                            {
                                var key = obj.Key;
                                if (key != null)
                                {
                                    document.GraphicsCollection.Remove(key);
                                    deletedCount++;
                                }
                            }
                            catch { }
                        }
                    }
                    catch (Exception ex)
                    {
                        AppLogger.Log($"EspritDocumentManager: CleanupGraphics 단일 객체 삭제 실패 - {ex.GetType().Name}:{ex.Message}");
                    }
                }

                totalDeletedCount += deletedCount;
                try
                {
                    document.Refresh();
                }
                catch
                {
                }

                AppLogger.Log($"EspritDocumentManager: CleanupGraphics pass:{pass} - 시작:{passInitialCount}, 삭제됨:{deletedCount}, 남음:{SafeCount(document?.GraphicsCollection)}");
                if (deletedCount == 0)
                {
                    break;
                }
            }

            if (totalDeletedCount > 0)
            {
                AppLogger.Log($"EspritDocumentManager: CleanupGraphics - 초기:{initialCount}, 삭제됨:{totalDeletedCount}, 남음:{document.GraphicsCollection.Count}");
            }
        }

        private static int CleanupTargetGraphics(Document document)
        {
            if (document?.GraphicsCollection == null)
            {
                return 0;
            }

            int totalDeleted = 0;
            int initialCount = document.GraphicsCollection.Count;
            var targetTypes = new HashSet<int>
            {
                (int)espGraphicObjectType.espLine,
                (int)espGraphicObjectType.espSurface,
                (int)espGraphicObjectType.espSegment,
                (int)espGraphicObjectType.espSTL_Model
            };

            AppLogger.Log($"EspritDocumentManager: CleanupTargetGraphics 시작 - 초기 count:{initialCount}");

            for (int i = initialCount; i >= 1; i--)
            {
                try
                {
                    int currentCount = document.GraphicsCollection.Count;
                    if (currentCount <= 0 || i > currentCount)
                    {
                        continue;
                    }

                    dynamic obj = null;
                    try
                    {
                        obj = document.GraphicsCollection[i];
                    }
                    catch (Exception ex)
                    {
                        AppLogger.Log($"EspritDocumentManager: CleanupTargetGraphics - 인덱스 {i} 접근 실패: {ex.Message}");
                        continue;
                    }

                    if (obj == null)
                    {
                        continue;
                    }

                    int rawType;
                    try
                    {
                        rawType = Convert.ToInt32(obj.GraphicObjectType, CultureInfo.InvariantCulture);
                    }
                    catch
                    {
                        continue;
                    }

                    if (!targetTypes.Contains(rawType))
                    {
                        continue;
                    }

                    string typeName = ((espGraphicObjectType)rawType).ToString();
                    string objKey = null;
                    try
                    {
                        objKey = obj.Key?.ToString();
                    }
                    catch
                    {
                    }

                    bool deleted = false;
                    string deleteMethod = "none";

                    try
                    {
                        obj.Delete();
                        deleted = true;
                        deleteMethod = "obj.Delete()";
                        totalDeleted++;
                    }
                    catch (Exception ex1)
                    {
                        try
                        {
                            document.GraphicsCollection.Remove(i);
                            deleted = true;
                            deleteMethod = "Remove(index)";
                            totalDeleted++;
                        }
                        catch (Exception ex2)
                        {
                            AppLogger.Log($"EspritDocumentManager: CleanupTargetGraphics - 삭제 실패 idx:{i}, type:{typeName}, key:{objKey ?? "null"}");
                            AppLogger.Log($"  Delete() 실패: {ex1.Message}");
                            AppLogger.Log($"  Remove(index) 실패: {ex2.Message}");
                        }
                    }

                    if (deleted && totalDeleted <= 5)
                    {
                        AppLogger.Log($"EspritDocumentManager: CleanupTargetGraphics - 삭제 성공 idx:{i}, type:{typeName}, method:{deleteMethod}");
                    }
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"EspritDocumentManager: CleanupTargetGraphics - 인덱스 {i} 처리 중 예외: {ex.GetType().Name}:{ex.Message}");
                }
            }

            try
            {
                document.Refresh();
            }
            catch
            {
            }

            int finalCount = SafeCount(document.GraphicsCollection);
            AppLogger.Log($"EspritDocumentManager: CleanupTargetGraphics 완료 - 초기:{initialCount}, 삭제:{totalDeleted}, 최종:{finalCount}");

            return totalDeleted;
        }

        private static void LogGraphicsTypeSummary(Document document, string context, int maxTypes = 12)
        {
            if (document?.GraphicsCollection == null)
            {
                AppLogger.Log($"{context} - GraphicsCollection null");
                return;
            }
            try
            {
                var counts = new Dictionary<string, int>(StringComparer.Ordinal);
                int total = document.GraphicsCollection.Count;
                for (int i = 1; i <= total; i++)
                {
                    object raw = null;
                    try { raw = document.GraphicsCollection[i]; } catch { continue; }
                    if (raw == null) continue;
                    string key = "unknown";
                    try
                    {
                        int rawType = Convert.ToInt32(((dynamic)raw).GraphicObjectType, CultureInfo.InvariantCulture);
                        key = Enum.IsDefined(typeof(espGraphicObjectType), rawType)
                            ? ((espGraphicObjectType)rawType).ToString()
                            : $"type:{rawType}";
                    }
                    catch
                    {
                    }
                    counts[key] = counts.TryGetValue(key, out int count) ? count + 1 : 1;
                }
                string summary = string.Join(", ",
                    counts.OrderByDescending(pair => pair.Value)
                        .ThenBy(pair => pair.Key, StringComparer.Ordinal)
                        .Take(Math.Max(1, maxTypes))
                        .Select(pair => $"{pair.Key}:{pair.Value}"));
                AppLogger.Log($"{context} - GraphicsSummary total:{total}{(string.IsNullOrWhiteSpace(summary) ? string.Empty : $", {summary}")}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"{context} - GraphicsSummary 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        public Document ResetDocument(Document document, double? backendMaterialDiameter)
        {
            if (document == null)
            {
                return null;
            }

            string tempEspPath = null;
            try
            {
                int templateDiameter = ResolveTemplateDiameter(backendMaterialDiameter);
                string templatePath = ResolveTemplatePath(templateDiameter);
                tempEspPath = BuildTempEspSavePath();

                document.SaveAs(tempEspPath);
                AppLogger.Log($"EspritDocumentManager: 임시 ESP 저장 완료 - {tempEspPath}");

                _espApp.New(templatePath);
                Document resetDocument = Connect.CurrentDocument;
                AppLogger.Log($"EspritDocumentManager: 리셋용 템플릿 문서 오픈 완료 - {templatePath}");
                return resetDocument;
            }
            catch (Exception ex)
            {
                AppLogger.Log($"EspritDocumentManager: 리셋용 템플릿 문서 오픈 실패 - {ex.GetType().Name}:{ex.Message}");
            }
            finally
            {
                TryDeleteTemporaryEspFile(tempEspPath);
            }

            return null;
        }

        public Document EnsureDocument(double? backendMaterialDiameter)
        {
            Document existing = Connect.CurrentDocument;
            if (existing == null)
            {
                int templateDiameter = ResolveTemplateDiameter(backendMaterialDiameter);
                AppLogger.Log($"EspritDocumentManager: 활성 문서가 없습니다. Hanwha_D{templateDiameter} 템플릿을 수동으로 연 뒤 다시 실행해주세요.");
                return null;
            }
            return existing;
        }

        private static int ResolveTemplateDiameter(double? backendMaterialDiameter)
        {
            int[] supported = new[] { 6, 8, 10, 12, 14 };
            double target = (backendMaterialDiameter.HasValue && backendMaterialDiameter.Value > 0)
                ? backendMaterialDiameter.Value
                : 6.0;
            int best = supported[0];
            double bestDiff = Math.Abs(target - best);
            for (int i = 1; i < supported.Length; i++)
            {
                double diff = Math.Abs(target - supported[i]);
                if (diff < bestDiff)
                {
                    best = supported[i];
                    bestDiff = diff;
                }
            }
            return best;
        }

        private static string ResolveTemplatePath(int templateDiameter)
        {
            string templateDir = Path.Combine(AppConfig.AddInRootDirectory, "Templates");
            return Path.Combine(templateDir, $"Hanwha.est");
        }

        private static string BuildTempEspSavePath()
        {
            string fileName = $"abuts-esprit-reset-{Guid.NewGuid():N}.esp";
            return Path.Combine(Path.GetTempPath(), fileName);
        }

        private static void TryDeleteTemporaryEspFile(string tempEspPath)
        {
            if (string.IsNullOrWhiteSpace(tempEspPath))
            {
                return;
            }

            try
            {
                if (File.Exists(tempEspPath))
                {
                    File.Delete(tempEspPath);
                    AppLogger.Log($"EspritDocumentManager: 임시 ESP 삭제 완료 - {tempEspPath}");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"EspritDocumentManager: 임시 ESP 삭제 실패 - {tempEspPath} ({ex.GetType().Name}:{ex.Message})");
            }
        }

        private static int SafeCount(object comCollection)
        {
            try
            {
                if (comCollection == null)
                {
                    return 0;
                }
                var prop = comCollection.GetType().GetProperty("Count");
                if (prop == null)
                {
                    return 0;
                }
                object raw = prop.GetValue(comCollection, null);
                return raw == null ? 0 : Convert.ToInt32(raw, CultureInfo.InvariantCulture);
            }
            catch
            {
                return -1;
            }
        }
    }
}
