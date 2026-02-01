using Hi_Link.Libraries.Model;
using Hi_Link_Advanced.LinkBridge;
using HiLinkBridgeWebApi48.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Http;
using Mode1Api = HiLinkBridgeWebApi48.Mode1Api;
using PayloadUpdateActivateProg = Hi_Link.Libraries.Model.UpdateMachineActivateProgNo;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class BridgeController : ApiController
    {
        private static readonly ConcurrentDictionary<string, DateTime> ControlCooldowns = new ConcurrentDictionary<string, DateTime>();
        private static readonly TimeSpan ControlCooldownWindow = TimeSpan.FromSeconds(5);
        private static readonly ConcurrentDictionary<string, DateTime> RawReadCooldowns = new ConcurrentDictionary<string, DateTime>();
        private static readonly TimeSpan RawReadCooldownWindow = TimeSpan.FromSeconds(5);

        private const int MANUAL_SLOT_A = 4000;
        private const int MANUAL_SLOT_B = 4001;
        private static readonly Regex FanucRegex = new Regex(@"O(\d{1,5})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private class ManualMachineState
        {
            public int NextSlot;
            public int? LastPreloadedSlot;
            public string LastPreloadedPath;
            public DateTime LastPreloadedAtUtc;
        }

        // POST /machines/{machineId}/manual/preload-mode2
        // Mode2 DLL을 사용하여 프로그램 업로드(UpdateProgram)
        [HttpPost]
        [Route("machines/{machineId}/manual/preload-mode2")]
        public async Task<HttpResponseMessage> ManualPreloadMode2(string machineId, [FromBody] ManualPreloadRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var cooldownKey = $"manualPreloadMode2:{machineId}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            try
            {
                var st = GetOrCreateManualState(machineId);
                var desired = req?.slotNo;
                if (desired.HasValue && desired.Value != MANUAL_SLOT_A && desired.Value != MANUAL_SLOT_B)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "invalid slotNo" });
                }

                var relPath = (req?.path ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(relPath))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
                }

                int slotNo = desired ?? MANUAL_SLOT_A;
                var fullPath = GetSafeBridgeStorePath(relPath);
                if (!File.Exists(fullPath))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new { success = false, message = "file not found", path = relPath });
                }

                var content = File.ReadAllText(fullPath);
                var processed = SanitizeProgramTextForCnc(EnsureProgramHeader(content, slotNo));

                short headType = req?.headType ?? 1; // 기본 Main

                var dto = new UpdateMachineProgramInfo
                {
                    headType = headType,
                    programNo = (short)slotNo,
                    programData = processed,
                    isNew = true,
                };

                var client = new HiLinkMode2Client();
                var resp = await client.RequestRawAsync(machineId, CollectDataType.UpdateProgram, dto, 20000);

                // Mode2 DLL은 응답 형식이 short result 또는 객체일 수 있음
                short rc = 0;
                if (resp is short s)
                {
                    rc = s;
                }
                else if (resp != null)
                {
                    // JSON 직렬화된 객체 형태일 때 result 필드를 우선 시도
                    try
                    {
                        var token = Newtonsoft.Json.Linq.JObject.FromObject(resp);
                        rc = (short)(token.Value<int?>("result") ?? 0);
                    }
                    catch { }
                }

                Console.WriteLine("[ManualPreloadMode2] machine={0} slot=O{1} headType={2} rc={3} respType={4}",
                    machineId, slotNo, headType, rc, resp?.GetType()?.Name ?? "null");

                if (rc != 0)
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = $"UpdateProgram failed (rc={rc})" });
                }

                st.LastPreloadedSlot = slotNo;
                st.LastPreloadedPath = relPath;
                st.LastPreloadedAtUtc = DateTime.UtcNow;

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Manual preload (Mode2) ok",
                    slotNo,
                    nextSlotNo = (slotNo == MANUAL_SLOT_A) ? MANUAL_SLOT_B : MANUAL_SLOT_A,
                    path = relPath
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        private static readonly ConcurrentDictionary<string, ManualMachineState> ManualStates =
            new ConcurrentDictionary<string, ManualMachineState>(StringComparer.OrdinalIgnoreCase);

        private static ManualMachineState GetOrCreateManualState(string machineId)
        {
            return ManualStates.GetOrAdd(machineId, _ => new ManualMachineState
            {
                NextSlot = MANUAL_SLOT_A,
                LastPreloadedSlot = null,
                LastPreloadedPath = null,
                LastPreloadedAtUtc = DateTime.MinValue,
            });
        }

        private static string EnsureProgramHeader(string content, int programNo)
        {
            if (string.IsNullOrEmpty(content)) return content;
            var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None);
            if (lines.Length == 0) return content;

            var firstLine = (lines[0] ?? string.Empty).Trim();
            var m = FanucRegex.Match(firstLine);
            var header = $"O{programNo.ToString().PadLeft(4, '0')}";
            if (m.Success)
            {
                if (int.TryParse(m.Groups[1].Value, out var existing) && existing == programNo)
                {
                    return content;
                }
                // 첫 줄이 이미 O번호라면 교체
                lines[0] = header;
                return string.Join("\r\n", lines);
            }

            // 헤더 삽입
            return header + "\r\n" + content;
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

        public class ManualPreloadRequest
        {
            public string path { get; set; }
            public int? slotNo { get; set; }
            public short? headType { get; set; }
        }

        public class ManualPlayRequest
        {
            public int? slotNo { get; set; }
            public string path { get; set; }
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

        // POST /machines/{machineId}/manual/preload
        [HttpPost]
        [Route("machines/{machineId}/manual/preload")]
        public HttpResponseMessage ManualPreload(string machineId, [FromBody] ManualPreloadRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var relPath = (req?.path ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(relPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
            }

            var desired = req?.slotNo;
            if (desired.HasValue && desired.Value != MANUAL_SLOT_A && desired.Value != MANUAL_SLOT_B)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "invalid slotNo" });
            }

            try
            {
                var st = GetOrCreateManualState(machineId);
                var slotNo = desired.HasValue
                    ? desired.Value
                    : (st.NextSlot == MANUAL_SLOT_B ? MANUAL_SLOT_B : MANUAL_SLOT_A);
                var nextSlotNo = slotNo == MANUAL_SLOT_A ? MANUAL_SLOT_B : MANUAL_SLOT_A;

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
                var processed = SanitizeProgramTextForCnc(EnsureProgramHeader(content, slotNo));

                // CNC 메모리 제약 대응: 대상 슬롯은 삭제 후 업로드 (메인 headType=1)
                try
                {
                    // 선택 슬롯의 기존 프로그램은 삭제 후 업로드 (메인 headType=1)
                    Mode1Api.TryDeleteMachineProgramInfo(machineId, 0, (short)slotNo, out var _, out var _);
                }
                catch { }

                if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = "handle error: " + errUp });
                }

                var info = new UpdateMachineProgramInfo
                {
                    headType = 1, // Main
                    programNo = (short)slotNo,
                    programData = processed,
                    isNew = true,
                };
                var upRc = Hi_Link.HiLink.SetMachineProgramInfo(handle, info);
                if (upRc != 0)
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = "upload failed rc=" + upRc,
                        slotNo
                    });
                }

                st.LastPreloadedSlot = slotNo;
                st.LastPreloadedPath = relPath;
                st.LastPreloadedAtUtc = DateTime.UtcNow;
                // 사용자가 slotNo를 고정 지정하면 내부 토글 상태는 그대로 둔다.
                if (!desired.HasValue)
                {
                    st.NextSlot = nextSlotNo;
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Manual preload ok",
                    slotNo,
                    nextSlotNo,
                    path = relPath,
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        // POST /machines/{machineId}/manual/play
        [HttpPost]
        [Route("machines/{machineId}/manual/play")]
        public async Task<HttpResponseMessage> ManualPlay(string machineId, [FromBody] ManualPlayRequest req)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var cooldownKey = $"manualPlay:{machineId}";
            if (IsControlOnCooldown(cooldownKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new { success = false, message = "Too many requests" });
            }

            try
            {
                var st = GetOrCreateManualState(machineId);
                var desired = req?.slotNo;
                if (desired.HasValue && desired.Value != MANUAL_SLOT_A && desired.Value != MANUAL_SLOT_B)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "invalid slotNo" });
                }

                // path는 필수
                var relPath = (req?.path ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(relPath))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
                }

                if (Mode1Api.TryGetMachineStatus(machineId, out var status, out var statusErr))
                {
                    if (status == MachineStatusType.Alarm)
                    {
                        var alarms = new List<object>();
                        try
                        {
                            if (Mode1Api.TryGetMachineAlarmInfo(machineId, 0, out var alarmInfo0, out var alarmErr0))
                            {
                                if (alarmInfo0.alarmArray != null)
                                {
                                    foreach (var a in alarmInfo0.alarmArray)
                                    {
                                        alarms.Add(new { type = a.type, no = a.no });
                                    }
                                }
                            }
                            else if (Mode1Api.TryGetMachineAlarmInfo(machineId, 1, out var alarmInfo1, out var alarmErr1))
                            {
                                if (alarmInfo1.alarmArray != null)
                                {
                                    foreach (var a in alarmInfo1.alarmArray)
                                    {
                                        alarms.Add(new { type = a.type, no = a.no });
                                    }
                                }
                            }
                        }
                        catch { }

                        // 일부 환경에서 MachineStatus가 Alarm로 나오지만 실제 알람 배열이 비어있는 케이스가 있어,
                        // 알람 배열이 있을 때만 실행을 차단한다.
                        if (alarms.Count > 0)
                        {
                            Console.WriteLine("[ManualPlay] blocked by ALARM machine={0}", machineId);
                            return Request.CreateResponse((HttpStatusCode)409, new
                            {
                                success = false,
                                message = "machine is in ALARM state; clear alarm before manual play",
                                status = status.ToString(),
                                alarms = alarms
                            });
                        }

                        Console.WriteLine("[ManualPlay] MachineStatus=Alarm but alarm list is empty; continue machine={0}", machineId);
                    }
                }
                else
                {
                    Console.WriteLine("[ManualPlay] TryGetMachineStatus failed machine={0} err={1}", machineId, statusErr);
                }

                // 슬롯 결정: 요청 slotNo 우선, 없으면 현재 활성 슬롯을 피해서 4000/4001 중 선택
                int slotNo;
                if (desired.HasValue)
                {
                    slotNo = desired.Value;
                }
                else
                {
                    var active = GetCurrentActiveSlotOrDefault(machineId);
                    if (active == MANUAL_SLOT_A) slotNo = MANUAL_SLOT_B;
                    else if (active == MANUAL_SLOT_B) slotNo = MANUAL_SLOT_A;
                    else slotNo = MANUAL_SLOT_A; // 기본 4000
                }

                // 선택된 슬롯이 현재 활성 슬롯과 같으면 반대 슬롯 사용 (활성 슬롯 모를 경우 그대로)
                var currentActive = GetCurrentActiveSlotOrDefault(machineId);
                if (currentActive > 0 && slotNo == currentActive)
                {
                    slotNo = (slotNo == MANUAL_SLOT_A) ? MANUAL_SLOT_B : MANUAL_SLOT_A;
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

                // 파일을 즉시 업로드 (headType=1 메인)
                var content = File.ReadAllText(fullPath);
                Console.WriteLine("[ManualPlay] file read machine={0} path={1} contentLen={2}", machineId, relPath, content?.Length ?? 0);
                
                var processed = SanitizeProgramTextForCnc(EnsureProgramHeader(content, slotNo));
                Console.WriteLine("[ManualPlay] file processed machine={0} processedLen={1}", machineId, processed?.Length ?? 0);

                try
                {
                    // Main(headType=1)
                    Mode1Api.TryDeleteMachineProgramInfo(machineId, 1, (short)slotNo, out var _, out var _);
                }
                catch { }

                if (!Mode1HandleStore.TryGetHandle(machineId, out var handle, out var errUp))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = "handle error: " + errUp });
                }

                // O4000/O4001 슬롯에 업로드할 때는 programNo를 4000/4001로 설정
                short programNo = (short)slotNo;

                var info = new UpdateMachineProgramInfo
                {
                    headType = 0, // Main (Hi-Link 샘플 기준)
                    programNo = programNo,
                    programData = processed,
                    isNew = true,  // 새 프로그램으로 생성 (기존 프로그램이 없을 수 있으므로)
                };
                
                Console.WriteLine("[ManualPlay] uploading machine={0} slot=O{1} programNo={2} dataLen={3}", 
                    machineId, slotNo, programNo, processed?.Length ?? 0);
                
                var upRc = Hi_Link.HiLink.SetMachineProgramInfo(handle, info);
                if (upRc != 0)
                {
                    Console.WriteLine("[ManualPlay] upload failed machine={0} slot=O{1} programNo={2} rc={3}", 
                        machineId, slotNo, programNo, upRc);
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = "upload failed rc=" + upRc,
                        slotNo,
                        programNo
                    });
                }

                Console.WriteLine("[ManualPlay] upload ok machine={0} slot=O{1} programNo={2}", machineId, slotNo, programNo);

                // 업로드 기록 갱신
                st.LastPreloadedSlot = slotNo;
                st.LastPreloadedPath = relPath;
                st.LastPreloadedAtUtc = DateTime.UtcNow;

                // 업로드 완료 폴링 (최대 20초 대기)
                bool programExists = false;
                int maxRetries = 80;  // 40초 (500ms * 80)
                int retryCount = 0;
                while (retryCount < maxRetries)
                {
                    await Task.Delay(500);
                    retryCount++;

                    if (!Mode1Api.TryGetProgListInfo(machineId, 0, out var progList, out var progErr))
                    {
                        Console.WriteLine("[ManualPlay] TryGetProgListInfo retry={0} failed machine={1} err={2}", retryCount, machineId, progErr);
                        continue;
                    }

                    var found = progList.programArray?.FirstOrDefault(p => p.no == programNo);
                    if (found != null)
                    {
                        programExists = true;
                        Console.WriteLine("[ManualPlay] program verified machine={0} programNo={1} after {2}ms", 
                            machineId, programNo, retryCount * 500);
                        break;
                    }
                }

                // 프로그램이 없으면 업로드 실패로 처리
                if (!programExists)
                {
                    Console.WriteLine("[ManualPlay] program NOT found after polling machine={0} programNo={1} maxRetries={2}", 
                        machineId, programNo, maxRetries);
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = "program not found after upload (timeout)",
                        programNo,
                        slotNo
                    });
                }

                // EDIT 모드로 변경 (프로그램 활성화를 위해 필요)
                if (!Mode1Api.TrySetMachineMode(machineId, "EDIT", out var modeErr))
                {
                    Console.WriteLine("[ManualPlay] SetMachineMode(EDIT) failed machine={0} err={1}", machineId, modeErr);
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = modeErr ?? "SetMachineMode(EDIT) failed" });
                }

                // 모드 변경 후 약간의 지연
                await Task.Delay(300);

                // 모드 변경 후 핸들이 무효화될 수 있으므로 핸들 갱신
                Mode1HandleStore.Invalidate(machineId);

                // Hi-Link 장비/컨트롤러별 headType 매핑 차이 대응:
                // - 어떤 장비는 Main=0, 어떤 장비는 Main=1로 동작하는 케이스가 있어 폴백을 둔다.
                var dto = new PayloadUpdateActivateProg
                {
                    headType = 0,
                    programNo = programNo,
                };

                var act = Mode1HandleStore.SetActivateProgram(machineId, dto, out var actErr);
                if (act != 0)
                {
                    Console.WriteLine("[ManualPlay] SetActivateProgram failed (try headType=0) machine={0} programNo={1} result={2} err={3}",
                        machineId, programNo, act, actErr);

                    // fallback: 기존 구현값(1) 재시도
                    dto.headType = 1;
                    Mode1HandleStore.Invalidate(machineId);
                    act = Mode1HandleStore.SetActivateProgram(machineId, dto, out actErr);
                }

                if (act != 0)
                {
                    Console.WriteLine("[ManualPlay] SetActivateProgram failed machine={0} programNo={1} headType={2} result={3} err={4}",
                        machineId, programNo, dto.headType, act, actErr);
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = actErr ?? ("SetActivateProgram failed (result=" + act + ")") });
                }

                Console.WriteLine("[ManualPlay] activate ok machine={0} programNo={1} headType={2}", machineId, programNo, dto.headType);

                // AUTO 모드로 변경 (가공 모드)
                if (!Mode1Api.TrySetMachineMode(machineId, "AUTO", out var autoModeErr))
                {
                    Console.WriteLine("[ManualPlay] SetMachineMode(AUTO) failed machine={0} err={1}", machineId, autoModeErr);
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = autoModeErr ?? "SetMachineMode(AUTO) failed" });
                }

                // 모드 변경 후 약간의 지연
                await Task.Delay(300);

                // Start
                short ioUid = 61;
                short panelType = 0;
                if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, true, out var startErr))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new { success = false, message = startErr ?? "SetMachinePanelIO failed" });
                }

                Console.WriteLine("[ManualPlay] start signal sent machine={0} slot=O{1}", machineId, slotNo);

                // 주의: 다음 파일 preload는 CncContinuousMachining.PreloadNextJob에서 통합 관리됨
                // Manual play와 continuous machining이 동일한 preload 로직을 공유함

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = "Manual start ok",
                    slotNo,
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        // POST /raw (Mode1 + Mode2 지원: Alarm은 Mode1, 그 외 CollectDataType은 Mode2)
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

            // Alarm은 Mode1 API로 처리 (안정성)
            if (isAlarm)
            {
                short headType = 1;
                var headTypeToken = raw.payload?["headType"];
                if (headTypeToken != null && headTypeToken.Type == JTokenType.Integer)
                {
                    try { headType = (short)headTypeToken.Value<int>(); } catch { }
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

            // Mode2 처리
            if (!Enum.TryParse<CollectDataType>(dataType, ignoreCase: true, out var collectType))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = $"unsupported dataType: {dataType}"
                });
            }

            // 안전한 READ 타입만 허용 (payload 없이)
            var safeReadTypes = new HashSet<CollectDataType>
            {
                CollectDataType.GetOPStatus,
                CollectDataType.GetProgListInfo,
                CollectDataType.GetActivateProgInfo,
                CollectDataType.GetMotorTemperature,
                CollectDataType.GetToolLifeInfo,
                CollectDataType.GetProgDataInfo,
                CollectDataType.GetMachineList,
            };
            if (!safeReadTypes.Contains(collectType))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = $"unsupported mode2 dataType for raw: {collectType}"
                });
            }

            // READ 계열은 과도 호출 쿨다운 적용
            var readKey = $"{raw.uid ?? string.Empty}:{collectType}";
            if (!raw.bypassCooldown && IsRawReadOnCooldown(readKey))
            {
                return Request.CreateResponse((HttpStatusCode)429, new
                {
                    success = false,
                    message = "Too many raw requests"
                });
            }

            var client = new HiLinkMode2Client();
            var timeout = raw.timeoutMilliseconds > 0 ? raw.timeoutMilliseconds : 3000;
            object payloadForMode2 = null;

            // CollectDataType별로 DLL이 기대하는 단순 스칼라 입력을 맞춰준다.
            if (collectType == CollectDataType.GetProgListInfo || collectType == CollectDataType.GetActivateProgInfo)
            {
                // API headType(1=메인, 2=서브)을 Mode2 DLL 기대값(0=메인, 1=서브)으로 변환
                short head = 0;
                try
                {
                    if (raw.payload != null)
                    {
                        var apiHead = raw.payload.Value<int>();
                        head = (short)Math.Max(0, apiHead - 1);
                    }
                }
                catch { /* fallback 0 */ }
                payloadForMode2 = head;
            }

            try
            {
                var resp = await client.RequestRawAsync(raw.uid, collectType, payloadForMode2, timeout);
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = resp
                });
            }
            catch (InvalidCastException ice)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = $"raw request payload/type mismatch: {ice.Message}"
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = ex.Message
                });
            }
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

        // POST /machines/{machineId}/start
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

            if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, status, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "SetMachinePanelIO failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Start signal sent",
                ioUid,
                status
            });
        }

        // POST /machines/{machineId}/reset
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

            // Reset은 항상 새 핸들로 수행한다.
            Mode1HandleStore.Invalidate(machineId);

            if (!Mode1Api.TrySetMachineReset(machineId, out var error))
            {
                var msg = (error ?? "SetMachineReset failed") as string;
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

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Machine reset requested"
            });
        }

        public class MachineModeRequest
        {
            public string mode { get; set; }
        }

        // POST /machines/{machineId}/mode
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

            if (!Mode1Api.TrySetMachineMode(machineId, mode, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "SetMachineMode failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Mode switched",
                mode = mode.ToUpperInvariant()
            });
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

        // POST /machines/{machineId}/stop
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

            if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, status, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "SetMachinePanelIO failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Stop signal sent",
                ioUid,
                status
            });
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

        public class StartStopRequest
        {
            public short? ioUid { get; set; }
            public short? panelType { get; set; }
            public int? status { get; set; }
        }

        // GET /machines/{machineId}/programs (Mode1)
        [HttpGet]
        [Route("machines/{machineId}/programs")]
        public HttpResponseMessage GetProgramList(string machineId, short headType = 1)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            var timeoutMs = 2500;
            var task = System.Threading.Tasks.Task.Run(() =>
            {
                MachineProgramListInfo info;
                string error;
                var ok = Mode1Api.TryGetProgListInfo(machineId, headType, out info, out error);
                return (ok: ok, info: info, error: error);
            });
            var completed = System.Threading.Tasks.Task.WhenAny(task, System.Threading.Tasks.Task.Delay(timeoutMs)).Result;
            if (completed != task)
            {
                Mode1HandleStore.Invalidate(machineId);
                return Request.CreateResponse((HttpStatusCode)504, new
                {
                    success = false,
                    message = $"GetMachineProgramListInfo timeout (>{timeoutMs}ms)"
                });
            }

            var result = task.Result;
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

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = result.info
            });
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

        // POST /machines/{machineId}/programs/delete (Mode1)
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

            if (!Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, programNo, out var activateProgNum, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "DeleteMachineProgramInfo failed"
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Program deleted",
                headType,
                programNo,
                activateProgNum
            });
        }

        // POST /machines/{machineId}/programs/activate (Mode1)
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
                // 실측: headType 1=메인, 2=서브
                headType = req.headType ?? 1,
                programNo = req.programNo.Value
            };

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
                var requestId = payload.Value<string>("requestId");
                var jobId = payload.Value<string>("jobId") ?? Guid.NewGuid().ToString();
                var bridgePath = payload.Value<string>("bridgePath");
                var s3Key = payload.Value<string>("s3Key");
                var s3Bucket = payload.Value<string>("s3Bucket");
                var enqueueFront = payload.Value<bool?>("enqueueFront") ?? false;

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
                    job.originalFileName
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