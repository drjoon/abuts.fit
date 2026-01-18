using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using DPTechnology.AnnexLibraries.EspritAnnex;
using Esprit;
using EspritConstants;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;
using Abuts.EspritAddIns.ESPRIT2025AddinProject;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject
{
    public class StlFileProcessor
    {
        private const string DefaultPrcRoot = @"C:\abuts.fit\bg\esprit-addin\AcroDent";

        private static readonly IReadOnlyDictionary<int, string> DefaultPrcFileMap = new Dictionary<int, string>
        {
            { 1, @"3_Turning prc\Turning.prc" },
            { 2, @"4_ReverseTurning prc\Reverse Turning Process.prc" },
            { 3, @"5_Rough prc\MillRough_3D.prc" },
            { 5, @"5_Rough prc\MillRough_2D.prc" },
            { 6, @"6_Semi_Rough prc\SemiRough_2D.prc" },
            { 7, @"7_FrontFace prc\FACE.prc" },
            { 9, @"8_0-180 prc\3D.prc" },
            { 10, @"9_90-270 prc\3D_2.prc" },
            { 11, @"11_Composite prc\5axisComposite.prc" },
            { 12, @"10_MarkText prc\MarkText.prc" }
        };

        private readonly Application _espApp;
        private readonly string _outputFolder;
        private readonly string _postProcessorFile;

        public string FaceHoleProcessFilePath { get; set; } = @"C:\abuts.fit\bg\esprit-addin\AcroDent\1_Face Hole\네오_R_Connection_H.prc";

        public string ConnectionMachiningProcessFilePath { get; set; } = @"C:\abuts.fit\bg\esprit-addin\AcroDent\2_Connection\네오_R_Connection.prc";

        public double DefaultFrontLimitX { get; set; } = 0.25;

        public double DefaultBackLimitX { get; set; } = 10.85;

        public StlFileProcessor(Application app, string outputFolder = @"C:\abuts.fit\bg\storage\3-nc",
            string postProcessorFile = "Acro_dent_XE.asc")
        {
            _espApp = app ?? throw new InvalidOperationException("ESPRIT Application not initialized");
            _outputFolder = outputFolder;
            _postProcessorFile = postProcessorFile;
        }

        public Esprit.PMTab exTab;

        public void Process(string stlPath, double? frontLimitX = null, double? backLimitX = null)
        {
            if (string.IsNullOrWhiteSpace(stlPath) || !File.Exists(stlPath))
            {
                AppLogger.Log($"StlFileProcessor: 잘못된 STL 경로 {stlPath}");
                return;
            }

            Directory.CreateDirectory(_outputFolder);

            Document document = EnsureDocument();
            if (document == null)
            {
                AppLogger.Log("StlFileProcessor: 활성화된 ESPRIT 문서를 만들 수 없습니다.");
                return;
            }

            double effectiveFrontLimit = frontLimitX ?? DefaultFrontLimitX;
            double effectiveBackLimit = backLimitX ?? DefaultBackLimitX;

            try
            {
                document.MergeFile(stlPath);
                Connect.SetCurrentDocument(document);
                
                Rotate90Degrees(document);

                FitActiveWindow(document);

                LogFreeFormFeatureSummary(document, "STL 병합/회전 직후", new[]
                {
                    "RoughBoundry1",
                    "RoughBoundry2",
                    "RoughBoundry3",
                    "3DRoughMilling_0Degree",
                    "3DRoughMilling_120Degree",
                    "3DRoughMilling_180Degree",
                    "3DRoughMilling_240Degree"
                });

                InvokeDentalAddin(document, effectiveFrontLimit, effectiveBackLimit);

                // DentalAddin.DentalPanel da = new DentalAddin.DentalPanel();
                // exTab = ApplicationUtilities.AddProjectManagerTab(da);
                // ApplicationUtilities.TryActivateProjectManagerTab(exTab.HWND);
                // da.InputFPointVal(0.25);
                // da.InputBPointVal(10.85);

                // RunPostProcessing(document, stlPath);
                // CleanupGraphics(document);
                document.Refresh();
                AppLogger.Log($"StlFileProcessor: 완료 - {stlPath}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: 처리 중 오류 - {ex.Message}");
                throw;
            }
        }

        private void RunPostProcessing(Document document, string stlPath)
        {
            string postDir = _espApp.Configuration.GetFileDirectory(espFileType.espFileTypePostProcessor);
            string postFilePath = Path.Combine(postDir, _postProcessorFile);
            string ncFileName = Path.Combine(_outputFolder, Path.ChangeExtension(Path.GetFileName(stlPath), ".nc"));

            document.NCCode.AddAll();
            document.NCCode.Execute(postFilePath, ncFileName);
        }

        private static void CleanupGraphics(Document document)
        {
            for (int idx = document.GraphicsCollection.Count; idx >= 1; idx--)
            {
                GraphicObject graphicObject = document.GraphicsCollection[idx] as GraphicObject;
                if (graphicObject == null)
                {
                    continue;
                }

                if (graphicObject.GraphicObjectType == espGraphicObjectType.espOperation ||
                    graphicObject.GraphicObjectType == espGraphicObjectType.espFeatureChain ||
                    graphicObject.GraphicObjectType == espGraphicObjectType.espFreeFormFeature ||
                    graphicObject.GraphicObjectType == espGraphicObjectType.espFeatureSet ||
                    graphicObject.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                {
                    document.GraphicsCollection.Remove(idx);
                }
            }
        }

        private Document EnsureDocument()
        {
            Document existing = Connect.CurrentDocument;
            if (existing != null)
            {
                return existing;
            }

            AppLogger.Log("StlFileProcessor: 활성 문서가 없습니다. Hanwha_D6 템플릿을 수동으로 연 뒤 다시 실행해주세요.");
            return null;
        }

        private void FitActiveWindow(Document document)
        {
            try
            {
                Window activeWindow = document?.Windows?.ActiveWindow;
                if (activeWindow == null)
                {
                    return;
                }

                activeWindow.Fit();
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: Fit 실패 - {ex.Message}");
            }
        }

        private void Rotate90Degrees(Document document)
        {
            if (document == null)
            {
                return;
            }

            const string selectionName = "StlProcessorTemp";
            SelectionSet selectionSet = GetOrCreateSelectionSet(document, selectionName);
            if (selectionSet == null)
            {
                AppLogger.Log("StlFileProcessor: SelectionSet 생성 실패");
                return;
            }

            selectionSet.RemoveAll();

            foreach (GraphicObject graphic in document.GraphicsCollection)
            {
                if (graphic?.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                {
                    selectionSet.Add(graphic, Missing.Value);
                }
            }

            if (selectionSet.Count == 0)
            {
                AppLogger.Log("StlFileProcessor: 회전 대상 STL이 없습니다.");
                return;
            }

            Point origin = document.GetPoint(0, 0, 0);
            Point yAxisPoint = document.GetPoint(0, 1, 0);
            Segment yAxis = document.GetSegment(origin, yAxisPoint);

            selectionSet.Rotate(yAxis, -Math.PI / 2, Missing.Value);
            selectionSet.RemoveAll();
        }

        private static void LogFreeFormFeatureSummary(Document document, string context, string[] targetNames)
        {
            if (document?.FreeFormFeatures == null)
            {
                AppLogger.Log($"{context} - Document.FreeFormFeatures null");
                return;
            }

            int count = document.FreeFormFeatures.Count;
            AppLogger.Log($"{context} - FreeFormFeatures.Count: {count}");

            if (count == 0)
            {
                return;
            }

            HashSet<string> pending = (targetNames == null || targetNames.Length == 0)
                ? null
                : new HashSet<string>(targetNames, StringComparer.OrdinalIgnoreCase);

            int max = Math.Min(count, 40);
            for (int idx = 1; idx <= max; idx++)
            {
                FreeFormFeature feature = document.FreeFormFeatures[idx];
                if (feature == null)
                {
                    AppLogger.Log($"{context} - Feature[{idx}] null");
                    continue;
                }

                string name = feature.Name ?? "(no-name)";
                AppLogger.Log($"{context} - Feature[{idx}] {name}");
                pending?.Remove(name);
            }

            if (count > 40)
            {
                AppLogger.Log($"{context} - 로그 제한으로 40개까지만 출력");
            }

            if (pending != null && pending.Count > 0)
            {
                AppLogger.Log($"{context} - 미발견 FreeFormFeature: {string.Join(", ", pending)}");
            }
        }

        private void InvokeDentalAddin(Document document, double frontLimitX, double backLimitX)
        {
            if (document == null || _espApp == null)
            {
                return;
            }

            try
            {
                Type mainModuleType = ResolveMainModuleType();
                if (mainModuleType == null)
                {
                    AppLogger.Log("DentalAddin: MainModule 타입을 찾을 수 없습니다.");
                    return;
                }

                try
                {
                    var mmAsm = mainModuleType.Assembly;
                    var mmAsmName = mmAsm?.GetName();
                    AppLogger.Log($"DentalAddin: MainModuleType - {mainModuleType.FullName}, Assembly:{mmAsmName?.Name}, Version:{mmAsmName?.Version}, Location:{mmAsm?.Location}");
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"DentalAddin: MainModuleType Assembly 정보 로깅 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                ConfigureDentalProcesses(mainModuleType);
                EnsureMainModuleContext(mainModuleType, document);
                EnsureMoveModuleDefaults(mainModuleType, document);
                ApplyLimitPoints(mainModuleType, frontLimitX, backLimitX);
                
                AppLogger.Log($"DentalAddin: MoveSTL 실행 시작 (FrontLimit:{frontLimitX}, BackLimit:{backLimitX})");
                InvokeMoveSTL(mainModuleType);
                AppLogger.Log("DentalAddin: MoveSTL 실행 완료");

                AppLogger.Log($"DentalAddin: Bind 실행 시도 (Document: {(document != null)}, EspritApp: {(_espApp != null)})");
                bool bindInvoked = TryInvokeMainModuleMethod(mainModuleType, "Bind", false, _espApp, document);
                if (!bindInvoked)
                {
                    AppLogger.Log("DentalAddin: Bind 미제공 - 필드 주입만으로 진행합니다.");
                }

                AppLogger.Log("DentalAddin: Main 실행 시작");
                bool mainInvoked = TryInvokeMainModuleMethod(mainModuleType, "Main");
                if (!mainInvoked)
                {
                    return;
                }
                AppLogger.Log("DentalAddin: Main 실행 완료");

                LogOperationSummary(document, "DentalAddin: PostMain");

                AppLogger.Log("StlFileProcessor: DentalPanel 호출 완료");
            }
            catch (Exception ex)
            {
                Exception root = ex.GetBaseException();
                AppLogger.Log($"StlFileProcessor: DentalAddin 실행 실패\n{root}");
            }
        }

        private void ConfigureDentalProcesses(Type mainModuleType)
        {
            string prcDirectory = ResolvePrcDirectory();

            TryApplyDentalUserData(mainModuleType, ref prcDirectory);

            SetStaticField(mainModuleType, "PrcDirectory", prcDirectory);

            string[] prcPaths = EnsurePrcArray(GetMainModuleField<string[]>(mainModuleType, "PrcFilePath"));
            string[] prcNames = EnsurePrcArray(GetMainModuleField<string[]>(mainModuleType, "PrcFileName"));

            foreach (var entry in DefaultPrcFileMap)
            {
                if (entry.Key == 4 || entry.Key == 8)
                {
                    continue;
                }

                AssignProcessPathIfEmpty(prcPaths, prcNames, entry.Key, ResolveProcessPath(prcDirectory, entry.Value));
            }

            AssignProcessPathIfEmpty(prcPaths, prcNames, 4, ResolveProcessPath(prcDirectory, FaceHoleProcessFilePath));
            AssignProcessPathIfEmpty(prcPaths, prcNames, 8, ResolveProcessPath(prcDirectory, ConnectionMachiningProcessFilePath));

            SetStaticField(mainModuleType, "PrcFilePath", prcPaths);
            SetStaticField(mainModuleType, "PrcFileName", prcNames);

            double roughType = DeriveRoughTypeFromPrc(prcPaths);
            SetStaticField(mainModuleType, "RoughType", roughType);
            AppLogger.Log($"DentalAddin: RoughType 자동 결정 - {roughType} (RoughPRC:{prcPaths?[3]})");

            LogMainModuleArrays(mainModuleType);
        }

        private static void LogMainModuleArrays(Type mainModuleType)
        {
            try
            {
                int[] numCombobox = GetMainModuleField<int[]>(mainModuleType, "NumCombobox");
                double[] numData = GetMainModuleField<double[]>(mainModuleType, "NumData");
                string[] prcPaths = GetMainModuleField<string[]>(mainModuleType, "PrcFilePath");
                string[] prcNames = GetMainModuleField<string[]>(mainModuleType, "PrcFileName");

                LogArray("DentalAddin: NumCombobox", numCombobox);
                LogArray("DentalAddin: NumData", numData);
                LogArray("DentalAddin: PrcFileName", prcNames, value => value);
                LogArray("DentalAddin: PrcFilePath", prcPaths, value => string.IsNullOrWhiteSpace(value) ? value : Path.GetFileName(value));
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: MainModule 배열 로깅 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static void LogArray<T>(string title, T[] values)
        {
            LogArray(title, values, value => value?.ToString());
        }

        private static void LogArray<T>(string title, T[] values, Func<T, string> formatter)
        {
            if (values == null)
            {
                AppLogger.Log($"{title}: null");
                return;
            }

            int max = Math.Min(values.Length, 13);
            var parts = new List<string>(max);
            for (int i = 0; i < max; i++)
            {
                string text = formatter == null ? values[i]?.ToString() : formatter(values[i]);
                parts.Add($"{i}:{text}");
            }
            AppLogger.Log($"{title}: {string.Join(", ", parts)} (Len:{values.Length})");
        }

        private void LogOperationSummary(Document document, string context)
        {
            try
            {
                var operations = document?.Operations;
                if (operations == null)
                {
                    AppLogger.Log($"{context} - Document.Operations null");
                    return;
                }

                int count = 0;
                try
                {
                    count = (int)operations.GetType().InvokeMember("Count", BindingFlags.GetProperty, null, operations, null);
                }
                catch
                {
                    try { count = operations.Count; } catch { count = 0; }
                }

                AppLogger.Log($"{context} - Operations.Count:{count}");

                int max = Math.Min(count, 60);
                for (int i = 1; i <= max; i++)
                {
                    object op = null;
                    try { op = operations[i]; } catch { }
                    if (op == null)
                    {
                        AppLogger.Log($"{context} - Op[{i}] null");
                        continue;
                    }

                    string name = null;
                    string key = null;
                    try { name = (string)op.GetType().InvokeMember("Name", BindingFlags.GetProperty, null, op, null); } catch { }
                    try { key = (string)op.GetType().InvokeMember("Key", BindingFlags.GetProperty, null, op, null); } catch { }

                    AppLogger.Log($"{context} - Op[{i}] {name ?? "(no-name)"} Key:{key}");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"{context} - Operations 로깅 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private void TryApplyDentalUserData(Type mainModuleType, ref string prcDirectory)
        {
            if (mainModuleType == null)
            {
                return;
            }

            try
            {
                FieldInfo xmlField = mainModuleType.GetField("DefaultXmlFileName", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                string xmlPath = xmlField?.GetValue(null) as string;
                if (string.IsNullOrWhiteSpace(xmlPath) || !File.Exists(xmlPath))
                {
                    AppLogger.Log($"DentalAddin: UserData xml 없음 - {xmlPath}");
                    return;
                }

                Assembly asm = mainModuleType.Assembly;
                Type serializableType = asm.GetType("DentalAddin.SerializableData");
                Type userDataType = asm.GetType("DentalAddin.UserData");
                if (serializableType == null || userDataType == null)
                {
                    AppLogger.Log("DentalAddin: UserData 타입/SerializableData 타입을 찾지 못해 로드 생략");
                    return;
                }

                MethodInfo loadMethod = serializableType.GetMethod("Load", BindingFlags.Public | BindingFlags.Static, null, new[] { typeof(string), typeof(Type) }, null);
                if (loadMethod == null)
                {
                    AppLogger.Log("DentalAddin: SerializableData.Load 메서드를 찾지 못해 로드 생략");
                    return;
                }

                object ud = loadMethod.Invoke(null, new object[] { xmlPath, userDataType });
                if (ud == null)
                {
                    AppLogger.Log("DentalAddin: UserData 로드 결과가 null");
                    return;
                }

                string udDir = userDataType.GetField("PrcDirectory")?.GetValue(ud) as string;
                if (!string.IsNullOrWhiteSpace(udDir) && Directory.Exists(udDir))
                {
                    prcDirectory = udDir;
                    AppLogger.Log($"DentalAddin: UserData.PrctDirectory 적용 - {prcDirectory}");
                }

                string[] udPaths = userDataType.GetField("PrcFilePath")?.GetValue(ud) as string[];
                string[] udNames = userDataType.GetField("PrcFileName")?.GetValue(ud) as string[];
                double[] udNumData = userDataType.GetField("NumData")?.GetValue(ud) as double[];
                int[] udNumCombobox = userDataType.GetField("NumCombobox")?.GetValue(ud) as int[];

                if (udNumData != null)
                {
                    SetStaticField(mainModuleType, "NumData", udNumData);
                    AppLogger.Log($"DentalAddin: UserData.NumData 적용 (Len:{udNumData.Length})");
                }
                if (udNumCombobox != null)
                {
                    SetStaticField(mainModuleType, "NumCombobox", udNumCombobox);
                    AppLogger.Log($"DentalAddin: UserData.NumCombobox 적용 (Len:{udNumCombobox.Length})");
                }

                if (udPaths != null)
                {
                    string[] current = EnsurePrcArray(GetMainModuleField<string[]>(mainModuleType, "PrcFilePath"));
                    int max = Math.Min(current.Length, udPaths.Length);
                    for (int i = 0; i < max; i++)
                    {
                        if (!string.IsNullOrWhiteSpace(udPaths[i]))
                        {
                            current[i] = ResolveProcessPath(prcDirectory, udPaths[i]);
                        }
                    }
                    SetStaticField(mainModuleType, "PrcFilePath", current);
                    AppLogger.Log($"DentalAddin: UserData.PrcFilePath 적용 (Len:{udPaths.Length})");
                }

                if (udNames != null)
                {
                    string[] current = EnsurePrcArray(GetMainModuleField<string[]>(mainModuleType, "PrcFileName"));
                    int max = Math.Min(current.Length, udNames.Length);
                    for (int i = 0; i < max; i++)
                    {
                        if (!string.IsNullOrWhiteSpace(udNames[i]))
                        {
                            current[i] = udNames[i];
                        }
                    }
                    SetStaticField(mainModuleType, "PrcFileName", current);
                    AppLogger.Log($"DentalAddin: UserData.PrcFileName 적용 (Len:{udNames.Length})");
                }
            }
            catch (TargetInvocationException tie)
            {
                Exception root = tie.GetBaseException();
                AppLogger.Log($"DentalAddin: UserData 로드 중 예외\n{root}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: UserData 적용 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static double DeriveRoughTypeFromPrc(string[] prcPaths)
        {
            string path = (prcPaths != null && prcPaths.Length > 3) ? prcPaths[3] : null;
            if (string.IsNullOrWhiteSpace(path))
            {
                return 1.0;
            }

            string normalized = path.Replace('/', '\\');
            if (normalized.IndexOf("\\8_0-180", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return 2.0;
            }

            if (normalized.IndexOf("\\5_Rough", StringComparison.OrdinalIgnoreCase) >= 0 ||
                normalized.IndexOf("0-120-240", StringComparison.OrdinalIgnoreCase) >= 0 ||
                normalized.IndexOf("MillRough_3D", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return 3.0;
            }

            return 1.0;
        }

        private static string[] EnsurePrcArray(string[] source)
        {
            if (source == null || source.Length < 13)
            {
                return new string[13];
            }

            return source;
        }

        private static void AssignProcessPath(string[] paths, string[] names, int index, string resolvedPath)
        {
            if (paths == null || names == null)
            {
                return;
            }

            if (index < 0 || index >= paths.Length)
            {
                return;
            }

            paths[index] = resolvedPath;
            names[index] = string.IsNullOrWhiteSpace(resolvedPath) ? string.Empty : Path.GetFileName(resolvedPath);
        }

        private static void AssignProcessPathIfEmpty(string[] paths, string[] names, int index, string resolvedPath)
        {
            if (paths == null || names == null)
            {
                return;
            }

            if (index < 0 || index >= paths.Length)
            {
                return;
            }

            if (!string.IsNullOrWhiteSpace(paths[index]))
            {
                return;
            }

            paths[index] = resolvedPath;
            if (index < names.Length && string.IsNullOrWhiteSpace(names[index]))
            {
                names[index] = string.IsNullOrWhiteSpace(resolvedPath) ? string.Empty : Path.GetFileName(resolvedPath);
            }
        }

        private static string ResolveProcessPath(string baseDirectory, string configuredPath)
        {
            if (string.IsNullOrWhiteSpace(configuredPath))
            {
                return string.Empty;
            }

            string candidate = configuredPath;
            if (!Path.IsPathRooted(candidate))
            {
                candidate = Path.Combine(baseDirectory, candidate);
            }

            string fullPath = Path.GetFullPath(candidate);
            if (File.Exists(fullPath))
            {
                return fullPath;
            }

            string relative = configuredPath;
            if (Path.IsPathRooted(relative))
            {
                if (!string.IsNullOrWhiteSpace(baseDirectory) && relative.StartsWith(baseDirectory, StringComparison.OrdinalIgnoreCase))
                {
                    relative = relative.Substring(baseDirectory.Length);
                }
                else if (relative.StartsWith(DefaultPrcRoot, StringComparison.OrdinalIgnoreCase))
                {
                    relative = relative.Substring(DefaultPrcRoot.Length);
                }
                else
                {
                    relative = Path.GetFileName(relative);
                }
            }

            relative = relative.TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string fallback = Path.Combine(DefaultPrcRoot, relative);
            string fallbackFull = Path.GetFullPath(fallback);
            if (File.Exists(fallbackFull))
            {
                AppLogger.Log($"DentalAddin: PRC 기본 경로에서 찾지 못해 AcroDent 경로로 대체 - {fallbackFull}");
                return fallbackFull;
            }

            AppLogger.Log($"DentalAddin: PRC 파일을 찾을 수 없음 - {fullPath}");
            return fullPath;
        }

        private static string ResolvePrcDirectory()
        {
            if (Directory.Exists(DefaultPrcRoot))
            {
                return DefaultPrcRoot;
            }

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string direct = Path.Combine(baseDir, "AcroDent");
            if (Directory.Exists(direct))
            {
                return direct;
            }

            string relative = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "AcroDent"));
            if (Directory.Exists(relative))
            {
                return relative;
            }

            AppLogger.Log($"DentalAddin: PRC 디렉터리를 찾을 수 없어 기본 경로 사용 - {DefaultPrcRoot}");
            return DefaultPrcRoot;
        }

        private static Type ResolveMainModuleType()
        {
            return typeof(DentalAddin.MainModule);
        }

        private static void SetStaticField(Type targetType, string fieldName, object value)
        {
            FieldInfo field = targetType?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (field == null)
            {
                AppLogger.Log($"DentalAddin: {targetType?.FullName ?? "알 수 없는 타입"}.{fieldName} 필드를 찾을 수 없습니다.");
                return;
            }

            field.SetValue(null, value);
        }

        private static T GetMainModuleField<T>(Type mainModuleType, string fieldName) where T : class
        {
            FieldInfo field = mainModuleType?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            return field?.GetValue(null) as T;
        }

        private static bool TryInvokeMainModuleMethod(Type mainModuleType, string methodName, bool logMissing = true, params object[] args)
        {
            MethodInfo method = mainModuleType?.GetMethod(methodName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (method == null)
            {
                if (logMissing)
                {
                    AppLogger.Log($"DentalAddin: {mainModuleType?.FullName ?? "알 수 없는 타입"}.{methodName} 메서드를 찾을 수 없습니다.");
                }
                return false;
            }

            try
            {
                method.Invoke(null, args);
            }
            catch (TargetInvocationException tie)
            {
                Exception root = tie.GetBaseException();
                AppLogger.Log($"DentalAddin: {methodName} 실행 실패\n{root}");
                throw;
            }

            return true;
        }

        private void ApplyLimitPoints(Type mainModuleType, double frontLimitX, double backLimitX)
        {
            Type moveModuleType = ResolveMoveModuleType(mainModuleType);
            if (moveModuleType == null)
            {
                AppLogger.Log("DentalAddin: MoveSTL_Module 타입을 찾을 수 없습니다.");
                return;
            }

            SetStaticField(moveModuleType, "FrontPointX", frontLimitX);
            SetStaticField(moveModuleType, "BackPointX", backLimitX);
            AppLogger.Log($"DentalAddin: 한계점 설정 완료 - FrontPointX:{frontLimitX}, BackPointX:{backLimitX}");
        }

        private void InvokeMoveSTL(Type mainModuleType)
        {
            Type moveModuleType = ResolveMoveModuleType(mainModuleType);
            if (moveModuleType == null)
            {
                AppLogger.Log("DentalAddin: MoveSTL_Module 타입을 찾을 수 없어 MoveSTL 호출 생략");
                return;
            }

            bool moveInvoked = TryInvokeModuleMethod(moveModuleType, "MoveSTL");
            if (!moveInvoked)
            {
                AppLogger.Log("DentalAddin: MoveSTL 메서드 호출 실패");
            }
        }

        private static bool TryInvokeModuleMethod(Type moduleType, string methodName, params object[] args)
        {
            MethodInfo method = moduleType?.GetMethod(methodName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (method == null)
            {
                AppLogger.Log($"DentalAddin: {moduleType?.FullName ?? "알 수 없는 타입"}.{methodName} 메서드를 찾을 수 없습니다.");
                return false;
            }

            try
            {
                method.Invoke(null, args);
                return true;
            }
            catch (TargetInvocationException tie)
            {
                Exception root = tie.GetBaseException();
                AppLogger.Log($"DentalAddin: {methodName} 실행 중 예외 발생\n{root}");
                throw;
            }
        }

        private void EnsureMainModuleContext(Type mainModuleType, Document document)
        {
            SetStaticField(mainModuleType, "Document", document);
            SetStaticProperty(mainModuleType, "EspritApp", _espApp);
        }

        private void EnsureMoveModuleDefaults(Type mainModuleType, Document document)
        {
            Type moveModuleType = ResolveMoveModuleType(mainModuleType);
            if (moveModuleType == null)
            {
                AppLogger.Log("DentalAddin: MoveSTL_Module 타입을 찾을 수 없습니다 (기본값 주입 생략).");
                return;
            }

            double mtiDefault = 0.0;
            double barDiameter = document?.LatheMachineSetup?.BarDiameter ?? 0.0;
            bool mtiSet = TrySetFieldIfNull(moveModuleType, "MTI", mtiDefault);
            bool frontSet = TrySetFieldIfNull(moveModuleType, "FrontPointX", DefaultFrontLimitX);
            bool backSet = TrySetFieldIfNull(moveModuleType, "BackPointX", DefaultBackLimitX);
            SetStaticField(moveModuleType, "NeedMove", false);
            SetStaticField(moveModuleType, "NeedMoveY", 0.0);
            SetStaticField(moveModuleType, "NeedMoveZ", 0.0);

            AppLogger.Log($"DentalAddin: MoveSTL 초기화 - MTI:{mtiDefault}({mtiSet}), Front:{DefaultFrontLimitX}({frontSet}), Back:{DefaultBackLimitX}({backSet}), BarDia:{barDiameter}");
        }

        private static Type ResolveMoveModuleType(Type mainModuleType)
        {
            return mainModuleType?.Assembly?.GetType("DentalAddin.MoveSTL_Module", false, true);
        }

        private static void SetStaticProperty(Type targetType, string propertyName, object value)
        {
            PropertyInfo property = targetType?.GetProperty(propertyName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (property == null || !property.CanWrite)
            {
                AppLogger.Log($"DentalAddin: {targetType?.FullName ?? "알 수 없는 타입"}.{propertyName} 프로퍼티를 설정할 수 없습니다.");
                return;
            }

            property.SetValue(null, value);
        }

        private static bool TrySetFieldIfNull(Type targetType, string fieldName, double defaultValue)
        {
            FieldInfo field = targetType?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (field == null)
            {
                return false;
            }

            object currentValue = field.GetValue(null);
            if (currentValue is double doubleValue && !double.IsNaN(doubleValue))
            {
                return true;
            }

            field.SetValue(null, defaultValue);
            return true;
        }

        private static SelectionSet GetOrCreateSelectionSet(Document document, string name)
        {
            if (document == null)
            {
                return null;
            }

            try
            {
                SelectionSet existing = document.SelectionSets[name];
                if (existing != null)
                {
                    return existing;
                }
            }
            catch
            {
                // ignore
            }

            try
            {
                return document.SelectionSets.Add(name);
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: SelectionSet 생성 실패 - {ex.Message}");
                return null;
            }
        }
    }
}
