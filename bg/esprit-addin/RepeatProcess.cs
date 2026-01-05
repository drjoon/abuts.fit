using Esprit;
using EspritConstants;
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using Acrodent.EspritAddIns.ESPRIT2025AddinProject.DentalAddinCompat;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject
{
    /// <summary>
    /// 외부 API 호출을 통해 NC 생성을 요청할 때 사용하는 데이터 구조
    /// </summary>
    [DataContract]
    internal class NcGenerationRequest
    {
        [DataMember] public string RequestId { get; set; }
        [DataMember] public string StlPath { get; set; }
        [DataMember] public string NcOutputPath { get; set; }
        [DataMember] public double[] NumData { get; set; }
        [DataMember] public int[] NumCombobox { get; set; }
        [DataMember] public string PostName { get; set; } = "HyundaiWia_XF6300T_V19_FKSM.asc";
        
        // CaseInfos alignment
        [DataMember] public string ClinicName { get; set; }
        [DataMember] public string PatientName { get; set; }
        [DataMember] public string Tooth { get; set; }
        [DataMember] public string ImplantManufacturer { get; set; }
        [DataMember] public string ImplantSystem { get; set; }
        [DataMember] public string ImplantType { get; set; }
        [DataMember] public double MaxDiameter { get; set; }
        [DataMember] public double ConnectionDiameter { get; set; }
        [DataMember] public string WorkType { get; set; }
        [DataMember] public string LotNumber { get; set; }
    }

    /// <summary>
    /// 백엔드 API(saveNcFileAndMoveToMachining) 호출을 위한 페이로드
    /// </summary>
    [DataContract]
    internal class BackendNcPayload
    {
        [DataMember] public string fileName { get; set; }
        [DataMember] public string fileType { get; set; }
        [DataMember] public long fileSize { get; set; }
        [DataMember] public string filePath { get; set; }
        [DataMember] public string s3Key { get; set; }
        [DataMember] public string s3Url { get; set; }
    }

    internal class RepeatProcess : IDisposable
    {
        private readonly Esprit.Application _espApp;
        private HttpListener _listener;
        private CancellationTokenSource _cts;
        private readonly string _baseUrl = "http://localhost:8001/";
        private readonly string _backendUrl = "https://abuts.fit/api";
        private readonly string _logFilePath;

        // 운영 상태 및 히스토리 관리
        private bool _isRunning = true;
        private readonly List<Dictionary<string, object>> _recentHistory = new List<Dictionary<string, object>>();
        private readonly int _maxHistory = 50;
        private FileSystemWatcher _watcher;

        public RepeatProcess(Esprit.Application app, string folderPath = null)
        {
            _espApp = app ?? throw new ArgumentNullException(nameof(app));
            
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string logDir = Path.Combine(appData, "Acrodent", "Logs");
            Directory.CreateDirectory(logDir);
            _logFilePath = Path.Combine(logDir, $"cam_server_{DateTime.Now:yyyyMMdd}.log");

            CleanupOldLogs(logDir);
            // SetupWatcher(); // 제거: 이제 백엔드/Rhino 명령 기반으로 동작
            
            // 재기동 시 미처리 파일 복구 실행 (별도 스레드)
            Task.Run(() => RecoverUnprocessedFiles());
        }

        private async Task RecoverUnprocessedFiles()
        {
            try
            {
                LogInfo("[Recover] Scanning for unprocessed files on startup...");
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string storagePath = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "storage", "2-filled"));
                if (!Directory.Exists(storagePath)) return;

                var files = Directory.GetFiles(storagePath, "*.filled.stl");
                foreach (var file in files)
                {
                    string fileName = Path.GetFileName(file);
                    // 백엔드에 처리 여부 확인 (2-filled 단계의 파일이 3-nc로 처리되어야 하는지)
                    bool shouldProcess = await CheckBackendShouldProcess(fileName, "2-filled");
                    if (shouldProcess)
                    {
                        LogInfo($"[Recover] Processing {fileName}");
                        var req = new NcGenerationRequest
                        {
                            RequestId = $"recover_{DateTime.Now:yyyyMMddHHmmss}",
                            StlPath = file,
                            NcOutputPath = Path.Combine(Path.GetDirectoryName(file), "..", "3-nc", Path.ChangeExtension(fileName, ".nc"))
                        };
                        bool success = ProcessStlFile(req);
                        if (success) await NotifyBackendAndNext(req);
                    }
                }
            }
            catch (Exception ex)
            {
                LogError($"[Recover] Failed: {ex.Message}");
            }
        }

        private async Task<bool> CheckBackendShouldProcess(string fileName, string sourceStep)
        {
            try
            {
                using (var client = new HttpClient())
                {
                    string url = $"{_backendUrl}/bg/file-status?sourceStep={sourceStep}&fileName={fileName}&force=true";
                    var response = await client.GetAsync(url);
                    if (response.IsSuccessStatusCode)
                    {
                        string content = await response.Content.ReadAsStringAsync();
                        // 단순 문자열 포함 여부로 판단 (JSON 파싱 오버헤드 방지)
                        return content.ToLower().Contains("\"shouldprocess\":true");
                    }
                }
            }
            catch { }
            return false;
        }

        private async Task NotifyBackendAndNext(NcGenerationRequest req)
        {
            await NotifyBackendSuccess(req);
            
            // [추가] Bridge-Server(포트 8002)에 명령 전달
            try
            {
                using (var client = new HttpClient())
                {
                    string bridgeUrl = "http://localhost:8002/api/bridge/process-file";
                    var fi = new FileInfo(req.NcOutputPath);
                    string json = $"{{\"fileName\":\"{fi.Name}\",\"requestId\":\"{req.RequestId}\"}}";
                    var content = new StringContent(json, Encoding.UTF8, "application/json");
                    var response = await client.PostAsync(bridgeUrl, content);
                    if (response.IsSuccessStatusCode)
                        LogInfo($"[Bridge] Successfully notified Bridge-Server: {fi.Name}");
                    else
                        LogWarning($"[Bridge] Notification status: {response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                LogWarning($"[Bridge] Failed to notify Bridge-Server: {ex.Message}");
            }
        }

        private void CleanupOldLogs(string logDir)
        {
            try
            {
                var threshold = DateTime.Now.AddDays(-30);
                foreach (var file in Directory.GetFiles(logDir, "cam_server_*.log"))
                {
                    var fi = new FileInfo(file);
                    if (fi.CreationTime < threshold)
                    {
                        fi.Delete();
                    }
                }
            }
            catch { /* ignore log cleanup errors */ }
        }

        public void Run()
        {
            if (_listener != null && _listener.IsListening) return;

            try
            {
                Stop(); // Ensure previous listener is cleaned up

                _listener = new HttpListener();
                _listener.Prefixes.Add(_baseUrl);
                _listener.Start();

                _cts = new CancellationTokenSource();
                Task.Run(() => ListenLoop(_cts.Token), _cts.Token);

                LogInfo($"[API Server] Started at {_baseUrl}");
            }
            catch (Exception ex)
            {
                LogError($"[API Server] Failed to start: {ex.Message}");
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
                        LogError("[API Server] Listener stopped unexpectedly. Restarting...");
                        _listener.Start();
                    }

                    var context = await _listener.GetContextAsync();
                    _ = Task.Run(() => HandleRequest(context), token);
                }
                catch (HttpListenerException ex)
                {
                    if (token.IsCancellationRequested) break;
                    LogError($"[API Server] HttpListenerException: {ex.Message}");
                    await Task.Delay(1000, token); // Wait before retry
                }
                catch (OperationCanceledException) { break; }
                catch (Exception ex)
                {
                    LogError($"[API Server] Listener error: {ex.Message}");
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

                // 공통 인터페이스 처리
                if (request.HttpMethod == "GET")
                {
                    if (path == "/health" || path == "/ping")
                    {
                        response.StatusCode = (int)HttpStatusCode.OK;
                        byte[] buffer = Encoding.UTF8.GetBytes($"{{\"status\": \"UP\", \"isRunning\": {_isRunning.ToString().ToLower()}}}");
                        response.OutputStream.Write(buffer, 0, buffer.Length);
                        return;
                    }
                    if (path == "/history/recent")
                    {
                        response.StatusCode = (int)HttpStatusCode.OK;
                        string json = "";
                        lock (_recentHistory)
                        {
                            var items = new List<string>();
                            foreach (var h in _recentHistory)
                            {
                                items.Add($"{{\"requestId\":\"{h["requestId"]}\",\"file\":\"{h["file"]}\",\"timestamp\":\"{((DateTime)h["timestamp"]):yyyy-MM-dd HH:mm:ss}\",\"status\":\"{h["status"]}\"}}");
                            }
                            json = $"{{\"ok\": true, \"history\": [{string.Join(",", items)}]}}";
                        }
                        byte[] buffer = Encoding.UTF8.GetBytes(json);
                        response.OutputStream.Write(buffer, 0, buffer.Length);
                        return;
                    }
                }
                else if (request.HttpMethod == "POST")
                {
                    if (path == "/control/start")
                    {
                        _isRunning = true;
                        LogInfo("[Control] Service started");
                        response.StatusCode = (int)HttpStatusCode.OK;
                        byte[] buffer = Encoding.UTF8.GetBytes("{\"ok\": true}");
                        response.OutputStream.Write(buffer, 0, buffer.Length);
                        return;
                    }
                    if (path == "/control/stop")
                    {
                        _isRunning = false;
                        LogInfo("[Control] Service stopped");
                        response.StatusCode = (int)HttpStatusCode.OK;
                        byte[] buffer = Encoding.UTF8.GetBytes("{\"ok\": true}");
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

                NcGenerationRequest req;
                using (var reader = request.InputStream)
                {
                    var serializer = new DataContractJsonSerializer(typeof(NcGenerationRequest));
                    req = (NcGenerationRequest)serializer.ReadObject(reader);
                }

                if (req == null || string.IsNullOrEmpty(req.StlPath) || string.IsNullOrEmpty(req.RequestId))
                {
                    response.StatusCode = (int)HttpStatusCode.BadRequest;
                    return;
                }

                LogInfo($"[CAM] Received request: {req.RequestId} (Clinic: {req.ClinicName}, Patient: {req.PatientName}, Lot: {req.LotNumber})");

                // NC 생성 프로세스 실행 (메인 스레드 이슈 방지를 위해 락 또는 동기화 고려 가능하나 여기선 직접 호출)
                bool success = ProcessStlFile(req);

                if (success)
                {
                    await NotifyBackendSuccess(req);
                    
                    response.StatusCode = (int)HttpStatusCode.OK;
                    byte[] buffer = Encoding.UTF8.GetBytes("{\"success\": true}");
                    response.OutputStream.Write(buffer, 0, buffer.Length);
                }
                else
                {
                    response.StatusCode = (int)HttpStatusCode.InternalServerError;
                    byte[] buffer = Encoding.UTF8.GetBytes("{\"success\": false, \"message\": \"CAM processing failed\"}");
                    response.OutputStream.Write(buffer, 0, buffer.Length);
                }
            }
            catch (Exception ex)
            {
                LogError($"[API Server] Request handling error: {ex.Message}\n{ex.StackTrace}");
                response.StatusCode = (int)HttpStatusCode.InternalServerError;
                byte[] buffer = Encoding.UTF8.GetBytes($"{{\"success\": false, \"message\": \"{ex.Message}\"}}");
                response.OutputStream.Write(buffer, 0, buffer.Length);
            }
            finally
            {
                try { response.Close(); } catch { }
            }
        }

        private bool ProcessStlFile(NcGenerationRequest req)
        {
            try
            {
                LogInfo($"[CAM] Starting NC generation for {req.RequestId}");

                Document espdoc = _espApp.Document;
                
                // 1. 임플란트 파라미터 업데이트
                var userData = Connect.DentalHost.CurrentData;
                lock (userData)
                {
                    if (req.NumData != null)
                    {
                        int count = Math.Min(req.NumData.Length, userData.NumData.Length);
                        for (int i = 0; i < count; i++) userData.NumData[i] = req.NumData[i];
                    }
                    if (req.NumCombobox != null)
                    {
                        int count = Math.Min(req.NumCombobox.Length, userData.NumCombobox.Length);
                        for (int i = 0; i < count; i++) userData.NumCombobox[i] = req.NumCombobox[i];
                    }
                }

                // 2. STL 병합 및 툴패스 워크플로우 실행
                if (!File.Exists(req.StlPath))
                {
                    throw new FileNotFoundException($"STL file not found: {req.StlPath}");
                }

                espdoc.MergeFile(req.StlPath);
                Connect.DentalHost.RunWorkflow(espdoc, req.StlPath);

                // 3. NC 코드 생성
                string postFileDir = _espApp.Configuration.GetFileDirectory(espFileType.espFileTypePostProcessor);
                string postPath = Path.Combine(postFileDir, req.PostName);
                
                if (!File.Exists(postPath))
                {
                    throw new FileNotFoundException($"Post-processor not found: {postPath}");
                }

                string ncFilePath = req.NcOutputPath;
                if (string.IsNullOrEmpty(ncFilePath))
                {
                    ncFilePath = Path.ChangeExtension(req.StlPath, ".nc");
                }

                string dir = Path.GetDirectoryName(ncFilePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                espdoc.NCCode.AddAll();
                espdoc.NCCode.Execute(postPath, ncFilePath);

                LogInfo($"[CAM] NC Generated successfully: {ncFilePath}");

                // 히스토리 추가
                lock (_recentHistory)
                {
                    var item = new Dictionary<string, object>
                    {
                        { "requestId", req.RequestId },
                        { "file", Path.GetFileName(ncFilePath) },
                        { "timestamp", DateTime.Now },
                        { "status", "success" }
                    };
                    _recentHistory.Insert(0, item);
                    if (_recentHistory.Count > _maxHistory) _recentHistory.RemoveAt(_recentHistory.Count - 1);
                }

                // 4. 그래픽 정리
                CleanupEsprit(espdoc);
                return true;
            }
            catch (Exception ex)
            {
                LogError($"[CAM] Error processing {req.RequestId}: {ex.Message}\n{ex.StackTrace}");
                return false;
            }
        }

        private void CleanupEsprit(Document espdoc)
        {
            if (espdoc == null) return;
            try
            {
                var gc = espdoc.GraphicsCollection;
                for (int idx = gc.Count; idx >= 1; idx--)
                {
                    object item = null;
                    try
                    {
                        item = gc[idx];
                        GraphicObject go = item as GraphicObject;
                        if (go == null) continue;

                        if (go.GraphicObjectType == espGraphicObjectType.espOperation ||
                            go.GraphicObjectType == espGraphicObjectType.espFeatureChain ||
                            go.GraphicObjectType == espGraphicObjectType.espFreeFormFeature ||
                            go.GraphicObjectType == espGraphicObjectType.espFeatureSet ||
                            go.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                        {
                            gc.Remove(idx);
                        }
                    }
                    finally
                    {
                        if (item != null && Marshal.IsComObject(item))
                        {
                            Marshal.ReleaseComObject(item);
                        }
                    }
                }
                espdoc.Refresh();
            }
            catch (Exception ex)
            {
                LogWarning($"[CAM] Cleanup failed: {ex.Message}");
            }
        }

        private async Task NotifyBackendSuccess(NcGenerationRequest req)
        {
            try
            {
                using (var client = new HttpClient())
                {
                    string url = $"{_backendUrl}/bg/register-file";
                    
                    var fi = new FileInfo(req.NcOutputPath);
                    var payload = new Dictionary<string, object>
                    {
                        { "sourceStep", "3-nc" },
                        { "fileName", fi.Name },
                        { "originalFileName", Path.GetFileName(req.StlPath) },
                        { "requestId", req.RequestId },
                        { "status", "success" },
                        { "metadata", new Dictionary<string, object> { { "fileSize", fi.Length } } }
                    };

                    using (var ms = new MemoryStream())
                    {
                        var ser = new DataContractJsonSerializer(typeof(Dictionary<string, object>));
                        // Dictionary 직렬화가 번거로울 수 있으므로 실제로는 전용 클래스 사용 권장. 
                        // 여기서는 단순화를 위해 익명 객체 스타일의 직렬화 로직 적용 (또는 기존 BackendNcPayload 수정)
                        
                        string json = $"{{\"sourceStep\":\"3-nc\",\"fileName\":\"{fi.Name}\",\"originalFileName\":\"{Path.GetFileName(req.StlPath)}\",\"requestId\":\"{req.RequestId}\",\"status\":\"success\"}}";
                        var content = new StringContent(json, Encoding.UTF8, "application/json");
                        
                        var response = await client.PostAsync(url, content);
                        if (response.IsSuccessStatusCode)
                        {
                            LogInfo($"[Backend] Successfully notified processed file: {fi.Name}");
                        }
                        else
                        {
                            LogError($"[Backend] Failed to notify: {response.StatusCode} for {fi.Name}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                LogError($"[Backend] Callback error: {ex.Message}");
            }
        }

        private void LogInfo(string message) { Log("INFO", message); }
        private void LogWarning(string message) { Log("WARN", message); }
        private void LogError(string message) { Log("ERROR", message); }

        private void Log(string level, string message)
        {
            string formattedMessage = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [{level}] {message}";
            try
            {
                File.AppendAllText(_logFilePath, formattedMessage + Environment.NewLine);
                _espApp.OutputWindow.Text(formattedMessage);
            }
            catch
            {
                System.Diagnostics.Trace.WriteLine(formattedMessage);
            }
        }

        public void Stop()
        {
            try
            {
                _cts?.Cancel();
                if (_listener != null)
                {
                    if (_listener.IsListening) _listener.Stop();
                    _listener.Close();
                    _listener = null;
                }
            }
            catch { }
        }

        public void Dispose()
        {
            Stop();
            _cts?.Dispose();
        }
    }
}
