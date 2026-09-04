// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - web/backend/controllers/requests/common.review.controller.js
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Esprit;
using EspritConstants;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;
namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers
{
    /// <summary>
    /// NC 파일 생성 및 후처리.
    /// CNC 컨트롤러는 축 워드 정수(C30, X10, Z0)를 인식하지 못한다. 반드시 C30.0 처럼 소수점을 명시한다.
    /// 숫자 ToString 최적화("0.###", 정수 단축, TrimEnd 0) 금지. FormatRotationNumber / FormatNcNumber / EnsureNcCoordinateDecimalsOnFile 참고.
    /// </summary>
    public class NcFileGenerator
    {
        private readonly Application _espApp;
        private readonly string _outputFolder;
        private readonly string _postProcessorFile;

        // CNC 축 워드 정수 금지 (C30 → C30.0). \b 사용 금지: G0X30 처럼 워드가 붙으면 \b 가 X 앞에 서지 않는다.
        // G/M/T/O/P/N/S/F/L 는 정수 코드이므로 이 패턴에 넣지 말 것.
        private static readonly Regex NcAxisIntegerWordRegex = new Regex(
            @"([XYZABCUVWHIJKR])([+-]?)(\d+)(?![0-9.])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        private static readonly Regex NcAxisTrailingDotWordRegex = new Regex(
            @"([XYZABCUVWHIJKR])([+-]?)(\d+)\.(?![0-9])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        public NcFileGenerator(Application espApp, string outputFolder, string postProcessorFile)
        {
            _espApp = espApp ?? throw new ArgumentNullException(nameof(espApp));
            // [정책] StorageNcDirectory 대신 OS temp 기반 임시 디렉토리
            _outputFolder = outputFolder ?? System.IO.Path.Combine(System.IO.Path.GetTempPath(), "abuts-esprit-nc");
            System.IO.Directory.CreateDirectory(_outputFolder);
            _postProcessorFile = postProcessorFile ?? "Acro_dent_XE.asc";
        }
        public string GenerateNcFile(Document document, string stlPath, double frontPointX, double stockDiameter, string serialCode, double? stlBoundingTopZ = null, string connectionPrcPath = null, string manufacturerHexRotation = null, double? hexRotationAppliedDeg = null, BackendApiClient.RequestMetaLotEngravingSite lotEngravingSite = null)
        {
            if (document == null)
            {
                throw new InvalidOperationException("NcFileGenerator: document is null");
            }

            string postDir = _espApp.Configuration.GetFileDirectory(espFileType.espFileTypePostProcessor);
            string postFilePath = Path.Combine(postDir, _postProcessorFile);
            string ncFileName = BuildNcFilePath(stlPath);

            AppLogger.Log($"NcFileGenerator: NC 생성 준비 - postDir='{postDir}', postFile='{postFilePath}', out='{ncFileName}'");
            if (!File.Exists(postFilePath))
            {
                throw new FileNotFoundException($"Post file not found: {postFilePath}", postFilePath);
            }

            string addMode = Environment.GetEnvironmentVariable("ABUTS_NC_ADD_MODE");
            bool safeEachMode = string.Equals(addMode, "SAFE_EACH", StringComparison.OrdinalIgnoreCase)
                || string.Equals(addMode, "1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(addMode, "TRUE", StringComparison.OrdinalIgnoreCase);
            if (safeEachMode)
            {
                AppLogger.Log($"NcFileGenerator: NCCode 채우기 모드=SAFE_EACH (env ABUTS_NC_ADD_MODE='{addMode ?? ""}')");
                TryPopulateNcCodeSafely(document, out int addedCount);
                AppLogger.Log($"NcFileGenerator: NCCode SAFE_EACH 완료 - added={addedCount}");
            }
            else
            {
                AppLogger.Log($"NcFileGenerator: NCCode 채우기 모드=ADD_ALL (기본, env ABUTS_NC_ADD_MODE='{addMode ?? ""}')");
                document.NCCode.AddAll();
                AppLogger.Log("NcFileGenerator: NCCode.AddAll 완료");
            }

            AppLogger.Log("NcFileGenerator: NCCode.Execute 시작");
            string executedNcPath = ncFileName;
            try
            {
                document.NCCode.Execute(postFilePath, ncFileName, Missing.Value);
                AppLogger.Log($"NcFileGenerator: NC 저장 완료 - {ncFileName}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"NcFileGenerator: NCCode.Execute 1차 실패 - {ex.GetType().Name}:{ex.Message}");
                string fallbackPath = BuildExecuteFallbackNcPath(stlPath, ncFileName);
                AppLogger.Log($"NcFileGenerator: NCCode.Execute 재시도(ASCII fallback) - {fallbackPath}");
                document.NCCode.Execute(postFilePath, fallbackPath, Missing.Value);
                AppLogger.Log($"NcFileGenerator: NC 저장 완료(fallback) - {fallbackPath}");
                executedNcPath = fallbackPath;
            }

            UpdateNcHeader(executedNcPath, Path.GetFileName(executedNcPath), frontPointX, stockDiameter, stlBoundingTopZ, manufacturerHexRotation, hexRotationAppliedDeg);

            string serialForNc = NormalizeSerialCode(serialCode);
            AppLogger.Log($"NcFileGenerator: Serial 각인 코드 적용 - Raw:'{serialCode ?? string.Empty}' => Use:'{serialForNc}'");
            UpdateSerialBlocks(executedNcPath, serialForNc, connectionPrcPath, lotEngravingSite, hexRotationAppliedDeg);
            // T0909(Serial) C는 포스트 사이트 방위. 헥스모드 C 치환은 T0606/T4848만.
            ApplyManufacturerHexRotationToNc(executedNcPath, manufacturerHexRotation);
            StripBlankNcLines(executedNcPath);
            // CNC 컨트롤러는 축 워드 정수(C30, X10, Z0)를 인식하지 못한다.
            // ESPRIT 포스트·헥스 치환·시리얼 블록 이후 최종 한 번 더 소수점을 강제한다.
            // 이 호출을 제거/스킵하는 "최적화"는 금지. 상세: EnsureNcCoordinateDecimalsOnFile
            EnsureNcCoordinateDecimalsOnFile(executedNcPath);
            return executedNcPath;
        }
        private string BuildNcFilePath(string stlPath)
        {
            string baseName = Path.GetFileNameWithoutExtension(stlPath) ?? "output";
            string sanitizedBase = RemoveFilledToken(baseName);

            string requestId = BackendApiClient.ExtractRequestIdFromStlPath(stlPath);

            if (!string.IsNullOrWhiteSpace(requestId))
            {
                string requestFolder = Path.Combine(_outputFolder, requestId);
                Directory.CreateDirectory(requestFolder);
                return Path.Combine(requestFolder, sanitizedBase + ".nc");
            }

            return Path.Combine(_outputFolder, sanitizedBase + ".nc");
        }
        private string BuildExecuteFallbackNcPath(string stlPath, string currentNcPath)
        {
            string requestId = BackendApiClient.ExtractRequestIdFromStlPath(stlPath);
            string dir = Path.GetDirectoryName(currentNcPath);
            if (string.IsNullOrWhiteSpace(dir))
            {
                dir = _outputFolder;
            }
            Directory.CreateDirectory(dir);

            string safeStem = !string.IsNullOrWhiteSpace(requestId) ? requestId : "nc";
            safeStem = Regex.Replace(safeStem, "[^A-Za-z0-9_-]", "_");
            if (string.IsNullOrWhiteSpace(safeStem))
            {
                safeStem = "nc";
            }

            string fileName = safeStem + "-ascii.nc";
            return Path.Combine(dir, fileName);
        }

        private static bool TryPopulateNcCodeSafely(Document document, out int addedCount)
        {
            addedCount = 0;
            try
            {
                if (document?.NCCode == null || document?.Operations == null)
                {
                    AppLogger.Log("NcFileGenerator: SAFE_EACH 중단 - NCCode/Operations null");
                    return false;
                }

                // 기존 NCCode 목록 초기화 시도
                try
                {
                    document.NCCode.GetType().InvokeMember("RemoveAll", BindingFlags.InvokeMethod, null, document.NCCode, null);
                    AppLogger.Log("NcFileGenerator: NCCode.RemoveAll 완료");
                }
                catch
                {
                    // 일부 버전은 RemoveAll 미지원
                }

                int opCount = document.Operations.Count;
                AppLogger.Log($"NcFileGenerator: SAFE_EACH 시작 - Operations.Count={opCount}");
                for (int i = 1; i <= opCount; i++)
                {
                    object op = null;
                    try
                    {
                        AppLogger.Log($"NcFileGenerator: SAFE_EACH - Operations[{i}] 로드 시작");
                        op = document.Operations[i];
                    }
                    catch (Exception ex)
                    {
                        AppLogger.Log($"NcFileGenerator: SAFE_EACH - Operations[{i}] 접근 실패: {ex.GetType().Name}:{ex.Message}");
                        continue;
                    }

                    try
                    {
                        AppLogger.Log($"NcFileGenerator: SAFE_EACH - Add 시도 [{i}/{opCount}] (2-args)");
                        document.NCCode.GetType().InvokeMember("Add", BindingFlags.InvokeMethod, null, document.NCCode, new object[] { op, Missing.Value });
                        addedCount++;
                        AppLogger.Log($"NcFileGenerator: SAFE_EACH - Add 성공 [{i}/{opCount}] (2-args)");
                    }
                    catch (Exception ex1)
                    {
                        // 중요: 1-arg Add 재시도는 일부 ESPRIT/Interop 조합에서 네이티브 크래시가 재현됨.
                        // 따라서 2-args 실패 시 해당 Operation은 스킵하고 다음으로 진행한다.
                        AppLogger.Log($"NcFileGenerator: SAFE_EACH - Add 실패(스킵) [{i}/{opCount}] err={ex1.GetType().Name}:{ex1.Message}");
                    }
                }

                return true;
            }
            catch (Exception ex)
            {
                AppLogger.Log($"NcFileGenerator: SAFE_EACH 실패 - {ex.GetType().Name}:{ex.Message}");
                return false;
            }
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
        private void UpdateNcHeader(string ncFilePath, string displayName, double frontPointX, double stockDiameter, double? stlBoundingTopZ = null, string hexRotationMode = null, double? hexRotationAppliedDeg = null)
        {
            try
            {
                if (!File.Exists(ncFilePath))
                {
                    AppLogger.Log($"NcFileGenerator: NC 헤더 수정 실패 - 파일 없음 ({ncFilePath})");
                    return;
                }
                var lines = new List<string>(File.ReadAllLines(ncFilePath));
                if (lines.Count == 0)
                {
                    lines.Add("%");
                }

                double backturnClearance = ResolveBackturnClearance(stockDiameter) + 2;
                string hexComment = FormatHexRotationHeaderComment(hexRotationMode, hexRotationAppliedDeg);
                var headerBlock = new List<string>
                {
                    "%",
                    "O4000",
                };
                if (!string.IsNullOrWhiteSpace(hexComment))
                {
                    headerBlock.Add(hexComment);
                }
                // CNC는 #521= 8 같은 정수 매크로를 거부할 수 있다. FormatNcNumber("0.000")로 소수점을 강제한다.
                // "0" / "0.###" 포맷으로 바꾸지 말 것.
                headerBlock.Add($"#523= {FormatNcNumber(AppConfig.DefaultStlShift, "0.000")}");
                headerBlock.Add($"#522= {FormatNcNumber(backturnClearance, "0.000")}");
                headerBlock.Add($"#521= {FormatNcNumber(stockDiameter, "0.000")}");
                headerBlock.Add($"#520= {FormatNcNumber(stlBoundingTopZ, "0.000")}");

                int firstBodyIndex = -1;
                for (int i = 0; i < lines.Count; i++)
                {
                    if (IsSkippablePostHeaderLine(lines[i]))
                    {
                        continue;
                    }
                    firstBodyIndex = i;
                    break;
                }

                var rebuilt = new List<string>(headerBlock);
                if (firstBodyIndex >= 0 && firstBodyIndex < lines.Count)
                {
                    rebuilt.AddRange(lines.Skip(firstBodyIndex));
                }

                File.WriteAllLines(ncFilePath, rebuilt.ToArray());
                AppLogger.Log($"NcFileGenerator: NC 헤더 수정 완료 - hexComment={(hexComment ?? "<null>")}, #520:{FormatNcNumber(stlBoundingTopZ)}, #521:{FormatNcNumber(stockDiameter)}, #522:{FormatNcNumber(backturnClearance)}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"NcFileGenerator: NC 헤더 수정 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        // ESPRIT 포스트(Acro_dent_XE) 헤더 잔여분:
        // ( PATH1) / #520= 0 (END POSITION) / #521= 8. (STOCK DIA)
        // 이 줄들을 본문으로 잡으면 우리가 넣은 #520/#521 뒤에 원본 매크로가 중복된다.
        private static bool IsSkippablePostHeaderLine(string line)
        {
            string trimmed = (line ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(trimmed))
            {
                return true;
            }
            if (trimmed == "%" ||
                Regex.IsMatch(trimmed, @"^O\d+\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            {
                return true;
            }
            if (trimmed.StartsWith("#520", StringComparison.OrdinalIgnoreCase) ||
                trimmed.StartsWith("#521", StringComparison.OrdinalIgnoreCase) ||
                trimmed.StartsWith("#522", StringComparison.OrdinalIgnoreCase) ||
                trimmed.StartsWith("#523", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (!trimmed.StartsWith("(", StringComparison.Ordinal) ||
                !trimmed.EndsWith(")", StringComparison.Ordinal))
            {
                return false;
            }
            if (trimmed.IndexOf("STL", StringComparison.OrdinalIgnoreCase) >= 0 ||
                trimmed.IndexOf("헥스", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }
            if (Regex.IsMatch(trimmed, @"^\(\s*PATH\s*\d+\s*\)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            {
                return true;
            }
            if (trimmed.IndexOf("END POSITION", StringComparison.OrdinalIgnoreCase) >= 0 ||
                trimmed.IndexOf("STOCK DIA", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }
            return false;
        }

        private static void StripBlankNcLines(string ncFilePath)
        {
            try
            {
                if (!File.Exists(ncFilePath))
                {
                    return;
                }
                var lines = File.ReadAllLines(ncFilePath)
                    .Where(line => !string.IsNullOrWhiteSpace(line))
                    .ToArray();
                File.WriteAllLines(ncFilePath, lines);
                AppLogger.Log($"NcFileGenerator: NC 빈 줄 제거 완료 - lines={lines.Length}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"NcFileGenerator: NC 빈 줄 제거 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static string FormatHexRotationHeaderComment(string hexRotationMode, double? hexRotationAppliedDeg)
        {
            string modeComment = FormatHexRotationModeComment(hexRotationMode);
            string appliedLabel = FormatHexRotationAppliedDegComment(hexRotationAppliedDeg);
            if (string.IsNullOrWhiteSpace(modeComment) && string.IsNullOrWhiteSpace(appliedLabel))
            {
                return null;
            }
            if (string.IsNullOrWhiteSpace(modeComment))
            {
                return appliedLabel;
            }
            if (string.IsNullOrWhiteSpace(appliedLabel))
            {
                return modeComment;
            }
            return modeComment + " " + appliedLabel;
        }

        private static string FormatHexRotationAppliedDegComment(double? hexRotationAppliedDeg)
        {
            if (!hexRotationAppliedDeg.HasValue ||
                double.IsNaN(hexRotationAppliedDeg.Value) ||
                double.IsInfinity(hexRotationAppliedDeg.Value))
            {
                return "(null)";
            }
            // 헤더 주석용 사람이 읽는 각도. NC 축 워드가 아니다.
            // 여기 포맷을 FormatRotationNumber 에 복사하지 말 것 (소수점 탈락).
            return $"({hexRotationAppliedDeg.Value.ToString("0.###############", CultureInfo.InvariantCulture)})";
        }

        private static string FormatHexRotationModeComment(string hexRotationMode)
        {
            string mode = string.IsNullOrWhiteSpace(hexRotationMode)
                ? string.Empty
                : hexRotationMode.Trim();
            if (string.IsNullOrWhiteSpace(mode))
            {
                return null;
            }
            if (string.Equals(mode, "0", StringComparison.Ordinal))
            {
                return "(STL모델대로)";
            }
            if (string.Equals(mode, "30", StringComparison.Ordinal))
            {
                return "(헥스30도회전)";
            }
            if (string.Equals(mode, "STL모델대로", StringComparison.Ordinal))
            {
                return "(STL모델대로)";
            }
            if (string.Equals(mode, "헥스30도회전", StringComparison.Ordinal))
            {
                return "(헥스30도회전)";
            }
            return $"({mode})";
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
            if (bestIndex >= clearances.Length) bestIndex = clearances.Length - 1;
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
        // NC 매크로/좌표 숫자 포맷 SSOT.
        //
        // [절대 금지] "0.###", "0.###############", "G29", G-format, 정수 ToString()
        //   → 30.0 이 "30" 으로 떨어진다. CNC는 C30 / X30 정수를 인식하지 못한다.
        // [필수] 소수점 이하를 최소 한 자리 명시. 예: 30 → "30.0", 0 → "0.0", 8.5 → "8.5"
        // 커스텀 format("0.000")이 이미 소수점을 포함해도 EnsureNcDecimalLiteral 이 안전망이다.
        // 이 기본값을 "더 짧게" 되돌리지 말 것.
        private static string FormatNcNumber(double? value, string format = "0.0##############")
        {
            if (!value.HasValue)
            {
                return "";
            }
            string text = value.Value.ToString(format, CultureInfo.InvariantCulture);
            return EnsureNcDecimalLiteral(text);
        }

        // 숫자 리터럴에 소수점이 없으면 ".0"을 붙인다.
        // "30." 처럼 점만 있고 자리수가 없으면 "30.0"으로 만든다.
        // 이미 "30.0" / "3.45" 이면 그대로 둔다.
        // TrimEnd('0') / 정수 최적화 / invariant 없는 ToString 사용 금지.
        private static string EnsureNcDecimalLiteral(string numericText)
        {
            if (string.IsNullOrWhiteSpace(numericText))
            {
                return numericText;
            }
            string text = numericText.Trim();
            if (string.Equals(text, "-0", StringComparison.Ordinal) ||
                string.Equals(text, "-0.", StringComparison.Ordinal))
            {
                return "0.0";
            }
            int dot = text.IndexOf('.');
            if (dot < 0)
            {
                // "30" → "30.0"  (정수 표기 금지)
                return text + ".0";
            }
            if (dot == text.Length - 1)
            {
                // "30." → "30.0"  (소수점만 있고 자리수 없음)
                return text + "0";
            }
            return text;
        }
        private void UpdateSerialBlocks(string ncFilePath, string serialCode, string connectionPrcPath = null, BackendApiClient.RequestMetaLotEngravingSite lotEngravingSite = null, double? hexRotationAppliedDeg = null)
        {
            // NC 파일에서 (Serial) 마커를 찾아 prc 템플릿 기반 각인 블록으로 교체
            // prc 파일에 (Serial) 블록이 2개 있으며, 각각 NC 파일의 마커에 대응
            try
            {
                if (!File.Exists(ncFilePath))
                {
                    AppLogger.Log($"NcFileGenerator: Serial 블록 수정 실패 - 파일 없음 ({ncFilePath})");
                    return;
                }
                string normalizedSerial = NormalizeSerialCode(serialCode);
                var lines = new List<string>(File.ReadAllLines(ncFilePath));
                AppLogger.Log($"NcFileGenerator: Serial 블록 교체 시작 - serialCode:'{normalizedSerial}', NC 라인 수:{lines.Count}");

                // prc 0번째 (Serial) → NC 첫 번째 (Serial) 마커 교체
                var firstBlock = BuildSerialBlock(normalizedSerial, 0, connectionPrcPath, lotEngravingSite, hexRotationAppliedDeg);
                bool serialUpdated = ReplaceSerialBlock(lines, "(Serial)", firstBlock);
                AppLogger.Log($"NcFileGenerator: 1번째 (Serial) 블록 교체 - {(serialUpdated ? "성공" : "⚠️ 마커 없음")}");

                // prc 1번째 (Serial) → NC의 (Serial Deburr) 또는 두 번째 (Serial) 마커 교체
                var secondBlock = BuildSerialBlock(normalizedSerial, 1, connectionPrcPath, lotEngravingSite, hexRotationAppliedDeg);
                bool serialDeburrUpdated = ReplaceSerialBlock(lines, "(Serial Deburr)", secondBlock);
                if (!serialDeburrUpdated)
                {
                    // (Serial Deburr) 마커가 없으면 두 번째 (Serial) 마커에 적용
                    serialDeburrUpdated = ReplaceSerialBlock(lines, "(Serial)", secondBlock, occurrenceIndex: 1);
                    AppLogger.Log($"NcFileGenerator: 2번째 (Serial) 블록 교체 - {(serialDeburrUpdated ? "성공" : "⚠️ 마커 없음")}");
                }
                else
                {
                    AppLogger.Log("NcFileGenerator: (Serial Deburr) 블록 교체 - 성공");
                }

                if (serialUpdated || serialDeburrUpdated)
                {
                    File.WriteAllLines(ncFilePath, lines);
                    AppLogger.Log($"NcFileGenerator: Serial 블록 갱신 완료 - 1st:{serialUpdated}, 2nd:{serialDeburrUpdated}");
                }
                else
                {
                    AppLogger.Log("NcFileGenerator: ❌ Serial 블록 마커 없음 - NC 파일에 (Serial) 주석 확인 필요");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"NcFileGenerator: Serial 블록 갱신 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private void ApplyManufacturerHexRotationToNc(string ncFilePath, string manufacturerHexRotation)
        {
            try
            {
                // mode SSOT만 본다. designSoftware(ExoCAD/3Shape)는 여기서 절대 참고하지 않는다.
                // - T4848 => 항상 C0.0 (모드/minorDeg와 무관)
                // - T0606(HEX) => STL모델대로 C0.0 / 헥스30·헥스X → totalDeg
                // - T0909(Serial) => 포스트 측면 사이트 C 유지 (여기서 덮지 않음)
                if (!TryResolveHexRotationTargets(manufacturerHexRotation, out double minorDeg, out double totalDeg, out string modeLabel, out bool forceZeroCAxis))
                {
                    AppLogger.Log($"NcFileGenerator: 헥스 회전 NC 후처리 생략 - mode='{manufacturerHexRotation ?? ""}'");
                    return;
                }

                if (!File.Exists(ncFilePath))
                {
                    AppLogger.Log($"NcFileGenerator: 헥스 회전 NC 후처리 실패 - 파일 없음 ({ncFilePath})");
                    return;
                }

                var lines = new List<string>(File.ReadAllLines(ncFilePath));
                // 치환 대상:
                // - 공통: C0 / C0.0 / C+0 / C-0 (PRC 원본)
                // - STL모델대로 추가: C30 / C30.0 (이전 헥스30 후처리·재제작 복사 NC 잔여분)
                //   → ExoCAD 기본 헥스30으로 만든 NC를 STL모드로 재생성/재처리할 때 C0.0으로 되돌린다.
                // 치환 결과는 반드시 C0.0 / C30.0 처럼 소수점이 있어야 한다. FormatRotationNumber 가 SSOT.
                string axisPattern = forceZeroCAxis
                    ? @"C\s*[+-]?(?:0+(?:\.0+)?|30(?:\.0+)?)(?![0-9.])"
                    : @"C\s*[+-]?0+(?:\.0+)?(?![0-9.])";
                var targetRegex = new Regex(axisPattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

                int matchedWithinTarget = 0;
                int replacedWithinTarget = 0;
                for (int i = 0; i < lines.Count; i++)
                {
                    int currentLineIndex = i;
                    lines[i] = targetRegex.Replace(lines[i], m =>
                    {
                        if (matchedWithinTarget >= 6)
                        {
                            return m.Value;
                        }

                        int ordinal = matchedWithinTarget + 1;
                        string toolCode = FindNearestToolCodeNearLine(lines, currentLineIndex, 10);
                        if (string.IsNullOrWhiteSpace(toolCode))
                        {
                            throw new InvalidOperationException($"헥스 회전 NC 후처리 실패: C축 후보 #{ordinal} (line {currentLineIndex + 1}) 상방 10줄 내 공구번호(Txxxx)를 찾지 못했습니다.");
                        }

                        double targetDeg;
                        if (string.Equals(toolCode, "T4848", StringComparison.OrdinalIgnoreCase))
                        {
                            // SSOT: T4848 C축은 모드와 무관하게 항상 C0.0
                            targetDeg = 0.0;
                        }
                        else if (string.Equals(toolCode, "T0909", StringComparison.OrdinalIgnoreCase))
                        {
                            // 포스트 측면 Serial: UpdateSerialBlocks가 넣은 사이트 C 유지
                            matchedWithinTarget++;
                            return m.Value;
                        }
                        else if (string.Equals(toolCode, "T0606", StringComparison.OrdinalIgnoreCase))
                        {
                            targetDeg = totalDeg;
                        }
                        else
                        {
                            throw new InvalidOperationException($"헥스 회전 NC 후처리 실패: C축 후보 #{ordinal} (line {currentLineIndex + 1}) 근접 공구번호 '{toolCode}'는 지원하지 않습니다. 허용 공구: T4848, T0909, T0606");
                        }

                        matchedWithinTarget++;
                        replacedWithinTarget++;
                        // C30 정수 금지. FormatRotationNumber 는 반드시 "30.0" / "0.0" 을 반환한다.
                        // "C" + 30 또는 ToString() 직접 연결 금지.
                        return "C" + FormatRotationNumber(targetDeg);
                    });
                }

                if (replacedWithinTarget == 0)
                {
                    AppLogger.Log($"NcFileGenerator: 헥스 회전 NC 후처리 대상 없음 - mode={modeLabel}, forceZero={forceZeroCAxis}");
                    return;
                }

                File.WriteAllLines(ncFilePath, lines);
                AppLogger.Log($"NcFileGenerator: 헥스 회전 NC 후처리 완료 - mode={modeLabel}, T4848=C0.0(always), T0606=C{FormatRotationNumber(totalDeg)}, T0909=post-site(skip), minorDeg={FormatRotationNumber(minorDeg)}, replaced={replacedWithinTarget}");

                if (matchedWithinTarget < 6)
                {
                    AppLogger.Log($"NcFileGenerator: ⚠️ 헥스 회전 NC 후처리 - C축 매칭 수 부족 (expected=6, actual={matchedWithinTarget})");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"NcFileGenerator: 헥스 회전 NC 후처리 실패 - {ex.GetType().Name}:{ex.Message}");
                throw;
            }
        }

        private static string FindNearestToolCodeNearLine(List<string> lines, int lineIndex, int maxLookbackLines)
        {
            if (lines == null || lines.Count == 0 || lineIndex < 0)
            {
                return null;
            }

            int start = Math.Max(0, lineIndex - Math.Max(0, maxLookbackLines));
            var toolRegex = new Regex(@"\bT\s*(\d{2,6})\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

            for (int i = lineIndex; i >= start; i--)
            {
                string line = lines[i] ?? string.Empty;
                Match match = toolRegex.Match(line);
                if (!match.Success)
                {
                    continue;
                }

                string digits = match.Groups[1].Value;
                if (string.IsNullOrWhiteSpace(digits))
                {
                    continue;
                }

                string normalizedDigits = digits.Length >= 4
                    ? digits.Substring(digits.Length - 4)
                    : digits.PadLeft(4, '0');
                return "T" + normalizedDigits;
            }

            return null;
        }

        // 헥스 모드 라벨을 NC 치환각으로 해석한다.
        // - totalDeg: T0909/T0606에만 적용 (= 30 + minorDeg). T4848은 항상 C0.0.
        // - minorDeg: 라벨/로그용 (totalDeg - 30). NC의 T4848에는 넣지 않는다.
        // - forceZeroCAxis: STL모델대로일 때 true (C0/C30 잔여분을 C0.0으로 강제)
        // 전달 SSOT:
        // - "헥스X도회전"의 X는 totalDeg 기준 (예: minor 10도 선택 시 라벨은 "헥스40도회전")
        // - designSoftware(ExoCAD 등)는 입력이 아니다. manufacturerHexRotation mode만 해석한다.
        // 하위호환:
        // - legacy minor 라벨(예: 헥스10도회전)도 허용하며 X<30이면 total=30+X로 보정
        private static bool TryResolveHexRotationTargets(
            string manufacturerHexRotation,
            out double minorDeg,
            out double totalDeg,
            out string modeLabel,
            out bool forceZeroCAxis)
        {
            minorDeg = 0.0;
            totalDeg = 0.0;
            modeLabel = "STL모델대로";
            forceZeroCAxis = false;

            string mode = string.IsNullOrWhiteSpace(manufacturerHexRotation)
                ? string.Empty
                : manufacturerHexRotation.Trim();

            if (string.IsNullOrWhiteSpace(mode) ||
                string.Equals(mode, "STL모델대로", StringComparison.Ordinal) ||
                string.Equals(mode, "0", StringComparison.Ordinal))
            {
                // STL모델대로: C축 추가 회전 없음. total=0, C0·C30 잔여분은 C0.0으로 강제.
                // T4848도 항상 C0.0.
                minorDeg = 0.0;
                totalDeg = 0.0;
                modeLabel = "STL모델대로";
                forceZeroCAxis = true;
                return true;
            }

            if (string.Equals(mode, "헥스30도회전", StringComparison.Ordinal) ||
                string.Equals(mode, "30", StringComparison.Ordinal))
            {
                // 고정 모드: T4848=C0.0, T0909/T0606=C30.0
                minorDeg = 0.0;
                totalDeg = 30.0;
                modeLabel = "헥스30도회전";
                forceZeroCAxis = false;
                return true;
            }

            Match xModeMatch = Regex.Match(mode, @"^\s*헥스\s*([+-]?\d+(?:\.\d+)?)\s*도회전\s*$", RegexOptions.CultureInvariant);
            if (xModeMatch.Success)
            {
                if (!double.TryParse(xModeMatch.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out double xDeg))
                {
                    return false;
                }

                // 확장 모드 SSOT:
                // - 백엔드 전달값 X는 totalDeg(=30+minorDeg) 기준이다.
                //   예) 프론트 minor=10 선택 시 backend label='헥스40도회전'
                // - 공구별 적용값:
                //   T4848  => 항상 C0.0 (minorDeg를 NC에 쓰지 않음)
                //   T0909/T0606 => totalDeg 그대로
                // 하위호환: legacy 데이터가 '헥스10도회전'(minor)일 수 있으므로 X<30이면
                //          minor로 간주해 total=30+X로 보정한다.
                double parsedX = xDeg;
                if (parsedX < 30.0)
                {
                    minorDeg = parsedX;
                    totalDeg = 30.0 + parsedX;
                }
                else
                {
                    totalDeg = parsedX;
                    minorDeg = parsedX - 30.0;
                }

                // 모드 라벨(로그/주석). NC 워드가 아니므로 정수 "30" 이어도 된다.
                // 이 포맷을 C축 출력에 재사용 금지.
                modeLabel = $"헥스{totalDeg.ToString("0.###############", CultureInfo.InvariantCulture)}도회전";
                forceZeroCAxis = false;
                return true;
            }

            return false;
        }

        // C축(및 동일 경로로 쓰는 회전각) NC 리터럴 포맷.
        //
        // CNC 장비는 정수 워드를 인식하지 못한다.
        //   금지: C30, C0, C10
        //   필수: C30.0, C0.0, C10.0, C10.5
        //
        // 과거 버그: ToString("0.###############") / 0도일 때 "0" 반환
        //   → 30.0 이 "30" 이 되어 NC에 C30 이 기록됨.
        // "불필요한 .0 제거", "정수면 짧게", G29/0.### 포맷은 재발하므로 사용 금지.
        // 0도도 "0"이 아니라 "0.0" 이어야 한다. 절대 특수케이스로 정수를 반환하지 말 것.
        private static string FormatRotationNumber(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value))
            {
                return "0.0";
            }
            if (Math.Abs(value) < 0.0000000001)
            {
                return "0.0";
            }
            // "0.0##############" = 소수점 이하 최소 1자리 강제. "0.###" 로 바꾸지 말 것.
            string text = value.ToString("0.0##############", CultureInfo.InvariantCulture);
            return EnsureNcDecimalLiteral(text);
        }

        // ESPRIT 포스트/시리얼 템플릿/헥스 치환이 남긴 축 워드 정수를 파일 전체에서 C30.0 형태로 고친다.
        // GenerateNcFile 마지막 단계에서만 호출. 중간 단계에서 건너뛰면 포스트 원본 C30 이 남는다.
        private static void EnsureNcCoordinateDecimalsOnFile(string ncFilePath)
        {
            try
            {
                if (!File.Exists(ncFilePath))
                {
                    AppLogger.Log($"NcFileGenerator: NC 축 워드 소수점 강제 실패 - 파일 없음 ({ncFilePath})");
                    return;
                }

                var lines = File.ReadAllLines(ncFilePath);
                int rewrittenLines = 0;
                int rewrittenWords = 0;
                for (int i = 0; i < lines.Length; i++)
                {
                    string original = lines[i];
                    string rewritten = EnsureNcCoordinateDecimalsInLine(original, out int wordCount);
                    if (wordCount > 0)
                    {
                        lines[i] = rewritten;
                        rewrittenLines++;
                        rewrittenWords += wordCount;
                    }
                }

                if (rewrittenLines > 0)
                {
                    File.WriteAllLines(ncFilePath, lines);
                }
                AppLogger.Log($"NcFileGenerator: NC 축 워드 소수점 강제 완료 - rewrittenLines={rewrittenLines}, rewrittenWords={rewrittenWords}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"NcFileGenerator: NC 축 워드 소수점 강제 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        // 축 워드(X/Y/Z/A/B/C/U/V/W/H/I/J/K/R)의 정수 리터럴만 대상.
        // G/M/T/O/P/N/S/F/L 은 원래 정수 코드이므로 건드리지 않는다 (G0, M50, T0909, F1000).
        // 괄호 주석 안은 변경하지 않는다. 매크로식 X[#521+1.8] 은 숫자가 바로 안 붙으므로 제외.
        private static string EnsureNcCoordinateDecimalsInLine(string line, out int rewrittenWordCount)
        {
            rewrittenWordCount = 0;
            if (string.IsNullOrEmpty(line))
            {
                return line;
            }

            int commentIdx = line.IndexOf('(');
            string code = commentIdx >= 0 ? line.Substring(0, commentIdx) : line;
            string comment = commentIdx >= 0 ? line.Substring(commentIdx) : string.Empty;

            int localCount = 0;
            // 1) C30 / X10 / Z0 / G0X30  → C30.0 / X10.0 / Z0.0
            string rewritten = NcAxisIntegerWordRegex.Replace(code, m =>
            {
                localCount++;
                return m.Groups[1].Value + m.Groups[2].Value + m.Groups[3].Value + ".0";
            });
            // 2) C30. / X10. 처럼 점만 있는 표기 → C30.0 / X10.0
            rewritten = NcAxisTrailingDotWordRegex.Replace(rewritten, m =>
            {
                localCount++;
                return m.Groups[1].Value + m.Groups[2].Value + m.Groups[3].Value + ".0";
            });

            rewrittenWordCount = localCount;
            return rewritten + comment;
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
        private static List<string> BuildSerialBlock(string serialCode, int occurrenceInPrc, string connectionPrcPath = null, BackendApiClient.RequestMetaLotEngravingSite lotEngravingSite = null, double? hexRotationAppliedDeg = null)
        {
            // prc 파일의 occurrenceInPrc번째 (Serial) 블록을 템플릿으로 읽어
            // M98P0001~M98P0003 구간만 실제 각인 코드로 교체하고 나머지는 prc 그대로 사용
            // 포스트 측면: Z=FL+1, Y0, C=사이트방위, 글자 사이 G0 H(C증분)
            var templateLines = ReadSerialTemplateFromPrc(occurrenceInPrc, connectionPrcPath);
            if (templateLines == null || templateLines.Count == 0)
            {
                AppLogger.Log($"NcFileGenerator: ❌ prc 템플릿 로드 실패 (occurrence:{occurrenceInPrc}) - Serial 블록 생성 불가");
                return new List<string> { "(Serial)", "// ERROR: prc template not found" };
            }

            ResolvePostLotEngravingNcParams(
                lotEngravingSite,
                hexRotationAppliedDeg,
                out double zOffset,
                out double cAxisDeg,
                out double pitchCDeg,
                out double cutDiameterX,
                out double approachDiameterX);

            // 프리뷰와 동일: 3글자 블록 중앙 = 사이트 방위.
            // 첫 글자 C = C_site + ((n-1)/2)*pitch, 이후 H=-pitch
            int serialLen = Math.Max(1, (serialCode ?? string.Empty).Length);
            double firstCharCDeg = NormalizeAngleDeg(cAxisDeg + ((serialLen - 1) / 2.0) * pitchCDeg);

            string interCharMove = $"G0 Y0.0 H{FormatNcNumber(-pitchCDeg, "0.000")}";
            AppLogger.Log($"NcFileGenerator: 포스트 측면 각인 Z={FormatNcNumber(zOffset)}, C0={FormatNcNumber(firstCharCDeg)} (siteC={FormatNcNumber(cAxisDeg)}), H={FormatNcNumber(-pitchCDeg)}, X={FormatNcNumber(cutDiameterX)}, serial='{serialCode}', occurrence={occurrenceInPrc}");

            var result = new List<string>();
            bool inMacroSection = false;

            foreach (var line in templateLines)
            {
                string trimmed = line.Trim();

                // [매크로 섹션 시작] 첫 M98Pxxxx 라인 감지
                if (!inMacroSection && trimmed.StartsWith("M98P", StringComparison.OrdinalIgnoreCase))
                {
                    inMacroSection = true;
                    result.AddRange(BuildSerialMacroLines(serialCode, interCharMove));
                    continue;
                }

                if (inMacroSection && string.IsNullOrWhiteSpace(trimmed))
                {
                    inMacroSection = false;
                    result.Add(line);
                    continue;
                }

                if (inMacroSection)
                {
                    continue;
                }

                string rewritten = RewriteSerialMotionLineForPostSide(
                    line,
                    zOffset,
                    firstCharCDeg,
                    cutDiameterX,
                    approachDiameterX);
                result.Add(rewritten);
            }

            AppLogger.Log($"NcFileGenerator: Serial 블록 빌드 완료 (occurrence:{occurrenceInPrc}) - {result.Count} lines");
            return result;
        }

        /// <summary>
        /// STL 방위 → CNC C. C = 90 + W − θ (W=30−appliedDeg).
        /// </summary>
        private static void ResolvePostLotEngravingNcParams(
            BackendApiClient.RequestMetaLotEngravingSite site,
            double? hexAppliedDeg,
            out double zOffset,
            out double cAxisDeg,
            out double pitchCDeg,
            out double cutDiameterX,
            out double approachDiameterX)
        {
            const double wBase = 30.0;
            const double aboveFl = 1.0;
            const double pitchArcMm = 0.35;
            const double depthMm = 0.12;
            const double defaultRadius = 2.0;

            double applied = hexAppliedDeg.HasValue && !double.IsNaN(hexAppliedDeg.Value) && !double.IsInfinity(hexAppliedDeg.Value)
                ? hexAppliedDeg.Value
                : 0.0;
            double wAxis = wBase + (-applied);

            if (site != null &&
                !double.IsNaN(site.engraveZ) && !double.IsInfinity(site.engraveZ) &&
                !double.IsNaN(site.angleDeg) && !double.IsInfinity(site.angleDeg))
            {
                zOffset = site.engraveZ;
                double radius = site.radius > 0.4 ? site.radius : defaultRadius;
                pitchCDeg = site.charPitchCDeg > 1e-6
                    ? site.charPitchCDeg
                    : (pitchArcMm / radius) * (180.0 / Math.PI);
                cutDiameterX = site.cutDiameterX > 1.0
                    ? site.cutDiameterX
                    : Math.Max(2.0 * (radius - depthMm), 1.0);
                cAxisDeg = NormalizeAngleDeg(90.0 + wAxis - site.angleDeg);
                approachDiameterX = cutDiameterX + 1.2;
                return;
            }

            // 사이트 없으면 FL+1 추정 불가 → 안전 폴백 (기존 연결부 근방)
            zOffset = aboveFl + 3.0;
            pitchCDeg = (pitchArcMm / defaultRadius) * (180.0 / Math.PI);
            cutDiameterX = Math.Max(2.0 * (defaultRadius - depthMm), 1.0);
            cAxisDeg = NormalizeAngleDeg(90.0 + wAxis);
            approachDiameterX = cutDiameterX + 1.2;
            AppLogger.Log("NcFileGenerator: ⚠️ lotEngravingSite 없음 — Serial 폴백 좌표 사용");
        }

        private static double NormalizeAngleDeg(double deg)
        {
            double a = deg % 360.0;
            if (a < 0) a += 360.0;
            return a;
        }

        private static string RewriteSerialMotionLineForPostSide(
            string line,
            double zOffset,
            double cAxisDeg,
            double cutDiameterX,
            double approachDiameterX)
        {
            if (string.IsNullOrWhiteSpace(line)) return line;
            string trimmed = line.Trim();

            // 시작 접근: G98 G0 X[#521+…] Z[#520+#523+z] Y0 C…
            if (Regex.IsMatch(trimmed, @"G98\s*G0", RegexOptions.IgnoreCase) ||
                (Regex.IsMatch(trimmed, @"^G0\b", RegexOptions.IgnoreCase) &&
                 Regex.IsMatch(trimmed, @"Z\s*\[", RegexOptions.IgnoreCase) &&
                 Regex.IsMatch(trimmed, @"[#]521", RegexOptions.IgnoreCase)))
            {
                return $"G98 G0 X[#521+1.8] Z[#520+#523+{FormatNcNumber(zOffset, "0.000")}] Y0.0 C{FormatNcNumber(cAxisDeg, "0.000")}";
            }

            // 접근 plunge G1 X4.0 F2000 → 사이트보다 조금 바깥
            if (Regex.IsMatch(trimmed, @"G1\s*X\s*[+-]?\d+(?:\.\d+)?\s*F\s*2000", RegexOptions.IgnoreCase))
            {
                return $"G1 X{FormatNcNumber(approachDiameterX, "0.000")} F2000";
            }

            // 절삭 깊이 G1 X3.43 F500
            if (Regex.IsMatch(trimmed, @"G1\s*X\s*[+-]?\d+(?:\.\d+)?\s*F\s*500", RegexOptions.IgnoreCase))
            {
                return $"G1 X{FormatNcNumber(cutDiameterX, "0.000")} F500";
            }

            return line;
        }

        private static string ExtractInterCharMove(List<string> templateLines)
        {
            // prc 템플릿에서 첫 M98P 다음에 오는 이동 명령 추출
            // prc 구조: :M98P0001 / :G1V-0.35F1000 / :M98P0002 / ...
            // → 첫 M98P 직후의 비어있지 않은 줄이 이동 명령
            bool pastFirstMacro = false;
            foreach (var line in templateLines)
            {
                string trimmed = line.Trim();
                if (trimmed.StartsWith("M98P", StringComparison.OrdinalIgnoreCase))
                {
                    pastFirstMacro = true;
                    continue;
                }
                if (pastFirstMacro && !string.IsNullOrWhiteSpace(trimmed) &&
                    !trimmed.StartsWith("M98P", StringComparison.OrdinalIgnoreCase))
                {
                    return trimmed;
                }
            }
            AppLogger.Log("NcFileGenerator: ⚠️ prc에서 이동 명령 추출 실패 - 기본값 G1V-0.35F1000 사용");
            return "G1V-0.35F1000";
        }

        private static List<string> ReadSerialTemplateFromPrc(int occurrenceIndex = 0, string preferredPrcPath = null)
        {
            try
            {
                // prc 파일 경로 찾기 (AcroDent/2_Connection 폴더)
                string prcDir = Path.Combine(AppConfig.AddInRootDirectory, "AcroDent", "2_Connection");

                if (!Directory.Exists(prcDir))
                {
                    AppLogger.Log($"NcFileGenerator: prc 디렉토리 없음 - {prcDir}");
                    return null;
                }

                string prcPath = null;

                if (!string.IsNullOrWhiteSpace(preferredPrcPath) && File.Exists(preferredPrcPath))
                {
                    prcPath = preferredPrcPath;
                    AppLogger.Log($"NcFileGenerator: Serial 템플릿 PRC 우선 경로 사용 - {prcPath}");
                }
                else
                {
                    var prcFiles = Directory.GetFiles(prcDir, "*.prc").OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase).ToArray();
                    if (prcFiles.Length == 0)
                    {
                        AppLogger.Log($"NcFileGenerator: prc 파일 없음 - {prcDir}");
                        return null;
                    }

                    prcPath = prcFiles[0];
                    if (!string.IsNullOrWhiteSpace(preferredPrcPath))
                    {
                        AppLogger.Log($"NcFileGenerator: Serial 템플릿 PRC 우선 경로 무시(파일 없음) - preferred={preferredPrcPath}, fallback={prcPath}");
                    }
                    else
                    {
                        AppLogger.Log($"NcFileGenerator: Serial 템플릿 PRC 기본 선택 - {prcPath}");
                    }
                }
                var allLines = File.ReadAllLines(prcPath);

                // (Serial) 블록 찾기 (occurrenceIndex번째)
                int currentOccurrence = -1;
                int startIdx = -1;
                int endIdx = -1;

                for (int i = 0; i < allLines.Length; i++)
                {
                    string trimmed = allLines[i].Trim();

                    if (trimmed.Equals(":(Serial)", StringComparison.OrdinalIgnoreCase))
                    {
                        currentOccurrence++;
                        if (currentOccurrence == occurrenceIndex)
                        {
                            startIdx = i;
                        }
                    }
                    else if (startIdx >= 0 && (
                             // 다음 NC 블록 시작 (예: :(HEX2.485 Deburr2), :(Finish Connection))
                             (trimmed.StartsWith(":(" , StringComparison.Ordinal) &&
                              !trimmed.Equals(":(Serial)", StringComparison.OrdinalIgnoreCase)) ||
                             // prc 파일 END_STRING 태그 (마지막 블록 경계)
                             trimmed.Equals("END_STRING", StringComparison.OrdinalIgnoreCase)))
                    {
                        endIdx = i;
                        AppLogger.Log($"NcFileGenerator: (Serial) 블록 끝 감지 - line {i}: '{trimmed}'");
                        break;
                    }
                }

                if (startIdx < 0)
                {
                    AppLogger.Log($"NcFileGenerator: (Serial) 블록 없음 (occurrence:{occurrenceIndex}) - {prcPath}");
                    return null;
                }

                if (endIdx < 0)
                {
                    endIdx = allLines.Length;
                }

                // : 접두사 제거하고 반환
                var block = new List<string>();
                for (int i = startIdx; i < endIdx; i++)
                {
                    string line = allLines[i];
                    if (line.TrimStart().StartsWith(":"))
                    {
                        block.Add(line.TrimStart().Substring(1));
                    }
                    else
                    {
                        block.Add(line);
                    }
                }

                AppLogger.Log($"NcFileGenerator: prc 템플릿 로드 성공 (occurrence:{occurrenceIndex}) - {prcPath}, lines {startIdx}~{endIdx}, 추출:{block.Count} lines");
                return block;
            }
            catch (Exception ex)
            {
                AppLogger.Log($"NcFileGenerator: prc 템플릿 로드 실패 - {ex.GetType().Name}:{ex.Message}");
                return null;
            }
        }

        // private static List<string> BuildSerialBlockFallback(string serialCode)
        // {
        //     // prc 로드 실패 시 폴백 (기존 하드코딩 방식)
        //     var block = new List<string>
        //     {
        //         "(Serial)",
        //         "T0909 (CENTER MILL/D2.0*A90)",
        //         "M50",
        //         "G28H0.0",  // G28H0 정수 금지. CNC는 소수점이 필요함
        //         "M23S2000",
        //         "G98G0X[#521+1.8]Z[#520+#523+1.775]Y0.525C0.0",  // C0 금지. 반드시 C0.0
        //         "G1X4.0F2000",
        //         "G1X3.45F500",
        //         string.Empty
        //     };
        //     block.AddRange(BuildSerialMacroLines(serialCode));
        //     block.Add(string.Empty);
        //     block.AddRange(new[]
        //     {
        //         "G0 X30.0",  // X30 금지. 반드시 X30.0
        //         "G0 Z-17.5",
        //         "G0 T0",
        //         "M51",
        //         "M25",
        //         "M1",
        //         string.Empty
        //     });
        //     return block;
        // }
        private static IEnumerable<string> BuildSerialMacroLines(string serialCode, string interCharMove)
        {
            // 3글자 각인 코드를 M98Pxxxx 매크로 호출로 변환
            // 문자 사이에는 prc에서 추출한 이동 명령 삽입 (마지막 문자 제외)
            // A=M98P0001, B=M98P0002, ..., Z=M98P0026
            for (int i = 0; i < serialCode.Length; i++)
            {
                string macroCall = BuildMacroCall(serialCode[i]);
                AppLogger.Log($"NcFileGenerator: [{i + 1}/{serialCode.Length}] '{serialCode[i]}' → {macroCall}");
                yield return macroCall;
                if (i < serialCode.Length - 1)
                {
                    yield return interCharMove;
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
        private static string NormalizeSerialCode(string raw)
        {
            const string fallback = "ABC";
            if (string.IsNullOrWhiteSpace(raw))
            {
                AppLogger.Log("NcFileGenerator: serialCode 누락 - 기본값 사용");
                return fallback;
            }
            string upper = raw.Trim().ToUpperInvariant();
            var letters = new string(upper.Where(c => c >= 'A' && c <= 'Z').ToArray());
            if (letters.Length < 3)
            {
                AppLogger.Log($"NcFileGenerator: serialCode 형식 오류 - '{raw}' (정규화:'{letters}')");
                return fallback;
            }
            if (letters.Length > 3)
            {
                letters = letters.Substring(0, 3);
            }
            return letters;
        }
    }
}
