// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - 2026-08-28: 플로팅 패널 — 드래그·리사이즈·엣지 스냅·최소/최대화.
// - 2026-08-31: 헤더 — 신호등 제거 후에도 탭·닫기 여유 폭 유지(MIN_W 400).
// - 2026-08-28: MIN_W — 신호등·탭(의뢰상세/채팅)·별점이 겹치지 않게 400.
// - 2026-08-28: 리사이즈 — 좌·상·모서리(n/w/nw/ne/sw) 지원, 고정 변 기준 min clamp.
// - 2026-08-28: 좌·우 엣지 스냅 — 가로 절반이 아니라 MIN_W 유지(세로만 full).
// - 2026-08-28: 좁은 뷰포트 — MIN_W가 화면보다 커도 오른쪽 잘리지 않게 maxW로 clamp.
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
/** TabsList(의뢰 상세/채팅) + 닫기·액션이 한 줄에 겹치지 않는 최소 폭 */
const MIN_W = 400;
const MIN_H = 360;
const MINIMIZED_H = 48;
const DEFAULT_W = 480;
const SNAP_PX = 28;
const DRAG_THRESHOLD_PX = 4;
/** useIsMobile(768)과 맞춤 — 좁으면 인셋 풀스크린 */
const NARROW_VW = 768;

function viewportSize() {
  if (typeof window === "undefined") {
    return { vw: 1280, vh: 800 };
  }
  return { vw: window.innerWidth, vh: window.innerHeight };
}

/** 가용 폭을 넘지 않는 최소 폭(모바일에서 MIN_W=400 오버플로 방지) */
function effectiveMinW(vw: number) {
  const maxW = Math.max(1, vw - MARGIN * 2);
  return Math.min(MIN_W, maxW);
}

function defaultLayout(): PracticeTransferPanelLayout {
  const { vw, vh } = viewportSize();
  if (vw < NARROW_VW) return fullscreenLayout();
  const minW = effectiveMinW(vw);
  const maxW = Math.max(1, vw - MARGIN * 2);
  const w = Math.min(DEFAULT_W, Math.max(minW, maxW));
  const maxH = Math.max(1, vh - MARGIN * 2);
  const minH = Math.min(MIN_H, maxH);
  const h = Math.min(Math.round(vh * 0.92), Math.max(minH, maxH));
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
  const maxW = Math.max(1, vw - MARGIN * 2);
  const maxH = Math.max(1, vh - MARGIN * 2);
  const minW = effectiveMinW(vw);
  const minH = Math.min(
    opts?.allowMinimizedHeight ? MINIMIZED_H : MIN_H,
    maxH,
  );
  const w = Math.min(Math.max(minW, next.w), maxW);
  const h = Math.min(Math.max(minH, next.h), maxH);
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
  const fullH = Math.max(1, vh - MARGIN * 2);
  const dockW = effectiveMinW(vw);

  if (layout.x <= SNAP_PX) {
    return clampLayout({
      ...layout,
      x: MARGIN,
      y: MARGIN,
      w: dockW,
      h: fullH,
    });
  }
  if (layout.x + layout.w >= vw - SNAP_PX) {
    return clampLayout({
      ...layout,
      x: vw - dockW - MARGIN,
      y: MARGIN,
      w: dockW,
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
      const { vw } = viewportSize();
      if (maximized || vw < NARROW_VW) {
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
    onResize();
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
    (
      edge: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw",
      clientX: number,
      clientY: number,
    ) => {
      if (maximized || minimizedRef.current) return;
      const start = layoutRef.current;
      const originX = clientX;
      const originY = clientY;
      const baseX = start.x;
      const baseY = start.y;
      const baseW = start.w;
      const baseH = start.h;
      const right = baseX + baseW;
      const bottom = baseY + baseH;
      const fromW = edge.includes("w");
      const fromE = edge.includes("e");
      const fromN = edge.includes("n");
      const fromS = edge.includes("s");

      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        ev.preventDefault();
        const dx = ev.clientX - originX;
        const dy = ev.clientY - originY;
        let x = baseX;
        let y = baseY;
        let w = baseW;
        let h = baseH;

        if (fromW) {
          x = baseX + dx;
          w = right - x;
        } else if (fromE) {
          w = baseW + dx;
        }
        if (fromN) {
          y = baseY + dy;
          h = bottom - y;
        } else if (fromS) {
          h = baseH + dy;
        }

        const { vw, vh } = viewportSize();
        const minW = effectiveMinW(vw);
        const minH = Math.min(MIN_H, Math.max(1, vh - MARGIN * 2));
        if (w < minW) {
          w = minW;
          if (fromW) x = right - minW;
        }
        if (h < minH) {
          h = minH;
          if (fromN) y = bottom - minH;
        }

        setLayout({ x, y, w, h }, { persist: false });
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
