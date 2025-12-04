using System;
using System.Threading.Tasks;
using HiLinkBridgeWebApi48.Models;

namespace HiLinkBridgeWebApi48
{
    public static class MachinesInitializer
    {
        public static async void InitializeFromConfig()
        {
            try
            {
                var list = MachinesConfigStore.Load();
                if (list == null || list.Count == 0)
                {
                    Console.WriteLine("[init] machines.json 에 동기화할 장비가 없습니다.");
                    return;
                }

                Console.WriteLine("[init] machines.json 기반 장비 동기화 시작 (총 {0}개)", list.Count);

                var client = new HiLinkMode2Client();
                int ok = 0;
                int fail = 0;

                foreach (MachineConfigItem m in list)
                {
                    if (m == null || string.IsNullOrWhiteSpace(m.uid) || string.IsNullOrWhiteSpace(m.ip) || m.port <= 0)
                    {
                        continue;
                    }

                    try
                    {
                        var (success, resultCode) = await client.AddMachineAsync(m.uid, m.ip, m.port);
                        if (success)
                        {
                            ok++;
                        }
                        else
                        {
                            fail++;
                            Console.WriteLine("[init] AddMachine 실패 uid={0} code={1}", m.uid, resultCode);
                        }
                    }
                    catch (Exception ex)
                    {
                        fail++;
                        Console.WriteLine("[init] AddMachine 예외 uid={0} error={1}", m.uid, ex.Message);
                    }
                }

                Console.WriteLine("[init] machines.json 동기화 완료: 성공 {0}개, 실패 {1}개 (총 {2}개)", ok, fail, list.Count);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[init] machines.json 동기화 중 오류: {0}", ex.Message);
            }
        }
    }
}
