using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;

namespace HiLinkBridgeWebApi48
{
    public enum CncJobKind
    {
        File,
        Dummy
    }

    public class CncJobItem
    {
        public string id { get; set; }
        public CncJobKind kind { get; set; }
        public string machineId { get; set; }

        // file job
        public string fileName { get; set; }
        public string bridgePath { get; set; }
        public string requestId { get; set; }

        // dummy job
        public int? programNo { get; set; }
        public string programName { get; set; }

        public DateTime createdAtUtc { get; set; }

        public string source { get; set; }
    }

    public static class CncJobQueue
    {
        private static readonly ConcurrentDictionary<string, LinkedList<CncJobItem>> Queues
            = new ConcurrentDictionary<string, LinkedList<CncJobItem>>(StringComparer.OrdinalIgnoreCase);

        private static readonly ConcurrentDictionary<string, object> Locks
            = new ConcurrentDictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        private static object GetLock(string machineId)
        {
            return Locks.GetOrAdd(machineId ?? string.Empty, _ => new object());
        }

        private static LinkedList<CncJobItem> GetQueue(string machineId)
        {
            return Queues.GetOrAdd(machineId ?? string.Empty, _ => new LinkedList<CncJobItem>());
        }

        public static CncJobItem EnqueueFileBack(string machineId, string fileName, string requestId)
        {
            var job = new CncJobItem
            {
                id = Guid.NewGuid().ToString("N"),
                kind = CncJobKind.File,
                machineId = (machineId ?? string.Empty).Trim(),
                fileName = fileName,
                requestId = requestId,
                createdAtUtc = DateTime.UtcNow,
                source = "cam_approve"
            };

            var q = GetQueue(job.machineId);
            lock (GetLock(job.machineId))
            {
                q.AddLast(job);
            }
            return job;
        }

        // 더미는 '끼워넣기': 현재 진행 중 작업이 끝나면 바로 다음으로 실행되도록 큐의 앞에 넣는다.
        public static CncJobItem EnqueueDummyFront(string machineId, int programNo, string programName)
        {
            var job = new CncJobItem
            {
                id = Guid.NewGuid().ToString("N"),
                kind = CncJobKind.Dummy,
                machineId = (machineId ?? string.Empty).Trim(),
                programNo = programNo,
                programName = programName,
                createdAtUtc = DateTime.UtcNow,
                source = "dummy_schedule"
            };

            var q = GetQueue(job.machineId);
            lock (GetLock(job.machineId))
            {
                q.AddFirst(job);
            }
            return job;
        }

        public static CncJobItem Peek(string machineId)
        {
            var q = GetQueue(machineId);
            lock (GetLock(machineId))
            {
                return q.First != null ? q.First.Value : null;
            }
        }

        public static CncJobItem Pop(string machineId)
        {
            var q = GetQueue(machineId);
            lock (GetLock(machineId))
            {
                if (q.First == null) return null;
                var v = q.First.Value;
                q.RemoveFirst();
                return v;
            }
        }

        public static List<CncJobItem> Snapshot(string machineId)
        {
            var q = GetQueue(machineId);
            lock (GetLock(machineId))
            {
                return q.ToList();
            }
        }

        public static Dictionary<string, List<CncJobItem>> SnapshotAll(int maxPerMachine = 50)
        {
            var result = new Dictionary<string, List<CncJobItem>>(StringComparer.OrdinalIgnoreCase);
            foreach (var kv in Queues)
            {
                var machineId = kv.Key;
                var q = kv.Value;
                lock (GetLock(machineId))
                {
                    result[machineId] = q.Take(Math.Max(0, maxPerMachine)).ToList();
                }
            }
            return result;
        }

        public static void Clear(string machineId)
        {
            var q = GetQueue(machineId);
            lock (GetLock(machineId))
            {
                q.Clear();
            }
        }
    }
}
