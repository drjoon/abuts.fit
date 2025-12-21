using Esprit;
using EspritConstants;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

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

        // Keep folderPath optional for backward compatibility
        public RepeatProcess(Esprit.Application app, string folderPath = @"C:\STLFiles")
        {
            _espApp = app;
            _folderPath = folderPath;
        }

        public void Run()
        {
            // 1. Collect existing STL files from the folder initially
            if (!Directory.Exists(_folderPath))
            {
                System.Diagnostics.Trace.WriteLine($"RepeatProcess: folder not found: {_folderPath}");
                return;
            }

            EnqueueExistingFiles();

            // 2. Set up FileSystemWatcher for real-time detection
            _watcher = new FileSystemWatcher(_folderPath, "*.stl")
            {
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite,
                IncludeSubdirectories = false,
                EnableRaisingEvents = true
            };
            _watcher.Created += OnCreated;
            _watcher.Changed += OnChanged;

            // 3. Start background processing loop
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
            // When a file is created, immediate access may fail if it's still being written.
            // Apply a simple retry logic.
            Task.Run(() =>
            {
                const int maxAttempts = 5;
                const int delayMs = 200;
                for (int attempt = 0; attempt < maxAttempts; attempt++)
                {
                    try
                    {
                        // Try opening the file to ensure it's readable
                        using (var stream = File.Open(e.FullPath, FileMode.Open, FileAccess.Read, FileShare.Read))
                        {
                            // If successful, enqueue the file
                            EnqueueFileIfNew(e.FullPath);
                            return;
                        }
                    }
                    catch (IOException)
                    {
                        // Possibly still being written -> wait and retry
                        Thread.Sleep(delayMs);
                    }
                    catch (UnauthorizedAccessException)
                    {
                        Thread.Sleep(delayMs);
                    }
                }

                // If still can't open after retries, enqueue anyway (files are not deleted per assumption)
                EnqueueFileIfNew(e.FullPath);
            });
        }

        private void OnChanged(object sender, FileSystemEventArgs e)
        {
            // Try again on change event in case the file has finished writing
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
                        // Re-queue logic can be added if needed
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
                        // Canceled
                    }
                }
            }
        }

        private void ProcessStlFile(string path)
        {
            System.Diagnostics.Trace.WriteLine($"RepeatProcess: Processing {path}");

            /***************************
                 * STL FILE IMPORT *
             ***************************/
            // Assume template document is already open in ESPRIT
            Document espdoc = _espApp.Document;
            // Import STL file
            espdoc.MergeFile(path);



            /***************************
               * DentalAddin process *
             ***************************/
            /////////////////////////////////////////
            // DO SOMETHING WITH DENTAL ADDIN HERE //
            /////////////////////////////////////////



            /***************************
                 * POST PROCESSING *
             ***************************/

            // Postprocessor default path
            String postFile = _espApp.Configuration.GetFileDirectory(espFileType.espFileTypePostProcessor);

            // TODO : change post file name to your postprocessor
            postFile = Path.Combine(postFile, "HyundaiWia_XF6300T_V19_FKSM.asc");
            // TODO : change NC file path
            String NCCodeFileName = Path.ChangeExtension(path, ".nc");

            espdoc.NCCode.AddAll();
            espdoc.NCCode.Execute(postFile, NCCodeFileName);



            /*****************************************
             * Delete operations, features and STL*
             *****************************************/

            // Delete some graphic objects after processing
            // Order : operations(toolpathes) -> features -> STL model
            for (int idx = espdoc.GraphicsCollection.Count; idx >= 1; idx--)
            {
                GraphicObject go = espdoc.GraphicsCollection[idx] as GraphicObject;
                System.Diagnostics.Trace.WriteLine($"RepeatProcess: Detached graphic object: {go.TypeName}");
                if (go.GraphicObjectType == espGraphicObjectType.espOperation ||
                    go.GraphicObjectType == espGraphicObjectType.espFeatureChain ||
                    go.GraphicObjectType == espGraphicObjectType.espFreeFormFeature ||
                    go.GraphicObjectType == espGraphicObjectType.espFeatureSet ||
                    go.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                {
                    System.Diagnostics.Trace.WriteLine($"RepeatProcess: Delete graphic object: {go.GuiTypeName}");
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
