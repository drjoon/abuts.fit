// change-log:
// - 2026-10-04: v9 — 세션 BusinessAnchorId를 알림 href ba=에 넣음.
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
    internal sealed class AlarmSessionRow
    {
        public string ApiOrigin = "";
        public string AppOrigin = "";
        public string Token = "";
        public bool Enabled = true;
        public HashSet<string> Muted = new HashSet<string>(StringComparer.Ordinal);
        public bool BrowserAlive;
        public long LastHeartbeatTicks;
        public string AlertMode = "receive";
        public string BusinessAnchorId = "";
    }

    internal static class AlarmSession
    {
        private static readonly object Gate = new object();
        private static readonly Dictionary<string, AlarmSessionRow> Rows =
            new Dictionary<string, AlarmSessionRow>(StringComparer.Ordinal);
        private static readonly HashSet<string> Pollers = new HashSet<string>(StringComparer.Ordinal);
        private const int MaxRows = 8;

        public const int HeartbeatExpireMs = 60000;
        public const int PollWaitSec = 25;
        public const int SoundDebounceMs = 900;

        public static string TokenKey(string token)
        {
            var t = (token ?? "").Trim();
            if (t.Length <= 48) return t;
            return t.Substring(0, 24) + t.Substring(t.Length - 24);
        }

        public static void Apply(Dictionary<string, object> body)
        {
            if (body == null) return;
            var token = Str(body, "token");
            if (string.IsNullOrEmpty(token)) return;
            var key = TokenKey(token);
            lock (Gate)
            {
                AlarmSessionRow row;
                if (!Rows.TryGetValue(key, out row) || row == null)
                {
                    row = new AlarmSessionRow();
                }
                row.Token = token;
                var origin = Str(body, "apiOrigin");
                if (!string.IsNullOrEmpty(origin))
                {
                    row.ApiOrigin = origin.Trim().TrimEnd('/');
                }
                var appOrigin = Str(body, "appOrigin");
                if (!string.IsNullOrEmpty(appOrigin))
                {
                    row.AppOrigin = appOrigin.Trim().TrimEnd('/');
                }
                var mode = Str(body, "alertMode").ToLowerInvariant();
                if (mode == "send" || mode == "receive") row.AlertMode = mode;
                var ba = Str(body, "businessAnchorId");
                if (!string.IsNullOrEmpty(ba)) row.BusinessAnchorId = ba;

                object prefsObj;
                if (body.TryGetValue("prefs", out prefsObj) && prefsObj is Dictionary<string, object>)
                {
                    ApplyPrefs(row, (Dictionary<string, object>)prefsObj);
                }

                object aliveObj;
                if (body.TryGetValue("browserAlive", out aliveObj) && aliveObj != null)
                {
                    row.BrowserAlive = IsTruthy(aliveObj);
                }
                row.LastHeartbeatTicks = DateTime.UtcNow.Ticks;
                Rows[key] = row;
                if (Rows.Count > MaxRows)
                {
                    string drop = null;
                    var oldest = long.MaxValue;
                    foreach (var kv in Rows)
                    {
                        if (kv.Key == key) continue;
                        if (kv.Value.LastHeartbeatTicks < oldest)
                        {
                            oldest = kv.Value.LastHeartbeatTicks;
                            drop = kv.Key;
                        }
                    }
                    if (!string.IsNullOrEmpty(drop)) Rows.Remove(drop);
                }
            }
            EnsurePoller(key);
        }

        public static void Clear(string token)
        {
            lock (Gate)
            {
                var t = (token ?? "").Trim();
                if (string.IsNullOrEmpty(t)) Rows.Clear();
                else Rows.Remove(TokenKey(t));
            }
        }

        public static bool ShouldPoll(string key)
        {
            lock (Gate)
            {
                AlarmSessionRow row;
                if (!Rows.TryGetValue(key, out row) || row == null) return false;
                if (!row.Enabled || string.IsNullOrEmpty(row.ApiOrigin) || string.IsNullOrEmpty(row.Token))
                    return false;
                if (!row.BrowserAlive) return true;
                var ageMs = (DateTime.UtcNow.Ticks - row.LastHeartbeatTicks) / TimeSpan.TicksPerMillisecond;
                return ageMs > HeartbeatExpireMs;
            }
        }

        public static bool TrySnapshot(string key, out AlarmSessionRow row)
        {
            lock (Gate)
            {
                AlarmSessionRow found;
                if (Rows.TryGetValue(key, out found) && found != null)
                {
                    row = new AlarmSessionRow
                    {
                        ApiOrigin = found.ApiOrigin,
                        AppOrigin = found.AppOrigin,
                        Token = found.Token,
                        Enabled = found.Enabled,
                        Muted = new HashSet<string>(found.Muted, StringComparer.Ordinal),
                        BrowserAlive = found.BrowserAlive,
                        LastHeartbeatTicks = found.LastHeartbeatTicks,
                        AlertMode = found.AlertMode,
                        BusinessAnchorId = found.BusinessAnchorId,
                    };
                    return true;
                }
            }
            row = null;
            return false;
        }

        public static string FirstApiOrigin()
        {
            lock (Gate)
            {
                foreach (var kv in Rows)
                {
                    if (!string.IsNullOrEmpty(kv.Value.ApiOrigin)) return kv.Value.ApiOrigin;
                }
            }
            return "";
        }

        private static void ApplyPrefs(AlarmSessionRow row, Dictionary<string, object> prefs)
        {
            object en;
            if (prefs.TryGetValue("enabled", out en) && en != null)
            {
                row.Enabled = IsTruthy(en);
            }
            object mutedObj;
            row.Muted = new HashSet<string>(StringComparer.Ordinal);
            if (prefs.TryGetValue("mutedPracticeIds", out mutedObj) && mutedObj is System.Collections.IEnumerable)
            {
                foreach (var item in (System.Collections.IEnumerable)mutedObj)
                {
                    var id = Convert.ToString(item ?? "").Trim();
                    if (!string.IsNullOrEmpty(id)) row.Muted.Add(id);
                }
            }
        }

        private static void EnsurePoller(string key)
        {
            lock (Gate)
            {
                if (Pollers.Contains(key)) return;
                Pollers.Add(key);
            }
            var t = new Thread(() => AlarmPoller.Loop(key)) { IsBackground = true, Name = "alarm-poll" };
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

        public static string HrefFrom(
            Dictionary<string, object> alarm,
            string appOrigin,
            string alertMode,
            string businessAnchorId = "")
        {
            if (alarm == null) return "";
            object tidObj;
            var tid = "";
            if (alarm.TryGetValue("transferId", out tidObj) && tidObj != null)
            {
                tid = Convert.ToString(tidObj).Trim();
            }
            var origin = (appOrigin ?? "").Trim().TrimEnd('/');
            if (!string.IsNullOrEmpty(tid) && !string.IsNullOrEmpty(origin))
            {
                var mode = (alertMode ?? "").Trim() == "send" ? "send" : "receive";
                var href = origin + "/dashboard/practice-transfers?mode=" + mode
                    + "&openTransfer=" + Uri.EscapeDataString(tid);
                var ba = (businessAnchorId ?? "").Trim();
                if (!string.IsNullOrEmpty(ba))
                {
                    href += "&ba=" + Uri.EscapeDataString(ba);
                }
                return href;
            }
            object hrefObj;
            if (alarm.TryGetValue("href", out hrefObj) && hrefObj != null)
            {
                return Convert.ToString(hrefObj).Trim();
            }
            return "";
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
        public static void Loop(string key)
        {
            while (true)
            {
                try
                {
                    if (!AlarmSession.ShouldPoll(key))
                    {
                        Thread.Sleep(2000);
                        continue;
                    }
                    AlarmSessionRow snap;
                    if (!AlarmSession.TrySnapshot(key, out snap) || snap == null)
                    {
                        Thread.Sleep(2000);
                        continue;
                    }
                    if (!snap.Enabled || string.IsNullOrEmpty(snap.ApiOrigin) || string.IsNullOrEmpty(snap.Token))
                    {
                        Thread.Sleep(2000);
                        continue;
                    }
                    int status;
                    var alarm = WaitOnce(snap.ApiOrigin, snap.Token, out status);
                    if (status == 401 || status == 403)
                    {
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
                    if (!string.IsNullOrEmpty(practiceId) && snap.Muted.Contains(practiceId)) continue;
                    var title = "";
                    var body = "";
                    object t, b;
                    if (alarm.TryGetValue("title", out t) && t != null) title = Convert.ToString(t);
                    if (alarm.TryGetValue("body", out b) && b != null) body = Convert.ToString(b);
                    AlarmNotify.Play(
                        title,
                        body,
                        AlarmNotify.HrefFrom(alarm, snap.AppOrigin, snap.AlertMode, snap.BusinessAnchorId));
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
