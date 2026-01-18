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
