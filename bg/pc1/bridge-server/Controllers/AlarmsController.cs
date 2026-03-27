using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using Hi_Link.Libraries.Model;
namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class AlarmsController : ApiController
    {
        private static string GetAlarmDisplayText(short headType, short type, short no)
        {
            var headLabel = headType == 1 ? "MAIN" : headType == 2 ? "SUB" : $"HEAD{headType}";
            return $"{headLabel} 알람 (type={type}, no={no})";
        }

        // GET /api/cnc/alarms?machines=M3,M4,M5&headType=1
        [HttpGet]
        [Route("alarms")]
        public HttpResponseMessage GetAlarms(string machines, short headType = 1)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }
            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();
            foreach (var machineId in machineIds)
            {
                if (BridgeShared.IsMockCncMachiningEnabled())
                {
                    results.Add(new
                    {
                        machineId = machineId,
                        success = true,
                        data = new { headType = headType, alarms = new object[0] }
                    });
                    continue;
                }
                if (!Mode1Api.TryGetMachineAlarmInfo(machineId, headType, out var data, out var err))
                {
                    results.Add(new
                    {
                        machineId = machineId,
                        success = false,
                        message = err ?? "GetMachineAlarmInfo failed"
                    });
                    continue;
                }
                var alarms = new List<object>();
                if (data.alarmArray != null)
                {
                    foreach (var a in data.alarmArray)
                    {
                        alarms.Add(new
                        {
                            type = a.type,
                            no = a.no,
                            headType = data.headType,
                            message = GetAlarmDisplayText((short)data.headType, (short)a.type, (short)a.no),
                            displayText = GetAlarmDisplayText((short)data.headType, (short)a.type, (short)a.no),
                        });
                    }
                }
                if (alarms.Count == 0)
                {
                    if (Mode1Api.TryGetMachineStatus(machineId, out var status, out var statusErr))
                    {
                        if (status == MachineStatusType.Alarm)
                        {
                            alarms.Add(new
                            {
                                type = -1,
                                no = -1,
                                headType = data.headType,
                                source = "MachineStatusType.Alarm",
                                message = "장비 상태가 ALARM 입니다.",
                                displayText = "장비 상태가 ALARM 입니다.",
                            });
                        }
                    }
                    else if (!string.IsNullOrWhiteSpace(statusErr))
                    {
                        System.Diagnostics.Debug.WriteLine($"[AlarmsController] status fallback read failed machine={machineId} err={statusErr}");
                    }
                }
                results.Add(new
                {
                    machineId = machineId,
                    success = true,
                    data = new { headType = data.headType, alarms }
                });
            }
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                results = results
            });
        }
    }
}
