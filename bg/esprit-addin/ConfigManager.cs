using System;
using System.IO;
using System.Xml.Serialization;

namespace DentalAddin
{
    /// <summary>
    /// 설정 파일 관리
    /// </summary>
    public static class ConfigManager
    {
        private static readonly string DefaultConfigPath = 
            @"C:\Program Files (x86)\D.P.Technology\ESPRIT\AddIns\DentalAddin\Viles\DefaultPath\Tech_Default_Path.xml";

        public static DentalConfig LoadConfig()
        {
            try
            {
                if (!File.Exists(DefaultConfigPath))
                {
                    return new DentalConfig();
                }

                using (FileStream fs = new FileStream(DefaultConfigPath, FileMode.Open))
                {
                    XmlSerializer serializer = new XmlSerializer(typeof(DentalConfig));
                    return (DentalConfig)serializer.Deserialize(fs);
                }
            }
            catch (Exception)
            {
                return new DentalConfig();
            }
        }

        public static void SaveConfig(DentalConfig config)
        {
            try
            {
                string directory = Path.GetDirectoryName(DefaultConfigPath);
                if (!Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                string tempPath = DefaultConfigPath + ".tmp";
                using (FileStream fs = new FileStream(tempPath, FileMode.Create))
                {
                    XmlSerializer serializer = new XmlSerializer(typeof(DentalConfig));
                    serializer.Serialize(fs, config);
                }

                File.Copy(tempPath, DefaultConfigPath, true);
                File.Delete(tempPath);
            }
            catch (Exception)
            {
                // 설정 저장 실패 시 무시
            }
        }
    }
}
