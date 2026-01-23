using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject
{
    public partial class FilePanel : UserControl
    {
        private ListBox listBoxFiles;

        private List<string> allFiles = new List<string>();
        private StlFileProcessor _processor;

        public event Action<string> FileSelected;

        public FilePanel(List<string> files, StlFileProcessor processor)
        {
            _processor = processor ?? throw new ArgumentNullException(nameof(processor));
            InitializeComponent();
            SetFiles(files);
        }

        private void InitializeComponent()
        {
            this.listBoxFiles = new System.Windows.Forms.ListBox();
            this.SuspendLayout();
            // 
            // listBoxFiles
            // 
            this.listBoxFiles.DrawMode = System.Windows.Forms.DrawMode.OwnerDrawVariable;
            this.listBoxFiles.IntegralHeight = false;
            this.listBoxFiles.Dock = System.Windows.Forms.DockStyle.Fill;
            this.listBoxFiles.Name = "listBoxFiles";
            this.listBoxFiles.Margin = new System.Windows.Forms.Padding(0);
            this.listBoxFiles.Size = new System.Drawing.Size(320, 110);
            this.listBoxFiles.TabIndex = 0;
            // 
            // FilePanel
            // 
            this.Controls.Add(this.listBoxFiles);
            this.Name = "FilePanel";
            this.Padding = new System.Windows.Forms.Padding(0);
            this.Size = new System.Drawing.Size(340, 130);
            this.listBoxFiles.DoubleClick += new System.EventHandler(this.ListBoxFiles_DoubleClick);
            this.listBoxFiles.KeyDown += new System.Windows.Forms.KeyEventHandler(this.ListBoxFiles_KeyDown);
            this.listBoxFiles.MeasureItem += new System.Windows.Forms.MeasureItemEventHandler(this.ListBoxFiles_MeasureItem);
            this.listBoxFiles.DrawItem += new System.Windows.Forms.DrawItemEventHandler(this.ListBoxFiles_DrawItem);
            this.ResumeLayout(false);

        }

        private void ListBoxFiles_MeasureItem(object sender, MeasureItemEventArgs e)
        {
            if (e.Index < 0)
            {
                e.ItemHeight = 20;
                return;
            }

            string fileName = listBoxFiles.Items[e.Index].ToString();
            int maxWidth = listBoxFiles.ClientSize.Width;
            Size textSize = TextRenderer.MeasureText(
                e.Graphics,
                fileName,
                listBoxFiles.Font,
                new Size(maxWidth, int.MaxValue),
                TextFormatFlags.WordBreak
            );

            int maxLinesHeight = (listBoxFiles.Font.Height * 3) + 4; // 최대 3줄 + padding
            int desiredHeight = Math.Max(textSize.Height + 4, listBoxFiles.Font.Height + 4);
            e.ItemHeight = Math.Min(desiredHeight, maxLinesHeight);
        }

        private void ListBoxFiles_DrawItem(object sender, DrawItemEventArgs e)
        {
            if (e.Index < 0) return;
            e.DrawBackground();
            string fileName = listBoxFiles.Items[e.Index].ToString();
            Rectangle textBounds = new Rectangle(e.Bounds.X + 2, e.Bounds.Y + 2, e.Bounds.Width - 4, e.Bounds.Height - 4);
            TextRenderer.DrawText(
                e.Graphics,
                fileName,
                e.Font,
                textBounds,
                e.ForeColor,
                TextFormatFlags.WordBreak
            );
            e.DrawFocusRectangle();
        }

        private void ListBoxFiles_DoubleClick(object sender, EventArgs e)
        {
            OpenSelectedFile();
        }

        private void ListBoxFiles_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode != Keys.Enter)
            {
                return;
            }

            OpenSelectedFile();
            e.Handled = true; // 키보드 Enter 지원
        }

        private void OpenSelectedFile()
        {
            if (listBoxFiles.SelectedItem == null)
            {
                return;
            }

            string fileName = listBoxFiles.SelectedItem.ToString();
            string fullPath = allFiles.Find(f => Path.GetFileName(f) == fileName);
            if (string.IsNullOrEmpty(fullPath))
            {
                return;
            }

            AppLogger.Log($"FilePanel: {fullPath}");
            FileSelected?.Invoke(fullPath);
        }

        public void SetFiles(IEnumerable<string> files)
        {
            allFiles = files?.ToList() ?? new List<string>();
            PopulateList();
        }

        private void PopulateList()
        {
            listBoxFiles.Items.Clear();
            foreach (var file in allFiles)
            {
                listBoxFiles.Items.Add(Path.GetFileName(file));
            }
        }
    }
}
