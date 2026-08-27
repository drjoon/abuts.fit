// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - 2026-08-28: 플로팅 패널 — 드래그·리사이즈·엣지 스냅·최소/최대화.
import { useCallback, useEffect, useRef, useState } from "react";

export type PracticeTransferPanelLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** v3 — 항상 browse-behind */
const STORAGE_KEY = "abuts.practiceTransferPanel.layout.v3";
const MARGIN = 8;
const MIN_W = 320;
const MIN_H = 360;
const MINIMIZED_H = 48;
const DEFAULT_W = 480;
const SNAP_PX = 28;
const DRAG_THRESHOLD_PX = 4;

function viewportSize() {
  if (typeof window === "undefined") {
    return { vw: 1280, vh: 800 };
  }
  return { vw: window.innerWidth, vh: window.innerHeight };
}

function defaultLayout(): PracticeTransferPanelLayout {
  const { vw, vh } = viewportSize();
  const w = Math.min(DEFAULT_W, Math.max(MIN_W, vw - MARGIN * 2));
  const h = Math.min(Math.round(vh * 0.92), Math.max(MIN_H, vh - MARGIN * 2));
  return {
    x: Math.max(MARGIN, Math.round((vw - w) / 2)),
    y: Math.max(MARGIN, Math.round((vh - h) / 2)),
    w,
    h,
  };
}

function clampLayout(
  next: PracticeTransferPanelLayout,
  opts?: { allowMinimizedHeight?: boolean },
): PracticeTransferPanelLayout {
  const { vw, vh } = viewportSize();
  const minH = opts?.allowMinimizedHeight ? MINIMIZED_H : MIN_H;
  const w = Math.min(Math.max(MIN_W, next.w), Math.max(MIN_W, vw - MARGIN * 2));
  const h = Math.min(Math.max(minH, next.h), Math.max(minH, vh - MARGIN * 2));
  const maxX = Math.max(MARGIN, vw - w - MARGIN);
  const maxY = Math.max(MARGIN, vh - h - MARGIN);
  return {
    x: Math.min(Math.max(MARGIN, Number.isFinite(next.x) ? next.x : MARGIN), maxX),
    y: Math.min(Math.max(MARGIN, Number.isFinite(next.y) ? next.y : MARGIN), maxY),
    w,
    h,
  };
}

function readStored(): PracticeTransferPanelLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PracticeTransferPanelLayout>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.w !== "number" ||
      typeof parsed.h !== "number"
    ) {
      return null;
    }
    return clampLayout({
      x: parsed.x,
      y: parsed.y,
      w: parsed.w,
      h: parsed.h,
    });
  } catch {
    return null;
  }
}

function writeStored(layout: PracticeTransferPanelLayout) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* ignore quota */
  }
}

function snapAfterDrag(
  layout: PracticeTransferPanelLayout,
): PracticeTransferPanelLayout {
  const { vw, vh } = viewportSize();
  const fullH = vh - MARGIN * 2;
  const halfW = Math.max(MIN_W, Math.round((vw - MARGIN * 2) / 2));

  if (layout.x <= SNAP_PX) {
    return clampLayout({
      ...layout,
      x: MARGIN,
      y: MARGIN,
      w: halfW,
      h: fullH,
    });
  }
  if (layout.x + layout.w >= vw - SNAP_PX) {
    return clampLayout({
      ...layout,
      x: vw - halfW - MARGIN,
      y: MARGIN,
      w: halfW,
      h: fullH,
    });
  }
  if (layout.y <= SNAP_PX) {
    return clampLayout({
      ...layout,
      y: MARGIN,
      h: fullH,
    });
  }
  return clampLayout(layout);
}

function fullscreenLayout(): PracticeTransferPanelLayout {
  const { vw, vh } = viewportSize();
  return {
    x: MARGIN,
    y: MARGIN,
    w: vw - MARGIN * 2,
    h: vh - MARGIN * 2,
  };
}

