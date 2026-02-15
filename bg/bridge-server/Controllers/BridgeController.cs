using Hi_Link.Libraries.Model;
using HiLinkBridgeWebApi48.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Http;
using Hi_Link_Advanced.LinkBridge;
using Hi_Link_Advanced.EdgeBridge;
using Mode1Api = HiLinkBridgeWebApi48.Mode1Api;
using PayloadUpdateActivateProg = Hi_Link.Libraries.Model.UpdateMachineActivateProgNo;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class BridgeController : ApiController
    {
        private static readonly ConcurrentDictionary<string, DateTime> ControlCooldowns = new ConcurrentDictionary<string, DateTime>();
        private static readonly ConcurrentDictionary<string, DateTime> RawReadCooldowns = new ConcurrentDictionary<string, DateTime>();
        private static readonly TimeSpan ControlCooldownWindow = TimeSpan.FromMilliseconds(5000);
        private static readonly TimeSpan RawReadCooldownWindow = TimeSpan.FromMilliseconds(2000);

        private const int SINGLE_SLOT = 4000;
        private static readonly Regex FanucRegex = new Regex(@"O(\d{1,5})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private class JobResult
        {
            public string JobId { get; set; }
            public string Status { get; set; }
            public object Result { get; set; }
            public DateTime CreatedAtUtc { get; set; }
        }

        private static readonly ConcurrentDictionary<string, JobResult> JobResults = 
            new ConcurrentDictionary<string, JobResult>();

        private static string EnsureProgramHeader(string content, int programNo)
        {
            if (string.IsNullOrEmpty(content)) return content;
            var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None);
            if (lines.Length == 0) return content;

            var header = $"O{programNo.ToString().PadLeft(4, '0')}";

            // Fanuc 프로그램은 첫 줄이 '%'인 경우가 많다.
            // 이때 O번호를 '%' 앞에 넣으면, CNC가 '%'에서 프로그램을 끝으로 해석해 본문이 날아갈 수 있다.
            // 따라서 선행 '%' / 공백 라인을 건너뛴 뒤 첫 O라인을 교체(또는 없으면 적절히 삽입)한다.
            int idx = 0;
            while (idx < lines.Length)
            {
                var t = (lines[idx] ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(t))
                {
                    idx++;
                    continue;
                }
                if (t == "%")
                {
                    idx++;
                    continue;
                }
                break;
            }

            if (idx < lines.Length)
            {
                var cur = (lines[idx] ?? string.Empty).Trim();
                var m = FanucRegex.Match(cur);
                if (m.Success)
                {
                    if (int.TryParse(m.Groups[1].Value, out var existing) && existing == programNo)
                    {
                        return content;
                    }
                    lines[idx] = header;
                    return string.Join("\r\n", lines);
                }

                // 첫 유효 라인이 O번호가 아니면, idx 위치에 헤더를 삽입
                var list = lines.ToList();
                list.Insert(idx, header);
                return string.Join("\r\n", list);
            }

            // 전부 공백/% 뿐이면 맨 끝에라도 헤더 추가
            return header + "\r\n" + content;
        }

        private static string EnsureProgramEnvelope(string content)
        {
            if (string.IsNullOrEmpty(content)) return content;

            // Hi-Link 예제 기준: programData는 % ... % 형태로 감싸진 경우가 많아, 없으면 보강한다.
            var trimmed = content.Trim();
            if (string.IsNullOrEmpty(trimmed)) return content;

            var startsWithPercent = trimmed.StartsWith("%", StringComparison.Ordinal);
            var endsWithPercent = trimmed.EndsWith("%", StringComparison.Ordinal);

            var result = trimmed;
            if (!startsWithPercent)
            {
                result = "%\r\n" + result;
            }
            if (!endsWithPercent)
            {
                result = result + "\r\n%";
            }
            return result;
        }

        private static string EnsurePercentAndHeaderSecondLine(string content, int programNo)
        {
            if (string.IsNullOrEmpty(content)) return content;

            var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None)
                .Select(x => x ?? string.Empty)
                .ToList();

            // 선행 공백 라인 제거
            while (lines.Count > 0 && string.IsNullOrWhiteSpace(lines[0]))
            {
                lines.RemoveAt(0);
            }

            var header = $"O{programNo.ToString().PadLeft(4, '0')}";

            if (lines.Count == 0)
            {
                return "%\r\n" + header + "\r\n%";
            }

            // 1행은 무조건 %
            if ((lines[0] ?? string.Empty).Trim() != "%")
            {
                lines.Insert(0, "%");
            }

            // % 다음에 빈 줄이 있으면 제거하여 header가 항상 2행이 되도록
            while (lines.Count > 1 && string.IsNullOrWhiteSpace(lines[1]))
            {
                lines.RemoveAt(1);
            }

            if (lines.Count == 1)
            {
                lines.Add(header);
            }
            else
            {
                lines[1] = header;
            }

            return string.Join("\r\n", lines);
        }

        private static void QueueUploadProgramData(string machineId, short headType, int slotNo, string processed, bool isNew)
        {
            Task.Run(() =>
            {
                try
                {
                    try
                    {
                        Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)slotNo, out var _, out var _);
                    }
                    catch { }

                    if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                    {
                        Console.WriteLine("[SmartUpload] handle error: " + errUp);
                        return;
                    }

                    var info = new UpdateMachineProgramInfo
                    {
                        headType = headType,
                        programNo = (short)slotNo,
                        programData = processed,
                        isNew = isNew,
                    };

                    short upRc;
                    upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle, info), "SetMachineProgramInfo.Async");

                    if (upRc == -8)
                    {
                        Mode1HandleStore.Invalidate(machineId);
                        if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                        {
                            upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle2, info), "SetMachineProgramInfo.Async.retry");
                            if (upRc == -8)
                            {
                                Mode1HandleStore.Invalidate(machineId);
                            }
                        }
                        else
                        {
                            Console.WriteLine("[SmartUpload] handle retry error: " + errUp2);
                        }
                    }
                    if (upRc != 0)
                    {
                        Console.WriteLine("[SmartUpload] upload failed rc={0} for {1}", upRc, machineId);
                        return;
                    }
                    Console.WriteLine("[SmartUpload] success: {0} headType={1} slot={2}", machineId, headType, slotNo);
                }
                catch (Exception ex)
                {
                    Console.WriteLine("[SmartUpload] background error: " + ex);
                }
            });
        }

        private static bool UploadProgramDataBlocking(string machineId, short headType, int slotNo, string processed, bool isNew, out string usedMode, out string error)
        {
            usedMode = null;
            error = null;
            try
            {
                // payload는 CNC/Hi-Link가 ASCII만 안정적인 경우가 있어 ASCII 기준 bytes로 계산한다.
                var bytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);

                // 500KB 상한(요구사항). 장비 메모리 상황에 따라 실패할 수 있으므로, 이 값 초과는 요청 단계에서 차단.
                if (bytes > 512000)
                {
                    error = $"program too large (bytes={bytes}, limit=512000)";
                    return false;
                }

                if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                {
                    error = errUp;
                    return false;
                }

                var info = new UpdateMachineProgramInfo
                {
                    headType = headType,
                    programNo = (short)slotNo,
                    programData = processed,
                    isNew = isNew,
                };

                // EW_BUSY(-1)면 CNC processing 중이므로 대기 후 재시도한다.
                // 요구사항: 최대 20초, 1초 단위 체크
                var busyWaitMaxMs2 = 20000;
                var busyStarted2 = DateTime.UtcNow;
                short upRc = -1;
                for (var attempt = 0; ; attempt++)
                {
                    upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle, info), "SetMachineProgramInfo.Blocking");
                    if (upRc == 0) break;
                    if (upRc == -1)
                    {
                        var elapsedMs = (int)(DateTime.UtcNow - busyStarted2).TotalMilliseconds;
                        if (elapsedMs >= busyWaitMaxMs2)
                        {
                            break;
                        }
                        System.Threading.Thread.Sleep(1000);
                        continue;
                    }
                    break;
                }

                if (upRc == -8)
                {
                    Mode1HandleStore.Invalidate(machineId);
                    if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                    {
                        upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle2, info), "SetMachineProgramInfo.Blocking.retry");
                        if (upRc == -8)
                        {
                            Mode1HandleStore.Invalidate(machineId);
                        }
                    }
                    else
                    {
                        error = errUp2;
                        return false;
                    }
                }
                if (upRc == 0)
                {
                    usedMode = "Mode1";
                    return true;
                }

                // Mode1 실패 시 Mode2로 fallback 재시도(특히 대용량에서 필요)
                var mode1Error = upRc == -1
                    ? $"SetMachineProgramInfo failed (rc=-1, EW_BUSY, waitedMs={(int)(DateTime.UtcNow - busyStarted2).TotalMilliseconds})"
                    : $"SetMachineProgramInfo failed (rc={upRc})";

                // Mode2 제거: Mode1만 사용하므로 실패 시 바로 반환
                error = mode1Error;
                return false;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        private static bool TryVerifyProgramExistsByList(string machineId, short headType, int slotNo, out string error)
        {
            error = null;
            if (!Mode1Api.TryGetProgListInfo(machineId, headType, out var list, out var err))
            {
                error = err ?? "GetProgListInfo failed";
                return false;
            }

            var arr = list.programArray;
            if (arr == null) return false;
            foreach (var p in arr)
            {
                if (p.no == slotNo) return true;
            }
            return false;
        }

        private static async Task<bool> VerifyProgramExists(string machineId, short headType, int slotNo, int timeoutSeconds)
        {
            var started = DateTime.UtcNow;
            // 첫 호출 전 짧은 delay로 업로드 직후 안정화 시간 확보
            await Task.Delay(500);
            
            while (true)
            {
                if ((DateTime.UtcNow - started).TotalSeconds > timeoutSeconds) return false;

                if (Mode1Api.TryGetProgListInfo(machineId, headType, out var progList, out var _))
                {
                    try
                    {
                        var list = progList.programArray;
                        if (list == null)
                        {
                            await Task.Delay(2000);
                            continue;
                        }

                        foreach (var p in list)
                        {
                            if (p.no == slotNo) return true;
                        }
                    }
                    catch { }
                }

                await Task.Delay(2000);
            }
        }

        private static bool TryGetProgramDataPreferMode1(string machineId, short headType, short programNo, out string programData, out string error)
        {
            programData = null;
            error = null;

            var gotAny = false;
            var mode1Data = (string)null;
            var mode1Err = (string)null;

            try
            {
                if (Mode1Api.TryGetProgDataInfo(machineId, headType, programNo, out var info, out var err))
                {
                    gotAny = true;
                    mode1Data = info.programData ?? string.Empty;
                    Console.WriteLine($"[DownloadProgram] Mode1 programData length={mode1Data.Length} uid={machineId} headType={headType} programNo={programNo}");
                }
                else
                {
                    mode1Err = err;
                    Console.WriteLine($"[DownloadProgram] Mode1 GetMachineProgramData failed uid={machineId} headType={headType} programNo={programNo} err={mode1Err}");
                }
            }
            catch (Exception ex)
            {
                mode1Err = ex.Message;
                Console.WriteLine($"[DownloadProgram] Mode1 exception uid={machineId} headType={headType} programNo={programNo} ex={mode1Err}");
            }

            // Mode2 제거: Mode1만 사용
            if (!gotAny)
            {
                error = mode1Err ?? "GetMachineProgramData failed";
                return false;
            }

            programData = mode1Data ?? string.Empty;
            if (programData.Length == 0)
            {
                error = mode1Err ?? "GetMachineProgramData failed";
                return false;
            }

            // // Hi-Link API 제한으로 인한 truncation 경고
            // if (mode1Data.Length > 90000)
            // {
            //     error = $"TRUNCATED: Hi-Link API readback limit (~103KB). Actual program may be larger. Downloaded {mode1Data.Length} bytes.";
            //     Console.WriteLine($"[DownloadProgram] Warning: programData truncated by Hi-Link readback limit (len={mode1Data.Length}) uid={machineId} headType={headType} programNo={programNo}");
            // }
            return true;
        }

        private static bool IsAlarm(string machineId, out string error)
        {
            error = null;

            // mock 모드일 때는 알람을 항상 무시한다.
            if (IsMockCncMachiningEnabled())
            {
                return false;
            }

            if (Mode1Api.TryGetMachineStatus(machineId, out var st, out var stErr))
            {
                if (st == MachineStatusType.Alarm)
                {
                    error = stErr;
                    return true;
                }
            }
            return false;
        }

        private static string SanitizeProgramTextForCnc(string content)
        {
            if (string.IsNullOrEmpty(content)) return content;
            // CNC 컨트롤러/Hi-Link가 비 ASCII 문자를 포함한 프로그램 데이터 업로드에 실패하는 경우가 있어 방어적으로 제거한다.
            // (파일명은 그대로 유지하고, CNC로 보내는 본문만 정리)
            var arr = content.ToCharArray();
            for (int i = 0; i < arr.Length; i++)
            {
                var c = arr[i];
                if (c == '\r' || c == '\n' || c == '\t') continue;
                if (c >= 32 && c <= 126) continue;
                arr[i] = ' ';
            }
            return new string(arr);
        }

        private static bool IsMockCncMachiningEnabled()
        {
            return Config.MockCncMachining;
        }

        private static string GetSafeBridgeStorePath(string relativePath)
        {
            var root = Path.GetFullPath(Config.BridgeStoreRoot);
            var rel = (relativePath ?? string.Empty)
                .Replace('/', Path.DirectorySeparatorChar)
                .Replace("..", string.Empty);

            var combined = Path.Combine(root, rel);
            var full = Path.GetFullPath(combined);
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Path is outside of bridge store root");
            }
            return full;
        }

        private static bool IsControlOnCooldown(string key)
        {
            var now = DateTime.UtcNow;
            if (ControlCooldowns.TryGetValue(key, out var last) && (now - last) < ControlCooldownWindow)
            {
                return true;
            }

            ControlCooldowns[key] = now;
            return false;
        }
        private static bool IsRawReadOnCooldown(string key)
        {
            var now = DateTime.UtcNow;
            if (RawReadCooldowns.TryGetValue(key, out var last) && (now - last) < RawReadCooldownWindow)
            {
                return true;
            }

            RawReadCooldowns[key] = now;
            return false;
        }

        private static int ParseProgramNoFromName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return 0;
            var m = Regex.Match(name.ToUpperInvariant(), @"O(\d{1,5})");
            if (m.Success && int.TryParse(m.Groups[1].Value, out var n) && n > 0) return n;
            var d = Regex.Match(name, @"(\d{1,5})");
            if (d.Success && int.TryParse(d.Groups[1].Value, out var n2) && n2 > 0) return n2;
            return 0;
        }

        private static int GetCurrentActiveSlotOrDefault(string machineId)
        {
            if (Mode1Api.TryGetActivateProgInfo(machineId, out var info, out var _))
            {
                var n = ParseProgramNoFromName(info.MainProgramName);
                if (n <= 0) n = ParseProgramNoFromName(info.SubProgramName);
                return n;
            }
            return 0;
        }

        // POST /machines/{machineId}/smart/upload
        [HttpPost]
        [Route("machines/{machineId}/smart/upload")]
        public HttpResponseMessage SmartUploadProgram(string machineId, [FromBody] SmartUploadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var headType = req?.headType ?? (short)1;
            var relPath = (req?.path ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(relPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
            }

            var fullPath = GetSafeBridgeStorePath(relPath);
            if (!File.Exists(fullPath))
            {
                return Request.CreateResponse(HttpStatusCode.NotFound, new
                {
                    success = false,
                    message = "file not found",
                    path = relPath
                });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[SmartUpload] jobId={jobId} accepted. machineId={machineId} path={relPath}");

            // 즉시 응답: 작업 수락됨
            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Smart upload job accepted",
                jobId = jobId,
                machineId = machineId,
                path = relPath,
            });

            // 백그라운드에서 작업 처리
            Task.Run(async () =>
            {
                try
                {
                    var slotNo = 4000;
                    var content = File.ReadAllText(fullPath);
                    var enforced = EnsurePercentAndHeaderSecondLine(content, slotNo);
                    var processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(enforced));

                    var processedLen = (processed ?? string.Empty).Length;
                    var processedBytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);

                    Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)slotNo, out var _, out var _);

                    enforced = EnsurePercentAndHeaderSecondLine(content, slotNo);
                    processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(enforced));
                    processedLen = (processed ?? string.Empty).Length;
                    processedBytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);

                    if (processedBytes > 512000)
                    {
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = "program is too large (max 500KB)", bytes = processedBytes },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    if (!UploadProgramDataBlocking(machineId, headType, slotNo, processed, req?.isNew ?? true, out var usedMode, out var upErr))
                    {
                        Console.WriteLine($"[SmartUpload] jobId={jobId} failed: {upErr}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = upErr ?? "upload failed", usedMode },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[SmartUpload] jobId={jobId} completed. slotNo={slotNo} bytes={processedBytes}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new
                        {
                            success = true,
                            message = "Smart program uploaded",
                            headType,
                            slotNo,
                            programName = $"O{slotNo.ToString().PadLeft(4, '0')}",
                            path = relPath,
                            length = processedLen,
                            bytes = processedBytes,
                        },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SmartUpload] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // GET /machines/{machineId}/jobs/{jobId}
        [HttpGet]
        [Route("machines/{machineId}/jobs/{jobId}")]
        public HttpResponseMessage GetJobResult(string machineId, string jobId)
        {
            if (!JobResults.TryGetValue(jobId, out var result))
            {
                return Request.CreateResponse(HttpStatusCode.NotFound, new
                {
                    success = false,
                    message = "job not found",
                    jobId
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                jobId = result.JobId,
                status = result.Status,
                result = result.Result,
                createdAtUtc = result.CreatedAtUtc
            });
        }

 
        // POST /raw (Mode1 only)
        [HttpPost]
        [Route("raw")]
        public async Task<HttpResponseMessage> Raw(RawHiLinkRequest raw)
        {
            if (raw == null || string.IsNullOrWhiteSpace(raw.dataType))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "dataType is required" });
            }

            var dataType = raw.dataType.Trim();
            var isAlarm = string.Equals(dataType, "GetMachineAlarmInfo", StringComparison.OrdinalIgnoreCase);
            var isActivateProgram = string.Equals(dataType, "SetActivateProgram", StringComparison.OrdinalIgnoreCase);
            var isGetProgList = string.Equals(dataType, "GetProgListInfo", StringComparison.OrdinalIgnoreCase);
            var isGetActivateProg = string.Equals(dataType, "GetActivateProgInfo", StringComparison.OrdinalIgnoreCase);
            var isGetProgData = string.Equals(dataType, "GetProgDataInfo", StringComparison.OrdinalIgnoreCase);
            var isGetMachineList = string.Equals(dataType, "GetMachineList", StringComparison.OrdinalIgnoreCase);
            var isGetMachineStatus = string.Equals(dataType, "GetMachineStatus", StringComparison.OrdinalIgnoreCase);
            var isGetOpStatus = string.Equals(dataType, "GetOPStatus", StringComparison.OrdinalIgnoreCase);

            // Alarm은 Mode1 API로 처리 (안정성)
            if (isAlarm)
            {
                short headType = 1;
                var headTypeToken = raw.payload?["headType"];
                if (headTypeToken != null)
                {
                    try { headType = (short)headTypeToken.Value<int>(); } catch { }
                }

                if (IsMockCncMachiningEnabled())
                {
                    return Request.CreateResponse(HttpStatusCode.OK, new
                    {
                        success = true,
                        data = new { headType = headType, alarms = new object[0] }
                    });
                }

                if (!Mode1Api.TryGetMachineAlarmInfo(raw.uid, headType, out var data, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = err ?? "GetMachineAlarmInfo failed",
                    });
                }

                var alarms = new List<object>();
                if (data.alarmArray != null)
                {
                    foreach (var a in data.alarmArray)
                    {
                        alarms.Add(new { type = a.type, no = a.no });
                    }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = new { headType = data.headType, alarms }
                });
            }

            // Machine list (Mode1, SSOT=machines.json)
            if (isGetMachineList)
            {
                if (!Mode1Api.TryGetMachineList(out var list, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = err ?? "GetMachineList failed" });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = list });
            }

            // Machine status (Mode1)
            if (isGetMachineStatus || isGetOpStatus)
            {
                if (!Mode1Api.TryGetMachineStatus(raw.uid, out var status, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = err ?? "GetMachineStatus failed" });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = new { status = status.ToString() }
                });
            }

            // Program list (Mode1)
            if (isGetProgList)
            {
                short headType = 1;
                try
                {
                    if (raw.payload != null)
                    {
                        headType = (short)raw.payload.Value<int>();
                    }
                }
                catch { }

                // API headType: 1=메인, 2=서브. Mode1 API는 메인/서브를 0/1로 쓰는 케이스가 있어 0/1로 정규화한다.
                short mapped = (short)Math.Max(0, headType - 1);
                if (!Mode1Api.TryGetProgListInfo(raw.uid, mapped, out var info, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = err ?? "GetProgListInfo failed" });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = info });
            }

            // Activate program info (Mode1)
            if (isGetActivateProg)
            {
                if (!Mode1Api.TryGetActivateProgInfo(raw.uid, out var info, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = err ?? "GetActivateProgInfo failed" });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = info });
            }

            // Program data info (Mode1)
            if (isGetProgData)
            {
                short headType = 1;
                short programNo = 0;
                try
                {
                    if (raw.payload?[("headType")] != null)
                    {
                        headType = (short)raw.payload.Value<int>("headType");
                    }
                    if (raw.payload?[("programNo")] != null)
                    {
                        programNo = (short)raw.payload.Value<int>("programNo");
                    }
                }
                catch { }
                if (programNo <= 0)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
                }
                // API headType: 1=메인, 2=서브. Mode1은 1/2를 그대로 쓰는 DTO가 많아 그대로 전달한다.
                if (!Mode1Api.TryGetProgDataInfo(raw.uid, headType, programNo, out var info, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = err ?? "GetProgDataInfo failed" });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = info });
            }

            // Program 활성화 (Mode1 control)
            if (isActivateProgram)
            {
                var cooldownKey = $"activate:{raw.uid}";
                if (!raw.bypassCooldown && IsControlOnCooldown(cooldownKey))
                {
                    return Request.CreateResponse((HttpStatusCode)429, new
                    {
                        success = false,
                        message = "Too many activate requests"
                    });
                }

                short headType = 1; // 기본 메인
                short programNo = 0;
                try
                {
                    if (raw.payload?["headType"] != null)
                    {
                        headType = (short)raw.payload.Value<int>("headType"); // 1=메인, 2=서브
                    }
                    if (raw.payload?["programNo"] != null)
                    {
                        programNo = (short)raw.payload.Value<int>("programNo");
                    }
                }
                catch { /* fallback to defaults */ }

                if (programNo <= 0)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        success = false,
                        message = "programNo is required"
                    });
                }

                var dto = new PayloadUpdateActivateProg
                {
                    headType = headType, // 1=메인, 2=서브 (실측)
                    programNo = programNo
                };
                var res = Mode1HandleStore.SetActivateProgram(raw.uid, dto, out var err);
                if (res != 0)
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = err ?? $"SetActivateProgram failed (result={res})"
                    });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Program activated",
                    programNo = dto.programNo,
                    headType = dto.headType
                });
            }

            return Request.CreateResponse(HttpStatusCode.BadRequest, new
            {
                success = false,
                message = $"unsupported dataType (mode1-only): {dataType}" +
                          " (Mode2 types like GetMotorTemperature/GetToolLifeInfo are disabled)"
            });
        }

        // 프런트에서 /machines/{id}/raw로 호출하는 경로 호환
        [HttpPost]
        [Route("machines/{machineId}/raw")]
        public Task<HttpResponseMessage> RawForMachine(string machineId, RawHiLinkRequest raw)
        {
            if (raw == null)
            {
                raw = new RawHiLinkRequest();
            }
            if (string.IsNullOrWhiteSpace(raw.uid))
            {
                raw.uid = machineId;
            }
            return Raw(raw);
        }

        // POST /machines/{machineId}/start (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/start")]
        public HttpResponseMessage MachineStart(string machineId, [FromBody] StartStopRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var cooldownKey = $"start:{machineId}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            short ioUid = req?.ioUid ?? 61;
            short panelType = req?.panelType ?? 0;
            bool status = req?.status == null || req?.status == 1;

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[MachineStart] jobId={jobId} accepted. machineId={machineId} ioUid={ioUid}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Start signal job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, status, out var error))
                    {
                        Console.WriteLine($"[MachineStart] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? "SetMachinePanelIO failed" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[MachineStart] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Start signal sent", ioUid, status },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[MachineStart] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // POST /machines/{machineId}/reset (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/reset")]
        public HttpResponseMessage MachineReset(string machineId)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var cooldownKey = $"reset:{machineId}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[MachineReset] jobId={jobId} accepted. machineId={machineId}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Reset job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    Mode1HandleStore.Invalidate(machineId);

                    if (!Mode1Api.TrySetMachineReset(machineId, out var error))
                    {
                        var msg = (error ?? "SetMachineReset failed") as string;
                        if (!string.IsNullOrEmpty(msg) && msg.Contains("result=-8"))
                        {
                            msg = msg + " (무효 핸들러: 다시 시도하세요)";
                        }
                        Console.WriteLine($"[MachineReset] jobId={jobId} failed: {msg}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = msg },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[MachineReset] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Machine reset completed" },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[MachineReset] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        public class MachineModeRequest
        {
            public string mode { get; set; }
        }

        // POST /machines/{machineId}/mode (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/mode")]
        public HttpResponseMessage MachineMode(string machineId, [FromBody] MachineModeRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var mode = (req?.mode ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(mode))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "mode is required (EDIT/AUTO)" });
            }

            var cooldownKey = $"mode:{machineId}:{mode.ToUpperInvariant()}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[MachineMode] jobId={jobId} accepted. machineId={machineId} mode={mode}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Mode change job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    if (!Mode1Api.TrySetMachineMode(machineId, mode, out var error))
                    {
                        Console.WriteLine($"[MachineMode] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? "SetMachineMode failed" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[MachineMode] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Mode switched", mode = mode.ToUpperInvariant() },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[MachineMode] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // POST /machines/{machineId}/programs/activate-sub (Mode1, headType 기본 1)
        [HttpPost]
        [Route("machines/{machineId}/programs/activate-sub")]
        public HttpResponseMessage ActivateProgramSub(string machineId, [FromBody] ActivateProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (req == null || !req.programNo.HasValue || req.programNo.Value <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var dto = new PayloadUpdateActivateProg
            {
                // 실측: headType 1=메인, 2=서브
                headType = 2,
                programNo = req.programNo.Value
            };

            // 서브 활성화 시 핸들을 초기화하여 Main/기존 상태 캐시 영향을 줄인다.
            Mode1HandleStore.Invalidate(machineId);

            var res = Mode1HandleStore.SetActivateProgram(machineId, dto, out var error);
            if (res != 0)
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? $"SetActivateProgram failed (result={res})"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Program activated",
                programNo = dto.programNo,
                headType = dto.headType
            });
        }

        // POST /machines/{machineId}/stop (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/stop")]
        public HttpResponseMessage MachineStop(string machineId, [FromBody] StartStopRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var cooldownKey = $"stop:{machineId}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            short ioUid = req?.ioUid ?? 62;
            short panelType = req?.panelType ?? 0;
            bool status = req?.status == null || req?.status == 1;

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[MachineStop] jobId={jobId} accepted. machineId={machineId} ioUid={ioUid}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Stop signal job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, status, out var error))
                    {
                        Console.WriteLine($"[MachineStop] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? "SetMachinePanelIO failed" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[MachineStop] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Stop signal sent", ioUid, status },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[MachineStop] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // GET /machines/{machineId}/status
        [HttpGet]
        [Route("machines/{machineId}/status")]
        public HttpResponseMessage MachineStatus(string machineId)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (!Mode1Api.TryGetMachineStatus(machineId, out var status, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "GetMachineStatus failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                status = status.ToString()
            });
        }

        // GET /machines/{machineId}/alarms (Mode1)
        [HttpGet]
        [Route("machines/{machineId}/alarms")]
        public HttpResponseMessage GetMachineAlarms(string machineId, short headType = 1)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (IsMockCncMachiningEnabled())
            {
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = new { headType = headType, alarms = new object[0] }
                });
            }

            if (!Mode1Api.TryGetMachineAlarmInfo(machineId, headType, out var data, out var err))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = err ?? "GetMachineAlarmInfo failed",
                });
            }

            var alarms = new List<object>();
            if (data.alarmArray != null)
            {
                foreach (var a in data.alarmArray)
                {
                    alarms.Add(new { type = a.type, no = a.no });
                }
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = new { headType = data.headType, alarms }
            });
        }

        public class StartStopRequest
        {
            public short? ioUid { get; set; }
            public short? panelType { get; set; }
            public int? status { get; set; }
        }

        // POST /machines/{machineId}/smart/download (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/smart/download")]
        public HttpResponseMessage SmartDownloadProgram(string machineId, [FromBody] DownloadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var headType = req?.headType ?? (short)1;
            var programNo = req?.programNo ?? (short)0;
            var relPath = (req?.path ?? string.Empty).Trim();

            if (programNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[SmartDownload] jobId={jobId} accepted. machineId={machineId} headType={headType} programNo={programNo} path={relPath}");

            // 즉시 응답: 작업 수락됨
            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Smart download job accepted",
                jobId = jobId,
                machineId = machineId,
                headType,
                programNo,
            });

            // 백그라운드에서 작업 처리
            Task.Run(() =>
            {
                try
                {
                    var cooldownKey = $"downloadProgram:{machineId}:{headType}:{programNo}";
                    if (IsRawReadOnCooldown(cooldownKey))
                    {
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = "Too many requests" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    if (!TryGetProgramDataPreferMode1(machineId, headType, programNo, out var programData, out var error))
                    {
                        Console.WriteLine($"[SmartDownload] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? "GetMachineProgramData failed" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    int length = (programData ?? string.Empty).Length;
                    string savedPath = null;

                    if (!string.IsNullOrWhiteSpace(relPath))
                    {
                        try
                        {
                            var fullPath = GetSafeBridgeStorePath(relPath);
                            var dir = Path.GetDirectoryName(fullPath);
                            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                            {
                                Directory.CreateDirectory(dir);
                            }
                            File.WriteAllText(fullPath, programData ?? string.Empty, Encoding.ASCII);
                            savedPath = relPath;
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[SmartDownload] jobId={jobId} file write failed: {ex.Message}");
                        }
                    }

                    Console.WriteLine($"[SmartDownload] jobId={jobId} completed. length={length} path={savedPath}");

                    var resultObj = new
                    {
                        success = true,
                        headType,
                        slotNo = programNo,
                        path = savedPath,
                        length,
                        warning = (string)null,
                    };

                    if (!string.IsNullOrEmpty(error) && error.StartsWith("TRUNCATED:"))
                    {
                        resultObj = new
                        {
                            success = true,
                            headType,
                            slotNo = programNo,
                            path = savedPath,
                            length,
                            warning = error,
                        };
                    }

                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = resultObj,
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SmartDownload] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // GET /machines/{machineId}/programs (Mode1) - 레거시 호환
        [HttpGet]
        [Route("machines/{machineId}/programs")]
        public async Task<HttpResponseMessage> GetProgramList(string machineId, short headType = 1, short? slotNo = null, string path = null)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            // slotNo가 있으면: 프로그램 1개 다운로드(필요 시 파일 저장) - 레거시 호환
            if (slotNo.HasValue && slotNo.Value > 0)
            {
                var programNo = slotNo.Value;
                var relPath = (path ?? string.Empty).Trim();

                var cooldownKey = $"downloadProgram:get:{machineId}:{headType}:{programNo}";
                if (IsRawReadOnCooldown(cooldownKey))
                {
                    return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
                }

                if (!TryGetProgramDataPreferMode1(machineId, headType, programNo, out var programData, out var error))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = error ?? "GetMachineProgramData failed",
                    });
                }

                try
                {
                    int length = (programData ?? string.Empty).Length;
                    string savedPath = null;

                    if (!string.IsNullOrWhiteSpace(relPath))
                    {
                        var fullPath = GetSafeBridgeStorePath(relPath);
                        var dir = Path.GetDirectoryName(fullPath);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                        {
                            Directory.CreateDirectory(dir);
                        }
                        File.WriteAllText(fullPath, programData ?? string.Empty, Encoding.ASCII);
                        savedPath = relPath;
                    }

                    var resp = new
                    {
                        success = true,
                        headType,
                        slotNo = programNo,
                        path = savedPath,
                        length,
                        warning = (string)null,
                    };

                    if (!string.IsNullOrEmpty(error) && error.StartsWith("TRUNCATED:"))
                    {
                        return Request.CreateResponse(HttpStatusCode.OK, new
                        {
                            success = true,
                            headType,
                            slotNo = programNo,
                            path = savedPath,
                            length,
                            warning = error,
                        });
                    }

                    return Request.CreateResponse(HttpStatusCode.OK, new
                    {
                        success = true,
                        headType,
                        slotNo = programNo,
                        path = savedPath,
                        length,
                    });
                }
                catch (Exception ex)
                {
                    return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                    {
                        success = false,
                        message = ex.Message,
                    });
                }
            }

            var timeoutMs = 2500;
            var task = System.Threading.Tasks.Task.Factory.StartNew(() =>
            {
                MachineProgramListInfo info;
                string error;
                var ok = Mode1Api.TryGetProgListInfo(machineId, headType, out info, out error);
                return (ok: ok, info: info, error: error);
            }, System.Threading.Tasks.TaskCreationOptions.LongRunning);

            var completed = await System.Threading.Tasks.Task.WhenAny(task, System.Threading.Tasks.Task.Delay(timeoutMs));
            if (completed != task)
            {
                Mode1HandleStore.Invalidate(machineId);
                return Request.CreateResponse((HttpStatusCode)504, new
                {
                    success = false,
                    message = $"GetMachineProgramListInfo timeout (>{timeoutMs}ms)"
                });
            }

            var result = await task;
            if (!result.ok)
            {
                var msg = (result.error ?? "GetMachineProgramListInfo failed") as string;
                if (!string.IsNullOrEmpty(msg) && msg.Contains("result=-8"))
                {
                    msg = msg + " (무효 핸들러: 다시 시도하세요)";
                }
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = msg
                });
            }

            // headType을 명시적으로 설정
            var responseInfo = result.info;
            responseInfo.headType = headType;
            
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = responseInfo
            });
        }

        public class UploadProgramRequest
        {
            public short? headType { get; set; }
            public int? slotNo { get; set; }
            public string path { get; set; }
            public bool? isNew { get; set; }
        }

        public class SmartUploadProgramRequest
        {
            public short? headType { get; set; }
            public string path { get; set; }
            public bool? isNew { get; set; }
        }

        // POST /machines/{machineId}/programs (Mode1)
        [HttpPost]
        [Route("machines/{machineId}/programs")]
        public HttpResponseMessage UploadProgram(string machineId, [FromBody] UploadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var headType = req?.headType ?? (short)1;
            var slotNo = req?.slotNo ?? 0;
            if (slotNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "slotNo is required" });
            }

            var relPath = (req?.path ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(relPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
            }

            try
            {
                var fullPath = GetSafeBridgeStorePath(relPath);
                if (!File.Exists(fullPath))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
                    {
                        success = false,
                        message = "file not found",
                        path = relPath
                    });
                }

                var content = File.ReadAllText(fullPath);
                var processed = SanitizeProgramTextForCnc(EnsureProgramEnvelope(EnsureProgramHeader(content, slotNo)));

                Task.Run(() =>
                {
                    try
                    {
                        try
                        {
                            Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)slotNo, out var _, out var _);
                        }
                        catch { }

                        if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                        {
                            Console.WriteLine("[UploadProgram] handle error: " + errUp);
                            return;
                        }

                        var info = new UpdateMachineProgramInfo
                        {
                            headType = headType,
                            programNo = (short)slotNo,
                            programData = processed,
                            isNew = req?.isNew ?? true,
                        };
                        var upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle, info), "SetMachineProgramInfo.UploadProgram");
                        if (upRc == -8)
                        {
                            Mode1HandleStore.Invalidate(machineId);
                            if (Mode1HandleStore.TryGetHandle(machineId, out var handle2, out var errUp2))
                            {
                                upRc = HiLinkDllGate.Run(Mode1Api.DllLock, () => Hi_Link.HiLink.SetMachineProgramInfo(handle2, info), "SetMachineProgramInfo.UploadProgram.retry");
                                if (upRc == -8)
                                {
                                    Mode1HandleStore.Invalidate(machineId);
                                }
                            }
                            else
                            {
                                Console.WriteLine("[UploadProgram] handle retry error: " + errUp2);
                            }
                        }
                        if (upRc != 0)
                        {
                            Console.WriteLine("[UploadProgram] upload failed rc={0} for {1}", upRc, machineId);
                            return;
                        }
                        Console.WriteLine("[UploadProgram] success: {0} headType={1} slot={2}", machineId, headType, slotNo);
                    }
                    catch (Exception bgEx)
                    {
                        Console.WriteLine("[UploadProgram] background error: " + bgEx);
                    }
                });

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Program upload queued",
                    headType,
                    slotNo,
                    path = relPath,
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        public class DownloadProgramRequest
        {
            public short? headType { get; set; }
            public short? programNo { get; set; }
            public string path { get; set; }
        }

        // POST /machines/{machineId}/programs/download (Mode1)
        [HttpPost]
        [Route("machines/{machineId}/programs/download")]
        public HttpResponseMessage DownloadProgram(string machineId, [FromBody] DownloadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var headType = req?.headType ?? (short)1;
            var programNo = req?.programNo ?? (short)0;
            if (programNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var relPath = (req?.path ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(relPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
            }

            var cooldownKey = $"downloadProgram:{machineId}:{headType}:{programNo}";
            if (IsRawReadOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            if (!TryGetProgramDataPreferMode1(machineId, headType, programNo, out var programData, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "GetMachineProgramData failed",
                });
            }

            try
            {
                var fullPath = GetSafeBridgeStorePath(relPath);
                var dir = Path.GetDirectoryName(fullPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                File.WriteAllText(fullPath, programData ?? string.Empty, Encoding.ASCII);

                if (!string.IsNullOrEmpty(error) && error.StartsWith("TRUNCATED:"))
                {
                    return Request.CreateResponse(HttpStatusCode.OK, new
                    {
                        success = true,
                        headType,
                        programNo,
                        path = relPath,
                        length = (programData ?? string.Empty).Length,
                        warning = error,
                    });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    headType,
                    programNo,
                    path = relPath,
                    length = (programData ?? string.Empty).Length,
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = ex.Message,
                });
            }
        }

        // GET /machines/{machineId}/programs/active (Mode1)
        [HttpGet]
        [Route("machines/{machineId}/programs/active")]
        public HttpResponseMessage GetActiveProgram(string machineId)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (!Mode1Api.TryGetActivateProgInfo(machineId, out var info, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "GetMachineActivateProgInfo failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = info
            });
        }

        public class ActivateProgramRequest
        {
            public short? headType { get; set; }
            public short? programNo { get; set; }
        }

        public class DeleteProgramRequest
        {
            public short? headType { get; set; }
            public short? programNo { get; set; }
        }

        // POST /machines/{machineId}/programs/delete (Mode1) (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/programs/delete")]
        public HttpResponseMessage DeleteProgram(string machineId, [FromBody] DeleteProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var headType = req?.headType ?? (short)0;
            var programNo = req?.programNo ?? (short)0;
            if (programNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var cooldownKey = $"deleteProgram:{machineId}:{headType}:{programNo}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[DeleteProgram] jobId={jobId} accepted. machineId={machineId} programNo={programNo}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Delete program job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    if (!Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, programNo, out var activateProgNum, out var error))
                    {
                        Console.WriteLine($"[DeleteProgram] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? "DeleteMachineProgramInfo failed" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[DeleteProgram] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Program deleted", headType, programNo, activateProgNum },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[DeleteProgram] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // POST /machines/{machineId}/programs/activate (Mode1) (이중 응답 방식)
        [HttpPost]
        [Route("machines/{machineId}/programs/activate")]
        public HttpResponseMessage ActivateProgram(string machineId, [FromBody] ActivateProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (req == null || !req.programNo.HasValue || req.programNo.Value <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var dto = new PayloadUpdateActivateProg
            {
                headType = req.headType ?? 1,
                programNo = req.programNo.Value
            };

            var jobId = Guid.NewGuid().ToString("N");
            Console.WriteLine($"[ActivateProgram] jobId={jobId} accepted. machineId={machineId} programNo={dto.programNo}");

            var immediateResponse = Request.CreateResponse(HttpStatusCode.Accepted, new
            {
                success = true,
                message = "Activate program job accepted",
                jobId = jobId,
                machineId = machineId,
            });

            Task.Run(() =>
            {
                try
                {
                    var res = Mode1HandleStore.SetActivateProgram(machineId, dto, out var error);
                    if (res != 0)
                    {
                        Console.WriteLine($"[ActivateProgram] jobId={jobId} failed: {error}");
                        JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = error ?? $"SetActivateProgram failed (result={res})" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        return;
                    }

                    Console.WriteLine($"[ActivateProgram] jobId={jobId} completed");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "COMPLETED",
                        Result = new { success = true, message = "Program activated", programNo = dto.programNo, headType = dto.headType },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[ActivateProgram] jobId={jobId} exception: {ex.Message}");
                    JobResults[jobId] = new JobResult
                    {
                        JobId = jobId,
                        Status = "FAILED",
                        Result = new { success = false, message = ex.Message },
                        CreatedAtUtc = DateTime.UtcNow
                    };
                }
            });

            return immediateResponse;
        }

        // POST /machines/{machineId}/continuous/enqueue
        [HttpPost]
        [Route("machines/{machineId}/continuous/enqueue")]
        public HttpResponseMessage EnqueueContinuousJob(string machineId, [FromBody] JObject payload)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            if (payload == null)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "payload is required" });
            }

            try
            {
                var fileName = payload.Value<string>("fileName");
                var originalFileName = payload.Value<string>("originalFileName");
                var requestId = payload.Value<string>("requestId");
                var jobId = payload.Value<string>("jobId") ?? Guid.NewGuid().ToString();
                var bridgePath = payload.Value<string>("bridgePath");
                var s3Key = payload.Value<string>("s3Key");
                var s3Bucket = payload.Value<string>("s3Bucket");
                var enqueueFront = payload.Value<bool?>("enqueueFront") ?? false;
                var paused = payload.Value<bool?>("paused") ?? true;
                var allowAutoStart = payload.Value<bool?>("allowAutoStart") ?? false;

                if (string.IsNullOrEmpty(fileName))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "fileName is required" });
                }

                var job = new CncJobItem
                {
                    id = jobId,
                    fileName = fileName,
                    requestId = requestId,
                    kind = CncJobKind.File
                };

                var enqueued = CncMachining.EnqueueFileJob(
                    machineId,
                    job.fileName,
                    job.requestId,
                    bridgePath,
                    s3Key,
                    s3Bucket,
                    enqueueFront,
                    originalFileName,
                    paused,
                    allowAutoStart
                );
                if (enqueued == null)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        success = false,
                        message = "failed to enqueue job"
                    });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Job enqueued for continuous machining",
                    jobId = jobId,
                    machineId = machineId
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = ex.Message
                });
            }
        }

        // GET /machines/{machineId}/continuous/state
        [HttpGet]
        [Route("machines/{machineId}/continuous/state")]
        public HttpResponseMessage GetContinuousState(string machineId)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var state = CncMachining.GetMachineState(machineId);
            if (state == null)
            {
                return Request.CreateResponse(HttpStatusCode.NotFound, new
                {
                    success = false,
                    message = "Machine state not found"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = state
            });
        }
    }
}