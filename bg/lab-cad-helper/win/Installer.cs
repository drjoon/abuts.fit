// change-log:
// - 2026-10-03: 이미 설치된 PC는 확인 창 없이 바로 갱신(--silent-update / 재실행).
// - 2026-09-27: v3 설치·제거. 사용자 폴더(%LOCALAPPDATA%\Abuts\LabHelper)와 HKCU에만 쓴다.
//   예전 PowerShell 헬퍼(LabCadHelper·시작프로그램 바로가기)는 설치 때 정리한다.
// related files:
// - bg/lab-cad-helper/win/Program.cs
// - bg/lab-cad-helper/win/AutoUpdate.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Abuts.LabHelper
{
    internal static class Installer
    {
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunName = "AbutsLabHelper";
        private const string ProtocolKey = @"Software\Classes\abuts-cad";
        private const string UninstallKey =
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\AbutsLabHelper";

        public static string InstallDir
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Abuts",
                    "LabHelper");
            }
        }

        public static string InstalledExe
        {
            get { return Path.Combine(InstallDir, "AbutsLabHelper.exe"); }
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

        /// <summary>처음 설치는 확인 창. 이미 설치됐거나 silent면 창 없이 덮어쓴다.</summary>
        public static int Install(bool silent = false)
        {
            var already = File.Exists(InstalledExe);
            var quiet = silent || already;
            if (!quiet)
            {
                var answer = MessageBox.Show(
                    "어벗츠 연결 프로그램을 설치할까요?\r\n\r\n" +
                    "「작업열기」를 누르면 의뢰 파일을 작업 폴더에 저장하고 폴더를 열어 줍니다.\r\n" +
                    "관리자 권한 없이 이 PC 사용자에게만 설치되고, 화면에 보이지 않게 켜져 있습니다.",
                    Program.Title,
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button1);
                if (answer != DialogResult.Yes) return 0;
            }

            StopRunningHelper();
            RemoveLegacyHelper();

            Directory.CreateDirectory(InstallDir);
            CopyWithRetry(SelfPath, InstalledExe);
            DeleteFile(InstalledExe + ":Zone.Identifier");

            var exe = "\"" + InstalledExe + "\"";
            using (var run = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                run.SetValue(RunName, exe + " --serve");
            }
            using (var proto = Registry.CurrentUser.CreateSubKey(ProtocolKey))
            {
                proto.SetValue("", "URL:Abuts Lab Helper");
                proto.SetValue("URL Protocol", "");
                using (var cmd = proto.CreateSubKey(@"shell\open\command"))
                {
                    cmd.SetValue("", exe + " --serve \"%1\"");
                }
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
            Log.Write("install ok=" + ok + " quiet=" + quiet);
            if (!quiet)
            {
                MessageBox.Show(
                    ok
                        ? "설치가 끝났습니다.\r\n\r\n브라우저로 돌아가면 이어서 저장합니다."
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
                "어벗츠 연결 프로그램을 삭제할까요?\r\n\r\n작업 폴더에 저장한 파일은 지우지 않습니다.",
                Program.Title,
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (answer != DialogResult.Yes) return 0;

            StopRunningHelper();
            using (var run = Registry.CurrentUser.OpenSubKey(RunKey, true))
            {
                if (run != null) run.DeleteValue(RunName, false);
            }
            Registry.CurrentUser.DeleteSubKeyTree(ProtocolKey, false);
            Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);

            // 실행 중인 자신은 지울 수 없어 잠시 뒤 cmd가 폴더를 지운다.
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

        private static void StopRunningHelper()
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
            foreach (var p in Process.GetProcessesByName("AbutsLabHelper"))
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

        /// <summary>v2 PowerShell 헬퍼: 시작프로그램 바로가기·설치 폴더·ps1 프로세스.</summary>
        private static void RemoveLegacyHelper()
        {
            try
            {
                var lnk = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.Startup),
                    "Abuts CAD Helper.lnk");
                if (File.Exists(lnk)) File.Delete(lnk);
            }
            catch
            {
                // ignore
            }
            foreach (var p in Process.GetProcessesByName("powershell"))
            {
                try
                {
                    if (p.MainWindowHandle == IntPtr.Zero && GetCommandLine(p).IndexOf(
                            "lab-cad-helper.ps1", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        p.Kill();
                    }
                }
                catch
                {
                    // ignore
                }
            }
            try
            {
                var legacy = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Abuts",
                    "LabCadHelper");
                var legacyConfig = Path.Combine(legacy, "config.json");
                if (File.Exists(legacyConfig) && !File.Exists(Config.FilePath))
                {
                    Config.ImportLegacy(legacyConfig);
                }
                if (Directory.Exists(legacy)) Directory.Delete(legacy, true);
            }
            catch
            {
                // ignore
            }
        }

        private static string GetCommandLine(Process p)
        {
            try
            {
                using (var searcher = new System.Management.ManagementObjectSearcher(
                    "SELECT CommandLine FROM Win32_Process WHERE ProcessId = " + p.Id))
                {
                    foreach (var o in searcher.Get())
                    {
                        return Convert.ToString(o["CommandLine"]) ?? "";
                    }
                }
            }
            catch
            {
                // ignore
            }
            return "";
        }

        private static void CopyWithRetry(string from, string to)
        {
            if (string.Equals(Path.GetFullPath(from), Path.GetFullPath(to), StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
            Exception last = null;
            for (var i = 0; i < 10; i++)
            {
                try
                {
                    File.Copy(from, to, true);
                    return;
                }
                catch (IOException ex)
                {
                    last = ex;
                    Thread.Sleep(300);
                }
                catch (UnauthorizedAccessException ex)
                {
                    last = ex;
                    Thread.Sleep(300);
                }
            }
            throw last ?? new IOException("복사 실패");
        }

        private static string Health()
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(
                    "http://127.0.0.1:" + Program.Port + "/health");
                req.Timeout = 700;
                using (var res = req.GetResponse())
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

        private static bool WaitForHealth(int timeoutMs)
        {
            var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
            while (DateTime.UtcNow < deadline)
            {
                var body = Health();
                if (body != null && body.Contains("\"version\":" + Program.Version)) return true;
                Thread.Sleep(250);
            }
            return false;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool DeleteFile(string path);
    }
}
