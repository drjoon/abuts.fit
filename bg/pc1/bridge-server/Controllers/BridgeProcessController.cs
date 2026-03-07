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
                var job = CncJobQueue.EnqueueFileBack(
                    req.machineId,
                    req.fileName,
                    string.IsNullOrWhiteSpace(req.requestId) ? null : req.requestId,
                    req.originalFileName
                );

                try
                {
                    var bp = (req.bridgePath ?? string.Empty).Trim();
                    if (!string.IsNullOrEmpty(bp))
                    {
                        job.bridgePath = bp;
                    }
                }
                catch { }

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
