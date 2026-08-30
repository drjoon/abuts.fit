// related files:
// - bg/pc1/esprit-addin/EspritHttpServer.cs
// - bg/pc1/esprit-addin/Helpers/BackendApiClient.cs
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleOperations.cs
// - bg/pc1/esprit-addin/rules.md
// change-log:
// - 2026-08-29: 현재 실행 중 requestId + ThrowIfCurrentCancelled — 단계 사이 즉시 중단.
// - 2026-08-29: CAM 생성 중단(requestId) — 큐 제거·업로드 스킵용 취소 레지스트리.
using System;
using System.Collections.Generic;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers
{
    /// <summary>
    /// 프론트/백엔드 CAM 생성 중단 요청을 Esprit 큐·업로드·공정 단계에 전달한다.
    /// </summary>
    public static class NcJobCancellation
    {
        private static readonly object Gate = new object();
        private static readonly HashSet<string> Cancelled = new HashSet<string>(
            StringComparer.OrdinalIgnoreCase
        );
        private static string _currentRequestId;

        public static void SetCurrent(string requestId)
        {
            var id = (requestId ?? string.Empty).Trim();
            lock (Gate)
            {
                _currentRequestId = string.IsNullOrEmpty(id) ? null : id;
            }
        }

        public static void ClearCurrent()
        {
            lock (Gate)
            {
                _currentRequestId = null;
            }
        }

        public static string CurrentRequestId
        {
            get
            {
                lock (Gate)
                {
                    return _currentRequestId;
                }
            }
        }

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

        public static bool IsCurrentCancelled()
        {
            lock (Gate)
            {
                if (string.IsNullOrEmpty(_currentRequestId)) return false;
                return Cancelled.Contains(_currentRequestId);
            }
        }

        /// <summary>
        /// 현재 CAM 작업이 중단됐으면 OperationCanceledException을 던진다.
        /// TryAddOperation·OperationSeq 단계 경계에서 호출한다.
        /// </summary>
        public static void ThrowIfCurrentCancelled(string stage = null)
        {
            if (!IsCurrentCancelled()) return;
            var id = CurrentRequestId ?? "";
            var label = string.IsNullOrWhiteSpace(stage) ? "CAM" : stage.Trim();
            throw new OperationCanceledException(
                $"CAM generation cancelled for {id} at {label}"
            );
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
