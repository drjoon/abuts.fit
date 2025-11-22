using Hi_Link.Libraries.Model;
using Hi_Link_Advanced;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Hi_Link_Advanced_Example
{
    public class MachineInfo
    {
        public MachineIPInfo MachineIpInfo;

        public short StatusComm;
        public MachineStatusType MachineStatus;
        public MachineAlarmInfo AlarmInfo;

        public MachineProductInfo ProductCount;

        public MachineProgramInfo MachineCurrentProgInfo;

        public MachineInfo()
        {
            MachineIpInfo = new MachineIPInfo();

            StatusComm = 0;
            MachineStatus = MachineStatusType.None;
            AlarmInfo = new MachineAlarmInfo();

            ProductCount = new MachineProductInfo();

            MachineCurrentProgInfo = new MachineProgramInfo();
        }
    }
}
