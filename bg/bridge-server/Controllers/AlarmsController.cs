using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class AlarmsController : ApiController
    {
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
                        alarms.Add(new { type = a.type, no = a.no });
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
