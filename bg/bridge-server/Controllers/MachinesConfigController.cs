using System.Net;
using System.Net.Http;
using System.Web.Http;
using HiLinkBridgeWebApi48.Models;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/bridge-config/machines")]
    public class MachinesConfigController : ApiController
    {
        [HttpPut]
        [Route("{uid}")]
        public HttpResponseMessage Upsert(string uid, [FromBody] MachineConfigItem body)
        {
            if (string.IsNullOrWhiteSpace(uid) || body == null || string.IsNullOrWhiteSpace(body.ip) || body.port <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "uid, ip, port 는 필수입니다."
                });
            }

            var item = MachinesConfigStore.Upsert(uid, body.ip, body.port);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                data = item
            });
        }

        [HttpDelete]
        [Route("{uid}")]
        public HttpResponseMessage Delete(string uid)
        {
            if (string.IsNullOrWhiteSpace(uid))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "uid 는 필수입니다."
                });
            }

            bool removed = MachinesConfigStore.Delete(uid);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = removed
            });
        }
    }
}
