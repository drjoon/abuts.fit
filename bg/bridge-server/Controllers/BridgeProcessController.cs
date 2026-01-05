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
        private static readonly string BackendUrl = "https://abuts.fit/api";

        public class BridgeProcessRequest
        {
            public string fileName { get; set; }
            public string requestId { get; set; }
        }

        [HttpPost]
        [Route("process-file")]
        public async Task<IHttpActionResult> ProcessFile(BridgeProcessRequest req)
        {
            if (req == null || string.IsNullOrEmpty(req.fileName))
            {
                return BadRequest("fileName is required");
            }

            Console.WriteLine($"[Bridge-API] Received process request for: {req.fileName}");

            try
            {
                // 로직 실행 (NcFileWatcher의 static 또는 인스턴스 메서드 호출)
                // 현재는 단일 인스턴스 구조이므로 Program.cs에서 시작된 watcher를 통해 처리하거나
                // 직접 ProcessNcFile 로직을 수행함.
                
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string fullPath = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "storage", "3-nc", req.fileName));

                if (!File.Exists(fullPath))
                {
                    return NotFound();
                }

                // 비동기로 실제 가공 처리 시작
                var watcher = new NcFileWatcher();
                Task.Run(() => watcher.ProcessNcFile(fullPath));

                return Ok(new { ok = true, message = "CNC processing started" });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }
    }
}
