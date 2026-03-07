using System;
using System.Threading;
using System.Threading.Tasks;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject
{
    internal static class EspritUiDispatcher
    {
        private static SynchronizationContext _context;
        private static int _contextThreadId;

        public static void Initialize(SynchronizationContext context)
        {
            if (context == null)
            {
                return;
            }

            _context = context;
            _contextThreadId = Thread.CurrentThread.ManagedThreadId;
        }

        public static bool IsInitialized => _context != null;

        private static bool IsOnUiThread => IsInitialized && Thread.CurrentThread.ManagedThreadId == _contextThreadId;

        public static void Run(Action action)
        {
            if (action == null)
            {
                return;
            }

            if (!IsInitialized || IsOnUiThread)
            {
                action();
                return;
            }

            Exception captured = null;
            using (var evt = new ManualResetEventSlim(false))
            {
                _context.Post(_ =>
                {
                    try
                    {
                        action();
                    }
                    catch (Exception ex)
                    {
                        captured = ex;
                    }
                    finally
                    {
                        evt.Set();
                    }
                }, null);

                evt.Wait();
            }

            if (captured != null)
            {
                throw new InvalidOperationException("UI dispatch failed", captured);
            }
        }

        public static Task RunAsync(Action action)
        {
            if (action == null)
            {
                return Task.CompletedTask;
            }

            if (!IsInitialized || IsOnUiThread)
            {
                action();
                return Task.CompletedTask;
            }

            var tcs = new TaskCompletionSource<object>();
            _context.Post(_ =>
            {
                try
                {
                    action();
                    tcs.TrySetResult(null);
                }
                catch (Exception ex)
                {
                    tcs.TrySetException(ex);
                }
            }, null);
            return tcs.Task;
        }

        public static Task RunAsync(Func<Task> func)
        {
            if (func == null)
            {
                return Task.CompletedTask;
            }

            if (!IsInitialized || IsOnUiThread)
            {
                return func();
            }

            var tcs = new TaskCompletionSource<object>();
            _context.Post(async _ =>
            {
                try
                {
                    await func().ConfigureAwait(false);
                    tcs.TrySetResult(null);
                }
                catch (Exception ex)
                {
                    tcs.TrySetException(ex);
                }
            }, null);
            return tcs.Task;
        }
    }
}
