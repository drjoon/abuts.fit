// change-log:
// - 2026-09-27: v3 설정(작업 폴더·추가 허용 출처)과 로그.
// related files:
// - bg/lab-cad-helper/win/HttpServer.cs
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace Abuts.LabHelper
{
    internal static class Config
    {
        private static readonly object Gate = new object();
        private static string _workFolder = "";
        private static string _allowOrigin = "";
        private static bool _loaded;

        public static string FilePath
        {
            get { return Path.Combine(Installer.InstallDir, "config.json"); }
        }

        public static string WorkFolder
        {
            get
            {
                lock (Gate)
                {
                    EnsureLoaded();
                    return _workFolder;
                }
            }
            set
            {
                lock (Gate)
                {
                    EnsureLoaded();
                    _workFolder = (value ?? "").Trim();
                    Save();
                }
            }
        }

        public static string AllowOrigin
        {
            get
            {
                lock (Gate)
                {
                    EnsureLoaded();
                    return _allowOrigin;
                }
            }
        }

        public static void ImportLegacy(string legacyPath)
        {
            var map = ReadJson(legacyPath);
            var folder = Get(map, "workFolder");
            if (string.IsNullOrEmpty(folder)) return;
            lock (Gate)
            {
                _loaded = true;
                _workFolder = folder;
                _allowOrigin = Get(map, "allowOrigin");
                Save();
            }
        }

        private static void EnsureLoaded()
        {
            if (_loaded) return;
            _loaded = true;
            var map = ReadJson(FilePath);
            _workFolder = Get(map, "workFolder");
            _allowOrigin = Get(map, "allowOrigin");
        }

        private static void Save()
        {
            try
            {
                Directory.CreateDirectory(Installer.InstallDir);
                var json = new JavaScriptSerializer().Serialize(new Dictionary<string, object>
                {
                    { "workFolder", _workFolder },
                    { "allowOrigin", _allowOrigin },
                });
                File.WriteAllText(FilePath, json, new UTF8Encoding(false));
            }
            catch (Exception ex)
            {
                Log.Write("config save: " + ex.Message);
            }
        }

        private static Dictionary<string, object> ReadJson(string path)
        {
            try
            {
                if (!File.Exists(path)) return new Dictionary<string, object>();
                var text = File.ReadAllText(path, Encoding.UTF8).TrimStart('\uFEFF');
                return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(text)
                    ?? new Dictionary<string, object>();
            }
            catch
            {
                return new Dictionary<string, object>();
            }
        }

        private static string Get(Dictionary<string, object> map, string key)
        {
            object value;
            return map != null && map.TryGetValue(key, out value) && value != null
                ? Convert.ToString(value).Trim()
                : "";
        }
    }

    internal static class Log
    {
        private static readonly object Gate = new object();

        public static void Write(string line)
        {
            try
            {
                lock (Gate)
                {
                    Directory.CreateDirectory(Installer.InstallDir);
                    var path = Path.Combine(Installer.InstallDir, "helper.log");
                    var info = new FileInfo(path);
                    if (info.Exists && info.Length > 1024 * 1024) info.Delete();
                    File.AppendAllText(
                        path,
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + line + "\r\n",
                        new UTF8Encoding(false));
                }
            }
            catch
            {
                // ignore
            }
        }
    }
}
