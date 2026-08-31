// change-log:
// - 2026-08-31: 이미지 프리뷰 공통 — 휠·버튼 줌(화면 중앙 기준)·드래그 이동.
// related files:
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/features/chat/components/MessageAttachment.tsx
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;

type Pan = { x: number; y: number };

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export type ZoomableImagePreviewProps = {
  src: string;
  alt?: string;
  className?: string;
  /** absolute inset-0로 부모를 채움(ModelPreviewDialog 등) */
  fill?: boolean;
  showControls?: boolean;
};

/**
 * 이미지 확대/축소·이동. 줌은 항상 화면(뷰포트) 중앙 기준 —
 * 줌할 때 이미지 가운데가 화면 가운데에 오도록 pan을 리셋한다.
 */
export function ZoomableImagePreview({
  src,
  alt = "",
  className,
  fill = false,
  showControls = true,
}: ZoomableImagePreviewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  /** 줌 시 pan=0 → 이미지 중심 = 화면 중심 */
  const applyZoom = useCallback(
    (nextScaleRaw: number | ((prev: number) => number)) => {
      setScale((prevScale) => {
        const target =
          typeof nextScaleRaw === "function"
            ? nextScaleRaw(prevScale)
            : nextScaleRaw;
        return clampScale(target);
      });
      setPan({ x: 0, y: 0 });
    },
    [],
  );

  useEffect(() => {
    resetView();
  }, [src, resetView]);

  // React onWheel is often passive; attach non-passive so preventDefault stops page scroll.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY > 0 ? -1 : 1;
      applyZoom((prev) => prev + direction * ZOOM_STEP);
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [applyZoom]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (scale <= MIN_SCALE) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: pan.x,
        originY: pan.y,
      };
      setDragging(true);
    },
    [pan.x, pan.y, scale],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setPan({
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY),
      });
    },
    [],
  );

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
  }, []);

  const onDoubleClick = useCallback(() => {
    if (scale > MIN_SCALE) {
      resetView();
      return;
    }
    applyZoom(2);
  }, [applyZoom, resetView, scale]);

  const canZoomOut = scale > MIN_SCALE + 0.001;
  const canZoomIn = scale < MAX_SCALE - 0.001;

  return (
    <div
      className={cn(
        "bg-black/5",
        fill
          ? "absolute inset-0"
          : "relative h-[min(70vh,560px)] w-full overflow-hidden rounded-lg",
        className,
      )}
    >
      <div
        ref={viewportRef}
        className={cn(
          "absolute inset-0 touch-none overflow-hidden p-3",
          scale > MIN_SCALE
            ? dragging
              ? "cursor-grabbing"
              : "cursor-grab"
            : "cursor-zoom-in",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
      >
        <div className="flex h-full w-full items-center justify-center">
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="max-h-full max-w-full select-none object-contain"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "center center",
              transition: dragging ? "none" : "transform 80ms ease-out",
            }}
          />
        </div>
      </div>

      {showControls ? (
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-md">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => applyZoom((prev) => prev - ZOOM_STEP)}
            disabled={!canZoomOut}
            aria-label="축소"
            title="축소"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-[3.25rem] text-center text-xs font-medium tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => applyZoom((prev) => prev + ZOOM_STEP)}
            disabled={!canZoomIn}
            aria-label="확대"
            title="확대"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={resetView}
            disabled={!canZoomOut}
            aria-label="원래 크기"
            title="원래 크기"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
