// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/DentalLogger.cs
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - bg/pc1/esprit-addin/Logging/AppLogger.cs
using System;
using System.Diagnostics;

namespace DentalAddin
{
    /// <summary>
    /// CAM 공정 구간 성능 측정. 로그에 START/END/elapsedMs를 남겨 before/after 비교용.
    /// </summary>
    internal sealed class PerfScope : IDisposable
    {
        private readonly string _name;
        private readonly Stopwatch _sw;
        private bool _disposed;

        private PerfScope(string name)
        {
            _name = name ?? "unnamed";
            _sw = Stopwatch.StartNew();
            DentalLogger.Log($"[PERF] {_name} START");
        }

        public static PerfScope Measure(string name)
        {
            return new PerfScope(name);
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }
            _disposed = true;
            _sw.Stop();
            DentalLogger.Log($"[PERF] {_name} END elapsedMs={_sw.ElapsedMilliseconds}");
        }
    }
}
