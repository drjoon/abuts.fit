using System;
using System.IO;

namespace Abuts.LabWbls
{
    internal static class Log
    {
        public static void Write(string message)
        {
            try
            {
                var dir = Installer.InstallDir;
                Directory.CreateDirectory(dir);
                var line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine;
                File.AppendAllText(Path.Combine(dir, "wbls.log"), line);
            }
            catch
            {
                // 로그 실패는 출력을 막지 않는다.
            }
        }
    }
}
