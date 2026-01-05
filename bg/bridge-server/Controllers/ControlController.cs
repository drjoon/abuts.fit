using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/control")]
    public class ControlController : ApiController
    {
        private static bool _isRunning = true;
        private static readonly ConcurrentQueue<ProcessingHistory> _history = new ConcurrentQueue<ProcessingHistory>();
        private const int MaxHistory = 50;

        public class ProcessingHistory
        {
            public string FileName { get; set; }
            public DateTime Timestamp { get; set; }
            public string Status { get; set; }
            public string Message { get; set; }
        }

        public static bool IsRunning => _isRunning;

        public static void AddHistory(string fileName, string status, string message = null)
        {
            _history.Enqueue(new ProcessingHistory 
            { 
                FileName = fileName, 
                Timestamp = DateTime.Now, 
                Status = status, 
                Message = message 
            });
            while (_history.Count > MaxHistory) _history.TryDequeue(out _);
        }

        [HttpGet]
        [Route("ping")]
        [Route("health")]
        public HttpResponseMessage Ping()
        {
            return Request.CreateResponse(HttpStatusCode.OK, new { status = "ok", isRunning = _isRunning, service = "bridge-server" });
        }

        [HttpPost]
        [Route("start")]
        public HttpResponseMessage Start()
        {
            _isRunning = true;
            Console.WriteLine("[Control] Service started");
            return Request.CreateResponse(HttpStatusCode.OK, new { ok = true, message = "Service started" });
        }

        [HttpPost]
        [Route("stop")]
        public HttpResponseMessage Stop()
        {
            _isRunning = false;
            Console.WriteLine("[Control] Service stopped");
            return Request.CreateResponse(HttpStatusCode.OK, new { ok = true, message = "Service stopped" });
        }

        [HttpGet]
        [Route("recent")]
        public HttpResponseMessage Recent()
        {
            return Request.CreateResponse(HttpStatusCode.OK, new { ok = true, history = _history.ToList() });
        }
    }
}
