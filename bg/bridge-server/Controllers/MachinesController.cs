using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Http;
using Hi_Link.Libraries.Model;
using HiLinkBridgeWebApi48.Models;
using Mode1Api = HiLinkBridgeWebApi48.Mode1Api;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc/machines")]
    public class MachinesController : ApiController
    {
        // POST /machines
        [HttpPost]
        [Route("")]
        public async Task<HttpResponseMessage> Post(AddMachineRequest request)
        {
            Console.WriteLine("[/machines] request: uid={0}, ip={1}, port={2}",
                request?.uid, request?.ip, request?.port);

            if (request == null || string.IsNullOrWhiteSpace(request.uid))
            {
                Console.WriteLine("[/machines] BadRequest: request is null or uid is empty");
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "uid is required"
                });
            }

            try
            {
                // Mode1 기반 브리지에서는 AddMachine API가 없으므로, machines.json 설정을 SSOT로 관리한다.
                // 유효한 uid/ip/port 가 있으면 machines.json 설정을 갱신하고, Mode1HandleStore.TryGetHandle로 통신 검증만 수행한다.
                if (!string.IsNullOrWhiteSpace(request.uid) && !string.IsNullOrWhiteSpace(request.ip) && request.port > 0)
                {
                    try
                    {
                        MachinesConfigStore.Upsert(request.uid, request.ip, request.port);
                    }
                    catch (Exception cfgEx)
                    {
                        Console.WriteLine("[/machines] MachinesConfigStore.Upsert EXCEPTION: " + cfgEx);
                    }
                }

                // 통신 검증
                Mode1HandleStore.Invalidate(request.uid);
                var ok = Mode1HandleStore.TryGetHandle(request.uid, out var _, out var err);
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = ok,
                    result = ok ? 0 : -1,
                    message = ok ? (string)null : (err ?? "OpenMachineHandle failed")
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine("[/machines] EXCEPTION: " + ex);
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        // GET /machines
        [HttpGet]
        [Route("")]
        public async Task<HttpResponseMessage> Get()
        {
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                machines = MachinesConfigStore.Load() ?? new List<MachineConfigItem>()
            });
        }

        // GET /api/cnc/machines/status
        // - machines.json 설정(등록된 UID)을 기준으로 현재 상태를 일괄 조회한다.
        // - 목적: Node 백엔드에서 온라인/가공가능 장비 필터링에 사용
        [HttpGet]
        [Route("status")]
        public HttpResponseMessage GetAllStatus()
        {
            try
            {
                var configs = MachinesConfigStore.Load();
                var list = new List<object>();

                foreach (var m in configs ?? new List<MachineConfigItem>())
                {
                    var uid = m?.uid;
                    if (string.IsNullOrWhiteSpace(uid)) continue;

                    if (!Mode1Api.TryGetMachineStatus(uid, out MachineStatusType status, out string error))
                    {
                        list.Add(new
                        {
                            uid,
                            success = false,
                            status = "UNKNOWN",
                            error
                        });
                        continue;
                    }

                    list.Add(new
                    {
                        uid,
                        success = true,
                        status = status.ToString(),
                        error = (string)null
                    });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    machines = list
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }
    }
}
