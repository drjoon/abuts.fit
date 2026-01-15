using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using Esprit;
using WinPoint = System.Drawing.Point;

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
        private readonly Func<Document> _getDocument;

        // Filled STL 리스트
        private readonly ListBox _filledListBox;
        private readonly Button _filledPrevButton;
        private readonly Button _filledNextButton;
        private readonly Button _filledRefreshButton;
        private readonly Label _filledStatusLabel;
        private List<string> _filledFiles = new List<string>();
        private int _filledPageIndex;

        public DentalPanelForm(DentalAddinHost host, Action openFilledBrowser, Func<Document> getDocument)
        {
            _host = host ?? throw new ArgumentNullException(nameof(host));
            _getDocument = getDocument;
            Text = "Abuts.fit";
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(520, 420);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;

            var directoryLabel = new Label
            {
                Text = "Process Directory",
                AutoSize = true,
                Location = new WinPoint(12, 18)
            };
            Controls.Add(directoryLabel);

            _directoryTextBox = new TextBox
            {
                Location = new WinPoint(12, 40),
                Width = 360
            };
            Controls.Add(_directoryTextBox);

            _browseButton = new Button
            {
                Text = "Browse...",
                Location = new WinPoint(380, 38),
                Width = 110
            };
            _browseButton.Click += HandleBrowse;
            Controls.Add(_browseButton);

            _reloadButton = new Button
            {
                Text = "Reload",
                Location = new WinPoint(12, 80),
                Width = 110
            };
            _reloadButton.Click += (_, _) => LoadData();
            Controls.Add(_reloadButton);

            _saveButton = new Button
            {
                Text = "Save",
                Location = new WinPoint(132, 80),
                Width = 110
            };
            _saveButton.Click += (_, _) => SaveData();
            Controls.Add(_saveButton);

            var listLabel = new Label
            {
                Text = "Filled STL Files (5개씩)",
                AutoSize = true,
                Location = new WinPoint(12, 100)
            };
            Controls.Add(listLabel);

            _filledListBox = new ListBox
            {
                Location = new WinPoint(12, 122),
                Width = 478,
                Height = 110
            };
            _filledListBox.DoubleClick += (_, _) => MergeSelectedFilled();
            Controls.Add(_filledListBox);

            _filledPrevButton = new Button
            {
                Text = "이전",
                Location = new WinPoint(12, 236),
                Width = 80
            };
            _filledPrevButton.Click += (_, _) => ChangeFilledPage(_filledPageIndex - 1);
            Controls.Add(_filledPrevButton);

            _filledNextButton = new Button
            {
                Text = "다음",
                Location = new WinPoint(100, 236),
                Width = 80
            };
            _filledNextButton.Click += (_, _) => ChangeFilledPage(_filledPageIndex + 1);
            Controls.Add(_filledNextButton);

            _filledRefreshButton = new Button
            {
                Text = "새로고침",
                Location = new WinPoint(188, 236),
                Width = 90
            };
            _filledRefreshButton.Click += (_, _) => RefreshFilledFiles();
            Controls.Add(_filledRefreshButton);

            _filledStatusLabel = new Label
            {
                AutoSize = true,
                ForeColor = Color.DimGray,
                Location = new WinPoint(290, 240)
            };
            Controls.Add(_filledStatusLabel);

            _processFilesListBox = new ListBox
            {
                Location = new WinPoint(12, 272),
                Width = 478,
                Height = 80
            };
            Controls.Add(_processFilesListBox);

            _statusLabel = new Label
            {
                AutoSize = true,
                ForeColor = Color.DimGray,
                Location = new WinPoint(12, 364)
            };
            Controls.Add(_statusLabel);

            Load += (_, _) =>
            {
                LoadData();
                RefreshFilledFiles();
            };
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

        private void RefreshFilledFiles()
        {
            var dir = ResolveFilledDirectory();
            if (!Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            _filledFiles = Directory.GetFiles(dir, "*.filled.stl")
                .OrderByDescending(File.GetLastWriteTime)
                .ToList();

            _filledPageIndex = 0;
            RenderFilledPage();
        }

        private void ChangeFilledPage(int newPage)
        {
            if (newPage < 0) return;
            if (newPage * 5 >= _filledFiles.Count) return;
            _filledPageIndex = newPage;
            RenderFilledPage();
        }

        private void RenderFilledPage()
        {
            _filledListBox.Items.Clear();

            if (_filledFiles.Count == 0)
            {
                _filledListBox.Items.Add("파일이 없습니다.");
                _filledPrevButton.Enabled = false;
                _filledNextButton.Enabled = false;
                _filledRefreshButton.Enabled = true;
                _filledStatusLabel.Text = "0개 파일";
                return;
            }

            var pageItems = _filledFiles.Skip(_filledPageIndex * 5).Take(5).ToList();
            foreach (var file in pageItems)
            {
                var fi = new FileInfo(file);
                _filledListBox.Items.Add($"{fi.Name} (수정: {fi.LastWriteTime:yyyy-MM-dd HH:mm})");
            }

            _filledPrevButton.Enabled = _filledPageIndex > 0;
            _filledNextButton.Enabled = (_filledPageIndex + 1) * 5 < _filledFiles.Count;
            _filledRefreshButton.Enabled = true;
            _filledStatusLabel.Text = $"{_filledFiles.Count}개 중 {(_filledPageIndex * 5 + 1)}-{Math.Min((_filledPageIndex + 1) * 5, _filledFiles.Count)}";
        }

        private void MergeSelectedFilled()
        {
            if (_filledFiles.Count == 0) return;
            var selectedIndex = _filledListBox.SelectedIndex;
            if (selectedIndex < 0) return;

            var fullIndex = _filledPageIndex * 5 + selectedIndex;
            if (fullIndex < 0 || fullIndex >= _filledFiles.Count) return;

            var targetPath = _filledFiles[fullIndex];
            var doc = _getDocument?.Invoke();
            if (doc == null)
            {
                Trace.WriteLine("DentalPanelForm: 현재 열린 ESPRIT 문서를 찾을 수 없습니다. (MessageBox suppressed)");
                return;
            }

            try
            {
                doc.MergeFile(targetPath);
                Trace.WriteLine($"DentalPanelForm: 병합 완료 - {Path.GetFileName(targetPath)} (MessageBox suppressed)");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"DentalPanelForm: 병합 실패 - {ex.Message} (MessageBox suppressed)");
            }
        }

        private static string ResolveFilledDirectory()
        {
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            return Path.GetFullPath(Path.Combine(baseDir, "..", "..", "storage", "2-filled"));
        }
    }
}
