using System;
using System.Drawing;
using System.Windows.Forms;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject
{
    public class ProgressForm : Form
    {
        private ProgressBar progressBar;
        private Label labelStatus;

        public ProgressForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.progressBar = new ProgressBar();
            this.labelStatus = new Label();
            this.SuspendLayout();

            // progressBar
            this.progressBar.Location = new Point(20, 30);
            this.progressBar.Name = "progressBar";
            this.progressBar.Size = new Size(360, 30);
            this.progressBar.TabIndex = 0;

            // labelStatus
            this.labelStatus.AutoSize = false;
            this.labelStatus.Location = new Point(20, 70);
            this.labelStatus.Name = "labelStatus";
            this.labelStatus.Size = new Size(360, 20);
            this.labelStatus.TabIndex = 1;
            this.labelStatus.Text = "Processing...";
            this.labelStatus.TextAlign = ContentAlignment.MiddleCenter;

            // ProgressForm
            this.AutoScaleDimensions = new SizeF(6F, 13F);
            this.AutoScaleMode = AutoScaleMode.Font;
            this.ClientSize = new Size(400, 120);
            this.Controls.Add(this.labelStatus);
            this.Controls.Add(this.progressBar);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Name = "ProgressForm";
            this.StartPosition = FormStartPosition.CenterScreen;
            this.Text = "Abuts.fit Add-In - Processing";
            this.ResumeLayout(false);
        }

        public void UpdateProgress(int value, string status)
        {
            if (value >= 0 && value <= 100)
            {
                progressBar.Value = value;
            }
            labelStatus.Text = status;
            this.Refresh();
        }
    }
}
