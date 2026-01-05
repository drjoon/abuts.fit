using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Hi_Link;
using Hi_Link.Libraries.Model;
using Hi_Link_Advanced;
using Hi_Link_Advanced.EdgeBridge;
using Hi_Link_Advanced.LinkBridge;

namespace Hi_Link_Advanced_Example
{
    public partial class Form1 : Form
    {
        List<MachineInfo> MachineDataInfo = new List<MachineInfo>();

        System.Threading.Timer GetMessageInfoPicker;
        System.Threading.Timer PanelStatusTimer;
        MessageHandler messageHandler = new MessageHandler();

        MachineToolLifeInfo ToolLifeInfo = new MachineToolLifeInfo();
        MachineToolOffsetInfo MachineToolOffsetList = new MachineToolOffsetInfo();
        MotorTemperatureInfo MachineMotorTemperatureInfo = new MotorTemperatureInfo();
        List<IOInfo> PanelIOInfo = new List<IOInfo>();
        

        public Form1()
        {
            InitializeComponent();
        }

        private void Form1_Load(object sender, EventArgs e)
        {
            this.GetMessageInfoPicker = new System.Threading.Timer(GetMessageTimer_tick);
            GetMessageInfoPicker.Change(0, 100);
            this.PanelStatusTimer = new System.Threading.Timer(GetOPStatusTimer_tick);
            PanelStatusTimer.Change(Timeout.Infinite, Timeout.Infinite);
        }

        private void CommOpen_Click(object sender, EventArgs e)
        {
            MachineInfo machineInfo = new MachineInfo();
            machineInfo.MachineIpInfo = new MachineIPInfo { UID = tbMachineUID.Text, IpAddress = MachineIP.Text, Port = Convert.ToUInt16(MachinePort.Text) };
            MachineDataInfo.Add(machineInfo);

            SystemInfo.SerialNumber = tbSerialNum.Text;
            HiLinkHandler.RequestMessage(machineInfo.MachineIpInfo.UID, CollectDataType.AddMachine, machineInfo.MachineIpInfo);
        }

        private void CommClose_Click(object sender, EventArgs e)
        {
            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.DeleteMachine, null);
        }

