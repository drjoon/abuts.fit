using Hi_Link_Advanced;
using Hi_Link_Advanced.LinkBridge;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Hi_Link_Advanced_Example
{
    public class HiLinkHandler
    {
        static public void RequestMessage(string UID, CollectDataType dataType, object data)
        {
            RequestDataMessage requestMessage = new RequestDataMessage();
            requestMessage.UID = UID;
            requestMessage.DataType = dataType;
            requestMessage.Data = data;

            MessageHandler.RequestFIFO.Enqueue(requestMessage);
        }
    }
}
