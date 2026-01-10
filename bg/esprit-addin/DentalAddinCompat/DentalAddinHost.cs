using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using Esprit;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject.DentalAddinCompat
{
    /// <summary>
    ///     DentalAddin 디컴파일 결과를 토대로 최소한의 데이터 로딩/저장을 담당한다.
    ///     기존 DentalAddin 처럼 설정 파일을 관리하고, UI 및 자동 워크플로우 엔트리 포인트를 제공한다.
    /// </summary>
    internal sealed class DentalAddinHost
    {
        private readonly object _sync = new object();
        private Esprit.Application _espritApp;
        private DentalAddinUserData _cachedData;
        private DentalPanelForm _panel;

        public string DefaultSettingsPath { get; private set; }

        public void Initialize(Esprit.Application espritApp)
        {
            if (espritApp == null)
            {
                throw new ArgumentNullException(nameof(espritApp));
            }

            if (_espritApp != null)
            {
                return;
            }

            _espritApp = espritApp;
            DefaultSettingsPath = ResolveDefaultSettingsPath(espritApp.Path);
            Directory.CreateDirectory(Path.GetDirectoryName(DefaultSettingsPath));
            _cachedData = DentalAddinUserData.LoadFrom(DefaultSettingsPath);
        }

        public DentalAddinUserData CurrentData
        {
            get
            {
                lock (_sync)
                {
                    return _cachedData ??= DentalAddinUserData.LoadFrom(DefaultSettingsPath);
                }
            }
        }

        public DentalAddinUserData Reload()
        {
            lock (_sync)
            {
                _cachedData = DentalAddinUserData.LoadFrom(DefaultSettingsPath);
                return _cachedData;
            }
        }

        public void Save()
        {
            lock (_sync)
            {
                CurrentData.Save(DefaultSettingsPath);
            }
        }

        public void SaveAs(string targetPath)
        {
            if (string.IsNullOrWhiteSpace(targetPath))
            {
                return;
            }

            lock (_sync)
            {
                CurrentData.Save(targetPath);
            }
        }

        public void LoadFromFile(string sourcePath)
        {
            if (!File.Exists(sourcePath))
            {
                return;
            }

            lock (_sync)
            {
                _cachedData = DentalAddinUserData.LoadFrom(sourcePath);
                _cachedData.Save(DefaultSettingsPath);
            }
        }

        private Action _openFilledBrowser;
        private Func<Document> _getDocument;

        public void SetFilledBrowserOpener(Action openFilledBrowser)
        {
            _openFilledBrowser = openFilledBrowser;
        }

        public void SetDocumentResolver(Func<Document> getDocument)
        {
            _getDocument = getDocument;
        }

        public void ShowPanel()
        {
            EnsureInitialized();
            if (_panel == null || _panel.IsDisposed)
            {
                _panel = new DentalPanelForm(this, _openFilledBrowser, _getDocument);
            }

            if (!_panel.Visible)
            {
                _panel.Show();
            }

            _panel.BringToFront();
        }

        public void RunWorkflow(Document document, string stlPath)
        {
            if (document == null || _espritApp == null)
            {
                return;
            }

            var workflow = new DentalAddinWorkflow(_espritApp, CurrentData);
            workflow.Execute(document, stlPath);
        }

        private void EnsureInitialized()
        {
            if (_espritApp == null)
            {
                throw new InvalidOperationException("DentalAddinHost.Initialize가 먼저 호출되어야 합니다.");
            }
        }

        private static string ResolveDefaultSettingsPath(string espritPath)
        {
            var basePath = string.IsNullOrWhiteSpace(espritPath)
                ? AppDomain.CurrentDomain.BaseDirectory
                : espritPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

            // DentalAddin 기본 경로: <EspritPath>\AddIns\DentalAddin\Viles\DefaultPath
            var directory = Path.Combine(basePath, "AddIns", "DentalAddin", "Viles", "DefaultPath");
            return Path.Combine(directory, "AcrodentSettings.xml");
        }
    }

    internal sealed class DentalAddinWorkflow
    {
        private readonly Esprit.Application _application;
        private readonly DentalAddinUserData _data;

        public DentalAddinWorkflow(Esprit.Application application, DentalAddinUserData data)
        {
            _application = application ?? throw new ArgumentNullException(nameof(application));
            _data = data ?? throw new ArgumentNullException(nameof(data));
        }

        public void Execute(Document document, string stlPath)
        {
            var sb = new StringBuilder();
            sb.AppendLine("=== DentalAddin Workflow ===");
            sb.AppendLine($"Timestamp : {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            sb.AppendLine($"STL File  : {Path.GetFileName(stlPath)}");
            sb.AppendLine($"Directory : {_data.PrcDirectory}");
            sb.AppendLine($"Lock Mode : {_data.LockSetting}");
            sb.AppendLine();

            ApplyMachineOrientationToMainModule(document, sb);
            ApplySettingsToMainModule(sb);
            RunMainModule(document, sb);

            sb.AppendLine("=== End DentalAddin Workflow ===");
            try
            {
                _application.OutputWindow.Text(sb.ToString());
            }
            catch
            {
                System.Diagnostics.Trace.WriteLine(sb.ToString());
            }
        }

        private void ApplyMachineOrientationToMainModule(Document document, StringBuilder sb)
        {
            try
            {
                var latheSetup = document?.LatheMachineSetup;
                if (latheSetup == null || latheSetup.Spindles == null || latheSetup.Spindles.Count < 1)
                {
                    sb.AppendLine("Machine   : Lathe setup not available.");
                    sb.AppendLine();
                    return;
                }

                var spindle = latheSetup.Spindles[1];
                if (spindle == null)
                {
                    sb.AppendLine("Machine   : Spindle not available.");
                    sb.AppendLine();
                    return;
                }

                sb.AppendLine($"Spindle 1 : {spindle.Type} / {spindle.Orientation}");

                // 원본 DentalAddin 기준:
                // - RightPositive => SpindleSide=false
                // - LeftPositive  => SpindleSide=true
                switch (spindle.Orientation)
                {
                    case EspritConstants.espSpindleOrientation.espSpindleOrientationRightPositive:
                        DentalAddin.MainModule.SpindleSide = false;
                        break;
                    case EspritConstants.espSpindleOrientation.espSpindleOrientationLeftPositive:
                        DentalAddin.MainModule.SpindleSide = true;
                        break;
                }
            }
            catch (Exception ex)
            {
                sb.AppendLine($"Machine   : error - {ex.Message}");
            }

            sb.AppendLine();
        }

        private void ApplySettingsToMainModule(StringBuilder sb)
        {
            DentalAddin.MainModule.PrcDirectory = _data.PrcDirectory ?? string.Empty;

            CopyArray(_data.PrcFileName, DentalAddin.MainModule.PrcFileName);
            CopyArray(_data.PrcFilePath, DentalAddin.MainModule.PrcFilePath);
            CopyArray(_data.NumData, DentalAddin.MainModule.NumData);
            CopyArray(_data.NumCombobox, DentalAddin.MainModule.NumCombobox);

            sb.AppendLine("Settings  : mapped to MainModule");
            sb.AppendLine();
        }

        private void RunMainModule(Document document, StringBuilder sb)
        {
            if (document == null)
            {
                sb.AppendLine("Run       : document is null");
                sb.AppendLine();
                return;
            }

            try
            {
                DentalAddin.MainModule.Bind(_application, document);

                try
                {
                    _application.Processing = true;
                }
                catch
                {
                }

                DentalAddin.MainModule.Main();
                sb.AppendLine("Run       : MainModule.Main completed");
            }
            catch (Exception ex)
            {
                sb.AppendLine($"Run       : MainModule.Main failed - {ex.Message}");
            }
            finally
            {
                try
                {
                    _application.Processing = false;
                }
                catch
                {
                }

                sb.AppendLine();
            }
        }

        private static void CopyArray<T>(T[] source, T[] target)
        {
            if (source == null || target == null)
            {
                return;
            }

            var count = Math.Min(source.Length, target.Length);
            Array.Copy(source, target, count);
        }

        private void AppendMachineOrientation(Document document, StringBuilder sb)
        {
            try
            {
                var latheSetup = document?.LatheMachineSetup;
                if (latheSetup == null)
                {
                    sb.AppendLine("Machine   : Lathe setup not available.");
                    return;
                }

                for (int i = 1; i <= latheSetup.Spindles.Count; i++)
                {
                    var spindle = latheSetup.Spindles[i];
                    if (spindle == null)
                    {
                        continue;
                    }

                    sb.AppendLine($"Spindle {i}: {spindle.Type} / {spindle.Orientation}");
                }
            }
            catch (Exception ex)
            {
                sb.AppendLine($"Machine   : error - {ex.Message}");
            }

            sb.AppendLine();
        }

        private void AppendProcessFileStatus(StringBuilder sb)
        {
            for (var index = 0; index < _data.PrcFilePath.Length; index++)
            {
                var path = _data.PrcFilePath[index];
                if (string.IsNullOrWhiteSpace(path))
                {
                    continue;
                }

                sb.AppendLine($"[{index}] Path : {path}");
                if (Directory.Exists(path))
                {
                    var files = Directory.GetFiles(path).Take(5).ToArray();
                    if (files.Length == 0)
                    {
                        sb.AppendLine("  - No process files found.");
                    }
                    else
                    {
                        foreach (var file in files)
                        {
                            sb.AppendLine($"  - {Path.GetFileName(file)}");
                        }
                    }
                }
                else
                {
                    sb.AppendLine("  - Directory does not exist.");
                }
            }

            sb.AppendLine();
        }

        private void ApplyProcessFiles(Document document, string stlPath, StringBuilder sb)
        {
            if (document == null)
            {
                sb.AppendLine("Process  : document is null");
                sb.AppendLine();
                return;
            }

            var processed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // DentalAddin UI에서 프로세스 파일은 주로 1~12 슬롯에 매핑된다.
            for (var index = 1; index <= 12 && index < _data.PrcFilePath.Length; index++)
            {
                var rawPath = _data.PrcFilePath[index];
                var resolved = ResolveProcessFilePath(rawPath);

                if (string.IsNullOrWhiteSpace(resolved))
                {
                    continue;
                }

                if (!processed.Add(resolved))
                {
                    continue;
                }

                if (!File.Exists(resolved) && !Directory.Exists(resolved))
                {
                    sb.AppendLine($"Process[{index}] missing: {resolved}");
                    continue;
                }

                try
                {
                    // ESPRIT에서는 STL 뿐 아니라 PRC도 MergeFile로 불러오는 케이스가 많아 동일 경로를 사용한다.
                    // 폴더가 들어오면 폴더 내 *.prc 파일들을 전부 적용한다.
                    if (Directory.Exists(resolved))
                    {
                        var prcFiles = Directory.GetFiles(resolved, "*.prc");
                        sb.AppendLine($"Process[{index}] folder: {resolved} ({prcFiles.Length} files)");

                        foreach (var file in prcFiles)
                        {
                            try
                            {
                                document.MergeFile(file);
                                sb.AppendLine($"  - merged: {Path.GetFileName(file)}");
                            }
                            catch (Exception ex)
                            {
                                sb.AppendLine($"  - merge failed: {Path.GetFileName(file)} ({ex.Message})");
                            }
                        }

                        continue;
                    }

                    sb.AppendLine($"Process[{index}] merge: {Path.GetFileName(resolved)}");
                    document.MergeFile(resolved);
                }
                catch (Exception ex)
                {
                    sb.AppendLine($"Process[{index}] merge error: {ex.Message}");
                }
            }

            sb.AppendLine();
        }

        private string ResolveProcessFilePath(string rawPath)
        {
            if (string.IsNullOrWhiteSpace(rawPath))
            {
                return string.Empty;
            }

            var trimmed = rawPath.Trim();

            // 기존 DentalAddin은 폴더 선택(4/8)과 파일 선택(1~3,5~7,9~12)을 혼용한다.
            // 상대경로로 저장된 경우 PrcDirectory 기준으로 보정.
            if (!Path.IsPathRooted(trimmed) && !string.IsNullOrWhiteSpace(_data.PrcDirectory))
            {
                return Path.Combine(_data.PrcDirectory, trimmed);
            }

            return trimmed;
        }
    }
}
