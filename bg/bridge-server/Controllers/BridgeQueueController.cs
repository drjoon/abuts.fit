using System;
using System.Net;
using System.Net.Http;
using System.Web.Http;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/bridge/queue")]
    public class BridgeQueueController : ApiController
    {
        [HttpGet]
        [Route("")]
        public HttpResponseMessage GetAll()
        {
            try
            {
                var data = CncJobQueue.SnapshotAll();
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = "queue get failed", error = ex.Message });
            }
        }

        [HttpGet]
        [Route("{machineId}")]
        public HttpResponseMessage GetByMachine(string machineId)
        {
            try
            {
                var list = CncJobQueue.Snapshot(machineId);
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = list });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = "queue get failed", error = ex.Message });
            }
        }

        public class ClearRequest
        {
            public string machineId { get; set; }
        }

        [HttpPost]
        [Route("clear")]
        public HttpResponseMessage Clear(ClearRequest req)
        {
            try
            {
                var machineId = (req?.machineId ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(machineId))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
                }

                CncJobQueue.Clear(machineId);
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = "queue clear failed", error = ex.Message });
            }
        }
    }
}
