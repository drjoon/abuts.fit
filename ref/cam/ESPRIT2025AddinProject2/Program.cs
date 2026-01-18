using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using DPTechnology.AnnexLibraries;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject
{
    internal static class Program
    {
        private const string DefaultEspritDirectory = @"C:\Program Files (x86)\D.P.Technology\ESPRIT\Prog";

        [STAThread]
        private static int Main(string[] args)
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            Console.WriteLine("=== ESPRIT Add-In Launcher (Acrodent) ===");

            try
            {
                RegisterAssemblyForCom();
                RegisterAddIn();

                var espritPath = ResolveEspritPath(args);
                if (string.IsNullOrWhiteSpace(espritPath))
                {
                    Console.Error.WriteLine("❌ ESPRIT 실행 파일을 찾을 수 없습니다. 경로를 첫 번째 인자로 넘겨주세요.");
                    return 1;
                }

                LaunchEsprit(espritPath);
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("❌ 실행 중 오류가 발생했습니다.");
                Console.Error.WriteLine(ex);
                return 1;
            }
        }

        private static void RegisterAssemblyForCom()
        {
            Console.WriteLine("▶ COM 등록: 어셈블리 등록 중...");
            var services = new RegistrationServices();
            var assembly = Assembly.GetExecutingAssembly();
            if (!services.RegisterAssembly(assembly, AssemblyRegistrationFlags.SetCodeBase))
            {
                throw new InvalidOperationException("COM 등록에 실패했습니다. 관리자 권한으로 다시 시도해주세요.");
            }

            Console.WriteLine("✅ COM 등록 완료");
        }

        private static void RegisterAddIn()
        {
            Console.WriteLine("▶ ESPRIT Add-In 등록 중...");
            var friendlyName = Properties.Resources.AddInFriendlyName;
            var description = Properties.Resources.AddInDescription;

            var success = AddInRegistrationUtilities.RegisterEspritAddIn(
                typeof(Connect),
                friendlyName,
                description,
                loadBehavior: 1);

            if (!success)
            {
                throw new InvalidOperationException("ESPRIT Add-In 등록에 실패했습니다.");
            }

            Console.WriteLine("✅ Add-In 등록 완료 (시작 시 자동 로드)");
        }

        private static string ResolveEspritPath(string[] args)
        {
            if (args != null && args.Length > 0)
            {
                var candidate = args[0];
                if (File.Exists(candidate))
                {
                    return Path.GetFullPath(candidate);
                }

                Console.WriteLine($"⚠️ 지정한 경로에서 esprit.exe를 찾을 수 없습니다: {candidate}");
            }

            var defaultExe = Path.Combine(DefaultEspritDirectory, "esprit.exe");
            if (File.Exists(defaultExe))
            {
                Console.WriteLine($"ℹ️ 기본 경로에서 esprit.exe를 사용합니다: {defaultExe}");
                return defaultExe;
            }

            var envPath = Environment.GetEnvironmentVariable("ESPRIT_PATH");
            if (!string.IsNullOrEmpty(envPath) && File.Exists(envPath))
            {
                Console.WriteLine($"ℹ️ ESPRIT_PATH 환경 변수 값을 사용합니다: {envPath}");
                return envPath;
            }

            return string.Empty;
        }

        private static void LaunchEsprit(string espritExePath)
        {
            Console.WriteLine("▶ ESPRIT 실행 중...");
            var psi = new ProcessStartInfo
            {
                FileName = espritExePath,
                WorkingDirectory = Path.GetDirectoryName(espritExePath),
                UseShellExecute = false
            };

            var espritProcess = Process.Start(psi);
            if (espritProcess == null)
            {
                throw new InvalidOperationException("ESPRIT 프로세스를 시작하지 못했습니다.");
            }

            Console.WriteLine("✅ ESPRIT 실행 완료. 프로그램을 종료하려면 ESPRIT를 닫으세요.");
            espritProcess.WaitForExit();
            Console.WriteLine($"ℹ️ ESPRIT 종료 코드: {espritProcess.ExitCode}");
        }
    }
}
