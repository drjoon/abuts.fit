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
        private readonly string _baseUrl = "http://+:8001/";
        private bool _isRunning = true;
        
        private readonly Queue<NcGenerationRequest> _ncQueue = new Queue<NcGenerationRequest>();
        private readonly object _queueLock = new object();
        private Task _queueProcessorTask;
        private CancellationTokenSource _queueProcessorCts;
        public void EnqueueNcRequest(NcGenerationRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.RequestId))
            {
                return;
            }
            lock (_queueLock)
            {
                _ncQueue.Enqueue(req);
            }
        }
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
                _queueProcessorCts = new CancellationTokenSource();
                _queueProcessorTask = Task.Run(() => ProcessQueueLoop(_queueProcessorCts.Token), _queueProcessorCts.Token);
                AppLogger.Log($"[HTTP Server] Started at {_baseUrl}");
                AppLogger.Log($"[HTTP Server] Listening on all interfaces on port 8001");
                AppLogger.Log($"[HTTP Server] NC processing queue started");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"[HTTP Server] Failed to start: {ex.Message}");
                AppLogger.Log($"[HTTP Server] Note: Administrator privileges may be required for http://+:8001/");
            }
        }
        public void Stop()
        {
            try
            {
                _cts?.Cancel();
                _queueProcessorCts?.Cancel();
                _listener?.Stop();
                _listener?.Close();
                _listener = null;
                
                try
                {
                    if (_queueProcessorTask != null && !_queueProcessorTask.IsCompleted)
                    {
                        _queueProcessorTask.Wait(TimeSpan.FromSeconds(5));
                    }
                }
                catch { }
                
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
            var allowRaw = (AppConfig.GetEspritAllowIpsRaw() ?? string.Empty).Trim();
            if (!string.IsNullOrEmpty(allowRaw))
            {
                string ip = string.Empty;
                try
                {
                    var xff = request.Headers["X-Forwarded-For"];
                    if (!string.IsNullOrWhiteSpace(xff))
                    {
                        ip = xff.Split(',')[0].Trim();
                    }
                    else
                    {
                        ip = request.RemoteEndPoint?.Address?.ToString() ?? string.Empty;
                    }
                }
                catch
                {
                    ip = string.Empty;
                }
                var allow = allowRaw
                    .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(s => (s ?? string.Empty).Trim())
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                if (string.IsNullOrWhiteSpace(ip) || !allow.Contains(ip))
                {
                    AppLogger.Log($"[HTTP Server] Forbidden by allowlist: ip={ip}");
                    response.StatusCode = (int)HttpStatusCode.Forbidden;
                    byte[] buffer = Encoding.UTF8.GetBytes("{\"ok\": false, \"message\": \"forbidden\"}");
                    response.OutputStream.Write(buffer, 0, buffer.Length);
                    return;
                }
            }
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
                // 큐에 요청 추가
                lock (_queueLock)
                {
                    int queueSize = _ncQueue.Count;
                    _ncQueue.Enqueue(req);
                    AppLogger.Log($"[HTTP Server] Request queued: {req.RequestId} (Queue size: {queueSize + 1})");
                }
                // 즉시 응답 반환
                response.StatusCode = (int)HttpStatusCode.OK;
                byte[] okBuffer = Encoding.UTF8.GetBytes("{\"ok\": true, \"message\": \"Request queued for processing\"}");
                response.OutputStream.Write(okBuffer, 0, okBuffer.Length);
                response.OutputStream.Close();
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
                AppLogger.Log($"[NC Processing] Resolved STL path: {stlPath}");
                
                if (!File.Exists(stlPath))
                {
                    AppLogger.Log($"[NC Processing] STL file not found locally: {stlPath}. Trying to download from backend source-file API...");
                    try
                    {
                        // req.StlPath 는 일반적으로 CAM 파일의 상대 경로(filePath)다.
                        // DownloadSourceFileToFilledDir 는 sourceStep=2-filled 를 사용하여
                        // 백엔드 /bg/source-file 에서 해당 STL 을 StorageFilledDirectory 로 다운로드한다.
                        var safeName = System.IO.Path.GetFileName(req.StlPath ?? string.Empty);
                        if (string.IsNullOrWhiteSpace(safeName))
                        {
                            AppLogger.Log("[NC Processing] Cannot determine safe file name from StlPath; aborting download.");
                            return;
                        }
                        var filledDir = AppConfig.StorageFilledDirectory;
                        if (!Directory.Exists(filledDir))
                        {
                            Directory.CreateDirectory(filledDir);
                        }
                        var targetPath = System.IO.Path.Combine(filledDir, safeName);
                        var ok = Connect.DownloadSourceFileToFilledDir(req.RequestId, req.StlPath, targetPath);
                        if (!ok)
                        {
                            AppLogger.Log($"[NC Processing] Failed to download STL via /bg/source-file for RequestId={req.RequestId}, filePath={req.StlPath}");
                            return;
                        }
                        stlPath = targetPath;
                        AppLogger.Log($"[NC Processing] STL downloaded successfully to: {stlPath}");
                    }
                    catch (Exception ex)
                    {
                        AppLogger.Log($"[NC Processing] Error while downloading STL from backend: {ex.GetType().Name}:{ex.Message}");
                        return;
                    }
                }
                AppLogger.Log($"[NC Processing] Starting CAM processing: RequestId={req.RequestId}, Clinic={req.ClinicName}, Patient={req.PatientName}, Tooth={req.Tooth}");
                AppLogger.Log($"[NC Processing] Implant: {req.ImplantManufacturer}/{req.ImplantSystem}/{req.ImplantType}, MaxDia={req.MaxDiameter}, ConnDia={req.ConnectionDiameter}");
                AppLogger.Log($"[NC Processing] WorkType={req.WorkType}, LotNumber={req.LotNumber}");
                // StlFileProcessor를 사용하여 NC 생성 (자동 CAM 처리)
                var processor = new StlFileProcessor(_espApp);
                processor.lotNumber = req.LotNumber ?? "ACR";
                
                AppLogger.Log($"[NC Processing] Invoking StlFileProcessor.Process()...");
                processor.Process(stlPath);
                AppLogger.Log($"[NC Processing] CAM processing completed successfully: {req.RequestId}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"[NC Processing] CAM processing failed: {ex.Message}");
                AppLogger.Log($"[NC Processing] Stack trace: {ex.StackTrace}");
            }
        }
        private async Task ProcessQueueLoop(CancellationToken token)
        {
            AppLogger.Log("[Queue Processor] Started");
            while (!token.IsCancellationRequested)
            {
                try
                {
                    NcGenerationRequest req = null;
                    lock (_queueLock)
                    {
                        if (_ncQueue.Count > 0)
                        {
                            req = _ncQueue.Dequeue();
                        }
                    }
                    if (req != null)
                    {
                        try
                        {
                            AppLogger.Log($"[Queue Processor] Processing: {req.RequestId} (Remaining in queue: {_ncQueue.Count})");
                            await ProcessNcRequest(req);
                            AppLogger.Log($"[Queue Processor] Completed: {req.RequestId}");
                        }
                        catch (Exception ex)
                        {
                            AppLogger.Log($"[Queue Processor] Error processing {req.RequestId}: {ex.Message}");
                        }
                    }
                    else
                    {
                        await Task.Delay(500, token);
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"[Queue Processor] Error: {ex.Message}");
                    await Task.Delay(1000, token);
                }
            }
            AppLogger.Log("[Queue Processor] Stopped");
        }
        private string NormalizeFilePath(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return path;
            // 상대 경로면 storage 기준으로 보정
            if (!Path.IsPathRooted(path))
            {
                string storagePath = AppConfig.StorageFilledDirectory;
                string fullPath = Path.Combine(storagePath, Path.GetFileName(path));
                AppLogger.Log($"[NC Processing] Path normalization: {path} -> {fullPath}");
                return fullPath;
            }
            return path;
        }
        public void Dispose()
        {
            Stop();
            _cts?.Dispose();
            _queueProcessorCts?.Dispose();
        }
    }
}
