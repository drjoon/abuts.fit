using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Hi_Link;
using Hi_Link.Libraries.Model;
using Hi_Link_Advanced;
using Hi_Link_Advanced.EdgeBridge;
using Hi_Link_Advanced.LinkBridge;

namespace HiLinkBridgeWebApi48
{
    /// <summary>
    /// Hi-Link Mode2 DLL의 스레드 불안정성 문제를 회피하기 위해, 모든 요청을 단일 워커 스레드에서 직렬화하여 처리하는 클라이언트.
    /// </summary>
    public class HiLinkMode2Client
    {
        private class RequestItem
        {
            public RequestDataMessage Message { get; set; }
            public TaskCompletionSource<object> Tcs { get; set; }
            public int TimeoutMs { get; set; }
        }

        private static readonly BlockingCollection<RequestItem> RequestQueue = new BlockingCollection<RequestItem>();
        private static readonly CancellationTokenSource Cts = new CancellationTokenSource();
        private static readonly ConcurrentDictionary<string, ConcurrentQueue<ResponseDataMessage>> PendingResponses
            = new ConcurrentDictionary<string, ConcurrentQueue<ResponseDataMessage>>();

        // Hi-Link DLL의 MessageHandler는 static 멤버를 사용하므로, 전체 프로세스에서 단 한 번만 초기화해야 한다.
        static HiLinkMode2Client()
        {
            Console.WriteLine("[HiLinkMode2Client] Starting background worker thread...");
            Task.Factory.StartNew(ProcessQueue, Cts.Token, TaskCreationOptions.LongRunning, TaskScheduler.Default);
        }

        private static void ProcessQueue()
        {
            // 워커 스레드 내에서 단 한 번 MessageHandler를 생성하여 DLL 내부 스레드를 초기화한다.
            _ = new MessageHandler();
            Console.WriteLine("[HiLinkMode2Client] MessageHandler initialized in worker thread.");

            // ResponseFIFO에 쌓일 수 있는 예상치 못한 응답을 미리 비운다.
            while (MessageHandler.ResponseFIFO.Count > 0) MessageHandler.ResponseFIFO.Dequeue();

            foreach (var item in RequestQueue.GetConsumingEnumerable(Cts.Token))
            {
                try
                {
                    MessageHandler.RequestFIFO.Enqueue(item.Message);

                    var sw = System.Diagnostics.Stopwatch.StartNew();
                    object responseData = null;

                    var expectedKey = string.Format("{0}:{1}", item.Message.UID ?? string.Empty, item.Message.DataType);
                    if (PendingResponses.TryGetValue(expectedKey, out var pendingQueue))
                    {
                        if (pendingQueue != null && pendingQueue.TryDequeue(out var pendingResp))
                        {
                            responseData = pendingResp.Data;
                        }
                    }

                    while (responseData == null && sw.ElapsedMilliseconds < item.TimeoutMs)
                    {
                        if (MessageHandler.ResponseFIFO.Count > 0)
                        {
                            // FIFO이므로 들어온 순서대로 처리된다고 가정한다.
                            // 불안정할 경우, 모든 응답을 별도 큐에 넣고 UID/DataType으로 매칭해야 한다.
                            if (MessageHandler.ResponseFIFO.Dequeue() is ResponseDataMessage resp)
                            {
                                if (resp.UID == item.Message.UID && resp.DataType == item.Message.DataType)
                                {
                                    responseData = resp.Data;
                                    break;
                                }
                                else
                                {
                                    // 내가 기다리던 응답이 아니면 로그만 남긴다. (이전 요청의 타임아웃된 응답일 수 있음)
                                    Console.WriteLine($"[HiLinkMode2Client] Mismatched response. Expected: {item.Message.UID}/{item.Message.DataType}, Got: {resp.UID}/{resp.DataType}");

                                    var key = string.Format("{0}:{1}", resp.UID ?? string.Empty, resp.DataType);
                                    var q = PendingResponses.GetOrAdd(key, _ => new ConcurrentQueue<ResponseDataMessage>());
                                    q.Enqueue(resp);
                                }
                            }
                        }
                        Thread.Sleep(10); // CPU 사용량 감소
                    }

                    item.Tcs.TrySetResult(responseData);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[HiLinkMode2Client] Worker thread exception for UID {item.Message.UID}: {ex}");
                    item.Tcs.TrySetException(ex);
                }
            }
        }

        public async Task<object> RequestRawAsync(string uid, CollectDataType type, object data, int timeoutMs = 3000)
        {
            var requestMessage = new RequestDataMessage
            {
                UID = uid ?? string.Empty,
                DataType = type,
                Data = data
            };

            var requestItem = new RequestItem
            {
                Message = requestMessage,
                Tcs = new TaskCompletionSource<object>(),
                TimeoutMs = timeoutMs
            };

            RequestQueue.Add(requestItem);

            return await requestItem.Tcs.Task;
        }

        public async Task<(bool success, int? resultCode)> AddMachineAsync(string uid, string ip, int port)
        {
            SystemInfo.SerialNumber = "acwa-e8fa-65af-13df";

            var machineIp = new MachineIPInfo
            {
                UID = uid,
                IpAddress = ip,
                Port = (ushort)port
            };

            var obj = await RequestRawAsync(uid, CollectDataType.AddMachine, machineIp, 5000);

            if (obj is GetMachineStatus status)
            {
                Console.WriteLine("[AddMachine] DLL result={0}, status={1}",
                    status.result, status.MachineStatusInfo.Status);
                return (status.result == 0, status.result);
            }
            else if (obj is short s)
            {
                Console.WriteLine("[AddMachine] DLL result code={0}", s);
                return (s == 0, (int)s);
            }
            else if (obj is int i)
            {
                Console.WriteLine("[AddMachine] DLL result code={0}", i);
                return (i == 0, i);
            }

            Console.WriteLine("[AddMachine] unexpected response type: " +
                (obj == null ? "null" : obj.GetType().FullName));
            return (false, null);
        }

        public async Task<(bool success, int? resultCode)> UpdateMachineAsync(string uid, string ip, int port)
        {
            SystemInfo.SerialNumber = "acwa-e8fa-65af-13df";

            var machineIp = new MachineIPInfo
            {
                UID = uid,
                IpAddress = ip,
                Port = (ushort)port
            };

            var obj = await RequestRawAsync(uid, CollectDataType.UpdateMachine, machineIp, 5000);

            if (obj is GetMachineStatus status)
            {
                Console.WriteLine("[UpdateMachine] DLL result={0}, status={1}",
                    status.result, status.MachineStatusInfo.Status);
                return (status.result == 0, status.result);
            }
            else if (obj is short s)
            {
                Console.WriteLine("[UpdateMachine] DLL result code={0}", s);
                return (s == 0, (int)s);
            }
            else if (obj is int i)
            {
                Console.WriteLine("[UpdateMachine] DLL result code={0}", i);
                return (i == 0, i);
            }

            Console.WriteLine("[UpdateMachine] unexpected response type: " +
                (obj == null ? "null" : obj.GetType().FullName));
            return (false, null);
        }

        public async Task<List<MachineIPInfo>> GetMachineListAsync()
        {
            var obj = await RequestRawAsync(string.Empty, CollectDataType.GetMachineList, null, 5000);
            return (obj as GetMachineInfoList)?.MachineIPInfo ?? new List<MachineIPInfo>();
        }

        public static void Stop()
        {
            Cts.Cancel();
        }
    }
}
