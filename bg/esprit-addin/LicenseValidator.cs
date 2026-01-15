using System;
using System.IO;
using System.Text;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Engines;
using Org.BouncyCastle.Security;

namespace DentalAddin
{
    /// <summary>
    /// 라이선스 검증 모듈
    /// </summary>
    public static class LicenseValidator
    {
        private const string PublicKey = "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAlOeFqFI7jcX5ysWh1soF18ReY6sUdTnNrvHkr1KDZ6BWVC1yw8Vm0Oy+dleiI4gwLUUKsVudi7NxShzCaoVzetcRI2mH5VNI5u1gwDQc1Jtwzg0zzFWOBRSBDZ3gb/vgVCLFVaFat2Mr1p8PSC3na6Ea3MuOIrveBIe5TCZvqN6S4hxdIH7t1t11LdwgoerrxDYpvcXqwlVhsdHT1okOpVV5I/QxS1D70UvQx4qkaOVmj+vBLXXp7HgPQgNKZgmszbYfd32yLV+CV2BekkHQLYvVgmhVGb0tpQixsS9euiOVIY2TtHOwOKsVmCrgONgACXzQFcmHYnjKy5K0EPxPmh/7wnB82s1jifqNokpkKH3L+ZqCDqKw8XVixcs0iiTTt0ia6KpqXGy0qyk43wRvnRrO3uZ9fN1cdKbW0ElkBJGdfOxnL7MYNofnGRMJpmJHXHJLGU3YrdrGdIu/E8KQ8tY2BULYEioORw9uchJGpnLjf/d1bn+VqTmhfFgjolci5OhxzpBZNWaVGmTZ142AfJ2OljbI1N9aRg5aNgQ9ZHh6JTArgun5rHYWRXcE/N+6jMNkeTIAo3H7kAaqh9HJgz5NtS5yc3Ju0hwcgEvMRCFYpvqNLYnxN0Ne7dXLF5YoryS2Aiy/zALDMW/+Zq8LRf1N3y5lIsDK/+0JBnqHEe8CAwEAAQ==";

        public static bool ValidateLicense(string espritPath, string customerCode, string serialNumber)
        {
            try
            {
                string licenseFile = Path.Combine(espritPath, "AddIns", "DentalAddin", $"{serialNumber}.Lic");

                if (!File.Exists(licenseFile))
                {
                    return false;
                }

                string encryptedData = File.ReadAllText(licenseFile);
                string decryptedData = DecryptWithPublicKey(PublicKey, encryptedData);

                if (string.IsNullOrEmpty(decryptedData))
                {
                    return false;
                }

                string[] parts = decryptedData.Split('|');
                if (parts.Length < 2)
                {
                    return false;
                }

                string innerEncrypted = parts[0];
                string innerKey = parts[1];
                string innerDecrypted = DecryptWithPublicKey(innerKey, innerEncrypted);

                string[] innerParts = innerDecrypted.Split('|');
                if (innerParts.Length < 3)
                {
                    return false;
                }

                string licCustomerCode = innerParts[0];
                string licSerialNumber = innerParts[1];
                string expiryDateStr = innerParts[2];

                bool customerMatch = string.Equals(licCustomerCode, customerCode, StringComparison.OrdinalIgnoreCase);
                bool serialMatch = string.Equals(licSerialNumber, serialNumber, StringComparison.OrdinalIgnoreCase);

                DateTime expiryDate;
                if (!DateTime.TryParse(expiryDateStr, out expiryDate))
                {
                    return false;
                }

                bool notExpired = DateTime.Now < expiryDate;

                return customerMatch && serialMatch && notExpired;
            }
            catch (Exception)
            {
                return false;
            }
        }

        private static string DecryptWithPublicKey(string publicKeyBase64, string encryptedDataBase64)
        {
            try
            {
                AsymmetricKeyParameter publicKey = PublicKeyFactory.CreateKey(Convert.FromBase64String(publicKeyBase64));
                byte[] encryptedBytes = Convert.FromBase64String(encryptedDataBase64);

                RsaEngine engine = new RsaEngine();
                engine.Init(false, publicKey);

                byte[] decryptedBytes = engine.ProcessBlock(encryptedBytes, 0, encryptedBytes.Length);
                return Encoding.UTF8.GetString(decryptedBytes);
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}
