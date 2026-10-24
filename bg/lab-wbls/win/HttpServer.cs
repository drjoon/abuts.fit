// change-log:
// - 2026-10-24: /health · /printers · /print-png · /shutdown. 루프백만 수신.
// related files:
// - bg/lab-wbls/win/LabelPrint.cs
// - bg/lab-wbls/win/Program.cs
// - web/frontend/src/shared/lab/labWblsClient.ts
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Abuts.LabWbls
{
    internal sealed class HttpServer
    {
        private const int MaxHeaderBytes = 64 * 1024;
        private const int MaxJsonBytes = 12 * 1024 * 1024;

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
                _listener.Start(16);
            }
            catch (SocketException)
            {
                return false;
            }
            _running = true;
            new Thread(AcceptLoop) { IsBackground = true, Name = "lab-wbls" }.Start();
            return true;
        }

        public void Stop()
        {
            _running = false;
            try { _listener.Stop(); } catch { }
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
                        SendJson(ns, 403, "", Fail("허용되지 않은 사이트입니다."));
                        return;
                    }
                    if (req.Method == "OPTIONS")
                    {
                        SendPreflight(ns, origin, req.Header("Access-Control-Request-Headers"));
                        return;
                    }
                    Route(req, ns, origin);
                }
                catch (Exception ex)
                {
                    Log.Write("request: " + ex.Message);
                    try { SendJson(ns, 500, origin, Fail(ex.Message)); } catch { }
                }
            }
        }

        private static void Route(Request req, Stream ns, string origin)
        {
            var key = req.Method + " " + req.Path;
            if (key == "GET /health")
            {
                SendJson(ns, 200, origin, new Dictionary<string, object>
                {
                    { "ok", true },
                    { "version", Program.Version },
                    { "os", "windows" },
                    { "name", "lab-wbls" },
                });
                return;
            }
            if (key == "GET /printers")
            {
                SendJson(ns, 200, origin, new Dictionary<string, object>
                {
                    { "ok", true },
                    { "printers", LabelPrint.ListPrinters() },
                    { "defaultPrinter", LabelPrint.DefaultPrinter() },
                });
                return;
            }
            if (key == "POST /shutdown")
            {
                DrainBody(req);
                SendJson(ns, 200, origin, new Dictionary<string, object> { { "ok", true } });
                ThreadPool.QueueUserWorkItem(_ =>
                {
                    Thread.Sleep(120);
                    try { Application.Exit(); } catch { }
                });
                return;
            }
            if (key == "POST /print-png")
            {
                var body = ReadJson(req);
                var png = DecodePng(Str(body, "png"));
                var printer = Str(body, "printer");
                var title = Str(body, "title");
                var widthMm = Num(body, "widthMm");
                var heightMm = Num(body, "heightMm");
                LabelPrint.PrintPng(png, printer, title, widthMm, heightMm);
                SendJson(ns, 200, origin, new Dictionary<string, object>
                {
                    { "ok", true },
                    { "printMode", "png" },
                });
                return;
            }
            DrainBody(req);
            SendJson(ns, 404, origin, Fail("없는 주소입니다."));
        }

        private static byte[] DecodePng(string raw)
        {
            var text = raw ?? "";
            var comma = text.IndexOf(',');
            if (text.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && comma >= 0)
            {
                text = text.Substring(comma + 1);
            }
            text = text.Trim();
            if (text.Length == 0) throw new InvalidOperationException("라벨 이미지가 없습니다.");
            return Convert.FromBase64String(text);
        }

        private static bool IsAllowedOrigin(string origin)
        {
            var o = origin.Trim().TrimEnd('/');
            return DefaultOrigins.Any(d => string.Equals(d, o, StringComparison.OrdinalIgnoreCase));
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
            if (req.Path.Length == 0) req.Path = "/";
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
            if (remaining <= 0) return;
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
            var ser = new JavaScriptSerializer { MaxJsonLength = MaxJsonBytes };
            return ser.Deserialize<Dictionary<string, object>>(text)
                ?? new Dictionary<string, object>();
        }

        private static string Str(Dictionary<string, object> map, string key)
        {
            object v;
            return map != null && map.TryGetValue(key, out v) && v != null
                ? Convert.ToString(v).Trim()
                : "";
        }

        private static double Num(Dictionary<string, object> map, string key)
        {
            object v;
            if (map == null || !map.TryGetValue(key, out v) || v == null) return 0;
            double n;
            return double.TryParse(Convert.ToString(v), out n) ? n : 0;
        }

        private static Dictionary<string, object> Fail(string message)
        {
            return new Dictionary<string, object>
            {
                { "ok", false },
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
            sb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
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
            var ser = new JavaScriptSerializer { MaxJsonLength = MaxJsonBytes };
            var payload = Encoding.UTF8.GetBytes(ser.Serialize(body));
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
