// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - web/backend/controllers/requests/common.review.controller.js
// change-log:
// - 2026-08-29: PerfScope를 DentalLogger.cs에 병합(별도 파일 누락 시 Windows 빌드 CS2001 방지).
using System;
using System.Diagnostics;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;

namespace DentalAddin
{
    internal static class DentalLogger
    {
        public static void Log(string message)
        {
            AppLogger.Log($"DentalAddin: {message}");
        }

        public static PerfScope Measure(string name)
        {
            return PerfScope.Measure(name);
        }

        public static void LogException(string context, Exception exception)
        {
            if (exception == null)
            {
                return;
            }

            string prefix = string.IsNullOrWhiteSpace(context) ? "DentalAddin Exception" : $"DentalAddin Exception [{context}]";
            AppLogger.Log($"{prefix}\n{exception}");
        }
    }

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
