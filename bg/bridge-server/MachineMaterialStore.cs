using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace HiLinkBridgeWebApi48
{
    public class MachineMaterialItem
    {
        public string machineId { get; set; }
        public string materialType { get; set; }
        public string heatNo { get; set; }
        public double diameter { get; set; }
        public string diameterGroup { get; set; }
        public double? remainingLength { get; set; }
        public DateTime? setAtUtc { get; set; }
    }

    public static class MachineMaterialStore
    {
        private static readonly object LockObj = new object();
        private static bool Loaded = false;
        private static readonly string ConfigPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "materials.json");
        private static readonly Dictionary<string, MachineMaterialItem> Map = new Dictionary<string, MachineMaterialItem>(StringComparer.OrdinalIgnoreCase);

        private static void EnsureLoaded()
        {
            if (Loaded) return;
            lock (LockObj)
            {
                if (Loaded) return;
                try
                {
                    if (File.Exists(ConfigPath))
                    {
                        var json = File.ReadAllText(ConfigPath);
                        var list = JsonConvert.DeserializeObject<List<MachineMaterialItem>>(json) ?? new List<MachineMaterialItem>();
                        foreach (var it in list)
                        {
                            if (it == null) continue;
                            var key = (it.machineId ?? string.Empty).Trim();
                            if (string.IsNullOrEmpty(key)) continue;
                            Map[key] = it;
                        }
                    }
                }
                catch
                {
                    // ignore
                }
                finally
                {
                    Loaded = true;
                }
            }
        }

        private static void SaveUnsafe()
        {
            try
            {
                var list = new List<MachineMaterialItem>();
                foreach (var kv in Map)
                {
                    if (kv.Value != null) list.Add(kv.Value);
                }
                var json = JsonConvert.SerializeObject(list, Formatting.Indented);
                File.WriteAllText(ConfigPath, json);
            }
            catch
            {
                // ignore
            }
        }

        public static MachineMaterialItem Upsert(MachineMaterialItem item)
        {
            if (item == null) return null;
            var key = (item.machineId ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(key)) return null;

            EnsureLoaded();
            lock (LockObj)
            {
                Map[key] = item;
                SaveUnsafe();
                return item;
            }
        }

        public static MachineMaterialItem Get(string machineId)
        {
            EnsureLoaded();
            var key = (machineId ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(key)) return null;
            lock (LockObj)
            {
                return Map.ContainsKey(key) ? Map[key] : null;
            }
        }

        public static Dictionary<string, MachineMaterialItem> Snapshot()
        {
            EnsureLoaded();
            lock (LockObj)
            {
                var copy = new Dictionary<string, MachineMaterialItem>(StringComparer.OrdinalIgnoreCase);
                foreach (var kv in Map)
                {
                    copy[kv.Key] = kv.Value;
                }
                return copy;
            }
        }
    }
}
