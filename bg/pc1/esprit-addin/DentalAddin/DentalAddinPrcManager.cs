using System;
using System.IO;
using System.Text;
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
            try
            {
                string baseDirectory = Path.Combine(AppConfig.AddInRootDirectory, "AcroDent", subDir);
                if (!Directory.Exists(baseDirectory))
                {
                    AppLogger.Log($"DentalAddinPrcManager.TryResolveBackendPrcPath: 디렉터리 없음 - dir={baseDirectory}");
                    return false;
                }
                string targetName = NormalizeFileNameForComparison(Path.GetFileName(fileName));
                foreach (string candidatePath in Directory.GetFiles(baseDirectory, "*.prc", SearchOption.TopDirectoryOnly))
                {
                    string candidateName = NormalizeFileNameForComparison(Path.GetFileName(candidatePath));
                    if (string.Equals(candidateName, targetName, StringComparison.OrdinalIgnoreCase))
                    {
                        resolved = candidatePath;
                        AppLogger.Log($"DentalAddinPrcManager.TryResolveBackendPrcPath: PRC 확인 완료 - subDir={subDir}, requested={fileName}, resolved={resolved}");
                        return true;
                    }
                }
                AppLogger.Log($"DentalAddinPrcManager.TryResolveBackendPrcPath: PRC 파일 없음 - subDir={subDir}, file={fileName}, dir={baseDirectory}");
                return false;
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddinPrcManager.TryResolveBackendPrcPath: 탐색 실패 - {ex.GetType().Name}:{ex.Message}");
                return false;
            }
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
