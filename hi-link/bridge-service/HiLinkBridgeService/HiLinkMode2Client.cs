using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using Hi_Link;
using Hi_Link.Libraries.Model;
using Hi_Link_Advanced;
using Hi_Link_Advanced.LinkBridge;
using Hi_Link_Advanced.EdgeBridge;

namespace HiLinkBridgeService
{
    /// <summary>
    /// Hi-Link Mode2 DLL의 RequestFIFO / ResponseFIFO 패턴을 감싼 헬퍼.
    /// 한 번에 하나의 요청만 보낸다는 가정 하에, UID + CollectDataType 이 일치하는
    /// 응답을 받을 때까지 ResponseFIFO 를 polling 합니다.
    /// </summary>
    public class HiLinkMode2Client : IDisposable
    {
        private static readonly SemaphoreSlim RequestLock = new(1, 1);

        public async Task<object> RequestAsync(
            string uid,
            CollectDataType type,
            object? data,
            int timeoutMilliseconds = 3000,
            CancellationToken cancellationToken = default)
        {
            if (timeoutMilliseconds <= 0)
                throw new ArgumentOutOfRangeException(nameof(timeoutMilliseconds));

            await RequestLock.WaitAsync(cancellationToken).ConfigureAwait(false);

            try
            {
                var request = new RequestDataMessage
                {
                    UID = uid,
                    DataType = type,
                    Data = data
                };

                // 요청 enqueue
                MessageHandler.RequestFIFO.Enqueue(request);

                var sw = Stopwatch.StartNew();

                while (sw.ElapsedMilliseconds < timeoutMilliseconds)
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    if (MessageHandler.ResponseFIFO.Count > 0)
                    {
                        if (MessageHandler.ResponseFIFO.Dequeue() is ResponseDataMessage response)
                        {
                            // UID + DataType 이 일치하는 응답만 반환
                            if (response.UID == uid && response.DataType == type)
                            {
                                return (object?)response.Data!;
                            }

                            // 그 외 응답은 현재 서버에서는 별도 처리하지 않고 무시
                        }
                    }

                    try
                    {
                        await Task.Delay(10, cancellationToken).ConfigureAwait(false);
                    }
                    catch (TaskCanceledException)
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                    }
                }

                // 타임아웃 시 null 반환 (상위 레벨에서 에러 처리)
                return (object?)null!;
            }
            finally
            {
                RequestLock.Release();
            }
        }

        public List<MachineIPInfo> GetMachineList()
        {
            var obj = RequestAsync(string.Empty, CollectDataType.GetMachineList, null, 5000).Result;
            return (obj as GetMachineInfoList)?.MachineIPInfo ?? new List<MachineIPInfo>();
        }

        public bool AddMachine(string uid, string ip, int port)
        {
            var machineIp = new MachineIPInfo { UID = uid, IpAddress = ip, Port = (ushort)port };
            var obj = RequestAsync(uid, CollectDataType.AddMachine, machineIp, 5000).Result;
            return (obj as GetMachineStatus)?.result == 0;
        }

        public string ParseMachineStatus(object? data)
        {
            if (data is GetMachineStatus status)
            {
                return status.MachineStatusInfo.Status.ToString();
            }
            return "Unknown";
        }

        public void Dispose()
        {
            // 현재는 DLL 쪽에서 별도의 명시적 해제가 필요하지 않다고 가정.
            // 추후 리소스 정리가 필요해지면 여기서 처리.
        }
    }
}