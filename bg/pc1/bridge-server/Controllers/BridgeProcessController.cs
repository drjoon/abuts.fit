using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Web.Http;
using Newtonsoft.Json;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/bridge")]
    public class BridgeProcessController : ApiController
    {
        public class BridgeProcessRequest
        {
            public string fileName { get; set; }
            public string originalFileName { get; set; }
            public string requestId { get; set; }
            public string machineId { get; set; }
            public string bridgePath { get; set; }
            public string s3Key { get; set; }
            public string s3Bucket { get; set; }
        }

        [HttpPost]
        [Route("process-file")]
        public async Task<IHttpActionResult> ProcessFile(BridgeProcessRequest req)
        {
            if (req == null || string.IsNullOrEmpty(req.fileName))
            {
                return BadRequest("fileName is required");
            }

            if (string.IsNullOrWhiteSpace(req.machineId))
            {
                return BadRequest("machineId is required");
            }

            Console.WriteLine($"[Bridge-API] Received process request for: {req.fileName}");

            try
            {
                CncJobItem job;
                string ignoreReason;
                if (!CncMachining.TryEnqueueProcessRequest(
                    req.machineId,
                    req.fileName,
                    req.requestId,
                    req.originalFileName,
                    req.bridgePath,
                    req.s3Key,
                    req.s3Bucket,
                    out job,
                    out ignoreReason
                ))
                {
                    if (job == null && !string.IsNullOrEmpty(ignoreReason) &&
                        (ignoreReason.StartsWith("already-", StringComparison.OrdinalIgnoreCase) ||
                         ignoreReason.StartsWith("just-completed", StringComparison.OrdinalIgnoreCase)))
                    {
                        Console.WriteLine("[Bridge-API] Duplicate process request ignored machine={0} requestId={1} file={2} reason={3}", req.machineId, req.requestId, req.fileName, ignoreReason);
                        return Content(HttpStatusCode.Accepted, new
                        {
                            ok = true,
                            status = "IGNORED_DUPLICATE",
                            reason = ignoreReason,
                            machineId = req.machineId,
                            fileName = req.fileName,
                            requestId = req.requestId,
                        });
                    }

                    return Content(HttpStatusCode.BadRequest, new
                    {
                        ok = false,
                        status = "REJECTED",
                        reason = ignoreReason ?? "enqueue-failed",
                        machineId = req.machineId,
                        fileName = req.fileName,
                        requestId = req.requestId,
                    });
                }

                CncMachining.ResetStartBackoff(req.machineId);
                CncMachining.TriggerProcessNow(req.machineId);

                return Content(HttpStatusCode.Accepted, new
                {
                    ok = true,
                    status = "QUEUED",
                    jobId = job.id,
                    machineId = req.machineId,
                    fileName = req.fileName,
                    requestId = req.requestId,
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }
    }
}
