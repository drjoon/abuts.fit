using System.Net;
using System.Net.Http;
using System.Web.Http;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class JobsController : ApiController
    {
        // GET /api/cnc/jobs/{jobId}
        [HttpGet]
        [Route("jobs/{jobId}")]
        public HttpResponseMessage GetJobResult(string jobId)
        {
            if (!BridgeShared.JobResults.TryGetValue(jobId, out var result))
            {
                return Request.CreateResponse(HttpStatusCode.NotFound, new
                {
                    success = false,
                    message = "job not found",
                    jobId
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                jobId = result.JobId,
                status = result.Status,
                result = result.Result,
                createdAtUtc = result.CreatedAtUtc
            });
        }
    }
}
