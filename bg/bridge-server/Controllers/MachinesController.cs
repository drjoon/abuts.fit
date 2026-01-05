using System;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Http;
using HiLinkBridgeWebApi48.Models;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc/machines")]
    public class MachinesController : ApiController
    {
        private static readonly HiLinkMode2Client Client = new HiLinkMode2Client();

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
                var (success, resultCode) = await Client.AddMachineAsync(request.uid, request.ip, request.port);
                Console.WriteLine("[/machines] AddMachine result: success={0}, code={1}", success, resultCode);

                // 이미 등록된 UID(88)인 경우, 통신 설정(IP/Port)만 갱신하기 위해 UpdateMachine을 시도한다.
                if (!success && resultCode.HasValue && resultCode.Value == 88
                    && !string.IsNullOrWhiteSpace(request.ip) && request.port > 0)
                {
                    var (updSuccess, updCode) = await Client.UpdateMachineAsync(request.uid, request.ip, request.port);
                    Console.WriteLine("[/machines] UpdateMachine result: success={0}, code={1}", updSuccess, updCode);
                    success = updSuccess;
                    resultCode = updCode;
                }

                // AddMachine 결과와 상관없이, 유효한 uid/ip/port 가 있으면 machines.json 설정도 함께 갱신한다.
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

                string message = null;
                if (resultCode.HasValue)
                {
                    switch (resultCode.Value)
                    {
                        case -16:
                            message = "CNC 통신 에러입니다. 설비 전원, 통신 케이블, IP/포트 설정과 네트워크 상태를 확인해 주세요.";
                            break;
                        case 88:
                            message = "이미 등록된 UID 입니다.";
                            break;
                        default:
                            break;
                    }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success,
                    result = resultCode,
                    message
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
            var list = await Client.GetMachineListAsync();
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                machines = list
            });
        }
    }
}