export function usePracticeTransferPanelLayout() {
  const [layout, setLayoutState] = useState<PracticeTransferPanelLayout>(() =>
    readStored() || defaultLayout(),
  );
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const restoreLayoutRef = useRef<PracticeTransferPanelLayout | null>(null);
  const minimizedRef = useRef(false);
  minimizedRef.current = minimized;

  const setLayout = useCallback(
    (
      update:
        | PracticeTransferPanelLayout
        | ((prev: PracticeTransferPanelLayout) => PracticeTransferPanelLayout),
      opts?: { persist?: boolean; allowMinimizedHeight?: boolean },
    ) => {
      const persist = opts?.persist !== false;
      setLayoutState((prev) => {
        const next = typeof update === "function" ? update(prev) : update;
        const resolved = clampLayout(next, {
          allowMinimizedHeight: opts?.allowMinimizedHeight,
        });
        if (persist && !opts?.allowMinimizedHeight) writeStored(resolved);
        return resolved;
      });
    },
    [],
  );

  useEffect(() => {
    const onResize = () => {
      if (maximized) {
        setLayout(fullscreenLayout(), { persist: false });
        return;
      }
      if (minimizedRef.current) {
        setLayout(
          (prev) => ({ ...prev, h: MINIMIZED_H }),
          { persist: false, allowMinimizedHeight: true },
        );
        return;
      }
      setLayout((prev) => clampLayout(prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [maximized, setLayout]);

  const beginHeaderDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (maximized) return;
      const start = layoutRef.current;
      const originX = clientX;
      const originY = clientY;
      let dragging = false;
      let baseX = start.x;
      let baseY = start.y;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - originX;
        const dy = ev.clientY - originY;
        if (!dragging) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          dragging = true;
          baseX = layoutRef.current.x;
          baseY = layoutRef.current.y;
          document.body.style.userSelect = "none";
          document.body.style.cursor = "grabbing";
        }
        ev.preventDefault();
        setLayout(
          {
            ...layoutRef.current,
            x: baseX + (ev.clientX - originX),
            y: baseY + (ev.clientY - originY),
          },
          {
            persist: false,
            allowMinimizedHeight: minimizedRef.current,
          },
        );
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        if (!dragging) return;
        if (minimizedRef.current) {
          setLayout(layoutRef.current, {
            persist: true,
            allowMinimizedHeight: true,
          });
          return;
        }
        setLayout(snapAfterDrag(layoutRef.current));
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [maximized, setLayout],
  );

  const beginResize = useCallback(
    (edge: "e" | "s" | "se", clientX: number, clientY: number) => {
      if (maximized || minimizedRef.current) return;
      const start = layoutRef.current;
      const originX = clientX;
      const originY = clientY;
      const baseW = start.w;
      const baseH = start.h;

      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        ev.preventDefault();
        const dx = ev.clientX - originX;
        const dy = ev.clientY - originY;
        setLayout(
          {
            ...layoutRef.current,
            w: edge === "s" ? baseW : baseW + dx,
            h: edge === "e" ? baseH : baseH + dy,
          },
          { persist: false },
        );
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.userSelect = "";
        setLayout(clampLayout(layoutRef.current));
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [maximized, setLayout],
  );

  const minimize = useCallback(() => {
    if (minimized) {
      const restored = restoreLayoutRef.current || defaultLayout();
      restoreLayoutRef.current = null;
      setMinimized(false);
      setMaximized(false);
      setLayout(restored);
      return;
    }
    restoreLayoutRef.current = { ...layoutRef.current };
    setMaximized(false);
    setMinimized(true);
    setLayout(
      (prev) => ({ ...prev, h: MINIMIZED_H }),
      { persist: false, allowMinimizedHeight: true },
    );
  }, [minimized, setLayout]);

  const toggleMaximize = useCallback(() => {
    if (maximized) {
      const restored = restoreLayoutRef.current || defaultLayout();
      restoreLayoutRef.current = null;
      setMaximized(false);
      setMinimized(false);
      setLayout(restored);
      return;
    }
    if (!minimized) {
      restoreLayoutRef.current = { ...layoutRef.current };
    }
    setMinimized(false);
    setMaximized(true);
    setLayout(fullscreenLayout(), { persist: false });
  }, [maximized, minimized, setLayout]);

  return {
    layout,
    minimized,
    maximized,
    beginHeaderDrag,
    beginResize,
    minimize,
    toggleMaximize,
  };
}
