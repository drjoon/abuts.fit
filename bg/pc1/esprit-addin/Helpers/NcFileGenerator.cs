using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Esprit;
using EspritConstants;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;
namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers
{
    /// <summary>
    /// NC 파일 생성 및 후처리 관련 로직
    /// </summary>
    public class NcFileGenerator
    {
        private readonly Application _espApp;
        private readonly string _outputFolder;
        private readonly string _postProcessorFile;
        public NcFileGenerator(Application espApp, string outputFolder, string postProcessorFile)
        {
            _espApp = espApp ?? throw new ArgumentNullException(nameof(espApp));
            _outputFolder = outputFolder ?? AppConfig.StorageNcDirectory;
            _postProcessorFile = postProcessorFile ?? "Acro_dent_XE.asc";
        }
        public string GenerateNcFile(Document document, string stlPath, double frontPointX, double stockDiameter, string serialCode)
        {
            string postDir = _espApp.Configuration.GetFileDirectory(espFileType.espFileTypePostProcessor);
            string postFilePath = Path.Combine(postDir, _postProcessorFile);
            string ncFileName = BuildNcFilePath(stlPath);
            document.NCCode.AddAll();
            document.NCCode.Execute(postFilePath, ncFileName);
            AppLogger.Log($"NcFileGenerator: NC 저장 완료 - {ncFileName}");
            UpdateNcHeader(ncFileName, Path.GetFileName(ncFileName), frontPointX, stockDiameter);
            
            string serialForNc = NormalizeSerialCode(serialCode);
            AppLogger.Log($"NcFileGenerator: Serial 각인 코드 적용 - Raw:'{serialCode ?? string.Empty}' => Use:'{serialForNc}'");
            UpdateSerialBlocks(ncFileName, serialForNc);
            return ncFileName;
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
                return Path.Combine(requestFolder, "program.nc");
            }
            
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
        private void UpdateNcHeader(string ncFilePath, string displayName, double frontPointX, double stockDiameter)
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
                if (lines.Count == 1)
                {
                    lines.Add(string.Empty);
                }
                lines[0] = string.IsNullOrWhiteSpace(lines[0]) ? "%" : lines[0];
                string truncatedDisplayName = ExtractDisplayName(displayName);
                lines[1] = $"({truncatedDisplayName})";
                double backturnClearance = ResolveBackturnClearance(stockDiameter) + 2;
                ApplyOrInsertNcLine(lines, $"#520= {FormatNcNumber(frontPointX, "0.000")}", "#520");
                ApplyOrInsertNcLine(lines, $"#521= {FormatNcNumber(stockDiameter, "0.000")}", "#521");
                ApplyOrInsertNcLine(lines, $"#522= {FormatNcNumber(backturnClearance, "0.000")}", "#522");
                ApplyOrInsertNcLine(lines, $"#523= {FormatNcNumber(AppConfig.DefaultStlShift, "0.000")}", "#523");
                File.WriteAllLines(ncFilePath, lines.ToArray());
                AppLogger.Log($"NcFileGenerator: NC 헤더 수정 완료 - #520:{FormatNcNumber(frontPointX)} (Math.Abs(FrontPointX)), #521:{FormatNcNumber(stockDiameter)}, #522:{FormatNcNumber(backturnClearance)}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"NcFileGenerator: NC 헤더 수정 실패 - {ex.GetType().Name}:{ex.Message}");
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
        private static string FormatNcNumber(double? value, string format = "0.###############")
        {
            if (!value.HasValue)
            {
                return "";
            }
            return value.Value.ToString(format, CultureInfo.InvariantCulture);
        }
        private void UpdateSerialBlocks(string ncFilePath, string serialCode)
        {
            try
            {
                if (!File.Exists(ncFilePath))
                {
                    AppLogger.Log($"NcFileGenerator: Serial 블록 수정 실패 - 파일 없음 ({ncFilePath})");
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
                    AppLogger.Log($"NcFileGenerator: Serial 블록 갱신 - Serial:{serialUpdated}, Deburr:{serialDeburrUpdated}");
                }
                else
                {
                    AppLogger.Log("NcFileGenerator: Serial 블록을 찾지 못해 갱신하지 못했습니다.");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"NcFileGenerator: Serial 블록 갱신 실패 - {ex.GetType().Name}:{ex.Message}");
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
            // prc 파일을 템플릿으로 사용하여 각인 문자 부분만 교체
            var templateLines = ReadSerialTemplateFromPrc();
            if (templateLines == null || templateLines.Count == 0)
            {
                AppLogger.Log("NcFileGenerator: ❌ prc 템플릿 로드 실패 - Serial 블록 생성 불가");
                return new List<string> { "(Serial)", "// ERROR: prc template not found" };
            }
            
            var result = new List<string>();
            bool inMacroSection = false;
            
            foreach (var line in templateLines)
            {
                string trimmed = line.Trim();
                
                // 매크로 섹션 시작 감지 (첫 M98P)
                if (!inMacroSection && trimmed.StartsWith("M98P", StringComparison.OrdinalIgnoreCase))
                {
                    inMacroSection = true;
                    // 실제 각인 문자로 교체된 매크로 라인 삽입
                    result.AddRange(BuildSerialMacroLines(serialCode));
                    continue;
                }
                
                // 매크로 섹션 종료 감지 (빈 줄 또는 G0로 시작)
                if (inMacroSection && (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("G0", StringComparison.OrdinalIgnoreCase)))
                {
                    inMacroSection = false;
                    result.Add(line);
                    continue;
                }
                
                // 매크로 섹션 내부는 스킵 (이미 BuildSerialMacroLines로 교체함)
                if (inMacroSection)
                {
                    continue;
                }
                
                // 나머지는 그대로 추가
                result.Add(line);
            }
            
            return result;
        }
        
        private static List<string> ReadSerialTemplateFromPrc()
        {
            try
            {
                // prc 파일 경로 찾기 (AcroDent/2_Connection 폴더)
                string addinDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
                string prcDir = Path.Combine(addinDir, "AcroDent", "2_Connection");
                
                if (!Directory.Exists(prcDir))
                {
                    AppLogger.Log($"NcFileGenerator: prc 디렉토리 없음 - {prcDir}");
                    return null;
                }
                
                // 첫 번째 prc 파일 사용 (모든 prc 파일의 Serial 블록 구조는 동일)
                var prcFiles = Directory.GetFiles(prcDir, "*.prc");
                if (prcFiles.Length == 0)
                {
                    AppLogger.Log($"NcFileGenerator: prc 파일 없음 - {prcDir}");
                    return null;
                }
                
                string prcPath = prcFiles[0];
                var allLines = File.ReadAllLines(prcPath);
                
                // (Serial) 블록 찾기
                int startIdx = -1;
                int endIdx = -1;
                
                for (int i = 0; i < allLines.Length; i++)
                {
                    string trimmed = allLines[i].Trim();
                    
                    if (trimmed.Equals(":(Serial)", StringComparison.OrdinalIgnoreCase))
                    {
                        startIdx = i;
                    }
                    else if (startIdx >= 0 && trimmed.StartsWith(":", StringComparison.Ordinal) && 
                             !trimmed.Equals(":(Serial)", StringComparison.OrdinalIgnoreCase) &&
                             trimmed.Length > 1 && trimmed[1] != ' ')
                    {
                        // 다음 블록 시작 (예: :(HEX2.485 Deburr2))
                        endIdx = i;
                        break;
                    }
                }
                
                if (startIdx < 0)
                {
                    AppLogger.Log($"NcFileGenerator: (Serial) 블록 없음 - {prcPath}");
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
                
                AppLogger.Log($"NcFileGenerator: prc 템플릿 로드 성공 - {prcPath} ({block.Count} lines)");
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
        //         "G28H0",
        //         "M23S2000",
        //         "G98G0X[#521+1.8]Z[#520+#523+1.775]Y0.525C0.0",
        //         "G1X4.0F2000",
        //         "G1X3.45F500",
        //         string.Empty
        //     };
        //     block.AddRange(BuildSerialMacroLines(serialCode));
        //     block.Add(string.Empty);
        //     block.AddRange(new[]
        //     {
        //         "G0 X30.0",
        //         "G0 Z-17.5",
        //         "G0 T0",
        //         "M51",
        //         "M25",
        //         "M1",
        //         string.Empty
        //     });
        //     return block;
        // }
        private static IEnumerable<string> BuildSerialMacroLines(string serialCode)
        {
            for (int i = 0; i < serialCode.Length; i++)
            {
                yield return BuildMacroCall(serialCode[i]);
                if (i < serialCode.Length - 1)
                {
                    yield return "G1V-0.35F1000";
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
