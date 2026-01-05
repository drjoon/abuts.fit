using System;
using System.IO;
using System.Threading.Tasks;
using HiLinkBridgeWebApi48.Controllers;

using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;

namespace HiLinkBridgeWebApi48
{
    public class NcFileWatcher : IDisposable
    {
        private FileSystemWatcher _watcher;
        private readonly string _storagePath;
        private readonly HiLinkMode2Client _client = new HiLinkMode2Client();
        private readonly string _backendUrl = "https://abuts.fit/api";

        public NcFileWatcher()
        {
            // bg/storage/3-nc 감시
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            _storagePath = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "storage", "3-nc"));
            
            if (!Directory.Exists(_storagePath))
            {
                Directory.CreateDirectory(_storagePath);
            }
        }

        public void Start()
        {
            // _watcher = new FileSystemWatcher(_storagePath, "*.nc");
            // _watcher.Created += async (s, e) => {
            //     if (ControlController.IsRunning)
            //     {
            //         await ProcessNcFile(e.FullPath);
            //     }
            // };
            // _watcher.EnableRaisingEvents = true;
            Console.WriteLine($"[NcFileWatcher] Monitoring disabled. Using API/Recover commands.");
            
            // 재기동 시 미처리 파일 복구 실행
            Task.Run(() => RecoverUnprocessedFiles());
        }

        private async Task RecoverUnprocessedFiles()
        {
            try
            {
                Console.WriteLine("[Recover] Scanning for unprocessed NC files on startup...");
                if (!Directory.Exists(_storagePath)) return;

                var files = Directory.GetFiles(_storagePath, "*.nc");
                foreach (var file in files)
                {
                    string fileName = Path.GetFileName(file);
                    // 백엔드 API(/api/bg/file-status)를 호출하여 미처리건 확인
                    bool shouldProcess = await CheckBackendShouldProcess(fileName, "3-nc");
                    if (shouldProcess)
                    {
                        Console.WriteLine($"[Recover] Processing {fileName} (backend confirmed)");
                        await ProcessNcFile(file);
                    }
                    else
                    {
                        Console.WriteLine($"[Recover] Skipping {fileName} (already processed or not needed)");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Recover] Failed: {ex.Message}");
            }
        }

        private async Task<bool> CheckBackendShouldProcess(string fileName, string sourceStep)
        {
            try
            {
                using (var client = new HttpClient())
                {
                    string url = $"{_backendUrl}/bg/file-status?sourceStep={sourceStep}&fileName={fileName}&force=true";
                    var response = await client.GetAsync(url);
                    if (response.IsSuccessStatusCode)
                    {
                        string content = await response.Content.ReadAsStringAsync();
                        return content.ToLower().Contains("\"shouldprocess\":true");
                    }
                }
            }
            catch { }
            return false;
        }

        public async Task ProcessNcFile(string fullPath)
        {
            string fileName = Path.GetFileName(fullPath);
            try
            {
                Console.WriteLine($"[NcFileWatcher] New NC file detected: {fileName}");
                ControlController.AddHistory(fileName, "processing", "Starting CNC upload");

                // 1. 백엔드에서 가공 스케줄 확인 (예시)
                // string scheduleInfo = await NotifyBackendCheckSchedule(fileName);

                // 2. CNC 장비로 업로드 (Hi-Link)
                // var result = await _client.RequestRawAsync(uid, CollectDataType.UpdateProgram, ...);

                // 3. 가공 개시 명령 (현재 가공 완료 대기 로직 필요)
                // await _client.RequestRawAsync(uid, CollectDataType.UpdateActivateProg, ...);

                await NotifyBackend(fileName);

                ControlController.AddHistory(fileName, "success", "Uploaded and scheduled for CNC");
                Console.WriteLine($"[NcFileWatcher] Successfully processed {fileName}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[NcFileWatcher] Error processing {fileName}: {ex.Message}");
                ControlController.AddHistory(fileName, "failed", ex.Message);
            }
        }

        private async Task NotifyBackend(string fileName)
        {
            try
            {
                using (var client = new HttpClient())
                {
                    var payload = new 
                    {
                        sourceStep = "cnc",
                        fileName = fileName,
                        status = "success"
                    };

                    string json = JsonConvert.SerializeObject(payload);
                    var content = new StringContent(json, Encoding.UTF8, "application/json");

                    var response = await client.PostAsync($"{_backendUrl}/bg/register-file", content);
                    if (response.IsSuccessStatusCode)
                    {
                        Console.WriteLine($"[Backend] Notified CNC progress for {fileName}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Backend] Notification error: {ex.Message}");
            }
        }

        public void Dispose()
        {
            _watcher?.Dispose();
        }
    }
}
