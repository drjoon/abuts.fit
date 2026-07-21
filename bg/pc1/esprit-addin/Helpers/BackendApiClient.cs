using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers
{
    /// <summary>
    /// 백엔드 API 통신 클라이언트
    /// </summary>
    public class BackendApiClient
    {
        private static readonly HttpClient BackendHttp;

        static BackendApiClient()
        {
            var handler = new HttpClientHandler
            {
                AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate,
                UseProxy = false
            };
            BackendHttp = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(10)
            };
        }

        public RequestMetaData FetchRequestMeta(string requestId)
        {
            if (string.IsNullOrWhiteSpace(requestId))
            {
                return null;
            }
            string baseUrl = (AppConfig.GetBackendUrl() ?? "").TrimEnd('/');
            string url = $"{baseUrl}/bg/request-meta?requestId={Uri.EscapeDataString(requestId)}";
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;
                string bridgeSecret = AppConfig.GetBridgeSecret();
                AppLogger.Log($"BackendApiClient: request-meta GET {url} (X-Bridge-Secret set={(!string.IsNullOrWhiteSpace(bridgeSecret))})");
                using (var req = new HttpRequestMessage(HttpMethod.Get, url))
                {
                    req.Headers.Accept.Clear();
                    req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                    if (!string.IsNullOrWhiteSpace(bridgeSecret))
                    {
                        req.Headers.Add("X-Bridge-Secret", bridgeSecret);
                    }
                    var resp = BackendHttp.SendAsync(req).GetAwaiter().GetResult();
                    string body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    if (!resp.IsSuccessStatusCode)
                    {
                        AppLogger.Log($"BackendApiClient: request-meta failed status={resp.StatusCode} body={body}");
                        return null;
                    }
                    AppLogger.Log($"BackendApiClient: request-meta response body={body}");
                    using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(body ?? string.Empty)))
                    {
                        var serializer = new DataContractJsonSerializer(typeof(RequestMetaResponse));
                        var meta = serializer.ReadObject(stream) as RequestMetaResponse;
                        return meta?.data;
                    }
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"BackendApiClient: request-meta error - {ex.GetType().Name}:{ex.Message}");
                return null;
            }
        }

        public static void NotifyBackendSuccess(string requestId, string stlPath, string ncPath)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(ncPath) || !File.Exists(ncPath))
                {
                    AppLogger.Log($"BackendApiClient: register-file skip (invalid ncPath) ncPath={ncPath}");
                    return;
                }

                var fi = new FileInfo(ncPath);
                var upload = UploadNcViaPresign(fi, requestId);
                if (!upload.ok)
                {
                    AppLogger.Log($"BackendApiClient: presign upload failed: {upload.error} (fallback register only)");
                }

                string baseUrl = (AppConfig.GetBackendUrl() ?? "").TrimEnd('/');
                string url = $"{baseUrl}/bg/register-file";
                string originalName = string.IsNullOrWhiteSpace(stlPath) ? "" : Path.GetFileName(stlPath);

                if (string.IsNullOrWhiteSpace(requestId) && !string.IsNullOrWhiteSpace(stlPath))
                {
                    requestId = ExtractRequestIdFromStlPath(stlPath);
                    AppLogger.Log($"BackendApiClient: requestId extracted from stlPath: {requestId}");
                }

                // [정책] OS temp 기반 임시 파일 사용 — 로지컈 경로 대신 파일명만 백엔드에 전달
                string ncRelativePath = fi.Name;

                string json;
                if (upload.ok)
                {
                    json = $"{{\"sourceStep\":\"3-nc\",\"fileName\":\"{EscapeJson(ncRelativePath)}\",\"originalFileName\":\"{EscapeJson(originalName)}\",\"requestId\":\"{EscapeJson(requestId)}\",\"status\":\"success\",\"s3Key\":\"{EscapeJson(upload.s3Key)}\",\"s3Url\":\"{EscapeJson(upload.s3Url)}\",\"fileSize\":{upload.fileSize}}}";
                }
                else
                {
                    json = $"{{\"sourceStep\":\"3-nc\",\"fileName\":\"{EscapeJson(ncRelativePath)}\",\"originalFileName\":\"{EscapeJson(originalName)}\",\"requestId\":\"{EscapeJson(requestId)}\",\"status\":\"success\",\"metadata\":{{\"fileSize\":{fi.Length},\"upload\":\"fallback_no_s3\"}}}}";
                }

                AppLogger.Log($"BackendApiClient: register-file POST {url} with requestId={requestId}, fileName={ncRelativePath}");

                using (var req = new HttpRequestMessage(HttpMethod.Post, url))
                {
                    req.Content = new StringContent(json, Encoding.UTF8, "application/json");
                    string bridgeSecret = AppConfig.GetBridgeSecret();
                    if (!string.IsNullOrWhiteSpace(bridgeSecret))
                    {
                        req.Headers.Add("X-Bridge-Secret", bridgeSecret);
                    }
                    var resp = BackendHttp.SendAsync(req).GetAwaiter().GetResult();
                    if (resp.IsSuccessStatusCode)
                    {
                        AppLogger.Log($"BackendApiClient: register-file success file={ncRelativePath} requestId={requestId}");
                        // [정책] S3 업로드 + 등록 완료 후 OS temp 임시 파일 즉시 삭제
                        TryDeleteTempFile(ncPath, "NC");
                        TryDeleteTempFile(stlPath, "STL");
                    }
                    else
                    {
                        string body = string.Empty;
                        try { body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult(); } catch { }
                        AppLogger.Log($"BackendApiClient: register-file failed status={resp.StatusCode} file={ncRelativePath} requestId={requestId} body={body}");
                    }
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"BackendApiClient: register-file error - {ex.GetType().Name}:{ex.Message}");
            }
        }

        public static void NotifyBackendFailure(string requestId, string stlPath, string errorMessage)
        {
            try
            {
                string baseUrl = (AppConfig.GetBackendUrl() ?? "").TrimEnd('/');
                string url = $"{baseUrl}/bg/register-file";
                string originalName = string.IsNullOrWhiteSpace(stlPath) ? "" : Path.GetFileName(stlPath);
                string safeError = (errorMessage ?? "");
                string json = $"{{\"sourceStep\":\"3-nc\",\"fileName\":\"\",\"originalFileName\":\"{EscapeJson(originalName)}\",\"requestId\":\"{EscapeJson(requestId)}\",\"status\":\"failed\",\"metadata\":{{\"error\":\"{EscapeJson(safeError)}\"}}}}";
                using (var req = new HttpRequestMessage(HttpMethod.Post, url))
                {
                    req.Content = new StringContent(json, Encoding.UTF8, "application/json");
                    string bridgeSecret = AppConfig.GetBridgeSecret();
                    if (!string.IsNullOrWhiteSpace(bridgeSecret))
                    {
                        req.Headers.Add("X-Bridge-Secret", bridgeSecret);
                    }
                    var resp = BackendHttp.SendAsync(req).GetAwaiter().GetResult();
                    AppLogger.Log($"BackendApiClient: register-file failure notified status={resp.StatusCode} requestId={requestId}");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"BackendApiClient: register-file failure notify error - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private static (bool ok, string s3Key, string s3Url, long fileSize, string error) UploadNcViaPresign(FileInfo fi, string requestId)
        {
            try
            {
                if (fi == null || !fi.Exists || string.IsNullOrWhiteSpace(requestId))
                {
                    return (false, null, null, 0, "invalid args");
                }
                string baseUrl = (AppConfig.GetBackendUrl() ?? "").TrimEnd('/');
                string presignUrl = $"{baseUrl}/bg/presign-upload";
                string presignBody = $"{{\"sourceStep\":\"3-nc\",\"fileName\":\"{EscapeJson(fi.Name)}\",\"requestId\":\"{EscapeJson(requestId)}\"}}";
                HttpResponseMessage presignResp;
                using (var req = new HttpRequestMessage(HttpMethod.Post, presignUrl))
                {
                    req.Content = new StringContent(presignBody, Encoding.UTF8, "application/json");
                    string bridgeSecret = AppConfig.GetBridgeSecret();
                    if (!string.IsNullOrWhiteSpace(bridgeSecret))
                    {
                        req.Headers.Add("X-Bridge-Secret", bridgeSecret);
                    }
                    presignResp = BackendHttp.SendAsync(req).GetAwaiter().GetResult();
                }
                if (!presignResp.IsSuccessStatusCode)
                {
                    return (false, null, null, 0, $"presign status={presignResp.StatusCode}");
                }
                var presignJson = presignResp.Content.ReadAsStringAsync().GetAwaiter().GetResult() ?? "";
                string Extract(string key)
                {
                    try
                    {
                        var marker = $"\"{key}\":\"";
                        int idx = presignJson.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
                        if (idx < 0) return null;
                        idx += marker.Length;
                        int end = presignJson.IndexOf("\"", idx, StringComparison.OrdinalIgnoreCase);
                        if (end < 0) return null;
                        return presignJson.Substring(idx, end - idx);
                    }
                    catch { return null; }
                }
                string url = Extract("url");
                string keyValue = Extract("key");
                string bucket = Extract("bucket");
                string contentType = Extract("contentType") ?? "application/octet-stream";
                if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(keyValue))
                {
                    return (false, null, null, 0, "presign response missing url/key");
                }
                long fileSize = fi.Length;
                using (var fs = fi.OpenRead())
                {
                    using (var putClient = new HttpClient(new HttpClientHandler { UseProxy = false }) { Timeout = TimeSpan.FromSeconds(30) })
                    using (var putReq = new HttpRequestMessage(HttpMethod.Put, url))
                    {
                        putReq.Content = new StreamContent(fs);
                        putReq.Content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
                        var putResp = putClient.SendAsync(putReq).GetAwaiter().GetResult();
                        if (!putResp.IsSuccessStatusCode)
                        {
                            return (false, null, null, 0, $"put status={putResp.StatusCode}");
                        }
                    }
                }
                string s3Url = BuildS3Url(bucket, keyValue);
                return (true, keyValue, s3Url, fileSize, null);
            }
            catch (Exception ex)
            {
                return (false, null, null, 0, ex.Message);
            }
        }

        private static string BuildS3Url(string bucket, string key)
        {
            bucket = (bucket ?? "").Trim();
            key = (key ?? "").Trim().TrimStart('/');
            if (string.IsNullOrEmpty(bucket) || string.IsNullOrEmpty(key)) return "";
            return $"https://{bucket}.s3.amazonaws.com/{key}";
        }

        public static string ExtractRequestIdFromStlPath(string stlPath)
        {
            try
            {
                string fileName = Path.GetFileName(stlPath);
                if (string.IsNullOrWhiteSpace(fileName))
                {
                    return null;
                }
                string baseName = Path.GetFileNameWithoutExtension(fileName);
                if (string.IsNullOrWhiteSpace(baseName))
                {
                    return null;
                }
                if (baseName.EndsWith(".filled", StringComparison.OrdinalIgnoreCase))
                {
                    baseName = baseName.Substring(0, baseName.Length - ".filled".Length);
                }
                var parts = baseName.Split('-');
                if (parts.Length >= 2)
                {
                    return $"{parts[0]}-{parts[1]}";
                }
                return baseName;
            }
            catch
            {
                return null;
            }
        }

        public static double? TryGetFinishLineTopZ(RequestMetaData meta)
        {
            try
            {
                var pts = meta?.caseInfos?.finishLine?.points;
                if (pts == null || pts.Length < 2)
                {
                    return null;
                }
                double maxZ = double.NegativeInfinity;
                int valid = 0;
                foreach (var p in pts)
                {
                    if (p == null || p.Length < 3) continue;
                    double z = p[2];
                    if (double.IsNaN(z) || double.IsInfinity(z)) continue;
                    valid++;
                    if (z > maxZ) maxZ = z;
                }
                if (valid < 1 || double.IsNegativeInfinity(maxZ)) return null;
                return maxZ;
            }
            catch
            {
                return null;
            }
        }

        private static string EscapeJson(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        [DataContract]
        public class RequestMetaResponse
        {
            [DataMember] public bool ok { get; set; }
            [DataMember] public RequestMetaData data { get; set; }
        }

        [DataContract]
        public class RequestMetaData
        {
            [DataMember] public string requestId { get; set; }
            [DataMember] public RequestMetaLotNumber lotNumber { get; set; }
            [DataMember] public string serialCode { get; set; }
            [DataMember] public RequestMetaCaseInfos caseInfos { get; set; }
        }

        [DataContract]
        public class RequestMetaLotNumber
        {
            [DataMember] public string part { get; set; }
        }

        [DataContract]
        public class RequestMetaCaseInfos
        {
            [DataMember] public string clinicName { get; set; }
            [DataMember] public string patientName { get; set; }
            [DataMember] public string tooth { get; set; }
            [DataMember] public string implantManufacturer { get; set; }
            [DataMember] public string implantBrand { get; set; }
            [DataMember] public string implantType { get; set; }
            [DataMember] public double maxDiameter { get; set; }
            [DataMember] public double connectionDiameter { get; set; }
            [DataMember] public double camDiameter { get; set; }
            [DataMember] public string workType { get; set; }
            [DataMember] public string lotNumber { get; set; }
            [DataMember] public string faceHolePrcFileName { get; set; }
            [DataMember] public string connectionPrcFileName { get; set; }
            // 제조사 수동 헥스 회전값(0/30)
            // - add-in에서는 "최종각"이 아니라 "기본 회전에 더하는 추가 회전 델타"로 해석한다.
            [DataMember(Name = "manufacturerHexRotation")] public string manufacturerHexRotation { get; set; }
            // 유지홈 옵션 ("none"|"deep", legacy "shallow" 허용) —
            // 5axisComposite_A.prc StepIncrement 오버라이드에 사용.
            [DataMember] public string retentionGroove { get; set; }

            // Composite 경사축 벡터(백엔드 필드명 변형 대응)
            // 우선순위는 StlFileProcessor.TryApplyCompositeOrientationVectorEnv 참고.
            [DataMember(Name = "compositeTiltVector")] public double[] compositeTiltVector { get; set; }
            [DataMember(Name = "tiltAxisVector")] public double[] tiltAxisVector { get; set; }
            [DataMember(Name = "inclinedAxisVector")] public double[] inclinedAxisVector { get; set; }
            [DataMember(Name = "slopeAxisVector")] public double[] slopeAxisVector { get; set; }

            [DataMember(Name = "compositeTiltVectorCsv")] public string compositeTiltVectorCsv { get; set; }
            [DataMember(Name = "tiltAxisVectorCsv")] public string tiltAxisVectorCsv { get; set; }
            [DataMember(Name = "inclinedAxisVectorCsv")] public string inclinedAxisVectorCsv { get; set; }
            [DataMember(Name = "slopeAxisVectorCsv")] public string slopeAxisVectorCsv { get; set; }

            // Rhino 정렬 telemetry(헥스 회전각)
            // - 30도 회전 모드에서 StlFileProcessor가 "원복 후 +30" 계산에 사용한다.
            [DataMember(Name = "hexRotation")] public RequestMetaHexRotation hexRotation { get; set; }

            [DataMember] public RequestMetaFinishLine finishLine { get; set; }
        }

        [DataContract]
        public class RequestMetaHexRotation
        {
            [DataMember(Name = "beforeToXDeg")] public double? beforeToXDeg { get; set; }
            [DataMember(Name = "appliedDeg")] public double? appliedDeg { get; set; }
            [DataMember(Name = "residualToXDeg")] public double? residualToXDeg { get; set; }
            [DataMember(Name = "method")] public string method { get; set; }
        }

        [DataContract]
        public class RequestMetaFinishLine
        {
            [DataMember] public double[][] points { get; set; }
        }

        private static void TryDeleteTempFile(string path, string label)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return;
                File.Delete(path);
                AppLogger.Log($"BackendApiClient: temp {label} deleted: {Path.GetFileName(path)}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"BackendApiClient: temp {label} delete failed: {ex.GetType().Name}:{ex.Message}");
            }
        }
    }
}
