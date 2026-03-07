using System;

namespace DentalAddin
{
    internal static class PatientContext
    {
        public static double MaxDiameter { get; private set; } = 0;
        public static double ConnectionDiameter { get; private set; } = 0;
        public static string WorkType { get; private set; } = "";
        public static string LotNumber { get; private set; } = "";
        public static double[] NumData { get; private set; }
        public static int[] NumCombobox { get; private set; }

        public static void SetFromRequest(NcGenerationRequest req)
        {
            if (req == null) return;
            MaxDiameter = req.MaxDiameter;
            ConnectionDiameter = req.ConnectionDiameter;
            WorkType = req.WorkType;
            LotNumber = req.LotNumber;
            NumData = req.NumData;
            NumCombobox = req.NumCombobox;
        }
    }
}