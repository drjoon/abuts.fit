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
        // backend snapshot raw kind (e.g., "file", "requested_file", "dummy")
        public string kindRaw { get; set; }
        public string machineId { get; set; }

        public int qty { get; set; }

        // file job
        public string fileName { get; set; }
        // backend SSOT: canonical filename (filePath). job.fileName may be normalized like O####.nc
        public string originalFileName { get; set; }
        public string bridgePath { get; set; }
        public string s3Key { get; set; }
        public string s3Bucket { get; set; }
        public long? fileSize { get; set; }
        public string contentType { get; set; }
        public string requestId { get; set; }
        // 자동 가공 신호를 보내도 되는지 (가공 페이지 업로드 등)
        public bool allowAutoStart { get; set; }

        // 큐 우선순위: 1(장비페이지) > 2(가공페이지)
        public int priority { get; set; }

        // dummy job
        public int? programNo { get; set; }
        public string programName { get; set; }

        public DateTime createdAtUtc { get; set; }

        public string source { get; set; }

        public bool paused { get; set; }
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

        public static CncJobItem EnqueueFileBack(string machineId, string fileName, string requestId, string originalFileName = null, bool allowAutoStart = true)
        {
            var job = new CncJobItem
            {
                id = Guid.NewGuid().ToString("N"),
                kind = CncJobKind.File,
                kindRaw = "file",
                machineId = (machineId ?? string.Empty).Trim(),
                qty = 1,
                fileName = fileName,
                originalFileName = string.IsNullOrWhiteSpace(originalFileName) ? fileName : originalFileName,
                requestId = requestId,
                allowAutoStart = allowAutoStart,
                priority = 2,
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



        // 파일을 '끼워넣기': 현재 진행 중 작업이 끝나면 바로 다음으로 실행되도록 큐의 앞에 넣는다.
        public static CncJobItem EnqueueFileFront(string machineId, string fileName, string requestId, string originalFileName = null, bool allowAutoStart = true)
        {
            var job = new CncJobItem
            {
                id = Guid.NewGuid().ToString("N"),
                kind = CncJobKind.File,
                kindRaw = "file",
                machineId = (machineId ?? string.Empty).Trim(),
                qty = 1,
                fileName = fileName,
                originalFileName = string.IsNullOrWhiteSpace(originalFileName) ? fileName : originalFileName,
                requestId = requestId,
                allowAutoStart = allowAutoStart,
                priority = 2,
                createdAtUtc = DateTime.UtcNow,
                source = "bridge_insert"
            };

            var q = GetQueue(job.machineId);
            lock (GetLock(job.machineId))
            {
                q.AddFirst(job);
            }
            return job;
        }

        public static void ReplaceQueue(string machineId, System.Collections.Generic.IEnumerable<CncJobItem> jobs)
        {
            var mid = (machineId ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(mid)) return;

            var q = GetQueue(mid);
            lock (GetLock(mid))
            {
                q.Clear();
                if (jobs == null) return;
                foreach (var j in jobs)
                {
                    if (j == null) continue;
                    q.AddLast(j);
                }
            }
        }

        // 더미는 '끼워넣기': 현재 진행 중 작업이 끝나면 바로 다음으로 실행되도록 큐의 앞에 넣는다.
        public static CncJobItem EnqueueDummyFront(string machineId, int programNo, string programName)
        {
            var job = new CncJobItem
            {
                id = Guid.NewGuid().ToString("N"),
                kind = CncJobKind.Dummy,
                kindRaw = "dummy",
                machineId = (machineId ?? string.Empty).Trim(),
                qty = 1,
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
                if (v != null && v.qty > 1)
                {
                    v.qty = Math.Max(1, v.qty - 1);
                    return new CncJobItem
                    {
                        id = v.id,
                        kind = v.kind,
                        machineId = v.machineId,
                        qty = 1,
                        fileName = v.fileName,
                        originalFileName = v.originalFileName,
                        bridgePath = v.bridgePath,
                        s3Key = v.s3Key,
                        s3Bucket = v.s3Bucket,
                        requestId = v.requestId,
                        allowAutoStart = v.allowAutoStart,
                        priority = v.priority,
                        programNo = v.programNo,
                        programName = v.programName,
                        createdAtUtc = v.createdAtUtc,
                        source = v.source,
                        paused = v.paused,
                    };
                }

                q.RemoveFirst();
                if (v != null && v.qty <= 0) v.qty = 1;
                return v;
            }
        }

        public static bool TrySetPaused(string machineId, string jobId, bool paused, out CncJobItem updated)
        {
            updated = null;
            var mid = (machineId ?? string.Empty).Trim();
            var jid = (jobId ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(mid) || string.IsNullOrEmpty(jid)) return false;

            var q = GetQueue(mid);
            lock (GetLock(mid))
            {
                foreach (var job in q)
                {
                    if (job == null) continue;
                    if (!string.Equals(job.id, jid, StringComparison.OrdinalIgnoreCase)) continue;
                    job.paused = paused;
                    updated = job;
                    return true;
                }
            }
            return false;
        }

        public static bool TrySetQty(string machineId, string jobId, int qty, out CncJobItem updated)
        {
            updated = null;
            var mid = (machineId ?? string.Empty).Trim();
            var jid = (jobId ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(mid) || string.IsNullOrEmpty(jid)) return false;

            var q = GetQueue(mid);
            lock (GetLock(mid))
            {
                foreach (var job in q)
                {
                    if (job == null) continue;
                    if (!string.Equals(job.id, jid, StringComparison.OrdinalIgnoreCase)) continue;

                    job.qty = Math.Max(1, qty);
                    updated = job;
                    return true;
                }
            }
            return false;
        }

        public static List<CncJobItem> Reorder(string machineId, IList<string> order)
        {
            var mid = (machineId ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(mid)) return new List<CncJobItem>();

            var q = GetQueue(mid);
            lock (GetLock(mid))
            {
                var current = q.ToList();
                var map = new Dictionary<string, CncJobItem>(StringComparer.OrdinalIgnoreCase);
                foreach (var j in current)
                {
                    if (j == null || string.IsNullOrEmpty(j.id)) continue;
                    if (!map.ContainsKey(j.id)) map[j.id] = j;
                }

                var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var rebuilt = new List<CncJobItem>();
                if (order != null)
                {
                    foreach (var id in order)
                    {
                        var key = (id ?? string.Empty).Trim();
                        if (string.IsNullOrEmpty(key)) continue;
                        if (map.TryGetValue(key, out var job) && job != null)
                        {
                            rebuilt.Add(job);
                            used.Add(key);
                        }
                    }
                }

                foreach (var j in current)
                {
                    if (j == null || string.IsNullOrEmpty(j.id)) continue;
                    if (used.Contains(j.id)) continue;
                    rebuilt.Add(j);
                }

                q.Clear();
                foreach (var j in rebuilt)
                {
                    q.AddLast(j);
                }

                return q.ToList();
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

        public static bool TryRemove(string machineId, string jobId)
        {
            var mid = (machineId ?? string.Empty).Trim();
            var jid = (jobId ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(mid) || string.IsNullOrEmpty(jid)) return false;

            var q = GetQueue(mid);
            lock (GetLock(mid))
            {
                if (q.Count == 0) return false;
                var node = q.First;
                while (node != null)
                {
                    if (node.Value != null && string.Equals(node.Value.id, jid, StringComparison.OrdinalIgnoreCase))
                    {
                        q.Remove(node);
                        return true;
                    }
                    node = node.Next;
                }
                return false;
            }
        }
    }
}
