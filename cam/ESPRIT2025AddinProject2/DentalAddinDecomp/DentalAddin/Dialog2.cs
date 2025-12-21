using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.CompilerServices;
using System.Windows.Forms;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin
{
    [DesignerGenerated]
    public class Dialog2 : Form
    {
        private IContainer components;

        [CompilerGenerated]
        [AccessedThroughProperty("TextBox1")]
        private TextBox _TextBox1;

        internal virtual TextBox TextBox1
        {
            [CompilerGenerated]
            get
            {
                return _TextBox1;
            }
            [MethodImpl(MethodImplOptions.Synchronized)]
            [CompilerGenerated]
            set
            {
                EventHandler eventHandler = TextBox1_TextChanged;
                TextBox val = _TextBox1;
                if (val != null)
                {
                    ((Control)val).TextChanged -= eventHandler;
                }
                _TextBox1 = value;
                val = _TextBox1;
                if (val != null)
                {
                    ((Control)val).TextChanged += eventHandler;
                }
            }
        }

        [field: AccessedThroughProperty("Label1")]
        internal virtual Label Label1
        {
            get; [MethodImpl(MethodImplOptions.Synchronized)]
            set;
        }

        public Dialog2()
        {
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
            //IL_0011: Unknown result type (might be due to invalid IL or missing references)
            //IL_001b: Expected O, but got Unknown
            //IL_001c: Unknown result type (might be due to invalid IL or missing references)
            //IL_0026: Expected O, but got Unknown
            //IL_0043: Unknown result type (might be due to invalid IL or missing references)
            //IL_004d: Expected O, but got Unknown
            //IL_00d0: Unknown result type (might be due to invalid IL or missing references)
            //IL_00da: Expected O, but got Unknown
            //IL_0191: Unknown result type (might be due to invalid IL or missing references)
            //IL_019b: Expected O, but got Unknown
            ComponentResourceManager componentResourceManager = new ComponentResourceManager(typeof(Dialog2));
            TextBox1 = new TextBox();
            Label1 = new Label();
            ((Control)this).SuspendLayout();
            ((Control)TextBox1).Font = new Font("微软雅黑", 14.25f, (FontStyle)0, (GraphicsUnit)3, (byte)134);
            ((Control)TextBox1).Location = new Point(66, 20);
            ((Control)TextBox1).Name = "TextBox1";
            TextBox1.PasswordChar = '*';
            ((Control)TextBox1).Size = new Size(142, 33);
            ((Control)TextBox1).TabIndex = 1;
            TextBox1.UseSystemPasswordChar = true;
            Label1.AutoSize = true;
            ((Control)Label1).Font = new Font("微软雅黑", 14.25f, (FontStyle)0, (GraphicsUnit)3, (byte)134);
            ((Control)Label1).Location = new Point(11, 22);
            ((Control)Label1).Name = "Label1";
            ((Control)Label1).Size = new Size(50, 25);
            ((Control)Label1).TabIndex = 2;
            Label1.Text = "Key:";
            ((ContainerControl)this).AutoScaleDimensions = new SizeF(6f, 12f);
            ((ContainerControl)this).AutoScaleMode = (AutoScaleMode)1;
            ((Form)this).ClientSize = new Size(227, 73);
            ((Control)this).Controls.Add((Control)(object)Label1);
            ((Control)this).Controls.Add((Control)(object)TextBox1);
            ((Form)this).FormBorderStyle = (FormBorderStyle)3;
            ((Form)this).Icon = (Icon)componentResourceManager.GetObject("$this.Icon");
            ((Form)this).MaximizeBox = false;
            ((Form)this).MinimizeBox = false;
            ((Control)this).Name = "Dialog2";
            ((Form)this).ShowInTaskbar = false;
            ((Form)this).StartPosition = (FormStartPosition)4;
            ((Form)this).Text = "Access";
            ((Form)this).TopMost = true;
            ((Control)this).ResumeLayout(false);
            ((Control)this).PerformLayout();
        }

        private void TextBox1_TextChanged(object sender, EventArgs e)
        {
            if (License.LicenseKey.IndexOf(License.MyLic(TextBox1.Text)) >= 0)
            {
                ((Form)this).DialogResult = (DialogResult)1;
                ((Form)this).Close();
            }
        }
    }
}
