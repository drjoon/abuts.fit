// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - web/backend/controllers/requests/common.review.controller.js
using System;
using System.IO;
using System.Text;
using System.Linq;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers;
namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.DentalAddin
{
    /// <summary>
    /// DentalAddin PRC 파일 경로 관리 및 설정
    /// </summary>
    public class DentalAddinPrcManager
    {
        public string FaceHoleProcessFilePath { get; set; }
        public string ConnectionMachiningProcessFilePath { get; set; }
        public bool ApplyBackendPrcNames(BackendApiClient.RequestMetaCaseInfos requestMeta, string requestId, string implantLabel)
        {
            string faceHoleName = requestMeta?.faceHolePrcFileName?.Trim();
            string connectionName = requestMeta?.connectionPrcFileName?.Trim();
            string context = $"requestId={requestId}, implant={implantLabel}";
            if (string.IsNullOrWhiteSpace(faceHoleName) || string.IsNullOrWhiteSpace(connectionName))
            {
                AppLogger.Log($"DentalAddinPrcManager.ApplyBackendPrcNames: PRC 파일명 누락 ({context}) - faceHole={faceHoleName}, connection={connectionName}");
                throw new InvalidOperationException($"Backend PRC file name is missing ({context})");
            }
            if (!TryResolveBackendPrcPath("1_Face Hole", faceHoleName, out string faceHolePath))
            {
                AppLogger.Log($"DentalAddinPrcManager.ApplyBackendPrcNames: FaceHole PRC resolve failed ({context}) - fileName={faceHoleName}");
                throw new InvalidOperationException($"FaceHole PRC resolve failed ({context}) - fileName={faceHoleName}");
            }
            if (!TryResolveBackendPrcPath("2_Connection", connectionName, out string connectionPath))
            {
                AppLogger.Log($"DentalAddinPrcManager.ApplyBackendPrcNames: Connection PRC resolve failed ({context}) - fileName={connectionName}");
                throw new InvalidOperationException($"Connection PRC resolve failed ({context}) - fileName={connectionName}");
            }
            FaceHoleProcessFilePath = faceHolePath;
            ConnectionMachiningProcessFilePath = connectionPath;
            AppLogger.Log($"DentalAddinPrcManager.ApplyBackendPrcNames: FaceHole={Path.GetFileName(faceHolePath)}, Connection={Path.GetFileName(connectionPath)}");
            return true;
        }
        private static bool TryResolveBackendPrcPath(string subDir, string fileName, out string resolved)
        {
            resolved = null;
            if (string.IsNullOrWhiteSpace(fileName))
            {
                AppLogger.Log($"DentalAddinPrcManager.TryResolveBackendPrcPath: PRC 파일명 누락 - subDir={subDir}");
                return false;
            }

            if (Path.IsPathRooted(fileName))
            {
                try
                {
                    string rooted = Path.GetFullPath(fileName);
                    if (File.Exists(rooted))
                    {
                        resolved = rooted;
                        AppLogger.Log($"DentalAddinPrcManager.TryResolveBackendPrcPath: PRC 확인 완료 - rooted={resolved}");
                        return true;
                    }
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"DentalAddinPrcManager.TryResolveBackendPrcPath: rooted 경로 실패 - {ex.GetType().Name}:{ex.Message}");
                }
            }

            string leaf = Path.GetFileName(fileName);
            var attemptedDirs = new System.Collections.Generic.List<string>();
            foreach (string prcRoot in EnumeratePrcRootCandidates())
            {
                string baseDirectory = Path.Combine(prcRoot, subDir);
                attemptedDirs.Add(baseDirectory);
                if (TryMatchPrcInDirectory(baseDirectory, leaf, out resolved))
                {
                    AppLogger.Log($"DentalAddinPrcManager.TryResolveBackendPrcPath: PRC 확인 완료 - subDir={subDir}, requested={fileName}, resolved={resolved}");
                    return true;
                }
            }

            AppLogger.Log($"DentalAddinPrcManager.TryResolveBackendPrcPath: PRC 파일 없음 - requested={fileName}, dirs={string.Join(" | ", attemptedDirs)}");
            return false;
        }

        private static System.Collections.Generic.IEnumerable<string> EnumeratePrcRootCandidates()
        {
            var seen = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var ordered = new System.Collections.Generic.List<string>();

            void Consider(string candidate)
            {
                if (string.IsNullOrWhiteSpace(candidate))
                {
                    return;
                }
                try
                {
                    string full = Path.GetFullPath(candidate);
                    if (!Directory.Exists(full))
                    {
                        return;
                    }
                    if (seen.Add(full))
                    {
                        ordered.Add(full);
                    }
                }
                catch
                {
                }
            }

            Consider(ResolvePrcDirectory());
            Consider(AppConfig.PrcRootDirectory);
            string bg = AppConfig.BaseDirectory;
            Consider(Path.Combine(bg, "esprit-addin", "AcroDent"));
            Consider(Path.Combine(bg, "pc1", "esprit-addin", "AcroDent"));
            Consider(Path.Combine(AppConfig.AddInRootDirectory, "AcroDent"));

            // Face Hole PRC가 실제로 있는 root를 앞으로
            ordered.Sort((a, b) => HealthyPrcSubdirScore(b, "1_Face Hole").CompareTo(HealthyPrcSubdirScore(a, "1_Face Hole")));
            return ordered;
        }

        private static int HealthyPrcSubdirScore(string prcRoot, string subDir)
        {
            try
            {
                string dir = Path.Combine(prcRoot, subDir);
                if (!Directory.Exists(dir))
                {
                    return 0;
                }
                int count = 0;
                foreach (string path in Directory.GetFiles(dir))
                {
                    if (path.EndsWith(".prc", StringComparison.OrdinalIgnoreCase))
                    {
                        count++;
                    }
                }
                return count;
            }
            catch
            {
                return 0;
            }
        }

        private static bool TryMatchPrcInDirectory(string baseDirectory, string leafFileName, out string resolved)
        {
            resolved = null;
            if (string.IsNullOrWhiteSpace(baseDirectory) || !Directory.Exists(baseDirectory))
            {
                return false;
            }

            string direct = Path.Combine(baseDirectory, leafFileName);
            if (File.Exists(direct))
            {
                resolved = direct;
                return true;
            }

            string[] entries;
            try
            {
                // 확장자 필터 없이 열거 (일부 Windows/.NET 환경에서 *.prc + 한글 파일명 조합이 비는 경우 대비)
                entries = Directory.GetFiles(baseDirectory);
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinPrcManager.TryMatchPrcInDirectory: 열거 실패 - dir={baseDirectory}, {ex.GetType().Name}:{ex.Message}");
                return false;
            }

            string targetName = NormalizeFileNameForComparison(leafFileName);
            string asciiSuffix = ExtractAsciiNameSuffix(leafFileName);
            string suffixMatch = null;

            foreach (string candidatePath in entries)
            {
                string candidateLeaf = Path.GetFileName(candidatePath);
                if (candidateLeaf == null || !candidateLeaf.EndsWith(".prc", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                string candidateName = NormalizeFileNameForComparison(candidateLeaf);
                if (string.Equals(candidateName, targetName, StringComparison.OrdinalIgnoreCase))
                {
                    resolved = candidatePath;
                    return true;
                }
                if (suffixMatch == null
                    && !string.IsNullOrEmpty(asciiSuffix)
                    && candidateName.EndsWith(asciiSuffix, StringComparison.OrdinalIgnoreCase))
                {
                    suffixMatch = candidatePath;
                }
            }

            if (suffixMatch != null)
            {
                resolved = suffixMatch;
                AppLogger.Log($"DentalAddinPrcManager.TryMatchPrcInDirectory: ASCII suffix 매칭 - requested={leafFileName}, resolved={resolved}");
                return true;
            }

            string sample = string.Join(", ", System.Linq.Enumerable.Take(entries, 8).Select(Path.GetFileName));
            AppLogger.Log($"DentalAddinPrcManager.TryMatchPrcInDirectory: 미매칭 - dir={baseDirectory}, files={entries.Length}, sample=[{sample}], requested={leafFileName}");
            return false;
        }

        private static string ExtractAsciiNameSuffix(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return string.Empty;
            }
            // "덴티움_SuperLine_RH_FaceHole.prc" -> "_SuperLine_RH_FaceHole.prc"
            for (int i = 0; i < fileName.Length - 1; i++)
            {
                if (fileName[i] == '_' && fileName[i + 1] < 128)
                {
                    return NormalizeFileNameForComparison(fileName.Substring(i));
                }
            }
            return string.Empty;
        }
        public static double ReadBottomZLimitFromFacePrc()
        {
            try
            {
                string facePrcDir = Path.Combine(AppConfig.AddInRootDirectory, "AcroDent", "7_FrontFace prc");
                if (!Directory.Exists(facePrcDir))
                {
                    throw new DirectoryNotFoundException($"디렉터리 없음: {facePrcDir}");
                }
                string[] prcFiles = Directory.GetFiles(facePrcDir, "*.prc");
                if (prcFiles.Length == 0)
                {
                    throw new FileNotFoundException($"prc 파일 없음: {facePrcDir}");
                }
                string prcPath = prcFiles[0];
                string[] lines = File.ReadAllLines(prcPath);
                foreach (string line in lines)
                {
                    if (line.TrimStart().StartsWith("BottomZLimit;", StringComparison.OrdinalIgnoreCase))
                    {
                        string[] parts = line.Split(new[] { ';' }, StringSplitOptions.None);
                        if (parts.Length >= 3 && double.TryParse(parts[2].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double value))
                        {
                            AppLogger.Log($"DentalAddinPrcManager.ReadBottomZLimitFromFacePrc: BottomZLimit={value} from {Path.GetFileName(prcPath)}");
                            return value;
                        }
                    }
                }
                throw new InvalidOperationException($"BottomZLimit 항목 없음: {prcPath}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinPrcManager.ReadBottomZLimitFromFacePrc: 읽기 실패 - {ex.GetType().Name}:{ex.Message}");
                throw;
            }
        }
        private static string NormalizeFileNameForComparison(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return string.Empty;
            }
            return value.Trim().Normalize(NormalizationForm.FormC);
        }
        public static string ResolvePrcDirectory()
        {
            string addInPrc = Path.Combine(AppConfig.AddInRootDirectory, "AcroDent");
            if (Directory.Exists(addInPrc))
            {
                return addInPrc;
            }
            AppLogger.Log($"DentalAddinPrcManager.ResolvePrcDirectory: PRC 디렉터리를 찾을 수 없어 기본 경로 사용 - {addInPrc}");
            return addInPrc;
        }
        public static string[] EnsurePrcArray(string[] source)
        {
            if (source == null || source.Length < 13)
            {
                return new string[13];
            }
            return source;
        }
        public static int[] EnsureComboArray(int[] source)
        {
            if (source == null || source.Length < 7)
            {
                return new int[7];
            }
            return source;
        }
        public static string ResolveProcessPath(string baseDirectory, string configuredPath)
        {
            if (string.IsNullOrWhiteSpace(configuredPath))
            {
                return string.Empty;
            }
            string candidate = configuredPath;
            const string programFilesRoot = @"C:\\Program Files (x86)\\D.P.Technology\\ESPRIT\\AddIns\\DentalAddin";
            if (Path.IsPathRooted(candidate) && candidate.StartsWith(programFilesRoot, StringComparison.OrdinalIgnoreCase))
            {
                string relativeFromProgramFiles = candidate.Substring(programFilesRoot.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                candidate = Path.Combine(AppConfig.AddInRootDirectory, relativeFromProgramFiles);
                AppLogger.Log($"DentalAddinPrcManager.ResolveProcessPath: Program Files 경로 무시, 기본 경로로 대체 - {candidate}");
            }
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
                AppLogger.Log($"DentalAddinPrcManager.ResolveProcessPath: PRC 기본 경로에서 찾지 못해 AcroDent 경로로 대체 - {fallbackFull}");
                return fallbackFull;
            }
            AppLogger.Log($"DentalAddinPrcManager.ResolveProcessPath: PRC 파일을 찾을 수 없음 - {fullPath}");
            return fullPath;
        }
        public static string GetDefaultUserDataPath()
        {
            try
            {
                string path = Path.Combine(AppConfig.AddInRootDirectory, "Viles", "DefaultPath", "Tech_Default_Path.xml");
                return Path.GetFullPath(path);
            }
            catch
            {
                return string.Empty;
            }
        }
    }
}
