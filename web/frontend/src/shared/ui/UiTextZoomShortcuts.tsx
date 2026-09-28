import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  UI_TEXT_ZOOM_CHANGE_EVENT,
  UI_TEXT_ZOOM_DEFAULT,
  UI_TEXT_ZOOM_STEPS,
  announceUiTextZoom,
  applyUiTextZoom,
  readStoredUiTextZoom,
  resolveUiTextZoomShortcut,
  stepZoom,
  storeUiTextZoom,
} from "@/shared/ui/uiTextZoom";

const INDICATOR_VISIBLE_MS = 1200;

/**
 * Alt+− 축소 · Alt+= 확대 · Alt+0 기본. 앱 루트에 한 번만 둔다.
 * 화면별 확대율을 가진 화면은 capture 단계에서 먼저 처리하고 preventDefault 하므로 여기선 건너뛴다.
 */
export function UiTextZoomShortcuts() {
  const [indicatorZoom, setIndicatorZoom] = useState<number | null>(null);
  const hideTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    applyUiTextZoom(readStoredUiTextZoom());

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const shortcut = resolveUiTextZoomShortcut(e);
      if (!shortcut) return;
      e.preventDefault();
      const next = stepZoom(
        UI_TEXT_ZOOM_STEPS,
        readStoredUiTextZoom(),
        shortcut,
        UI_TEXT_ZOOM_DEFAULT,
      );
      storeUiTextZoom(next);
      applyUiTextZoom(next);
      announceUiTextZoom(next);
    };

    const onAnnounce = (e: Event) => {
      const zoom = Number((e as CustomEvent<number>).detail);
      if (!Number.isFinite(zoom)) return;
      setIndicatorZoom(zoom);
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(
        () => setIndicatorZoom(null),
        INDICATOR_VISIBLE_MS,
      );
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(UI_TEXT_ZOOM_CHANGE_EVENT, onAnnounce);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(UI_TEXT_ZOOM_CHANGE_EVENT, onAnnounce);
      window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (indicatorZoom == null) return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-4 z-[400] -translate-x-1/2 rounded-full bg-slate-900/85 px-4 py-1.5 text-sm font-medium tabular-nums text-white shadow-lg"
    >
      글꼴 {Math.round(indicatorZoom * 100)}%
    </div>,
    document.body,
  );
}
