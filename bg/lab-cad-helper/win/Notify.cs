// change-log:
// - 2026-10-03: v6 — 401/403 백오프·Cache-Control no-cache(빈 wait 304 방지).
// - 2026-10-03: v4 PC 알람 — SystemSounds + tray balloon. 세션·장기 폴링으로 브라우저 종료 후에도 울림.
// related files:
// - bg/lab-cad-helper/win/HttpServer.cs
// - bg/lab-cad-helper/win/Program.cs
// - web/frontend/src/shared/files/labHelperClient.ts
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Media;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Abuts.LabHelper
{
    internal static class AlarmSession
    {
        private static readonly object Gate = new object();
        private static string _apiOrigin = "";
        private static string _appOrigin = "";
        private static string _token = "";
        private static bool _enabled = true;
        private static HashSet<string> _muted = new HashSet<string>(StringComparer.Ordinal);
        private static bool _browserAlive;
        private static long _lastHeartbeatTicks;
        private static bool _pollRunning;

        public const int HeartbeatExpireMs = 60000;
        public const int PollWaitSec = 25;
        public const int SoundDebounceMs = 900;

        public static void Apply(Dictionary<string, object> body)
        {
            if (body == null) return;
            lock (Gate)
            {
                var origin = Str(body, "apiOrigin");
                if (!string.IsNullOrEmpty(origin))
                {
                    _apiOrigin = origin.Trim().TrimEnd('/');
                }
                var appOrigin = Str(body, "appOrigin");
                if (!string.IsNullOrEmpty(appOrigin))
                {
                    _appOrigin = appOrigin.Trim().TrimEnd('/');
                }
                var token = Str(body, "token");
                if (!string.IsNullOrEmpty(token)) _token = token;

                object prefsObj;
                if (body.TryGetValue("prefs", out prefsObj) && prefsObj is Dictionary<string, object>)
                {
                    ApplyPrefs((Dictionary<string, object>)prefsObj);
                }

                object aliveObj;
                if (body.TryGetValue("browserAlive", out aliveObj) && aliveObj != null)
                {
                    _browserAlive = IsTruthy(aliveObj);
                }
                _lastHeartbeatTicks = DateTime.UtcNow.Ticks;
            }
            EnsurePoller();
        }

        public static void Clear()
        {
            lock (Gate)
            {
                _apiOrigin = "";
                _appOrigin = "";
                _token = "";
                _browserAlive = false;
                _lastHeartbeatTicks = 0;
            }
        }

        public static bool ShouldPoll()
        {
            lock (Gate)
            {
                if (string.IsNullOrEmpty(_apiOrigin) || string.IsNullOrEmpty(_token)) return false;
                if (!_browserAlive) return true;
                var ageMs = (DateTime.UtcNow.Ticks - _lastHeartbeatTicks) / TimeSpan.TicksPerMillisecond;
                return ageMs > HeartbeatExpireMs;
            }
        }

        public static void Snapshot(
            out string apiOrigin,
            out string appOrigin,
            out string token,
            out bool enabled,
            out HashSet<string> muted)
        {
            lock (Gate)
            {
                apiOrigin = _apiOrigin;
                appOrigin = _appOrigin;
                token = _token;
                enabled = _enabled;
                muted = new HashSet<string>(_muted, StringComparer.Ordinal);
            }
        }

        public static bool IsPracticeMuted(string practiceId)
        {
            var id = (practiceId ?? "").Trim();
            lock (Gate)
            {
                if (!_enabled) return true;
                if (string.IsNullOrEmpty(id)) return false;
                return _muted.Contains(id);
            }
        }

        private static void ApplyPrefs(Dictionary<string, object> prefs)
        {
            object en;
            if (prefs.TryGetValue("enabled", out en) && en != null)
            {
                _enabled = IsTruthy(en);
            }
            object mutedObj;
            _muted = new HashSet<string>(StringComparer.Ordinal);
            if (prefs.TryGetValue("mutedPracticeIds", out mutedObj) && mutedObj is System.Collections.IEnumerable)
            {
                foreach (var item in (System.Collections.IEnumerable)mutedObj)
                {
                    var id = Convert.ToString(item ?? "").Trim();
                    if (!string.IsNullOrEmpty(id)) _muted.Add(id);
                }
            }
        }

        private static void EnsurePoller()
        {
            lock (Gate)
            {
                if (_pollRunning) return;
                _pollRunning = true;
            }
            var t = new Thread(AlarmPoller.Loop) { IsBackground = true, Name = "alarm-poll" };
            t.Start();
        }

        private static string Str(Dictionary<string, object> body, string key)
        {
            object v;
            return body != null && body.TryGetValue(key, out v) && v != null
                ? Convert.ToString(v).Trim()
                : "";
        }

        private static bool IsTruthy(object v)
        {
            if (v is bool) return (bool)v;
            var s = Convert.ToString(v).Trim().ToLowerInvariant();
            return s == "true" || s == "1" || s == "yes";
        }
    }

    internal static class AlarmNotify
    {
        private static readonly object Gate = new object();
        private static long _lastPlayedMs;
        private static NotifyIcon _tray;

        public static void Play(string title, string body, string href = "")
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            lock (Gate)
            {
                if (now - _lastPlayedMs < AlarmSession.SoundDebounceMs) return;
                _lastPlayedMs = now;
            }
            try
            {
                SystemSounds.Asterisk.Play();
            }
            catch (Exception ex)
            {
                Log.Write("sound: " + ex.Message);
            }
            ShowBalloon(title, body, href);
        }

        public static string HrefFrom(Dictionary<string, object> alarm, string appOrigin)
        {
            if (alarm == null) return "";
            object hrefObj;
            if (alarm.TryGetValue("href", out hrefObj) && hrefObj != null)
            {
                var href = Convert.ToString(hrefObj).Trim();
                if (!string.IsNullOrEmpty(href)) return href;
            }
            object tidObj;
            var tid = "";
            if (alarm.TryGetValue("transferId", out tidObj) && tidObj != null)
            {
                tid = Convert.ToString(tidObj).Trim();
            }
            var origin = (appOrigin ?? "").Trim().TrimEnd('/');
            if (string.IsNullOrEmpty(tid) || string.IsNullOrEmpty(origin)) return "";
            return origin + "/dashboard/practice-transfers?mode=receive&openTransfer=" + Uri.EscapeDataString(tid);
        }

        private static string _pendingHref = "";

        private static void ShowBalloon(string title, string body, string href)
        {
            try
            {
                Ui.Invoke(() =>
                {
                    EnsureTray();
                    _pendingHref = (href ?? "").Trim();
                    var t = string.IsNullOrEmpty(title) ? Program.Title : title;
                    var b = string.IsNullOrEmpty(body) ? "새 알림" : body;
                    _tray.BalloonTipTitle = t.Length > 60 ? t.Substring(0, 60) : t;
                    _tray.BalloonTipText = b.Length > 240 ? b.Substring(0, 240) : b;
                    _tray.BalloonTipIcon = ToolTipIcon.Info;
                    _tray.Visible = true;
                    _tray.ShowBalloonTip(4000);
                    return 0;
                });
            }
            catch (Exception ex)
            {
                Log.Write("balloon: " + ex.Message);
            }
        }

        internal static void OpenHref(string raw)
        {
            var href = (raw ?? "").Trim();
            if (string.IsNullOrEmpty(href)) return;
            Uri uri;
            if (!Uri.TryCreate(href, UriKind.Absolute, out uri)) return;
            var scheme = (uri.Scheme ?? "").ToLowerInvariant();
            if (scheme != "http" && scheme != "https") return;
            try
            {
                System.Diagnostics.Process.Start(href);
            }
            catch (Exception ex)
            {
                Log.Write("open href: " + ex.Message);
            }
        }

        private static void EnsureTray()
        {
            if (_tray != null) return;
            _tray = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = Program.Title,
                Visible = false,
            };
            _tray.BalloonTipClicked += (_, __) => OpenHref(_pendingHref);
        }
    }

    internal static class AlarmPoller
    {
        public static void Loop()
        {
            while (true)
            {
                try
                {
                    if (!AlarmSession.ShouldPoll())
                    {
                        Thread.Sleep(2000);
                        continue;
                    }
                    string apiOrigin;
                    string appOrigin;
                    string token;
                    bool enabled;
                    HashSet<string> muted;
                    AlarmSession.Snapshot(out apiOrigin, out appOrigin, out token, out enabled, out muted);
                    if (!enabled || string.IsNullOrEmpty(apiOrigin) || string.IsNullOrEmpty(token))
                    {
                        Thread.Sleep(2000);
                        continue;
                    }
                    int status;
                    var alarm = WaitOnce(apiOrigin, token, out status);
                    if (status == 401 || status == 403)
                    {
                        // 잘못된·만료 토큰 — 브라우저 세션 갱신까지 대기(스팸 방지).
                        Log.Write("poll auth " + status);
                        Thread.Sleep(15000);
                        continue;
                    }
                    if (alarm == null)
                    {
                        Thread.Sleep(500);
                        continue;
                    }
                    var practiceId = "";
                    object pid;
                    if (alarm.TryGetValue("practiceBusinessAnchorId", out pid) && pid != null)
                    {
                        practiceId = Convert.ToString(pid).Trim();
                    }
                    if (AlarmSession.IsPracticeMuted(practiceId)) continue;
                    var title = "";
                    var body = "";
                    object t, b;
                    if (alarm.TryGetValue("title", out t) && t != null) title = Convert.ToString(t);
                    if (alarm.TryGetValue("body", out b) && b != null) body = Convert.ToString(b);
                    AlarmNotify.Play(title, body, AlarmNotify.HrefFrom(alarm, appOrigin));
                }
                catch (Exception ex)
                {
                    Log.Write("poll: " + ex.Message);
                    Thread.Sleep(3000);
                }
            }
        }

        private static Dictionary<string, object> WaitOnce(string apiOrigin, string token, out int statusCode)
        {
            statusCode = 0;
            var url = apiOrigin + "/api/lab-helper/alarms/wait?wait=" + AlarmSession.PollWaitSec;
            HttpWebRequest req;
            try
            {
                req = (HttpWebRequest)WebRequest.Create(url);
            }
            catch
            {
                return null;
            }
            req.Method = "GET";
            req.Timeout = (AlarmSession.PollWaitSec + 10) * 1000;
            req.ReadWriteTimeout = (AlarmSession.PollWaitSec + 10) * 1000;
            req.Headers[HttpRequestHeader.Authorization] = "Bearer " + token;
            req.Accept = "application/json";
            req.UserAgent = "AbutsLabHelper/" + Program.Version;
            // 장기 폴링은 캐시하면 안 됨(동일 빈 응답 304).
            req.Headers[HttpRequestHeader.CacheControl] = "no-cache";
            try
            {
                using (var res = (HttpWebResponse)req.GetResponse())
                using (var stream = res.GetResponseStream())
                using (var reader = new StreamReader(stream ?? Stream.Null, Encoding.UTF8))
                {
                    statusCode = (int)res.StatusCode;
                    if (statusCode != 200) return null;
                    var text = reader.ReadToEnd();
                    if (string.IsNullOrWhiteSpace(text)) return null;
                    var map = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(text);
                    if (map == null) return null;
                    object ok;
                    if (map.TryGetValue("ok", out ok) && ok is bool && !(bool)ok) return null;
                    object alarm;
                    if (map.TryGetValue("alarm", out alarm) && alarm is Dictionary<string, object>)
                    {
                        return (Dictionary<string, object>)alarm;
                    }
                    // 빈 wait (timeout) — alarm 없음
                    return null;
                }
            }
            catch (WebException wex)
            {
                var res = wex.Response as HttpWebResponse;
                if (res != null)
                {
                    statusCode = (int)res.StatusCode;
                    if (statusCode == 204) return null;
                }
                return null;
            }
        }
    }
}
