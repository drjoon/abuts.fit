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

namespace Hi_Link_CSharp
{
  
    public partial class Form1 : Form
    {
        ushort FlibHnd;
        MachineInfo MachineInfo = new MachineInfo();
        MachineToolLifeInfo ToolLifeInfo = new MachineToolLifeInfo();
        MachineToolOffsetInfo MachineToolOffsetList = new MachineToolOffsetInfo();
        MotorTemperatureInfo MachineMotorTemperatureInfo = new MotorTemperatureInfo();
        List<IOInfo> PanelIOInfo = new List<IOInfo>();

        System.Threading.Timer PanelStatusTimer;// = new System.Windows.Forms.Timer();
        System.Threading.Timer MachineStatusTimer;


        public Form1()
        {
            InitializeComponent();

            this.PanelStatusTimer = new System.Threading.Timer(updatePanelTimer_tick);
            this.MachineStatusTimer = new System.Threading.Timer(updateMachineStatusTimer_tick);
        }

        private void CommOpen_Click(object sender, EventArgs e)
        {
            bool enable = false;
            short result = HiLink.OpenMachineHandle(tbSerialNum.Text, MachineIP.Text, Convert.ToUInt16(MachinePort.Text), 3, out FlibHnd, out enable);
            textBox3.Text = result.ToString();
            if (result != 0)
                return;
            result = HiLink.GetMachineInfo(FlibHnd, ref MachineInfo);
            if (0 == result)
            {
                CtrlType.Text = MachineInfo.controllerType;
                ToolType.Text = MachineInfo.toolType.ToString();

                this.MachineStatusTimer.Change(0, 100);
            }
            else
            {
                this.MachineStatusTimer.Change(Timeout.Infinite, Timeout.Infinite);
            }
        }

        private void CommClose_Click(object sender, EventArgs e)
        {
            HiLink.FreeMachineHandle(FlibHnd);

            this.MachineStatusTimer.Change(Timeout.Infinite, Timeout.Infinite);
        }

        private void GetToolLife_Click(object sender, EventArgs e)
        {
            short result = -1;

            result = HiLink.GetMachineToolLife(FlibHnd, MachineInfo.toolType, ref ToolLifeInfo);
            if (0 == result)
            {
                ThreadPool.QueueUserWorkItem((o) =>
                {
                    BeginInvoke(new Action(() =>
                    {
                        dataGridView1.RowCount = ToolLifeInfo.length;
                        dataGridView1.Invalidate();
                        dataGridView1.ClearSelection();
                    }));
                });
            }
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

            short result = HiLink.SetMachineToolLife(FlibHnd, MachineInfo.toolType, updateMachineToolLife);
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
            short result = -1;

            MachineProductInfo machineProductInfo = new MachineProductInfo();
            result = HiLink.GetMachineProductInfo(FlibHnd, ref machineProductInfo);
            if (0 == result)
            {
                TargetProduct.Text = machineProductInfo.targetProdCount.ToString();
                CurrentProduct.Text = machineProductInfo.currentProdCount.ToString();
            }
            
        }

        private void GetStatus_Click(object sender, EventArgs e)
        {
            short result = -1;

            MachineStatusType machineStatus = MachineStatusType.None;
            MachineStatusInfo a = new MachineStatusInfo();
            result = HiLink.GetMachineStatus(FlibHnd, ref a);
            result = HiLink.GetMachineStatus(FlibHnd, ref machineStatus);
            if(0 == result)
            {
                tbMachineStatus.Text = machineStatus.ToString();
            }
        }

        private void btGetCurrentProgInfo_Click(object sender, EventArgs e)
        {
            short result = -1;
            MachineProgramInfo machineActivateProgram = new MachineProgramInfo();
            result = HiLink.GetMachineActivateProgInfo(FlibHnd, ref machineActivateProgram);
            if(0 == result)
            {
                tbMainProgNum.Text = machineActivateProgram.MainProgramName;
                tbMainProgComment.Text = machineActivateProgram.MainProgramComment;
                tbSubProgNum.Text = machineActivateProgram.SubProgramName;
                tbSubProgComment.Text = machineActivateProgram.SubProgramComment;
            }
        }

