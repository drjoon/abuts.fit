// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - bg/pc1/esprit-addin/EspritHttpServer.cs
// - bg/pc1/esprit-addin/Helpers/BackendApiClient.cs
// - web/backend/controllers/requests/common.nc.controller.js
using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Esprit;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers
{
    /// <summary>
    /// CAM 완료 문서를 운영 PC ESP 폴더에 남긴다.
    /// ResetDocument의 임시 ESP(템플릿 교체용)와 별개이며, 그 임시 파일은 계속 삭제한다.
    /// 폴더 합이 10GB를 넘으면 방금 저장한 파일을 제외하고 오래된 것부터 지운다.
    /// </summary>
    public static class EspFileArchive
    {
        public const long MaxFolderBytes = 10L * 1024L * 1024L * 1024L;

        private static readonly Regex RequestIdPattern = new Regex(
            @"^[A-Za-z0-9_-]{1,80}$",
            RegexOptions.CultureInvariant | RegexOptions.Compiled);

        public sealed class SavedEsp
        {
            public string FullPath { get; set; }
            public string FileName { get; set; }
            public long FileSize { get; set; }
        }

        public static SavedEsp TrySave(Document document, string requestId)
        {
            string safeId = SanitizeRequestId(requestId);
            if (document == null || string.IsNullOrWhiteSpace(safeId))
            {
                AppLogger.Log($"EspFileArchive: 저장 생략 - documentNull={document == null}, requestId='{requestId ?? ""}'");
                return null;
            }

            try
            {
                string dir = AppConfig.StorageEspDirectory;
                Directory.CreateDirectory(dir);
                string fullPath = Path.Combine(dir, safeId + ".esp");
                TryDeleteExisting(fullPath);

                document.SaveAs(fullPath);
                if (!File.Exists(fullPath))
                {
                    AppLogger.Log($"EspFileArchive: SaveAs 이후 파일 없음 - {fullPath}");
                    return null;
                }

                var info = new FileInfo(fullPath);
                AppLogger.Log($"EspFileArchive: ESP 저장 완료 - {fullPath} size={info.Length}");
                PruneOldest(dir, fullPath);
                return new SavedEsp
                {
                    FullPath = fullPath,
                    FileName = info.Name,
                    FileSize = info.Length,
                };
            }
            catch (Exception ex)
            {
                AppLogger.Log($"EspFileArchive: ESP 저장 실패 - {ex.GetType().Name}:{ex.Message}");
                return null;
            }
        }

        public static string TryResolve(string requestId)
        {
            string safeId = SanitizeRequestId(requestId);
            if (string.IsNullOrWhiteSpace(safeId))
            {
                return null;
            }

            try
            {
                string fullPath = Path.Combine(AppConfig.StorageEspDirectory, safeId + ".esp");
                return File.Exists(fullPath) ? fullPath : null;
            }
            catch (Exception ex)
            {
                AppLogger.Log($"EspFileArchive: 경로 확인 실패 - {ex.GetType().Name}:{ex.Message}");
                return null;
            }
        }

        public static string SanitizeRequestId(string requestId)
        {
            string raw = (requestId ?? string.Empty).Trim();
            if (!RequestIdPattern.IsMatch(raw))
            {
                return null;
            }
            return raw;
        }

        private static void TryDeleteExisting(string fullPath)
        {
            try
            {
                if (File.Exists(fullPath))
                {
                    File.Delete(fullPath);
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"EspFileArchive: 기존 ESP 삭제 실패(SaveAs로 덮어씀) - {fullPath} ({ex.GetType().Name}:{ex.Message})");
            }
        }

        private static void PruneOldest(string dir, string keepPath)
        {
            try
            {
                var files = Directory.EnumerateFiles(dir, "*.esp")
                    .Select(path => new FileInfo(path))
                    .Where(info => info.Exists)
                    .OrderBy(info => info.LastWriteTimeUtc)
                    .ThenBy(info => info.FullName, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                long total = 0;
                foreach (var info in files)
                {
                    total += info.Length;
                }
                if (total <= MaxFolderBytes)
                {
                    return;
                }

                AppLogger.Log($"EspFileArchive: 폴더 {total} bytes > {MaxFolderBytes} — 오래된 ESP 삭제 시작");
                int removed = 0;
                foreach (var info in files)
                {
                    if (total <= MaxFolderBytes)
                    {
                        break;
                    }
                    if (string.Equals(info.FullName, keepPath, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    try
                    {
                        long length = info.Length;
                        info.Delete();
                        total -= length;
                        removed += 1;
                        AppLogger.Log($"EspFileArchive: 오래된 ESP 삭제 - {info.FullName} size={length}");
                    }
                    catch (Exception ex)
                    {
                        AppLogger.Log($"EspFileArchive: 오래된 ESP 삭제 실패 - {info.FullName} ({ex.GetType().Name}:{ex.Message})");
                    }
                }
                AppLogger.Log($"EspFileArchive: 정리 완료 removed={removed} remainBytes={Math.Max(0, total).ToString(CultureInfo.InvariantCulture)}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"EspFileArchive: 용량 정리 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
    }
}
