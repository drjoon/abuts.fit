// related files:
// - bg/pc1/bridge-server/rules.md
// - web/backend/controllers/cnc/machiningBridge.js
// - web/backend/controllers/cnc/production.js
namespace HiLinkBridgeWebApi48.Models
{
    public class AddMachineRequest
    {
        public string uid { get; set; }
        public string ip { get; set; }
        public int port { get; set; }
    }
}
