using System;
using System.Collections;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using Hi_Link.Libraries.Model;
using Hi_Link_Advanced.LinkBridge;
using HiLinkBridgeWebApi48.Models;
using PayloadUpdateActivateProg = Hi_Link.Libraries.Model.UpdateMachineActivateProgNo;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class RawController : ApiController
    {
        private static readonly HiLinkMode2Client Mode2Client = new HiLinkMode2Client();

        private static object ReadProp(object obj, string propName)
        {
            if (obj == null || string.IsNullOrWhiteSpace(propName)) return null;
            var p = obj.GetType().GetProperty(propName);
            return p == null ? null : p.GetValue(obj, null);
        }

        private static bool TryEnsureMode2Machine(string uid, out string err)
        {
            err = null;
            var id = (uid ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(id))
            {
                err = "uid is required";
                return false;
            }

            MachineConfigItem cfg = null;
            var list = MachinesConfigStore.Load();
            if (list != null)
            {
                foreach (var item in list)
                {
                    if (item == null) continue;
                    if (string.Equals((item.uid ?? string.Empty).Trim(), id, StringComparison.OrdinalIgnoreCase))
                    {
                        cfg = item;
                        break;
                    }
                }
            }

            if (cfg == null || string.IsNullOrWhiteSpace(cfg.ip) || cfg.port <= 0)
            {
                err = "machine config not found for Mode2";
                return false;
            }

            try
            {
                var add = Mode2Client.AddMachineAsync(id, cfg.ip, cfg.port).GetAwaiter().GetResult();
                if (add.success) return true;

                // 이미 등록된 장비 등 Add 실패 케이스는 Update로 재동기화 시도
                var upd = Mode2Client.UpdateMachineAsync(id, cfg.ip, cfg.port).GetAwaiter().GetResult();
                if (upd.success) return true;

                err = string.Format("Mode2 add/update failed (add={0}, update={1})", add.resultCode.HasValue ? add.resultCode.Value.ToString() : "null", upd.resultCode.HasValue ? upd.resultCode.Value.ToString() : "null");
                return false;
            }
            catch (Exception ex)
            {
                err = ex.Message;
                return false;
            }
        }

        private static List<object> BuildTempInfoRows(object machineMotorTemperature)
        {
            var rows = new List<object>();
            if (machineMotorTemperature == null) return rows;

            var names = new[] { "tempInfo", "mainMotorArray", "subMotorArray", "spindleMotorArray" };
            foreach (var n in names)
            {
                var listObj = ReadProp(machineMotorTemperature, n);
                var enumerable = listObj as IEnumerable;
                if (enumerable == null) continue;

                foreach (var item in enumerable)
                {
                    if (item == null) continue;
                    var name = Convert.ToString(ReadProp(item, "name") ?? string.Empty).Trim();
                    if (string.IsNullOrWhiteSpace(name)) continue;

                    var temperatureObj = ReadProp(item, "temperature");
                    double parsed;
                    var hasTemp = double.TryParse(Convert.ToString(temperatureObj), out parsed);
                    rows.Add(new
                    {
                        name,
                        temperature = hasTemp ? (double?)parsed : null,
                    });
                }
            }

            return rows;
        }

        // POST /api/cnc/raw
        [HttpPost]
        [Route("raw")]
        public HttpResponseMessage Raw([FromBody] RawHiLinkRequest raw)
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
            var isGetMotorTemperature = string.Equals(dataType, "GetMotorTemperature", StringComparison.OrdinalIgnoreCase);

            // Alarm은 Mode1 API로 처리 (안정성)
            if (isAlarm)
            {
                short headType = 1;
                var headTypeToken = raw.payload?["headType"];
                if (headTypeToken != null)
                {
                    try { headType = (short)headTypeToken.ToObject<int>(); } catch { }
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
                        var headLabel = headType == 1 ? "MAIN" : headType == 2 ? "SUB" : $"HEAD{headType}";
                        var displayText = $"{headLabel} 알람 (type={a.type}, no={a.no})";
                        alarms.Add(new
                        {
                            type = a.type,
                            no = a.no,
                            headType = data.headType,
                            message = displayText,
                            displayText,
                        });
                    }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = new { headType = data.headType, alarms }
                });
            }

            // Motor temperature (Mode2)
            if (isGetMotorTemperature)
            {
                try
                {
                    if (!TryEnsureMode2Machine(raw.uid, out var mode2Err))
                    {
                        return Request.CreateResponse((HttpStatusCode)500, new
                        {
                            success = false,
                            message = "GetMotorTemperature failed: " + mode2Err,
                        });
                    }

                    var obj = Mode2Client
                        .RequestRawAsync(raw.uid, CollectDataType.GetMotorTemperature, null, 4000)
                        .GetAwaiter()
                        .GetResult();

                    if (obj == null)
                    {
                        return Request.CreateResponse((HttpStatusCode)500, new
                        {
                            success = false,
                            message = "GetMotorTemperature failed: no response"
                        });
                    }

                    var resultObj = ReadProp(obj, "result");
                    int resultCode;
                    if (resultObj != null && int.TryParse(Convert.ToString(resultObj), out resultCode) && resultCode != 0)
                    {
                        return Request.CreateResponse((HttpStatusCode)500, new
                        {
                            success = false,
                            message = "GetMotorTemperature failed",
                            result = resultCode,
                        });
                    }

                    var machineMotorTemperature = ReadProp(obj, "machineMotorTemperature");
                    var tempInfo = BuildTempInfoRows(machineMotorTemperature);

                    return Request.CreateResponse(HttpStatusCode.OK, new
                    {
                        success = true,
                        data = new
                        {
                            machineMotorTemperature = new
                            {
                                tempInfo = tempInfo,
                            }
                        }
                    });
                }
                catch (Exception ex)
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = "GetMotorTemperature exception: " + ex.Message,
                    });
                }
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
                    var headTypeVal = raw.payload?.ToObject<int?>();
                    if (headTypeVal.HasValue)
                    {
                        headType = (short)headTypeVal.Value;
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
                message = $"Unsupported Mode1 dataType: {dataType}"
            });
        }
    }
}
