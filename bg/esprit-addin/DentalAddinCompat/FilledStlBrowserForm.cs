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
    /// /bg/storage/2-filled 내 *.filled.stl 파일을 페이지 단위(5개)로 보여주고,
    /// 선택 시 현재 열린 ESPRIT 문서에 Merge하는 단순 브라우저.
    /// </summary>
    internal sealed class FilledStlBrowserForm : Form
    {
        private const int PageSize = 5;
        private readonly string _targetDirectory;
        private readonly Func<Document> _getDocument;

        private readonly ListBox _listBox;
        private readonly Button _prevButton;
        private readonly Button _nextButton;
        private readonly Button _refreshButton;
        private readonly Button _mergeButton;
        private readonly Label _statusLabel;

        private List<string> _files = new List<string>();
        private int _pageIndex;

        public FilledStlBrowserForm(string targetDirectory, Func<Document> getDocument)
        {
            _targetDirectory = targetDirectory ?? throw new ArgumentNullException(nameof(targetDirectory));
            _getDocument = getDocument ?? throw new ArgumentNullException(nameof(getDocument));

            Text = "Filled STL Browser";
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(540, 420);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;

            var pathLabel = new Label
            {
                Text = $"경로: {_targetDirectory}",
                AutoSize = false,
                Width = 500,
                Height = 34,
                Location = new WinPoint(12, 12)
            };
            Controls.Add(pathLabel);

            _refreshButton = new Button
            {
                Text = "새로고침",
                Location = new WinPoint(12, 48),
                Width = 90
            };
            _refreshButton.Click += (_, _) => RefreshFiles();
            Controls.Add(_refreshButton);

            _listBox = new ListBox
            {
                Location = new WinPoint(12, 80),
                Width = 500,
                Height = 240
            };
            _listBox.DoubleClick += (_, _) => MergeSelected();
            Controls.Add(_listBox);

            _prevButton = new Button
            {
                Text = "이전",
                Location = new WinPoint(12, 330),
                Width = 90
            };
            _prevButton.Click += (_, _) => ChangePage(_pageIndex - 1);
            Controls.Add(_prevButton);

            _nextButton = new Button
            {
                Text = "다음",
                Location = new WinPoint(110, 330),
                Width = 90
            };
            _nextButton.Click += (_, _) => ChangePage(_pageIndex + 1);
            Controls.Add(_nextButton);

            _mergeButton = new Button
            {
                Text = "선택 병합",
                Location = new WinPoint(214, 330),
                Width = 110
            };
            _mergeButton.Click += (_, _) => MergeSelected();
            Controls.Add(_mergeButton);

            _statusLabel = new Label
            {
                AutoSize = true,
                Location = new WinPoint(12, 366),
                ForeColor = Color.DimGray
            };
            Controls.Add(_statusLabel);

            Load += (_, _) => RefreshFiles();
        }

        public void RefreshFiles()
        {
            if (!Directory.Exists(_targetDirectory))
            {
                Directory.CreateDirectory(_targetDirectory);
            }

            _files = Directory.GetFiles(_targetDirectory, "*.filled.stl")
                .OrderByDescending(File.GetLastWriteTime)
                .ToList();

            _pageIndex = 0;
            RenderPage();
        }

        private void ChangePage(int newPage)
        {
            if (newPage < 0)
            {
                return;
            }

            if (newPage * PageSize >= _files.Count)
            {
                return;
            }

            _pageIndex = newPage;
            RenderPage();
        }

        private void RenderPage()
        {
            _listBox.Items.Clear();

            if (_files.Count == 0)
            {
                _listBox.Items.Add("파일이 없습니다.");
                _prevButton.Enabled = false;
                _nextButton.Enabled = false;
                _mergeButton.Enabled = false;
                _statusLabel.Text = "0개 파일";
                return;
            }

            var pageItems = _files.Skip(_pageIndex * PageSize).Take(PageSize).ToList();
            foreach (var file in pageItems)
            {
                var fi = new FileInfo(file);
                _listBox.Items.Add($"{fi.Name} (수정: {fi.LastWriteTime:yyyy-MM-dd HH:mm})");
            }

            _prevButton.Enabled = _pageIndex > 0;
            _nextButton.Enabled = (_pageIndex + 1) * PageSize < _files.Count;
            _mergeButton.Enabled = true;
            _statusLabel.Text = $"{_files.Count}개 중 {(_pageIndex * PageSize + 1)}-{Math.Min((_pageIndex + 1) * PageSize, _files.Count)}";
        }

        private void MergeSelected()
        {
            if (_files.Count == 0)
            {
                return;
            }

            var selectedIndex = _listBox.SelectedIndex;
            if (selectedIndex < 0)
            {
                Trace.WriteLine("FilledStlBrowserForm: 병합할 파일을 선택하세요. (MessageBox suppressed)");
                return;
            }

            var fullIndex = _pageIndex * PageSize + selectedIndex;
            if (fullIndex < 0 || fullIndex >= _files.Count)
            {
                return;
            }

            var targetPath = _files[fullIndex];
            var doc = _getDocument();
            if (doc == null)
            {
                Trace.WriteLine("FilledStlBrowserForm: 현재 열린 ESPRIT 문서를 찾을 수 없습니다. (MessageBox suppressed)");
                return;
            }

            try
            {
                doc.MergeFile(targetPath);
                Trace.WriteLine($"FilledStlBrowserForm: 병합 완료 - {Path.GetFileName(targetPath)} (MessageBox suppressed)");
            }
            catch (Exception ex)
            {
                Trace.WriteLine($"FilledStlBrowserForm: 병합 실패 - {ex.Message} (MessageBox suppressed)");
            }
        }
    }
}
