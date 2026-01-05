using System;
using System.Collections.Generic;
using System.IO;
using HiLinkBridgeWebApi48.Models;
using Newtonsoft.Json;

namespace HiLinkBridgeWebApi48
{
    public static class MachinesConfigStore
    {
        private static readonly object LockObj = new object();
        private static readonly string ConfigPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "machines.json");

        public static List<MachineConfigItem> Load()
        {
            lock (LockObj)
            {
                try
                {
                    if (!File.Exists(ConfigPath))
                    {
                        return new List<MachineConfigItem>();
                    }

                    var json = File.ReadAllText(ConfigPath);
                    var list = JsonConvert.DeserializeObject<List<MachineConfigItem>>(json);
                    return list ?? new List<MachineConfigItem>();
                }
                catch
                {
                    return new List<MachineConfigItem>();
                }
            }
        }

        public static void Save(List<MachineConfigItem> machines)
        {
            lock (LockObj)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(ConfigPath) ?? AppDomain.CurrentDomain.BaseDirectory);
                var json = JsonConvert.SerializeObject(machines ?? new List<MachineConfigItem>(), Formatting.Indented);
                File.WriteAllText(ConfigPath, json);
            }
        }

        public static MachineConfigItem Upsert(string uid, string ip, int port)
        {
            lock (LockObj)
            {
                var list = Load();
                var item = new MachineConfigItem { uid = uid, ip = ip, port = port };
                var index = list.FindIndex(m => m != null && m.uid == uid);
                if (index >= 0)
                {
                    list[index] = item;
                }
                else
                {
                    list.Add(item);
                }
                Save(list);
                return item;
            }
        }

        public static bool Delete(string uid)
        {
            lock (LockObj)
            {
                var list = Load();
                var removed = list.RemoveAll(m => m != null && m.uid == uid) > 0;
                if (removed)
                {
                    Save(list);
                }
                return removed;
            }
        }
    }
}
