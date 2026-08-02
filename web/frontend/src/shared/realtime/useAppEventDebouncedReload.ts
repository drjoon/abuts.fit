// related files:
// - web/frontend/src/shared/realtime/socket.ts
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/admin/support/AdminBusinessRegistrationInquiryPage.tsx
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

  useAppEventListener({
    enabled,
    eventTypes,
    shouldHandle,
    requireVisible,
    deferWhenEditing,
    onMatch: (evt) => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        void onMatch(evt);
      }, Math.max(0, Number(delayMs || 0)));
    },
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
}