        private void btGetAlarmInfo_Click(object sender, EventArgs e)
        {
            short result;
            MachineAlarmInfo machineAlarmList = new MachineAlarmInfo();
            machineAlarmList.headType = (short)HeadType.Sub;
            result = HiLink.GetMachineAlarmInfo(FlibHnd, ref machineAlarmList);
            if (result == 0)
            {
                if (machineAlarmList.alarmArray != null && machineAlarmList.alarmArray.Length > 0)
                    //tbAlarmCode.Text = machineAlarmList.alarmArray[0].type + machineAlarmList.alarmArray[0].no.ToString();
                    tbAlarmCode.Text = (AlarmCodeType)machineAlarmList.alarmArray[0].type + machineAlarmList.alarmArray[0].no.ToString();

                else
                    tbAlarmCode.Text = "-";
            }
        }

        private void btGetToolOffset_Click(object sender, EventArgs e)
        {
            var headType = cbOffsetHeadType.SelectedIndex == 0 ? HeadType.Main : HeadType.Sub;

            MachineToolOffsetList = new MachineToolOffsetInfo();
            MachineToolOffsetList.headType = (short)headType;
            short result = HiLink.GetMachineToolOffsetInfo(FlibHnd, ref MachineToolOffsetList);
            if (result == 0)
            {
                ThreadPool.QueueUserWorkItem((o) =>
                {
                    BeginInvoke(new Action(() =>
                    {
                        dgToolOffset.RowCount = MachineToolOffsetList.toolWearOffsetArray.Count();
                        dgToolOffset.Invalidate();
                        dgToolOffset.ClearSelection();
                    }));
                });
            }
        }

        private void dgToolOffset_CellValuePushed(object sender, DataGridViewCellValueEventArgs e)
        {
            if (e.ColumnIndex == 0)
                return;
            MachineToolOffsetInfo updateMachineToolOffset = new MachineToolOffsetInfo();
            updateMachineToolOffset.headType = MachineToolOffsetList.headType;
            updateMachineToolOffset.length = 1;
            updateMachineToolOffset.toolGeoOffsetArray = new ToolOffsetData[] { MachineToolOffsetList.toolGeoOffsetArray[e.RowIndex] };
            updateMachineToolOffset.toolWearOffsetArray = new ToolOffsetData[] { MachineToolOffsetList.toolWearOffsetArray[e.RowIndex] };
            updateMachineToolOffset.toolTipOffsetArray = new int[] { MachineToolOffsetList.toolTipOffsetArray[e.RowIndex] };
            //updateMachineToolOffset = MachineToolOffsetList;

            int updateValue = Convert.ToInt32(Convert.ToDouble(e.Value) * 1000);
            switch (e.ColumnIndex)
            {
                case 1:
                    updateMachineToolOffset.toolGeoOffsetArray[0].x = updateValue;
                    break;
                case 2:
                    updateMachineToolOffset.toolGeoOffsetArray[0].y = updateValue;
                    break;
                case 3:
                    updateMachineToolOffset.toolGeoOffsetArray[0].z = updateValue;
                    break;
                case 4:
                    updateMachineToolOffset.toolGeoOffsetArray[0].r = updateValue;
                    break;
                case 5:
                    updateMachineToolOffset.toolTipOffsetArray[0] = Convert.ToInt32(e.Value);
                    break;
                case 6:
                    updateMachineToolOffset.toolWearOffsetArray[0].x = updateValue;
                    break;
                case 7:
                    updateMachineToolOffset.toolWearOffsetArray[0].y = updateValue;
                    break;
                case 8:
                    updateMachineToolOffset.toolWearOffsetArray[0].z = updateValue;
                    break;
                case 9:
                    updateMachineToolOffset.toolWearOffsetArray[0].r = updateValue;
                    break;
                case 10:
                    updateMachineToolOffset.toolTipOffsetArray[0] = Convert.ToInt32(e.Value);
                    break;
                default:
                    break;
            }
         

            //updateMachineToolOffset.headType = (short)(cbOffsetHeadType.SelectedIndex == 0 ? HeadType.Main : HeadType.Sub);
            short result = HiLink.SetMachineToolOffsetConfInfo(FlibHnd,  updateMachineToolOffset);
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
            string nodeKey = e.Node.Name;
            short result;

            MachineProgramData machineProgData = new MachineProgramData();
            machineProgData.headType = (short)HeadType.Main;
            machineProgData.programNo = Convert.ToInt16(nodeKey);
            result = HiLink.GetMachineProgramData(FlibHnd, ref machineProgData);
            if(result == 0)
            {
                ProgView progView = new ProgView();
                progView.MachineProgData = machineProgData;
                progView.StartShapeCal += SaveProg;

                progView.tbProgData.Text = machineProgData.programData;
                progView.Text = machineProgData.programNo.ToString();
                progView.Show();
            }
        }

