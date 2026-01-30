using Hi_Link.Libraries.Model;
using Hi_Link_Advanced.LinkBridge;
using HiLinkBridgeWebApi48.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
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
                short headType = 0;
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

            if (!Mode1Api.TrySetMachineReset(machineId, out var error))
            {
                return Request.CreateResponse((HttpStatusCode)500, new
                {
                    success = false,
                    message = error ?? "SetMachineReset failed"
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
        public HttpResponseMessage GetProgramList(string machineId, short headType = 0)
        {
            if (string.IsNullOrWhiteSpace(machineId))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
            }

            // 핸들이 무효(-8)일 수 있으므로 1회 Invalidate 후 재시도
            if (!Mode1Api.TryGetProgListInfo(machineId, headType, out var info, out var error))
            {
                // -8 등 무효 핸들 케이스에서 재시도
                Mode1HandleStore.Invalidate(machineId);
                if (!Mode1Api.TryGetProgListInfo(machineId, headType, out info, out error))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = error ?? "GetMachineProgramListInfo failed"
                    });
                }
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = info
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

                var enqueued = CncContinuousMachining.EnqueueFileJob(
                    machineId,
                    job.fileName,
                    job.requestId,
                    bridgePath,
                    s3Key,
                    s3Bucket,
                    enqueueFront
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

            var state = CncContinuousMachining.GetMachineState(machineId);
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