// change-log:
// - 2026-10-24: 사용자 폴더 설치. HKCU Run. 관리자 권한 없음.
// related files:
// - bg/lab-wbls/win/Program.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Abuts.LabWbls
{
    internal static class Installer
    {
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunName = "AbutsLabWbls";
        private const string UninstallKey =
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\AbutsLabWbls";

        public static string InstallDir
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Abuts",
                    "LabWbls");
            }
        }

        public static string InstalledExe
        {
            get { return Path.Combine(InstallDir, "AbutsLabWbls.exe"); }
        }

        private static string SelfPath
        {
            get { return Process.GetCurrentProcess().MainModule.FileName; }
        }

        public static bool IsRunningFromInstallDir()
        {
            try
            {
                return string.Equals(
                    Path.GetFullPath(SelfPath),
                    Path.GetFullPath(InstalledExe),
                    StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        public static int Install()
        {
            var already = File.Exists(InstalledExe);
            if (!already)
            {
                var answer = MessageBox.Show(
                    "어벗츠 택배 라벨 출력을 설치할까요?\r\n\r\n" +
                    "프린터는 Xprinter XP-D4602B입니다. 같은 기종을 구매해 연결하세요.\r\n" +
                    "드라이버를 설치할 때 ZPL을 고르세요.\r\n" +
                    "관리자 권한 없이 이 PC 사용자에게만 설치되고, 로그인할 때마다 켜집니다.",
                    Program.Title,
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button1);
                if (answer != DialogResult.Yes) return 0;
            }

            StopRunning();
            Directory.CreateDirectory(InstallDir);
            CopyWithRetry(SelfPath, InstalledExe);
            try
            {
                File.Delete(InstalledExe + ":Zone.Identifier");
            }
            catch
            {
                // Zone 제거 실패는 설치를 막지 않는다.
            }

            var exe = "\"" + InstalledExe + "\"";
            using (var run = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                run.SetValue(RunName, exe + " --serve");
            }
            using (var un = Registry.CurrentUser.CreateSubKey(UninstallKey))
            {
                un.SetValue("DisplayName", Program.Title);
                un.SetValue("DisplayVersion", Program.Version + ".0.0");
                un.SetValue("Publisher", "Abuts");
                un.SetValue("DisplayIcon", InstalledExe);
                un.SetValue("InstallLocation", InstallDir);
                un.SetValue("UninstallString", exe + " --uninstall");
                un.SetValue("NoModify", 1, RegistryValueKind.DWord);
                un.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }

            Process.Start(new ProcessStartInfo(InstalledExe, "--serve")
            {
                UseShellExecute = false,
                WorkingDirectory = InstallDir,
            });

            var ok = WaitForHealth(8000);
            Log.Write("install ok=" + ok);
            if (!already)
            {
                MessageBox.Show(
                    ok
                        ? "설치가 끝났습니다.\r\n\r\n브라우저로 돌아가 라벨을 출력하세요."
                        : "설치는 됐지만 연결 확인에 실패했습니다.\r\n\r\nPC를 다시 시작하거나, 보안 프로그램이 막았는지 확인해 주세요.",
                    Program.Title,
                    MessageBoxButtons.OK,
                    ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
            }
            return ok ? 0 : 3;
        }

        public static int Uninstall()
        {
            var answer = MessageBox.Show(
                "어벗츠 택배 라벨 출력을 삭제할까요?",
                Program.Title,
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (answer != DialogResult.Yes) return 0;

            StopRunning();
            using (var run = Registry.CurrentUser.OpenSubKey(RunKey, true))
            {
                if (run != null) run.DeleteValue(RunName, false);
            }
            try
            {
                Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);
            }
            catch
            {
                // 이미 없음
            }

            Process.Start(new ProcessStartInfo(
                "cmd.exe",
                "/c timeout /t 2 /nobreak >nul & rmdir /s /q \"" + InstallDir + "\"")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden,
            });
            MessageBox.Show("삭제했습니다.", Program.Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        private static void StopRunning()
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(
                    "http://127.0.0.1:" + Program.Port + "/shutdown");
                req.Method = "POST";
                req.Timeout = 1500;
                req.ContentLength = 0;
                using (req.GetResponse()) { }
            }
            catch
            {
                // 꺼져 있음
            }

            var selfId = Process.GetCurrentProcess().Id;
            foreach (var p in Process.GetProcessesByName("AbutsLabWbls"))
            {
                try
                {
                    if (p.Id != selfId && !p.WaitForExit(1500)) p.Kill();
                }
                catch
                {
                    // ignore
                }
            }
            for (var i = 0; i < 20 && Health() != null; i++) Thread.Sleep(150);
        }

        private static bool WaitForHealth(int ms)
        {
            var until = Environment.TickCount + ms;
            while (Environment.TickCount < until)
            {
                if (Health() != null) return true;
                Thread.Sleep(200);
            }
            return Health() != null;
        }

        private static string Health()
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(
                    "http://127.0.0.1:" + Program.Port + "/health");
                req.Method = "GET";
                req.Timeout = 800;
                using (var res = (HttpWebResponse)req.GetResponse())
                using (var reader = new StreamReader(res.GetResponseStream()))
                {
                    return reader.ReadToEnd();
                }
            }
            catch
            {
                return null;
            }
        }

        private static void CopyWithRetry(string from, string to)
        {
            Exception last = null;
            for (var i = 0; i < 8; i++)
            {
                try
                {
                    File.Copy(from, to, true);
                    return;
                }
                catch (Exception ex)
                {
                    last = ex;
                    Thread.Sleep(250);
                }
            }
            throw last ?? new IOException("설치 파일을 복사하지 못했습니다.");
        }
    }
}
