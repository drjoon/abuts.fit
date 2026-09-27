// change-log:
// - 2026-09-27: v3 탐색기로 케이스 폴더 열고 앞으로 가져오기, 작업 폴더 고르기 창.
// related files:
// - bg/lab-cad-helper/win/HttpServer.cs
// - bg/lab-cad-helper/win/CaseFolder.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace Abuts.LabHelper
{
    internal static class Explorer
    {
        private const int SwRestore = 9;
        private const byte VkMenu = 0x12;
        private const int KeyUp = 0x2;

        /// <summary>탐색기로 폴더를 열고 앞으로 가져온다. 이미 열린 창이 있으면 그 창을 앞으로.</summary>
        public static void Reveal(string folder)
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    var title = Path.GetFileName(folder.TrimEnd('\\'));
                    var hwnd = FindExplorerWindow(title);
                    if (hwnd == IntPtr.Zero)
                    {
                        Process.Start(new ProcessStartInfo("explorer.exe", "\"" + folder + "\"")
                        {
                            UseShellExecute = true,
                        });
                        for (var i = 0; i < 30 && hwnd == IntPtr.Zero; i++)
                        {
                            Thread.Sleep(100);
                            hwnd = FindExplorerWindow(title);
                        }
                    }
                    if (hwnd != IntPtr.Zero) BringToFront(hwnd);
                }
                catch (Exception ex)
                {
                    Log.Write("reveal: " + ex.Message);
                }
            });
        }

        private static IntPtr FindExplorerWindow(string title)
        {
            var found = IntPtr.Zero;
            EnumWindows((hwnd, lParam) =>
            {
                var cls = new StringBuilder(64);
                GetClassName(hwnd, cls, cls.Capacity);
                if (cls.ToString() != "CabinetWClass") return true;
                var text = new StringBuilder(512);
                GetWindowText(hwnd, text, text.Capacity);
                var t = text.ToString();
                if (string.Equals(t, title, StringComparison.OrdinalIgnoreCase) ||
                    t.EndsWith("\\" + title, StringComparison.OrdinalIgnoreCase))
                {
                    found = hwnd;
                    return false;
                }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        private static void BringToFront(IntPtr hwnd)
        {
            if (IsIconic(hwnd)) ShowWindow(hwnd, SwRestore);
            // 뒤에서 도는 프로세스는 앞으로 가져오기가 막힌다. Alt 입력 한 번이면 허용된다.
            keybd_event(VkMenu, 0, 0, UIntPtr.Zero);
            keybd_event(VkMenu, 0, KeyUp, UIntPtr.Zero);
            SetForegroundWindow(hwnd);
        }

        private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);

        [DllImport("user32.dll")]
        private static extern bool IsIconic(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hwnd, int cmd);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern void keybd_event(byte vk, byte scan, int flags, UIntPtr extra);
    }

    internal static class FolderPicker
    {
        /// <summary>작업 폴더 고르기 창을 브라우저 위로 띄운다. 취소면 빈 문자열.</summary>
        public static string Pick(string initial)
        {
            using (var owner = new Form
            {
                TopMost = true,
                ShowInTaskbar = false,
                FormBorderStyle = FormBorderStyle.None,
                StartPosition = FormStartPosition.CenterScreen,
                Size = new System.Drawing.Size(1, 1),
                Opacity = 0,
            })
            using (var dlg = new FolderBrowserDialog
            {
                Description = "환자 케이스를 모아 두는 작업 폴더를 고르세요.",
                ShowNewFolderButton = true,
            })
            {
                if (CaseFolder.WorkFolderExists(initial)) dlg.SelectedPath = initial;
                owner.Show();
                owner.Activate();
                var result = dlg.ShowDialog(owner);
                owner.Close();
                return result == DialogResult.OK ? CaseFolder.NormalizeWorkFolder(dlg.SelectedPath) : "";
            }
        }
    }
}
