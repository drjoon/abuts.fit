using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject
{
    public class AddInMainWindow : Form
    {
        private readonly FilePanel _filePanel;

        public event Action<string> FileRequested;

        public AddInMainWindow()
        {
            FormBorderStyle = FormBorderStyle.FixedSingle;
            StartPosition = FormStartPosition.Manual;
            Text = "STL 파일 선택";
            ClientSize = new Size(360, 120); // 3줄 정도 표시하도록 높이 축소
            TopMost = true;
            ShowInTaskbar = false;
            ControlBox = true;
            MaximizeBox = false;
            MinimizeBox = true;

            _filePanel = new FilePanel(new List<string>());
            _filePanel.Dock = DockStyle.Fill;
            _filePanel.FileSelected += HandleFileSelected;
            Controls.Add(_filePanel);

            PositionForm();
        }

        public void UpdateFiles(IEnumerable<string> files)
        {
            _filePanel.SetFiles(files ?? Enumerable.Empty<string>());
        }

        public void ShowWindow()
        {
            if (!Visible)
            {
                Show();
            }
            else
            {
                Activate();
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            base.OnFormClosing(e);
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                WindowState = FormWindowState.Minimized;
                Hide();
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _filePanel.FileSelected -= HandleFileSelected;
            }
            base.Dispose(disposing);
        }

        protected override CreateParams CreateParams
        {
            get
            {
                const int CP_NOCLOSE_BUTTON = 0x200;
                CreateParams cp = base.CreateParams;
                cp.ClassStyle |= CP_NOCLOSE_BUTTON;
                return cp;
            }
        }

        private void HandleFileSelected(string filePath)
        {
            FileRequested?.Invoke(filePath);
        }

        private void PositionForm()
        {
            Screen screen = Screen.PrimaryScreen;
            int offsetX = 20;
            int offsetY = 40;
            Location = new Point(
                screen.WorkingArea.Right - Width - offsetX,
                screen.WorkingArea.Bottom - Height - offsetY
            );
        }
    }
}
