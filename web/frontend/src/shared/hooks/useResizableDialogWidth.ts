// related files:
// - web/frontend/src/shared/components/practice/PracticeProsthesisFollowUpDialog.tsx
// - 2026-09-01: 중앙 정렬 Dialog — 좌·우 드래그로 가로폭 조절(4~8칸 보철물 카드 연동).
import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  storageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  viewportMargin?: number;
};

const DEFAULT_OPTIONS = {
  storageKey: "abuts.resizableDialog.width.v1",
  defaultWidth: 672,
  minWidth: 400,
  viewportMargin: 16,
} as const;

function clampDialogWidth(
  width: number,
  minWidth: number,
  viewportMargin: number,
) {
  const maxW = Math.max(minWidth, window.innerWidth - viewportMargin * 2);
  return Math.min(maxW, Math.max(minWidth, Math.round(width)));
}

export function useResizableDialogWidth(open: boolean, options: Options = {}) {
  const {
    storageKey,
    defaultWidth,
    minWidth,
    viewportMargin,
  } = { ...DEFAULT_OPTIONS, ...options };

  const [width, setWidth] = useState(defaultWidth);
  const widthRef = useRef(width);
  widthRef.current = width;

  const clamp = useCallback(
    (next: number) => clampDialogWidth(next, minWidth, viewportMargin),
    [minWidth, viewportMargin],
  );

  useEffect(() => {
    if (!open) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const stored = Number(raw);
      if (Number.isFinite(stored) && stored >= minWidth) {
        setWidth(clamp(stored));
        return;
      }
    } catch {
      /* ignore */
    }
    setWidth(clamp(defaultWidth));
  }, [open, storageKey, defaultWidth, minWidth, clamp]);

  useEffect(() => {
    if (!open) return;
    const onWindowResize = () => {
      setWidth((prev) => clamp(prev));
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, [open, clamp]);

  const persistWidth = useCallback(
    (next: number) => {
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const beginHorizontalResize = useCallback(
    (edge: "e" | "w", clientX: number) => {
      const startW = widthRef.current;
      const originX = clientX;

      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        ev.preventDefault();
        const dx = ev.clientX - originX;
        const delta = edge === "e" ? dx : -dx;
        setWidth(clamp(startW + delta));
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.userSelect = "";
        persistWidth(widthRef.current);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clamp, persistWidth],
  );

  return { width, beginHorizontalResize };
}
