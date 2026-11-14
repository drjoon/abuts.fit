// 커스텀어벗 디자인 뷰어 위에 그리는 펜. 고칠 부위를 표시하면 다음 AI 메시지에 화면과 함께 보낸다.
// 그리는 동안 뷰어는 돌아가지 않는다(이 층이 포인터를 받는다).
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/shared/ui/cn";

export type PaintLayerHandle = {
  clear: () => void;
  hasStrokes: () => boolean;
  /** 화면 크기 그대로의 그림 캔버스(device px). */
  canvas: () => HTMLCanvasElement | null;
};

type Stroke = Array<[number, number]>;

const PEN_COLOR = "#ef4444";
const PEN_WIDTH_REM = 0.2;

export const PracticeCustomAbutmentPaintLayer = forwardRef<
  PaintLayerHandle,
  { active: boolean; onChange: (hasStrokes: boolean) => void; className?: string }
>(function PracticeCustomAbutmentPaintLayer({ active, onChange, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = PEN_COLOR;
    ctx.lineWidth = PEN_WIDTH_REM * rootPx * dpr;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]![0] * dpr, stroke[0]![1] * dpr);
      if (stroke.length === 1) ctx.lineTo(stroke[0]![0] * dpr + 0.1, stroke[0]![1] * dpr);
      for (let i = 1; i < stroke.length; i += 1) ctx.lineTo(stroke[i]![0] * dpr, stroke[i]![1] * dpr);
      ctx.stroke();
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        strokesRef.current = [];
        drawingRef.current = null;
        redraw();
        onChange(false);
      },
      hasStrokes: () => strokesRef.current.length > 0,
      canvas: () => canvasRef.current,
    }),
    [onChange, redraw],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  const pointAt = (e: ReactPointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        "absolute inset-0 h-full w-full touch-none",
        active ? "pointer-events-auto cursor-crosshair" : "pointer-events-none",
        className,
      )}
      onPointerDown={(e) => {
        if (!active || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const stroke: Stroke = [pointAt(e)];
        drawingRef.current = stroke;
        strokesRef.current.push(stroke);
        redraw();
        onChange(true);
      }}
      onPointerMove={(e) => {
        const stroke = drawingRef.current;
        if (!active || !stroke) return;
        stroke.push(pointAt(e));
        redraw();
      }}
      onPointerUp={() => {
        drawingRef.current = null;
      }}
      onPointerCancel={() => {
        drawingRef.current = null;
      }}
    />
  );
});