        private void SubProgView_NodeMouseDoubleClick(object sender, TreeNodeMouseClickEventArgs e)
        {
            string nodeKey = e.Node.Name;
            short result;

            MachineProgramData machineProgData = new MachineProgramData();
            machineProgData.headType = (short)HeadType.Sub;
            machineProgData.programNo = Convert.ToInt16(nodeKey);
            result = HiLink.GetMachineProgramData(FlibHnd, ref machineProgData);
            if (result == 0)
            {
                ProgView progView = new ProgView();
                progView.MachineProgData = machineProgData;
                progView.StartShapeCal += SaveProg;

                progView.tbProgData.Text = machineProgData.programData;
                progView.Text = machineProgData.programNo.ToString();
                progView.Show();
            }
        }

        private void tabControl1_SelectedIndexChanged(object sender, EventArgs e)
        {
            var target = sender as TabControl;
            if (target.SelectedIndex == 3)
            {
                short result;
                MachineProgramListInfo machineProgramListInfo = new MachineProgramListInfo();
                machineProgramListInfo.headType = (short)HeadType.Main;
                TreeNode mainNode = new TreeNode();
                TreeNode subNode = new TreeNode();
                MainProgView.Nodes.Clear();
                SubProgView.Nodes.Clear();

                result = HiLink.GetMachineProgramListInfo(FlibHnd, ref machineProgramListInfo);
                if (result == 0)
                {
                    mainNode.Text = "MAIN Program";
                    foreach (var item in machineProgramListInfo.programArray)
                    {
                        mainNode.Nodes.Add(item.no.ToString(), item.no + " - " + item.comment);
                        mainNode.LastNode.Checked = item.opened;
                    }
                    MainProgView.Nodes.Add(mainNode);
                    MainProgView.ExpandAll();
                }

                machineProgramListInfo = new MachineProgramListInfo();
                machineProgramListInfo.headType = (short)HeadType.Sub;

                result = HiLink.GetMachineProgramListInfo(FlibHnd, ref machineProgramListInfo);
                if (result == 0)
                {
                    subNode.Text = "SUB Program";
                    foreach (var item in machineProgramListInfo.programArray)
                    {
                        subNode.Nodes.Add(item.no.ToString(), item.no + " - " + item.comment);
                        subNode.LastNode.Checked = item.opened;
                    }
                    SubProgView.Nodes.Add(subNode);
                    SubProgView.ExpandAll();
                }
                this.PanelStatusTimer.Change(Timeout.Infinite, Timeout.Infinite);
            }
            else if (target.SelectedIndex == 4)
            {
                if(UpdatePanelIO() == 0)
                { 
                    this.PanelStatusTimer.Change(0, 1000);
                }
                else
                {
                    PanelIOInfo = new List<IOInfo>();
                    this.PanelStatusTimer.Change(Timeout.Infinite, Timeout.Infinite);
                }
            }
            else
            {
                this.PanelStatusTimer.Change(Timeout.Infinite, Timeout.Infinite);
            }
        }


        private void SaveProg(object sender, EventArgs e)
        {
            var editProgInfo = (sender as ProgView).MachineProgData;

            UpdateMachineProgramInfo updateMachineProgramInfo = new UpdateMachineProgramInfo();
            updateMachineProgramInfo.headType = editProgInfo.headType;
            updateMachineProgramInfo.programNo = editProgInfo.programNo;
            updateMachineProgramInfo.programData = editProgInfo.programData;
            updateMachineProgramInfo.isNew = false;

            short result = HiLink.SetMachineProgramInfo(FlibHnd, updateMachineProgramInfo);
            if (result == 0)
            {

            }
        }

