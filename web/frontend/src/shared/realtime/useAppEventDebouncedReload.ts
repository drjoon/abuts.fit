// related files:
// - web/frontend/src/shared/realtime/socket.ts
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/admin/support/AdminBusinessRegistrationInquiryPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - 2026-08-20: onMatch/shouldHandle를 ref로 호출 — debounce timer가 stale closure로
//   환자명·기공소를 예전에 잡아 draft 파일 동기화를 건너뛰지 않게 한다.
import { useEffect, useRef } from "react";
import { AppEventMessage } from "@/shared/realtime/socket";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";

type UseAppEventDebouncedReloadOptions = {
  enabled?: boolean;
  eventTypes: string[];
  delayMs?: number;
  shouldHandle?: (evt: AppEventMessage) => boolean;
  onMatch: (evt: AppEventMessage) => void | Promise<void>;
  requireVisible?: boolean;
  deferWhenEditing?: boolean;
};

// 공통 디바운스 훅은 "무플리커 업데이트"를 전제로 사용한다.
// - onMatch에서 가능하면 부분 patch를 우선
// - 불가피한 재조회도 섹션 단위/무로딩(silent)으로 제한
export function useAppEventDebouncedReload({
  enabled = true,
  eventTypes,
  delayMs = 160,
  shouldHandle,
  onMatch,
  requireVisible = true,
  deferWhenEditing = true,
}: UseAppEventDebouncedReloadOptions) {
  const timerRef = useRef<number | null>(null);
  const enabledRef = useRef(Boolean(enabled));
  const onMatchRef = useRef(onMatch);
  const shouldHandleRef = useRef(shouldHandle);

  enabledRef.current = Boolean(enabled);
  onMatchRef.current = onMatch;
  shouldHandleRef.current = shouldHandle;

  useAppEventListener({
    enabled,
    eventTypes,
    shouldHandle: (evt) => {
      if (!shouldHandleRef.current) return true;
      return shouldHandleRef.current(evt);
    },
    requireVisible,
    deferWhenEditing,
    onMatch: (evt) => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        if (!enabledRef.current) return;
        void onMatchRef.current(evt);
      }, Math.max(0, Number(delayMs || 0)));
    },
  });

  useEffect(() => {
    if (enabled) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
}
