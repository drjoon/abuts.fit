// change-log:
// - 2026-10-03: serve 중 version.json을 보고 새 설치본이면 --silent-update로 교체.
// related files:
// - bg/lab-cad-helper/win/Installer.cs
// - bg/lab-cad-helper/win/Program.cs
// - web/frontend/public/downloads/lab-helper/version.json
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Web.Script.Serialization;

namespace Abuts.LabHelper
{
    internal static class AutoUpdate
    {
        private static readonly string[] DefaultOrigins =
        {
            "https://abuts.fit",
            "https://www.abuts.fit",
        };

        public static void StartBackground()
        {
            var t = new Thread(Loop) { IsBackground = true, Name = "auto-update" };
            t.Start();
        }

        private static void Loop()
        {
            // 기동 직후 부하·네트워크 준비 여유
            Thread.Sleep(8000);
            try
            {
                TryUpdateOnce();
            }
            catch (Exception ex)
            {
                Log.Write("auto-update: " + ex.Message);
            }
        }

        private static void TryUpdateOnce()
        {
            try
            {
                ServicePointManager.SecurityProtocol =
                    SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;
            }
            catch
            {
                // older defaults
            }

            var apiOrigin = AlarmSession.FirstApiOrigin();

            var origins = new System.Collections.Generic.List<string>();
            if (!string.IsNullOrEmpty(apiOrigin)) origins.Add(apiOrigin.TrimEnd('/'));
            foreach (var o in DefaultOrigins) origins.Add(o);

            foreach (var origin in origins)
            {
                try
                {
                    if (TryUpdateFrom(origin)) return;
                }
                catch (Exception ex)
                {
                    Log.Write("auto-update " + origin + ": " + ex.Message);
                }
            }
        }

        private static bool TryUpdateFrom(string origin)
        {
            var metaUrl = origin + "/downloads/lab-helper/version.json";
            var json = HttpGet(metaUrl, 8000);
            if (string.IsNullOrEmpty(json)) return false;
            var map = new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string, object>>(json);
            if (map == null) return false;
            object verObj;
            if (!map.TryGetValue("version", out verObj) || verObj == null) return false;
            int remote;
            if (!int.TryParse(Convert.ToString(verObj), out remote)) return false;
            if (remote <= Program.Version)
            {
                Log.Write("auto-update up-to-date local=" + Program.Version + " remote=" + remote);
                return true;
            }

            var path = "/downloads/lab-helper/AbutsLabHelperSetup.exe";
            object winObj;
            if (map.TryGetValue("windows", out winObj) && winObj is System.Collections.Generic.Dictionary<string, object>)
            {
                var win = (System.Collections.Generic.Dictionary<string, object>)winObj;
                object p;
                if (win.TryGetValue("path", out p) && p != null)
                {
                    var s = Convert.ToString(p).Trim();
                    if (!string.IsNullOrEmpty(s)) path = s.StartsWith("/") ? s : "/" + s;
                }
            }
            var downloadUrl = path.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? path
                : origin + path;
            var temp = Path.Combine(Path.GetTempPath(), "AbutsLabHelperSetup.exe");
            Log.Write("auto-update download " + downloadUrl);
            if (!HttpDownload(downloadUrl, temp, 120000)) return false;

            Process.Start(new ProcessStartInfo(temp, "--silent-update")
            {
                UseShellExecute = false,
                WorkingDirectory = Path.GetTempPath(),
            });
            // 설치본이 /shutdown 후 교체한다. 이 프로세스는 곧 종료된다.
            Thread.Sleep(500);
            Ui.Quit();
            return true;
        }

        private static string HttpGet(string url, int timeoutMs)
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "GET";
            req.Timeout = timeoutMs;
            req.ReadWriteTimeout = timeoutMs;
            req.UserAgent = "AbutsLabHelper/" + Program.Version;
            using (var res = (HttpWebResponse)req.GetResponse())
            using (var stream = res.GetResponseStream())
            using (var reader = new StreamReader(stream ?? Stream.Null))
            {
                if ((int)res.StatusCode != 200) return null;
                return reader.ReadToEnd();
            }
        }

        private static bool HttpDownload(string url, string dest, int timeoutMs)
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "GET";
            req.Timeout = timeoutMs;
            req.ReadWriteTimeout = timeoutMs;
            req.UserAgent = "AbutsLabHelper/" + Program.Version;
            using (var res = (HttpWebResponse)req.GetResponse())
            using (var stream = res.GetResponseStream())
            {
                if ((int)res.StatusCode != 200 || stream == null) return false;
                var tmp = dest + ".part";
                using (var fs = File.Create(tmp))
                {
                    stream.CopyTo(fs);
                }
                if (File.Exists(dest)) File.Delete(dest);
                File.Move(tmp, dest);
                return true;
            }
        }
    }
}
