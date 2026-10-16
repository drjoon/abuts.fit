// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/EspritHttpServer.cs
// - web/backend/controllers/requests/common.nc.controller.js
using System;
using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers
{
    /// <summary>
    /// 브라우저가 백엔드 프록시 없이 GET /esp 를 받을 때 쓰는 짧은 HMAC URL.
    /// </summary>
    public static class EspDownloadAuth
    {
        public static bool TryParseEspRequestId(HttpListenerRequest request, out string requestId)
        {
            requestId = null;
            string rawPath = request?.Url?.AbsolutePath ?? string.Empty;
            if (rawPath.StartsWith("/esp/", StringComparison.OrdinalIgnoreCase))
            {
                requestId = rawPath.Substring("/esp/".Length);
            }
            else if (string.Equals(rawPath.TrimEnd('/'), "/esp", StringComparison.OrdinalIgnoreCase))
            {
                requestId = request.QueryString["requestId"];
            }
            else
            {
                return false;
            }

            try
            {
                requestId = Uri.UnescapeDataString(requestId ?? string.Empty).Trim().Trim('/');
            }
            catch
            {
                requestId = (requestId ?? string.Empty).Trim().Trim('/');
            }

            return !string.IsNullOrWhiteSpace(EspFileArchive.SanitizeRequestId(requestId));
        }

        public static bool IsValidDownloadToken(HttpListenerRequest request, string requestId)
        {
            string safeId = EspFileArchive.SanitizeRequestId(requestId);
            if (string.IsNullOrWhiteSpace(safeId))
            {
                return false;
            }

            string expRaw = (request?.QueryString["exp"] ?? string.Empty).Trim();
            string sig = (request?.QueryString["sig"] ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(expRaw) || string.IsNullOrEmpty(sig))
            {
                return false;
            }

            if (!long.TryParse(expRaw, out long expUnix))
            {
                return false;
            }

            long nowUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (expUnix < nowUnix)
            {
                return false;
            }

            string secret = (AppConfig.GetBridgeSecret() ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(secret))
            {
                return false;
            }

            string payload = safeId + ":" + expRaw;
            string expected = ComputeSig(secret, payload);
            return FixedTimeEquals(expected, sig);
        }

        public static string ComputeSig(string secret, string payload)
        {
            using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret)))
            {
                byte[] hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload ?? string.Empty));
                return Base64UrlEncode(hash);
            }
        }

        private static string Base64UrlEncode(byte[] data)
        {
            return Convert.ToBase64String(data)
                .TrimEnd('=')
                .Replace('+', '-')
                .Replace('/', '_');
        }

        private static bool FixedTimeEquals(string a, string b)
        {
            if (a == null || b == null || a.Length != b.Length)
            {
                return false;
            }

            int diff = 0;
            for (int i = 0; i < a.Length; i++)
            {
                diff |= a[i] ^ b[i];
            }
            return diff == 0;
        }
    }
}
