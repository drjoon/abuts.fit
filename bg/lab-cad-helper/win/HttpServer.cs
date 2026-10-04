// change-log:
// - 2026-10-03: v7 — POST /open-href.
// - 2026-10-04: v15 — /notify soundId 전달.
// - 2026-10-03: v4 — POST /notify · /session · /session/clear (PC 알람).
// - 2026-09-27: v3 HTTP API — health, 작업 폴더(조회·지정·고르기), 케이스 폴더(확인·파일 저장·열기), shutdown.
//   TcpListener로 직접 받는다(HttpListener는 URL 예약에 관리자 권한이 필요).
// related files:
// - bg/lab-cad-helper/win/CaseFolder.cs
// - bg/lab-cad-helper/win/Notify.cs
// - web/frontend/src/shared/files/labHelperClient.ts
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace Abuts.LabHelper
{
    internal sealed class HttpServer
    {
        private const int MaxHeaderBytes = 64 * 1024;
        private const int MaxJsonBytes = 1024 * 1024;
        private const long MaxFileBytes = 4L * 1024 * 1024 * 1024;

        private static readonly string[] DefaultOrigins =
        {
            "https://abuts.fit",
            "https://www.abuts.fit",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        };

        private readonly int _port;
        private TcpListener _listener;
        private volatile bool _running;

        public HttpServer(int port)
        {
            _port = port;
        }

        public bool Start()
        {
            try
            {
                _listener = new TcpListener(IPAddress.Loopback, _port);
                _listener.Start(64);
            }
            catch (SocketException)
            {
                return false;
            }
            _running = true;
            new Thread(AcceptLoop) { IsBackground = true, Name = "accept" }.Start();
            return true;
        }

        public void Stop()
        {
            _running = false;
            try
            {
                _listener.Stop();
            }
            catch
            {
                // ignore
            }
        }

        private void AcceptLoop()
        {
            while (_running)
            {
                TcpClient client;
                try
                {
                    client = _listener.AcceptTcpClient();
                }
                catch
                {
                    if (!_running) return;
                    continue;
                }
                ThreadPool.QueueUserWorkItem(_ => Handle(client));
            }
        }

        private sealed class Request
        {
            public string Method;
            public string Path;
            public Dictionary<string, string> Query = new Dictionary<string, string>();
            public Dictionary<string, string> Headers =
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            public byte[] Leftover;
            public long ContentLength;
            public Stream Stream;

            public string Header(string name)
            {
                string v;
                return Headers.TryGetValue(name, out v) ? v : "";
            }

            public string Q(string name)
            {
                string v;
                return Query.TryGetValue(name, out v) ? v : "";
            }
        }

        private static void Handle(TcpClient client)
        {
            using (client)
            {
                NetworkStream ns;
                try
                {
                    client.ReceiveTimeout = 60000;
                    client.SendTimeout = 60000;
                    ns = client.GetStream();
                }
                catch
                {
                    return;
                }
                var origin = "";
                try
                {
                    var req = ReadRequest(ns);
                    if (req == null) return;
                    origin = req.Header("Origin");
                    if (!string.IsNullOrEmpty(origin) && !IsAllowedOrigin(origin))
                    {
                        SendJson(ns, 403, "", Fail("ORIGIN_NOT_ALLOWED", "허용되지 않은 사이트입니다."));
                        return;
                    }
                    if (req.Method == "OPTIONS")
                    {
                        SendPreflight(ns, origin, req.Header("Access-Control-Request-Headers"));
                        return;
                    }
                    Route(req, ns, origin);
                }
                catch (IOException)
                {
                    // 연결 끊김
                }
                catch (Exception ex)
                {
                    Log.Write("request: " + ex);
                    try
                    {
                        SendJson(ns, 500, origin, Fail("INTERNAL", ex.Message));
                    }
                    catch
                    {
                        // ignore
                    }
                }
            }
        }

        private static void Route(Request req, Stream ns, string origin)
        {
            var key = req.Method + " " + req.Path;
            switch (key)
            {
                case "GET /health":
                    SendJson(ns, 200, origin, Health());
                    return;
                case "GET /work-folder":
                    SendJson(ns, 200, origin, Ok(new Dictionary<string, object>
                    {
                        { "path", Config.WorkFolder },
                        { "exists", CaseFolder.WorkFolderExists(Config.WorkFolder) },
                    }));
                    return;
                case "POST /work-folder":
                {
                    var body = ReadJson(req);
                    var path = CaseFolder.NormalizeWorkFolder(Str(body, "path"));
                    if (!CaseFolder.WorkFolderExists(path))
                    {
                        SendJson(ns, 200, origin, Fail("WORK_FOLDER_NOT_FOUND", "폴더를 찾을 수 없습니다. 주소를 확인해 주세요."));
                        return;
                    }
                    Config.WorkFolder = path;
                    SendJson(ns, 200, origin, Ok(new Dictionary<string, object> { { "path", path } }));
                    return;
                }
                case "POST /work-folder/pick":
                {
                    var body = ReadJson(req);
                    var initial = Str(body, "initial");
                    if (string.IsNullOrEmpty(initial)) initial = Config.WorkFolder;
                    var picked = Ui.Invoke(() => FolderPicker.Pick(initial));
                    if (string.IsNullOrEmpty(picked))
                    {
                        SendJson(ns, 200, origin, Fail("CANCELED", "취소했습니다."));
                        return;
                    }
                    Config.WorkFolder = picked;
                    SendJson(ns, 200, origin, Ok(new Dictionary<string, object> { { "path", picked } }));
                    return;
                }
                case "POST /cases/check":
                {
                    var body = ReadJson(req);
                    string folder;
                    var err = ResolveCase(Str(body, "workFolder"), Str(body, "caseFolder"), out folder);
                    if (err != null)
                    {
                        SendJson(ns, 200, origin, err);
                        return;
                    }
                    var files = ReadFileList(body);
                    var missing = CaseFolder.Missing(folder, files);
                    SendJson(ns, 200, origin, Ok(new Dictionary<string, object>
                    {
                        { "folder", folder },
                        { "exists", Directory.Exists(folder) },
                        { "missing", missing },
                    }));
                    return;
                }
                case "PUT /cases/file":
                {
                    string folder;
                    var err = ResolveCase(req.Q("workFolder"), req.Q("caseFolder"), out folder);
                    if (err != null)
                    {
                        DrainBody(req);
                        SendJson(ns, 200, origin, err);
                        return;
                    }
                    var name = CaseFolder.SafeSegment(req.Q("name"));
                    if (string.IsNullOrEmpty(name))
                    {
                        DrainBody(req);
                        SendJson(ns, 400, origin, Fail("BAD_NAME", "파일 이름이 없습니다."));
                        return;
                    }
                    if (req.ContentLength < 0 || req.ContentLength > MaxFileBytes)
                    {
                        SendJson(ns, 413, origin, Fail("TOO_LARGE", "파일이 너무 큽니다."));
                        return;
                    }
                    CaseFolder.Write(folder, name, req.Leftover, req.Stream, req.ContentLength);
                    SendJson(ns, 200, origin, Ok(new Dictionary<string, object>
                    {
                        { "folder", folder },
                        { "name", name },
                    }));
                    return;
                }
                case "POST /cases/reveal":
                {
                    var body = ReadJson(req);
                    string folder;
                    var err = ResolveCase(Str(body, "workFolder"), Str(body, "caseFolder"), out folder);
                    if (err != null)
                    {
                        SendJson(ns, 200, origin, err);
                        return;
                    }
                    if (!Directory.Exists(folder))
                    {
                        SendJson(ns, 200, origin, Fail("CASE_NOT_FOUND", "케이스 폴더가 없습니다."));
                        return;
                    }
                    SendJson(ns, 200, origin, Ok(new Dictionary<string, object> { { "folder", folder } }));
                    Explorer.Reveal(folder);
                    return;
                }
                case "POST /notify":
                {
                    var body = ReadJson(req);
                    var title = Str(body, "title");
                    var text = Str(body, "body");
                    if (string.IsNullOrEmpty(text)) text = Str(body, "message");
                    SendJson(ns, 200, origin, Ok(new Dictionary<string, object>()));
                    AlarmNotify.Play(title, text, Str(body, "href"), Str(body, "soundId"));
                    return;
                }
                case "POST /open-href":
                {
                    var body = ReadJson(req);
                    AlarmNotify.OpenHref(Str(body, "href"));
                    SendJson(ns, 200, origin, Ok(new Dictionary<string, object> { { "focused", false } }));
                    return;
                }
                case "POST /session":
                {
                    var body = ReadJson(req);
                    AlarmSession.Apply(body);
                    SendJson(ns, 200, origin, Ok(new Dictionary<string, object>()));
                    return;
                }
                case "POST /session/clear":
                {
                    var body = ReadJson(req);
                    AlarmSession.Clear(Str(body, "token"));
                    SendJson(ns, 200, origin, Ok(new Dictionary<string, object>()));
                    return;
                }
                case "POST /shutdown":
                    SendJson(ns, 200, origin, Ok(new Dictionary<string, object>()));
                    Log.Write("shutdown");
                    new Timer(_ => Ui.Quit(), null, 150, Timeout.Infinite);
                    return;
                default:
                    DrainBody(req);
                    SendJson(ns, 404, origin, Fail("NOT_FOUND", "없는 경로입니다."));
                    return;
            }
        }

        private static Dictionary<string, object> ResolveCase(
            string workFolder,
            string caseFolder,
            out string folder)
        {
            folder = null;
            var root = CaseFolder.NormalizeWorkFolder(
                string.IsNullOrEmpty(workFolder) ? Config.WorkFolder : workFolder);
            if (!CaseFolder.WorkFolderExists(root))
            {
                return Fail("WORK_FOLDER_NOT_FOUND", "작업 폴더를 찾을 수 없습니다.");
            }
            var name = CaseFolder.SafeSegment(caseFolder);
            if (string.IsNullOrEmpty(name))
            {
                return Fail("BAD_CASE", "케이스 폴더 이름이 없습니다.");
            }
            if (!string.Equals(root, Config.WorkFolder, StringComparison.OrdinalIgnoreCase))
            {
                Config.WorkFolder = root;
            }
            folder = Path.Combine(root, name);
            return null;
        }

        private static Dictionary<string, object> Health()
        {
            var folder = Config.WorkFolder;
            return Ok(new Dictionary<string, object>
            {
                { "service", "abuts-lab-helper" },
                { "version", Program.Version },
                { "os", "windows" },
                { "port", Program.Port },
                { "workFolder", folder },
                { "workFolderExists", CaseFolder.WorkFolderExists(folder) },
            });
        }

        private static List<KeyValuePair<string, long>> ReadFileList(Dictionary<string, object> body)
        {
            var list = new List<KeyValuePair<string, long>>();
            object raw;
            if (body == null || !body.TryGetValue("files", out raw) || !(raw is System.Collections.IEnumerable)) return list;
            foreach (var item in (System.Collections.IEnumerable)raw)
            {
                var row = item as Dictionary<string, object>;
                if (row == null) continue;
                var name = CaseFolder.SafeSegment(Str(row, "name"));
                if (string.IsNullOrEmpty(name)) continue;
                long size = 0;
                object s;
                if (row.TryGetValue("size", out s) && s != null)
                {
                    long.TryParse(Convert.ToString(s), out size);
                }
                list.Add(new KeyValuePair<string, long>(name, size));
            }
            return list;
        }

        private static bool IsAllowedOrigin(string origin)
        {
            var o = origin.Trim().TrimEnd('/');
            if (DefaultOrigins.Any(d => string.Equals(d, o, StringComparison.OrdinalIgnoreCase))) return true;
            return (Config.AllowOrigin ?? "")
                .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Any(d => string.Equals(d.Trim().TrimEnd('/'), o, StringComparison.OrdinalIgnoreCase));
        }

        private static Request ReadRequest(Stream ns)
        {
            var buf = new byte[8192];
            var acc = new MemoryStream();
            int headerEnd = -1;
            while (headerEnd < 0)
            {
                var n = ns.Read(buf, 0, buf.Length);
                if (n <= 0) return null;
                acc.Write(buf, 0, n);
                if (acc.Length > MaxHeaderBytes) return null;
                headerEnd = IndexOfHeaderEnd(acc.GetBuffer(), (int)acc.Length);
            }
            var all = acc.GetBuffer();
            var total = (int)acc.Length;
            var head = Encoding.UTF8.GetString(all, 0, headerEnd);
            var lines = head.Split(new[] { "\r\n" }, StringSplitOptions.None);
            var first = lines[0].Split(' ');
            if (first.Length < 2) return null;

            var req = new Request { Method = first[0].ToUpperInvariant(), Stream = ns };
            var target = first[1];
            var qIndex = target.IndexOf('?');
            req.Path = (qIndex >= 0 ? target.Substring(0, qIndex) : target).TrimEnd('/');
            if (req.Path == "") req.Path = "/";
            if (qIndex >= 0)
            {
                foreach (var pair in target.Substring(qIndex + 1).Split('&'))
                {
                    if (pair.Length == 0) continue;
                    var eq = pair.IndexOf('=');
                    var k = Unescape(eq >= 0 ? pair.Substring(0, eq) : pair);
                    var v = eq >= 0 ? Unescape(pair.Substring(eq + 1)) : "";
                    req.Query[k] = v;
                }
            }
            for (var i = 1; i < lines.Length; i++)
            {
                var colon = lines[i].IndexOf(':');
                if (colon <= 0) continue;
                req.Headers[lines[i].Substring(0, colon).Trim()] = lines[i].Substring(colon + 1).Trim();
            }
            long len;
            req.ContentLength = long.TryParse(req.Header("Content-Length"), out len) ? len : 0;
            var bodyStart = headerEnd + 4;
            req.Leftover = new byte[total - bodyStart];
            Buffer.BlockCopy(all, bodyStart, req.Leftover, 0, req.Leftover.Length);
            return req;
        }

        private static int IndexOfHeaderEnd(byte[] data, int length)
        {
            for (var i = 3; i < length; i++)
            {
                if (data[i - 3] == '\r' && data[i - 2] == '\n' && data[i - 1] == '\r' && data[i] == '\n')
                {
                    return i - 3;
                }
            }
            return -1;
        }

        private static string Unescape(string value)
        {
            return Uri.UnescapeDataString(value.Replace('+', ' '));
        }

        private static byte[] ReadBody(Request req, int max)
        {
            if (req.ContentLength <= 0) return new byte[0];
            if (req.ContentLength > max) throw new InvalidDataException("요청이 너무 큽니다.");
            var body = new byte[req.ContentLength];
            var have = Math.Min(req.Leftover.Length, body.Length);
            Buffer.BlockCopy(req.Leftover, 0, body, 0, have);
            while (have < body.Length)
            {
                var n = req.Stream.Read(body, have, body.Length - have);
                if (n <= 0) throw new IOException("연결이 끊겼습니다.");
                have += n;
            }
            return body;
        }

        private static void DrainBody(Request req)
        {
            var remaining = req.ContentLength - req.Leftover.Length;
            if (remaining <= 0 || remaining > MaxJsonBytes) return;
            var buf = new byte[8192];
            while (remaining > 0)
            {
                var n = req.Stream.Read(buf, 0, (int)Math.Min(buf.Length, remaining));
                if (n <= 0) return;
                remaining -= n;
            }
        }

        private static Dictionary<string, object> ReadJson(Request req)
        {
            var bytes = ReadBody(req, MaxJsonBytes);
            if (bytes.Length == 0) return new Dictionary<string, object>();
            var text = Encoding.UTF8.GetString(bytes);
            return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(text)
                ?? new Dictionary<string, object>();
        }

        private static string Str(Dictionary<string, object> map, string key)
        {
            object v;
            return map != null && map.TryGetValue(key, out v) && v != null ? Convert.ToString(v).Trim() : "";
        }

        private static Dictionary<string, object> Ok(Dictionary<string, object> data)
        {
            data["ok"] = true;
            return data;
        }

        private static Dictionary<string, object> Fail(string code, string message)
        {
            return new Dictionary<string, object>
            {
                { "ok", false },
                { "code", code },
                { "message", message },
            };
        }

        private static void AppendCors(StringBuilder sb, string origin)
        {
            if (string.IsNullOrEmpty(origin)) return;
            sb.Append("Access-Control-Allow-Origin: ").Append(origin).Append("\r\n");
            sb.Append("Vary: Origin\r\n");
            sb.Append("Access-Control-Allow-Private-Network: true\r\n");
        }

        private static void SendPreflight(Stream ns, string origin, string requestHeaders)
        {
            var sb = new StringBuilder();
            sb.Append("HTTP/1.1 204 No Content\r\n");
            AppendCors(sb, origin);
            sb.Append("Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS\r\n");
            sb.Append("Access-Control-Allow-Headers: ")
                .Append(string.IsNullOrEmpty(requestHeaders) ? "content-type" : requestHeaders)
                .Append("\r\n");
            sb.Append("Access-Control-Max-Age: 600\r\n");
            sb.Append("Content-Length: 0\r\nConnection: close\r\n\r\n");
            var bytes = Encoding.ASCII.GetBytes(sb.ToString());
            ns.Write(bytes, 0, bytes.Length);
        }

        private static void SendJson(Stream ns, int status, string origin, object body)
        {
            var payload = Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(body));
            var sb = new StringBuilder();
            sb.Append("HTTP/1.1 ").Append(status).Append(' ').Append(Reason(status)).Append("\r\n");
            AppendCors(sb, origin);
            sb.Append("Content-Type: application/json; charset=utf-8\r\n");
            sb.Append("Cache-Control: no-store\r\n");
            sb.Append("Content-Length: ").Append(payload.Length).Append("\r\n");
            sb.Append("Connection: close\r\n\r\n");
            var head = Encoding.ASCII.GetBytes(sb.ToString());
            ns.Write(head, 0, head.Length);
            ns.Write(payload, 0, payload.Length);
            ns.Flush();
        }

        private static string Reason(int status)
        {
            switch (status)
            {
                case 200: return "OK";
                case 204: return "No Content";
                case 400: return "Bad Request";
                case 403: return "Forbidden";
                case 404: return "Not Found";
                case 413: return "Payload Too Large";
                default: return "Error";
            }
        }
    }
}
