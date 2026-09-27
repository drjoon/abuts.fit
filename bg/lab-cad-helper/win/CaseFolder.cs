// change-log:
// - 2026-09-27: v3 케이스 폴더 — 이름 정리, 이미 받은 파일 확인, 파일 쓰기(임시 파일 → 교체).
// related files:
// - bg/lab-cad-helper/win/HttpServer.cs
// - bg/lab-cad-helper/win/WinShell.cs
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Abuts.LabHelper
{
    internal static class CaseFolder
    {
        private static readonly HashSet<string> Reserved = new HashSet<string>(
            new[] { "CON", "PRN", "AUX", "NUL" }
                .Concat(Enumerable.Range(1, 9).Select(i => "COM" + i))
                .Concat(Enumerable.Range(1, 9).Select(i => "LPT" + i)),
            StringComparer.OrdinalIgnoreCase);

        public static string NormalizeWorkFolder(string path)
        {
            var p = (path ?? "").Trim().Trim('"').Trim();
            if (p.Length == 0) return "";
            try
            {
                if (!Path.IsPathRooted(p)) return "";
                p = Path.GetFullPath(p);
            }
            catch
            {
                return "";
            }
            if (p.Length > 3) p = p.TrimEnd('\\', '/');
            return p;
        }

        public static bool WorkFolderExists(string path)
        {
            try
            {
                return !string.IsNullOrEmpty(path) && Directory.Exists(path);
            }
            catch
            {
                return false;
            }
        }

        /// <summary>폴더·파일 이름 한 칸. 경로 구분자·예약어·끝 점은 막는다.</summary>
        public static string SafeSegment(string value)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var sb = new StringBuilder();
            foreach (var ch in value ?? "")
            {
                sb.Append(invalid.Contains(ch) || ch < 32 ? ' ' : ch);
            }
            var s = Regex.Replace(sb.ToString(), @"\s+", " ").Trim().TrimEnd('.', ' ');
            if (s == "" || s == "." || s == "..") return "";
            if (s.Length > 150) s = s.Substring(0, 150).TrimEnd('.', ' ');
            var stem = s.Split('.')[0];
            if (Reserved.Contains(stem)) s = "_" + s;
            return s;
        }

        /// <summary>없거나 크기가 다른 파일 이름. size가 0이면 있는지만 본다.</summary>
        public static List<string> Missing(string folder, List<KeyValuePair<string, long>> files)
        {
            var missing = new List<string>();
            foreach (var f in files)
            {
                var path = Path.Combine(folder, f.Key);
                var info = new FileInfo(path);
                if (!info.Exists || (f.Value > 0 && info.Length != f.Value))
                {
                    missing.Add(f.Key);
                }
            }
            return missing;
        }

        public static void Write(string folder, string name, byte[] head, Stream rest, long length)
        {
            Directory.CreateDirectory(folder);
            var target = Path.Combine(folder, name);
            var temp = target + ".abuts-part";
            try
            {
                using (var fs = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 16))
                {
                    var first = (int)Math.Min(head.Length, length);
                    fs.Write(head, 0, first);
                    var remaining = length - first;
                    var buf = new byte[1 << 16];
                    while (remaining > 0)
                    {
                        var n = rest.Read(buf, 0, (int)Math.Min(buf.Length, remaining));
                        if (n <= 0) throw new IOException("전송이 끊겼습니다.");
                        fs.Write(buf, 0, n);
                        remaining -= n;
                    }
                }
                if (File.Exists(target)) File.Delete(target);
                File.Move(temp, target);
            }
            catch
            {
                try
                {
                    if (File.Exists(temp)) File.Delete(temp);
                }
                catch
                {
                    // ignore
                }
                throw;
            }
        }
    }
}
