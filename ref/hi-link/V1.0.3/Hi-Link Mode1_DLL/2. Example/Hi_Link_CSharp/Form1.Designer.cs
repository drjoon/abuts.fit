
namespace Hi_Link_CSharp
{
    partial class Form1
    {
        /// <summary>
        /// 필수 디자이너 변수입니다.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// 사용 중인 모든 리소스를 정리합니다.
        /// </summary>
        /// <param name="disposing">관리되는 리소스를 삭제해야 하면 true이고, 그렇지 않으면 false입니다.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form 디자이너에서 생성한 코드

        /// <summary>
        /// 디자이너 지원에 필요한 메서드입니다. 
        /// 이 메서드의 내용을 코드 편집기로 수정하지 마세요.
        /// </summary>
        private void InitializeComponent()
        {
            System.Windows.Forms.TreeNode treeNode11 = new System.Windows.Forms.TreeNode("노드2");
            System.Windows.Forms.TreeNode treeNode12 = new System.Windows.Forms.TreeNode("노드0", new System.Windows.Forms.TreeNode[] {
            treeNode11});
            System.Windows.Forms.TreeNode treeNode13 = new System.Windows.Forms.TreeNode("노드3");
            System.Windows.Forms.TreeNode treeNode14 = new System.Windows.Forms.TreeNode("노드4");
            System.Windows.Forms.TreeNode treeNode15 = new System.Windows.Forms.TreeNode("노드1", new System.Windows.Forms.TreeNode[] {
            treeNode13,
            treeNode14});
            System.Windows.Forms.TreeNode treeNode16 = new System.Windows.Forms.TreeNode("노드2");
            System.Windows.Forms.TreeNode treeNode17 = new System.Windows.Forms.TreeNode("노드0", new System.Windows.Forms.TreeNode[] {
            treeNode16});
            System.Windows.Forms.TreeNode treeNode18 = new System.Windows.Forms.TreeNode("노드3");
            System.Windows.Forms.TreeNode treeNode19 = new System.Windows.Forms.TreeNode("노드4");
            System.Windows.Forms.TreeNode treeNode20 = new System.Windows.Forms.TreeNode("노드1", new System.Windows.Forms.TreeNode[] {
            treeNode18,
            treeNode19});
            this.MachineIP = new System.Windows.Forms.TextBox();
            this.MachinePort = new System.Windows.Forms.TextBox();
            this.label1 = new System.Windows.Forms.Label();
            this.label2 = new System.Windows.Forms.Label();
            this.CommOpen = new System.Windows.Forms.Button();
            this.CommClose = new System.Windows.Forms.Button();
            this.label4 = new System.Windows.Forms.Label();
            this.CtrlType = new System.Windows.Forms.TextBox();
            this.label5 = new System.Windows.Forms.Label();
            this.ToolType = new System.Windows.Forms.TextBox();
            this.tabControl1 = new System.Windows.Forms.TabControl();
            this.tabPage1 = new System.Windows.Forms.TabPage();
            this.textBox3 = new System.Windows.Forms.TextBox();
            this.textBox2 = new System.Windows.Forms.TextBox();
            this.textBox1 = new System.Windows.Forms.TextBox();
            this.label12 = new System.Windows.Forms.Label();
            this.tbAlarmCode = new System.Windows.Forms.TextBox();
            this.label14 = new System.Windows.Forms.Label();
            this.btGetAlarmInfo = new System.Windows.Forms.Button();
            this.label13 = new System.Windows.Forms.Label();
            this.label3 = new System.Windows.Forms.Label();
            this.tbSerialNum = new System.Windows.Forms.TextBox();
            this.lbMachineStatus = new System.Windows.Forms.Label();
            this.tbMachineStatus = new System.Windows.Forms.TextBox();
            this.GetStatus = new System.Windows.Forms.Button();
            this.label11 = new System.Windows.Forms.Label();
            this.label9 = new System.Windows.Forms.Label();
            this.label7 = new System.Windows.Forms.Label();
            this.tbSubProgComment = new System.Windows.Forms.TextBox();
            this.label10 = new System.Windows.Forms.Label();
            this.tbMainProgComment = new System.Windows.Forms.TextBox();
            this.label8 = new System.Windows.Forms.Label();
            this.tbSubProgNum = new System.Windows.Forms.TextBox();
            this.CurrentProduct = new System.Windows.Forms.TextBox();
            this.tbMainProgNum = new System.Windows.Forms.TextBox();
            this.label6 = new System.Windows.Forms.Label();
            this.TargetProduct = new System.Windows.Forms.TextBox();
            this.btGetCurrentProgInfo = new System.Windows.Forms.Button();
            this.GetProductCount = new System.Windows.Forms.Button();
            this.tabPage2 = new System.Windows.Forms.TabPage();
            this.splitContainer1 = new System.Windows.Forms.SplitContainer();
            this.GetToolLife = new System.Windows.Forms.Button();
            this.dataGridView1 = new System.Windows.Forms.DataGridView();
            this.toolIdx = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.useCount = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.configCount = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.warningCount = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.use = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.tabPage3 = new System.Windows.Forms.TabPage();
            this.splitContainer2 = new System.Windows.Forms.SplitContainer();
            this.cbOffsetHeadType = new System.Windows.Forms.ComboBox();
            this.btGetToolOffset = new System.Windows.Forms.Button();
            this.dgToolOffset = new System.Windows.Forms.DataGridView();
            this.dataGridViewTextBoxColumn1 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dataGridViewTextBoxColumn2 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dataGridViewTextBoxColumn3 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dataGridViewTextBoxColumn4 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dataGridViewTextBoxColumn5 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.Column = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.Column1 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.Column2 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.Column3 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.Column4 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.Column5 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.tabPage4 = new System.Windows.Forms.TabPage();
            this.splitContainer4 = new System.Windows.Forms.SplitContainer();
            this.btProgDel = new System.Windows.Forms.Button();
            this.btProgCreate = new System.Windows.Forms.Button();
            this.splitContainer3 = new System.Windows.Forms.SplitContainer();
            this.MainProgView = new System.Windows.Forms.TreeView();
            this.SubProgView = new System.Windows.Forms.TreeView();
            this.tabPage5 = new System.Windows.Forms.TabPage();
            this.MACHINE_IO_F_AUX2 = new System.Windows.Forms.Button();
            this.MACHINE_IO_F_AUX1 = new System.Windows.Forms.Button();
            this.MACHINE_IO_F_WARMUP = new System.Windows.Forms.Button();
            this.MACHINE_IO_F_OILMIST = new System.Windows.Forms.Button();
            this.MACHINE_IO_MS_ZERORETURN = new System.Windows.Forms.Button();
            this.MACHINE_IO_MS_JOG = new System.Windows.Forms.Button();
            this.MACHINE_IO_F_COOL = new System.Windows.Forms.Button();
            this.MACHINE_IO_RO_FULL = new System.Windows.Forms.Button();
            this.MACHINE_IO_MS_HANDLE = new System.Windows.Forms.Button();
            this.MACHINE_IO_RO_HALF = new System.Windows.Forms.Button();
            this.MACHINE_IO_C_CONT = new System.Windows.Forms.Button();
            this.MACHINE_IO_F_MPG = new System.Windows.Forms.Button();
            this.MACHINE_IO_OP_SUB = new System.Windows.Forms.Button();
            this.MACHINE_IO_MS_MDI = new System.Windows.Forms.Button();
            this.MACHINE_IO_OP_SIMUL = new System.Windows.Forms.Button();
            this.MACHINE_IO_C_STOP = new System.Windows.Forms.Button();
            this.MACHINE_IO_RO_QUARTER = new System.Windows.Forms.Button();
            this.MACHINE_IO_F_SB = new System.Windows.Forms.Button();
            this.MACHINE_IO_DP_SUB = new System.Windows.Forms.Button();
            this.MACHINE_IO_MS_AUTO = new System.Windows.Forms.Button();
            this.MACHINE_IO_DP_MAIN = new System.Windows.Forms.Button();
            this.MACHINE_IO_RESET = new System.Windows.Forms.Button();
            this.MACHINE_IO_C_START = new System.Windows.Forms.Button();
            this.MACHINE_IO_RO_ZERO = new System.Windows.Forms.Button();
            this.MACHINE_IO_F_DRYRUN = new System.Windows.Forms.Button();
            this.MACHINE_IO_OP_MAIN = new System.Windows.Forms.Button();
            this.MACHINE_IO_MS_EDIT = new System.Windows.Forms.Button();
            this.tbTemperature = new System.Windows.Forms.TabPage();
            this.splitContainer7 = new System.Windows.Forms.SplitContainer();
            this.btGetTemperature = new System.Windows.Forms.Button();
            this.splitContainer5 = new System.Windows.Forms.SplitContainer();
            this.dgMainMoterTemp = new System.Windows.Forms.DataGridView();
            this.dataGridViewTextBoxColumn6 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dataGridViewTextBoxColumn10 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.splitContainer6 = new System.Windows.Forms.SplitContainer();
            this.dgSubMotorTemp = new System.Windows.Forms.DataGridView();
            this.dataGridViewTextBoxColumn7 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dataGridViewTextBoxColumn8 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dgSpindleTemp = new System.Windows.Forms.DataGridView();
            this.dataGridViewTextBoxColumn9 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dataGridViewTextBoxColumn11 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.label15 = new System.Windows.Forms.Label();
            this.tbCycleTime = new System.Windows.Forms.TextBox();
            this.GetCycleTime = new System.Windows.Forms.Button();
            this.tabControl1.SuspendLayout();
            this.tabPage1.SuspendLayout();
            this.tabPage2.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer1)).BeginInit();
            this.splitContainer1.Panel1.SuspendLayout();
            this.splitContainer1.Panel2.SuspendLayout();
            this.splitContainer1.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.dataGridView1)).BeginInit();
            this.tabPage3.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer2)).BeginInit();
            this.splitContainer2.Panel1.SuspendLayout();
            this.splitContainer2.Panel2.SuspendLayout();
            this.splitContainer2.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.dgToolOffset)).BeginInit();
            this.tabPage4.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer4)).BeginInit();
            this.splitContainer4.Panel1.SuspendLayout();
            this.splitContainer4.Panel2.SuspendLayout();
            this.splitContainer4.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer3)).BeginInit();
            this.splitContainer3.Panel1.SuspendLayout();
            this.splitContainer3.Panel2.SuspendLayout();
            this.splitContainer3.SuspendLayout();
            this.tabPage5.SuspendLayout();
            this.tbTemperature.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer7)).BeginInit();
            this.splitContainer7.Panel1.SuspendLayout();
            this.splitContainer7.Panel2.SuspendLayout();
            this.splitContainer7.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer5)).BeginInit();
            this.splitContainer5.Panel1.SuspendLayout();
            this.splitContainer5.Panel2.SuspendLayout();
            this.splitContainer5.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.dgMainMoterTemp)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer6)).BeginInit();
            this.splitContainer6.Panel1.SuspendLayout();
            this.splitContainer6.Panel2.SuspendLayout();
            this.splitContainer6.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.dgSubMotorTemp)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.dgSpindleTemp)).BeginInit();
            this.SuspendLayout();
            // 
            // MachineIP
            // 
            this.MachineIP.Location = new System.Drawing.Point(60, 9);
            this.MachineIP.Name = "MachineIP";
            this.MachineIP.Size = new System.Drawing.Size(113, 21);
            this.MachineIP.TabIndex = 0;
            this.MachineIP.Text = "192.168.0.101";
            // 
            // MachinePort
            // 
            this.MachinePort.Location = new System.Drawing.Point(60, 36);
            this.MachinePort.Name = "MachinePort";
            this.MachinePort.Size = new System.Drawing.Size(113, 21);
            this.MachinePort.TabIndex = 1;
            this.MachinePort.Text = "8193";
            // 
            // label1
            // 
            this.label1.AutoSize = true;
            this.label1.Location = new System.Drawing.Point(15, 15);
            this.label1.Name = "label1";
            this.label1.Size = new System.Drawing.Size(16, 12);
            this.label1.TabIndex = 2;
            this.label1.Text = "IP";
            // 
            // label2
            // 
            this.label2.AutoSize = true;
            this.label2.Location = new System.Drawing.Point(15, 42);
            this.label2.Name = "label2";
            this.label2.Size = new System.Drawing.Size(38, 12);
            this.label2.TabIndex = 3;
            this.label2.Text = "PORT";
            // 
            // CommOpen
            // 
            this.CommOpen.Location = new System.Drawing.Point(14, 202);
            this.CommOpen.Name = "CommOpen";
            this.CommOpen.Size = new System.Drawing.Size(75, 23);
            this.CommOpen.TabIndex = 4;
            this.CommOpen.Text = "Open";
            this.CommOpen.UseVisualStyleBackColor = true;
            this.CommOpen.Click += new System.EventHandler(this.CommOpen_Click);
            // 
            // CommClose
            // 
            this.CommClose.Location = new System.Drawing.Point(95, 202);
            this.CommClose.Name = "CommClose";
            this.CommClose.Size = new System.Drawing.Size(75, 23);
            this.CommClose.TabIndex = 5;
            this.CommClose.Text = "Close";
            this.CommClose.UseVisualStyleBackColor = true;
            this.CommClose.Click += new System.EventHandler(this.CommClose_Click);
            // 
            // label4
            // 
            this.label4.AutoSize = true;
            this.label4.Location = new System.Drawing.Point(15, 248);
            this.label4.Name = "label4";
            this.label4.Size = new System.Drawing.Size(92, 12);
            this.label4.TabIndex = 9;
            this.label4.Text = "Controller Type";
            // 
            // CtrlType
            // 
            this.CtrlType.Location = new System.Drawing.Point(113, 239);
            this.CtrlType.Name = "CtrlType";
            this.CtrlType.Size = new System.Drawing.Size(113, 21);
            this.CtrlType.TabIndex = 8;
            // 
            // label5
            // 
            this.label5.AutoSize = true;
            this.label5.Location = new System.Drawing.Point(15, 275);
            this.label5.Name = "label5";
            this.label5.Size = new System.Drawing.Size(63, 12);
            this.label5.TabIndex = 11;
            this.label5.Text = "Tool Type";
            // 
            // ToolType
            // 
            this.ToolType.Location = new System.Drawing.Point(113, 266);
            this.ToolType.Name = "ToolType";
            this.ToolType.Size = new System.Drawing.Size(113, 21);
            this.ToolType.TabIndex = 10;
            // 
            // tabControl1
            // 
            this.tabControl1.Controls.Add(this.tabPage1);
            this.tabControl1.Controls.Add(this.tabPage2);
            this.tabControl1.Controls.Add(this.tabPage3);
            this.tabControl1.Controls.Add(this.tabPage4);
            this.tabControl1.Controls.Add(this.tabPage5);
            this.tabControl1.Controls.Add(this.tbTemperature);
            this.tabControl1.Dock = System.Windows.Forms.DockStyle.Fill;
            this.tabControl1.Location = new System.Drawing.Point(0, 0);
            this.tabControl1.Name = "tabControl1";
            this.tabControl1.SelectedIndex = 0;
            this.tabControl1.Size = new System.Drawing.Size(959, 565);
            this.tabControl1.TabIndex = 13;
            this.tabControl1.SelectedIndexChanged += new System.EventHandler(this.tabControl1_SelectedIndexChanged);
            // 
            // tabPage1
            // 
            this.tabPage1.Controls.Add(this.label15);
            this.tabPage1.Controls.Add(this.tbCycleTime);
            this.tabPage1.Controls.Add(this.GetCycleTime);
            this.tabPage1.Controls.Add(this.textBox3);
            this.tabPage1.Controls.Add(this.textBox2);
            this.tabPage1.Controls.Add(this.textBox1);
            this.tabPage1.Controls.Add(this.label12);
            this.tabPage1.Controls.Add(this.tbAlarmCode);
            this.tabPage1.Controls.Add(this.label14);
            this.tabPage1.Controls.Add(this.btGetAlarmInfo);
            this.tabPage1.Controls.Add(this.label13);
            this.tabPage1.Controls.Add(this.label3);
            this.tabPage1.Controls.Add(this.tbSerialNum);
            this.tabPage1.Controls.Add(this.lbMachineStatus);
            this.tabPage1.Controls.Add(this.tbMachineStatus);
            this.tabPage1.Controls.Add(this.GetStatus);
            this.tabPage1.Controls.Add(this.label11);
            this.tabPage1.Controls.Add(this.label9);
            this.tabPage1.Controls.Add(this.label7);
            this.tabPage1.Controls.Add(this.tbSubProgComment);
            this.tabPage1.Controls.Add(this.label10);
            this.tabPage1.Controls.Add(this.tbMainProgComment);
            this.tabPage1.Controls.Add(this.label8);
            this.tabPage1.Controls.Add(this.tbSubProgNum);
            this.tabPage1.Controls.Add(this.CurrentProduct);
            this.tabPage1.Controls.Add(this.tbMainProgNum);
            this.tabPage1.Controls.Add(this.label6);
            this.tabPage1.Controls.Add(this.TargetProduct);
            this.tabPage1.Controls.Add(this.label1);
            this.tabPage1.Controls.Add(this.btGetCurrentProgInfo);
            this.tabPage1.Controls.Add(this.GetProductCount);
            this.tabPage1.Controls.Add(this.MachineIP);
            this.tabPage1.Controls.Add(this.label5);
            this.tabPage1.Controls.Add(this.MachinePort);
            this.tabPage1.Controls.Add(this.ToolType);
            this.tabPage1.Controls.Add(this.label2);
            this.tabPage1.Controls.Add(this.label4);
            this.tabPage1.Controls.Add(this.CommOpen);
            this.tabPage1.Controls.Add(this.CtrlType);
            this.tabPage1.Controls.Add(this.CommClose);
            this.tabPage1.Location = new System.Drawing.Point(4, 22);
            this.tabPage1.Name = "tabPage1";
            this.tabPage1.Padding = new System.Windows.Forms.Padding(3);
            this.tabPage1.Size = new System.Drawing.Size(951, 539);
            this.tabPage1.TabIndex = 0;
            this.tabPage1.Text = "Info";
            this.tabPage1.UseVisualStyleBackColor = true;
            // 
            // textBox3
            // 
            this.textBox3.Location = new System.Drawing.Point(51, 326);
            this.textBox3.Name = "textBox3";
            this.textBox3.Size = new System.Drawing.Size(113, 21);
            this.textBox3.TabIndex = 30;
            // 
            // textBox2
            // 
            this.textBox2.Location = new System.Drawing.Point(17, 171);
            this.textBox2.Name = "textBox2";
            this.textBox2.Size = new System.Drawing.Size(156, 21);
            this.textBox2.TabIndex = 29;
            this.textBox2.Text = "8193";
            // 
            // textBox1
            // 
            this.textBox1.Location = new System.Drawing.Point(17, 128);
            this.textBox1.Name = "textBox1";
            this.textBox1.Size = new System.Drawing.Size(156, 21);
            this.textBox1.TabIndex = 29;
            this.textBox1.Text = "8193";
            // 
            // label12
            // 
            this.label12.AutoSize = true;
            this.label12.Location = new System.Drawing.Point(284, 344);
            this.label12.Name = "label12";
            this.label12.Size = new System.Drawing.Size(72, 12);
            this.label12.TabIndex = 28;
            this.label12.Text = "Alarm Code";
            // 
            // tbAlarmCode
            // 
            this.tbAlarmCode.Location = new System.Drawing.Point(382, 341);
            this.tbAlarmCode.Name = "tbAlarmCode";
            this.tbAlarmCode.Size = new System.Drawing.Size(110, 21);
            this.tbAlarmCode.TabIndex = 27;
            // 
            // label14
            // 
            this.label14.AutoSize = true;
            this.label14.Location = new System.Drawing.Point(15, 156);
            this.label14.Name = "label14";
            this.label14.Size = new System.Drawing.Size(177, 12);
            this.label14.TabIndex = 25;
            this.label14.Text = "Remote Control Access Grade";
            // 
            // btGetAlarmInfo
            // 
            this.btGetAlarmInfo.Location = new System.Drawing.Point(283, 368);
            this.btGetAlarmInfo.Name = "btGetAlarmInfo";
            this.btGetAlarmInfo.Size = new System.Drawing.Size(209, 23);
            this.btGetAlarmInfo.TabIndex = 26;
            this.btGetAlarmInfo.Text = "Get Machine Alarm";
            this.btGetAlarmInfo.UseVisualStyleBackColor = true;
            this.btGetAlarmInfo.Click += new System.EventHandler(this.btGetAlarmInfo_Click);
            // 
            // label13
            // 
            this.label13.AutoSize = true;
            this.label13.Location = new System.Drawing.Point(15, 113);
            this.label13.Name = "label13";
            this.label13.Size = new System.Drawing.Size(149, 12);
            this.label13.TabIndex = 25;
            this.label13.Text = "Monitoring Access Grade";
            // 
            // label3
            // 
            this.label3.AutoSize = true;
            this.label3.Location = new System.Drawing.Point(15, 68);
            this.label3.Name = "label3";
            this.label3.Size = new System.Drawing.Size(68, 12);
            this.label3.TabIndex = 25;
            this.label3.Text = "Serial Num";
            // 
            // tbSerialNum
            // 
            this.tbSerialNum.Location = new System.Drawing.Point(17, 84);
            this.tbSerialNum.Name = "tbSerialNum";
            this.tbSerialNum.Size = new System.Drawing.Size(156, 21);
            this.tbSerialNum.TabIndex = 24;
            this.tbSerialNum.Text = "1111-1111-1111-1112 ";
            // 
            // lbMachineStatus
            // 
            this.lbMachineStatus.AutoSize = true;
            this.lbMachineStatus.Location = new System.Drawing.Point(284, 9);
            this.lbMachineStatus.Name = "lbMachineStatus";
            this.lbMachineStatus.Size = new System.Drawing.Size(93, 12);
            this.lbMachineStatus.TabIndex = 22;
            this.lbMachineStatus.Text = "Machine Status";
            // 
            // tbMachineStatus
            // 
            this.tbMachineStatus.Location = new System.Drawing.Point(382, 6);
            this.tbMachineStatus.Name = "tbMachineStatus";
            this.tbMachineStatus.Size = new System.Drawing.Size(110, 21);
            this.tbMachineStatus.TabIndex = 21;
            // 
            // GetStatus
            // 
            this.GetStatus.Location = new System.Drawing.Point(283, 33);
            this.GetStatus.Name = "GetStatus";
            this.GetStatus.Size = new System.Drawing.Size(209, 23);
            this.GetStatus.TabIndex = 20;
            this.GetStatus.Text = "Get Machine Status";
            this.GetStatus.UseVisualStyleBackColor = true;
            this.GetStatus.Click += new System.EventHandler(this.GetStatus_Click);
            // 
            // label11
            // 
            this.label11.AutoSize = true;
            this.label11.Location = new System.Drawing.Point(281, 271);
            this.label11.Name = "label11";
            this.label11.Size = new System.Drawing.Size(94, 12);
            this.label11.TabIndex = 16;
            this.label11.Text = "Prog. Comment";
            // 
            // label9
            // 
            this.label9.AutoSize = true;
            this.label9.Location = new System.Drawing.Point(281, 217);
            this.label9.Name = "label9";
            this.label9.Size = new System.Drawing.Size(94, 12);
            this.label9.TabIndex = 16;
            this.label9.Text = "Prog. Comment";
            // 
            // label7
            // 
            this.label7.AutoSize = true;
            this.label7.Location = new System.Drawing.Point(281, 121);
            this.label7.Name = "label7";
            this.label7.Size = new System.Drawing.Size(93, 12);
            this.label7.TabIndex = 16;
            this.label7.Text = "Current Product";
            // 
            // tbSubProgComment
            // 
            this.tbSubProgComment.Location = new System.Drawing.Point(379, 263);
            this.tbSubProgComment.Name = "tbSubProgComment";
            this.tbSubProgComment.Size = new System.Drawing.Size(113, 21);
            this.tbSubProgComment.TabIndex = 15;
            // 
            // label10
            // 
            this.label10.AutoSize = true;
            this.label10.Location = new System.Drawing.Point(281, 244);
            this.label10.Name = "label10";
            this.label10.Size = new System.Drawing.Size(92, 12);
            this.label10.TabIndex = 14;
            this.label10.Text = "Sub Prog. Num";
            // 
            // tbMainProgComment
            // 
            this.tbMainProgComment.Location = new System.Drawing.Point(379, 209);
            this.tbMainProgComment.Name = "tbMainProgComment";
            this.tbMainProgComment.Size = new System.Drawing.Size(113, 21);
            this.tbMainProgComment.TabIndex = 15;
            // 
            // label8
            // 
            this.label8.AutoSize = true;
            this.label8.Location = new System.Drawing.Point(281, 190);
            this.label8.Name = "label8";
            this.label8.Size = new System.Drawing.Size(98, 12);
            this.label8.TabIndex = 14;
            this.label8.Text = "Main Prog. Num";
            // 
            // tbSubProgNum
            // 
            this.tbSubProgNum.Location = new System.Drawing.Point(379, 236);
            this.tbSubProgNum.Name = "tbSubProgNum";
            this.tbSubProgNum.Size = new System.Drawing.Size(113, 21);
            this.tbSubProgNum.TabIndex = 13;
            // 
            // CurrentProduct
            // 
            this.CurrentProduct.Location = new System.Drawing.Point(379, 113);
            this.CurrentProduct.Name = "CurrentProduct";
            this.CurrentProduct.Size = new System.Drawing.Size(113, 21);
            this.CurrentProduct.TabIndex = 15;
            // 
            // tbMainProgNum
            // 
            this.tbMainProgNum.Location = new System.Drawing.Point(379, 182);
            this.tbMainProgNum.Name = "tbMainProgNum";
            this.tbMainProgNum.Size = new System.Drawing.Size(113, 21);
            this.tbMainProgNum.TabIndex = 13;
            // 
            // label6
            // 
            this.label6.AutoSize = true;
            this.label6.Location = new System.Drawing.Point(281, 94);
            this.label6.Name = "label6";
            this.label6.Size = new System.Drawing.Size(88, 12);
            this.label6.TabIndex = 14;
            this.label6.Text = "Target Product";
            // 
            // TargetProduct
            // 
            this.TargetProduct.Location = new System.Drawing.Point(379, 86);
            this.TargetProduct.Name = "TargetProduct";
            this.TargetProduct.Size = new System.Drawing.Size(113, 21);
            this.TargetProduct.TabIndex = 13;
            // 
            // btGetCurrentProgInfo
            // 
            this.btGetCurrentProgInfo.Location = new System.Drawing.Point(283, 290);
            this.btGetCurrentProgInfo.Name = "btGetCurrentProgInfo";
            this.btGetCurrentProgInfo.Size = new System.Drawing.Size(209, 23);
            this.btGetCurrentProgInfo.TabIndex = 12;
            this.btGetCurrentProgInfo.Text = "Get Current Program Info";
            this.btGetCurrentProgInfo.UseVisualStyleBackColor = true;
            this.btGetCurrentProgInfo.Click += new System.EventHandler(this.btGetCurrentProgInfo_Click);
            // 
            // GetProductCount
            // 
            this.GetProductCount.Location = new System.Drawing.Point(283, 147);
            this.GetProductCount.Name = "GetProductCount";
            this.GetProductCount.Size = new System.Drawing.Size(209, 23);
            this.GetProductCount.TabIndex = 12;
            this.GetProductCount.Text = "Get Product Count";
            this.GetProductCount.UseVisualStyleBackColor = true;
            this.GetProductCount.Click += new System.EventHandler(this.GetProductCount_Click);
            // 
            // tabPage2
            // 
            this.tabPage2.Controls.Add(this.splitContainer1);
            this.tabPage2.Location = new System.Drawing.Point(4, 22);
            this.tabPage2.Name = "tabPage2";
            this.tabPage2.Padding = new System.Windows.Forms.Padding(3);
            this.tabPage2.Size = new System.Drawing.Size(951, 539);
            this.tabPage2.TabIndex = 1;
            this.tabPage2.Text = "Tool Life";
            this.tabPage2.UseVisualStyleBackColor = true;
            // 
            // splitContainer1
            // 
            this.splitContainer1.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer1.Location = new System.Drawing.Point(3, 3);
            this.splitContainer1.Name = "splitContainer1";
            this.splitContainer1.Orientation = System.Windows.Forms.Orientation.Horizontal;
            // 
            // splitContainer1.Panel1
            // 
            this.splitContainer1.Panel1.Controls.Add(this.GetToolLife);
            // 
            // splitContainer1.Panel2
            // 
            this.splitContainer1.Panel2.Controls.Add(this.dataGridView1);
            this.splitContainer1.Size = new System.Drawing.Size(945, 533);
            this.splitContainer1.SplitterDistance = 56;
            this.splitContainer1.TabIndex = 1;
            // 
            // GetToolLife
            // 
            this.GetToolLife.Location = new System.Drawing.Point(6, 8);
            this.GetToolLife.Name = "GetToolLife";
            this.GetToolLife.Size = new System.Drawing.Size(179, 38);
            this.GetToolLife.TabIndex = 0;
            this.GetToolLife.Text = "Get Tool Life";
            this.GetToolLife.UseVisualStyleBackColor = true;
            this.GetToolLife.Click += new System.EventHandler(this.GetToolLife_Click);
            // 
            // dataGridView1
            // 
            this.dataGridView1.AllowUserToAddRows = false;
            this.dataGridView1.AllowUserToDeleteRows = false;
            this.dataGridView1.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill;
            this.dataGridView1.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            this.dataGridView1.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.toolIdx,
            this.useCount,
            this.configCount,
            this.warningCount,
            this.use});
            this.dataGridView1.Dock = System.Windows.Forms.DockStyle.Fill;
            this.dataGridView1.Location = new System.Drawing.Point(0, 0);
            this.dataGridView1.Name = "dataGridView1";
            this.dataGridView1.RowHeadersVisible = false;
            this.dataGridView1.RowTemplate.Height = 23;
            this.dataGridView1.Size = new System.Drawing.Size(945, 473);
            this.dataGridView1.TabIndex = 0;
            this.dataGridView1.VirtualMode = true;
            this.dataGridView1.CellValueNeeded += new System.Windows.Forms.DataGridViewCellValueEventHandler(this.dataGridView1_CellValueNeeded);
            this.dataGridView1.CellValuePushed += new System.Windows.Forms.DataGridViewCellValueEventHandler(this.dataGridView1_CellValuePushed);
            // 
            // toolIdx
            // 
            this.toolIdx.HeaderText = "Tool Idx";
            this.toolIdx.Name = "toolIdx";
            this.toolIdx.ReadOnly = true;
            // 
            // useCount
            // 
            this.useCount.HeaderText = "Use";
            this.useCount.Name = "useCount";
            // 
            // configCount
            // 
            this.configCount.HeaderText = "Config";
            this.configCount.Name = "configCount";
            // 
            // warningCount
            // 
            this.warningCount.HeaderText = "Warning";
            this.warningCount.Name = "warningCount";
            // 
            // use
            // 
            this.use.HeaderText = "Activate";
            this.use.Name = "use";
            // 
            // tabPage3
            // 
            this.tabPage3.Controls.Add(this.splitContainer2);
            this.tabPage3.Location = new System.Drawing.Point(4, 22);
            this.tabPage3.Name = "tabPage3";
            this.tabPage3.Padding = new System.Windows.Forms.Padding(3);
            this.tabPage3.Size = new System.Drawing.Size(951, 539);
            this.tabPage3.TabIndex = 2;
            this.tabPage3.Text = "Tool Offset";
            this.tabPage3.UseVisualStyleBackColor = true;
            // 
            // splitContainer2
            // 
            this.splitContainer2.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer2.Location = new System.Drawing.Point(3, 3);
            this.splitContainer2.Name = "splitContainer2";
            this.splitContainer2.Orientation = System.Windows.Forms.Orientation.Horizontal;
            // 
            // splitContainer2.Panel1
            // 
            this.splitContainer2.Panel1.Controls.Add(this.cbOffsetHeadType);
            this.splitContainer2.Panel1.Controls.Add(this.btGetToolOffset);
            // 
            // splitContainer2.Panel2
            // 
            this.splitContainer2.Panel2.Controls.Add(this.dgToolOffset);
            this.splitContainer2.Size = new System.Drawing.Size(945, 533);
            this.splitContainer2.SplitterDistance = 59;
            this.splitContainer2.TabIndex = 0;
            // 
            // cbOffsetHeadType
            // 
            this.cbOffsetHeadType.FormattingEnabled = true;
            this.cbOffsetHeadType.Items.AddRange(new object[] {
            "Main",
            "Sub"});
            this.cbOffsetHeadType.Location = new System.Drawing.Point(216, 21);
            this.cbOffsetHeadType.Name = "cbOffsetHeadType";
            this.cbOffsetHeadType.Size = new System.Drawing.Size(121, 20);
            this.cbOffsetHeadType.TabIndex = 2;
            // 
            // btGetToolOffset
            // 
            this.btGetToolOffset.Location = new System.Drawing.Point(9, 11);
            this.btGetToolOffset.Name = "btGetToolOffset";
            this.btGetToolOffset.Size = new System.Drawing.Size(179, 38);
            this.btGetToolOffset.TabIndex = 1;
            this.btGetToolOffset.Text = "Get Tool Offset";
            this.btGetToolOffset.UseVisualStyleBackColor = true;
            this.btGetToolOffset.Click += new System.EventHandler(this.btGetToolOffset_Click);
            // 
            // dgToolOffset
            // 
            this.dgToolOffset.AllowUserToAddRows = false;
            this.dgToolOffset.AllowUserToDeleteRows = false;
            this.dgToolOffset.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill;
            this.dgToolOffset.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            this.dgToolOffset.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.dataGridViewTextBoxColumn1,
            this.dataGridViewTextBoxColumn2,
            this.dataGridViewTextBoxColumn3,
            this.dataGridViewTextBoxColumn4,
            this.dataGridViewTextBoxColumn5,
            this.Column,
            this.Column1,
            this.Column2,
            this.Column3,
            this.Column4,
            this.Column5});
            this.dgToolOffset.Dock = System.Windows.Forms.DockStyle.Fill;
            this.dgToolOffset.Location = new System.Drawing.Point(0, 0);
            this.dgToolOffset.Name = "dgToolOffset";
            this.dgToolOffset.RowHeadersVisible = false;
            this.dgToolOffset.RowTemplate.Height = 23;
            this.dgToolOffset.Size = new System.Drawing.Size(945, 470);
            this.dgToolOffset.TabIndex = 1;
            this.dgToolOffset.VirtualMode = true;
            this.dgToolOffset.CellValueNeeded += new System.Windows.Forms.DataGridViewCellValueEventHandler(this.dgToolOffset_CellValueNeeded);
            this.dgToolOffset.CellValuePushed += new System.Windows.Forms.DataGridViewCellValueEventHandler(this.dgToolOffset_CellValuePushed);
            // 
            // dataGridViewTextBoxColumn1
            // 
            this.dataGridViewTextBoxColumn1.HeaderText = "Offset Idx";
            this.dataGridViewTextBoxColumn1.Name = "dataGridViewTextBoxColumn1";
            this.dataGridViewTextBoxColumn1.ReadOnly = true;
            // 
            // dataGridViewTextBoxColumn2
            // 
            this.dataGridViewTextBoxColumn2.HeaderText = "X_Geo";
            this.dataGridViewTextBoxColumn2.Name = "dataGridViewTextBoxColumn2";
            // 
            // dataGridViewTextBoxColumn3
            // 
            this.dataGridViewTextBoxColumn3.HeaderText = "Y_Geo";
            this.dataGridViewTextBoxColumn3.Name = "dataGridViewTextBoxColumn3";
            // 
            // dataGridViewTextBoxColumn4
            // 
            this.dataGridViewTextBoxColumn4.HeaderText = "Z_Geo";
            this.dataGridViewTextBoxColumn4.Name = "dataGridViewTextBoxColumn4";
            // 
            // dataGridViewTextBoxColumn5
            // 
            this.dataGridViewTextBoxColumn5.HeaderText = "R_Geo";
            this.dataGridViewTextBoxColumn5.Name = "dataGridViewTextBoxColumn5";
            // 
            // Column
            // 
            this.Column.HeaderText = "Tip_Geo";
            this.Column.Name = "Column";
            // 
            // Column1
            // 
            this.Column1.HeaderText = "X_Wear";
            this.Column1.Name = "Column1";
            // 
            // Column2
            // 
            this.Column2.HeaderText = "Y_Wear";
            this.Column2.Name = "Column2";
            // 
            // Column3
            // 
            this.Column3.HeaderText = "Z_Wear";
            this.Column3.Name = "Column3";
            // 
            // Column4
            // 
            this.Column4.HeaderText = "R_Wear";
            this.Column4.Name = "Column4";
            // 
            // Column5
            // 
            this.Column5.HeaderText = "Tip_Wear";
            this.Column5.Name = "Column5";
            // 
            // tabPage4
            // 
            this.tabPage4.Controls.Add(this.splitContainer4);
            this.tabPage4.Location = new System.Drawing.Point(4, 22);
            this.tabPage4.Name = "tabPage4";
            this.tabPage4.Padding = new System.Windows.Forms.Padding(3);
            this.tabPage4.Size = new System.Drawing.Size(951, 539);
            this.tabPage4.TabIndex = 3;
            this.tabPage4.Text = "Prog List";
            this.tabPage4.UseVisualStyleBackColor = true;
            // 
            // splitContainer4
            // 
            this.splitContainer4.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer4.Location = new System.Drawing.Point(3, 3);
            this.splitContainer4.Name = "splitContainer4";
            this.splitContainer4.Orientation = System.Windows.Forms.Orientation.Horizontal;
            // 
            // splitContainer4.Panel1
            // 
            this.splitContainer4.Panel1.Controls.Add(this.btProgDel);
            this.splitContainer4.Panel1.Controls.Add(this.btProgCreate);
            // 
            // splitContainer4.Panel2
            // 
            this.splitContainer4.Panel2.Controls.Add(this.splitContainer3);
            this.splitContainer4.Size = new System.Drawing.Size(945, 533);
            this.splitContainer4.SplitterDistance = 60;
            this.splitContainer4.TabIndex = 1;
            // 
            // btProgDel
            // 
            this.btProgDel.Location = new System.Drawing.Point(105, 4);
            this.btProgDel.Name = "btProgDel";
            this.btProgDel.Size = new System.Drawing.Size(94, 54);
            this.btProgDel.TabIndex = 1;
            this.btProgDel.Text = "Delete";
            this.btProgDel.UseVisualStyleBackColor = true;
            this.btProgDel.Click += new System.EventHandler(this.btProgDel_Click);
            // 
            // btProgCreate
            // 
            this.btProgCreate.Location = new System.Drawing.Point(5, 4);
            this.btProgCreate.Name = "btProgCreate";
            this.btProgCreate.Size = new System.Drawing.Size(94, 54);
            this.btProgCreate.TabIndex = 0;
            this.btProgCreate.Text = "Create";
            this.btProgCreate.UseVisualStyleBackColor = true;
            this.btProgCreate.Click += new System.EventHandler(this.btProgCreate_Click);
            // 
            // splitContainer3
            // 
            this.splitContainer3.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer3.Location = new System.Drawing.Point(0, 0);
            this.splitContainer3.Name = "splitContainer3";
            // 
            // splitContainer3.Panel1
            // 
            this.splitContainer3.Panel1.Controls.Add(this.MainProgView);
            // 
            // splitContainer3.Panel2
            // 
            this.splitContainer3.Panel2.Controls.Add(this.SubProgView);
            this.splitContainer3.Size = new System.Drawing.Size(945, 469);
            this.splitContainer3.SplitterDistance = 473;
            this.splitContainer3.TabIndex = 0;
            // 
            // MainProgView
            // 
            this.MainProgView.CheckBoxes = true;
            this.MainProgView.Dock = System.Windows.Forms.DockStyle.Fill;
            this.MainProgView.Location = new System.Drawing.Point(0, 0);
            this.MainProgView.Name = "MainProgView";
            treeNode11.Name = "노드2";
            treeNode11.Text = "노드2";
            treeNode12.Name = "노드0";
            treeNode12.Text = "노드0";
            treeNode13.Name = "노드3";
            treeNode13.Text = "노드3";
            treeNode14.Name = "노드4";
            treeNode14.Text = "노드4";
            treeNode15.Name = "노드1";
            treeNode15.Text = "노드1";
            this.MainProgView.Nodes.AddRange(new System.Windows.Forms.TreeNode[] {
            treeNode12,
            treeNode15});
            this.MainProgView.Size = new System.Drawing.Size(473, 469);
            this.MainProgView.TabIndex = 0;
            this.MainProgView.AfterCheck += new System.Windows.Forms.TreeViewEventHandler(this.MainProgView_AfterCheck);
            this.MainProgView.NodeMouseDoubleClick += new System.Windows.Forms.TreeNodeMouseClickEventHandler(this.treeView1_NodeMouseDoubleClick);
            // 
            // SubProgView
            // 
            this.SubProgView.CheckBoxes = true;
            this.SubProgView.Dock = System.Windows.Forms.DockStyle.Fill;
            this.SubProgView.Location = new System.Drawing.Point(0, 0);
            this.SubProgView.Name = "SubProgView";
            treeNode16.Name = "노드2";
            treeNode16.Text = "노드2";
            treeNode17.Name = "노드0";
            treeNode17.Text = "노드0";
            treeNode18.Name = "노드3";
            treeNode18.Text = "노드3";
            treeNode19.Name = "노드4";
            treeNode19.Text = "노드4";
            treeNode20.Name = "노드1";
            treeNode20.Text = "노드1";
            this.SubProgView.Nodes.AddRange(new System.Windows.Forms.TreeNode[] {
            treeNode17,
            treeNode20});
            this.SubProgView.Size = new System.Drawing.Size(468, 469);
            this.SubProgView.TabIndex = 1;
            this.SubProgView.AfterCheck += new System.Windows.Forms.TreeViewEventHandler(this.SubProgView_AfterCheck);
            this.SubProgView.NodeMouseDoubleClick += new System.Windows.Forms.TreeNodeMouseClickEventHandler(this.SubProgView_NodeMouseDoubleClick);
            // 
            // tabPage5
            // 
            this.tabPage5.Controls.Add(this.MACHINE_IO_F_AUX2);
            this.tabPage5.Controls.Add(this.MACHINE_IO_F_AUX1);
            this.tabPage5.Controls.Add(this.MACHINE_IO_F_WARMUP);
            this.tabPage5.Controls.Add(this.MACHINE_IO_F_OILMIST);
            this.tabPage5.Controls.Add(this.MACHINE_IO_MS_ZERORETURN);
            this.tabPage5.Controls.Add(this.MACHINE_IO_MS_JOG);
            this.tabPage5.Controls.Add(this.MACHINE_IO_F_COOL);
            this.tabPage5.Controls.Add(this.MACHINE_IO_RO_FULL);
            this.tabPage5.Controls.Add(this.MACHINE_IO_MS_HANDLE);
            this.tabPage5.Controls.Add(this.MACHINE_IO_RO_HALF);
            this.tabPage5.Controls.Add(this.MACHINE_IO_C_CONT);
            this.tabPage5.Controls.Add(this.MACHINE_IO_F_MPG);
            this.tabPage5.Controls.Add(this.MACHINE_IO_OP_SUB);
            this.tabPage5.Controls.Add(this.MACHINE_IO_MS_MDI);
            this.tabPage5.Controls.Add(this.MACHINE_IO_OP_SIMUL);
            this.tabPage5.Controls.Add(this.MACHINE_IO_C_STOP);
            this.tabPage5.Controls.Add(this.MACHINE_IO_RO_QUARTER);
            this.tabPage5.Controls.Add(this.MACHINE_IO_F_SB);
            this.tabPage5.Controls.Add(this.MACHINE_IO_DP_SUB);
            this.tabPage5.Controls.Add(this.MACHINE_IO_MS_AUTO);
            this.tabPage5.Controls.Add(this.MACHINE_IO_DP_MAIN);
            this.tabPage5.Controls.Add(this.MACHINE_IO_RESET);
            this.tabPage5.Controls.Add(this.MACHINE_IO_C_START);
            this.tabPage5.Controls.Add(this.MACHINE_IO_RO_ZERO);
            this.tabPage5.Controls.Add(this.MACHINE_IO_F_DRYRUN);
            this.tabPage5.Controls.Add(this.MACHINE_IO_OP_MAIN);
            this.tabPage5.Controls.Add(this.MACHINE_IO_MS_EDIT);
            this.tabPage5.Location = new System.Drawing.Point(4, 22);
            this.tabPage5.Name = "tabPage5";
            this.tabPage5.Padding = new System.Windows.Forms.Padding(3);
            this.tabPage5.Size = new System.Drawing.Size(951, 539);
            this.tabPage5.TabIndex = 4;
            this.tabPage5.Text = "OP";
            this.tabPage5.UseVisualStyleBackColor = true;
            // 
            // MACHINE_IO_F_AUX2
            // 
            this.MACHINE_IO_F_AUX2.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_F_AUX2.Location = new System.Drawing.Point(510, 218);
            this.MACHINE_IO_F_AUX2.Name = "MACHINE_IO_F_AUX2";
            this.MACHINE_IO_F_AUX2.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_F_AUX2.TabIndex = 7;
            this.MACHINE_IO_F_AUX2.Text = "AUX2";
            this.MACHINE_IO_F_AUX2.UseVisualStyleBackColor = false;
            this.MACHINE_IO_F_AUX2.Click += new System.EventHandler(this.MACHINE_IO_F_AUX2_Click);
            // 
            // MACHINE_IO_F_AUX1
            // 
            this.MACHINE_IO_F_AUX1.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_F_AUX1.Location = new System.Drawing.Point(441, 218);
            this.MACHINE_IO_F_AUX1.Name = "MACHINE_IO_F_AUX1";
            this.MACHINE_IO_F_AUX1.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_F_AUX1.TabIndex = 6;
            this.MACHINE_IO_F_AUX1.Text = "AUX1";
            this.MACHINE_IO_F_AUX1.UseVisualStyleBackColor = false;
            this.MACHINE_IO_F_AUX1.Click += new System.EventHandler(this.MACHINE_IO_F_AUX1_Click);
            // 
            // MACHINE_IO_F_WARMUP
            // 
            this.MACHINE_IO_F_WARMUP.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_F_WARMUP.Location = new System.Drawing.Point(372, 218);
            this.MACHINE_IO_F_WARMUP.Name = "MACHINE_IO_F_WARMUP";
            this.MACHINE_IO_F_WARMUP.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_F_WARMUP.TabIndex = 5;
            this.MACHINE_IO_F_WARMUP.Text = "WARM UP";
            this.MACHINE_IO_F_WARMUP.UseVisualStyleBackColor = false;
            this.MACHINE_IO_F_WARMUP.Click += new System.EventHandler(this.MACHINE_IO_F_WARMUP_Click);
            // 
            // MACHINE_IO_F_OILMIST
            // 
            this.MACHINE_IO_F_OILMIST.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_F_OILMIST.Location = new System.Drawing.Point(303, 218);
            this.MACHINE_IO_F_OILMIST.Name = "MACHINE_IO_F_OILMIST";
            this.MACHINE_IO_F_OILMIST.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_F_OILMIST.TabIndex = 4;
            this.MACHINE_IO_F_OILMIST.Text = "OIL MIST";
            this.MACHINE_IO_F_OILMIST.UseVisualStyleBackColor = false;
            this.MACHINE_IO_F_OILMIST.Click += new System.EventHandler(this.MACHINE_IO_F_OILMIST_Click);
            // 
            // MACHINE_IO_MS_ZERORETURN
            // 
            this.MACHINE_IO_MS_ZERORETURN.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_MS_ZERORETURN.Location = new System.Drawing.Point(372, 67);
            this.MACHINE_IO_MS_ZERORETURN.Name = "MACHINE_IO_MS_ZERORETURN";
            this.MACHINE_IO_MS_ZERORETURN.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_MS_ZERORETURN.TabIndex = 5;
            this.MACHINE_IO_MS_ZERORETURN.Text = "ZERO RETURN";
            this.MACHINE_IO_MS_ZERORETURN.UseVisualStyleBackColor = false;
            this.MACHINE_IO_MS_ZERORETURN.Click += new System.EventHandler(this.MACHINE_IO_MS_ZERORETURN_Click);
            // 
            // MACHINE_IO_MS_JOG
            // 
            this.MACHINE_IO_MS_JOG.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_MS_JOG.Location = new System.Drawing.Point(303, 67);
            this.MACHINE_IO_MS_JOG.Name = "MACHINE_IO_MS_JOG";
            this.MACHINE_IO_MS_JOG.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_MS_JOG.TabIndex = 4;
            this.MACHINE_IO_MS_JOG.Text = "JOG";
            this.MACHINE_IO_MS_JOG.UseVisualStyleBackColor = false;
            this.MACHINE_IO_MS_JOG.Click += new System.EventHandler(this.MACHINE_IO_MS_JOG_Click);
            // 
            // MACHINE_IO_F_COOL
            // 
            this.MACHINE_IO_F_COOL.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_F_COOL.Location = new System.Drawing.Point(234, 218);
            this.MACHINE_IO_F_COOL.Name = "MACHINE_IO_F_COOL";
            this.MACHINE_IO_F_COOL.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_F_COOL.TabIndex = 3;
            this.MACHINE_IO_F_COOL.Text = "COOL";
            this.MACHINE_IO_F_COOL.UseVisualStyleBackColor = false;
            this.MACHINE_IO_F_COOL.Click += new System.EventHandler(this.MACHINE_IO_F_COOL_Click);
            // 
            // MACHINE_IO_RO_FULL
            // 
            this.MACHINE_IO_RO_FULL.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_RO_FULL.Location = new System.Drawing.Point(234, 168);
            this.MACHINE_IO_RO_FULL.Name = "MACHINE_IO_RO_FULL";
            this.MACHINE_IO_RO_FULL.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_RO_FULL.TabIndex = 3;
            this.MACHINE_IO_RO_FULL.Text = "100%";
            this.MACHINE_IO_RO_FULL.UseVisualStyleBackColor = false;
            this.MACHINE_IO_RO_FULL.Click += new System.EventHandler(this.MACHINE_IO_RO_FULL_Click);
            // 
            // MACHINE_IO_MS_HANDLE
            // 
            this.MACHINE_IO_MS_HANDLE.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_MS_HANDLE.Location = new System.Drawing.Point(234, 68);
            this.MACHINE_IO_MS_HANDLE.Name = "MACHINE_IO_MS_HANDLE";
            this.MACHINE_IO_MS_HANDLE.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_MS_HANDLE.TabIndex = 3;
            this.MACHINE_IO_MS_HANDLE.Text = "HANDLE";
            this.MACHINE_IO_MS_HANDLE.UseVisualStyleBackColor = false;
            this.MACHINE_IO_MS_HANDLE.Click += new System.EventHandler(this.MACHINE_IO_MS_HANDLE_Click);
            // 
            // MACHINE_IO_RO_HALF
            // 
            this.MACHINE_IO_RO_HALF.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_RO_HALF.Location = new System.Drawing.Point(165, 167);
            this.MACHINE_IO_RO_HALF.Name = "MACHINE_IO_RO_HALF";
            this.MACHINE_IO_RO_HALF.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_RO_HALF.TabIndex = 2;
            this.MACHINE_IO_RO_HALF.Text = "50%";
            this.MACHINE_IO_RO_HALF.UseVisualStyleBackColor = false;
            this.MACHINE_IO_RO_HALF.Click += new System.EventHandler(this.MACHINE_IO_RO_HALF_Click);
            // 
            // MACHINE_IO_C_CONT
            // 
            this.MACHINE_IO_C_CONT.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_C_CONT.Location = new System.Drawing.Point(165, 268);
            this.MACHINE_IO_C_CONT.Name = "MACHINE_IO_C_CONT";
            this.MACHINE_IO_C_CONT.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_C_CONT.TabIndex = 2;
            this.MACHINE_IO_C_CONT.Text = "CONT";
            this.MACHINE_IO_C_CONT.UseVisualStyleBackColor = false;
            this.MACHINE_IO_C_CONT.Click += new System.EventHandler(this.MACHINE_IO_C_CONT_Click);
            // 
            // MACHINE_IO_F_MPG
            // 
            this.MACHINE_IO_F_MPG.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_F_MPG.Location = new System.Drawing.Point(165, 218);
            this.MACHINE_IO_F_MPG.Name = "MACHINE_IO_F_MPG";
            this.MACHINE_IO_F_MPG.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_F_MPG.TabIndex = 2;
            this.MACHINE_IO_F_MPG.Text = "MPG PROG CHECK";
            this.MACHINE_IO_F_MPG.UseVisualStyleBackColor = false;
            this.MACHINE_IO_F_MPG.Click += new System.EventHandler(this.MACHINE_IO_F_MPG_Click);
            // 
            // MACHINE_IO_OP_SUB
            // 
            this.MACHINE_IO_OP_SUB.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_OP_SUB.Location = new System.Drawing.Point(165, 17);
            this.MACHINE_IO_OP_SUB.Name = "MACHINE_IO_OP_SUB";
            this.MACHINE_IO_OP_SUB.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_OP_SUB.TabIndex = 2;
            this.MACHINE_IO_OP_SUB.Text = "SUB";
            this.MACHINE_IO_OP_SUB.UseVisualStyleBackColor = false;
            this.MACHINE_IO_OP_SUB.Click += new System.EventHandler(this.MACHINE_IO_OP_SUB_Click);
            // 
            // MACHINE_IO_MS_MDI
            // 
            this.MACHINE_IO_MS_MDI.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_MS_MDI.Location = new System.Drawing.Point(165, 67);
            this.MACHINE_IO_MS_MDI.Name = "MACHINE_IO_MS_MDI";
            this.MACHINE_IO_MS_MDI.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_MS_MDI.TabIndex = 2;
            this.MACHINE_IO_MS_MDI.Text = "MDI";
            this.MACHINE_IO_MS_MDI.UseVisualStyleBackColor = false;
            this.MACHINE_IO_MS_MDI.Click += new System.EventHandler(this.MACHINE_IO_MS_MDI_Click);
            // 
            // MACHINE_IO_OP_SIMUL
            // 
            this.MACHINE_IO_OP_SIMUL.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_OP_SIMUL.Location = new System.Drawing.Point(96, 17);
            this.MACHINE_IO_OP_SIMUL.Name = "MACHINE_IO_OP_SIMUL";
            this.MACHINE_IO_OP_SIMUL.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_OP_SIMUL.TabIndex = 1;
            this.MACHINE_IO_OP_SIMUL.Text = "SIMUL";
            this.MACHINE_IO_OP_SIMUL.UseVisualStyleBackColor = false;
            this.MACHINE_IO_OP_SIMUL.Click += new System.EventHandler(this.MACHINE_IO_OP_SIMUL_Click);
            // 
            // MACHINE_IO_C_STOP
            // 
            this.MACHINE_IO_C_STOP.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_C_STOP.Location = new System.Drawing.Point(96, 268);
            this.MACHINE_IO_C_STOP.Name = "MACHINE_IO_C_STOP";
            this.MACHINE_IO_C_STOP.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_C_STOP.TabIndex = 1;
            this.MACHINE_IO_C_STOP.Text = "STOP";
            this.MACHINE_IO_C_STOP.UseVisualStyleBackColor = false;
            this.MACHINE_IO_C_STOP.Click += new System.EventHandler(this.MACHINE_IO_C_STOP_Click);
            // 
            // MACHINE_IO_RO_QUARTER
            // 
            this.MACHINE_IO_RO_QUARTER.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_RO_QUARTER.Location = new System.Drawing.Point(96, 167);
            this.MACHINE_IO_RO_QUARTER.Name = "MACHINE_IO_RO_QUARTER";
            this.MACHINE_IO_RO_QUARTER.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_RO_QUARTER.TabIndex = 1;
            this.MACHINE_IO_RO_QUARTER.Text = "25%";
            this.MACHINE_IO_RO_QUARTER.UseVisualStyleBackColor = false;
            this.MACHINE_IO_RO_QUARTER.Click += new System.EventHandler(this.MACHINE_IO_RO_QUARTER_Click);
            // 
            // MACHINE_IO_F_SB
            // 
            this.MACHINE_IO_F_SB.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_F_SB.Location = new System.Drawing.Point(96, 218);
            this.MACHINE_IO_F_SB.Name = "MACHINE_IO_F_SB";
            this.MACHINE_IO_F_SB.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_F_SB.TabIndex = 1;
            this.MACHINE_IO_F_SB.Text = "SINGLE BLOCK";
            this.MACHINE_IO_F_SB.UseVisualStyleBackColor = false;
            this.MACHINE_IO_F_SB.Click += new System.EventHandler(this.MACHINE_IO_F_SB_Click);
            // 
            // MACHINE_IO_DP_SUB
            // 
            this.MACHINE_IO_DP_SUB.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_DP_SUB.Location = new System.Drawing.Point(96, 117);
            this.MACHINE_IO_DP_SUB.Name = "MACHINE_IO_DP_SUB";
            this.MACHINE_IO_DP_SUB.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_DP_SUB.TabIndex = 1;
            this.MACHINE_IO_DP_SUB.Text = "SUB";
            this.MACHINE_IO_DP_SUB.UseVisualStyleBackColor = false;
            this.MACHINE_IO_DP_SUB.Click += new System.EventHandler(this.MACHINE_IO_DP_SUB_Click);
            // 
            // MACHINE_IO_MS_AUTO
            // 
            this.MACHINE_IO_MS_AUTO.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_MS_AUTO.Location = new System.Drawing.Point(96, 67);
            this.MACHINE_IO_MS_AUTO.Name = "MACHINE_IO_MS_AUTO";
            this.MACHINE_IO_MS_AUTO.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_MS_AUTO.TabIndex = 1;
            this.MACHINE_IO_MS_AUTO.Text = "AUTO";
            this.MACHINE_IO_MS_AUTO.UseVisualStyleBackColor = false;
            this.MACHINE_IO_MS_AUTO.Click += new System.EventHandler(this.MACHINE_IO_MS_AUTO_Click);
            // 
            // MACHINE_IO_DP_MAIN
            // 
            this.MACHINE_IO_DP_MAIN.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_DP_MAIN.Location = new System.Drawing.Point(27, 117);
            this.MACHINE_IO_DP_MAIN.Name = "MACHINE_IO_DP_MAIN";
            this.MACHINE_IO_DP_MAIN.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_DP_MAIN.TabIndex = 0;
            this.MACHINE_IO_DP_MAIN.Text = "MAIN";
            this.MACHINE_IO_DP_MAIN.UseVisualStyleBackColor = false;
            this.MACHINE_IO_DP_MAIN.Click += new System.EventHandler(this.MACHINE_IO_DP_MAIN_Click);
            // 
            // MACHINE_IO_RESET
            // 
            this.MACHINE_IO_RESET.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_RESET.Location = new System.Drawing.Point(27, 318);
            this.MACHINE_IO_RESET.Name = "MACHINE_IO_RESET";
            this.MACHINE_IO_RESET.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_RESET.TabIndex = 0;
            this.MACHINE_IO_RESET.Text = "RESET";
            this.MACHINE_IO_RESET.UseVisualStyleBackColor = false;
            this.MACHINE_IO_RESET.Click += new System.EventHandler(this.MACHINE_IO_RESET_Click);
            // 
            // MACHINE_IO_C_START
            // 
            this.MACHINE_IO_C_START.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_C_START.Location = new System.Drawing.Point(27, 268);
            this.MACHINE_IO_C_START.Name = "MACHINE_IO_C_START";
            this.MACHINE_IO_C_START.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_C_START.TabIndex = 0;
            this.MACHINE_IO_C_START.Text = "START";
            this.MACHINE_IO_C_START.UseVisualStyleBackColor = false;
            // 
            // MACHINE_IO_RO_ZERO
            // 
            this.MACHINE_IO_RO_ZERO.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_RO_ZERO.Location = new System.Drawing.Point(27, 167);
            this.MACHINE_IO_RO_ZERO.Name = "MACHINE_IO_RO_ZERO";
            this.MACHINE_IO_RO_ZERO.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_RO_ZERO.TabIndex = 0;
            this.MACHINE_IO_RO_ZERO.Text = "0%";
            this.MACHINE_IO_RO_ZERO.UseVisualStyleBackColor = false;
            this.MACHINE_IO_RO_ZERO.Click += new System.EventHandler(this.MACHINE_IO_RO_ZERO_Click);
            // 
            // MACHINE_IO_F_DRYRUN
            // 
            this.MACHINE_IO_F_DRYRUN.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_F_DRYRUN.Location = new System.Drawing.Point(27, 218);
            this.MACHINE_IO_F_DRYRUN.Name = "MACHINE_IO_F_DRYRUN";
            this.MACHINE_IO_F_DRYRUN.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_F_DRYRUN.TabIndex = 0;
            this.MACHINE_IO_F_DRYRUN.Text = "DRY RUN";
            this.MACHINE_IO_F_DRYRUN.UseVisualStyleBackColor = false;
            this.MACHINE_IO_F_DRYRUN.Click += new System.EventHandler(this.MACHINE_IO_F_DRYRUN_Click);
            // 
            // MACHINE_IO_OP_MAIN
            // 
            this.MACHINE_IO_OP_MAIN.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_OP_MAIN.Location = new System.Drawing.Point(27, 17);
            this.MACHINE_IO_OP_MAIN.Name = "MACHINE_IO_OP_MAIN";
            this.MACHINE_IO_OP_MAIN.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_OP_MAIN.TabIndex = 0;
            this.MACHINE_IO_OP_MAIN.Text = "MAIN";
            this.MACHINE_IO_OP_MAIN.UseVisualStyleBackColor = false;
            this.MACHINE_IO_OP_MAIN.Click += new System.EventHandler(this.MACHINE_IO_OP_MAIN_Click);
            // 
            // MACHINE_IO_MS_EDIT
            // 
            this.MACHINE_IO_MS_EDIT.BackColor = System.Drawing.Color.Red;
            this.MACHINE_IO_MS_EDIT.Location = new System.Drawing.Point(27, 67);
            this.MACHINE_IO_MS_EDIT.Name = "MACHINE_IO_MS_EDIT";
            this.MACHINE_IO_MS_EDIT.Size = new System.Drawing.Size(67, 44);
            this.MACHINE_IO_MS_EDIT.TabIndex = 0;
            this.MACHINE_IO_MS_EDIT.Text = "EDIT";
            this.MACHINE_IO_MS_EDIT.UseVisualStyleBackColor = false;
            this.MACHINE_IO_MS_EDIT.Click += new System.EventHandler(this.MACHINE_IO_MS_EDIT_Click);
            // 
            // tbTemperature
            // 
            this.tbTemperature.Controls.Add(this.splitContainer7);
            this.tbTemperature.Location = new System.Drawing.Point(4, 22);
            this.tbTemperature.Name = "tbTemperature";
            this.tbTemperature.Padding = new System.Windows.Forms.Padding(3);
            this.tbTemperature.Size = new System.Drawing.Size(951, 539);
            this.tbTemperature.TabIndex = 5;
            this.tbTemperature.Text = "Temperature";
            this.tbTemperature.UseVisualStyleBackColor = true;
            // 
            // splitContainer7
            // 
            this.splitContainer7.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer7.Location = new System.Drawing.Point(3, 3);
            this.splitContainer7.Name = "splitContainer7";
            this.splitContainer7.Orientation = System.Windows.Forms.Orientation.Horizontal;
            // 
            // splitContainer7.Panel1
            // 
            this.splitContainer7.Panel1.Controls.Add(this.btGetTemperature);
            // 
            // splitContainer7.Panel2
            // 
            this.splitContainer7.Panel2.Controls.Add(this.splitContainer5);
            this.splitContainer7.Size = new System.Drawing.Size(945, 533);
            this.splitContainer7.SplitterDistance = 46;
            this.splitContainer7.TabIndex = 1;
            // 
            // btGetTemperature
            // 
            this.btGetTemperature.Location = new System.Drawing.Point(1, 1);
            this.btGetTemperature.Name = "btGetTemperature";
            this.btGetTemperature.Size = new System.Drawing.Size(139, 43);
            this.btGetTemperature.TabIndex = 0;
            this.btGetTemperature.Text = "Get Temperature";
            this.btGetTemperature.UseVisualStyleBackColor = true;
            this.btGetTemperature.Click += new System.EventHandler(this.btGetTemperature_Click);
            // 
            // splitContainer5
            // 
            this.splitContainer5.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer5.Location = new System.Drawing.Point(0, 0);
            this.splitContainer5.Name = "splitContainer5";
            // 
            // splitContainer5.Panel1
            // 
            this.splitContainer5.Panel1.Controls.Add(this.dgMainMoterTemp);
            // 
            // splitContainer5.Panel2
            // 
            this.splitContainer5.Panel2.Controls.Add(this.splitContainer6);
            this.splitContainer5.Size = new System.Drawing.Size(945, 483);
            this.splitContainer5.SplitterDistance = 313;
            this.splitContainer5.TabIndex = 0;
            // 
            // dgMainMoterTemp
            // 
            this.dgMainMoterTemp.AllowUserToAddRows = false;
            this.dgMainMoterTemp.AllowUserToDeleteRows = false;
            this.dgMainMoterTemp.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill;
            this.dgMainMoterTemp.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            this.dgMainMoterTemp.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.dataGridViewTextBoxColumn6,
            this.dataGridViewTextBoxColumn10});
            this.dgMainMoterTemp.Dock = System.Windows.Forms.DockStyle.Fill;
            this.dgMainMoterTemp.Location = new System.Drawing.Point(0, 0);
            this.dgMainMoterTemp.Name = "dgMainMoterTemp";
            this.dgMainMoterTemp.RowHeadersVisible = false;
            this.dgMainMoterTemp.RowTemplate.Height = 23;
            this.dgMainMoterTemp.Size = new System.Drawing.Size(313, 483);
            this.dgMainMoterTemp.TabIndex = 1;
            this.dgMainMoterTemp.VirtualMode = true;
            this.dgMainMoterTemp.CellValueNeeded += new System.Windows.Forms.DataGridViewCellValueEventHandler(this.dgMainMoterTemp_CellValueNeeded);
            // 
            // dataGridViewTextBoxColumn6
            // 
            this.dataGridViewTextBoxColumn6.HeaderText = "Axis";
            this.dataGridViewTextBoxColumn6.Name = "dataGridViewTextBoxColumn6";
            this.dataGridViewTextBoxColumn6.ReadOnly = true;
            // 
            // dataGridViewTextBoxColumn10
            // 
            this.dataGridViewTextBoxColumn10.HeaderText = "Temperature";
            this.dataGridViewTextBoxColumn10.Name = "dataGridViewTextBoxColumn10";
            this.dataGridViewTextBoxColumn10.ReadOnly = true;
            // 
            // splitContainer6
            // 
            this.splitContainer6.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer6.Location = new System.Drawing.Point(0, 0);
            this.splitContainer6.Name = "splitContainer6";
            // 
            // splitContainer6.Panel1
            // 
            this.splitContainer6.Panel1.Controls.Add(this.dgSubMotorTemp);
            // 
            // splitContainer6.Panel2
            // 
            this.splitContainer6.Panel2.Controls.Add(this.dgSpindleTemp);
            this.splitContainer6.Size = new System.Drawing.Size(628, 483);
            this.splitContainer6.SplitterDistance = 314;
            this.splitContainer6.TabIndex = 0;
            // 
            // dgSubMotorTemp
            // 
            this.dgSubMotorTemp.AllowUserToAddRows = false;
            this.dgSubMotorTemp.AllowUserToDeleteRows = false;
            this.dgSubMotorTemp.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill;
            this.dgSubMotorTemp.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            this.dgSubMotorTemp.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.dataGridViewTextBoxColumn7,
            this.dataGridViewTextBoxColumn8});
            this.dgSubMotorTemp.Dock = System.Windows.Forms.DockStyle.Fill;
            this.dgSubMotorTemp.Location = new System.Drawing.Point(0, 0);
            this.dgSubMotorTemp.Name = "dgSubMotorTemp";
            this.dgSubMotorTemp.RowHeadersVisible = false;
            this.dgSubMotorTemp.RowTemplate.Height = 23;
            this.dgSubMotorTemp.Size = new System.Drawing.Size(314, 483);
            this.dgSubMotorTemp.TabIndex = 2;
            this.dgSubMotorTemp.VirtualMode = true;
            this.dgSubMotorTemp.CellValueNeeded += new System.Windows.Forms.DataGridViewCellValueEventHandler(this.dgSubMotorTemp_CellValueNeeded);
            // 
            // dataGridViewTextBoxColumn7
            // 
            this.dataGridViewTextBoxColumn7.HeaderText = "Axis";
            this.dataGridViewTextBoxColumn7.Name = "dataGridViewTextBoxColumn7";
            this.dataGridViewTextBoxColumn7.ReadOnly = true;
            // 
            // dataGridViewTextBoxColumn8
            // 
            this.dataGridViewTextBoxColumn8.HeaderText = "Temperature";
            this.dataGridViewTextBoxColumn8.Name = "dataGridViewTextBoxColumn8";
            this.dataGridViewTextBoxColumn8.ReadOnly = true;
            // 
            // dgSpindleTemp
            // 
            this.dgSpindleTemp.AllowUserToAddRows = false;
            this.dgSpindleTemp.AllowUserToDeleteRows = false;
            this.dgSpindleTemp.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill;
            this.dgSpindleTemp.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            this.dgSpindleTemp.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.dataGridViewTextBoxColumn9,
            this.dataGridViewTextBoxColumn11});
            this.dgSpindleTemp.Dock = System.Windows.Forms.DockStyle.Fill;
            this.dgSpindleTemp.Location = new System.Drawing.Point(0, 0);
            this.dgSpindleTemp.Name = "dgSpindleTemp";
            this.dgSpindleTemp.RowHeadersVisible = false;
            this.dgSpindleTemp.RowTemplate.Height = 23;
            this.dgSpindleTemp.Size = new System.Drawing.Size(310, 483);
            this.dgSpindleTemp.TabIndex = 2;
            this.dgSpindleTemp.VirtualMode = true;
            this.dgSpindleTemp.CellValueNeeded += new System.Windows.Forms.DataGridViewCellValueEventHandler(this.dgSpindleTemp_CellValueNeeded);
            // 
            // dataGridViewTextBoxColumn9
            // 
            this.dataGridViewTextBoxColumn9.HeaderText = "Axis";
            this.dataGridViewTextBoxColumn9.Name = "dataGridViewTextBoxColumn9";
            this.dataGridViewTextBoxColumn9.ReadOnly = true;
            // 
            // dataGridViewTextBoxColumn11
            // 
            this.dataGridViewTextBoxColumn11.HeaderText = "Temperature";
            this.dataGridViewTextBoxColumn11.Name = "dataGridViewTextBoxColumn11";
            this.dataGridViewTextBoxColumn11.ReadOnly = true;
            // 
            // label15
            // 
            this.label15.AutoSize = true;
            this.label15.Location = new System.Drawing.Point(532, 10);
            this.label15.Name = "label15";
            this.label15.Size = new System.Drawing.Size(71, 12);
            this.label15.TabIndex = 36;
            this.label15.Text = "Cycle Time";
            // 
            // tbCycleTime
            // 
            this.tbCycleTime.Location = new System.Drawing.Point(630, 7);
            this.tbCycleTime.Name = "tbCycleTime";
            this.tbCycleTime.Size = new System.Drawing.Size(110, 21);
            this.tbCycleTime.TabIndex = 35;
            // 
            // GetCycleTime
            // 
            this.GetCycleTime.Location = new System.Drawing.Point(531, 34);
            this.GetCycleTime.Name = "GetCycleTime";
            this.GetCycleTime.Size = new System.Drawing.Size(209, 23);
            this.GetCycleTime.TabIndex = 34;
            this.GetCycleTime.Text = "Get CycleTime";
            this.GetCycleTime.UseVisualStyleBackColor = true;
            this.GetCycleTime.Click += new System.EventHandler(this.GetCycleTime_Click);
            // 
            // Form1
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(959, 565);
            this.Controls.Add(this.tabControl1);
            this.Name = "Form1";
            this.Text = "Hi-Link Example";
            this.FormClosing += new System.Windows.Forms.FormClosingEventHandler(this.Form1_FormClosing);
            this.tabControl1.ResumeLayout(false);
            this.tabPage1.ResumeLayout(false);
            this.tabPage1.PerformLayout();
            this.tabPage2.ResumeLayout(false);
            this.splitContainer1.Panel1.ResumeLayout(false);
            this.splitContainer1.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer1)).EndInit();
            this.splitContainer1.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.dataGridView1)).EndInit();
            this.tabPage3.ResumeLayout(false);
            this.splitContainer2.Panel1.ResumeLayout(false);
            this.splitContainer2.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer2)).EndInit();
            this.splitContainer2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.dgToolOffset)).EndInit();
            this.tabPage4.ResumeLayout(false);
            this.splitContainer4.Panel1.ResumeLayout(false);
            this.splitContainer4.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer4)).EndInit();
            this.splitContainer4.ResumeLayout(false);
            this.splitContainer3.Panel1.ResumeLayout(false);
            this.splitContainer3.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer3)).EndInit();
            this.splitContainer3.ResumeLayout(false);
            this.tabPage5.ResumeLayout(false);
            this.tbTemperature.ResumeLayout(false);
            this.splitContainer7.Panel1.ResumeLayout(false);
            this.splitContainer7.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer7)).EndInit();
            this.splitContainer7.ResumeLayout(false);
            this.splitContainer5.Panel1.ResumeLayout(false);
            this.splitContainer5.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer5)).EndInit();
            this.splitContainer5.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.dgMainMoterTemp)).EndInit();
            this.splitContainer6.Panel1.ResumeLayout(false);
            this.splitContainer6.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer6)).EndInit();
            this.splitContainer6.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.dgSubMotorTemp)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.dgSpindleTemp)).EndInit();
            this.ResumeLayout(false);

        }

        #endregion

        private System.Windows.Forms.TextBox MachineIP;
        private System.Windows.Forms.TextBox MachinePort;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.Label label2;
        private System.Windows.Forms.Button CommOpen;
        private System.Windows.Forms.Button CommClose;
        private System.Windows.Forms.Label label4;
        private System.Windows.Forms.TextBox CtrlType;
        private System.Windows.Forms.Label label5;
        private System.Windows.Forms.TextBox ToolType;
        private System.Windows.Forms.TabControl tabControl1;
        private System.Windows.Forms.TabPage tabPage1;
        private System.Windows.Forms.Label label7;
        private System.Windows.Forms.TextBox CurrentProduct;
        private System.Windows.Forms.Label label6;
        private System.Windows.Forms.TextBox TargetProduct;
        private System.Windows.Forms.Button GetProductCount;
        private System.Windows.Forms.TabPage tabPage2;
        private System.Windows.Forms.DataGridView dataGridView1;
        private System.Windows.Forms.SplitContainer splitContainer1;
        private System.Windows.Forms.Button GetToolLife;
        private System.Windows.Forms.Button GetStatus;
        private System.Windows.Forms.Label lbMachineStatus;
        private System.Windows.Forms.TextBox tbMachineStatus;
        private System.Windows.Forms.TextBox tbSerialNum;
        private System.Windows.Forms.Label label3;
        private System.Windows.Forms.Label label11;
        private System.Windows.Forms.Label label9;
        private System.Windows.Forms.TextBox tbSubProgComment;
        private System.Windows.Forms.Label label10;
        private System.Windows.Forms.TextBox tbMainProgComment;
        private System.Windows.Forms.Label label8;
        private System.Windows.Forms.TextBox tbSubProgNum;
        private System.Windows.Forms.TextBox tbMainProgNum;
        private System.Windows.Forms.Button btGetCurrentProgInfo;
        private System.Windows.Forms.Label label12;
        private System.Windows.Forms.TextBox tbAlarmCode;
        private System.Windows.Forms.Button btGetAlarmInfo;
        private System.Windows.Forms.TextBox textBox2;
        private System.Windows.Forms.TextBox textBox1;
        private System.Windows.Forms.Label label14;
        private System.Windows.Forms.Label label13;
        private System.Windows.Forms.TabPage tabPage3;
        private System.Windows.Forms.SplitContainer splitContainer2;
        private System.Windows.Forms.Button btGetToolOffset;
        private System.Windows.Forms.DataGridView dgToolOffset;
        private System.Windows.Forms.TabPage tabPage4;
        private System.Windows.Forms.TabPage tabPage5;
        private System.Windows.Forms.SplitContainer splitContainer3;
        private System.Windows.Forms.Button MACHINE_IO_F_AUX2;
        private System.Windows.Forms.Button MACHINE_IO_F_AUX1;
        private System.Windows.Forms.Button MACHINE_IO_F_WARMUP;
        private System.Windows.Forms.Button MACHINE_IO_F_OILMIST;
        private System.Windows.Forms.Button MACHINE_IO_MS_ZERORETURN;
        private System.Windows.Forms.Button MACHINE_IO_MS_JOG;
        private System.Windows.Forms.Button MACHINE_IO_F_COOL;
        private System.Windows.Forms.Button MACHINE_IO_RO_FULL;
        private System.Windows.Forms.Button MACHINE_IO_MS_HANDLE;
        private System.Windows.Forms.Button MACHINE_IO_RO_HALF;
        private System.Windows.Forms.Button MACHINE_IO_C_CONT;
        private System.Windows.Forms.Button MACHINE_IO_F_MPG;
        private System.Windows.Forms.Button MACHINE_IO_OP_SUB;
        private System.Windows.Forms.Button MACHINE_IO_MS_MDI;
        private System.Windows.Forms.Button MACHINE_IO_OP_SIMUL;
        private System.Windows.Forms.Button MACHINE_IO_C_STOP;
        private System.Windows.Forms.Button MACHINE_IO_RO_QUARTER;
        private System.Windows.Forms.Button MACHINE_IO_F_SB;
        private System.Windows.Forms.Button MACHINE_IO_DP_SUB;
        private System.Windows.Forms.Button MACHINE_IO_MS_AUTO;
        private System.Windows.Forms.Button MACHINE_IO_DP_MAIN;
        private System.Windows.Forms.Button MACHINE_IO_RESET;
        private System.Windows.Forms.Button MACHINE_IO_C_START;
        private System.Windows.Forms.Button MACHINE_IO_RO_ZERO;
        private System.Windows.Forms.Button MACHINE_IO_F_DRYRUN;
        private System.Windows.Forms.Button MACHINE_IO_OP_MAIN;
        private System.Windows.Forms.Button MACHINE_IO_MS_EDIT;
        private System.Windows.Forms.TreeView MainProgView;
        private System.Windows.Forms.TreeView SubProgView;
        private System.Windows.Forms.ComboBox cbOffsetHeadType;
        private System.Windows.Forms.DataGridViewTextBoxColumn toolIdx;
        private System.Windows.Forms.DataGridViewTextBoxColumn useCount;
        private System.Windows.Forms.DataGridViewTextBoxColumn configCount;
        private System.Windows.Forms.DataGridViewTextBoxColumn warningCount;
        private System.Windows.Forms.DataGridViewTextBoxColumn use;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn1;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn2;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn3;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn4;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn5;
        private System.Windows.Forms.DataGridViewTextBoxColumn Column;
        private System.Windows.Forms.DataGridViewTextBoxColumn Column1;
        private System.Windows.Forms.DataGridViewTextBoxColumn Column2;
        private System.Windows.Forms.DataGridViewTextBoxColumn Column3;
        private System.Windows.Forms.DataGridViewTextBoxColumn Column4;
        private System.Windows.Forms.DataGridViewTextBoxColumn Column5;
        private System.Windows.Forms.SplitContainer splitContainer4;
        private System.Windows.Forms.Button btProgCreate;
        private System.Windows.Forms.Button btProgDel;
        private System.Windows.Forms.TabPage tbTemperature;
        private System.Windows.Forms.SplitContainer splitContainer5;
        private System.Windows.Forms.DataGridView dgMainMoterTemp;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn6;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn10;
        private System.Windows.Forms.SplitContainer splitContainer6;
        private System.Windows.Forms.DataGridView dgSubMotorTemp;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn7;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn8;
        private System.Windows.Forms.DataGridView dgSpindleTemp;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn9;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn11;
        private System.Windows.Forms.SplitContainer splitContainer7;
        private System.Windows.Forms.Button btGetTemperature;
        private System.Windows.Forms.TextBox textBox3;
        private System.Windows.Forms.Label label15;
        private System.Windows.Forms.TextBox tbCycleTime;
        private System.Windows.Forms.Button GetCycleTime;
    }
}