        private void GetToolLife_Click(object sender, EventArgs e)
        {
            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.GetToolLifeInfo, null);
        }

        private void dataGridView1_CellValuePushed(object sender, DataGridViewCellValueEventArgs e)
        {
            if (e.ColumnIndex == 0)
                return;
            MachineToolLife updateMachineToolLife = new MachineToolLife();
            updateMachineToolLife = ToolLifeInfo.toolLife[e.RowIndex];

            switch (e.ColumnIndex)
            {
                case 1:
                    updateMachineToolLife.useCount = Convert.ToInt32(e.Value);
                    break;
                case 2:
                    updateMachineToolLife.configCount = Convert.ToInt32(e.Value);
                    break;
                case 3:
                    updateMachineToolLife.warningCount = Convert.ToInt32(e.Value);
                    break;
                case 4:
                    updateMachineToolLife.use = (e.Value.ToString() == "1") ? true : false;
                    break;
                default:
                    break;
            }
            List<MachineToolLife> machineToolLifeInfo = new List<MachineToolLife>();
            machineToolLifeInfo.Add(updateMachineToolLife);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateToolLife, machineToolLifeInfo);
        }

        private void dataGridView1_CellValueNeeded(object sender, DataGridViewCellValueEventArgs e)
        {
            switch (e.ColumnIndex)
            {
                case 0:
                    e.Value = ToolLifeInfo.toolLife[e.RowIndex].toolNum;
                    break;
                case 1:
                    e.Value = ToolLifeInfo.toolLife[e.RowIndex].useCount;
                    break;
                case 2:
                    e.Value = ToolLifeInfo.toolLife[e.RowIndex].configCount;
                    break;
                case 3:
                    e.Value = ToolLifeInfo.toolLife[e.RowIndex].warningCount;
                    break;
                case 4:
                    e.Value = ToolLifeInfo.toolLife[e.RowIndex].use ? "1" : "0";
                    break;
                default:
                    break;
            }
        }

        private void GetProductCount_Click(object sender, EventArgs e)
        {
            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.GetProductCount, null);
        }

        private void btGetCurrentProgInfo_Click(object sender, EventArgs e)
        {
            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.GetActivateProgInfo, null);
        }

        private void btGetAlarmInfo_Click(object sender, EventArgs e)
        {
            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.GetErrorInfo, null);
        }

        private void btGetToolOffset_Click(object sender, EventArgs e)
        {
            HeadType headType;
            if(cbOffsetHeadType.SelectedIndex == 0)
            {
                headType = HeadType.Main;
            }
            else if (cbOffsetHeadType.SelectedIndex == 1)
            {
                headType = HeadType.Sub;
            }
            else
            {
                return;
            }

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.GetToolOffsetInfo, (short)headType);
        }

        private void dgToolOffset_CellValuePushed(object sender, DataGridViewCellValueEventArgs e)
        {
            if (e.ColumnIndex == 0)
                return;
            MachineToolOffsetInfo updateMachineToolOffset = new MachineToolOffsetInfo();
            updateMachineToolOffset = MachineToolOffsetList;

            int updateValue = Convert.ToInt32(Convert.ToDouble(e.Value) * 1000);
            switch (e.ColumnIndex)
            {
                case 1:
                    updateMachineToolOffset.toolGeoOffsetArray[e.RowIndex].x = updateValue;
                    break;
                case 2:
                    updateMachineToolOffset.toolGeoOffsetArray[e.RowIndex].y = updateValue;
                    break;
                case 3:
                    updateMachineToolOffset.toolGeoOffsetArray[e.RowIndex].z = updateValue;
                    break;
                case 4:
                    updateMachineToolOffset.toolGeoOffsetArray[e.RowIndex].r = updateValue;
                    break;
                case 5:
                    updateMachineToolOffset.toolTipOffsetArray[e.RowIndex] = Convert.ToInt32(e.Value);
                    break;
                case 6:
                    updateMachineToolOffset.toolWearOffsetArray[e.RowIndex].x = updateValue;
                    break;
                case 7:
                    updateMachineToolOffset.toolWearOffsetArray[e.RowIndex].y = updateValue;
                    break;
                case 8:
                    updateMachineToolOffset.toolWearOffsetArray[e.RowIndex].z = updateValue;
                    break;
                case 9:
                    updateMachineToolOffset.toolWearOffsetArray[e.RowIndex].r = updateValue;
                    break;
                case 10:
                    updateMachineToolOffset.toolTipOffsetArray[e.RowIndex] = Convert.ToInt32(e.Value);
                    break;
                default:
                    break;
            }

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateToolOffset, updateMachineToolOffset);
        }

        private void dgToolOffset_CellValueNeeded(object sender, DataGridViewCellValueEventArgs e)
        {
            switch (e.ColumnIndex)
            {
                case 0:
                    e.Value = MachineToolOffsetList.toolGeoOffsetArray[e.RowIndex].no;
                    break;
                case 1:
                    e.Value = MachineToolOffsetList.toolGeoOffsetArray[e.RowIndex].x / 1000.0;
                    break;
                case 2:
                    e.Value = MachineToolOffsetList.toolGeoOffsetArray[e.RowIndex].y / 1000.0;
                    break;
                case 3:
                    e.Value = MachineToolOffsetList.toolGeoOffsetArray[e.RowIndex].z / 1000.0;
                    break;
                case 4:
                    e.Value = MachineToolOffsetList.toolGeoOffsetArray[e.RowIndex].r / 1000.0;
                    break;
                case 5:
                    e.Value = MachineToolOffsetList.toolTipOffsetArray[e.RowIndex];
                    break;
                case 6:
                    e.Value = MachineToolOffsetList.toolWearOffsetArray[e.RowIndex].x / 1000.0;
                    break;
                case 7:
                    e.Value = MachineToolOffsetList.toolWearOffsetArray[e.RowIndex].y / 1000.0;
                    break;
                case 8:
                    e.Value = MachineToolOffsetList.toolWearOffsetArray[e.RowIndex].z / 1000.0;
                    break;
                case 9:
                    e.Value = MachineToolOffsetList.toolWearOffsetArray[e.RowIndex].r / 1000.0;
                    break;
                case 10:
                    e.Value = MachineToolOffsetList.toolTipOffsetArray[e.RowIndex];
                    break;
                default:
                    break;
            }
        }

        private void treeView1_NodeMouseDoubleClick(object sender, TreeNodeMouseClickEventArgs e)
        {
            if (e.Node.Parent != null)
            {
                string nodeKey = e.Node.Name;

                GetProgramData getProgramData = new GetProgramData();
                getProgramData.machineProgramData.headType = (short)HeadType.Main;
                getProgramData.machineProgramData.programNo = Convert.ToInt16(nodeKey);

                HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.GetProgDataInfo, getProgramData);
            }
            
        }

        private void SubProgView_NodeMouseDoubleClick(object sender, TreeNodeMouseClickEventArgs e)
        {
            if (e.Node.Parent != null)
            {
                string nodeKey = e.Node.Name;

                GetProgramData getProgramData = new GetProgramData();
                getProgramData.machineProgramData.headType = (short)HeadType.Sub;
                getProgramData.machineProgramData.programNo = Convert.ToInt16(nodeKey);

                HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.GetProgDataInfo, getProgramData);
            }
        }

        private void tabControl1_SelectedIndexChanged(object sender, EventArgs e)
        {
            var target = sender as TabControl;
            if (target.SelectedIndex == 3)
            {
                HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.GetProgListInfo, (short)HeadType.Main);
                HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.GetProgListInfo, (short)HeadType.Sub);
            }

            if (target.SelectedIndex == 4)
            {
                this.PanelStatusTimer.Change(0, 1000);
            }
            else
            {
                this.PanelStatusTimer.Change(Timeout.Infinite, Timeout.Infinite);
            }
        }

        private void SaveProg(object sender, EventArgs e)
        {
            var editProgInfo = (MachineProgramData)sender;

            UpdateMachineProgramInfo updateMachineProgramInfo = new UpdateMachineProgramInfo();
            updateMachineProgramInfo.headType = editProgInfo.headType;
            updateMachineProgramInfo.programNo = editProgInfo.programNo;
            updateMachineProgramInfo.programData = editProgInfo.programData;
            updateMachineProgramInfo.isNew = false;

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateProgram, updateMachineProgramInfo);
        }

        #region PanelIO

        private void MACHINE_IO_OP_MAIN_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_OP_MAIN);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_OP_SIMUL_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_OP_SIMUL);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_OP_SUB_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_OP_SUB);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_MS_EDIT_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_MS_EDIT);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_MS_AUTO_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_MS_AUTO);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_MS_MDI_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_MS_MDI);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_MS_HANDLE_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_MS_HANDLE);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_MS_JOG_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_MS_JOG);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_DP_MAIN_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_DP_MAIN);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_DP_SUB_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_DP_SUB);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_RO_ZERO_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_RO_ZERO);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_RO_QUARTER_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_RO_QUARTER);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_RO_HALF_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_RO_HALF);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_RO_FULL_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_RO_FULL);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_F_DRYRUN_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_DRYRUN);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_F_SB_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_SB);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_F_MPG_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_MPG);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_F_COOL_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_COOL);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_F_OILMIST_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_OILMIST);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_F_WARMUP_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_WARMUP);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_F_AUX1_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_AUX1);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_F_AUX2_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_AUX2);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_C_STOP_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_C_STOP);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_C_CONT_Click(object sender, EventArgs e)
        {
            IOInfo targetIOInfo = PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_C_CONT);
            targetIOInfo.Status = (short)((targetIOInfo.Status + 1) % 2);

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateOPStatus, targetIOInfo);
        }

        private void MACHINE_IO_RESET_Click(object sender, EventArgs e)
        {
            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.ResetButton, null);
        }

        private void GetMessageTimer_tick(object sender)
        {
            this.Invoke((MethodInvoker)delegate ()
            {
                if(MessageHandler.ResponseFIFO.Count > 0)
                    ProcessingMessage((ResponseDataMessage)MessageHandler.ResponseFIFO.Dequeue());
            });
        }

        private void GetOPStatusTimer_tick(object sender)
        {
            this.Invoke((MethodInvoker)delegate ()
            {
                HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.GetOPStatus, null);
            });
        }

        private void ProcessingMessage(ResponseDataMessage message)
        {
            MachineInfo machineInfo = MachineDataInfo.Find(o => o.MachineIpInfo.UID == message.UID);

            switch (message.DataType)
            {
                case Hi_Link_Advanced.LinkBridge.CollectDataType.AddMachine:
                    if (message.Data != null)
                    {
                        GetMachineStatus data = (GetMachineStatus)message.Data;
                        if(data.result == 0)
                        {
                            machineInfo.MachineStatus = data.MachineStatusInfo.Status;
                            cbSelectMachine.Items.Add(machineInfo.MachineIpInfo.UID);

                            if(cbSelectMachine.SelectedIndex == -1)
                            {
                                cbSelectMachine.SelectedIndex = 0;
                            }
                        }
                        else
                         {
                            MessageBox.Show("Fail");
                            MachineDataInfo.Remove(machineInfo);

                        }
                    }
                    break;

                case Hi_Link_Advanced.LinkBridge.CollectDataType.DeleteMachine:
                    if (message.Data != null)
                    {
                        short result = (short)message.Data;
                        if (result == 0)
                        {
                            MachineDataInfo.Remove(machineInfo);
                            cbSelectMachine.Items.Remove(machineInfo.MachineIpInfo.UID);
                        }
                        else
                        {
                            MessageBox.Show("Fail");
                        }
                    }
                    break;

                case Hi_Link_Advanced.LinkBridge.CollectDataType.UpdateMachine:
                    if (message.Data != null)
                    {
                        UpdateMachine data = (UpdateMachine)message.Data;
                        if (data.result == 0)
                        {
                            machineInfo.MachineIpInfo = data.MachineIPInfo;
                            machineInfo.MachineStatus = data.MachineStatusInfo.Status;

                            cbSelectMachine.Items.Remove(machineInfo.MachineIpInfo.UID);
                            cbSelectMachine.Items.Add(data.MachineIPInfo.UID);
                        }
                        else
                        {
                            MessageBox.Show("Fail");
                        }
                    }
                    break;

                case CollectDataType.GetMachineList:
                    if (message.Data != null)
                    {
                        GetMachineInfoList data = (GetMachineInfoList)message.Data;
                        if (data.result == 0)
                        {
                            MachineDataInfo.Clear();
                            cbSelectMachine.Items.Clear();
                            foreach (var item in data.MachineIPInfo)
                            {
                                MachineInfo tempMachineInfo = new MachineInfo();
                                tempMachineInfo.MachineIpInfo = item;
                                cbSelectMachine.Items.Add(item.UID);
                            }
                        }
                        else
                        {
                            MessageBox.Show("Fail");
                        }
                    }
                    break;

                case Hi_Link_Advanced.LinkBridge.CollectDataType.GetMachineStatus:
                    if(message.Data != null)
                    {
                        GetMachineStatus getMachineStatus = (GetMachineStatus)message.Data;
                        machineInfo.MachineStatus = getMachineStatus.MachineStatusInfo.Status;
                        if (getMachineStatus.MachineStatusInfo.Status != MachineStatusType.Alarm)
                        {
                            machineInfo.AlarmInfo = new MachineAlarmInfo();
                        }
                    }
                    break;

                case Hi_Link_Advanced.LinkBridge.CollectDataType.GetProductCount:
                    if (message.Data != null)
                    {
                        GetProductCount getProductCount = (GetProductCount)message.Data;

                        if(getProductCount.result == 0)
                        {
                            machineInfo.ProductCount = getProductCount.machineProductInfo;
                        }
                    }
                    break;

                case Hi_Link_Advanced.LinkBridge.CollectDataType.GetErrorInfo:
                    if (message.Data != null)
                    {
                        GetErrorInfo currentAlarmInfo = (GetErrorInfo)message.Data;
                        machineInfo.AlarmInfo = currentAlarmInfo.machineAlarmInfo;
                    }
                    break;

                case Hi_Link_Advanced.LinkBridge.CollectDataType.GetActivateProgInfo:
                    if(message.Data != null)
                    {
                        GetActivateProgInfo machineCurrentProgInfo = (GetActivateProgInfo)message.Data;
                        machineInfo.MachineCurrentProgInfo = machineCurrentProgInfo.machineCurrentProgInfo;
                    }
                    break;
                case Hi_Link_Advanced.LinkBridge.CollectDataType.GetToolLifeInfo:
                    if (message.Data != null)
                    {
                        GetToolLifeInfo getToolLifeInfo = (GetToolLifeInfo)message.Data;
                        ToolLifeInfo = getToolLifeInfo.machineToolLife;

                        if (0 == getToolLifeInfo.result)
                        {
                            ThreadPool.QueueUserWorkItem((o) =>
                            {
                                BeginInvoke(new Action(() =>
                                {
                                    dataGridView1.RowCount = getToolLifeInfo.machineToolLife.length;
                                    dataGridView1.Invalidate();
                                    dataGridView1.ClearSelection();
                                }));
                            });
                        }
                    }
                    break;
                case Hi_Link_Advanced.LinkBridge.CollectDataType.GetToolOffsetInfo:
                    if (message.Data != null)
                    {
                        GetToolOffsetInfo getToolOffsetInfo = (GetToolOffsetInfo)message.Data;

                        if (0 == getToolOffsetInfo.result)
                        {
                            MachineToolOffsetList = getToolOffsetInfo.machineToolOffsetInfo;

                            ThreadPool.QueueUserWorkItem((o) =>
                            {
                                BeginInvoke(new Action(() =>
                                {
                                    dgToolOffset.RowCount = getToolOffsetInfo.machineToolOffsetInfo.toolGeoOffsetArray.Length;
                                    dgToolOffset.Invalidate();
                                    dgToolOffset.ClearSelection();
                                }));
                            });
                        }
                    }
                    break;

                case Hi_Link_Advanced.LinkBridge.CollectDataType.GetMotorTemperature:
                    if (message.Data != null)
                    {
                        GetMotorTemperatureInfo getMotorTemperatureInfo = (GetMotorTemperatureInfo)message.Data;

                        if (0 == getMotorTemperatureInfo.result)
                        {
                            MachineMotorTemperatureInfo = getMotorTemperatureInfo.machineMotorTemperature;

                            ThreadPool.QueueUserWorkItem((o) =>
                            {
                                BeginInvoke(new Action(() =>
                                {
                                    dgMainMoterTemp.RowCount = MachineMotorTemperatureInfo.mainMotorArray.Count();
                                    dgMainMoterTemp.Invalidate();
                                    dgMainMoterTemp.ClearSelection();

                                    dgSubMotorTemp.RowCount = MachineMotorTemperatureInfo.subMotorArray.Count();
                                    dgSubMotorTemp.Invalidate();
                                    dgSubMotorTemp.ClearSelection();

                                    dgSpindleTemp.RowCount = MachineMotorTemperatureInfo.spindleMotorArray.Count();
                                    dgSpindleTemp.Invalidate();
                                    dgSpindleTemp.ClearSelection();
                                }));
                            });
                        }
                    }
                    break;

                case Hi_Link_Advanced.LinkBridge.CollectDataType.GetProgListInfo:
                    if (message.Data != null)
                    {
                        GetProgramListInfo getProgramListInfo = (GetProgramListInfo)message.Data;
                        if ((0 == getProgramListInfo.result) && (getProgramListInfo.machineProgramListInfo.headType == (short)HeadType.Main))
                        {
                            TreeNode mainNode = new TreeNode();
                            MainProgView.Nodes.Clear();
                            mainNode.Text = "MAIN Program";
                            foreach (var item in getProgramListInfo.machineProgramListInfo.programArray)
                            {
                                mainNode.Nodes.Add(item.no.ToString(), item.no + " - " + item.comment);
                                mainNode.LastNode.Checked = item.opened;
                            }
                            MainProgView.Nodes.Add(mainNode);
                            MainProgView.ExpandAll();
                        }

                        if ((0 == getProgramListInfo.result) && (getProgramListInfo.machineProgramListInfo.headType == (short)HeadType.Sub))
                        {
                            TreeNode subNode = new TreeNode();
                            SubProgView.Nodes.Clear();
                            subNode.Text = "SUB Program";
                            foreach (var item in getProgramListInfo.machineProgramListInfo.programArray)
                            {
                                subNode.Nodes.Add(item.no.ToString(), item.no + " - " + item.comment);
                                subNode.LastNode.Checked = item.opened;
                            }
                            SubProgView.Nodes.Add(subNode);
                            SubProgView.ExpandAll();
                        }
                    }
                    break;

                case Hi_Link_Advanced.LinkBridge.CollectDataType.GetProgDataInfo:
                    if (message.Data != null)
                    {
                        GetProgramData getProgramListInfo = (GetProgramData)message.Data;
                        if(getProgramListInfo.result == 0)
                        {
                            ProgView progView = new ProgView();
                            progView.MachineProgData.programData = getProgramListInfo.machineProgramData.programData;
                            progView.MachineProgData.headType = getProgramListInfo.machineProgramData.headType;
                            progView.MachineProgData.programNo = getProgramListInfo.machineProgramData.programNo;

                            progView.tbProgData.Text = getProgramListInfo.machineProgramData.programData;
                            progView.Text = (HeadType)getProgramListInfo.machineProgramData.headType + getProgramListInfo.machineProgramData.programNo.ToString();
                            progView.SaveProgEvent += SaveProg;

                            progView.Show();
                        }
                    }
                    break;

                case Hi_Link_Advanced.LinkBridge.CollectDataType.GetOPStatus:
                    if (message.Data != null)
                    {
                        GetOPStatus getOPStatus = (GetOPStatus)message.Data;

                        if((getOPStatus.result == 0) && (getOPStatus.ioInfo.Count > 0))
                        {
                            PanelIOInfo = getOPStatus.ioInfo;
                            UpdatePanelIO();
                        }
                    }
                    break;
                case Hi_Link_Advanced.LinkBridge.CollectDataType.MachineRunTimeInfo:
                    break;
                case Hi_Link_Advanced.LinkBridge.CollectDataType.UpdateToolLife:
                    if (message.Data != null)
                    {
                        short result = (short)message.Data;
                        if(result == 0)
                        {
                            MessageBox.Show("Success");
                        }
                        else
                        {
                            MessageBox.Show("Fail");
                        }
                    }
                    break;
                case Hi_Link_Advanced.LinkBridge.CollectDataType.UpdateToolOffset:
                    if (message.Data != null)
                    {
                        short result = (short)message.Data;
                        if (result == 0)
                        {
                            MessageBox.Show("Success");
                        }
                        else
                        {
                            MessageBox.Show("Fail");
                        }
                    }
                    break;
                case Hi_Link_Advanced.LinkBridge.CollectDataType.UpdateProgram:
                    if (message.Data != null)
                    {
                        short result = (short)message.Data;
                        if (result == 0)
                        {
                            MessageBox.Show("Success");
                        }
                        else
                        {
                            MessageBox.Show("Fail");
                        }
                    }
                    break;
                case Hi_Link_Advanced.LinkBridge.CollectDataType.DeleteProgram:
                    if (message.Data != null)
                    {
                        short result = (short)message.Data;
                        if (result == 0)
                        {
                            MessageBox.Show("Success");
                        }
                        else
                        {
                            MessageBox.Show("Fail");
                        }
                    }
                    break;
                case Hi_Link_Advanced.LinkBridge.CollectDataType.UpdateOPStatus:
                    if (message.Data != null)
                    {
                        short result = (short)message.Data;
                        if (result == 0)
                        {
                            MessageBox.Show("Success");
                        }
                        else
                        {
                            MessageBox.Show("Fail");
                        }
                    }
                    break;
                default:
                    break;
            }

            ThreadPool.QueueUserWorkItem((o) =>
            {
                BeginInvoke(new Action(() =>
                {
                    dgMachineData.RowCount = MachineDataInfo.Count;
                    dgMachineData.Invalidate();
                    dgMachineData.ClearSelection();
                }));
            });
        }

        private void UpdatePanelIO()
        {
            if (PanelIOInfo.Count > 0)
            {
                MACHINE_IO_OP_MAIN.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_OP_MAIN).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_OP_SIMUL.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_OP_SIMUL).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_OP_SUB.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_OP_SUB).Status == 1 ? Color.Green : Color.Red);

                MACHINE_IO_MS_EDIT.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_MS_EDIT).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_MS_AUTO.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_MS_AUTO).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_MS_MDI.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_MS_MDI).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_MS_HANDLE.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_MS_HANDLE).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_MS_JOG.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_MS_JOG).Status == 1 ? Color.Green : Color.Red);
                //MACHINE_IO_MS_ZERORETURN.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_MS_ZERORETURN).Status == 1 ? Color.Green : Color.Red);

                MACHINE_IO_DP_MAIN.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_DP_MAIN).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_DP_SUB.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_DP_SUB).Status == 1 ? Color.Green : Color.Red);

                MACHINE_IO_RO_ZERO.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_RO_ZERO).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_RO_QUARTER.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_RO_QUARTER).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_RO_HALF.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_RO_HALF).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_RO_FULL.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_RO_FULL).Status == 1 ? Color.Green : Color.Red);

                MACHINE_IO_F_DRYRUN.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_DRYRUN).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_F_SB.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_SB).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_F_MPG.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_MPG).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_F_COOL.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_COOL).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_F_OILMIST.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_OILMIST).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_F_WARMUP.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_WARMUP).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_F_AUX1.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_AUX1).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_F_AUX2.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_F_AUX2).Status == 1 ? Color.Green : Color.Red);

                MACHINE_IO_C_CONT.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_C_CONT).Status == 1 ? Color.Green : Color.Red);
            }
        }
        #endregion

        private void btProgCreate_Click(object sender, EventArgs e)
        {
            UpdateMachineProgramInfo updateMachineProgramInfo = new UpdateMachineProgramInfo();
            updateMachineProgramInfo.headType = (short)HeadType.Main;
            updateMachineProgramInfo.programNo = 10;
            updateMachineProgramInfo.programData = "%\nO10(TEST)\n%";
            updateMachineProgramInfo.isNew = true;

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateProgram, updateMachineProgramInfo);
        }

        private void btProgDel_Click(object sender, EventArgs e)
        {
            DeleteMachineProgramInfo deleteMachineProgramInfo = new DeleteMachineProgramInfo();
            deleteMachineProgramInfo.headType = (short)HeadType.Main;
            deleteMachineProgramInfo.programNo = 10;

            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.DeleteProgram, deleteMachineProgramInfo);
        }

        private void btGetTemperature_Click(object sender, EventArgs e)
        {
            HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.GetMotorTemperature, null);
        }

        private void dgMainMoterTemp_CellValueNeeded(object sender, DataGridViewCellValueEventArgs e)
        {
            switch (e.ColumnIndex)
            {
                case 0:
                    e.Value = MachineMotorTemperatureInfo.mainMotorArray[e.RowIndex].name;
                    break;
                case 1:
                    e.Value = MachineMotorTemperatureInfo.mainMotorArray[e.RowIndex].temperature;
                    break;
                default:
                    break;
            }
        }

        private void dgSubMotorTemp_CellValueNeeded(object sender, DataGridViewCellValueEventArgs e)
        {
            switch (e.ColumnIndex)
            {
                case 0:
                    e.Value = MachineMotorTemperatureInfo.subMotorArray[e.RowIndex].name;
                    break;
                case 1:
                    e.Value = MachineMotorTemperatureInfo.subMotorArray[e.RowIndex].temperature;
                    break;
                default:
                    break;
            }
        }

        private void dgSpindleTemp_CellValueNeeded(object sender, DataGridViewCellValueEventArgs e)
        {
            switch (e.ColumnIndex)
            {
                case 0:
                    e.Value = MachineMotorTemperatureInfo.spindleMotorArray[e.RowIndex].name;
                    break;
                case 1:
                    e.Value = MachineMotorTemperatureInfo.spindleMotorArray[e.RowIndex].temperature;
                    break;
                default:
                    break;
            }
        }

        private void Form1_FormClosing(object sender, FormClosingEventArgs e)
        {
            this.GetMessageInfoPicker.Change(Timeout.Infinite, Timeout.Infinite);
            this.Invoke((MethodInvoker)delegate ()
            {
                this.GetMessageInfoPicker.Dispose();
            });
        }

        private void MainProgView_AfterCheck(object sender, TreeViewEventArgs e)
        {
            var targetNode = sender as TreeView;

            if(e.Node.Parent != null)
            {
                if (e.Node.Checked)
                {
                    int progNumLength = e.Node.Text.IndexOf('-') - 1;
                    string progNum = e.Node.Text.Substring(0, progNumLength);

                    UpdateMachineActivateProgNo updateMachineActivateProgNo = new UpdateMachineActivateProgNo();
                    updateMachineActivateProgNo.headType = (short)HeadType.Main;
                    updateMachineActivateProgNo.programNo = Convert.ToInt16(progNum);

                    HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateActivateProg, updateMachineActivateProgNo);
                }
            }
        }

        private void SubProgView_AfterCheck(object sender, TreeViewEventArgs e)
        {
            var targetNode = sender as TreeView;

            if (e.Node.Parent != null)
            {
                if (e.Node.Checked)
                {
                    int progNumLength = e.Node.Text.IndexOf('-') - 1;
                    string progNum = e.Node.Text.Substring(0, progNumLength);

                    UpdateMachineActivateProgNo updateMachineActivateProgNo = new UpdateMachineActivateProgNo();
                    updateMachineActivateProgNo.headType = (short)HeadType.Sub;
                    updateMachineActivateProgNo.programNo = Convert.ToInt16(progNum);

                    HiLinkHandler.RequestMessage((string)cbSelectMachine.SelectedItem, CollectDataType.UpdateActivateProg, updateMachineActivateProgNo);
                }
            }
        }

        private void dataGridView2_CellValueNeeded(object sender, DataGridViewCellValueEventArgs e)
        {
            if (MachineDataInfo.Count <= 0)
                return;

            switch (e.ColumnIndex)
            {
                case 0:
                    e.Value = e.RowIndex + 1;
                    break;
                case 1:
                    e.Value = MachineDataInfo[e.RowIndex].MachineIpInfo.UID;
                    break;
                case 2:
                    e.Value = MachineDataInfo[e.RowIndex].MachineIpInfo.IpAddress;
                    break;
                case 3:
                    e.Value = MachineDataInfo[e.RowIndex].MachineIpInfo.Port;
                    break;
                case 4:
                    e.Value = MachineDataInfo[e.RowIndex].MachineStatus.ToString();
                    break;
                case 5:
                    if (MachineDataInfo[e.RowIndex].AlarmInfo.alarmArray != null && MachineDataInfo[e.RowIndex].AlarmInfo.alarmArray.Length > 0)
                    {

                        foreach (var item in MachineDataInfo[e.RowIndex].AlarmInfo.alarmArray)
                        {
                            e.Value = (e.Value == null ? "" : e.Value.ToString()) + (AlarmCodeType)item.type + item.no.ToString();
                        }
                    }
                    break;
                case 6:
                    e.Value = MachineDataInfo[e.RowIndex].ProductCount.targetProdCount;
                    break;
                case 7:
                    e.Value = MachineDataInfo[e.RowIndex].ProductCount.currentProdCount;
                    break;
                case 8:
                    e.Value = MachineDataInfo[e.RowIndex].MachineCurrentProgInfo.MainProgramName + " - "
                        + MachineDataInfo[e.RowIndex].MachineCurrentProgInfo.MainProgramComment;
                    break;
                case 9:
                    e.Value = MachineDataInfo[e.RowIndex].MachineCurrentProgInfo.SubProgramName + " - "
                 + MachineDataInfo[e.RowIndex].MachineCurrentProgInfo.SubProgramComment;
                    break;
                case 10:
                    break;
                default:
                    break;
            }
        }

        private void btGetMachineList_Click(object sender, EventArgs e)
        {
            HiLinkHandler.RequestMessage(null, CollectDataType.GetMachineList, null);
        }
    }
}
