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

        private static readonly BlockingCollection<WorkItem> Queue = new BlockingCollection<WorkItem>();
        private static readonly CancellationTokenSource Cts = new CancellationTokenSource();
        private static int _workerStarted = 0;

        static Mode1WorkerQueue()
        {
            EnsureWorkerStarted();
        }

        private static void EnsureWorkerStarted()
        {
            if (Interlocked.Exchange(ref _workerStarted, 1) == 1) return;
            Console.WriteLine("[Mode1WorkerQueue] Starting worker thread...");
            Task.Factory.StartNew(ProcessQueue, Cts.Token, TaskCreationOptions.LongRunning, TaskScheduler.Default);
        }

        private static void ProcessQueue()
        {
            try
            {
                Console.WriteLine("[Mode1WorkerQueue] Worker thread started.");
                foreach (var item in Queue.GetConsumingEnumerable(Cts.Token))
                {
                    try
                    {
                        var sw = System.Diagnostics.Stopwatch.StartNew();
                        Console.WriteLine($"[Mode1WorkerQueue] {item.Tag} queued. queueSize={Queue.Count}");

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
            }
            catch (OperationCanceledException)
            {
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[Mode1WorkerQueue] Worker fatal exception: {ex}");
            }
        }

        public static T Run<T>(Func<T> func, string tag, int timeoutMs = 5000)
        {
            EnsureWorkerStarted();

            var item = new WorkItem
            {
                Func = () => func(),
                Tcs = new TaskCompletionSource<object>(),
                TimeoutMs = timeoutMs,
                Tag = tag
            };

            Queue.Add(item);

            try
            {
                if (!item.Tcs.Task.Wait(timeoutMs))
                {
                    Console.WriteLine($"[Mode1WorkerQueue] {tag} timeout. waitMs={timeoutMs}");
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

        public static void Stop()
        {
            try { Queue.CompleteAdding(); } catch { }
            try { Cts.Cancel(); } catch { }
        }
    }
}
