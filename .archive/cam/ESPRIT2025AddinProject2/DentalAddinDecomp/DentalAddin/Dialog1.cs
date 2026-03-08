using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin
{
    [DesignerGenerated]
    public class Dialog1 : Form
    {
        private IContainer components;

        [CompilerGenerated]
        [AccessedThroughProperty("ContextMenuStrip1")]
        private ContextMenuStrip _ContextMenuStrip1;

        public bool esc;

        internal virtual ContextMenuStrip ContextMenuStrip1
        {
            [CompilerGenerated]
            get
            {
                return _ContextMenuStrip1;
            }
            [MethodImpl(MethodImplOptions.Synchronized)]
            [CompilerGenerated]
            set
            {
                CancelEventHandler cancelEventHandler = ContextMenuStrip1_Opening;
                ContextMenuStrip val = _ContextMenuStrip1;
                if (val != null)
                {
                    ((ToolStripDropDown)val).Opening -= cancelEventHandler;
                }
                _ContextMenuStrip1 = value;
                val = _ContextMenuStrip1;
                if (val != null)
                {
                    ((ToolStripDropDown)val).Opening += cancelEventHandler;
                }
            }
        }

        public Dialog1()
        {
            ((Control)this).Click += Dialog1_Click;
            InitializeComponent();
        }

        [DebuggerNonUserCode]
        protected override void Dispose(bool disposing)
        {
            try
            {
                if (disposing && components != null)
                {
                    components.Dispose();
                }
            }
            finally
            {
                ((Form)this).Dispose(disposing);
            }
        }

        [DebuggerStepThrough]
        private void InitializeComponent()
        {
            //IL_0022: Unknown result type (might be due to invalid IL or missing references)
            //IL_002c: Expected O, but got Unknown
            //IL_0091: Unknown result type (might be due to invalid IL or missing references)
            //IL_009b: Expected O, but got Unknown
            components = new Container();
            ComponentResourceManager componentResourceManager = new ComponentResourceManager(typeof(Dialog1));
            ContextMenuStrip1 = new ContextMenuStrip(components);
            ((Control)this).SuspendLayout();
            ((ToolStrip)ContextMenuStrip1).ImageScalingSize = new Size(20, 20);
            ((Control)ContextMenuStrip1).Name = "ContextMenuStrip1";
            ((Control)ContextMenuStrip1).Size = new Size(61, 4);
            ((ContainerControl)this).AutoScaleDimensions = new SizeF(6f, 12f);
            ((ContainerControl)this).AutoScaleMode = (AutoScaleMode)1;
            ((Control)this).BackgroundImage = (Image)componentResourceManager.GetObject("$this.BackgroundImage");
            ((Control)this).BackgroundImageLayout = (ImageLayout)4;
            ((Form)this).ClientSize = new Size(796, 510);
            ((Control)this).ContextMenuStrip = ContextMenuStrip1;
            ((Control)this).DoubleBuffered = true;
            ((Form)this).FormBorderStyle = (FormBorderStyle)0;
            ((Form)this).MaximizeBox = false;
            ((Form)this).MinimizeBox = false;
            ((Control)this).Name = "Dialog1";
            ((Form)this).ShowInTaskbar = false;
            ((Form)this).StartPosition = (FormStartPosition)1;
            ((Form)this).Text = "Dialog1";
            ((Form)this).TopMost = true;
            ((Control)this).ResumeLayout(false);
        }

        private void Dialog1_Click(object sender, EventArgs e)
        {
            Thread.Sleep(100);
            if (!esc)
            {
                ((Form)this).DialogResult = (DialogResult)1;
            }
            ((Form)this).Close();
        }

        private void ContextMenuStrip1_Opening(object sender, CancelEventArgs e)
        {
            esc = true;
            ((Form)this).DialogResult = (DialogResult)2;
            ((Form)this).Close();
        }
    }
}
