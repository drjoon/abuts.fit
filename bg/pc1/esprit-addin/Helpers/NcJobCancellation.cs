// related files:
// - bg/pc1/esprit-addin/EspritHttpServer.cs
// - bg/pc1/esprit-addin/Helpers/BackendApiClient.cs
// - bg/pc1/esprit-addin/rules.md
// change-log:
// - 2026-08-29: CAM 생성 중단(requestId) — 큐 제거·업로드 스킵용 취소 레지스트리.
using System;
using System.Collections.Generic;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers
{
    /// <summary>
    /// 프론트/백엔드 CAM 생성 중단 요청을 Esprit 큐·업로드 경로에 전달한다.
    /// </summary>
    public static class NcJobCancellation
    {
        private static readonly object Gate = new object();
        private static readonly HashSet<string> Cancelled = new HashSet<string>(
            StringComparer.OrdinalIgnoreCase
        );

        public static void MarkCancelled(string requestId)
        {
            var id = (requestId ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(id)) return;
            lock (Gate)
            {
                Cancelled.Add(id);
            }
        }

        public static bool IsCancelled(string requestId)
        {
            var id = (requestId ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(id)) return false;
            lock (Gate)
            {
                return Cancelled.Contains(id);
            }
        }

        public static void Clear(string requestId)
        {
            var id = (requestId ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(id)) return;
            lock (Gate)
            {
                Cancelled.Remove(id);
            }
        }
    }
}
