// related files:
// - web/frontend/src/shared/realtime/socket.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/admin/support/AdminBusinessRegistrationInquiryPage.tsx
import { useEffect, useMemo, useRef } from "react";
import { AppEventMessage, onAppEvent } from "@/shared/realtime/socket";

type UseAppEventDebouncedReloadOptions = {
  enabled?: boolean;
  eventTypes: string[];
  delayMs?: number;
  shouldHandle?: (evt: AppEventMessage) => boolean;
  onMatch: (evt: AppEventMessage) => void | Promise<void>;
};

export function useAppEventDebouncedReload({
  enabled = true,
  eventTypes,
  delayMs = 160,
  shouldHandle,
  onMatch,
}: UseAppEventDebouncedReloadOptions) {
  const timerRef = useRef<number | null>(null);
  const eventTypesKey = useMemo(
    () =>
      (Array.isArray(eventTypes) ? eventTypes : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean)
        .join("|"),
    [eventTypes],
  );

  useEffect(() => {
    if (!enabled) return;

    const normalizedEventTypes = eventTypesKey
      ? eventTypesKey.split("|").filter(Boolean)
      : [];
    const typeSet = new Set(normalizedEventTypes);
    if (typeSet.size === 0) return;

    const unsubscribe = onAppEvent((evt) => {
      const type = String(evt?.type || "").trim();
      if (!typeSet.has(type)) return;
      if (shouldHandle && !shouldHandle(evt)) return;

      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        void onMatch(evt);
      }, Math.max(0, Number(delayMs || 0)));
    });

    return () => {
      unsubscribe?.();
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [delayMs, enabled, eventTypesKey, onMatch, shouldHandle]);
}
