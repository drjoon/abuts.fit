using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Xml.Serialization;

namespace DentalAddin
{
    public class SerializableData
    {
        public void Save(string filename)
        {
            string text = filename + ".tmp";
            FileInfo fileInfo = new FileInfo(text);
            if (fileInfo.Exists)
            {
                fileInfo.Delete();
            }
            FileStream fileStream = new FileStream(text, FileMode.Create);
            Save(fileStream);
            fileStream.Close();
            fileInfo.CopyTo(filename, overwrite: true);
            fileInfo.Delete();
        }

        public void Save(Stream stream)
        {
            //IL_0006: Unknown result type (might be due to invalid IL or missing references)
            new XmlSerializer(GetType()).Serialize(stream, (object)this);
        }

        public static object Load(string filename, Type newType)
        {
            if (!new FileInfo(filename).Exists)
            {
                return Activator.CreateInstance(newType);
            }
            FileStream fileStream = new FileStream(filename, FileMode.Open);
            object objectValue = RuntimeHelpers.GetObjectValue(Load(fileStream, newType));
            fileStream.Close();
            return objectValue;
        }

        public static object Load(Stream stream, Type newType)
        {
            //IL_0001: Unknown result type (might be due to invalid IL or missing references)
            return RuntimeHelpers.GetObjectValue(new XmlSerializer(newType).Deserialize(stream));
        }
    }
}
