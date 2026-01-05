
namespace Hi_Link_Advanced_Example
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
            System.Windows.Forms.TreeNode treeNode1 = new System.Windows.Forms.TreeNode("노드2");
            System.Windows.Forms.TreeNode treeNode2 = new System.Windows.Forms.TreeNode("노드0", new System.Windows.Forms.TreeNode[] {
            treeNode1});
            System.Windows.Forms.TreeNode treeNode3 = new System.Windows.Forms.TreeNode("노드3");
            System.Windows.Forms.TreeNode treeNode4 = new System.Windows.Forms.TreeNode("노드4");
            System.Windows.Forms.TreeNode treeNode5 = new System.Windows.Forms.TreeNode("노드1", new System.Windows.Forms.TreeNode[] {
            treeNode3,
            treeNode4});
            System.Windows.Forms.TreeNode treeNode6 = new System.Windows.Forms.TreeNode("노드2");
            System.Windows.Forms.TreeNode treeNode7 = new System.Windows.Forms.TreeNode("노드0", new System.Windows.Forms.TreeNode[] {
            treeNode6});
            System.Windows.Forms.TreeNode treeNode8 = new System.Windows.Forms.TreeNode("노드3");
            System.Windows.Forms.TreeNode treeNode9 = new System.Windows.Forms.TreeNode("노드4");
            System.Windows.Forms.TreeNode treeNode10 = new System.Windows.Forms.TreeNode("노드1", new System.Windows.Forms.TreeNode[] {
            treeNode8,
            treeNode9});
            this.MachineIP = new System.Windows.Forms.TextBox();
            this.MachinePort = new System.Windows.Forms.TextBox();
            this.label1 = new System.Windows.Forms.Label();
            this.label2 = new System.Windows.Forms.Label();
            this.CommOpen = new System.Windows.Forms.Button();
            this.CommClose = new System.Windows.Forms.Button();
            this.tabControl1 = new System.Windows.Forms.TabControl();
            this.tabPage1 = new System.Windows.Forms.TabPage();
            this.dgMachineData = new System.Windows.Forms.DataGridView();
            this.dataGridViewTextBoxColumn12 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dataGridViewTextBoxColumn13 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dataGridViewTextBoxColumn14 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dataGridViewTextBoxColumn15 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.dataGridViewTextBoxColumn16 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.Alarm = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.Column6 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.Column7 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.Column8 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.Column9 = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.tabPage2 = new System.Windows.Forms.TabPage();
            this.dataGridView1 = new System.Windows.Forms.DataGridView();
            this.toolIdx = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.useCount = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.configCount = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.warningCount = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.use = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.tabPage3 = new System.Windows.Forms.TabPage();
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
            this.tbMachineUID = new System.Windows.Forms.TextBox();
            this.lbUID = new System.Windows.Forms.Label();
            this.btGetMachineList = new System.Windows.Forms.Button();
            this.label5 = new System.Windows.Forms.Label();
            this.cbSelectMachine = new System.Windows.Forms.ComboBox();
            this.btGetAlarmInfo = new System.Windows.Forms.Button();
            this.label3 = new System.Windows.Forms.Label();
            this.tbSerialNum = new System.Windows.Forms.TextBox();
            this.GetProductCount = new System.Windows.Forms.Button();
            this.btGetCurrentProgInfo = new System.Windows.Forms.Button();
            this.GetToolLife = new System.Windows.Forms.Button();
            this.cbOffsetHeadType = new System.Windows.Forms.ComboBox();
            this.btGetToolOffset = new System.Windows.Forms.Button();
            this.btProgDel = new System.Windows.Forms.Button();
            this.btProgCreate = new System.Windows.Forms.Button();
            this.btGetTemperature = new System.Windows.Forms.Button();
            this.splitContainer9 = new System.Windows.Forms.SplitContainer();
            this.tabControl1.SuspendLayout();
            this.tabPage1.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.dgMachineData)).BeginInit();
            this.tabPage2.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.dataGridView1)).BeginInit();
            this.tabPage3.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.dgToolOffset)).BeginInit();
            this.tabPage4.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer3)).BeginInit();
            this.splitContainer3.Panel1.SuspendLayout();
            this.splitContainer3.Panel2.SuspendLayout();
            this.splitContainer3.SuspendLayout();
            this.tabPage5.SuspendLayout();
            this.tbTemperature.SuspendLayout();
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
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer9)).BeginInit();
            this.splitContainer9.Panel1.SuspendLayout();
            this.splitContainer9.Panel2.SuspendLayout();
            this.splitContainer9.SuspendLayout();
            this.SuspendLayout();
            // 
            // MachineIP
            // 
            this.MachineIP.Location = new System.Drawing.Point(51, 37);
            this.MachineIP.Name = "MachineIP";
            this.MachineIP.Size = new System.Drawing.Size(113, 21);
            this.MachineIP.TabIndex = 0;
            this.MachineIP.Text = "192.168.0.101";
            // 
            // MachinePort
            // 
            this.MachinePort.Location = new System.Drawing.Point(51, 64);
            this.MachinePort.Name = "MachinePort";
            this.MachinePort.Size = new System.Drawing.Size(113, 21);
            this.MachinePort.TabIndex = 1;
            this.MachinePort.Text = "8193";
            // 
            // label1
            // 
            this.label1.AutoSize = true;
            this.label1.Location = new System.Drawing.Point(3, 40);
            this.label1.Name = "label1";
            this.label1.Size = new System.Drawing.Size(16, 12);
            this.label1.TabIndex = 2;
            this.label1.Text = "IP";
            // 
            // label2
            // 
            this.label2.AutoSize = true;
            this.label2.Location = new System.Drawing.Point(3, 67);
            this.label2.Name = "label2";
            this.label2.Size = new System.Drawing.Size(38, 12);
            this.label2.TabIndex = 3;
            this.label2.Text = "PORT";
            // 
            // CommOpen
            // 
            this.CommOpen.Location = new System.Drawing.Point(5, 139);
            this.CommOpen.Name = "CommOpen";
            this.CommOpen.Size = new System.Drawing.Size(159, 23);
            this.CommOpen.TabIndex = 4;
            this.CommOpen.Text = "Open";
            this.CommOpen.UseVisualStyleBackColor = true;
            this.CommOpen.Click += new System.EventHandler(this.CommOpen_Click);
            // 
            // CommClose
            // 
            this.CommClose.Location = new System.Drawing.Point(5, 317);
            this.CommClose.Name = "CommClose";
            this.CommClose.Size = new System.Drawing.Size(159, 23);
            this.CommClose.TabIndex = 5;
            this.CommClose.Text = "Close Comm";
            this.CommClose.UseVisualStyleBackColor = true;
            this.CommClose.Click += new System.EventHandler(this.CommClose_Click);
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
            this.tabControl1.Size = new System.Drawing.Size(1027, 672);
            this.tabControl1.TabIndex = 13;
            this.tabControl1.SelectedIndexChanged += new System.EventHandler(this.tabControl1_SelectedIndexChanged);
            // 
            // tabPage1
            // 
            this.tabPage1.Controls.Add(this.dgMachineData);
            this.tabPage1.Location = new System.Drawing.Point(4, 22);
            this.tabPage1.Name = "tabPage1";
            this.tabPage1.Padding = new System.Windows.Forms.Padding(3);
            this.tabPage1.Size = new System.Drawing.Size(1019, 646);
            this.tabPage1.TabIndex = 0;
            this.tabPage1.Text = "Info";
            this.tabPage1.UseVisualStyleBackColor = true;
            // 
            // dgMachineData
            // 
            this.dgMachineData.AllowUserToAddRows = false;
            this.dgMachineData.AllowUserToDeleteRows = false;
            this.dgMachineData.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill;
            this.dgMachineData.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            this.dgMachineData.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.dataGridViewTextBoxColumn12,
            this.dataGridViewTextBoxColumn13,
            this.dataGridViewTextBoxColumn14,
            this.dataGridViewTextBoxColumn15,
            this.dataGridViewTextBoxColumn16,
            this.Alarm,
            this.Column6,
            this.Column7,
            this.Column8,
            this.Column9});
            this.dgMachineData.Dock = System.Windows.Forms.DockStyle.Fill;
            this.dgMachineData.Location = new System.Drawing.Point(3, 3);
            this.dgMachineData.Name = "dgMachineData";
            this.dgMachineData.RowHeadersVisible = false;
            this.dgMachineData.RowTemplate.Height = 23;
            this.dgMachineData.Size = new System.Drawing.Size(1013, 640);
            this.dgMachineData.TabIndex = 1;
            this.dgMachineData.VirtualMode = true;
            this.dgMachineData.CellValueNeeded += new System.Windows.Forms.DataGridViewCellValueEventHandler(this.dataGridView2_CellValueNeeded);
            // 
            // dataGridViewTextBoxColumn12
            // 
            this.dataGridViewTextBoxColumn12.FillWeight = 35F;
            this.dataGridViewTextBoxColumn12.HeaderText = "Idx";
            this.dataGridViewTextBoxColumn12.Name = "dataGridViewTextBoxColumn12";
            this.dataGridViewTextBoxColumn12.ReadOnly = true;
            // 
            // dataGridViewTextBoxColumn13
            // 
            this.dataGridViewTextBoxColumn13.FillWeight = 70F;
            this.dataGridViewTextBoxColumn13.HeaderText = "UID";
            this.dataGridViewTextBoxColumn13.Name = "dataGridViewTextBoxColumn13";
            // 
            // dataGridViewTextBoxColumn14
            // 
            this.dataGridViewTextBoxColumn14.FillWeight = 120F;
            this.dataGridViewTextBoxColumn14.HeaderText = "IP";
            this.dataGridViewTextBoxColumn14.Name = "dataGridViewTextBoxColumn14";
            // 
            // dataGridViewTextBoxColumn15
            // 
            this.dataGridViewTextBoxColumn15.FillWeight = 70F;
            this.dataGridViewTextBoxColumn15.HeaderText = "Port";
            this.dataGridViewTextBoxColumn15.Name = "dataGridViewTextBoxColumn15";
            // 
            // dataGridViewTextBoxColumn16
            // 
            this.dataGridViewTextBoxColumn16.FillWeight = 70F;
            this.dataGridViewTextBoxColumn16.HeaderText = "Status";
            this.dataGridViewTextBoxColumn16.Name = "dataGridViewTextBoxColumn16";
            // 
            // Alarm
            // 
            this.Alarm.FillWeight = 70F;
            this.Alarm.HeaderText = "Alarm";
            this.Alarm.Name = "Alarm";
            // 
            // Column6
            // 
            this.Column6.HeaderText = "Tar. Product";
            this.Column6.Name = "Column6";
            // 
            // Column7
            // 
            this.Column7.HeaderText = "Curr.Product";
            this.Column7.Name = "Column7";
            // 
            // Column8
            // 
            this.Column8.FillWeight = 140F;
            this.Column8.HeaderText = "Activate Main Prog.";
            this.Column8.Name = "Column8";
            // 
            // Column9
            // 
            this.Column9.FillWeight = 140F;
            this.Column9.HeaderText = "Activate Sub Prog.";
            this.Column9.Name = "Column9";
            // 
            // tabPage2
            // 
            this.tabPage2.Controls.Add(this.dataGridView1);
            this.tabPage2.Location = new System.Drawing.Point(4, 22);
            this.tabPage2.Name = "tabPage2";
            this.tabPage2.Padding = new System.Windows.Forms.Padding(3);
            this.tabPage2.Size = new System.Drawing.Size(1019, 646);
            this.tabPage2.TabIndex = 1;
            this.tabPage2.Text = "Tool Life";
            this.tabPage2.UseVisualStyleBackColor = true;
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
            this.dataGridView1.Location = new System.Drawing.Point(3, 3);
            this.dataGridView1.Name = "dataGridView1";
            this.dataGridView1.RowHeadersVisible = false;
            this.dataGridView1.RowTemplate.Height = 23;
            this.dataGridView1.Size = new System.Drawing.Size(1013, 640);
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
            this.tabPage3.Controls.Add(this.dgToolOffset);
            this.tabPage3.Location = new System.Drawing.Point(4, 22);
            this.tabPage3.Name = "tabPage3";
            this.tabPage3.Padding = new System.Windows.Forms.Padding(3);
            this.tabPage3.Size = new System.Drawing.Size(1019, 646);
            this.tabPage3.TabIndex = 2;
            this.tabPage3.Text = "Tool Offset";
            this.tabPage3.UseVisualStyleBackColor = true;
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
            this.dgToolOffset.Location = new System.Drawing.Point(3, 3);
            this.dgToolOffset.Name = "dgToolOffset";
            this.dgToolOffset.RowHeadersVisible = false;
            this.dgToolOffset.RowTemplate.Height = 23;
            this.dgToolOffset.Size = new System.Drawing.Size(1013, 640);
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
            this.tabPage4.Controls.Add(this.splitContainer3);
            this.tabPage4.Location = new System.Drawing.Point(4, 22);
            this.tabPage4.Name = "tabPage4";
            this.tabPage4.Padding = new System.Windows.Forms.Padding(3);
            this.tabPage4.Size = new System.Drawing.Size(1019, 646);
            this.tabPage4.TabIndex = 3;
            this.tabPage4.Text = "Prog List";
            this.tabPage4.UseVisualStyleBackColor = true;
            // 
            // splitContainer3
            // 
            this.splitContainer3.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer3.Location = new System.Drawing.Point(3, 3);
            this.splitContainer3.Name = "splitContainer3";
            // 
            // splitContainer3.Panel1
            // 
            this.splitContainer3.Panel1.Controls.Add(this.MainProgView);
            // 
            // splitContainer3.Panel2
            // 
            this.splitContainer3.Panel2.Controls.Add(this.SubProgView);
            this.splitContainer3.Size = new System.Drawing.Size(1013, 640);
            this.splitContainer3.SplitterDistance = 505;
            this.splitContainer3.TabIndex = 0;
            // 
            // MainProgView
            // 
            this.MainProgView.CheckBoxes = true;
            this.MainProgView.Dock = System.Windows.Forms.DockStyle.Fill;
            this.MainProgView.Location = new System.Drawing.Point(0, 0);
            this.MainProgView.Name = "MainProgView";
            treeNode1.Name = "노드2";
            treeNode1.Text = "노드2";
            treeNode2.Name = "노드0";
            treeNode2.Text = "노드0";
            treeNode3.Name = "노드3";
            treeNode3.Text = "노드3";
            treeNode4.Name = "노드4";
            treeNode4.Text = "노드4";
            treeNode5.Name = "노드1";
            treeNode5.Text = "노드1";
            this.MainProgView.Nodes.AddRange(new System.Windows.Forms.TreeNode[] {
            treeNode2,
            treeNode5});
            this.MainProgView.Size = new System.Drawing.Size(505, 640);
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
            treeNode6.Name = "노드2";
            treeNode6.Text = "노드2";
            treeNode7.Name = "노드0";
            treeNode7.Text = "노드0";
            treeNode8.Name = "노드3";
            treeNode8.Text = "노드3";
            treeNode9.Name = "노드4";
            treeNode9.Text = "노드4";
            treeNode10.Name = "노드1";
            treeNode10.Text = "노드1";
            this.SubProgView.Nodes.AddRange(new System.Windows.Forms.TreeNode[] {
            treeNode7,
            treeNode10});
            this.SubProgView.Size = new System.Drawing.Size(504, 640);
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
            this.tabPage5.Size = new System.Drawing.Size(1019, 646);
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
            this.tbTemperature.Controls.Add(this.splitContainer5);
            this.tbTemperature.Location = new System.Drawing.Point(4, 22);
            this.tbTemperature.Name = "tbTemperature";
            this.tbTemperature.Padding = new System.Windows.Forms.Padding(3);
            this.tbTemperature.Size = new System.Drawing.Size(1019, 646);
            this.tbTemperature.TabIndex = 5;
            this.tbTemperature.Text = "Temperature";
            this.tbTemperature.UseVisualStyleBackColor = true;
            // 
            // splitContainer5
            // 
            this.splitContainer5.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer5.Location = new System.Drawing.Point(3, 3);
            this.splitContainer5.Name = "splitContainer5";
            // 
            // splitContainer5.Panel1
            // 
            this.splitContainer5.Panel1.Controls.Add(this.dgMainMoterTemp);
            // 
            // splitContainer5.Panel2
            // 
            this.splitContainer5.Panel2.Controls.Add(this.splitContainer6);
            this.splitContainer5.Size = new System.Drawing.Size(1013, 640);
            this.splitContainer5.SplitterDistance = 334;
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
            this.dgMainMoterTemp.Size = new System.Drawing.Size(334, 640);
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
            this.splitContainer6.Size = new System.Drawing.Size(675, 640);
            this.splitContainer6.SplitterDistance = 336;
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
            this.dgSubMotorTemp.Size = new System.Drawing.Size(336, 640);
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
            this.dgSpindleTemp.Size = new System.Drawing.Size(335, 640);
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
            // tbMachineUID
            // 
            this.tbMachineUID.Location = new System.Drawing.Point(51, 12);
            this.tbMachineUID.Name = "tbMachineUID";
            this.tbMachineUID.Size = new System.Drawing.Size(113, 21);
            this.tbMachineUID.TabIndex = 32;
            this.tbMachineUID.Text = "Test1";
            // 
            // lbUID
            // 
            this.lbUID.AutoSize = true;
            this.lbUID.Location = new System.Drawing.Point(3, 15);
            this.lbUID.Name = "lbUID";
            this.lbUID.Size = new System.Drawing.Size(24, 12);
            this.lbUID.TabIndex = 33;
            this.lbUID.Text = "UID";
            // 
            // btGetMachineList
            // 
            this.btGetMachineList.Location = new System.Drawing.Point(5, 290);
            this.btGetMachineList.Name = "btGetMachineList";
            this.btGetMachineList.Size = new System.Drawing.Size(159, 23);
            this.btGetMachineList.TabIndex = 31;
            this.btGetMachineList.Text = "Update Machine List";
            this.btGetMachineList.UseVisualStyleBackColor = true;
            this.btGetMachineList.Click += new System.EventHandler(this.btGetMachineList_Click);
            // 
            // label5
            // 
            this.label5.AutoSize = true;
            this.label5.Location = new System.Drawing.Point(3, 251);
            this.label5.Name = "label5";
            this.label5.Size = new System.Drawing.Size(93, 12);
            this.label5.TabIndex = 30;
            this.label5.Text = "Select Machine";
            // 
            // cbSelectMachine
            // 
            this.cbSelectMachine.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cbSelectMachine.FormattingEnabled = true;
            this.cbSelectMachine.Location = new System.Drawing.Point(5, 266);
            this.cbSelectMachine.Name = "cbSelectMachine";
            this.cbSelectMachine.Size = new System.Drawing.Size(159, 20);
            this.cbSelectMachine.TabIndex = 29;
            // 
            // btGetAlarmInfo
            // 
            this.btGetAlarmInfo.Location = new System.Drawing.Point(5, 354);
            this.btGetAlarmInfo.Name = "btGetAlarmInfo";
            this.btGetAlarmInfo.Size = new System.Drawing.Size(159, 23);
            this.btGetAlarmInfo.TabIndex = 26;
            this.btGetAlarmInfo.Text = "Get Machine Alarm";
            this.btGetAlarmInfo.UseVisualStyleBackColor = true;
            this.btGetAlarmInfo.Click += new System.EventHandler(this.btGetAlarmInfo_Click);
            // 
            // label3
            // 
            this.label3.AutoSize = true;
            this.label3.Location = new System.Drawing.Point(9, 96);
            this.label3.Name = "label3";
            this.label3.Size = new System.Drawing.Size(68, 12);
            this.label3.TabIndex = 25;
            this.label3.Text = "Serial Num";
            // 
            // tbSerialNum
            // 
            this.tbSerialNum.Location = new System.Drawing.Point(5, 112);
            this.tbSerialNum.Name = "tbSerialNum";
            this.tbSerialNum.Size = new System.Drawing.Size(159, 21);
            this.tbSerialNum.TabIndex = 24;
            this.tbSerialNum.Text = "1111-2222-3333-4444";
            // 
            // GetProductCount
            // 
            this.GetProductCount.Location = new System.Drawing.Point(5, 381);
            this.GetProductCount.Name = "GetProductCount";
            this.GetProductCount.Size = new System.Drawing.Size(159, 23);
            this.GetProductCount.TabIndex = 12;
            this.GetProductCount.Text = "Get Product Count";
            this.GetProductCount.UseVisualStyleBackColor = true;
            this.GetProductCount.Click += new System.EventHandler(this.GetProductCount_Click);
            // 
            // btGetCurrentProgInfo
            // 
            this.btGetCurrentProgInfo.Location = new System.Drawing.Point(5, 408);
            this.btGetCurrentProgInfo.Name = "btGetCurrentProgInfo";
            this.btGetCurrentProgInfo.Size = new System.Drawing.Size(159, 23);
            this.btGetCurrentProgInfo.TabIndex = 12;
            this.btGetCurrentProgInfo.Text = "Get Current Program Info";
            this.btGetCurrentProgInfo.UseVisualStyleBackColor = true;
            this.btGetCurrentProgInfo.Click += new System.EventHandler(this.btGetCurrentProgInfo_Click);
            // 
            // GetToolLife
            // 
            this.GetToolLife.Location = new System.Drawing.Point(5, 435);
            this.GetToolLife.Name = "GetToolLife";
            this.GetToolLife.Size = new System.Drawing.Size(159, 23);
            this.GetToolLife.TabIndex = 0;
            this.GetToolLife.Text = "Get Tool Life";
            this.GetToolLife.UseVisualStyleBackColor = true;
            this.GetToolLife.Click += new System.EventHandler(this.GetToolLife_Click);
            // 
            // cbOffsetHeadType
            // 
            this.cbOffsetHeadType.FormattingEnabled = true;
            this.cbOffsetHeadType.Items.AddRange(new object[] {
            "Main",
            "Sub"});
            this.cbOffsetHeadType.Location = new System.Drawing.Point(5, 489);
            this.cbOffsetHeadType.Name = "cbOffsetHeadType";
            this.cbOffsetHeadType.Size = new System.Drawing.Size(159, 20);
            this.cbOffsetHeadType.TabIndex = 2;
            // 
            // btGetToolOffset
            // 
            this.btGetToolOffset.Location = new System.Drawing.Point(5, 462);
            this.btGetToolOffset.Name = "btGetToolOffset";
            this.btGetToolOffset.Size = new System.Drawing.Size(159, 23);
            this.btGetToolOffset.TabIndex = 1;
            this.btGetToolOffset.Text = "Get Tool Offset";
            this.btGetToolOffset.UseVisualStyleBackColor = true;
            this.btGetToolOffset.Click += new System.EventHandler(this.btGetToolOffset_Click);
            // 
            // btProgDel
            // 
            this.btProgDel.Location = new System.Drawing.Point(5, 540);
            this.btProgDel.Name = "btProgDel";
            this.btProgDel.Size = new System.Drawing.Size(159, 23);
            this.btProgDel.TabIndex = 1;
            this.btProgDel.Text = "Delete Program";
            this.btProgDel.UseVisualStyleBackColor = true;
            this.btProgDel.Click += new System.EventHandler(this.btProgDel_Click);
            // 
            // btProgCreate
            // 
            this.btProgCreate.Location = new System.Drawing.Point(5, 513);
            this.btProgCreate.Name = "btProgCreate";
            this.btProgCreate.Size = new System.Drawing.Size(159, 23);
            this.btProgCreate.TabIndex = 0;
            this.btProgCreate.Text = "Create Program";
            this.btProgCreate.UseVisualStyleBackColor = true;
            this.btProgCreate.Click += new System.EventHandler(this.btProgCreate_Click);
            // 
            // btGetTemperature
            // 
            this.btGetTemperature.Location = new System.Drawing.Point(5, 567);
            this.btGetTemperature.Name = "btGetTemperature";
            this.btGetTemperature.Size = new System.Drawing.Size(159, 23);
            this.btGetTemperature.TabIndex = 0;
            this.btGetTemperature.Text = "Get Temperature";
            this.btGetTemperature.UseVisualStyleBackColor = true;
            this.btGetTemperature.Click += new System.EventHandler(this.btGetTemperature_Click);
            // 
            // splitContainer9
            // 
            this.splitContainer9.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer9.Location = new System.Drawing.Point(0, 0);
            this.splitContainer9.Name = "splitContainer9";
            // 
            // splitContainer9.Panel1
            // 
            this.splitContainer9.Panel1.Controls.Add(this.btGetTemperature);
            this.splitContainer9.Panel1.Controls.Add(this.btProgDel);
            this.splitContainer9.Panel1.Controls.Add(this.btGetToolOffset);
            this.splitContainer9.Panel1.Controls.Add(this.btProgCreate);
            this.splitContainer9.Panel1.Controls.Add(this.cbOffsetHeadType);
            this.splitContainer9.Panel1.Controls.Add(this.GetToolLife);
            this.splitContainer9.Panel1.Controls.Add(this.tbMachineUID);
            this.splitContainer9.Panel1.Controls.Add(this.lbUID);
            this.splitContainer9.Panel1.Controls.Add(this.label1);
            this.splitContainer9.Panel1.Controls.Add(this.btGetMachineList);
            this.splitContainer9.Panel1.Controls.Add(this.btGetCurrentProgInfo);
            this.splitContainer9.Panel1.Controls.Add(this.label5);
            this.splitContainer9.Panel1.Controls.Add(this.GetProductCount);
            this.splitContainer9.Panel1.Controls.Add(this.cbSelectMachine);
            this.splitContainer9.Panel1.Controls.Add(this.MachinePort);
            this.splitContainer9.Panel1.Controls.Add(this.MachineIP);
            this.splitContainer9.Panel1.Controls.Add(this.label2);
            this.splitContainer9.Panel1.Controls.Add(this.CommClose);
            this.splitContainer9.Panel1.Controls.Add(this.tbSerialNum);
            this.splitContainer9.Panel1.Controls.Add(this.btGetAlarmInfo);
            this.splitContainer9.Panel1.Controls.Add(this.label3);
            this.splitContainer9.Panel1.Controls.Add(this.CommOpen);
            // 
            // splitContainer9.Panel2
            // 
            this.splitContainer9.Panel2.Controls.Add(this.tabControl1);
            this.splitContainer9.Size = new System.Drawing.Size(1200, 672);
            this.splitContainer9.SplitterDistance = 169;
            this.splitContainer9.TabIndex = 14;
            // 
            // Form1
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(1200, 672);
            this.Controls.Add(this.splitContainer9);
            this.Name = "Form1";
            this.Text = "Hi-Link Example";
            this.FormClosing += new System.Windows.Forms.FormClosingEventHandler(this.Form1_FormClosing);
            this.Load += new System.EventHandler(this.Form1_Load);
            this.tabControl1.ResumeLayout(false);
            this.tabPage1.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.dgMachineData)).EndInit();
            this.tabPage2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.dataGridView1)).EndInit();
            this.tabPage3.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.dgToolOffset)).EndInit();
            this.tabPage4.ResumeLayout(false);
            this.splitContainer3.Panel1.ResumeLayout(false);
            this.splitContainer3.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer3)).EndInit();
            this.splitContainer3.ResumeLayout(false);
            this.tabPage5.ResumeLayout(false);
            this.tbTemperature.ResumeLayout(false);
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
            this.splitContainer9.Panel1.ResumeLayout(false);
            this.splitContainer9.Panel1.PerformLayout();
            this.splitContainer9.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer9)).EndInit();
            this.splitContainer9.ResumeLayout(false);
            this.ResumeLayout(false);

        }

        #endregion

        private System.Windows.Forms.TextBox MachineIP;
        private System.Windows.Forms.TextBox MachinePort;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.Label label2;
        private System.Windows.Forms.Button CommOpen;
        private System.Windows.Forms.Button CommClose;
        private System.Windows.Forms.TabControl tabControl1;
        private System.Windows.Forms.TabPage tabPage1;
        private System.Windows.Forms.Button GetProductCount;
        private System.Windows.Forms.TabPage tabPage2;
        private System.Windows.Forms.DataGridView dataGridView1;
        private System.Windows.Forms.Button GetToolLife;
        private System.Windows.Forms.TextBox tbSerialNum;
        private System.Windows.Forms.Label label3;
        private System.Windows.Forms.Button btGetCurrentProgInfo;
        private System.Windows.Forms.Button btGetAlarmInfo;
        private System.Windows.Forms.TabPage tabPage3;
        private System.Windows.Forms.Button btGetToolOffset;
        private System.Windows.Forms.DataGridView dgToolOffset;
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
        private System.Windows.Forms.Button btGetTemperature;
        private System.Windows.Forms.DataGridView dgMachineData;
        private System.Windows.Forms.ComboBox cbSelectMachine;
        private System.Windows.Forms.Label label5;
        private System.Windows.Forms.Button btGetMachineList;
        private System.Windows.Forms.TextBox tbMachineUID;
        private System.Windows.Forms.Label lbUID;
        private System.Windows.Forms.TabPage tabPage4;
        private System.Windows.Forms.SplitContainer splitContainer9;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn12;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn13;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn14;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn15;
        private System.Windows.Forms.DataGridViewTextBoxColumn dataGridViewTextBoxColumn16;
        private System.Windows.Forms.DataGridViewTextBoxColumn Alarm;
        private System.Windows.Forms.DataGridViewTextBoxColumn Column6;
        private System.Windows.Forms.DataGridViewTextBoxColumn Column7;
        private System.Windows.Forms.DataGridViewTextBoxColumn Column8;
        private System.Windows.Forms.DataGridViewTextBoxColumn Column9;
    }
}

