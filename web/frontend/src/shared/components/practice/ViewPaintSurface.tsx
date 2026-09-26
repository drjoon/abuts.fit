// 3D 뷰 위에 표시를 그린다. 다시 열면 비운다.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/shared/ui/cn";

export const VIEW_PAINT_COLORS = ["#e11d48", "#f59e0b", "#2563eb", "#111827"] as const;

const PAINT_COLOR_LABEL: Record<(typeof VIEW_PAINT_COLORS)[number], string> = {
  "#e11d48": "빨강",
  "#f59e0b": "노랑",
  "#2563eb": "파랑",
  "#111827": "검정",
};

export function viewPaintColorLabel(color: string): string {
  return PAINT_COLOR_LABEL[color as (typeof VIEW_PAINT_COLORS)[number]] || "색";
}

export function downloadBlobFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function paintNoteFileName(fileName: string): string {
  const base = String(fileName || "")
    .trim()
    .replace(/\.[^.]+$/, "");
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${base || "표시"}-표시-${stamp}.png`;
}

export type ViewPaintHandle = {
  clear: () => void;
  hasInk: () => boolean;
  /** 3D 캔버스 위에 표시를 겹쳐 PNG로 만든다. */
  compositePng: (base: HTMLCanvasElement) => Promise<Blob | null>;
};

type Props = {
  enabled: boolean;
  color: string;
  onInkChange?: (hasInk: boolean) => void;
  className?: string;
};

export const ViewPaintSurface = forwardRef<ViewPaintHandle, Props>(
  function ViewPaintSurface({ enabled, color, onInkChange, className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const inkRef = useRef(false);
    const drawingRef = useRef(false);
    const colorRef = useRef(color);
    colorRef.current = color;
    const onInkChangeRef = useRef(onInkChange);
    onInkChangeRef.current = onInkChange;

    const markInk = () => {
      if (inkRef.current) return;
      inkRef.current = true;
      onInkChangeRef.current?.(true);
    };

    const clear = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!inkRef.current) return;
      inkRef.current = false;
      onInkChangeRef.current?.(false);
    };

    useImperativeHandle(ref, () => ({
      clear,
      hasInk: () => inkRef.current,
      compositePng: (base) =>
        new Promise((resolve) => {
          const out = document.createElement("canvas");
          out.width = base.width;
          out.height = base.height;
          const ctx = out.getContext("2d");
          const paint = canvasRef.current;
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(base, 0, 0);
          if (paint && inkRef.current) {
            ctx.drawImage(paint, 0, 0, out.width, out.height);
          }
          out.toBlob((blob) => resolve(blob), "image/png");
        }),
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent) return;
      const fit = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width === width && canvas.height === height) return;
        const snap = document.createElement("canvas");
        snap.width = canvas.width;
        snap.height = canvas.height;
        snap.getContext("2d")?.drawImage(canvas, 0, 0);
        canvas.width = width;
        canvas.height = height;
        if (snap.width > 0 && snap.height > 0) {
          canvas.getContext("2d")?.drawImage(snap, 0, 0, width, height);
        }
      };
      const observer = new ResizeObserver(fit);
      observer.observe(parent);
      fit();
      return () => observer.disconnect();
    }, []);

    const pointOf = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    };

    const strokeWidth = () => {
      const canvas = canvasRef.current;
      if (!canvas) return 4;
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width > 0 ? canvas.width / rect.width : 1;
      return 3.5 * scale;
    };

    return (
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 z-[8] h-full w-full touch-none",
          enabled ? "cursor-crosshair" : "pointer-events-none",
          className,
        )}
        onPointerDown={(event) => {
          if (!enabled || event.button !== 0) return;
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          const point = pointOf(event);
          if (!canvas || !ctx || !point) return;
          drawingRef.current = true;
          canvas.setPointerCapture(event.pointerId);
          ctx.strokeStyle = colorRef.current;
          ctx.lineWidth = strokeWidth();
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          ctx.lineTo(point.x + 0.01, point.y + 0.01);
          ctx.stroke();
          markInk();
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current) return;
          const ctx = canvasRef.current?.getContext("2d");
          const point = pointOf(event);
          if (!ctx || !point) return;
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          drawingRef.current = false;
        }}
        onPointerCancel={() => {
          drawingRef.current = false;
        }}
      />
    );
  },
);
