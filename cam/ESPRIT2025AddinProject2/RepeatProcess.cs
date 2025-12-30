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
        private readonly string _baseUrl = "http://localhost:8080/";
        private readonly string _backendUrl = "https://abuts.fit/api";
        private readonly string _logFilePath;

        public RepeatProcess(Esprit.Application app, string folderPath = null)
        {
            _espApp = app ?? throw new ArgumentNullException(nameof(app));
            
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string logDir = Path.Combine(appData, "Acrodent", "Logs");
            Directory.CreateDirectory(logDir);
            _logFilePath = Path.Combine(logDir, $"cam_server_{DateTime.Now:yyyyMMdd}.log");

            CleanupOldLogs(logDir);
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
                if (request.HttpMethod == "GET" && request.Url.AbsolutePath == "/health")
                {
                    response.StatusCode = (int)HttpStatusCode.OK;
                    byte[] healthBuffer = Encoding.UTF8.GetBytes("{\"status\": \"UP\"}");
                    response.OutputStream.Write(healthBuffer, 0, healthBuffer.Length);
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
                    string url = $"{_backendUrl}/requests/{req.RequestId}/nc-file";
                    
                    var fi = new FileInfo(req.NcOutputPath);
                    var payload = new BackendNcPayload
                    {
                        fileName = fi.Name,
                        fileType = "nc",
                        fileSize = fi.Length,
                        filePath = req.NcOutputPath,
                        s3Key = "local_generated",
                        s3Url = "local_generated"
                    };

                    using (var ms = new MemoryStream())
                    {
                        var ser = new DataContractJsonSerializer(typeof(BackendNcPayload));
                        ser.WriteObject(ms, payload);
                        string json = Encoding.UTF8.GetString(ms.ToArray());
                        var content = new StringContent(json, Encoding.UTF8, "application/json");
                        
                        var response = await client.PostAsync(url, content);
                        if (response.IsSuccessStatusCode)
                        {
                            LogInfo($"[Backend] Successfully notified for Request {req.RequestId}");
                        }
                        else
                        {
                            LogError($"[Backend] Failed to notify: {response.StatusCode} for Request {req.RequestId}");
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
