using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using Hi_Link_Advanced.EdgeBridge;
using Hi_Link.Libraries.Model;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class RawController : ApiController
    {
        // POST /api/cnc/raw
        [HttpPost]
        [Route("raw")]
        public HttpResponseMessage Raw([FromBody] EdgeBridgeBaseDto raw)
        {
            if (raw == null)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body is null" });
            }
            if (string.IsNullOrWhiteSpace(raw.uid))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "uid is required" });
            }
            if (string.IsNullOrWhiteSpace(raw.dataType))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "dataType is required" });
            }

            var dataType = raw.dataType.Trim();
            var isAlarm = string.Equals(dataType, "GetMachineAlarmInfo", StringComparison.OrdinalIgnoreCase);
            var isActivateProgram = string.Equals(dataType, "SetActivateProgram", StringComparison.OrdinalIgnoreCase);
            var isGetProgList = string.Equals(dataType, "GetMachineProgramListInfo", StringComparison.OrdinalIgnoreCase);
            var isGetActivateProg = string.Equals(dataType, "GetMachineActivateProgInfo", StringComparison.OrdinalIgnoreCase);
            var isGetProgData = string.Equals(dataType, "GetMachineProgramData", StringComparison.OrdinalIgnoreCase);
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

                if (BridgeShared.IsMockCncMachiningEnabled())
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
                if (!raw.bypassCooldown && BridgeShared.IsControlOnCooldown(cooldownKey))
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
                        headType = (short)raw.payload.Value<int>("headType");
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
                message = $"Unsupported Mode1 dataType: {dataType}" +
                          " (Mode2 types like GetMotorTemperature/GetToolLifeInfo are disabled)"
            });
        }
    }
}
