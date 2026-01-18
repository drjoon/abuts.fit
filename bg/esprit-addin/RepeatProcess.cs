using Esprit;
using EspritConstants;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject
{
    public class RepeatProcess : IDisposable
    {
        private static Esprit.Application _espApp;
        private readonly Queue<string> _stlQueue = new Queue<string>();
        private readonly HashSet<string> _seenFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly object _queueLock = new object();

        private readonly string _folderPath;
        private readonly string _outputFolder;
        private CancellationTokenSource _cts;
        private Task _processingTask;

        // Keep folderPath optional for backward compatibility
        public RepeatProcess(Esprit.Application app, string folderPath = @"C:\abuts.fit\bg\storage\2-filled", string outputFolder = @"C:\abuts.fit\bg\storage\3-nc")
        {
            _espApp = app;
            _folderPath = folderPath;
            _outputFolder = outputFolder;
        }
        public void ProcessStlFile(string path)
        {
            AppLogger.Log($"RepeatProcess: Processing {path}");

            // Ensure output folder exists
            Directory.CreateDirectory(_outputFolder);

            /***************************
                 * STL FILE IMPORT *
             ***************************/
            // Assume template document is already open in ESPRIT
            Document espdoc = _espApp.Document;
            if (espdoc == null)
            {
                AppLogger.Log("RepeatProcess: No active ESPRIT document. Skip processing.");
                return;
            }
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
            String NCCodeFileName = Path.Combine(_outputFolder, Path.ChangeExtension(Path.GetFileName(path), ".nc"));

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
                AppLogger.Log($"RepeatProcess: Detached graphic object: {go.TypeName}");
                if (go.GraphicObjectType == espGraphicObjectType.espOperation ||
                    go.GraphicObjectType == espGraphicObjectType.espFeatureChain ||
                    go.GraphicObjectType == espGraphicObjectType.espFreeFormFeature ||
                    go.GraphicObjectType == espGraphicObjectType.espFeatureSet ||
                    go.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                {
                    AppLogger.Log($"RepeatProcess: Delete graphic object: {go.GuiTypeName}");
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
