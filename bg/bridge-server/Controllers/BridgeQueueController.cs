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

        [HttpDelete]
        [Route("{machineId}/{jobId}")]
        public HttpResponseMessage DeleteJob(string machineId, string jobId)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(machineId) || string.IsNullOrWhiteSpace(jobId))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId and jobId are required" });
                }

                var list = CncJobQueue.Snapshot(machineId) ?? new System.Collections.Generic.List<CncJobItem>();
                CncJobItem removed = null;
                if (list.Count > 0)
                {
                    foreach (var job in list)
                    {
                        if (string.Equals(job.id, jobId, System.StringComparison.OrdinalIgnoreCase))
                        {
                            removed = job;
                            break;
                        }
                    }

                    if (removed != null)
                    {
                        // 큐를 재구성하여 해당 job만 제거
                        var rebuilt = new System.Collections.Generic.List<CncJobItem>();
                        foreach (var job in list)
                        {
                            if (job.id == removed.id) continue;
                            rebuilt.Add(job);
                        }
                        // Clear & re-enqueue
                        CncJobQueue.Clear(machineId);
                        foreach (var job in rebuilt)
                        {
                            if (job.kind == CncJobKind.File)
                            {
                                var enq = CncJobQueue.EnqueueFileBack(job.machineId, job.fileName, job.requestId);
                                try
                                {
                                    if (enq != null && !string.IsNullOrWhiteSpace(job.bridgePath))
                                    {
                                        enq.bridgePath = job.bridgePath;
                                    }
                                }
                                catch { }
                            }
                            else if (job.kind == CncJobKind.Dummy && job.programNo.HasValue)
                            {
                                CncJobQueue.EnqueueDummyFront(job.machineId, job.programNo.Value, job.programName);
                            }
                        }
                    }
                }

                if (removed == null)
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new { success = false, message = "job not found" });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = removed });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = "queue delete failed", error = ex.Message });
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

        public class ReorderRequest
        {
            public string machineId { get; set; }
            public string[] order { get; set; }
        }

        [HttpPost]
        [Route("reorder")]
        public HttpResponseMessage Reorder(ReorderRequest req)
        {
            try
            {
                var machineId = (req?.machineId ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(machineId))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId is required" });
                }

                var list = CncJobQueue.Reorder(machineId, req?.order);
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = list });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = "queue reorder failed", error = ex.Message });
            }
        }

        public class QtyRequest
        {
            public int qty { get; set; }
        }

        [HttpPatch]
        [Route("{machineId}/{jobId}/qty")]
        public HttpResponseMessage UpdateQty(string machineId, string jobId, QtyRequest req)
        {
            try
            {
                var mid = (machineId ?? string.Empty).Trim();
                var jid = (jobId ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(mid) || string.IsNullOrEmpty(jid))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machineId and jobId are required" });
                }

                var qty = req != null ? req.qty : 1;
                if (qty < 1) qty = 1;

                if (!CncJobQueue.TrySetQty(mid, jid, qty, out var updated) || updated == null)
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new { success = false, message = "job not found" });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data = updated });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = "queue qty update failed", error = ex.Message });
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
