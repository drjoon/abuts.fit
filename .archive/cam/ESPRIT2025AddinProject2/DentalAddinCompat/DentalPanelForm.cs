using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject.DentalAddinCompat
{
    /// <summary>
    ///     DentalAddin 패널을 간소화하여 설정을 확인/수정할 수 있는 폼.
    /// </summary>
    internal sealed class DentalPanelForm : Form
    {
        private readonly DentalAddinHost _host;
        private readonly TextBox _directoryTextBox;
        private readonly ListBox _processFilesListBox;
        private readonly Button _reloadButton;
        private readonly Button _saveButton;
        private readonly Button _browseButton;
        private readonly Label _statusLabel;

        public DentalPanelForm(DentalAddinHost host)
        {
            _host = host ?? throw new ArgumentNullException(nameof(host));
            Text = "DentalAddin Settings";
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(520, 420);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;

            var directoryLabel = new Label
            {
                Text = "Process Directory",
                AutoSize = true,
                Location = new Point(12, 18)
            };
            Controls.Add(directoryLabel);

            _directoryTextBox = new TextBox
            {
                Location = new Point(12, 40),
                Width = 360
            };
            Controls.Add(_directoryTextBox);

            _browseButton = new Button
            {
                Text = "Browse...",
                Location = new Point(380, 38),
                Width = 110
            };
            _browseButton.Click += HandleBrowse;
            Controls.Add(_browseButton);

            _reloadButton = new Button
            {
                Text = "Reload",
                Location = new Point(12, 80),
                Width = 110
            };
            _reloadButton.Click += (_, _) => LoadData();
            Controls.Add(_reloadButton);

            _saveButton = new Button
            {
                Text = "Save",
                Location = new Point(132, 80),
                Width = 110
            };
            _saveButton.Click += (_, _) => SaveData();
            Controls.Add(_saveButton);

            var listLabel = new Label
            {
                Text = "Detected Process Files (Top 20)",
                AutoSize = true,
                Location = new Point(12, 120)
            };
            Controls.Add(listLabel);

            _processFilesListBox = new ListBox
            {
                Location = new Point(12, 142),
                Width = 478,
                Height = 190
            };
            Controls.Add(_processFilesListBox);

            _statusLabel = new Label
            {
                AutoSize = true,
                ForeColor = Color.DimGray,
                Location = new Point(12, 344)
            };
            Controls.Add(_statusLabel);

            Load += (_, _) => LoadData();
        }

        private void LoadData()
        {
            var data = _host.Reload();
            _directoryTextBox.Text = data.PrcDirectory;
            RefreshProcessList(data.PrcDirectory);
            _statusLabel.Text = $"Last loaded: {DateTime.Now:HH:mm:ss}";
        }

        private void SaveData()
        {
            var directory = _directoryTextBox.Text?.Trim();
            var data = _host.CurrentData;
            data.PrcDirectory = directory ?? string.Empty;
            data.PrcFilePath[0] = directory ?? string.Empty;
            _host.Save();
            RefreshProcessList(directory);
            _statusLabel.Text = $"Saved at: {DateTime.Now:HH:mm:ss}";
        }

        private void RefreshProcessList(string directory)
        {
            _processFilesListBox.Items.Clear();
            if (string.IsNullOrWhiteSpace(directory))
            {
                return;
            }

            if (!Directory.Exists(directory))
            {
                _processFilesListBox.Items.Add("Directory not found.");
                return;
            }

            var files = Directory.GetFiles(directory).Take(20).ToArray();
            if (files.Length == 0)
            {
                _processFilesListBox.Items.Add("No files found.");
                return;
            }

            foreach (var file in files)
            {
                _processFilesListBox.Items.Add(Path.GetFileName(file));
            }
        }

        private void HandleBrowse(object sender, EventArgs e)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                dialog.SelectedPath = _directoryTextBox.Text;
                if (dialog.ShowDialog() == DialogResult.OK)
                {
                    _directoryTextBox.Text = dialog.SelectedPath;
                    RefreshProcessList(dialog.SelectedPath);
                }
            }
        }
    }
}
