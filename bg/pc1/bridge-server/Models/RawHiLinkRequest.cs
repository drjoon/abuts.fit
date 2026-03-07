using Newtonsoft.Json.Linq;

namespace HiLinkBridgeWebApi48.Models
{
    // /raw 엔드포인트 요청 본문
    public class RawHiLinkRequest
    {
        public string uid { get; set; }
        public string dataType { get; set; }
        public JToken payload { get; set; }
        public int timeoutMilliseconds { get; set; }
        public bool bypassCooldown { get; set; }
    }
}
