using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;

namespace HiLinkBridgeWebApi48
{
    internal static class Mode1WorkerQueue
    {
        private class WorkItem
        {
            public Func<object> Func { get; set; }
            public TaskCompletionSource<object> Tcs { get; set; }
            public int TimeoutMs { get; set; }
            public string Tag { get; set; }
        }

        private static BlockingCollection<WorkItem> _queue = new BlockingCollection<WorkItem>();
        private static CancellationTokenSource _cts = new CancellationTokenSource();
        private static Thread _workerThread = null;
        private static readonly object _lock = new object();
        private static volatile bool _isRestarting = false;
        private static int _workerThreadId = 0;

        static Mode1WorkerQueue()
        {
            EnsureWorkerStarted();
        }

        private static void EnsureWorkerStarted()
        {
            lock (_lock)
            {
                if (_workerThread != null && _workerThread.IsAlive) return;
                
                Console.WriteLine("[Mode1WorkerQueue] Starting worker thread...");
                _workerThread = new Thread(ProcessQueue)
                {
                    IsBackground = true,
                    Name = "Mode1WorkerQueue"
                };
                _workerThread.Start();
            }
        }

        private static void ProcessQueue()
        {
            try
            {
                Console.WriteLine("[Mode1WorkerQueue] Worker thread started.");
                Interlocked.Exchange(ref _workerThreadId, Thread.CurrentThread.ManagedThreadId);
                while (!_cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        if (!_queue.TryTake(out var item, 100, _cts.Token))
                        {
                            continue;
                        }

                        try
                        {
                            var sw = System.Diagnostics.Stopwatch.StartNew();
                            Console.WriteLine($"[Mode1WorkerQueue] {item.Tag} processing. queueSize={_queue.Count}");

                            object result = null;
                            try
                            {
                                result = item.Func();
                            }
                            catch (Exception ex)
                            {
                                sw.Stop();
                                Console.WriteLine($"[Mode1WorkerQueue] {item.Tag} exception. elapsedMs={sw.ElapsedMilliseconds} error={ex.Message}");
                                item.Tcs.TrySetException(ex);
                                continue;
                            }

                            sw.Stop();
                            Console.WriteLine($"[Mode1WorkerQueue] {item.Tag} completed. elapsedMs={sw.ElapsedMilliseconds}");
                            item.Tcs.TrySetResult(result);
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine($"[Mode1WorkerQueue] Worker exception: {ex}");
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[Mode1WorkerQueue] Worker fatal exception: {ex}");
            }
            finally
            {
                Interlocked.Exchange(ref _workerThreadId, 0);
                Console.WriteLine("[Mode1WorkerQueue] Worker thread exited.");
            }
        }

        private static bool IsWorkerThread()
        {
            var tid = Interlocked.CompareExchange(ref _workerThreadId, 0, 0);
            return tid != 0 && tid == Thread.CurrentThread.ManagedThreadId;
        }

        public static T Run<T>(Func<T> func, string tag, int timeoutMs = 5000)
        {
            // 워커 스레드 내부에서 재진입 호출이 발생하면 큐에 넣지 않고 즉시 실행한다.
            // (큐에 다시 넣으면 자기 자신이 소비해야 하므로 데드락)
            if (IsWorkerThread())
            {
                return func();
            }

            // 재시작 중이면 대기
            while (_isRestarting)
            {
                Thread.Sleep(10);
            }

            EnsureWorkerStarted();

            var item = new WorkItem
            {
                Func = () => func(),
                Tcs = new TaskCompletionSource<object>(),
                TimeoutMs = timeoutMs,
                Tag = tag
            };

            try
            {
                _queue.Add(item);
            }
            catch (InvalidOperationException)
            {
                // 큐가 닫혀있으면 재시작 후 재시도
                RestartWorker();
                _queue.Add(item);
            }

            try
            {
                if (!item.Tcs.Task.Wait(timeoutMs))
                {
                    Console.WriteLine($"[Mode1WorkerQueue] {tag} timeout. waitMs={timeoutMs}");
                    RestartWorker();
                    throw new TimeoutException($"Mode1 operation timeout: {tag} ({timeoutMs}ms)");
                }
                var result = item.Tcs.Task.Result;
                return (T)result;
            }
            catch (AggregateException ex)
            {
                throw ex.InnerException ?? ex;
            }
        }

        private static void RestartWorker()
        {
            lock (_lock)
            {
                if (_isRestarting) return;
                _isRestarting = true;

                try
                {
                    try
                    {
                        _cts.Cancel();
                        _cts.Dispose();
                    }
                    catch { }

                    try
                    {
                        _queue.CompleteAdding();
                        _queue.Dispose();
                    }
                    catch { }

                    // 워커 스레드 종료 대기 (최대 1초)
                    if (_workerThread != null && _workerThread.IsAlive)
                    {
                        _workerThread.Join(1000);
                    }

                    _cts = new CancellationTokenSource();
                    _queue = new BlockingCollection<WorkItem>();
                    _workerThread = null;
                    
                    Console.WriteLine("[Mode1WorkerQueue] Starting worker thread...");
                    _workerThread = new Thread(ProcessQueue)
                    {
                        IsBackground = true,
                        Name = "Mode1WorkerQueue"
                    };
                    _workerThread.Start();
                }
                finally
                {
                    _isRestarting = false;
                }
            }
        }

        public static void Stop()
        {
            lock (_lock)
            {
                try { _queue.CompleteAdding(); } catch { }
                try { _cts.Cancel(); } catch { }
                if (_workerThread != null && _workerThread.IsAlive)
                {
                    _workerThread.Join(2000);
                }
            }
        }
    }
}
