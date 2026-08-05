// related files:
// - web/frontend/rules.md
// - web/frontend/websocket-realtime-update-checklist.md
// - web/frontend/src/shared/realtime/socket.ts
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
import { useEffect, useMemo, useRef } from "react";
import { AppEventMessage, onAppEvent } from "@/shared/realtime/socket";

type UseAppEventListenerOptions = {
  enabled?: boolean;
  eventTypes?: string[];
  shouldHandle?: (evt: AppEventMessage) => boolean;
  onMatch: (evt: AppEventMessage) => void | Promise<void>;
  requireVisible?: boolean;
  deferWhenEditing?: boolean;
};

// 웹소켓 실시간 업데이트 공통 가드:
// - requireVisible: 활성 탭에서만 반영
// - deferWhenEditing: 입력 중 반영 지연(작업 비간섭)
// - 원칙: 페이지는 이벤트 수신 시 전체 리로드/전체 reset 대신
//   payload 조건 기반 부분 patch 또는 최소 범위 재조회로 반영한다.
const isDocumentVisible = () => {
  if (typeof document === "undefined") return true;
  if (document.hidden) return false;
  return document.visibilityState === "visible";
};

const isEditingActiveElement = () => {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    const type = String(el.type || "").toLowerCase();
    // checkbox/radio/file 등은 공동 작성 동기화 지연 원인이 되므로 입력 중으로 보지 않는다.
    if (
      type === "button" ||
      type === "submit" ||
      type === "reset" ||
      type === "checkbox" ||
      type === "radio" ||
      type === "file" ||
      type === "hidden"
    ) {
      return false;
    }
    return true;
  }
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLElement) {
    if (el.isContentEditable) return true;
    if (el.getAttribute("contenteditable") === "true") return true;
    if (el.closest("[contenteditable='true']")) return true;
  }
  return false;
};

export function useAppEventListener({
  enabled = true,
  eventTypes,
  shouldHandle,
  onMatch,
  requireVisible = true,
  deferWhenEditing = true,
}: UseAppEventListenerOptions) {
  const onMatchRef = useRef(onMatch);
  const shouldHandleRef = useRef(shouldHandle);
  const queueRef = useRef<AppEventMessage[]>([]);

  onMatchRef.current = onMatch;
  shouldHandleRef.current = shouldHandle;

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

    const canApplyNow = () => {
      if (requireVisible && !isDocumentVisible()) return false;
      if (deferWhenEditing && isEditingActiveElement()) return false;
      return true;
    };

    const flushQueued = () => {
      if (!canApplyNow()) return;
      if (queueRef.current.length === 0) return;
      const queued = [...queueRef.current];
      queueRef.current = [];
      queued.forEach((queuedEvt) => {
        void onMatchRef.current(queuedEvt);
      });
    };

    const unsubscribe = onAppEvent((evt) => {
      const type = String(evt?.type || "").trim();
      if (typeSet.size > 0 && !typeSet.has(type)) return;
      if (shouldHandleRef.current && !shouldHandleRef.current(evt)) return;

      if (!canApplyNow()) {
        queueRef.current.push(evt);
        return;
      }

      void onMatchRef.current(evt);
    });

    const onVisibilityChange = () => flushQueued();
    const onFocusChange = () => flushQueued();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocusChange);
      window.addEventListener("blur", onFocusChange);
    }

    const interval = window.setInterval(flushQueued, 180);

    return () => {
      unsubscribe?.();
      window.clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocusChange);
        window.removeEventListener("blur", onFocusChange);
      }
      queueRef.current = [];
    };
  }, [deferWhenEditing, enabled, eventTypesKey, requireVisible]);
}
