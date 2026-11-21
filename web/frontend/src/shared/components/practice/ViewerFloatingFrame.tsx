// 작업영역 위 패널. 헤더([data-snap-drag])로 옮기고, 가장자리로 크기를 바꾼다.
// 놓으면 창 귀퉁이·다른 패널에 창 여백(VIEWER_PANEL_EDGE)을 두고 붙는다.
// 펼치면 내용 높이까지 창을 키운다. 작업영역보다 길 때만 스크롤한다.
import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/shared/ui/cn";
import {
  VIEWER_PANEL_EDGE,
  VIEWER_RESIZE_HANDLES,
  placeViewerPanel,
  readPeerRects,
  type ViewerResizeEdge,
} from "@/shared/components/practice/DesignShareChatPanel";

type Corner = "nw" | "ne" | "sw" | "se";
type FrameBox = { x: number; y: number; w: number; h: number; corner: Corner | null };

type Props = {
  boundsRef: RefObject<HTMLElement | null>;
  peerRefs?: readonly RefObject<HTMLElement | null>[];
  panelRef?: RefObject<HTMLElement | null>;
  minW: number;
  minH: number;
  /** 내용이 접히면 높이만 내용에 맞춘다. 자리·가로는 유지한다. */
  hugContent?: boolean;
  /** 한 번도 옮기지 않았을 때의 자리. */
  anchorClassName: string;
  className?: string;
  children: ReactNode;
};

