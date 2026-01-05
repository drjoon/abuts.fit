using Hi_Link.Libraries;
using Hi_Link.Libraries.Model;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Windows.Forms;

namespace Hi_Link_CSharp
{
    public partial class ProgView : Form
    {
        public MachineProgramData MachineProgData = new MachineProgramData();

        [Description("Save program in NC"), Category("Button event")]
        public event EventHandler StartShapeCal;

        public ProgView()
        {
            InitializeComponent();
        }

        private void btSave_Click(object sender, EventArgs e)
        {
            if ((StartShapeCal != null))
            {
                MachineProgData.programData = tbProgData.Text;
                Invoke(StartShapeCal, this);
            }
        }
    }
}
