// change-log:
// - 2026-10-04: v15 — 플랫폼 alert 토스트 룩 + 알림음 샘플(soundId)·WAV 합성.
// - 2026-10-04: v14 — PC 알람을 서버 WS(/api/lab-helper/alarms/ws)로. 롱폴링 제거.
// - 2026-10-04: v13 — 버전 맞춤(Mac open-href ba 매칭). Windows는 탭 탐색 없음·FE 가드.
// - 2026-10-04: v12 — 커스텀 플로팅 토스트(보기)로 balloon 대체.
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
using System.Net.WebSockets;
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
        public string SoundId = "chime";
    }

    internal static class AlarmSession
    {
        private static readonly object Gate = new object();
        private static readonly Dictionary<string, AlarmSessionRow> Rows =
            new Dictionary<string, AlarmSessionRow>(StringComparer.Ordinal);
        private static readonly HashSet<string> SocketLoops = new HashSet<string>(StringComparer.Ordinal);
        private const int MaxRows = 8;

        public const int HeartbeatExpireMs = 60000;
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
            EnsureSocketLoop(key);
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

        /** 포커스 없는 계정만 OS 알람 소켓을 유지한다. */
        public static bool ShouldListen(string key)
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
                        SoundId = found.SoundId,
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

        public static string FirstAppOrigin()
        {
            lock (Gate)
            {
                foreach (var kv in Rows)
                {
                    if (!string.IsNullOrEmpty(kv.Value.AppOrigin)) return kv.Value.AppOrigin;
                }
            }
            return "";
        }

        public static string PreferredSoundId()
        {
            lock (Gate)
            {
                foreach (var kv in Rows)
                {
                    if (!string.IsNullOrEmpty(kv.Value.SoundId)) return kv.Value.SoundId;
                }
            }
            return "chime";
        }

        private static void ApplyPrefs(AlarmSessionRow row, Dictionary<string, object> prefs)
        {
            object en;
            if (prefs.TryGetValue("enabled", out en) && en != null)
            {
                row.Enabled = IsTruthy(en);
            }
            object soundObj;
            if (prefs.TryGetValue("soundId", out soundObj) && soundObj != null)
            {
                row.SoundId = AlarmSound.NormalizeId(Convert.ToString(soundObj));
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

        private static void EnsureSocketLoop(string key)
        {
            lock (Gate)
            {
                if (SocketLoops.Contains(key)) return;
                SocketLoops.Add(key);
            }
            var t = new Thread(() => AlarmSocket.Loop(key)) { IsBackground = true, Name = "alarm-ws" };
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

    /// <summary>웹 chatNotifySounds.ts 와 같은 id·톤 스케치로 WAV 합성.</summary>
    internal static class AlarmSound
    {
        private sealed class Note
        {
            public double Freq;
            public double When;
            public double Dur;
            public double Peak;
            public Note(double freq, double when, double dur, double peak)
            {
                Freq = freq;
                When = when;
                Dur = dur;
                Peak = peak;
            }
        }

        public static string NormalizeId(string raw)
        {
            var id = (raw ?? "").Trim().ToLowerInvariant();
            if (id == "sparkle" || id == "drop" || id == "bell" || id == "breeze") return id;
            return "chime";
        }

        private static Note[] NotesFor(string soundId)
        {
            switch (NormalizeId(soundId))
            {
                case "sparkle":
                    return new[]
                    {
                        new Note(2093.0, 0, 0.09, 0.15),
                        new Note(2637.02, 0.05, 0.11, 0.12),
                        new Note(3135.96, 0.1, 0.22, 0.1),
                    };
                case "drop":
                    return new[]
                    {
                        new Note(1174.66, 0, 0.2, 0.22),
                        new Note(880.0, 0.11, 0.34, 0.1),
                    };
                case "bell":
                    return new[]
                    {
                        new Note(1318.51, 0, 0.34, 0.17),
                        new Note(1975.53, 0.02, 0.4, 0.11),
                    };
                case "breeze":
                    return new[]
                    {
                        new Note(987.77, 0, 0.16, 0.13),
                        new Note(1480.0, 0.08, 0.2, 0.15),
                        new Note(1760.0, 0.17, 0.3, 0.1),
                    };
                default:
                    return new[]
                    {
                        new Note(1567.98, 0, 0.15, 0.2),
                        new Note(2349.32, 0.07, 0.28, 0.14),
                    };
            }
        }

        public static void Play(string soundId)
        {
            try
            {
                var wav = BuildWav(NotesFor(soundId));
                var t = new Thread(() =>
                {
                    try
                    {
                        using (var ms = new MemoryStream(wav))
                        using (var player = new SoundPlayer(ms))
                        {
                            player.PlaySync();
                        }
                    }
                    catch (Exception ex)
                    {
                        Log.Write("sound play: " + ex.Message);
                    }
                })
                { IsBackground = true, Name = "alarm-sound" };
                t.Start();
            }
            catch (Exception ex)
            {
                Log.Write("sound: " + ex.Message);
                try { SystemSounds.Asterisk.Play(); } catch { }
            }
        }

        private static byte[] BuildWav(Note[] notes)
        {
            const int sampleRate = 44100;
            var end = 0.05;
            for (var i = 0; i < notes.Length; i++)
            {
                var e = notes[i].When + notes[i].Dur + 0.02;
                if (e > end) end = e;
            }
            var count = (int)(end * sampleRate);
            if (count < 1) count = 1;
            var samples = new short[count];
            for (var n = 0; n < notes.Length; n++)
            {
                var note = notes[n];
                var start = (int)(note.When * sampleRate);
                var len = (int)(note.Dur * sampleRate);
                for (var i = 0; i < len; i++)
                {
                    var idx = start + i;
                    if (idx < 0 || idx >= count) continue;
                    var t = i / (double)sampleRate;
                    var env = Math.Exp(-t * (4.2 / Math.Max(0.05, note.Dur)));
                    var amp = note.Peak * env;
                    var phase = 2.0 * Math.PI * note.Freq * t;
                    var v = amp * (
                        Math.Sin(phase) +
                        0.18 * Math.Sin(phase * 2) +
                        0.05 * Math.Sin(phase * 3));
                    var mixed = samples[idx] / 32767.0 + v;
                    if (mixed > 0.98) mixed = 0.98;
                    if (mixed < -0.98) mixed = -0.98;
                    samples[idx] = (short)(mixed * 32767.0);
                }
            }

            var dataBytes = count * 2;
            var wav = new byte[44 + dataBytes];
            WriteAscii(wav, 0, "RIFF");
            WriteInt32(wav, 4, 36 + dataBytes);
            WriteAscii(wav, 8, "WAVE");
            WriteAscii(wav, 12, "fmt ");
            WriteInt32(wav, 16, 16);
            WriteInt16(wav, 20, 1);
            WriteInt16(wav, 22, 1);
            WriteInt32(wav, 24, sampleRate);
            WriteInt32(wav, 28, sampleRate * 2);
            WriteInt16(wav, 32, 2);
            WriteInt16(wav, 34, 16);
            WriteAscii(wav, 36, "data");
            WriteInt32(wav, 40, dataBytes);
            Buffer.BlockCopy(samples, 0, wav, 44, dataBytes);
            return wav;
        }

        private static void WriteAscii(byte[] buf, int offset, string s)
        {
            var bytes = Encoding.ASCII.GetBytes(s);
            Buffer.BlockCopy(bytes, 0, buf, offset, bytes.Length);
        }

        private static void WriteInt16(byte[] buf, int offset, short v)
        {
            buf[offset] = (byte)(v & 0xff);
            buf[offset + 1] = (byte)((v >> 8) & 0xff);
        }

        private static void WriteInt32(byte[] buf, int offset, int v)
        {
            buf[offset] = (byte)(v & 0xff);
            buf[offset + 1] = (byte)((v >> 8) & 0xff);
            buf[offset + 2] = (byte)((v >> 16) & 0xff);
            buf[offset + 3] = (byte)((v >> 24) & 0xff);
        }
    }

    internal static class AlarmNotify
    {
        private static readonly object Gate = new object();
        private static long _lastPlayedMs;

        public static void Play(string title, string body, string href = "", string soundId = "")
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            lock (Gate)
            {
                if (now - _lastPlayedMs < AlarmSession.SoundDebounceMs) return;
                _lastPlayedMs = now;
            }
            var id = string.IsNullOrWhiteSpace(soundId)
                ? AlarmSession.PreferredSoundId()
                : AlarmSound.NormalizeId(soundId);
            AlarmSound.Play(id);
            ShowToast(title, body, href);
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

        private static Form _toastForm;
        private static System.Windows.Forms.Timer _toastTimer;

        private static void ShowToast(string title, string body, string href)
        {
            try
            {
                Ui.Invoke(() =>
                {
                    PresentToast(
                        string.IsNullOrEmpty(title) ? "어벗츠" : title,
                        string.IsNullOrEmpty(body) ? "새 알림" : body,
                        (href ?? "").Trim());
                    return 0;
                });
            }
            catch (Exception ex)
            {
                Log.Write("toast: " + ex.Message);
            }
        }

        private static void PresentToast(string title, string body, string href)
        {
            if (_toastTimer != null)
            {
                _toastTimer.Stop();
                _toastTimer.Dispose();
                _toastTimer = null;
            }
            if (_toastForm != null)
            {
                try { _toastForm.Close(); } catch { }
                _toastForm = null;
            }

            // 웹 alert 토스트: soft sky card · 그라데이션 액센트 · soft 보기 버튼
            var sky = Color.FromArgb(56, 189, 248);       // sky-400
            var primary = Color.FromArgb(37, 99, 235);    // primary
            var indigo = Color.FromArgb(99, 102, 241);    // indigo-500
            var skySoft = Color.FromArgb(240, 249, 255);  // sky-50
            var skyBorder = Color.FromArgb(186, 230, 253);
            var skyText = Color.FromArgb(3, 105, 161);    // sky-700

            var form = new Form
            {
                FormBorderStyle = FormBorderStyle.None,
                ShowInTaskbar = false,
                TopMost = true,
                StartPosition = FormStartPosition.Manual,
                Size = new Size(372, 96),
                BackColor = Color.White,
                Padding = new Padding(0),
            };
            form.Region = Region.FromHrgn(CreateRoundRectRgn(0, 0, form.Width + 1, form.Height + 1, 18, 18));
            form.Paint += (_, e) =>
            {
                using (var brush = new System.Drawing.Drawing2D.LinearGradientBrush(
                    form.ClientRectangle,
                    Color.White,
                    skySoft,
                    135f))
                {
                    e.Graphics.FillRectangle(brush, form.ClientRectangle);
                }
                using (var pen = new Pen(Color.FromArgb(180, skyBorder), 1f))
                {
                    e.Graphics.DrawRectangle(pen, 0, 0, form.Width - 1, form.Height - 1);
                }
            };

            var accent = new Panel
            {
                Dock = DockStyle.Left,
                Width = 4,
            };
            accent.Paint += (_, e) =>
            {
                using (var brush = new System.Drawing.Drawing2D.LinearGradientBrush(
                    accent.ClientRectangle,
                    sky,
                    indigo,
                    90f))
                {
                    var blend = new System.Drawing.Drawing2D.ColorBlend(3);
                    blend.Colors = new[] { sky, primary, indigo };
                    blend.Positions = new[] { 0f, 0.5f, 1f };
                    brush.InterpolationColors = blend;
                    e.Graphics.FillRectangle(brush, accent.ClientRectangle);
                }
            };
            form.Controls.Add(accent);

            var badge = new Panel
            {
                Size = new Size(40, 40),
                Location = new Point(16, 28),
            };
            badge.Paint += (_, e) =>
            {
                e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                var rect = new Rectangle(0, 0, badge.Width - 1, badge.Height - 1);
                using (var path = RoundedRect(rect, 14))
                using (var brush = new System.Drawing.Drawing2D.LinearGradientBrush(
                    rect, sky, primary, 135f))
                {
                    e.Graphics.FillPath(brush, path);
                }
                using (var font = new Font("Segoe UI", 11f, FontStyle.Bold))
                using (var sf = new StringFormat
                {
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center,
                })
                {
                    e.Graphics.DrawString("A", font, Brushes.White, rect, sf);
                }
            };
            form.Controls.Add(badge);

            var titleLbl = new Label
            {
                Text = title,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(15, 23, 42),
                BackColor = Color.Transparent,
                AutoEllipsis = true,
                Location = new Point(66, 26),
                Size = new Size(200, 22),
            };
            form.Controls.Add(titleLbl);

            var bodyLbl = new Label
            {
                Text = body,
                Font = new Font("Segoe UI", 8.75f, FontStyle.Regular),
                ForeColor = Color.FromArgb(100, 116, 139),
                BackColor = Color.Transparent,
                AutoEllipsis = true,
                Location = new Point(66, 50),
                Size = new Size(200, 20),
            };
            form.Controls.Add(bodyLbl);

            var viewBtn = new Button
            {
                Text = "보기",
                Font = new Font("Segoe UI", 8.75f, FontStyle.Bold),
                ForeColor = skyText,
                BackColor = skySoft,
                FlatStyle = FlatStyle.Flat,
                Size = new Size(58, 32),
                Location = new Point(276, 32),
                Cursor = Cursors.Hand,
            };
            viewBtn.FlatAppearance.BorderColor = skyBorder;
            viewBtn.FlatAppearance.BorderSize = 1;
            viewBtn.Region = Region.FromHrgn(CreateRoundRectRgn(0, 0, viewBtn.Width + 1, viewBtn.Height + 1, 16, 16));
            viewBtn.Click += (_, __) =>
            {
                try { form.Close(); } catch { }
                OpenHref(href);
            };
            form.Controls.Add(viewBtn);

            var closeBtn = new Button
            {
                Text = "✕",
                Font = new Font("Segoe UI", 8f),
                ForeColor = Color.FromArgb(148, 163, 184),
                BackColor = Color.Transparent,
                FlatStyle = FlatStyle.Flat,
                Size = new Size(24, 24),
                Location = new Point(340, 8),
                Cursor = Cursors.Hand,
            };
            closeBtn.FlatAppearance.BorderSize = 0;
            closeBtn.FlatAppearance.MouseOverBackColor = Color.FromArgb(15, 15, 23, 42);
            closeBtn.Click += (_, __) =>
            {
                try { form.Close(); } catch { }
            };
            form.Controls.Add(closeBtn);

            var wa = Screen.PrimaryScreen.WorkingArea;
            form.Location = new Point(wa.Right - form.Width - 20, wa.Top + 20);
            form.Show();
            _toastForm = form;

            _toastTimer = new System.Windows.Forms.Timer { Interval = 8000 };
            _toastTimer.Tick += (_, __) =>
            {
                _toastTimer.Stop();
                try { form.Close(); } catch { }
            };
            _toastTimer.Start();
        }

        private static System.Drawing.Drawing2D.GraphicsPath RoundedRect(Rectangle bounds, int radius)
        {
            var path = new System.Drawing.Drawing2D.GraphicsPath();
            var d = radius * 2;
            path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
            path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
            path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        [System.Runtime.InteropServices.DllImport("gdi32.dll", SetLastError = true)]
        private static extern IntPtr CreateRoundRectRgn(
            int nLeftRect, int nTopRect, int nRightRect, int nBottomRect,
            int nWidthEllipse, int nHeightEllipse);

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
    }

    internal static class AlarmSocket
    {
        private const int PingIntervalMs = 20000;
        private const int RecvBufferBytes = 8192;

        public static void Loop(string key)
        {
            while (true)
            {
                try
                {
                    if (!AlarmSession.ShouldListen(key))
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
                    RunSession(key, snap);
                }
                catch (Exception ex)
                {
                    Log.Write("alarm-ws: " + ex.Message);
                    Thread.Sleep(3000);
                }
            }
        }

        private static void RunSession(string key, AlarmSessionRow snap)
        {
            Uri uri;
            if (!TryWsUri(snap.ApiOrigin, out uri))
            {
                Thread.Sleep(3000);
                return;
            }

            using (var ws = new ClientWebSocket())
            {
                ws.Options.SetRequestHeader("Authorization", "Bearer " + snap.Token);
                ws.Options.SetRequestHeader("User-Agent", "AbutsLabHelper/" + Program.Version);
                try
                {
                    ws.ConnectAsync(uri, CancellationToken.None).GetAwaiter().GetResult();
                }
                catch (Exception ex)
                {
                    Log.Write("alarm-ws connect: " + ex.Message);
                    Thread.Sleep(5000);
                    return;
                }

                var ser = new JavaScriptSerializer();
                var buffer = new byte[RecvBufferBytes];
                var stopWatch = false;
                var watcher = new Thread(() =>
                {
                    var lastPing = DateTime.UtcNow;
                    while (!stopWatch && ws.State == WebSocketState.Open)
                    {
                        if (!AlarmSession.ShouldListen(key))
                        {
                            try { ws.Abort(); } catch { }
                            break;
                        }
                        AlarmSessionRow cur;
                        if (!AlarmSession.TrySnapshot(key, out cur) || cur == null
                            || cur.Token != snap.Token || cur.ApiOrigin != snap.ApiOrigin)
                        {
                            try { ws.Abort(); } catch { }
                            break;
                        }
                        if ((DateTime.UtcNow - lastPing).TotalMilliseconds >= PingIntervalMs)
                        {
                            SendText(ws, "{\"type\":\"ping\"}");
                            lastPing = DateTime.UtcNow;
                        }
                        Thread.Sleep(500);
                    }
                })
                { IsBackground = true, Name = "alarm-ws-watch" };
                watcher.Start();

                try
                {
                    while (ws.State == WebSocketState.Open)
                    {
                        string text;
                        if (!TryReceiveText(ws, buffer, out text)) break;
                        if (string.IsNullOrWhiteSpace(text)) continue;

                        Dictionary<string, object> map;
                        try
                        {
                            map = ser.Deserialize<Dictionary<string, object>>(text);
                        }
                        catch
                        {
                            continue;
                        }
                        if (map == null) continue;

                        var type = "";
                        object typeObj;
                        if (map.TryGetValue("type", out typeObj) && typeObj != null)
                            type = Convert.ToString(typeObj).Trim();

                        if (type == "ready" || type == "pong") continue;
                        if (type != "alarm") continue;

                        object alarmObj;
                        if (!map.TryGetValue("alarm", out alarmObj) || !(alarmObj is Dictionary<string, object>))
                            continue;
                        var alarm = (Dictionary<string, object>)alarmObj;

                        AlarmSessionRow latest;
                        if (!AlarmSession.TrySnapshot(key, out latest) || latest == null) break;
                        var practiceId = "";
                        object pid;
                        if (alarm.TryGetValue("practiceBusinessAnchorId", out pid) && pid != null)
                            practiceId = Convert.ToString(pid).Trim();
                        if (!string.IsNullOrEmpty(practiceId) && latest.Muted.Contains(practiceId)) continue;

                        var title = "";
                        var body = "";
                        object t, b;
                        if (alarm.TryGetValue("title", out t) && t != null) title = Convert.ToString(t);
                        if (alarm.TryGetValue("body", out b) && b != null) body = Convert.ToString(b);
                        AlarmNotify.Play(
                            title,
                            body,
                            AlarmNotify.HrefFrom(alarm, latest.AppOrigin, latest.AlertMode, latest.BusinessAnchorId),
                            latest.SoundId);
                    }
                }
                finally
                {
                    stopWatch = true;
                    try
                    {
                        if (ws.State == WebSocketState.Open || ws.State == WebSocketState.CloseReceived)
                        {
                            ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None)
                                .GetAwaiter().GetResult();
                        }
                    }
                    catch
                    {
                        try { ws.Abort(); } catch { }
                    }
                }
            }

            Thread.Sleep(500);
        }

        private static bool TryWsUri(string apiOrigin, out Uri uri)
        {
            uri = null;
            var origin = (apiOrigin ?? "").Trim().TrimEnd('/');
            if (string.IsNullOrEmpty(origin)) return false;
            if (origin.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                origin = "wss://" + origin.Substring("https://".Length);
            else if (origin.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                origin = "ws://" + origin.Substring("http://".Length);
            else
                return false;
            return Uri.TryCreate(origin + "/api/lab-helper/alarms/ws", UriKind.Absolute, out uri);
        }

        private static void SendText(ClientWebSocket ws, string text)
        {
            if (ws == null || ws.State != WebSocketState.Open) return;
            var bytes = Encoding.UTF8.GetBytes(text ?? "");
            try
            {
                ws.SendAsync(
                    new ArraySegment<byte>(bytes),
                    WebSocketMessageType.Text,
                    true,
                    CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                Log.Write("alarm-ws send: " + ex.Message);
            }
        }

        /// <summary>한 텍스트 메시지. 감시 스레드가 Abort하면 false.</summary>
        private static bool TryReceiveText(ClientWebSocket ws, byte[] buffer, out string text)
        {
            text = null;
            if (ws == null || ws.State != WebSocketState.Open) return false;
            using (var ms = new MemoryStream())
            {
                try
                {
                    WebSocketReceiveResult result;
                    do
                    {
                        result = ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None)
                            .GetAwaiter().GetResult();
                        if (result.MessageType == WebSocketMessageType.Close) return false;
                        if (result.Count > 0) ms.Write(buffer, 0, result.Count);
                    } while (!result.EndOfMessage);

                    if (result.MessageType != WebSocketMessageType.Text) return true;
                    text = Encoding.UTF8.GetString(ms.ToArray());
                    return true;
                }
                catch (Exception ex)
                {
                    if (ws.State != WebSocketState.Open) return false;
                    Log.Write("alarm-ws recv: " + ex.Message);
                    return false;
                }
            }
        }
    }
}