export function ViewerFloatingFrame({
  boundsRef,
  peerRefs = [],
  panelRef,
  minW,
  minH,
  hugContent = false,
  anchorClassName,
  className,
  children,
}: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<null | { ox: number; oy: number; x: number; y: number; moved: boolean }>(null);
  const resizeRef = useRef<null | {
    edge: ViewerResizeEdge;
    x: number;
    y: number;
    l: number;
    t: number;
    w: number;
    h: number;
    moved: boolean;
    next: { x: number; y: number; w: number; h: number };
  }>(null);
  const [box, setBox] = useState<FrameBox | null>(null);
  const [moving, setMoving] = useState(false);
  const boxRef = useRef(box);
  boxRef.current = box;
  /** 펼친 높이. 접힌 뒤에도 유지한다. */
  const openHeightRef = useRef(0);
  /** 접힌 막대의 아래 변. */
  const dockBottomRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  /** 사용자가 내용보다 크게 늘린 높이. 없으면 내용에 맞춘다. */
  const userHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const bounds = boundsRef.current;
    if (!bounds) return;
    const apply = () => {
      const current = boxRef.current;
      if (!current?.corner) return;
      const area = bounds.getBoundingClientRect();
      const height = frameRef.current?.offsetHeight ?? current.h;
      const placed = placeViewerPanel(
        current.corner === "nw" || current.corner === "sw" ? VIEWER_PANEL_EDGE : area.width,
        current.corner === "nw" || current.corner === "ne" ? VIEWER_PANEL_EDGE : area.height,
        area.width,
        area.height,
        current.w,
        height,
        true,
        [],
      );
      setBox((prev) => {
        if (!prev || prev.corner !== current.corner) return prev;
        if (prev.x === placed.x && prev.y === placed.y) return prev;
        return { ...prev, x: placed.x, y: placed.y };
      });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bounds);
    return () => observer.disconnect();
  }, [boundsRef, box?.corner, box?.w]);

  useLayoutEffect(() => {
    const boundsEl = boundsRef.current;
    const content = contentRef.current;
    if (!boundsEl || !content) return;
    let passes = 0;
    const fit = () => {
      if (passes >= 4) return;
      const panel = frameRef.current;
      if (!panel) return;
      if (hugContent || resizeRef.current || dragRef.current) {
        if (hugContent && !dragRef.current) {
          const bounds = boundsEl.getBoundingClientRect();
          const top = boxRef.current?.y ?? panel.getBoundingClientRect().top - bounds.top;
          dockBottomRef.current = top + panel.offsetHeight;
        }
        return;
      }
      const bounds = boundsEl.getBoundingClientRect();
      const contentH = content.offsetHeight;
      if (contentH < 1) return;
      const maxH = Math.max(minH, bounds.height - VIEWER_PANEL_EDGE * 2);
      const fitted = Math.min(contentH, maxH);
      const preferred = userHeightRef.current;
      const height = Math.min(maxH, Math.max(fitted, preferred ?? 0));
      const prev = boxRef.current;
      let y = prev?.y ?? panel.getBoundingClientRect().top - bounds.top;
      const dock = dockBottomRef.current;
      if (dock != null) {
        const nearBottom = bounds.height - dock <= y + 48;
        if (nearBottom) y = dock - height;
        dockBottomRef.current = null;
      }
      const maxY = Math.max(VIEWER_PANEL_EDGE, bounds.height - height - VIEWER_PANEL_EDGE);
      y = Math.min(Math.max(y, VIEWER_PANEL_EDGE), maxY);
      const w = prev?.w ?? panel.offsetWidth;
      const x = prev?.x ?? panel.getBoundingClientRect().left - bounds.left;
      if (
        prev &&
        Math.abs(prev.h - height) < 1 &&
        Math.abs(prev.y - y) < 1 &&
        Math.abs(prev.w - w) < 1 &&
        Math.abs(prev.x - x) < 1
      ) {
        return;
      }
      passes += 1;
      openHeightRef.current = height;
      setBox({ x, y, w, h: height, corner: prev?.corner ?? null });
    };
    fit();
    if (hugContent) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(content);
    observer.observe(boundsEl);
    return () => observer.disconnect();
  }, [boundsRef, hugContent, minH]);

  const readBox = () => {
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = frameRef.current?.getBoundingClientRect();
    if (!bounds || !panel) return null;
    return {
      x: panel.left - bounds.left,
      y: panel.top - bounds.top,
      w: panel.width,
      h: panel.height,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (!target.closest("[data-snap-drag]")) return;
    if (target.closest("button, input, textarea, a, [role='separator']")) return;
    const current = readBox();
    if (!current) return;
    dragRef.current = {
      ox: event.clientX - (boundsRef.current?.getBoundingClientRect().left ?? 0) - current.x,
      oy: event.clientY - (boundsRef.current?.getBoundingClientRect().top ?? 0) - current.y,
      x: current.x,
      y: current.y,
      moved: false,
    };
    if (!hugContent) openHeightRef.current = current.h;
    setBox((prev) => ({
      x: current.x,
      y: current.y,
      w: current.w,
      h: hugContent
        ? Math.max(prev?.h ?? 0, openHeightRef.current) || current.h
        : current.h,
      corner: null,
    }));
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = frameRef.current;
    if (!drag || !bounds || !panel) return;
    const rawX = event.clientX - bounds.left - drag.ox;
    const rawY = event.clientY - bounds.top - drag.oy;
    if (!drag.moved && Math.hypot(rawX - drag.x, rawY - drag.y) < 4) return;
    drag.moved = true;
    drag.x = rawX;
    drag.y = rawY;
    const placed = placeViewerPanel(
      rawX,
      rawY,
      bounds.width,
      bounds.height,
      panel.offsetWidth,
      panel.offsetHeight,
      false,
      [],
    );
    setMoving(true);
    setBox((prev) =>
      prev
        ? { ...prev, x: placed.x, y: placed.y, corner: null }
        : { x: placed.x, y: placed.y, w: panel.offsetWidth, h: panel.offsetHeight, corner: null },
    );
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setMoving(false);
    if (!drag?.moved) return;
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = frameRef.current;
    if (!bounds || !panel) return;
    const peers = readPeerRects(bounds, peerRefs, panel);
    const placed = placeViewerPanel(
      drag.x,
      drag.y,
      bounds.width,
      bounds.height,
      panel.offsetWidth,
      panel.offsetHeight,
      true,
      peers,
    );
    setBox((prev) =>
      prev
        ? {
            ...prev,
            ...placed,
            h: hugContent ? Math.max(prev.h, openHeightRef.current) : prev.h,
          }
        : { ...placed, w: panel.offsetWidth, h: panel.offsetHeight },
    );
  };

  const onResizeDown = (edge: ViewerResizeEdge) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const current = readBox();
    if (!current) return;
    resizeRef.current = {
      edge,
      x: event.clientX,
      y: event.clientY,
      l: current.x,
      t: current.y,
      w: current.w,
      h: current.h,
      moved: false,
      next: { x: current.x, y: current.y, w: current.w, h: current.h },
    };
    setBox({ x: current.x, y: current.y, w: current.w, h: current.h, corner: null });
    setMoving(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizeMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = resizeRef.current;
    const bounds = boundsRef.current?.getBoundingClientRect();
    if (!drag || !bounds) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;
    drag.moved = true;
    const maxW = Math.max(minW, bounds.width - VIEWER_PANEL_EDGE * 2);
    const maxH = Math.max(minH, bounds.height - VIEWER_PANEL_EDGE * 2);
    let left = drag.l;
    let top = drag.t;
    let width = drag.w;
    let height = drag.h;
    const growWest = drag.edge.includes("w");
    const growEast = drag.edge.includes("e");
    const growNorth = drag.edge.includes("n");
    const growSouth = drag.edge.includes("s");
    if (growEast) width = drag.w + dx;
    if (growWest) {
      width = drag.w - dx;
      left = drag.l + dx;
    }
    if (growSouth) height = drag.h + dy;
    if (growNorth) {
      height = drag.h - dy;
      top = drag.t + dy;
    }
    width = Math.min(Math.max(width, Math.min(minW, maxW)), maxW);
    const contentH = contentRef.current?.offsetHeight ?? 0;
    const floor = contentH > 0 ? Math.min(contentH, maxH) : Math.min(minH, maxH);
    height = Math.min(Math.max(height, floor), maxH);
    if (growWest) left = drag.l + (drag.w - width);
    if (growNorth) top = drag.t + (drag.h - height);
    left = Math.min(Math.max(left, VIEWER_PANEL_EDGE), Math.max(VIEWER_PANEL_EDGE, bounds.width - width - VIEWER_PANEL_EDGE));
    top = Math.min(Math.max(top, VIEWER_PANEL_EDGE), Math.max(VIEWER_PANEL_EDGE, bounds.height - height - VIEWER_PANEL_EDGE));
    drag.next = { x: left, y: top, w: width, h: height };
    setBox({ x: left, y: top, w: width, h: height, corner: null });
  };

  const onResizeUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = resizeRef.current;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setMoving(false);
    if (!drag?.moved) return;
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = frameRef.current;
    if (!bounds || !panel) return;
    const peers = readPeerRects(bounds, peerRefs, panel);
    const placed = placeViewerPanel(
      drag.next.x,
      drag.next.y,
      bounds.width,
      bounds.height,
      drag.next.w,
      drag.next.h,
      true,
      peers,
    );
    const contentH = contentRef.current?.offsetHeight ?? 0;
    const maxH = Math.max(minH, bounds.height - VIEWER_PANEL_EDGE * 2);
    const floor = contentH > 0 ? Math.min(contentH, maxH) : minH;
    const height = Math.min(Math.max(drag.next.h, floor), maxH);
    if (height > contentH + 1) userHeightRef.current = height;
    setBox({ ...placed, w: drag.next.w, h: height });
  };

  const floated = box != null;
  return (
    <div
      ref={(node) => {
        frameRef.current = node;
        if (panelRef) panelRef.current = node;
      }}
      className={cn(
        "pointer-events-auto absolute z-20 flex min-h-0 flex-col overflow-x-hidden overflow-y-auto",
        !floated && anchorClassName,
        floated && !moving && "transition-[left,top] duration-200 ease-out",
        hugContent && "h-auto",
        className,
      )}
      style={
        floated
          ? {
              left: box.x,
              top: box.y,
              width: box.w,
              height: hugContent ? "auto" : box.h,
              right: "auto",
              bottom: "auto",
            }
          : undefined
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={contentRef} className="flex w-full shrink-0 flex-col">
        {children}
      </div>
      {VIEWER_RESIZE_HANDLES.map((handle) => (
        <div
          key={handle.edge}
          role="separator"
          aria-label="패널 크기"
          className={cn("absolute z-10 touch-none", handle.className)}
          onPointerDown={onResizeDown(handle.edge)}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
        />
      ))}
    </div>
  );
}
