using System.IO;
using System.Security.Cryptography;
using System.Text;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin
{
    [StandardModule]
    internal sealed class License
    {
        public static string LicenseKey;

        public static string MyLic(string str)
        {
            return MD5(str, 1) + MD5(str, 16) + MD5(str, 32);
        }

        public static void LoadLicenseFile(string dir)
        {
            LicenseKey = new StreamReader(dir).ReadToEnd();
        }

        private static string MD5(string strSource, short Code)
        {
            byte[] bytes = new ASCIIEncoding().GetBytes(strSource);
            byte[] array = ((HashAlgorithm)CryptoConfig.CreateFromName("MD5")).ComputeHash(bytes);
            string text = "";
            checked
            {
                switch (Code)
                {
                case 16:
                {
                    int num = 4;
                    do
                    {
                        text += Conversion.Hex(array[num]).PadLeft(2, '0').ToLower();
                        num++;
                    }
                    while (num <= 11);
                    break;
                }
                case 32:
                {
                    int num = 0;
                    do
                    {
                        text += Conversion.Hex(array[num]).PadLeft(2, '0').ToLower();
                        num++;
                    }
                    while (num <= 15);
                    break;
                }
                default:
                {
                    int num = 0;
                    do
                    {
                        text += Conversion.Hex(array[num]).PadLeft(2, '0').ToLower();
                        num++;
                    }
                    while (num <= 15);
                    break;
                }
                }
                return text;
            }
        }
    }
}
