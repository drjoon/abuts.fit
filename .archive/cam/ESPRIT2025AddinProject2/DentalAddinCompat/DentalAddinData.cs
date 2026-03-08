using System;
using System.IO;
using System.Xml.Serialization;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject.DentalAddinCompat
{
    /// <summary>
    ///     Xml 직렬화를 단순화하기 위한 베이스 클래스.
    ///     DentalAddin 디컴파일 코드의 SerializableData와 동일한 동작을 제공한다.
    /// </summary>
    internal abstract class SerializableData
    {
        public void Save(string filename)
        {
            var tempFile = filename + ".tmp";
            if (File.Exists(tempFile))
            {
                File.Delete(tempFile);
            }

            using (var stream = new FileStream(tempFile, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                Save(stream);
            }

            if (File.Exists(filename))
            {
                File.Delete(filename);
            }

            File.Move(tempFile, filename);
        }

        public void Save(Stream stream)
        {
            var serializer = new XmlSerializer(GetType());
            serializer.Serialize(stream, this);
        }

        public static T Load<T>(string filename) where T : SerializableData, new()
        {
            if (!File.Exists(filename))
            {
                return new T();
            }

            using (var stream = new FileStream(filename, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                return Load<T>(stream);
            }
        }

        public static T Load<T>(Stream stream) where T : SerializableData
        {
            var serializer = new XmlSerializer(typeof(T));
            return (T)serializer.Deserialize(stream);
        }
    }

    /// <summary>
    ///     DentalAddin UserData 구조를 그대로 재현하여 ESPRIT 설정 파일을 읽고 쓸 수 있게 한다.
    /// </summary>
    internal sealed class DentalAddinUserData : SerializableData
    {
        private const int FileSlotCount = 16;
        private const int NumericSlotCount = 8;

        public DentalAddinUserData()
        {
            PrcFileName = new string[FileSlotCount];
            PrcFilePath = new string[FileSlotCount];
            NumData = new double[NumericSlotCount];
            NumCombobox = new int[NumericSlotCount];
        }

        public string[] PrcFileName { get; set; }

        public string[] PrcFilePath { get; set; }

        public double[] NumData { get; set; }

        public int[] NumCombobox { get; set; }

        public string PrcDirectory { get; set; } = string.Empty;

        public bool LockSetting { get; set; }

        public static DentalAddinUserData LoadFrom(string filename)
        {
            try
            {
                return Load<DentalAddinUserData>(filename);
            }
            catch
            {
                // 원본 DentalAddin도 실패 시 기본값을 사용하므로 동일하게 처리한다.
                return new DentalAddinUserData();
            }
        }

        public DentalAddinUserData Clone()
        {
            var clone = new DentalAddinUserData
            {
                PrcDirectory = PrcDirectory,
                LockSetting = LockSetting
            };

            Array.Copy(PrcFileName, clone.PrcFileName, PrcFileName.Length);
            Array.Copy(PrcFilePath, clone.PrcFilePath, PrcFilePath.Length);
            Array.Copy(NumData, clone.NumData, NumData.Length);
            Array.Copy(NumCombobox, clone.NumCombobox, NumCombobox.Length);

            return clone;
        }

        public void CopyFrom(DentalAddinUserData source)
        {
            if (source == null)
            {
                return;
            }

            Array.Copy(source.PrcFileName, PrcFileName, PrcFileName.Length);
            Array.Copy(source.PrcFilePath, PrcFilePath, PrcFilePath.Length);
            Array.Copy(source.NumData, NumData, NumData.Length);
            Array.Copy(source.NumCombobox, NumCombobox, NumCombobox.Length);
            PrcDirectory = source.PrcDirectory;
            LockSetting = source.LockSetting;
        }
    }
}
