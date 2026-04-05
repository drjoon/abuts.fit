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
        public string GenerateNcFile(Document document, string stlPath, double backPointX, double stockDiameter, string serialCode)
        {
            string postDir = _espApp.Configuration.GetFileDirectory(espFileType.espFileTypePostProcessor);
            string postFilePath = Path.Combine(postDir, _postProcessorFile);
            string ncFileName = BuildNcFilePath(stlPath);
            document.NCCode.AddAll();
            document.NCCode.Execute(postFilePath, ncFileName);
            AppLogger.Log($"NcFileGenerator: NC 저장 완료 - {ncFileName}");
            UpdateNcHeader(ncFileName, Path.GetFileName(ncFileName), backPointX, stockDiameter);
            
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
        private void UpdateNcHeader(string ncFilePath, string displayName, double backPointX, double stockDiameter)
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
                double backPointForNc = backPointX - AppConfig.DefaultStlShift;
                double backturnClearance = ResolveBackturnClearance(stockDiameter) + 2;
                ApplyOrInsertNcLine(lines, $"#520= {FormatNcNumber(backPointForNc, "0.000")}", "#520");
                ApplyOrInsertNcLine(lines, $"#521= {FormatNcNumber(stockDiameter, "0.000")}", "#521");
                ApplyOrInsertNcLine(lines, $"#522= {FormatNcNumber(backturnClearance, "0.000")}", "#522");
                ApplyOrInsertNcLine(lines, $"#523= {FormatNcNumber(AppConfig.DefaultStlShift, "0.000")}", "#523");
                File.WriteAllLines(ncFilePath, lines.ToArray());
                AppLogger.Log($"NcFileGenerator: NC 헤더 수정 완료 - #520:{FormatNcNumber(backPointForNc)}, #521:{FormatNcNumber(stockDiameter)}, #522:{FormatNcNumber(backturnClearance)}");
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
            // NC Z축 = Esprit X축이므로 shift 적용 필요
            double zOffset = 1.8 + AppConfig.DefaultStlShift;
            AppLogger.Log($"NcFileGenerator: BuildSerialBlock - Z offset:{zOffset:F3} (shift 적용)");
            var block = new List<string>
            {
                "(Serial)",
                "T0909 (CENTER MILL/D2.0*A90)",
                "M50",
                "G28H0.0",
                "M23 S2000",
                $"G98 G0 X[#521+1.8]Z[#520+{zOffset.ToString("F3", CultureInfo.InvariantCulture)}]Y0.525C0.0",
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
