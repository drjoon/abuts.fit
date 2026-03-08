namespace DentalAddin
{
    public class UserData : SerializableData
    {
        public string[] PrcFileName;

        public string[] PrcFilePath;

        public double[] NumData;

        public int[] NumCombobox;

        public string PrcDirectory;

        public bool LockSetting;

        public UserData()
        {
            PrcFileName = new string[11];
            PrcFilePath = new string[11];
            NumData = new double[7];
            NumCombobox = new int[7];
        }
    }
}