        #region PanelIO
        private void MACHINE_IO_OP_MAIN_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_OP_MAIN, true);
        }

        private void MACHINE_IO_OP_SIMUL_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_OP_SIMUL, true);
        }

        private void MACHINE_IO_OP_SUB_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_OP_SUB, true);
        }

        private void MACHINE_IO_MS_EDIT_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_MS_EDIT, true);
        }

        private void MACHINE_IO_MS_AUTO_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_MS_AUTO, true);
        }

        private void MACHINE_IO_MS_MDI_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_MS_MDI, true);
        }

        private void MACHINE_IO_MS_HANDLE_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_MS_HANDLE, true);
        }
        private void MACHINE_IO_MS_JOG_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_MS_JOG, true);
        }

        private void MACHINE_IO_MS_ZERORETURN_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_MS_ZERORETURN, true);
        }

        private void MACHINE_IO_DP_MAIN_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_DP_MAIN, true);
        }

        private void MACHINE_IO_DP_SUB_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_DP_SUB, true);
        }

        private void MACHINE_IO_RO_ZERO_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_RO_ZERO, true);
        }

        private void MACHINE_IO_RO_QUARTER_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_RO_QUARTER, true);
        }

        private void MACHINE_IO_RO_HALF_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_RO_HALF, true);
        }

        private void MACHINE_IO_RO_FULL_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_RO_FULL, true);
        }

        private void MACHINE_IO_F_DRYRUN_Click(object sender, EventArgs e)
        {
            var targetIO = PanelIOInfo.Find(x => x.IOName == "F_DRYRUN");
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_F_DRYRUN, !(targetIO.Status == 1 ? true : false));
        }

        private void MACHINE_IO_F_SB_Click(object sender, EventArgs e)
        {
            var targetIO = PanelIOInfo.Find(x => x.IOName == "F_SB");
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_F_SB, !(targetIO.Status == 1 ? true : false));
        }

        private void MACHINE_IO_F_MPG_Click(object sender, EventArgs e)
        {
            var targetIO = PanelIOInfo.Find(x => x.IOName == "F_MPG");
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_F_MPG, !(targetIO.Status == 1 ? true : false));
        }

        private void MACHINE_IO_F_COOL_Click(object sender, EventArgs e)
        {
            var targetIO = PanelIOInfo.Find(x => x.IOName == "F_COOL");
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_F_COOL, !(targetIO.Status == 1 ? true : false));
        }

        private void MACHINE_IO_F_OILMIST_Click(object sender, EventArgs e)
        {
            var targetIO = PanelIOInfo.Find(x => x.IOName == "F_OILMIST");
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_F_OILMIST, !(targetIO.Status == 1 ? true : false));
        }

        private void MACHINE_IO_F_WARMUP_Click(object sender, EventArgs e)
        {
            var targetIO = PanelIOInfo.Find(x => x.IOName == "F_WARMUP");
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_F_WARMUP, !(targetIO.Status == 1 ? true : false));
        }

        private void MACHINE_IO_F_AUX1_Click(object sender, EventArgs e)
        {
            var targetIO = PanelIOInfo.Find(x => x.IOName == "F_AUX1");
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_F_AUX1, !(targetIO.Status == 1 ? true : false));
        }

        private void MACHINE_IO_F_AUX2_Click(object sender, EventArgs e)
        {
            var targetIO = PanelIOInfo.Find(x => x.IOName == "F_AUX2");
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_F_AUX2, !(targetIO.Status == 1 ? true : false));
        }

        private void MACHINE_IO_C_STOP_Click(object sender, EventArgs e)
        {
            var targetIO = PanelIOInfo.Find(x => x.IOName == "C_STOP");
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_C_STOP, !(targetIO.Status == 1 ? true : false));
            if (result == 0)
            {
                targetIO.Status = Convert.ToInt16((targetIO.Status + 1) % 2);
                MACHINE_IO_C_STOP.BackColor = targetIO.Status == 1 ? Color.Green : Color.Red;
            }
        }

        private void MACHINE_IO_C_CONT_Click(object sender, EventArgs e)
        {
            var targetIO = PanelIOInfo.Find(x => x.IOName == "MS_AUTO");
            if(targetIO.Status != 1) //the button of continue only active in auto mode.
            {
                return;
            }

            targetIO = PanelIOInfo.Find(x => x.IOName == "C_CONT");
            short result = HiLink.SetMachinePanelIO(FlibHnd, MachineInfo.panelType, PanelConstants.MACHINE_IO_C_CONT, !(targetIO.Status == 1 ? true : false));
            //if (result == 0)
            {
                targetIO.Status = Convert.ToInt16((targetIO.Status + 1) % 2);
                MACHINE_IO_C_CONT.BackColor = targetIO.Status == 1 ? Color.Green : Color.Red;
            }
        }

        private void MACHINE_IO_RESET_Click(object sender, EventArgs e)
        {
            short result = HiLink.SetMachineReset(FlibHnd);
        }

        private void updatePanelTimer_tick(object sender)
        {
            this.Invoke((MethodInvoker)delegate ()
            {
                this.UpdatePanelIO();
            });
        }

        private void updateMachineStatusTimer_tick(object sender)
        {
            this.Invoke((MethodInvoker)delegate ()
            {
                MachineStatusType machineStatus = MachineStatusType.None;
                short result = HiLink.GetMachineStatus(FlibHnd, ref machineStatus);
                if (0 == result)
                {
                    tbMachineStatus.Text = (machineStatus).ToString();
                    MachineCycleTime cycleTime = new MachineCycleTime();
                    HiLink.GetMachineCycleTime(FlibHnd, ref cycleTime);
                    tbCycleTime.Text = cycleTime.minute.ToString() + "M" + (cycleTime.milliSecond / 1000.0).ToString() + "S";
                }
            });
        }

        private short UpdatePanelIO()
        {
            short result;
            result = HiLink.GetMachineAllOPInfo(FlibHnd, MachineInfo.panelType, ref PanelIOInfo);
            if (result == 0 && PanelIOInfo.Count > 0)
            {
                UpdatePanelForm();
            }
            return result;
        }

        private void UpdatePanelForm()
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

                MACHINE_IO_C_START.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_C_START).Status == 1 ? Color.Green : Color.Red);
                MACHINE_IO_C_STOP.BackColor = (PanelIOInfo.Find(x => x.IOUID == PanelConstants.MACHINE_IO_C_STOP).Status == 1 ? Color.Green : Color.Red);
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

            short result = HiLink.SetMachineProgramInfo(FlibHnd, updateMachineProgramInfo);
        }

        private void btProgDel_Click(object sender, EventArgs e)
        {
            DeleteMachineProgramInfo deleteMachineProgramInfo = new DeleteMachineProgramInfo();
            deleteMachineProgramInfo.headType = (short)HeadType.Main;
            deleteMachineProgramInfo.programNo = 10;

            int activateProgNum = 0;
            short result = HiLink.DeleteMachineProgramInfo(FlibHnd, deleteMachineProgramInfo, out activateProgNum);
        }

        private void btGetTemperature_Click(object sender, EventArgs e)
        {
            short result = HiLink.GetMotorTemperature(FlibHnd, ref MachineMotorTemperatureInfo);
            if (result == 0)
            {
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
            this.MachineStatusTimer.Change(Timeout.Infinite, Timeout.Infinite);
            this.PanelStatusTimer.Change(Timeout.Infinite, Timeout.Infinite);
            this.Invoke((MethodInvoker)delegate ()
            {
                this.MachineStatusTimer.Dispose();
                this.PanelStatusTimer.Dispose();
            });
        }

        private void MainProgView_AfterCheck(object sender, TreeViewEventArgs e)
        {
            var targetNode = sender as TreeView;

            if (e.Node.Parent != null)
            {
                if (e.Node.Checked)
                {
                    int progNumLength = e.Node.Text.IndexOf('-') - 1;
                    string progNum = e.Node.Text.Substring(0, progNumLength);

                    UpdateMachineActivateProgNo updateMachineActivateProgNo = new UpdateMachineActivateProgNo();
                    updateMachineActivateProgNo.headType = (short)HeadType.Main;
                    updateMachineActivateProgNo.programNo = Convert.ToInt16(progNum);

                    short result = HiLink.SetActivateProgram(FlibHnd, updateMachineActivateProgNo);
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

                    short result = HiLink.SetActivateProgram(FlibHnd, updateMachineActivateProgNo);
                }
            }
        }

        private void GetCycleTime_Click(object sender, EventArgs e)
        {
            MachineCycleTime cycleTime = new MachineCycleTime();
            HiLink.GetMachineCycleTime(FlibHnd, ref cycleTime);

            tbCycleTime.Text = cycleTime.minute.ToString() + "M" + (cycleTime.milliSecond / 1000.0).ToString() + "S";
        }
    }
}
