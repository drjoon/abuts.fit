// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - web/backend/controllers/requests/common.review.controller.js
using System;
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
}
