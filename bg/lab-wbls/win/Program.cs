// change-log:
// - 2026-10-24: v1 — 기공소 PC 택배 라벨 출력. 127.0.0.1:8011, 관리자 권한 없이 설치.
// related files:
// - bg/lab-wbls/rules.md
// - bg/lab-wbls/win/HttpServer.cs
// - bg/lab-wbls/win/LabelPrint.cs
// - bg/pc3/wbls-server/app.js
using System;
using System.Linq;
using System.Threading;
using System.Windows.Forms;

namespace Abuts.LabWbls
{
    internal static class Program
    {
        public const int Version = 1;
        public const int Port = 8011;
        public const string Title = "어벗츠 택배 라벨";

        [STAThread]
        private static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            var argv = args.Select(a => (a ?? "").Trim()).ToArray();
            try
            {
                if (argv.Any(a => a.Equals("--uninstall", StringComparison.OrdinalIgnoreCase)))
                {
                    return Installer.Uninstall();
                }
                var serve =
                    argv.Any(a => a.Equals("--serve", StringComparison.OrdinalIgnoreCase)) ||
                    Installer.IsRunningFromInstallDir();
                return serve ? Serve() : Installer.Install();
            }
            catch (Exception ex)
            {
                Log.Write("fatal: " + ex);
                MessageBox.Show(
                    "문제가 생겼습니다.\r\n\r\n" + ex.Message,
                    Title,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }
        }

        private static int Serve()
        {
            bool created;
            using (var mutex = new Mutex(true, @"Local\AbutsLabWbls", out created))
            {
                if (!created) return 0;
                var server = new HttpServer(Port);
                if (!server.Start())
                {
                    Log.Write("listen failed :" + Port);
                    return 2;
                }
                Log.Write("serve :" + Port);
                Application.Run();
                server.Stop();
                return 0;
            }
        }
    }
}
