using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Text.RegularExpressions;
using DPTechnology.AnnexLibraries.EspritAnnex;
using Esprit;
using EspritConstants;
using EspritTechnology;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;
using Abuts.EspritAddIns.ESPRIT2025AddinProject;
using static Org.BouncyCastle.Math.EC.ECCurve;
namespace Abuts.EspritAddIns.ESPRIT2025AddinProject
{
    public class StlFileProcessor
    {
        private static readonly HttpClient BackendHttp;
        static StlFileProcessor()
        {
            var handler = new HttpClientHandler
            {
                AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate,
                UseProxy = false
            };
            BackendHttp = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(10)
            };
        }
        private static string GetBackendUrl()
        {
            return AppConfig.GetBackendUrl();
        }
        private static string GetBridgeSecret()
        {
            return AppConfig.GetBridgeSecret();
        }
        private readonly Application _espApp;
        private readonly string _outputFolder;
        private readonly string _postProcessorFile;
        private double? _capturedFrontPointX;
        private double? _capturedBackPointX;
        private double? _capturedStockDiameter;
        private string _backendLotNumber;
        private string _backendSerialCode;
        public string FaceHoleProcessFilePath { get; set; } = AppConfig.FaceHoleProcessPath;
        public string ConnectionMachiningProcessFilePath { get; set; } = AppConfig.ConnectionProcessPath;
        public double DefaultFrontLimitX { get; set; } = -9.5;
        public double DefaultBackLimitX { get; set; } = 0;
        public string lotNumber { get; set; } = "ACR";
        public StlFileProcessor(Application app, string outputFolder = null,
            string postProcessorFile = "Acro_dent_XE.asc")
        {
            _espApp = app ?? throw new InvalidOperationException("ESPRIT Application not initialized");
            _outputFolder = string.IsNullOrWhiteSpace(outputFolder) ? AppConfig.StorageNcDirectory : outputFolder;
            _postProcessorFile = postProcessorFile;
        }
        public Esprit.PMTab exTab;
        public void Process(string stlPath, double? frontLimitX = null, double? backLimitX = null)
        {
            AppLogger.BeginRun();
            ResetPerRunState();
            Directory.CreateDirectory(_outputFolder);
            Document document = EnsureDocument();
            if (document == null)
            {
                AppLogger.Log("StlFileProcessor: 활성화된 ESPRIT 문서를 만들 수 없습니다.");
                return;
            }
            EnsureCleanDocument(document);
            ResetAllDentalAddinStaticFields();
            RemoveLayerIfExists(document, StlImportLayerName);
            double effectiveFrontLimit = frontLimitX ?? DefaultFrontLimitX;
            double effectiveBackLimit = backLimitX ?? DefaultBackLimitX;
            string requestId = null;
            RequestMetaCaseInfos requestMeta = null;
            double? finishLineTopZ = null;
            double? stlBoundingTopZ = null;
            _backendLotNumber = null;
            _backendSerialCode = null;
            try
            {
                requestId = ExtractRequestIdFromStlPath(stlPath);
                if (!string.IsNullOrWhiteSpace(requestId))
                {
                    var requestMetaResponse = FetchRequestMeta(requestId);
                    requestMeta = requestMetaResponse?.caseInfos;
                    finishLineTopZ = TryGetFinishLineTopZ(requestMetaResponse);
                    _backendSerialCode = requestMetaResponse?.serialCode;
                    if (requestMeta != null)
                    {
                        if (!string.IsNullOrWhiteSpace(requestMeta.lotNumber))
                        {
                            _backendLotNumber = requestMeta.lotNumber.Trim();
                            lotNumber = _backendLotNumber;
                        }
                        else
                        {
                            throw new InvalidOperationException($"request-meta 응답에 lotNumber가 없습니다. requestId={requestId}");
                        }
                        AppLogger.Log($"StlFileProcessor: request-meta loaded requestId={requestId}, Clinic={requestMeta.clinicName}, Patient={requestMeta.patientName}, Tooth={requestMeta.tooth}, Implant={requestMeta.implantManufacturer}/{requestMeta.implantSystem}/{requestMeta.implantType}, MaxDia={requestMeta.maxDiameter}, ConnDia={requestMeta.connectionDiameter}, WorkType={requestMeta.workType}, Lot={requestMeta.lotNumber}, SerialCode={(_backendSerialCode ?? "")}");
                        AppLogger.Log($"StlFileProcessor: finishLine topZ={(finishLineTopZ.HasValue ? finishLineTopZ.Value.ToString("F4", CultureInfo.InvariantCulture) : "<null>")}");
                        if (!ApplyBackendPrcNames(requestMeta))
                        {
                            AppLogger.Log("StlFileProcessor: 백엔드 PRC 설정 실패로 공정을 중단합니다.");
                            return;
                        }
                    }
                    else
                    {
                        throw new InvalidOperationException($"request-meta 응답이 비어있습니다. requestId={requestId}");
                    }
                }
                else
                {
                    AppLogger.Log("StlFileProcessor: requestId 추출 실패 - 파일명 규칙 확인 필요");
                }
                double machineBarDiameter = document?.LatheMachineSetup?.BarDiameter ?? 0;
                if (machineBarDiameter > 0)
                {
                    AppLogger.Log($"StlFileProcessor: 기존 장비 BarDiameter={machineBarDiameter:F3}");
                }
                else
                {
                    AppLogger.Log("StlFileProcessor: 기존 BarDiameter 정보를 찾을 수 없어 기본 절차를 사용합니다.");
                }
                CleanupGraphics(document);
                document.Refresh();
                Layer prevLayer = null;
                try
                {
                    prevLayer = document.ActiveLayer;
                }
                catch
                {
                }
                Layer stlLayer = GetOrCreateLayer(document, StlImportLayerName);
                if (stlLayer != null)
                {
                    document.ActiveLayer = stlLayer;
                }
                document.MergeFile(stlPath);
                if (prevLayer != null)
                {
                    try
                    {
                        document.ActiveLayer = prevLayer;
                    }
                    catch
                    {
                    }
                }
                stlBoundingTopZ = TryComputeStlBoundingTopZ(document);
                AppLogger.Log($"StlFileProcessor: STL bounding topZ={(stlBoundingTopZ.HasValue ? stlBoundingTopZ.Value.ToString("F4", CultureInfo.InvariantCulture) : "<null>")}");
                Connect.SetCurrentDocument(document);
                UpdateLatheBarDiameter(document, stlPath, machineBarDiameter);
                Rotate90Degrees(document);
                FitActiveWindow(document);
                InvokeDentalAddin(document, effectiveFrontLimit, effectiveBackLimit, stlBoundingTopZ, finishLineTopZ);
                CaptureNcMetadata(document);
                string ncFilePath = RunPostProcessing(document, stlPath, ResolveBackPointForNc(effectiveBackLimit), ResolveStockDiameterForNc(document));
                if (!string.IsNullOrWhiteSpace(ncFilePath))
                {
                    AppLogger.Log($"StlFileProcessor: NC file generated - {ncFilePath}");
                    NotifyBackendSuccess(requestId, stlPath, ncFilePath);
                }
                else
                {
                    AppLogger.Log($"StlFileProcessor: NC file generation failed - ncFilePath is empty");
                }
                AppLogger.Log($"StlFileProcessor: 완료 - {stlPath}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: 처리 중 오류 - {ex.Message}");
                try
                {
                    if (!string.IsNullOrWhiteSpace(requestId))
                    {
                        NotifyBackendFailure(requestId, stlPath, ex.Message);
                    }
                }
                catch (Exception notifyEx)
                {
                    AppLogger.Log($"StlFileProcessor: 실패 등록 중 오류 - {notifyEx.GetType().Name}:{notifyEx.Message}");
                }
                throw;
            }
        }
        private void CaptureNcMetadata(Document document)
        {
            try
            {
                _capturedFrontPointX = TryGetMoveModuleDouble("FrontPointX");
                _capturedBackPointX = TryGetMoveModuleDouble("BackPointX");
                double barDiameter = document?.LatheMachineSetup?.BarDiameter ?? 0;
                _capturedStockDiameter = barDiameter > 0 ? barDiameter : (double?)null;
                AppLogger.Log($"StlFileProcessor: NC 메타 캡처 - Front:{FormatNcNumber(_capturedFrontPointX)}, Back:{FormatNcNumber(_capturedBackPointX)}, StockDia:{FormatNcNumber(_capturedStockDiameter)}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: NC 메타 캡처 실패 - {ex.Message}");
            }
        }
        private double ResolveBackPointForNc(double fallback)
        {
            if (_capturedBackPointX.HasValue && !double.IsNaN(_capturedBackPointX.Value))
            {
                return _capturedBackPointX.Value;
            }
            return fallback;
        }
        private double ResolveStockDiameterForNc(Document document)
        {
            if (_capturedStockDiameter.HasValue && _capturedStockDiameter.Value > 0)
            {
                return _capturedStockDiameter.Value;
            }
            double docValue = document?.LatheMachineSetup?.BarDiameter ?? 0;
            return docValue > 0 ? docValue : 0;
        }
        private void ResetPerRunState()
        {
            _capturedFrontPointX = null;
            _capturedBackPointX = null;
            _capturedStockDiameter = null;
            _backendLotNumber = null;
            _backendSerialCode = null;
            FaceHoleProcessFilePath = AppConfig.FaceHoleProcessPath;
            ConnectionMachiningProcessFilePath = AppConfig.ConnectionProcessPath;
            lotNumber = "ACR";
            exTab = null;
            ResetDentalAddinMoveModuleState();
        }
        private bool ApplyBackendPrcNames(RequestMetaCaseInfos requestMeta)
        {
            string faceName = requestMeta?.faceHolePrcFileName?.Trim();
            string connectionName = requestMeta?.connectionPrcFileName?.Trim();
            if (string.IsNullOrWhiteSpace(faceName) || string.IsNullOrWhiteSpace(connectionName))
            {
                AppLogger.Log($"StlFileProcessor.ApplyBackendPrcNames: 백엔드 PRC 파일명 누락 - faceHolePrcFileName={faceName}, connectionPrcFileName={connectionName}");
                return false;
            }
            if (!TryResolveBackendPrcPath("1_Face Hole", faceName, out string facePath))
            {
                return false;
            }
            if (!TryResolveBackendPrcPath("2_Connection", connectionName, out string connectionPath))
            {
                return false;
            }
            FaceHoleProcessFilePath = facePath;
            ConnectionMachiningProcessFilePath = connectionPath;
            AppLogger.Log($"StlFileProcessor.ApplyBackendPrcNames: FaceHole={Path.GetFileName(facePath)}, Connection={Path.GetFileName(connectionPath)}");
            return true;
        }
        private static bool TryResolveBackendPrcPath(string subDir, string fileName, out string resolved)
        {
            resolved = null;
            if (string.IsNullOrWhiteSpace(fileName))
            {
                AppLogger.Log($"StlFileProcessor.TryResolveBackendPrcPath: PRC 파일명 누락 - subDir={subDir}");
                return false;
            }
            try
            {
                if (Path.IsPathRooted(fileName))
                {
                    resolved = Path.GetFullPath(fileName);
                }
                else
                {
                    resolved = Path.Combine(AppConfig.AddInRootDirectory, "AcroDent", subDir, fileName);
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor.TryResolveBackendPrcPath: 경로 조합 실패 - {ex.GetType().Name}:{ex.Message}");
                return false;
            }
            if (!File.Exists(resolved))
            {
                AppLogger.Log($"StlFileProcessor.TryResolveBackendPrcPath: PRC 파일 없음 - {resolved}");
                return false;
            }
            return true;
        }
        private void ResetDentalAddinMoveModuleState()
        {
            try
            {
                SetMoveModuleDouble("FrontPointX", double.NaN);
                SetMoveModuleDouble("BackPointX", double.NaN);

                SetMoveModuleBool("NeedMove", false);
                SetMoveModuleBool("NonConnection", false);
                SetMoveModuleDouble("NeedMoveY", 0.0);
                SetMoveModuleDouble("NeedMoveZ", 0.0);
                SetMoveModuleDouble("FrontStock", 0.0);
                SetMoveModuleDouble("FirstPX", 0.0);
                SetMoveModuleDouble("ExtendMill", 0.0);
                SetMoveModuleDouble("Chazhi", 0.0);
                SetMoveModuleDouble("RMTI", 0.0);
                SetMoveModuleDouble("MTI", 0.0);
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: DentalAddin MoveSTL 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private void SetMoveModuleBool(string fieldName, bool value)
        {
            Type mainModuleType = ResolveMainModuleType();
            Type moveModuleType = ResolveMoveModuleType(mainModuleType);
            FieldInfo field = moveModuleType?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (field == null)
            {
                return;
            }
            field.SetValue(null, value);
        }
        private void SetMoveModuleDouble(string fieldName, double value)
        {
            Type mainModuleType = ResolveMainModuleType();
            Type moveModuleType = ResolveMoveModuleType(mainModuleType);
            FieldInfo field = moveModuleType?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (field == null)
            {
                return;
            }
            field.SetValue(null, value);
        }
        private double? TryGetMoveModuleDouble(string fieldName)
        {
            try
            {
                Type mainModuleType = ResolveMainModuleType();
                Type moveModuleType = ResolveMoveModuleType(mainModuleType);
                FieldInfo field = moveModuleType?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (field == null)
                {
                    return null;
                }
                object raw = field.GetValue(null);
                return raw == null ? (double?)null : Convert.ToDouble(raw, CultureInfo.InvariantCulture);
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: MoveSTL {fieldName} 읽기 실패 - {ex.Message}");
                return null;
            }
        }
        private string BuildNcFilePath(string stlPath)
        {
            string baseName = Path.GetFileNameWithoutExtension(stlPath) ?? "output";
            string sanitizedBase = RemoveFilledToken(baseName);
            return Path.Combine(_outputFolder, sanitizedBase + ".nc");
        }
        private static string RemoveFilledToken(string baseName)
        {
            if (string.IsNullOrWhiteSpace(baseName))
            {
                return "output";
            }
            string sanitized = Regex.Replace(baseName, @"(?i)\.filled", string.Empty).Trim('-', '_', '.', ' ');
            return string.IsNullOrWhiteSpace(sanitized) ? "output" : sanitized;
        }
        private static string ExtractDisplayName(string displayName)
        {
            if (string.IsNullOrWhiteSpace(displayName))
            {
                return string.Empty;
            }
            string[] parts = displayName.Split(new[] { '-' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0)
            {
                return displayName;
            }
            int length = Math.Min(2, parts.Length);
            return string.Join("-", parts.Take(length));
        }
        private void UpdateNcHeader(string ncFilePath, string displayName, double backPointX, double stockDiameter)
        {
            try
            {
                if (!File.Exists(ncFilePath))
                {
                    AppLogger.Log($"StlFileProcessor: NC 헤더 수정 실패 - 파일 없음 ({ncFilePath})");
                    return;
                }
                var lines = new List<string>(File.ReadAllLines(ncFilePath));
                if (lines.Count == 0)
                {
                    lines.Add("%");
                }
                if (lines.Count == 1)
                {
                    lines.Add(string.Empty);
                }
                lines[0] = string.IsNullOrWhiteSpace(lines[0]) ? "%" : lines[0];
                string truncatedDisplayName = ExtractDisplayName(displayName);
                lines[1] = $"({truncatedDisplayName})";
                double backPointForNc = backPointX - AppConfig.DefaultStlShift;
                double backturnClearance = ResolveBackturnClearance(stockDiameter);
                ApplyOrInsertNcLine(lines, $"#520= {FormatNcNumber(backPointForNc, "0.000")}", "#520");
                ApplyOrInsertNcLine(lines, $"#521= {FormatNcNumber(stockDiameter, "0.000")}", "#521");
                ApplyOrInsertNcLine(lines, $"#522= {FormatNcNumber(backturnClearance, "0.000")}", "#522");
                ApplyOrInsertNcLine(lines, $"#523= {FormatNcNumber(AppConfig.DefaultStlShift, "0.000")}", "#523");
                File.WriteAllLines(ncFilePath, lines.ToArray());
                AppLogger.Log($"StlFileProcessor: NC 헤더 수정 완료 - #520:{FormatNcNumber(backPointForNc)}, #521:{FormatNcNumber(stockDiameter)}, #522:{FormatNcNumber(backturnClearance)}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: NC 헤더 수정 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static double ResolveBackturnClearance(double stockDiameter)
        {
            double[] clearances = AppConfig.DefaultBackturnClearances;
            if (clearances == null || clearances.Length == 0)
            {
                return 0;
            }
            int[] diameters = AppConfig.DefaultBackturnDiameters;
            if (diameters == null || diameters.Length == 0)
            {
                return clearances[0];
            }
            int bestIndex = 0;
            double bestDiff = double.MaxValue;
            for (int i = 0; i < diameters.Length; i++)
            {
                double diff = Math.Abs(stockDiameter - diameters[i]);
                if (diff < bestDiff)
                {
                    bestDiff = diff;
                    bestIndex = i;
                }
            }
            if (bestIndex < 0) bestIndex = 0;
            if (bestIndex >= clearances.Length) bestIndex = clearances.Length - 1; // 설정 배열 길이가 다를 수 있음
            return clearances[bestIndex];
        }
        private static void ApplyOrInsertNcLine(List<string> lines, string newLine, string token)
        {
            int index = lines.FindIndex(line => line.TrimStart().StartsWith(token, StringComparison.OrdinalIgnoreCase));
            if (index >= 0)
            {
                lines[index] = newLine;
                return;
            }
            int insertIndex = Math.Min(2, lines.Count);
            lines.Insert(insertIndex, newLine);
        }
        private static string FormatNcNumber(double? value, string format = "0.###############")
        {
            if (!value.HasValue)
            {
                return "";
            }
            return value.Value.ToString(format, CultureInfo.InvariantCulture);
        }
        private static double CeilToTenth(double value)
        {
            return Math.Ceiling(value * 10.0) / 10.0;
        }
        private void UpdateSerialBlocks(string ncFilePath, string serialCode)
        {
            try
            {
                if (!File.Exists(ncFilePath))
                {
                    AppLogger.Log($"StlFileProcessor: Serial 블록 수정 실패 - 파일 없음 ({ncFilePath})");
                    return;
                }
                string normalizedSerial = NormalizeSerialCode(serialCode);
                var lines = new List<string>(File.ReadAllLines(ncFilePath));
                bool serialUpdated = ReplaceSerialBlock(lines, "(Serial)", BuildSerialBlock(normalizedSerial, false));
                bool serialDeburrUpdated = ReplaceSerialBlock(lines, "(Serial Deburr)", BuildSerialBlock(normalizedSerial, true));
                if (!serialDeburrUpdated)
                {
                    serialDeburrUpdated = ReplaceSerialBlock(lines, "(Serial)", BuildSerialBlock(normalizedSerial, true), occurrenceIndex: 1);
                }
                if (serialUpdated || serialDeburrUpdated)
                {
                    File.WriteAllLines(ncFilePath, lines);
                    AppLogger.Log($"StlFileProcessor: Serial 블록 갱신 - Serial:{serialUpdated}, Deburr:{serialDeburrUpdated}");
                }
                else
                {
                    AppLogger.Log("StlFileProcessor: Serial 블록을 찾지 못해 갱신하지 못했습니다.");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: Serial 블록 갱신 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static bool ReplaceSerialBlock(List<string> lines, string marker, List<string> newBlock, int occurrenceIndex = 0)
        {
            if (occurrenceIndex < 0)
            {
                occurrenceIndex = 0;
            }
            int start = -1;
            int currentOccurrence = -1;
            for (int i = 0; i < lines.Count; i++)
            {
                if (string.Equals(lines[i]?.Trim(), marker, StringComparison.OrdinalIgnoreCase))
                {
                    currentOccurrence++;
                    if (currentOccurrence == occurrenceIndex)
                    {
                        start = i;
                        break;
                    }
                }
            }
            if (start < 0)
            {
                return false;
            }
            int end = start + 1;
            while (end < lines.Count)
            {
                string trimmed = lines[end].Trim();
                if (trimmed.StartsWith("(", StringComparison.OrdinalIgnoreCase) && !string.Equals(trimmed, marker, StringComparison.OrdinalIgnoreCase))
                {
                    break;
                }
                end++;
            }
            lines.RemoveRange(start, end - start);
            lines.InsertRange(start, newBlock);
            return true;
        }
        private static List<string> BuildSerialBlock(string serialCode, bool isDeburr)
        {
            var block = new List<string>
            {
                "(Serial)",
                "T0909 (CENTER MILL/D2.0*A90)",
                "M50",
                "G28H0.0",
                "M23 S2000",
                "G98 G0 X[#521+1.8]Z[#520+1.8]Y0.525C0.0",
                "G4 U0.05",
                "G1 X4.0 F2000",
                "G1 X3.45 F500",
                string.Empty
            };
            block.AddRange(BuildSerialMacroLines(serialCode, "G1 V-0.35 F1000"));
            block.Add(string.Empty);
            block.AddRange(new[]
            {
                "G0 X30.0",
                "G0 Z-17.5",
                "G0 T0",
                "M25",
                "M51",
                "G99",
                "M1",
                string.Empty
            });
            return block;
        }
        private static IEnumerable<string> BuildSerialMacroLines(string serialCode, string moveCommand)
        {
            for (int i = 0; i < serialCode.Length; i++)
            {
                yield return BuildMacroCall(serialCode[i]);
                if (i < serialCode.Length - 1 && !string.IsNullOrWhiteSpace(moveCommand))
                {
                    yield return moveCommand;
                }
            }
        }
        private static string BuildMacroCall(char letter)
        {
            char upper = char.ToUpperInvariant(letter);
            if (upper < 'A' || upper > 'Z')
            {
                upper = 'A';
            }
            int macroIndex = upper - 'A' + 1;
            return $"M98P{macroIndex.ToString("0000")}";
        }
        private string RunPostProcessing(Document document, string stlPath, double backPointX, double stockDiameter)
        {
            string postDir = _espApp.Configuration.GetFileDirectory(espFileType.espFileTypePostProcessor);
            string postFilePath = Path.Combine(postDir, _postProcessorFile);
            string ncFileName = BuildNcFilePath(stlPath);
            document.NCCode.AddAll();
            document.NCCode.Execute(postFilePath, ncFileName);
            AppLogger.Log($"StlFileProcessor: NC 저장 완료 - {ncFileName}");
            UpdateNcHeader(ncFileName, Path.GetFileName(ncFileName), backPointX, stockDiameter);
            string serialForNc = ResolveSerialCodeForNc();
            AppLogger.Log($"StlFileProcessor: Serial 각인 코드 적용 - Raw:'{_backendSerialCode ?? string.Empty}' => Use:'{serialForNc}'");
            UpdateSerialBlocks(ncFileName, serialForNc);
            return ncFileName;
        }
        private string ResolveSerialCodeForNc()
        {
            return NormalizeSerialCode(_backendSerialCode);
        }
        private static string NormalizeSerialCode(string raw)
        {
            const string fallback = "ABC";
            if (string.IsNullOrWhiteSpace(raw))
            {
                AppLogger.Log("StlFileProcessor: serialCode 누락 - 기본값 사용");
                return fallback;
            }
            string upper = raw.Trim().ToUpperInvariant();
            var letters = new string(upper.Where(c => c >= 'A' && c <= 'Z').ToArray());
            if (letters.Length < 3)
            {
                AppLogger.Log($"StlFileProcessor: serialCode 형식 오류 - '{raw}' (정규화:'{letters}')");
                return fallback;
            }
            if (letters.Length > 3)
            {
                letters = letters.Substring(0, 3);
            }
            return letters;
        }
        private static string ExtractRequestIdFromStlPath(string stlPath)
        {
            try
            {
                string fileName = Path.GetFileName(stlPath);
                if (string.IsNullOrWhiteSpace(fileName))
                {
                    return null;
                }
                string baseName = Path.GetFileNameWithoutExtension(fileName);
                if (string.IsNullOrWhiteSpace(baseName))
                {
                    return null;
                }
                if (baseName.EndsWith(".filled", StringComparison.OrdinalIgnoreCase))
                {
                    baseName = baseName.Substring(0, baseName.Length - ".filled".Length);
                }
                var parts = baseName.Split('-');
                if (parts.Length >= 2)
                {
                    return $"{parts[0]}-{parts[1]}";
                }
                return baseName;
            }
            catch
            {
                return null;
            }
        }
        private static RequestMetaData FetchRequestMeta(string requestId)
        {
            if (string.IsNullOrWhiteSpace(requestId))
            {
                return null;
            }
            string baseUrl = (GetBackendUrl() ?? "").TrimEnd('/');
            string url = $"{baseUrl}/bg/request-meta?requestId={Uri.EscapeDataString(requestId)}";
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;
                string bridgeSecret = GetBridgeSecret();
                AppLogger.Log($"StlFileProcessor: request-meta GET {url} (X-Bridge-Secret set={(!string.IsNullOrWhiteSpace(bridgeSecret))})");
                using (var req = new HttpRequestMessage(HttpMethod.Get, url))
                {
                    req.Headers.Accept.Clear();
                    req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                    if (!string.IsNullOrWhiteSpace(bridgeSecret))
                    {
                        req.Headers.Add("X-Bridge-Secret", bridgeSecret);
                    }
                    var resp = BackendHttp.SendAsync(req).GetAwaiter().GetResult();
                    string body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    if (!resp.IsSuccessStatusCode)
                    {
                        AppLogger.Log($"StlFileProcessor: request-meta failed status={resp.StatusCode} body={body}");
                        return null;
                    }
                    AppLogger.Log($"StlFileProcessor: request-meta response body={body}");
                    using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(body ?? string.Empty)))
                    {
                        var serializer = new DataContractJsonSerializer(typeof(RequestMetaResponse));
                        var meta = serializer.ReadObject(stream) as RequestMetaResponse;
                        return meta?.data;
                    }
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: request-meta error - {ex.GetType().Name}:{ex.Message}");
                return null;
            }
        }
        private static void NotifyBackendSuccess(string requestId, string stlPath, string ncPath)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(ncPath) || !File.Exists(ncPath))
                {
                    AppLogger.Log($"StlFileProcessor: register-file skip (invalid ncPath) ncPath={ncPath}");
                    return;
                }
                
                var fi = new FileInfo(ncPath);
                var upload = UploadNcViaPresign(fi, requestId);
                if (!upload.ok)
                {
                    AppLogger.Log($"StlFileProcessor: presign upload failed: {upload.error} (fallback register only)");
                }
                
                string baseUrl = (GetBackendUrl() ?? "").TrimEnd('/');
                string url = $"{baseUrl}/bg/register-file";
                string originalName = string.IsNullOrWhiteSpace(stlPath) ? "" : Path.GetFileName(stlPath);
                
                // requestId가 없으면 STL 파일명에서 추출 시도
                if (string.IsNullOrWhiteSpace(requestId) && !string.IsNullOrWhiteSpace(stlPath))
                {
                    requestId = ExtractRequestIdFromStlPath(stlPath);
                    AppLogger.Log($"StlFileProcessor: requestId extracted from stlPath: {requestId}");
                }
                
                string json;
                if (upload.ok)
                {
                    json =
                        $"{{\"sourceStep\":\"3-nc\",\"fileName\":\"{EscapeJson(fi.Name)}\",\"originalFileName\":\"{EscapeJson(originalName)}\",\"requestId\":\"{EscapeJson(requestId)}\",\"status\":\"success\",\"s3Key\":\"{EscapeJson(upload.s3Key)}\",\"s3Url\":\"{EscapeJson(upload.s3Url)}\",\"fileSize\":{upload.fileSize}}}";
                }
                else
                {
                    json =
                        $"{{\"sourceStep\":\"3-nc\",\"fileName\":\"{EscapeJson(fi.Name)}\",\"originalFileName\":\"{EscapeJson(originalName)}\",\"requestId\":\"{EscapeJson(requestId)}\",\"status\":\"success\",\"metadata\":{{\"fileSize\":{fi.Length},\"upload\":\"fallback_no_s3\"}}}}";
                }
                
                AppLogger.Log($"StlFileProcessor: register-file POST {url} with requestId={requestId}, fileName={fi.Name}");
                
                using (var req = new HttpRequestMessage(HttpMethod.Post, url))
                {
                    req.Content = new StringContent(json, Encoding.UTF8, "application/json");
                    string bridgeSecret = GetBridgeSecret();
                    if (!string.IsNullOrWhiteSpace(bridgeSecret))
                    {
                        req.Headers.Add("X-Bridge-Secret", bridgeSecret);
                    }
                    var resp = BackendHttp.SendAsync(req).GetAwaiter().GetResult();
                    if (resp.IsSuccessStatusCode)
                    {
                        AppLogger.Log($"StlFileProcessor: register-file success file={fi.Name} requestId={requestId}");
                    }
                    else
                    {
                        string body = string.Empty;
                        try { body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult(); } catch { }
                        AppLogger.Log($"StlFileProcessor: register-file failed status={resp.StatusCode} file={fi.Name} requestId={requestId} body={body}");
                    }
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: register-file error - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static void NotifyBackendFailure(string requestId, string stlPath, string errorMessage)
        {
            try
            {
                string baseUrl = (GetBackendUrl() ?? "").TrimEnd('/');
                string url = $"{baseUrl}/bg/register-file";
                string originalName = string.IsNullOrWhiteSpace(stlPath) ? "" : Path.GetFileName(stlPath);
                string safeError = (errorMessage ?? "");
                string json =
                    $"{{\"sourceStep\":\"3-nc\",\"fileName\":\"\",\"originalFileName\":\"{EscapeJson(originalName)}\",\"requestId\":\"{EscapeJson(requestId)}\",\"status\":\"failed\",\"metadata\":{{\"error\":\"{EscapeJson(safeError)}\"}}}}";
                using (var req = new HttpRequestMessage(HttpMethod.Post, url))
                {
                    req.Content = new StringContent(json, Encoding.UTF8, "application/json");
                    string bridgeSecret = GetBridgeSecret();
                    if (!string.IsNullOrWhiteSpace(bridgeSecret))
                    {
                        req.Headers.Add("X-Bridge-Secret", bridgeSecret);
                    }
                    var resp = BackendHttp.SendAsync(req).GetAwaiter().GetResult();
                    AppLogger.Log($"StlFileProcessor: register-file failure notified status={resp.StatusCode} requestId={requestId}");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: register-file failure notify error - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static (bool ok, string s3Key, string s3Url, long fileSize, string error) UploadNcViaPresign(FileInfo fi, string requestId)
        {
            try
            {
                if (fi == null || !fi.Exists || string.IsNullOrWhiteSpace(requestId))
                {
                    return (false, null, null, 0, "invalid args");
                }
                string baseUrl = (GetBackendUrl() ?? "").TrimEnd('/');
                string presignUrl = $"{baseUrl}/bg/presign-upload";
                string presignBody = $"{{\"sourceStep\":\"3-nc\",\"fileName\":\"{EscapeJson(fi.Name)}\",\"requestId\":\"{EscapeJson(requestId)}\"}}";
                HttpResponseMessage presignResp;
                using (var req = new HttpRequestMessage(HttpMethod.Post, presignUrl))
                {
                    req.Content = new StringContent(presignBody, Encoding.UTF8, "application/json");
                    string bridgeSecret = GetBridgeSecret();
                    if (!string.IsNullOrWhiteSpace(bridgeSecret))
                    {
                        req.Headers.Add("X-Bridge-Secret", bridgeSecret);
                    }
                    presignResp = BackendHttp.SendAsync(req).GetAwaiter().GetResult();
                }
                if (!presignResp.IsSuccessStatusCode)
                {
                    return (false, null, null, 0, $"presign status={presignResp.StatusCode}");
                }
                var presignJson = presignResp.Content.ReadAsStringAsync().GetAwaiter().GetResult() ?? "";
                string Extract(string key)
                {
                    try
                    {
                        var marker = $"\"{key}\":\"";
                        int idx = presignJson.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
                        if (idx < 0) return null;
                        idx += marker.Length;
                        int end = presignJson.IndexOf("\"", idx, StringComparison.OrdinalIgnoreCase);
                        if (end < 0) return null;
                        return presignJson.Substring(idx, end - idx);
                    }
                    catch { return null; }
                }
                string url = Extract("url");
                string keyValue = Extract("key");
                string bucket = Extract("bucket");
                string contentType = Extract("contentType") ?? "application/octet-stream";
                if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(keyValue))
                {
                    return (false, null, null, 0, "presign response missing url/key");
                }
                long fileSize = fi.Length;
                using (var fs = fi.OpenRead())
                {
                    using (var putClient = new HttpClient(new HttpClientHandler { UseProxy = false }) { Timeout = TimeSpan.FromSeconds(30) })
                    using (var putReq = new HttpRequestMessage(HttpMethod.Put, url))
                    {
                        putReq.Content = new StreamContent(fs);
                        putReq.Content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
                        var putResp = putClient.SendAsync(putReq).GetAwaiter().GetResult();
                        if (!putResp.IsSuccessStatusCode)
                        {
                            return (false, null, null, 0, $"put status={putResp.StatusCode}");
                        }
                    }
                }
                string s3Url = BuildS3Url(bucket, keyValue);
                return (true, keyValue, s3Url, fileSize, null);
            }
            catch (Exception ex)
            {
                return (false, null, null, 0, ex.Message);
            }
        }
        private static string BuildS3Url(string bucket, string key)
        {
            bucket = (bucket ?? "").Trim();
            key = (key ?? "").Trim().TrimStart('/');
            if (string.IsNullOrEmpty(bucket) || string.IsNullOrEmpty(key)) return "";
            return $"https://{bucket}.s3.amazonaws.com/{key}";
        }
        private static string EscapeJson(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
        [DataContract]
        private class RequestMetaResponse
        {
            [DataMember] public bool ok { get; set; }
            [DataMember] public RequestMetaData data { get; set; }
        }
        [DataContract]
        private class RequestMetaData
        {
            [DataMember] public string requestId { get; set; }
            [DataMember] public RequestMetaLotNumber lotNumber { get; set; }
            [DataMember] public string serialCode { get; set; }
            [DataMember] public RequestMetaCaseInfos caseInfos { get; set; }
        }
        [DataContract]
        private class RequestMetaLotNumber
        {
            [DataMember] public string part { get; set; }
        }
        [DataContract]
        private class RequestMetaCaseInfos
        {
            [DataMember] public string clinicName { get; set; }
            [DataMember] public string patientName { get; set; }
            [DataMember] public string tooth { get; set; }
            [DataMember] public string implantManufacturer { get; set; }
            [DataMember] public string implantSystem { get; set; }
            [DataMember] public string implantType { get; set; }
            [DataMember] public double maxDiameter { get; set; }
            [DataMember] public double connectionDiameter { get; set; }
            [DataMember] public string workType { get; set; }
            [DataMember] public string lotNumber { get; set; }
            [DataMember] public string faceHolePrcFileName { get; set; }
            [DataMember] public string connectionPrcFileName { get; set; }
            [DataMember] public RequestMetaFinishLine finishLine { get; set; }
        }
        [DataContract]
        private class RequestMetaFinishLine
        {
            [DataMember] public double[][] points { get; set; }
        }
        private static double? TryGetFinishLineTopZ(RequestMetaData meta)
        {
            try
            {
                var pts = meta?.caseInfos?.finishLine?.points;
                if (pts == null || pts.Length < 2)
                {
                    return null;
                }
                double maxZ = double.NegativeInfinity;
                int valid = 0;
                foreach (var p in pts)
                {
                    if (p == null || p.Length < 3) continue;
                    double z = p[2];
                    if (double.IsNaN(z) || double.IsInfinity(z)) continue;
                    valid++;
                    if (z > maxZ) maxZ = z;
                }
                if (valid < 1 || double.IsNegativeInfinity(maxZ)) return null;
                return maxZ;
            }
            catch
            {
                return null;
            }
        }
        private static double? TryComputeStlBoundingTopZ(Document document)
        {
            try
            {
                if (document?.GraphicsCollection == null || document?.FeatureRecognition == null)
                {
                    return null;
                }
                const string selectionName = "StlBoundingTemp";
                SelectionSet selectionSet;
                try { selectionSet = document.SelectionSets.Add(selectionName); }
                catch { selectionSet = document.SelectionSets[selectionName]; }
                if (selectionSet == null) return null;
                selectionSet.RemoveAll();
                foreach (GraphicObject graphic in document.GraphicsCollection)
                {
                    if (graphic?.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        selectionSet.Add(graphic, Missing.Value);
                        break;
                    }
                }
                if (selectionSet.Count == 0)
                {
                    return null;
                }
                Plane plane = null;
                try { plane = document.Planes["YZX"]; } catch { }
                if (plane == null)
                {
                    try { plane = document.Planes["XYZ"]; } catch { }
                }
                if (plane == null) return null;
                HashSet<string> beforeKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    foreach (FeatureChain fc in document.FeatureChains)
                    {
                        if (fc?.Key != null) beforeKeys.Add(fc.Key);
                    }
                }
                catch { }
                document.FeatureRecognition.CreatePartProfileShadow(selectionSet, plane, espGraphicObjectReturnType.espFeatureChains);
                document.Refresh();
                FeatureChain created = null;
                try
                {
                    foreach (FeatureChain fc in document.FeatureChains)
                    {
                        if (fc?.Key == null) continue;
                        if (!beforeKeys.Contains(fc.Key))
                        {
                            created = fc;
                            break;
                        }
                    }
                }
                catch { }
                if (created == null || created.Length <= 0)
                {
                    return null;
                }
                double maxZ = double.NegativeInfinity;
                double length = created.Length;
                double step = Math.Max(0.1, length / 500.0);
                for (double t = 0.0; t <= length; t += step)
                {
                    Point pt = created.PointAlong(t);
                    if (pt == null) continue;
                    double z = pt.Z;
                    if (double.IsNaN(z) || double.IsInfinity(z)) continue;
                    if (z > maxZ) maxZ = z;
                }
                if (double.IsNegativeInfinity(maxZ)) return null;
                return maxZ;
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: STL bounding topZ 계산 실패 - {ex.GetType().Name}:{ex.Message}");
                return null;
            }
        }
        private void TryApplyCompositeSplitByFinishLine(Type mainModuleType, double? stlTopZ, double? finishLineTopZ)
        {
            try
            {
                if (!stlTopZ.HasValue || !finishLineTopZ.HasValue)
                {
                    AppLogger.Log("DentalAddin: finishLine 기반 Composite2SplitAB 생략 - topZ 부족");
                    return;
                }
                if (double.IsNaN(stlTopZ.Value) || double.IsNaN(finishLineTopZ.Value))
                {
                    AppLogger.Log("DentalAddin: finishLine 기반 Composite2SplitAB 생략 - topZ NaN");
                    return;
                }
                double rawRatio = (stlTopZ.Value - finishLineTopZ.Value) / 20.0;
                if (double.IsNaN(rawRatio) || double.IsInfinity(rawRatio))
                {
                    AppLogger.Log("DentalAddin: finishLine 기반 Composite2SplitAB 생략 - splitRatio invalid");
                    return;
                }
                double ratio = Math.Max(0.0, Math.Min(1.0, rawRatio));
                double? frontX = TryGetMoveModuleDouble("FrontPointX");
                double? backX = TryGetMoveModuleDouble("BackPointX");
                if (!frontX.HasValue || !backX.HasValue)
                {
                    AppLogger.Log($"DentalAddin: finishLine 기반 Composite2SplitAB 생략 - Front/BackPointX 누락 (Front:{FormatNcNumber(frontX)}, Back:{FormatNcNumber(backX)})");
                    return;
                }
                double span = backX.Value - frontX.Value;
                if (Math.Abs(span) < 0.001)
                {
                    AppLogger.Log("DentalAddin: finishLine 기반 Composite2SplitAB 생략 - span 너무 작음");
                    return;
                }
                double splitX = frontX.Value + span * ratio;
                Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_SPLIT_ENABLE", "1");
                Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_SPLIT_X", splitX.ToString(CultureInfo.InvariantCulture));
                AppLogger.Log($"DentalAddin: finishLine split 적용 - bboxTopZ:{stlTopZ.Value.ToString("F4", CultureInfo.InvariantCulture)}, finishTopZ:{finishLineTopZ.Value.ToString("F4", CultureInfo.InvariantCulture)}, rawRatio:{rawRatio.ToString("F4", CultureInfo.InvariantCulture)}, ratio(clamped):{ratio.ToString("F4", CultureInfo.InvariantCulture)}, splitX:{splitX.ToString("F4", CultureInfo.InvariantCulture)} (Front:{frontX.Value.ToString("F4", CultureInfo.InvariantCulture)}, Back:{backX.Value.ToString("F4", CultureInfo.InvariantCulture)})");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: finishLine 기반 Composite2SplitAB 설정 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private void ResetAllDentalAddinStaticFields()
        {
            try
            {
                Type mainModuleType = ResolveMainModuleType();
                if (mainModuleType == null)
                {
                    AppLogger.Log("StlFileProcessor: MainModule 타입을 찾을 수 없어 static 필드 초기화 생략");
                    return;
                }

                // MainModule의 주요 static 필드 초기화
                ResetStaticField(mainModuleType, "Document", null);
                ResetStaticField(mainModuleType, "Jump", 0);
                ResetStaticField(mainModuleType, "RL", 0.0);
                ResetStaticField(mainModuleType, "SpindleSide", false);
                ResetStaticField(mainModuleType, "RoughType", 0.0);
                ResetStaticField(mainModuleType, "AngleNumber", 0.0);
                ResetStaticField(mainModuleType, "SemiAngle", 0.0);
                ResetStaticField(mainModuleType, "ReverseOn", false);
                ResetStaticField(mainModuleType, "Eror", 0);
                ResetStaticField(mainModuleType, "FC1", null);
                ResetStaticField(mainModuleType, "FC2", null);
                ResetStaticField(mainModuleType, "FC3", null);
                ResetStaticField(mainModuleType, "FC4", null);
                ResetStaticField(mainModuleType, "FC5", null);
                ResetStaticField(mainModuleType, "Fcc", null);
                ResetStaticField(mainModuleType, "tfc", null);
                ResetStaticField(mainModuleType, "Fcb1", null);
                ResetStaticField(mainModuleType, "FcM", null);
                ResetStaticField(mainModuleType, "SS1", null);
                ResetStaticField(mainModuleType, "Ss", null);
                ResetStaticField(mainModuleType, "Wp", null);
                ResetStaticField(mainModuleType, "Gas", null);
                ResetStaticField(mainModuleType, "seg", null);
                ResetStaticField(mainModuleType, "Pt12", null);
                ResetStaticField(mainModuleType, "IntPt", null);

                // 배열 필드 초기화
                ResetStaticArrayField(mainModuleType, "Fcb2", 13);
                ResetStaticArrayField(mainModuleType, "ptp", 7);
                ResetStaticArrayField(mainModuleType, "FcNumber", 7);
                ResetStaticArrayField(mainModuleType, "Matrix1", 19);
                ResetStaticArrayField(mainModuleType, "Matrix2", 19);
                ResetStaticArrayField(mainModuleType, "Matrix3", 37);
                ResetStaticArrayField(mainModuleType, "P", 37);
                ResetStaticArrayField(mainModuleType, "Q", 9);
                ResetStaticArrayField(mainModuleType, "Percent", 5);
                ResetStaticArrayField(mainModuleType, "PercentB", 5);
                ResetStaticArrayField(mainModuleType, "NumberT", 9);

                // MoveSTL_Module 초기화
                Type moveModuleType = ResolveMoveModuleType(mainModuleType);
                if (moveModuleType != null)
                {
                    ResetStaticField(moveModuleType, "NeedMove", false);
                    ResetStaticField(moveModuleType, "NonConnection", false);
                    ResetStaticField(moveModuleType, "FrontPointX", double.NaN);
                    ResetStaticField(moveModuleType, "BackPointX", double.NaN);
                    ResetStaticField(moveModuleType, "NeedMoveY", 0.0);
                    ResetStaticField(moveModuleType, "NeedMoveZ", 0.0);
                    ResetStaticField(moveModuleType, "FrontStock", 0.0);
                    ResetStaticField(moveModuleType, "FirstPX", 0.0);
                    ResetStaticField(moveModuleType, "ExtendMill", 0.0);
                    ResetStaticField(moveModuleType, "Chazhi", 0.0);
                    ResetStaticField(moveModuleType, "RMTI", 0.0);
                    ResetStaticField(moveModuleType, "MTI", 0.0);
                }

                AppLogger.Log("StlFileProcessor: DentalAddin static 필드 초기화 완료");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: DentalAddin static 필드 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private void ResetStaticField(Type type, string fieldName, object value)
        {
            try
            {
                FieldInfo field = type.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (field != null)
                {
                    field.SetValue(null, value);
                }
            }
            catch
            {
                // 필드가 없거나 설정 실패 시 무시
            }
        }

        private void ResetStaticArrayField(Type type, string fieldName, int length)
        {
            try
            {
                FieldInfo field = type.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (field != null && field.FieldType.IsArray)
                {
                    Type elementType = field.FieldType.GetElementType();
                    Array newArray = Array.CreateInstance(elementType, length);
                    field.SetValue(null, newArray);
                }
            }
            catch
            {
                // 필드가 없거나 설정 실패 시 무시
            }
        }

        private const string StlImportLayerName = "AbutsStlImport";

        private static void RemoveLayerIfExists(Document document, string layerName)
        {
            if (document?.Layers == null || string.IsNullOrWhiteSpace(layerName))
            {
                return;
            }
            try
            {
                Layer existing = null;
                try
                {
                    existing = document.Layers[layerName];
                }
                catch
                {
                }
                if (existing == null)
                {
                    return;
                }
                document.Layers.Remove(layerName);
                document.Refresh();
                AppLogger.Log($"StlFileProcessor: 레이어 제거 - {layerName}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: 레이어 제거 실패 - {layerName} ({ex.GetType().Name}:{ex.Message})");
            }
        }

        private static Layer GetOrCreateLayer(Document document, string layerName)
        {
            if (document?.Layers == null || string.IsNullOrWhiteSpace(layerName))
            {
                return null;
            }
            try
            {
                Layer existing = null;
                try
                {
                    existing = document.Layers[layerName];
                }
                catch
                {
                }
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

        private static void CleanupGraphics(Document document)
        {
            if (document == null || document.GraphicsCollection == null) return;

            int initialCount = document.GraphicsCollection.Count;
            if (initialCount == 0) return;

            // 역순으로 순회하며 조건에 맞는 객체 삭제
            int deletedCount = 0;
            for (int idx = initialCount; idx >= 1; idx--)
            {
                try
                {
                    dynamic obj = document.GraphicsCollection[idx];
                    if (obj == null) continue;

                    int rawType;
                    try
                    {
                        rawType = Convert.ToInt32(obj.GraphicObjectType);
                    }
                    catch
                    {
                        // 타입 불명(예: COM 반환형 불일치)은 스킵
                        continue;
                    }

                    espGraphicObjectType type = (espGraphicObjectType)rawType;
                    if (type == espGraphicObjectType.espOperation ||
                        type == espGraphicObjectType.espFeatureChain ||
                        type == espGraphicObjectType.espFreeFormFeature ||
                        type == espGraphicObjectType.espFeatureSet ||
                        type == espGraphicObjectType.espSTL_Model)
                    {
                        try
                        {
                            obj.Delete();
                            deletedCount++;
                        }
                        catch
                        {
                            // Delete() 실패 시 컬렉션에서 Remove 시도 (Key 기반)
                            document.GraphicsCollection.Remove(obj.Key);
                            deletedCount++;
                        }
                    }
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"StlFileProcessor: CleanupGraphics 단일 객체 삭제 실패 - {ex.GetType().Name}:{ex.Message}");
                    // 개별 객체 삭제 실패는 로그만 남기고 계속 진행
                }
            }

            if (deletedCount > 0)
            {
                AppLogger.Log($"StlFileProcessor: CleanupGraphics - 초기:{initialCount}, 삭제됨:{deletedCount}, 남음:{document.GraphicsCollection.Count}");
            }
        }

        private static void EnsureCleanDocument(Document document)
        {
            if (document == null)
            {
                return;
            }

            try
            {
                AppLogger.Log($"StlFileProcessor: 초기화 전 - Ops:{SafeCount(document?.Operations)}, Chains:{SafeCount(document?.FeatureChains)}, FreeForms:{SafeCount(document?.FreeFormFeatures)}, Graphics:{SafeCount(document?.GraphicsCollection)}");

                // SelectionSet은 누적되면 내부 상태가 꼬일 수 있어 최소한으로 정리
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
                    AppLogger.Log($"StlFileProcessor: SelectionSets 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                // 누적의 핵심: Operations 컬렉션을 먼저 제거 (toolpath 누적 방지)
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
                    AppLogger.Log($"StlFileProcessor: Operations 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                // FeatureChain / FreeFormFeature / FeatureSet 등은 그래픽으로도 남지만, 컬렉션에서도 제거
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
                    AppLogger.Log($"StlFileProcessor: FeatureChains 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
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
                    AppLogger.Log($"StlFileProcessor: FreeFormFeatures 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
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
                    AppLogger.Log($"StlFileProcessor: FeatureSets 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                // 마지막으로 그래픽 컬렉션 정리 (STL/오퍼레이션/피처 잔존 방지)
                try
                {
                    CleanupGraphics(document);
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"StlFileProcessor: GraphicsCollection 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                document.Refresh();
                AppLogger.Log($"StlFileProcessor: 초기화 후 - Ops:{SafeCount(document?.Operations)}, Chains:{SafeCount(document?.FeatureChains)}, FreeForms:{SafeCount(document?.FreeFormFeatures)}, Graphics:{SafeCount(document?.GraphicsCollection)}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: 문서 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
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
                // 대부분 ESPRIT COM 컬렉션은 Count 프로퍼티를 가짐
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
        private void InvokeDentalAddin(Document document, double frontLimitX, double backLimitX, double? stlTopZ, double? finishLineTopZ)
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
                ApplyTurningParameters(mainModuleType);
                EnsureMoveModuleDefaults(mainModuleType, document);
                ApplyLimitPoints(mainModuleType, frontLimitX, backLimitX);
                
                AppLogger.Log("DentalAddin: MoveSurface 실행 시작 - NeedMoveY/Z 계산");
                InvokeMoveSurface(mainModuleType);
                AppLogger.Log("DentalAddin: MoveSurface 실행 완료");
                
                AppLogger.Log($"DentalAddin: MoveSTL 실행 시작 (FrontLimit:{frontLimitX}, BackLimit:{backLimitX})");
                InvokeMoveSTL(mainModuleType);
                
                AppLogger.Log("DentalAddin: Emerge 실행 시작 - IGS 서피스 Merge 및 Translate");
                InvokeEmerge(mainModuleType, document);
                AppLogger.Log("DentalAddin: Emerge 실행 완료");
                
                TryApplyCompositeSplitByFinishLine(mainModuleType, stlTopZ, finishLineTopZ);
                // ApplyAdditionalStlShift(document, mainModuleType, AppConfig.DefaultStlShift);
                AppLogger.Log("DentalAddin: MoveSTL 실행 완료");
                AppLogger.Log("DentalAddin: Bind 실행 시도 (Document: {(document != null)}, EspritApp: {(_espApp != null)})");
                bool bindInvoked = TryInvokeMainModuleMethod(mainModuleType, "Bind", false, _espApp, document);
                if (!bindInvoked)
                {
                    AppLogger.Log("DentalAddin: Bind 미제공 - 필드 주입만으로 진행합니다.");
                }
                AppLogger.Log("DentalAddin: Main 실행 시작");
                bool searchToolInvoked = TryInvokeMainModuleMethod(mainModuleType, "SearchTool", false);
                AppLogger.Log(searchToolInvoked
                    ? "DentalAddin: SearchTool 실행 완료"
                    : "DentalAddin: SearchTool 미제공 - 기존 Tool 구성 사용");
                EnsureCompositeTool(mainModuleType, document);
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
            int[] numCombobox = GetMainModuleField<int[]>(mainModuleType, "NumCombobox");
            SetStaticField(mainModuleType, "PrcFilePath", prcPaths);
            SetStaticField(mainModuleType, "PrcFileName", prcNames);
            bool reverseEnabled = numCombobox != null && numCombobox.Length > 4 && numCombobox[4] == 1;
            SetStaticField(mainModuleType, "ReverseOn", reverseEnabled);
            AppLogger.Log(reverseEnabled
                ? "DentalAddin.ConfigureDentalProcesses: Reverse Turning 활성 (NumCombobox[4]=1)"
                : "DentalAddin.ConfigureDentalProcesses: Reverse Turning 비활성 (NumCombobox[4]!=1)");
            double roughType = DetermineRoughType(numCombobox, prcPaths, out string roughReason);
            SetStaticField(mainModuleType, "RoughType", roughType);
            AppLogger.Log($"DentalAddin.ConfigureDentalProcesses: RoughType 자동 결정 - {roughType} ({roughReason})");
            EnsureCompositeEnabled(mainModuleType, prcPaths);
            EnsurePrcMappingsForFinishing(mainModuleType, prcPaths, prcNames);
            LogMainModuleArrays(mainModuleType);
        }
        private static void EnsurePrcMappingsForFinishing(Type mainModuleType, string[] prcPaths, string[] prcNames)
        {
            try
            {
                int[] numCombobox = GetMainModuleField<int[]>(mainModuleType, "NumCombobox");
                int finishingMethod = (numCombobox != null && numCombobox.Length > 1) ? numCombobox[1] : 0;
                if (finishingMethod != 1)
                {
                    return;
                }
                if (prcPaths == null || prcPaths.Length <= 10)
                {
                    AppLogger.Log("DentalAddin 경고: FinishingMethod=1 이지만 PRC[10](5axisComposite) 배열 길이가 부족함");
                    return;
                }
                string compositePrc = prcPaths[10];
                if (string.IsNullOrWhiteSpace(compositePrc))
                {
                    string compositeName = (prcNames != null && prcNames.Length > 10) ? prcNames[10] : "(미지정)";
                    AppLogger.Log($"DentalAddin 경고: FinishingMethod=1 이지만 PRC[10](5axisComposite:{compositeName}) 경로가 비어있음");
                }
                else
                {
                    AppLogger.Log($"DentalAddin: FinishingMethod=1 - PRC[10] 사용 ({Path.GetFileName(compositePrc)})");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: Finishing PRC 확인 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static void EnsureCompositeEnabled(Type mainModuleType, string[] prcPaths)
        {
            try
            {
                int[] numCombobox = GetMainModuleField<int[]>(mainModuleType, "NumCombobox");
                if (numCombobox == null || numCombobox.Length <= 3)
                {
                    return;
                }
                int finishingMethod = numCombobox.Length > 1 ? numCombobox[1] : -1;
                string compositePrc = (prcPaths != null && prcPaths.Length > 11) ? prcPaths[11] : null;
                if (finishingMethod == 1)
                {
                    AppLogger.Log("DentalAddin: Finishing Method=4 axis 선택됨 (NumCombobox[1]=1)");
                    if (string.IsNullOrWhiteSpace(compositePrc))
                    {
                        AppLogger.Log("DentalAddin 경고: Finishing Method=4 axis지만 Composite2 PRC 경로가 비어있습니다.");
                    }
                    else
                    {
                        AppLogger.Log($"DentalAddin: Composite2 PRC 준비됨 - {Path.GetFileName(compositePrc)}");
                    }
                }
                else
                {
                    AppLogger.Log($"DentalAddin: Finishing Method=3d Milling (NumCombobox[1]={finishingMethod})");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: NumCombobox[3] 보정 실패 - {ex.GetType().Name}:{ex.Message}");
            }
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
        private void LogCompositePreconditions(Document document)
        {
            try
            {
                var freeForms = document?.FreeFormFeatures;
                if (freeForms == null)
                {
                    AppLogger.Log("Composite2 전검사 - Document.FreeFormFeatures null");
                    return;
                }
                bool has3DMilling0 = false;
                int count = freeForms.Count;
                for (int i = 1; i <= count; i++)
                {
                    FreeFormFeature ff = null;
                    try { ff = freeForms[i]; } catch { }
                    if (ff == null)
                    {
                        continue;
                    }
                    string name = ff.Name ?? string.Empty;
                    if (name.Equals("3DMilling_0Degree", StringComparison.OrdinalIgnoreCase))
                    {
                        has3DMilling0 = true;
                        break;
                    }
                }
                AppLogger.Log($"Composite2 전검사 - 3DMilling_0Degree {(has3DMilling0 ? "존재" : "없음")}");
                AppLogger.Log($"Composite2 전검사 - SurfaceNumber:{GetStaticFieldValue<int>("DentalAddin.MainModule", "SurfaceNumber")}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"Composite2 전검사 로깅 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static TField GetStaticFieldValue<TField>(string typeName, string fieldName)
        {
            try
            {
                Type type = Type.GetType(typeName);
                FieldInfo field = type?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (field == null)
                {
                    return default;
                }
                object value = field.GetValue(null);
                if (value is TField typed)
                {
                    return typed;
                }
                return default;
            }
            catch
            {
                return default;
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
                    AppLogger.Log($"DentalAddin.TryApplyDentalUserData: UserData xml 없음 - {xmlPath}");
                    return;
                }
                Assembly asm = mainModuleType.Assembly;
                Type serializableType = asm.GetType("DentalAddin.SerializableData");
                Type userDataType = asm.GetType("DentalAddin.UserData");
                if (serializableType == null || userDataType == null)
                {
                    AppLogger.Log("DentalAddin.TryApplyDentalUserData: UserData 타입/SerializableData 타입을 찾지 못해 로드 생략");
                    return;
                }
                MethodInfo loadMethod = serializableType.GetMethod("Load", BindingFlags.Public | BindingFlags.Static, null, new[] { typeof(string), typeof(Type) }, null);
                if (loadMethod == null)
                {
                    AppLogger.Log("DentalAddin.TryApplyDentalUserData: SerializableData.Load 메서드를 찾지 못해 로드 생략");
                    return;
                }
                object ud = loadMethod.Invoke(null, new object[] { xmlPath, userDataType });
                if (ud == null)
                {
                    AppLogger.Log("DentalAddin.TryApplyDentalUserData: UserData 로드 결과가 null");
                    return;
                }
                string udDir = userDataType.GetField("PrcDirectory")?.GetValue(ud) as string;
                if (!string.IsNullOrWhiteSpace(udDir) && Directory.Exists(udDir))
                {
                    prcDirectory = udDir;
                    AppLogger.Log($"DentalAddin.TryApplyDentalUserData: UserData.PrctDirectory 적용 - {prcDirectory}");
                }
                string[] udPaths = userDataType.GetField("PrcFilePath")?.GetValue(ud) as string[];
                string[] udNames = userDataType.GetField("PrcFileName")?.GetValue(ud) as string[];
                double[] udNumData = userDataType.GetField("NumData")?.GetValue(ud) as double[];
                int[] udNumCombobox = userDataType.GetField("NumCombobox")?.GetValue(ud) as int[];
                if (udNumData != null)
                {
                    SetStaticField(mainModuleType, "NumData", udNumData);
                    AppLogger.Log($"DentalAddin.TryApplyDentalUserData: UserData.NumData 적용 (Len:{udNumData.Length})");
                }
                if (udNumCombobox != null)
                {
                    SetStaticField(mainModuleType, "NumCombobox", udNumCombobox);
                    AppLogger.Log($"DentalAddin.TryApplyDentalUserData: UserData.NumCombobox 적용 (Len:{udNumCombobox.Length})");
                }
                if (udPaths != null)
                {
                    string[] current = EnsurePrcArray(GetMainModuleField<string[]>(mainModuleType, "PrcFilePath"));
                    int max = Math.Min(current.Length, udPaths.Length);
                    for (int i = 0; i < max; i++)
                    {
                        if (!string.IsNullOrWhiteSpace(udPaths[i]))
                        {
                            string resolved = ResolveProcessPath(prcDirectory, udPaths[i]);
                            string legacyName = null;
                            try { legacyName = Path.GetFileName(resolved); } catch { legacyName = null; }
                            if (string.Equals(legacyName, "네오_R_Connection_H.prc", StringComparison.OrdinalIgnoreCase))
                            {
                                resolved = ResolveProcessPath(prcDirectory, AppConfig.FaceHoleProcessPath);
                            }
                            else if (string.Equals(legacyName, "네오_R_Connection.prc", StringComparison.OrdinalIgnoreCase))
                            {
                                resolved = ResolveProcessPath(prcDirectory, AppConfig.ConnectionProcessPath);
                            }
                            if (!string.IsNullOrWhiteSpace(resolved) && Directory.Exists(resolved))
                            {
                                string name = (udNames != null && i < udNames.Length) ? udNames[i] : null;
                                if (!string.IsNullOrWhiteSpace(name))
                                {
                                    string combined = Path.Combine(resolved, name);
                                    if (File.Exists(combined))
                                    {
                                        resolved = combined;
                                    }
                                }
                            }
                            current[i] = resolved;
                        }
                    }
                    SetStaticField(mainModuleType, "PrcFilePath", current);
                    AppLogger.Log($"DentalAddin.TryApplyDentalUserData: UserData.PrcFilePath 적용 (Len:{udPaths.Length})");
                }
                if (udNames != null)
                {
                    string[] current = EnsurePrcArray(GetMainModuleField<string[]>(mainModuleType, "PrcFileName"));
                    int max = Math.Min(current.Length, udNames.Length);
                    for (int i = 0; i < max; i++)
                    {
                        if (!string.IsNullOrWhiteSpace(udNames[i]))
                        {
                            if (string.Equals(udNames[i], "네오_R_Connection_H.prc", StringComparison.OrdinalIgnoreCase))
                            {
                                current[i] = Path.GetFileName(AppConfig.FaceHoleProcessPath);
                            }
                            else if (string.Equals(udNames[i], "네오_R_Connection.prc", StringComparison.OrdinalIgnoreCase))
                            {
                                current[i] = Path.GetFileName(AppConfig.ConnectionProcessPath);
                            }
                            else
                            {
                                current[i] = udNames[i];
                            }
                        }
                    }
                    SetStaticField(mainModuleType, "PrcFileName", current);
                    AppLogger.Log($"DentalAddin.TryApplyDentalUserData: UserData.PrcFileName 적용 (Len:{udNames.Length})");
                }
            }
            catch (TargetInvocationException tie)
            {
                Exception root = tie.GetBaseException();
                AppLogger.Log($"DentalAddin.TryApplyDentalUserData: UserData 로드 중 예외\n{root}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin.TryApplyDentalUserData: UserData 적용 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static double DetermineRoughType(int[] numCombobox, string[] prcPaths, out string reason)
        {
            string prefix = null;
            if (numCombobox != null && numCombobox.Length > 6)
            {
                int roughMethod = numCombobox[6];
                switch (roughMethod)
                {
                    case 0:
                        reason = "NumCombobox[6]=0 (FlatEndMillRough)";
                        return 1.0;
                    case 1:
                        reason = "NumCombobox[6]=1 (BallEndMillRough2Position)";
                        return 2.0;
                    case 2:
                        reason = "NumCombobox[6]=2 (BallEndMillRough3Position)";
                        return 3.0;
                    default:
                        prefix = $"NumCombobox[6]={roughMethod} 매핑 없음, ";
                        break;
                }
            }
            double fallback = DeriveRoughTypeFromPrc(prcPaths);
            string roughPrc = (prcPaths != null && prcPaths.Length > 3) ? prcPaths[3] : "(null)";
            reason = $"{prefix}PRC 경로 기반 (RoughPRC:{roughPrc})";
            return fallback;
        }
        private static double DeriveRoughTypeFromPrc(string[] prcPaths)
        {
            string path = (prcPaths != null && prcPaths.Length > 3) ? prcPaths[3] : null;
            if (string.IsNullOrWhiteSpace(path))
            {
                return 1.0;
            }
            string normalized = path.Replace('/', '\\');
            if (normalized.IndexOf("\\8_0-180", StringComparison.OrdinalIgnoreCase) >= 0 ||
                normalized.IndexOf("0-180", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return 2.0;
            }
            if (normalized.IndexOf("\\5_Rough", StringComparison.OrdinalIgnoreCase) >= 0 ||
                normalized.IndexOf("MillRough_3D", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return 3.0;
            }
            if (normalized.IndexOf("0-120-240", StringComparison.OrdinalIgnoreCase) >= 0)
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
                else if (relative.StartsWith(AppConfig.PrcRootDirectory, StringComparison.OrdinalIgnoreCase))
                {
                    relative = relative.Substring(AppConfig.PrcRootDirectory.Length);
                }
                else
                {
                    relative = Path.GetFileName(relative);
                }
            }
            relative = relative.TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string fallback = Path.Combine(AppConfig.PrcRootDirectory, relative);
            string fallbackFull = Path.GetFullPath(fallback);
            if (File.Exists(fallbackFull))
            {
                AppLogger.Log($"DentalAddin.ResolveProcessPath: PRC 기본 경로에서 찾지 못해 AcroDent 경로로 대체 - {fallbackFull}");
                return fallbackFull;
            }
            AppLogger.Log($"DentalAddin.ResolveProcessPath: PRC 파일을 찾을 수 없음 - {fullPath}");
            return fullPath;
        }
        private static string ResolvePrcDirectory()
        {
            string prcRoot = AppConfig.PrcRootDirectory;
            string faceHole = Path.Combine(prcRoot, "1_Face Hole", Path.GetFileName(AppConfig.FaceHoleProcessPath));
            string connection = Path.Combine(prcRoot, "2_Connection", Path.GetFileName(AppConfig.ConnectionProcessPath));
            if (Directory.Exists(prcRoot) && (File.Exists(faceHole) || File.Exists(connection)))
            {
                return prcRoot;
            }

            string addInPrc = Path.Combine(AppConfig.AddInRootDirectory, "AcroDent");
            string addInFaceHole = Path.Combine(addInPrc, "1_Face Hole", Path.GetFileName(AppConfig.FaceHoleProcessPath));
            string addInConnection = Path.Combine(addInPrc, "2_Connection", Path.GetFileName(AppConfig.ConnectionProcessPath));
            if (Directory.Exists(addInPrc) && (File.Exists(addInFaceHole) || File.Exists(addInConnection)))
            {
                AppLogger.Log($"DentalAddin.ResolvePrcDirectory: PRC 경로를 AddIn 루트로 보정 - {addInPrc}");
                return addInPrc;
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
            AppLogger.Log($"DentalAddin.ResolvePrcDirectory: PRC 디렉터리를 찾을 수 없어 기본 경로 사용 - {prcRoot}");
            return prcRoot;
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
        private void EnsureCompositeTool(Type mainModuleType, Document document)
        {
            try
            {
                object tools = document?.Tools;
                if (tools == null)
                {
                    AppLogger.Log("CompositeTool - Document.Tools null");
                    return;
                }
                int[] numCombobox = GetMainModuleField<int[]>(mainModuleType, "NumCombobox");
                int finishingMethod = (numCombobox != null && numCombobox.Length > 1) ? numCombobox[1] : 0;
                string strictToolId = null;
                string relaxedToolId = null;
                string relaxedInfo = null;
                foreach (Tool tool in EnumerateTools(tools))
                {
                    if (tool is not ToolMillBallMill ball)
                    {
                        continue;
                    }
                    if (finishingMethod == 1 && string.IsNullOrWhiteSpace(strictToolId) && Math.Abs(ball.ToolDiameter - 1.2) <= 0.05)
                    {
                        strictToolId = ball.ToolID;
                        break;
                    }
                    if (string.IsNullOrWhiteSpace(strictToolId) &&
                        ball.Orientation == espMillToolOrientation.espMillToolOrientationYPlus &&
                        Math.Abs(ball.ToolDiameter - 4.0) <= 0.01)
                    {
                        strictToolId = ball.ToolID;
                        break;
                    }
                    if (string.IsNullOrWhiteSpace(relaxedToolId) && Math.Abs(ball.ToolDiameter - 4.0) <= 0.5)
                    {
                        relaxedToolId = ball.ToolID;
                        relaxedInfo = $"Dia:{ball.ToolDiameter:F2}, Ori:{ball.Orientation}";
                    }
                }
                string targetToolId = !string.IsNullOrWhiteSpace(strictToolId) ? strictToolId : relaxedToolId;
                if (string.IsNullOrWhiteSpace(targetToolId))
                {
                    AppLogger.Log(finishingMethod == 1
                        ? "CompositeTool - BM1.2 공구를 찾지 못했습니다. Finishing 4축 공정이 누락될 수 있습니다."
                        : "CompositeTool - Ø4 BallEndMill 공구를 찾지 못했습니다. Composite2 비활성화");
                    LogToolsSnapshot(tools);
                    return;
                }
                if (string.IsNullOrWhiteSpace(strictToolId))
                {
                    AppLogger.Log($"CompositeTool - 원본(Y+ Ø4) 미발견, 완화조건으로 선택: {targetToolId} ({relaxedInfo})");
                    LogToolsSnapshot(tools);
                }
                else
                {
                    AppLogger.Log($"CompositeTool - 원본조건 공구 사용: {targetToolId}");
                }
                SetStaticField(mainModuleType, "ToolNs", targetToolId);
                AppLogger.Log($"CompositeTool - ToolNs 설정: {targetToolId} (FinishingMethod:{finishingMethod})");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"CompositeTool 준비 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static void DisableComposite2(Type mainModuleType)
        {
            try
            {
                AppLogger.Log("CompositeTool - DisableComposite2 호출됨 (NumCombobox 수정은 하지 않음)");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"CompositeTool - Composite2 비활성화 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static void LogToolsSnapshot(object tools)
        {
            try
            {
                int total = GetCollectionCount(tools);
                AppLogger.Log($"CompositeTool - Tools.Count:{total}");
                int printed = 0;
                foreach (Tool tool in EnumerateTools(tools))
                {
                    if (printed >= 80)
                    {
                        AppLogger.Log("CompositeTool - Tools 출력 생략(상한 80)");
                        break;
                    }
                    string id = string.Empty;
                    espToolType style = 0;
                    try { id = tool.ToolID ?? string.Empty; } catch { }
                    try { style = tool.ToolStyle; } catch { }
                    if (tool is ToolMillBallMill ball)
                    {
                        AppLogger.Log($"CompositeTool - Tool[{printed + 1}] Id:{id}, Style:{style}, Dia:{ball.ToolDiameter:F2}, Ori:{ball.Orientation}");
                    }
                    else
                    {
                        AppLogger.Log($"CompositeTool - Tool[{printed + 1}] Id:{id}, Style:{style}");
                    }
                    printed++;
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"CompositeTool - Tools 스냅샷 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static IEnumerable<Tool> EnumerateTools(object tools)
        {
            if (tools == null)
            {
                yield break;
            }
            int count = GetCollectionCount(tools);
            if (count > 0)
            {
                for (int i = 1; i <= count; i++)
                {
                    Tool tool = GetToolByIndex(tools, i);
                    if (tool != null)
                    {
                        yield return tool;
                    }
                }
                yield break;
            }
            if (tools is IEnumerable enumerable)
            {
                foreach (object entry in enumerable)
                {
                    if (entry is Tool tool)
                    {
                        yield return tool;
                    }
                }
            }
        }
        private static int GetCollectionCount(object collection)
        {
            if (collection == null)
            {
                return 0;
            }
            try
            {
                object value = collection.GetType().InvokeMember("Count", BindingFlags.GetProperty, null, collection, null);
                if (value is int count)
                {
                    return count;
                }
            }
            catch
            {
                // ignore
            }
            return 0;
        }
        private static Tool GetToolByIndex(object collection, int index)
        {
            if (collection == null)
            {
                return null;
            }
            object[] args = { index };
            try
            {
                object value = collection.GetType().InvokeMember("Item", BindingFlags.GetProperty, null, collection, args);
                return value as Tool;
            }
            catch
            {
                try
                {
                    object value = collection.GetType().InvokeMember("get_Item", BindingFlags.InvokeMethod, null, collection, args);
                    return value as Tool;
                }
                catch
                {
                    // ignore
                }
            }
            return null;
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
        private void InvokeMoveSurface(Type mainModuleType)
        {
            Type moveModuleType = ResolveMoveModuleType(mainModuleType);
            if (moveModuleType == null)
            {
                AppLogger.Log("DentalAddin: MoveSTL_Module 타입을 찾을 수 없어 MoveSurface 호출 생략");
                return;
            }
            bool invoked = TryInvokeModuleMethod(moveModuleType, "MoveSurface");
            if (!invoked)
            {
                AppLogger.Log("DentalAddin: MoveSurface 메서드 호출 실패");
                return;
            }
            
            // MoveSurface 실행 후 계산된 값 로깅
            try
            {
                FieldInfo needMoveField = moveModuleType.GetField("NeedMove", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                FieldInfo needMoveYField = moveModuleType.GetField("NeedMoveY", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                FieldInfo needMoveZField = moveModuleType.GetField("NeedMoveZ", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                
                bool needMove = needMoveField != null && Convert.ToBoolean(needMoveField.GetValue(null));
                double needMoveY = needMoveYField != null ? Convert.ToDouble(needMoveYField.GetValue(null)) : 0;
                double needMoveZ = needMoveZField != null ? Convert.ToDouble(needMoveZField.GetValue(null)) : 0;
                
                AppLogger.Log($"DentalAddin: MoveSurface 계산 결과 - NeedMove:{needMove}, NeedMoveY:{needMoveY:F4}, NeedMoveZ:{needMoveZ:F4}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: MoveSurface 결과 로깅 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        
        private void InvokeEmerge(Type mainModuleType, Document document)
        {
            if (mainModuleType == null)
            {
                AppLogger.Log("DentalAddin: MainModule 타입이 null이어서 Emerge 호출 생략");
                return;
            }

            if (document == null)
            {
                AppLogger.Log("DentalAddin: Document가 null이어서 Emerge 호출 생략");
                return;
            }

            if (TryInvokeCustomSurfaceMerge(mainModuleType, document))
            {
                return;
            }

            bool invoked = TryInvokeMainModuleMethod(mainModuleType, "Emerge", false);
            if (!invoked)
            {
                AppLogger.Log("DentalAddin: Emerge 메서드 호출 실패");
                return;
            }

            // Emerge 실행 후 SurfaceNumber 로깅
            try
            {
                FieldInfo surfaceNumberField = mainModuleType.GetField("SurfaceNumber", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (surfaceNumberField != null)
                {
                    int surfaceNumber = Convert.ToInt32(surfaceNumberField.GetValue(null));
                    AppLogger.Log($"DentalAddin: Emerge 완료 - SurfaceNumber:{surfaceNumber}");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: Emerge 결과 로깅 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private bool TryInvokeCustomSurfaceMerge(Type mainModuleType, Document document)
        {
            string surfaceRoot = AppConfig.SurfaceRootDirectory;
            if (string.IsNullOrWhiteSpace(surfaceRoot) || !Directory.Exists(surfaceRoot))
            {
                AppLogger.Log($"DentalAddin: SurfaceRoot 없음 - {surfaceRoot}");
                return false;
            }

            double rl = 1.0;
            try
            {
                FieldInfo rlField = mainModuleType.GetField("RL", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (rlField != null)
                {
                    rl = Convert.ToDouble(rlField.GetValue(null), CultureInfo.InvariantCulture);
                }
            }
            catch
            {
                rl = 1.0;
            }

            string projectFile = rl == 2.0 ? "Project2.igs" : "Project1.igs";
            string extrudeFile = rl == 2.0 ? "ExtrudeL.igs" : "ExtrudeR.igs";
            string projectPath = Path.Combine(surfaceRoot, projectFile);
            string extrudePath = Path.Combine(surfaceRoot, extrudeFile);

            if (!File.Exists(projectPath))
            {
                AppLogger.Log($"DentalAddin: Surface 파일 없음 - {projectPath}");
                return false;
            }

            try
            {
                int beforeCount = document.GraphicsCollection.Count;
                AppLogger.Log($"DentalAddin: Surface Merge(1) - {projectPath}");
                document.MergeFile(projectPath, Missing.Value);

                GraphicObject surface = FindMergedSurface(document, beforeCount);
                if (surface == null)
                {
                    AppLogger.Log("DentalAddin: Merge된 Surface를 찾지 못했습니다.");
                    return true;
                }

                surface.Layer.Visible = false;
                FieldInfo surfaceNumberField = mainModuleType.GetField("SurfaceNumber", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                surfaceNumberField?.SetValue(null, Convert.ToInt32(surface.Key, CultureInfo.InvariantCulture));

                SelectionSet selectionSet = GetOrCreateSelectionSet(document, "Smove");
                selectionSet.RemoveAll();

                Type moveModuleType = ResolveMoveModuleType(mainModuleType);
                bool needMove = moveModuleType != null && Convert.ToBoolean(moveModuleType.GetField("NeedMove", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(null) ?? false);
                double needMoveY = moveModuleType != null ? Convert.ToDouble(moveModuleType.GetField("NeedMoveY", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(null) ?? 0.0) : 0.0;
                double needMoveZ = moveModuleType != null ? Convert.ToDouble(moveModuleType.GetField("NeedMoveZ", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(null) ?? 0.0) : 0.0;

                if (needMove)
                {
                    selectionSet.Add(surface, Missing.Value);
                    selectionSet.Translate(0.0, needMoveY, needMoveZ, Missing.Value);
                    selectionSet.RemoveAll();
                }

                int[] numCombobox = GetMainModuleField<int[]>(mainModuleType, "NumCombobox");
                int finishingMethod = (numCombobox != null && numCombobox.Length > 1) ? numCombobox[1] : 0;
                if (finishingMethod == 1)
                {
                    AppLogger.Log("DentalAddin: FinishingMethod==1, Extrude Merge 생략");
                    return true;
                }

                if (!File.Exists(extrudePath))
                {
                    AppLogger.Log($"DentalAddin: Extrude 파일 없음 - {extrudePath}");
                    return true;
                }

                beforeCount = document.GraphicsCollection.Count;
                AppLogger.Log($"DentalAddin: Surface Merge(2) - {extrudePath}");
                document.MergeFile(extrudePath, Missing.Value);
                GraphicObject extrudeSurface = FindMergedSurface(document, beforeCount, surface.Key);
                if (extrudeSurface != null)
                {
                    extrudeSurface.Layer.Visible = false;
                    FieldInfo surfaceNumber2Field = mainModuleType.GetField("SurfaceNumber2", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                    surfaceNumber2Field?.SetValue(null, Convert.ToDouble(extrudeSurface.Key, CultureInfo.InvariantCulture));
                    FieldInfo gasField = mainModuleType.GetField("Gas", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                    gasField?.SetValue(null, extrudeSurface);
                }

                return true;
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: 커스텀 Surface Merge 실패 - {ex.GetType().Name}:{ex.Message}");
                return false;
            }
        }

        private static GraphicObject FindMergedSurface(Document document, int beforeCount, object excludedKey = null)
        {
            if (document?.GraphicsCollection == null)
            {
                return null;
            }

            int count = document.GraphicsCollection.Count;
            for (int i = beforeCount + 1; i <= count; i++)
            {
                GraphicObject graphicObject = document.GraphicsCollection[i] as GraphicObject;
                if (graphicObject?.GraphicObjectType != espGraphicObjectType.espSurface)
                {
                    continue;
                }
                if (excludedKey != null && Equals(graphicObject.Key, excludedKey))
                {
                    continue;
                }
                return graphicObject;
            }

            return null;
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
        private void ApplyAdditionalStlShift(Document document, Type mainModuleType, double deltaX)
        {
            if (document == null || deltaX <= 0)
            {
                return;
            }
            try
            {
                const string selectionName = "StlProcessorShift";
                SelectionSet selectionSet = GetOrCreateSelectionSet(document, selectionName);
                if (selectionSet == null)
                {
                    AppLogger.Log("DentalAddin: 추가 이동 SelectionSet 생성 실패");
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
                    AppLogger.Log("DentalAddin: 추가 X 이동 대상 STL 없음");
                    return;
                }
                selectionSet.Translate(deltaX, 0.0, 0.0, Missing.Value);
                selectionSet.RemoveAll();
                Type moveModuleType = ResolveMoveModuleType(mainModuleType);
                if (moveModuleType == null)
                {
                    AppLogger.Log("DentalAddin: 추가 이동 후 MoveSTL_Module 타입을 찾을 수 없습니다.");
                    return;
                }
                double? originalFront = TryGetMoveModuleDouble("FrontPointX");
                double? originalBack = TryGetMoveModuleDouble("BackPointX");
                double? updatedFront = originalFront.HasValue ? originalFront + deltaX : (double?)null;
                double? updatedBack = originalBack.HasValue ? originalBack + deltaX : (double?)null;
                if (updatedFront.HasValue)
                {
                    SetStaticField(moveModuleType, "FrontPointX", updatedFront.Value);
                }
                if (updatedBack.HasValue)
                {
                    SetStaticField(moveModuleType, "BackPointX", updatedBack.Value);
                }
                AppLogger.Log($"DentalAddin: STL 추가 X 이동 dX:{deltaX:F3}, FrontPointX:{FormatNcNumber(updatedFront)}, BackPointX:{FormatNcNumber(updatedBack)}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: STL 추가 이동 실패 - {ex.GetType().Name}:{ex.Message}");
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
        private void UpdateLatheBarDiameter(Document document, string stlPath, double initialBarDiameter)
        {
            try
            {
                double diameter = initialBarDiameter > 0 ? initialBarDiameter : ResolveBarDiameter(document, stlPath);
                if (diameter <= 0)
                {
                    diameter = 6.0;
                }
                if (document?.LatheMachineSetup == null)
                {
                    AppLogger.Log("StlFileProcessor: LatheMachineSetup이 없어 BarDiameter 설정을 건너뜁니다.");
                    return;
                }
                document.LatheMachineSetup.BarDiameter = diameter;
                AppLogger.Log($"StlFileProcessor: BarDiameter 설정 - {diameter:F3} (STL:{Path.GetFileName(stlPath)})");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: BarDiameter 설정 실패 - {ex.Message}");
            }
        }
        private double ResolveBarDiameter(Document document, string stlPath)
        {
            // TODO: STL 최대 직경 계산 로직 연동(백엔드 결과 활용)
            return 6.0;
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
        private static void ApplyTurningParameters(Type mainModuleType)
        {
            if (mainModuleType == null)
            {
                return;
            }
            SetStaticField(mainModuleType, "TurningDepth", AppConfig.TurningDepth);
            SetStaticField(mainModuleType, "TurningExtend", AppConfig.TurningExtend);
            SetStaticField(mainModuleType, "Chamfer", AppConfig.ExitAngle);
            SetStaticField(mainModuleType, "AngleNumber", AppConfig.ExitAngle);
            AppLogger.Log($"DentalAddin: Turning 파라미터 설정 - Depth:{AppConfig.TurningDepth}, Extend:{AppConfig.TurningExtend}, Angle:{AppConfig.ExitAngle}");
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