// change-log:
// - 2026-10-04: v9 — 세션 businessAnchorId를 알림 href에 포함.
// - 2026-10-03: v8 — 치과·기공소 세션을 동시에 폴링(포커스 없는 창도 OS 알림).
// - 2026-10-03: v5 — version.json 자동 갱신(--silent-update).
// - 2026-10-03: v4 — PC 알람(/notify·/session) + 브라우저 종료 시 API 장기 폴링.
// - 2026-09-27: v3 — Windows 전용 exe 하나. 실행하면 동의 한 번으로 설치(관리자 권한 없음),
//   이후 로그인 때마다 창 없이 127.0.0.1:8010에서 대기. 케이스 폴더 저장·확인·폴더 열기만 한다.
// related files:
// - bg/lab-cad-helper/win/HttpServer.cs
// - bg/lab-cad-helper/win/Notify.cs
// - bg/lab-cad-helper/win/AutoUpdate.cs
// - bg/lab-cad-helper/win/Installer.cs
// - bg/lab-cad-helper/rules.md
// - web/frontend/src/shared/files/labHelperClient.ts
using System;
using System.Linq;
using System.Threading;
using System.Windows.Forms;

namespace Abuts.LabHelper
{
    internal static class Program
    {
        public const int Version = 10;
        public const int Port = 8010;
        public const string Title = "어벗츠 연결 프로그램";

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
                if (argv.Any(a => a.Equals("--silent-update", StringComparison.OrdinalIgnoreCase)))
                {
                    return Installer.Install(silent: true);
                }
                var serve =
                    argv.Any(a => a.Equals("--serve", StringComparison.OrdinalIgnoreCase)) ||
                    argv.Any(a => a.StartsWith("abuts-cad:", StringComparison.OrdinalIgnoreCase)) ||
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
            using (var mutex = new Mutex(true, @"Local\AbutsLabHelper", out created))
            {
                if (!created) return 0;

                // 폴더 고르기 창은 STA 메시지 루프가 있는 이 스레드에서 띄운다.
                var ui = new Control();
                ui.CreateControl();
                var unused = ui.Handle;
                Ui.Init(ui);

                var server = new HttpServer(Port);
                if (!server.Start())
                {
                    Log.Write("port busy: " + Port);
                    return 2;
                }
                Log.Write("serve v" + Version);
                AutoUpdate.StartBackground();
                Application.Run();
                server.Stop();
                GC.KeepAlive(mutex);
                return 0;
            }
        }
    }

    internal static class Ui
    {
        private static Control _ui;

        public static void Init(Control ui)
        {
            _ui = ui;
        }

        public static T Invoke<T>(Func<T> fn)
        {
            if (_ui == null || !_ui.InvokeRequired) return fn();
            return (T)_ui.Invoke(fn);
        }

        public static void Quit()
        {
            if (_ui == null)
            {
                Environment.Exit(0);
                return;
            }
            _ui.BeginInvoke(new Action(Application.ExitThread));
        }
    }
}
