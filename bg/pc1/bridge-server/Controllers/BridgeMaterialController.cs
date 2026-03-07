using System;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using HiLinkBridgeWebApi48;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/bridge/material")]
    public class BridgeMaterialController : ApiController
    {
        public class UpsertMaterialRequest
        {
            public string machineId { get; set; }
            public string materialType { get; set; }
            public string heatNo { get; set; }
            public double diameter { get; set; }
            public string diameterGroup { get; set; }
            public double? remainingLength { get; set; }
        }

        [HttpPost]
        [Route("")]
        public HttpResponseMessage Upsert([FromBody] UpsertMaterialRequest req)
        {
            try
            {
                var machineId = (req?.machineId ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(machineId))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        success = false,
                        message = "machineId is required"
                    });
                }

                if (req == null || req.diameter <= 0)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        success = false,
                        message = "diameter is required"
                    });
                }

                var item = new MachineMaterialItem
                {
                    machineId = machineId,
                    materialType = (req.materialType ?? string.Empty).Trim(),
                    heatNo = (req.heatNo ?? string.Empty).Trim(),
                    diameter = req.diameter,
                    diameterGroup = (req.diameterGroup ?? string.Empty).Trim(),
                    remainingLength = req.remainingLength,
                    setAtUtc = DateTime.UtcNow,
                };

                var saved = MachineMaterialStore.Upsert(item);
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = saved
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = "material upsert failed",
                    error = ex.Message
                });
            }
        }

        [HttpGet]
        [Route("")]
        public HttpResponseMessage GetAll()
        {
            try
            {
                var data = MachineMaterialStore.Snapshot();
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = "material get failed",
                    error = ex.Message
                });
            }
        }

        [HttpGet]
        [Route("{machineId}")]
        public HttpResponseMessage GetByMachine(string machineId)
        {
            try
            {
                var key = (machineId ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(key))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
                }

                var item = MachineMaterialStore.Get(key);
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = item });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = "material get failed",
                    error = ex.Message
                });
            }
        }
    }
}
