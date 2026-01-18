// 원본 STL 자동 처리 로직은 현재 요구사항에서 사용하지 않으므로 전체를 비활성화했다.
// 향후 복구가 필요하면 아래 블록의 주석을 제거하면 된다.
#if false
using Esprit;
using EspritConstants;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Acrodent.EspritAddIns.ESPRIT2025AddinProject.DentalAddinCompat;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject
{
    internal class RepeatProcess : IDisposable
    {
        private static Esprit.Application _espApp;
        private readonly Queue<string> _stlQueue = new Queue<string>();
        private readonly HashSet<string> _seenFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly object _queueLock = new object();

        private readonly string _folderPath;
        private FileSystemWatcher _watcher;
        private CancellationTokenSource _cts;
        private Task _processingTask;

        public RepeatProcess(Esprit.Application app, string folderPath = @"C:\abuts.fit\StlFiles")
        {
            _espApp = app;
            _folderPath = folderPath;
        }

        public void Run()
        {
            if (!Directory.Exists(_folderPath))
            {
                System.Diagnostics.Trace.WriteLine($"RepeatProcess: folder not found: {_folderPath}");
                return;
            }

            EnqueueExistingFiles();

            _watcher = new FileSystemWatcher(_folderPath, "*.stl")
            {
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite,
                IncludeSubdirectories = false,
                EnableRaisingEvents = true
            };
            _watcher.Created += OnCreated;
            _watcher.Changed += OnChanged;

            _cts = new CancellationTokenSource();
            _processingTask = Task.Run(() => ProcessLoop(_cts.Token), _cts.Token);
        }

        private void EnqueueExistingFiles()
        {
            var stlFiles = Directory.GetFiles(_folderPath, "*.stl");
            lock (_queueLock)
            {
                foreach (var file in stlFiles)
                {
                    if (_seenFiles.Add(file))
                    {
                        _stlQueue.Enqueue(file);
                    }
                }
            }
        }

        private void OnCreated(object sender, FileSystemEventArgs e)
        {
            Task.Run(() =>
            {
                const int maxAttempts = 5;
                const int delayMs = 200;
                for (int attempt = 0; attempt < maxAttempts; attempt++)
                {
                    try
                    {
                        using (var stream = File.Open(e.FullPath, FileMode.Open, FileAccess.Read, FileShare.Read))
                        {
                            EnqueueFileIfNew(e.FullPath);
                            return;
                        }
                    }
                    catch (IOException)
                    {
                        Thread.Sleep(delayMs);
                    }
                    catch (UnauthorizedAccessException)
                    {
                        Thread.Sleep(delayMs);
                    }
                }

                EnqueueFileIfNew(e.FullPath);
            });
        }

        private void OnChanged(object sender, FileSystemEventArgs e)
        {
            EnqueueFileIfNew(e.FullPath);
        }

        private void EnqueueFileIfNew(string path)
        {
            lock (_queueLock)
            {
                if (_seenFiles.Add(path))
                {
                    _stlQueue.Enqueue(path);
                    System.Diagnostics.Trace.WriteLine($"RepeatProcess: Enqueued {path}");
                }
            }
        }

        private void ProcessLoop(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                string fileToProcess = null;
                lock (_queueLock)
                {
                    if (_stlQueue.Count > 0)
                    {
                        fileToProcess = _stlQueue.Dequeue();
                    }
                }

                if (fileToProcess != null)
                {
                    try
                    {
                        ProcessStlFile(fileToProcess);
                    }
                    catch (Exception ex)
                    {
                        System.Diagnostics.Trace.WriteLine($"RepeatProcess: Error processing '{fileToProcess}': {ex}");
                    }
                }
                else
                {
                    try
                    {
                        Task.Delay(500, token).Wait(token);
                    }
                    catch (OperationCanceledException)
                    {
                    }
                }
            }
        }

        private void ProcessStlFile(string path)
        {
            System.Diagnostics.Trace.WriteLine($"RepeatProcess: Processing {path}");

            Document espdoc = _espApp.Document;
            espdoc.MergeFile(path);
            Connect.DentalHost.RunWorkflow(espdoc, path);

            String postFile = _espApp.Configuration.GetFileDirectory(espFileType.espFileTypePostProcessor);
            postFile = Path.Combine(postFile, "HyundaiWia_XF6300T_V19_FKSM.asc");
            String NCCodeFileName = Path.ChangeExtension(path, ".nc");

            espdoc.NCCode.AddAll();
            espdoc.NCCode.Execute(postFile, NCCodeFileName);

            for (int idx = espdoc.GraphicsCollection.Count; idx >= 1; idx--)
            {
                GraphicObject go = espdoc.GraphicsCollection[idx] as GraphicObject;
                if (go.GraphicObjectType == espGraphicObjectType.espOperation ||
                    go.GraphicObjectType == espGraphicObjectType.espFeatureChain ||
                    go.GraphicObjectType == espGraphicObjectType.espFreeFormFeature ||
                    go.GraphicObjectType == espGraphicObjectType.espFeatureSet ||
                    go.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                {
                    espdoc.GraphicsCollection.Remove(idx);
                }
            }

            espdoc.Refresh();
        }

        public void Stop()
        {
            if (_cts != null && !_cts.IsCancellationRequested)
            {
                _cts.Cancel();
            }

            if (_watcher != null)
            {
                _watcher.EnableRaisingEvents = false;
                _watcher.Created -= OnCreated;
                _watcher.Changed -= OnChanged;
                _watcher.Dispose();
                _watcher = null;
            }

            try
            {
                _processingTask?.Wait(2000);
            }
            catch (AggregateException) { }
            finally
            {
                _processingTask = null;
            }
        }

        public void Dispose()
        {
            Stop();
            _cts?.Dispose();
            _cts = null;
        }
    }
}
#endif

using System;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject
{
    internal class RepeatProcess : IDisposable
    {
        public RepeatProcess(Esprit.Application app, string folderPath = @"C:\abuts.fit\StlFiles")
        {
            // Disabled implementation
        }

        public void Run()
        {
            System.Diagnostics.Trace.WriteLine("RepeatProcess: disabled stub invoked.");
        }

        public void Dispose()
        {
        }
    }
}
