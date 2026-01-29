using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.Serialization;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;
using Esprit;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject
{
    [DataContract]
    public class NcGenerationRequest
    {
        [DataMember] public string RequestId { get; set; }
        [DataMember] public string StlPath { get; set; }
        [DataMember] public string NcOutputPath { get; set; }
        [DataMember] public string ClinicName { get; set; }
        [DataMember] public string PatientName { get; set; }
        [DataMember] public string Tooth { get; set; }
        [DataMember] public string ImplantManufacturer { get; set; }
        [DataMember] public string ImplantSystem { get; set; }
        [DataMember] public string ImplantType { get; set; }
        [DataMember] public double MaxDiameter { get; set; }
        [DataMember] public double ConnectionDiameter { get; set; }
        [DataMember] public double MaterialDiameter { get; set; }
        [DataMember] public string MaterialDiameterGroup { get; set; }
        [DataMember] public string WorkType { get; set; }
        [DataMember] public string LotNumber { get; set; }
    }

    internal class EspritHttpServer : IDisposable
    {
        private readonly Application _espApp;
        private HttpListener _listener;
        private CancellationTokenSource _cts;
        private readonly string _baseUrl = "http://localhost:8001/";
        private bool _isRunning = true;

        public EspritHttpServer(Application app)
        {
            _espApp = app ?? throw new ArgumentNullException(nameof(app));
        }

        public void Start()
        {
            if (_listener != null && _listener.IsListening) return;

            try
            {
                Stop();

                _listener = new HttpListener();
                _listener.Prefixes.Add(_baseUrl);
                _listener.Start();

                _cts = new CancellationTokenSource();
                _ = Task.Run(() => ListenLoop(_cts.Token), _cts.Token);

                AppLogger.Log($"[HTTP Server] Started at {_baseUrl}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"[HTTP Server] Failed to start: {ex.Message}");
            }
        }

        public void Stop()
        {
            try
            {
                _cts?.Cancel();
                _listener?.Stop();
                _listener?.Close();
                _listener = null;
                AppLogger.Log("[HTTP Server] Stopped");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"[HTTP Server] Error stopping: {ex.Message}");
            }
        }

        private async Task ListenLoop(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    if (!_listener.IsListening)
                    {
                        AppLogger.Log("[HTTP Server] Listener stopped unexpectedly. Restarting...");
                        _listener.Start();
                    }

                    var context = await _listener.GetContextAsync();
                    _ = Task.Run(() => HandleRequest(context), token);
                }
                catch (HttpListenerException ex)
                {
                    if (token.IsCancellationRequested) break;
                    AppLogger.Log($"[HTTP Server] HttpListenerException: {ex.Message}");
                    await Task.Delay(1000, token);
                }
                catch (OperationCanceledException) { break; }
                catch (Exception ex)
                {
                    AppLogger.Log($"[HTTP Server] Listener error: {ex.Message}");
                    await Task.Delay(1000, token);
                }
            }
        }

        private async Task HandleRequest(HttpListenerContext context)
        {
            var request = context.Request;
            var response = context.Response;
            response.ContentType = "application/json";

            try
            {
                var path = request.Url.AbsolutePath.ToLower();

                // GET /health, /ping
                if (request.HttpMethod == "GET")
                {
                    if (path == "/health" || path == "/ping")
                    {
                        response.StatusCode = (int)HttpStatusCode.OK;
                        byte[] buffer = Encoding.UTF8.GetBytes($"{{\"status\": \"UP\", \"isRunning\": {_isRunning.ToString().ToLower()}}}");
                        response.OutputStream.Write(buffer, 0, buffer.Length);
                        return;
                    }
                }

                if (!_isRunning)
                {
                    response.StatusCode = (int)HttpStatusCode.ServiceUnavailable;
                    byte[] buffer = Encoding.UTF8.GetBytes("{\"ok\": false, \"message\": \"Service is stopped\"}");
                    response.OutputStream.Write(buffer, 0, buffer.Length);
                    return;
                }

                if (request.HttpMethod != "POST")
                {
                    response.StatusCode = (int)HttpStatusCode.MethodNotAllowed;
                    return;
                }

                // POST / - NC 생성 요청
                NcGenerationRequest req;
                using (var reader = request.InputStream)
                {
                    var serializer = new System.Runtime.Serialization.Json.DataContractJsonSerializer(typeof(NcGenerationRequest));
                    req = (NcGenerationRequest)serializer.ReadObject(reader);
                }

                if (req == null || string.IsNullOrEmpty(req.StlPath) || string.IsNullOrEmpty(req.RequestId))
                {
                    response.StatusCode = (int)HttpStatusCode.BadRequest;
                    byte[] buffer = Encoding.UTF8.GetBytes("{\"ok\": false, \"message\": \"Invalid request\"}");
                    response.OutputStream.Write(buffer, 0, buffer.Length);
                    return;
                }

                AppLogger.Log($"[HTTP Server] Accepted NC request: {req.RequestId} (Clinic: {req.ClinicName}, Patient: {req.PatientName})");

                // 즉시 응답 반환
                response.StatusCode = (int)HttpStatusCode.OK;
                byte[] okBuffer = Encoding.UTF8.GetBytes("{\"ok\": true, \"message\": \"Processing started\"}");
                response.OutputStream.Write(okBuffer, 0, okBuffer.Length);
                response.OutputStream.Close();

                // 백그라운드에서 처리
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await ProcessNcRequest(req);
                    }
                    catch (Exception ex)
                    {
                        AppLogger.Log($"[HTTP Server] Error processing NC request: {ex.Message}");
                    }
                });
            }
            catch (Exception ex)
            {
                AppLogger.Log($"[HTTP Server] Request handling error: {ex.Message}");
                try
                {
                    response.StatusCode = (int)HttpStatusCode.InternalServerError;
                    byte[] buffer = Encoding.UTF8.GetBytes("{\"ok\": false, \"message\": \"Internal server error\"}");
                    response.OutputStream.Write(buffer, 0, buffer.Length);
                }
                catch { }
            }
            finally
            {
                try { response.OutputStream.Close(); }
                catch { }
            }
        }

        private async Task ProcessNcRequest(NcGenerationRequest req)
        {
            try
            {
                // STL 파일 경로 정규화
                string stlPath = NormalizeFilePath(req.StlPath);
                if (!File.Exists(stlPath))
                {
                    AppLogger.Log($"[NC Processing] STL file not found: {stlPath}");
                    return;
                }

                AppLogger.Log($"[NC Processing] Starting: {req.RequestId} from {stlPath}");

                // StlFileProcessor를 사용하여 NC 생성
                var processor = new StlFileProcessor(_espApp);
                processor.lotNumber = req.LotNumber ?? "ACR";
                processor.Process(stlPath);

                AppLogger.Log($"[NC Processing] Completed: {req.RequestId}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"[NC Processing] Error: {ex.Message}\n{ex.StackTrace}");
            }
        }

        private string NormalizeFilePath(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return path;

            // 상대 경로면 storage 기준으로 보정
            if (!Path.IsPathRooted(path))
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string storagePath = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "storage", "2-filled"));
                return Path.Combine(storagePath, Path.GetFileName(path));
            }

            return path;
        }

        public void Dispose()
        {
            Stop();
            _cts?.Dispose();
        }
    }
}
