using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using Newtonsoft.Json.Linq;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class ContinuousController : ApiController
    {
        // POST /api/cnc/continuous/enqueue?machines=M3,M4
        [HttpPost]
        [Route("continuous/enqueue")]
        public HttpResponseMessage EnqueueContinuousJob(string machines, [FromBody] JObject payload)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
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

                var machineIds = BridgeShared.ParseMachineIds(machines);
                var results = new List<object>();

                foreach (var machineId in machineIds)
                {
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
                        results.Add(new { machineId, success = false, message = "failed to enqueue job" });
                    }
                    else
                    {
                        results.Add(new { machineId, success = true, jobId, message = "Job enqueued for continuous machining" });
                    }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, results });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        // GET /api/cnc/continuous/state?machines=M3,M4
        [HttpGet]
        [Route("continuous/state")]
        public HttpResponseMessage GetContinuousState(string machines)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            foreach (var machineId in machineIds)
            {
                var state = CncMachining.GetMachineState(machineId);
                if (state == null)
                {
                    results.Add(new { machineId, success = false, message = "Machine state not found" });
                    continue;
                }

                results.Add(new { machineId, success = true, data = state });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, results });
        }
    }
}
