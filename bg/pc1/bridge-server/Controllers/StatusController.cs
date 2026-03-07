using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class StatusController : ApiController
    {
        // GET /api/cnc/status?machines=M3,M4,M5
        [HttpGet]
        [Route("status")]
        public HttpResponseMessage GetStatus(string machines)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            foreach (var machineId in machineIds)
            {
                if (!Mode1Api.TryGetMachineStatus(machineId, out var status, out var error))
                {
                    results.Add(new
                    {
                        machineId = machineId,
                        success = false,
                        message = error ?? "GetMachineStatus failed"
                    });
                    continue;
                }

                results.Add(new
                {
                    machineId = machineId,
                    success = true,
                    status = status.ToString()
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
