using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace HiLinkBridgeWebApi48
{
    /// <summary>
    /// 브리지 서버 내부 더미 예약 워커 (단일 브리지 운영 전제)
    /// - 백엔드(/api/cnc-machines/bridge/dummy-settings)에서 dummySettings를 읽는다.
    /// - KST 기준으로 매 분마다 스케줄을 체크한다.
    /// - excludeHolidays가 true면 백엔드가 계산한 영업일(isBusinessDay)일 때만 실행한다.
    /// - idempotency: lastRunKey(YYYY-MM-DD HH:mm)를 백엔드에 저장하여 같은 분에는 한 번만 실행한다.
    /// </summary>
    public static class DummyCncScheduler
    {
        private static Timer _timer;
        private static int _running = 0;

        private static readonly HttpClient BackendClient = new HttpClient();
        private static readonly HttpClient LocalClient = new HttpClient();

        private static readonly Regex FanucRegex = new Regex(@"O(\d{4})", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex DigitsRegex = new Regex(@"(\d{1,6})", RegexOptions.Compiled);

        private static string GetBackendBase()
        {
            // 예: https://abuts.fit/api
            var env = (Environment.GetEnvironmentVariable("BACKEND_BASE") ?? string.Empty).Trim();
            if (!string.IsNullOrEmpty(env)) return env.TrimEnd('/');
            return "https://abuts.fit/api";
        }

        private static string GetBackendJwt()
        {
            return (Environment.GetEnvironmentVariable("BACKEND_JWT") ?? string.Empty).Trim();
        }

        private static string GetBridgeBase()
        {
            // 브리지 서버 내부에서 자기 자신을 호출할 때 사용하는 base
            // (웹 백엔드가 브리지로 접근할 때 쓰는 BRIDGE_BASE와 혼동 방지)
            var env = (Environment.GetEnvironmentVariable("BRIDGE_SELF_BASE") ?? string.Empty).Trim();
            if (!string.IsNullOrEmpty(env)) return env.TrimEnd('/');
            // 자기 자신
            return "http://localhost:8002";
        }

        private static string GetBridgeSecret()
        {
            return (Environment.GetEnvironmentVariable("BRIDGE_SHARED_SECRET") ?? string.Empty).Trim();
        }

        private static TimeZoneInfo GetKstTimeZone()
        {
            // Windows
            return TimeZoneInfo.FindSystemTimeZoneById("Korea Standard Time");
        }

        private static DateTime GetNowKst()
        {
            var tz = GetKstTimeZone();
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        }

        private static int? ParseProgramNo(string programName)
        {
            var str = (programName ?? string.Empty);
            var m = FanucRegex.Match(str);
            if (m.Success)
            {
                if (int.TryParse(m.Groups[1].Value, out var n) && n > 0) return n;
            }

            var d = DigitsRegex.Match(str);
            if (d.Success)
            {
                if (int.TryParse(d.Groups[1].Value, out var n) && n > 0) return n;
            }

            return null;
        }

        private static void AddSecretHeader(HttpRequestMessage req)
        {
            var secret = GetBridgeSecret();
            if (!string.IsNullOrEmpty(secret))
            {
                req.Headers.Remove("X-Bridge-Secret");
                req.Headers.Add("X-Bridge-Secret", secret);
            }
        }

        private static void AddAuthHeader(HttpRequestMessage req)
        {
            var jwt = GetBackendJwt();
            if (!string.IsNullOrEmpty(jwt))
            {
                req.Headers.Remove("Authorization");
                req.Headers.Add("Authorization", "Bearer " + jwt);
            }
        }

        public static void Start()
        {
            if (_timer != null) return;

            var enabled = (Environment.GetEnvironmentVariable("DUMMY_CNC_SCHEDULER_ENABLED") ?? string.Empty).Trim();
            if (string.Equals(enabled, "false", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine("[DummyCncScheduler] disabled by DUMMY_CNC_SCHEDULER_ENABLED=false");
                return;
            }

            // 첫 실행은 약간 지연(부팅 직후 초기화 안정화)
            _timer = new Timer(async _ => await Tick(), null, TimeSpan.FromSeconds(10), TimeSpan.FromMinutes(1));
            Console.WriteLine("[DummyCncScheduler] started (1min interval)");
        }

        public static void Stop()
        {
            try
            {
                _timer?.Dispose();
            }
            catch { }
            _timer = null;
        }

        private static async Task Tick()
        {
            if (Interlocked.Exchange(ref _running, 1) == 1) return;

            try
            {
                if (!Controllers.ControlController.IsRunning)
                {
                    return;
                }

                var nowKst = GetNowKst();
                var ymd = nowKst.ToString("yyyy-MM-dd");
                var hm = nowKst.ToString("HH:mm");
                var minuteKey = ymd + " " + hm;

                var backendBase = GetBackendBase();
                var url = backendBase + "/cnc-machines/bridge/dummy-settings?ymd=" + Uri.EscapeDataString(ymd);

                var getReq = new HttpRequestMessage(HttpMethod.Get, url);
                AddSecretHeader(getReq);
                AddAuthHeader(getReq);

                var getResp = await BackendClient.SendAsync(getReq);
                var getText = await getResp.Content.ReadAsStringAsync();

                if (!getResp.IsSuccessStatusCode)
                {
                    Console.WriteLine("[DummyCncScheduler] backend fetch failed: status={0} body={1}", (int)getResp.StatusCode, getText);
                    return;
                }

                var root = JObject.Parse(getText);
                if (root.Value<bool?>("success") != true)
                {
                    Console.WriteLine("[DummyCncScheduler] backend returned success=false: {0}", getText);
                    return;
                }

                var data = root["data"] as JObject;
                if (data == null) return;

                var isBusinessDay = data.Value<bool?>("isBusinessDay") ?? true;
                var machines = data["machines"] as JArray;
                if (machines == null) return;

                foreach (var m in machines)
                {
                    var machineId = (m?["machineId"]?.ToString() ?? string.Empty).Trim();
                    if (string.IsNullOrEmpty(machineId)) continue;

                    var dummy = m?["dummySettings"] as JObject;
                    if (dummy == null) continue;

                    var programName = (dummy.Value<string>("programName") ?? "O0100").Trim();
                    var excludeHolidays = dummy.Value<bool?>("excludeHolidays") == true;
                    var lastRunKey = (dummy.Value<string>("lastRunKey") ?? string.Empty).Trim();

                    if (!string.IsNullOrEmpty(lastRunKey) && string.Equals(lastRunKey, minuteKey, StringComparison.Ordinal))
                    {
                        continue;
                    }

                    if (excludeHolidays && !isBusinessDay)
                    {
                        continue;
                    }

                    var schedules = dummy["schedules"] as JArray;
                    if (schedules == null || schedules.Count == 0) continue;

                    var shouldRun = schedules.Any(s =>
                    {
                        var enabled = s?["enabled"] == null ? true : (s.Value<bool?>("enabled") != false);
                        var time = (s?["time"]?.ToString() ?? string.Empty).Trim();
                        return enabled && string.Equals(time, hm, StringComparison.Ordinal);
                    });

                    if (!shouldRun) continue;

                    var progNo = ParseProgramNo(programName);
                    if (progNo == null)
                    {
                        Console.WriteLine("[DummyCncScheduler] invalid programName '{0}' for machine={1}", programName, machineId);
                        continue;
                    }

                    // 스케줄 시각이 되면, 현재 가공이 끝나면 바로 다음으로 실행되도록 큐 앞에 끼워넣기
                    CncJobQueue.EnqueueDummyFront(machineId, progNo.Value, programName);

                    await UpdateLastRunKey(machineId, minuteKey);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[DummyCncScheduler] tick error: {0}", ex);
            }
            finally
            {
                Interlocked.Exchange(ref _running, 0);
            }
        }

        private static async Task UpdateLastRunKey(string machineId, string minuteKey)
        {
            try
            {
                var backendBase = GetBackendBase();
                var url = backendBase + "/cnc-machines/bridge/dummy-settings/" + Uri.EscapeDataString(machineId) + "/last-run-key";

                var payload = new { lastRunKey = minuteKey };
                var req = new HttpRequestMessage(new HttpMethod("PATCH"), url);
                AddSecretHeader(req);
                AddAuthHeader(req);
                req.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");

                var resp = await BackendClient.SendAsync(req);
                var text = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    Console.WriteLine("[DummyCncScheduler] update lastRunKey failed: machineId={0} status={1} body={2}", machineId, (int)resp.StatusCode, text);
                    return;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[DummyCncScheduler] update lastRunKey error: machineId={0} err={1}", machineId, ex.Message);
            }
        }
    }
}
