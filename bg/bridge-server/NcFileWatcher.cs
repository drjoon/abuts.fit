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
            _watcher = new FileSystemWatcher(_storagePath, "*.nc");
            _watcher.Created += async (s, e) => {
                if (ControlController.IsRunning)
                {
                    await ProcessNcFile(e.FullPath);
                }
            };
            _watcher.EnableRaisingEvents = true;
            Console.WriteLine($"[NcFileWatcher] Monitoring started for {_storagePath}");
        }

        private async Task ProcessNcFile(string fullPath)
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
