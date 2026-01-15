using System;
using System.Xml.Serialization;

namespace DentalAddin
{
    /// <summary>
    /// 덴탈 애드인 설정 데이터
    /// </summary>
    [Serializable]
    public class DentalConfig
    {
        public string[] PrcFileName { get; set; }
        public string[] PrcFilePath { get; set; }
        public double[] NumData { get; set; }
        public int[] NumCombobox { get; set; }
        public string PrcDirectory { get; set; }
        public bool LockSetting { get; set; }

        public DentalConfig()
        {
            PrcFileName = new string[11];
            PrcFilePath = new string[11];
            NumData = new double[7];
            NumCombobox = new int[7];
            PrcDirectory = @"C:\Program Files (x86)\D.P.Technology\ESPRIT\AddIns\DentalAddin\";
        }
    }
}
