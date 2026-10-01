// 3D·이미지 뷰 위에 표시를 그린다. 다시 열면 비운다.
// - 2026-10-01: 표시는 모서리로 크기를 바꾼다. 3D 뷰에서는 모델에 붙어 화면을 돌리면 같이 돈다.
// - 2026-09-30: 표시마다 (1)(2) 순번. X로 그 순번만 지운다. 저장·첨부 이미지에도 순번을 넣는다.
// - 2026-09-29: 펜·화살표·사각형·원·점·글자. 도형은 뷰 비율 좌표로 두고 크기가 바뀌면 다시 그린다. 되돌리기.
// related files:
// - web/frontend/src/shared/components/practice/ViewPaintToolbar.tsx
// - web/frontend/src/shared/components/practice/viewPaintGeom.ts
// - web/frontend/src/shared/components/practice/viewPaintInk.ts
// - web/frontend/src/shared/components/practice/viewPaintSpace.ts
// - web/frontend/src/shared/components/PreviewAnnotateActions.tsx
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { X } from "lucide-react";
import type { Group } from "three";

import { cn } from "@/shared/ui/cn";
import {
  HANDLE_HIT,
  TEXT_FONT,
  cloneShape,
  dotRadius,
  intersectPlane,
  posePoint,
  refreshShapeScreen,
  resizeShape,
  shapeHandles,
  shapeHitPx,
  shapeLabelPoint,
  textSize,
  toUV,
  type InkScale,
  type PaintShape,
  type Pose,
  type ResizeHandle,
  type ScreenPoint,
  type Vec3,
} from "@/shared/components/practice/viewPaintGeom";
import {
  createPaintInkGroup,
  disposePaintObject,
  syncPaintInk,
  syncPaintInkResolution,
} from "@/shared/components/practice/viewPaintInk";
import type { ViewPaintSpace } from "@/shared/components/practice/viewPaintSpace";

export const VIEW_PAINT_COLORS = [
  "#e11d48",
  "#f59e0b",
  "#16a34a",
  "#2563eb",
  "#9333ea",
  "#111827",
] as const;

const PAINT_COLOR_LABEL: Record<(typeof VIEW_PAINT_COLORS)[number], string> = {
  "#e11d48": "빨강",
  "#f59e0b": "노랑",
  "#16a34a": "초록",
  "#2563eb": "파랑",
  "#9333ea": "보라",
  "#111827": "검정",
};

export function viewPaintColorLabel(color: string): string {
  return PAINT_COLOR_LABEL[color as (typeof VIEW_PAINT_COLORS)[number]] || "색";
}

export type ViewPaintTool = "pen" | "arrow" | "rect" | "ellipse" | "dot" | "text";

/** 선 굵기(CSS px). 점 크기·글자 크기도 이 값을 따른다. */
export const VIEW_PAINT_WIDTHS = [2.5, 4, 7] as const;

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
  undo: () => void;
  hasInk: () => boolean;
  /** 뷰 캔버스 위에 표시를 겹쳐 PNG로 만든다. */
  compositePng: (base: HTMLCanvasElement) => Promise<Blob | null>;
};

/** 넓은 화면 루트 확대(`--ui-scale`)만큼 선·글자도 키운다. */
function uiScale() {
  const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return root > 0 ? root / 16 : 1;
}

/** `scale`은 CSS px 하나가 대상 캔버스에서 몇 px인지. */
function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: PaintShape,
  w: number,
  h: number,
  scale: number,
) {
  const px = (p: ScreenPoint) => ({ x: p.x * w, y: p.y * h });
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = shape.width * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (shape.kind === "pen") {
    const [first, ...rest] = shape.points.map(px);
    if (!first) return;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    if (rest.length === 0) ctx.lineTo(first.x + 0.01, first.y + 0.01);
    for (const point of rest) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    return;
  }
  if (shape.kind === "dot") {
    const at = px(shape.at);
    const radius =
      shape.radius != null && !shape.pose
        ? shape.radius * (scale / Math.max(uiScale(), 1e-6))
        : dotRadius(shape.width) * scale;
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    return;
  }
  if (shape.kind === "text") {
    const at = px(shape.at);
    const size = textSize(shape.width) * (shape.scale ?? 1) * scale;
    ctx.font = TEXT_FONT.replace("{size}", String(size));
    ctx.textBaseline = "top";
    ctx.lineWidth = 3 * scale;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(shape.text, at.x, at.y);
    ctx.fillText(shape.text, at.x, at.y);
    return;
  }
  const from = px(shape.from);
  const to = px(shape.to);
  if (shape.kind === "rect") {
    ctx.strokeRect(
      Math.min(from.x, to.x),
      Math.min(from.y, to.y),
      Math.abs(to.x - from.x),
      Math.abs(to.y - from.y),
    );
    return;
  }
  if (shape.kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      (from.x + to.x) / 2,
      (from.y + to.y) / 2,
      Math.abs(to.x - from.x) / 2,
      Math.abs(to.y - from.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    return;
  }
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = Math.max(10, shape.width * 3.5) * scale;
  const spread = Math.PI / 7;
  const neck = {
    x: to.x - Math.cos(angle) * head * 0.8,
    y: to.y - Math.sin(angle) * head * 0.8,
  };
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(neck.x, neck.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - spread) * head, to.y - Math.sin(angle - spread) * head);
  ctx.lineTo(to.x - Math.cos(angle + spread) * head, to.y - Math.sin(angle + spread) * head);
  ctx.closePath();
  ctx.fill();
}

/** 저장·첨부에 겹치는 순번. 화면의 X는 HTML이라 여기 넣지 않는다. */
function drawMarkLabel(
  ctx: CanvasRenderingContext2D,
  index: number,
  anchor: ScreenPoint,
  w: number,
  h: number,
  scale: number,
) {
  const label = `(${index + 1})`;
  ctx.save();
  ctx.font = `700 ${12 * scale}px system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif`;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4 * scale;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.strokeText(label, anchor.x * w + 10 * scale, anchor.y * h - 12 * scale);
  ctx.fillStyle = "#111827";
  ctx.fillText(label, anchor.x * w + 10 * scale, anchor.y * h - 12 * scale);
  ctx.restore();
}

type Props = {
  enabled: boolean;
  tool: ViewPaintTool;
  color: string;
  width: number;
  /** 3D 뷰. 있으면 표시가 모델에 붙는다. 이미지 프리뷰는 없다. */
  space?: ViewPaintSpace | null;
  /** 그려진 표시 개수가 바뀔 때마다. */
  onShapesChange?: (count: number) => void;
  /** 페인트를 켠 채 Esc를 누르면. 대화상자 닫기보다 먼저 받는다. */
  onEscape?: () => void;
  className?: string;
};

type TextDraft = {
  at: ScreenPoint;
  left: number;
  top: number;
  value: string;
  pose?: Pose;
  ink?: InkScale;
};

type ResizeDrag = { index: number; id: string; start: PaintShape };

function roundKey(value: number) {
  return Math.round(value * 10000);
}

export const ViewPaintSurface = forwardRef<ViewPaintHandle, Props>(
  function ViewPaintSurface(
    { enabled, tool, color, width, space = null, onShapesChange, onEscape, className },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const shapesRef = useRef<PaintShape[]>([]);
    const draftRef = useRef<PaintShape | null>(null);
    const inkRef = useRef<Group | null>(null);
    const spaceRef = useRef(space);
    spaceRef.current = space;
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;
    const selectedRef = useRef<number | null>(null);
    const resizeRef = useRef<ResizeDrag | null>(null);
    const overlayKeyRef = useRef("");
    const [marks, setMarks] = useState<(ScreenPoint | null)[]>([]);
    const [handles, setHandles] = useState<ResizeHandle[]>([]);
    const [selected, setSelected] = useState<number | null>(null);
    const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
    const textDraftRef = useRef(textDraft);
    textDraftRef.current = textDraft;
    const onShapesChangeRef = useRef(onShapesChange);
    onShapesChangeRef.current = onShapesChange;
    const onEscapeRef = useRef(onEscape);
    onEscapeRef.current = onEscape;
    const styleRef = useRef({ color, width });
    styleRef.current = { color, width };
    const toolRef = useRef(tool);
    toolRef.current = tool;

    const project = (point: Vec3) => spaceRef.current?.project(point) ?? null;

    const cssScale = () => {
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const perCss = canvas && rect && rect.width > 0 ? canvas.width / rect.width : 1;
      return perCss * uiScale();
    };

    /** 모델에 붙인 표시는 3D 씬에만 그린다. 화면 캔버스에 다시 겹치지 않는다. */
    const drawsOnCanvas = (shape: PaintShape) => !shape.pose;

    const redraw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = cssScale();
      for (const shape of shapesRef.current) {
        if (!drawsOnCanvas(shape)) continue;
        drawShape(ctx, shape, canvas.width, canvas.height, scale);
      }
      if (draftRef.current && drawsOnCanvas(draftRef.current)) {
        drawShape(ctx, draftRef.current, canvas.width, canvas.height, scale);
      }
    };
    const redrawRef = useRef(redraw);
    redrawRef.current = redraw;

    const syncInk = () => {
      const group = inkRef.current;
      const current = spaceRef.current;
      if (!group || !current) return;
      const list = draftRef.current
        ? [...shapesRef.current, draftRef.current]
        : shapesRef.current;
      syncPaintInk(group, list, current.viewSize());
    };

    const publishOverlay = () => {
      const current = spaceRef.current;
      const projector = current ? (point: Vec3) => current.project(point) : null;
      if (projector) {
        for (const shape of shapesRef.current) refreshShapeScreen(shape, projector);
        if (draftRef.current) refreshShapeScreen(draftRef.current, projector);
      }
      const nextMarks = shapesRef.current.map((shape) => shapeLabelPoint(shape, projector));
      const index = selectedRef.current;
      const shape = index != null ? shapesRef.current[index] : null;
      const nextHandles =
        enabledRef.current && shape ? shapeHandles(shape, projector) : [];
      const key = [
        nextMarks.map((mark) => (mark ? `${roundKey(mark.x)},${roundKey(mark.y)}` : "-")).join(";"),
        nextHandles.map((handle) => `${handle.id}:${roundKey(handle.x)},${roundKey(handle.y)}`).join(";"),
        String(index),
        enabledRef.current ? "1" : "0",
      ].join("|");
      if (key === overlayKeyRef.current) return;
      overlayKeyRef.current = key;
      setMarks(nextMarks);
      setHandles(nextHandles);
      setSelected(index);
    };

    const setShapes = (next: PaintShape[]) => {
      const before = shapesRef.current.length;
      shapesRef.current = next;
      redraw();
      syncInk();
      publishOverlay();
      if (before !== next.length) onShapesChangeRef.current?.(next.length);
    };

    const removeAt = (index: number) => {
      if (index < 0 || index >= shapesRef.current.length) return;
      const current = selectedRef.current;
      if (current === index) selectedRef.current = null;
      else if (current != null && current > index) selectedRef.current = current - 1;
      setShapes(shapesRef.current.filter((_, shapeIndex) => shapeIndex !== index));
    };

    const commitText = () => {
      const draft = textDraftRef.current;
      if (!draft) return;
      textDraftRef.current = null;
      setTextDraft(null);
      const text = draft.value.trim();
      if (!text) return;
      const next: PaintShape[] = [
        ...shapesRef.current,
        {
          kind: "text",
          ...styleRef.current,
          at: draft.at,
          text,
          pose: draft.pose,
          ink: draft.ink,
          au: 0,
          av: 0,
          scale: 1,
        },
      ];
      selectedRef.current = next.length - 1;
      setShapes(next);
    };

    const clear = () => {
      draftRef.current = null;
      textDraftRef.current = null;
      setTextDraft(null);
      selectedRef.current = null;
      resizeRef.current = null;
      setShapes([]);
    };

    const undo = () => {
      if (textDraftRef.current) {
        textDraftRef.current = null;
        setTextDraft(null);
        return;
      }
      const next = shapesRef.current.slice(0, -1);
      if (selectedRef.current != null && selectedRef.current >= next.length) {
        selectedRef.current = next.length > 0 ? next.length - 1 : null;
      }
      setShapes(next);
    };

    useImperativeHandle(ref, () => ({
      clear,
      undo,
      hasInk: () => shapesRef.current.length > 0,
      compositePng: (base) =>
        new Promise((resolve) => {
          commitText();
          const current = spaceRef.current;
          const projector = current ? (point: Vec3) => current.project(point) : null;
          if (projector) {
            for (const shape of shapesRef.current) refreshShapeScreen(shape, projector);
          }
          const out = document.createElement("canvas");
          out.width = base.width;
          out.height = base.height;
          const ctx = out.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(base, 0, 0);
          const cssWidth = canvasRef.current?.getBoundingClientRect().width ?? 0;
          const scale = (cssWidth > 0 ? out.width / cssWidth : 1) * uiScale();
          shapesRef.current.forEach((shape, index) => {
            if (drawsOnCanvas(shape)) {
              drawShape(ctx, shape, out.width, out.height, scale);
            }
            const anchor = shapeLabelPoint(shape, projector);
            if (anchor) drawMarkLabel(ctx, index, anchor, out.width, out.height, scale);
          });
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
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width === w && canvas.height === h) return;
        canvas.width = w;
        canvas.height = h;
        redrawRef.current();
      };
      const observer = new ResizeObserver(fit);
      observer.observe(parent);
      fit();
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      if (!space) {
        redrawRef.current();
        publishOverlay();
        return;
      }
      const group = createPaintInkGroup();
      inkRef.current = group;
      const detach = space.attach(group);
      syncInk();
      redrawRef.current();
      const unsub = space.subscribe(() => {
        const current = inkRef.current;
        if (!current || current.children.length === 0) {
          if (!shapesRef.current.some((shape) => shape.pose) && !draftRef.current?.pose) return;
        }
        if (current) syncPaintInkResolution(current, space.viewSize());
        publishOverlay();
      });
      publishOverlay();
      return () => {
        unsub();
        detach();
        disposePaintObject(group);
        if (inkRef.current === group) inkRef.current = null;
      };
    }, [space]);

    useEffect(() => {
      if (enabled) return;
      commitText();
      draftRef.current = null;
      resizeRef.current = null;
      redraw();
      publishOverlay();
      // commitText·redraw는 ref만 읽는다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    useEffect(() => {
      if (!enabled) return;
      const onKey = (event: KeyboardEvent) => {
        const editing = event.target === inputRef.current && inputRef.current != null;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (editing || textDraftRef.current) {
            textDraftRef.current = null;
            setTextDraft(null);
            return;
          }
          onEscapeRef.current?.();
          return;
        }
        const target = event.target;
        if (
          editing ||
          (target instanceof HTMLElement &&
            (target.tagName === "INPUT" ||
              target.tagName === "TEXTAREA" ||
              target.isContentEditable))
        ) {
          return;
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === "z"
        ) {
          event.preventDefault();
          event.stopPropagation();
          undo();
        }
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
      // undo는 ref만 읽는다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    const pointAt = (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
        left: clientX - rect.left,
        top: clientY - rect.top,
        rect,
      };
    };

    /** Shift를 누르면 사각형·원을 정사각형·정원으로. */
    const constrain = (from: ScreenPoint, to: ScreenPoint, rect: DOMRect, square: boolean): ScreenPoint => {
      if (!square) return to;
      const dx = (to.x - from.x) * rect.width;
      const dy = (to.y - from.y) * rect.height;
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      return {
        x: from.x + (Math.sign(dx) || 1) * (size / rect.width),
        y: from.y + (Math.sign(dy) || 1) * (size / rect.height),
      };
    };

    const hitIndexAt = (clientX: number, clientY: number) => {
      const point = pointAt(clientX, clientY);
      const canvas = canvasRef.current?.getBoundingClientRect();
      if (!point || !canvas) return null;
      const projector = spaceRef.current ? (next: Vec3) => spaceRef.current?.project(next) ?? null : null;
      for (let index = shapesRef.current.length - 1; index >= 0; index -= 1) {
        const distance = shapeHitPx(
          shapesRef.current[index],
          point.x,
          point.y,
          canvas.width,
          canvas.height,
          projector,
        );
        if (distance <= HANDLE_HIT) return index;
      }
      return null;
    };

    const applyResize = (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = resizeRef.current;
      if (!drag) return;
      const shape = shapesRef.current[drag.index];
      const point = pointAt(event.clientX, event.clientY);
      if (!shape || !point) return;
      const current = spaceRef.current;
      const ray = shape.pose && current ? current.ray(event.clientX, event.clientY) : null;
      const world = shape.pose && ray ? intersectPlane(ray, shape.pose) : null;
      const minWorld = current ? current.worldPerPixel(shape.pose?.origin ?? { x: 0, y: 0, z: 0 }) * 6 : 1e-4;
      resizeShape(
        shape,
        drag.start,
        drag.id,
        { x: point.x, y: point.y, world },
        event.shiftKey,
        minWorld,
        { width: point.rect.width, height: point.rect.height },
      );
      syncInk();
      redraw();
      publishOverlay();
    };

    const fontPx = textSize(width);

    return (
      <>
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0 z-[8] h-full w-full touch-none",
            !enabled
              ? "pointer-events-none"
              : tool === "text"
                ? "cursor-text"
                : "cursor-crosshair",
            className,
          )}
          onPointerDown={(event) => {
            if (!enabled || event.button !== 0) return;
            const point = pointAt(event.clientX, event.clientY);
            const canvas = canvasRef.current;
            if (!point || !canvas) return;
            const at = { x: point.x, y: point.y };
            const currentTool = toolRef.current;
            if (currentTool !== "text") {
              const hit = hitIndexAt(event.clientX, event.clientY);
              if (hit != null) {
                event.preventDefault();
                selectedRef.current = hit;
                publishOverlay();
                return;
              }
            }
            const style = styleRef.current;
            const current = spaceRef.current;
            const surface = current?.pick(event.clientX, event.clientY) ?? null;
            const ink: InkScale | undefined =
              surface && current
                ? { px: current.worldPerPixel(surface.point) * uiScale(), lift: current.surfaceLift() }
                : undefined;
            if (currentTool === "text") {
              event.preventDefault();
              commitText();
              setTextDraft({
                at,
                left: point.left,
                top: point.top,
                value: "",
                pose: surface?.pose,
                ink,
              });
              return;
            }
            if (currentTool === "dot") {
              const next: PaintShape[] = [
                ...shapesRef.current,
                surface && ink
                  ? {
                      kind: "dot",
                      ...style,
                      at,
                      pose: surface.pose,
                      au: 0,
                      av: 0,
                      radius: dotRadius(style.width) * ink.px,
                      ink,
                    }
                  : { kind: "dot", ...style, at },
              ];
              selectedRef.current = next.length - 1;
              setShapes(next);
              return;
            }
            selectedRef.current = null;
            publishOverlay();
            canvas.setPointerCapture(event.pointerId);
            draftRef.current =
              surface && ink
                ? currentTool === "pen"
                  ? {
                      kind: "pen",
                      ...style,
                      points: [at],
                      pose: surface.pose,
                      samples: [{ u: 0, v: 0, lift: 0 }],
                      ink,
                    }
                  : {
                      kind: currentTool,
                      ...style,
                      from: at,
                      to: at,
                      pose: surface.pose,
                      au: 0,
                      av: 0,
                      bu: 0,
                      bv: 0,
                      ink,
                    }
                : currentTool === "pen"
                  ? { kind: "pen", ...style, points: [at] }
                  : { kind: currentTool, ...style, from: at, to: at };
            redraw();
            syncInk();
          }}
          onPointerMove={(event) => {
            const draft = draftRef.current;
            if (!draft) return;
            const point = pointAt(event.clientX, event.clientY);
            if (!point) return;
            const at = { x: point.x, y: point.y };
            const current = spaceRef.current;
            if (draft.pose && current && draft.ink) {
              if (draft.kind === "pen" && draft.samples) {
                const hit = current.pick(event.clientX, event.clientY);
                const ray = current.ray(event.clientX, event.clientY);
                const world = hit?.point ?? (ray ? intersectPlane(ray, draft.pose) : null);
                if (world) {
                  draft.samples.push(toUV(draft.pose, world));
                  const screen = current.project(world);
                  if (screen) draft.points.push(screen);
                }
              } else if (
                (draft.kind === "arrow" || draft.kind === "rect" || draft.kind === "ellipse") &&
                draft.pose
              ) {
                const ray = current.ray(event.clientX, event.clientY);
                const world = ray ? intersectPlane(ray, draft.pose) : null;
                if (world) {
                  let uv = toUV(draft.pose, world);
                  if (event.shiftKey && draft.kind !== "arrow") {
                    const side = Math.max(Math.abs(uv.u), Math.abs(uv.v));
                    uv = {
                      u: (Math.sign(uv.u) || 1) * side,
                      v: (Math.sign(uv.v) || 1) * side,
                      lift: 0,
                    };
                  }
                  draft.bu = uv.u;
                  draft.bv = uv.v;
                  const screen = current.project(posePoint(draft.pose, uv.u, uv.v));
                  if (screen) draft.to = screen;
                }
              }
              syncInk();
              redraw();
              return;
            }
            if (draft.kind === "pen") {
              draft.points.push(at);
            } else if (draft.kind === "arrow" || draft.kind === "rect" || draft.kind === "ellipse") {
              draft.to = constrain(
                draft.from,
                at,
                point.rect,
                event.shiftKey && draft.kind !== "arrow",
              );
            }
            redraw();
          }}
          onPointerUp={() => {
            const draft = draftRef.current;
            if (!draft) return;
            draftRef.current = null;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (
              (draft.kind === "arrow" || draft.kind === "rect" || draft.kind === "ellipse") &&
              rect &&
              Math.hypot(
                (draft.to.x - draft.from.x) * rect.width,
                (draft.to.y - draft.from.y) * rect.height,
              ) < 4
            ) {
              syncInk();
              redraw();
              return;
            }
            const next = [...shapesRef.current, draft];
            selectedRef.current = next.length - 1;
            setShapes(next);
          }}
          onPointerCancel={() => {
            draftRef.current = null;
            syncInk();
            redraw();
          }}
        />
        {textDraft ? (
          <input
            ref={inputRef}
            autoFocus
            value={textDraft.value}
            placeholder="글자 입력 후 Enter"
            className="absolute z-[9] min-w-[8rem] rounded-sm border border-dashed border-current bg-white/80 px-1 py-0 font-semibold leading-tight outline-none placeholder:text-xs placeholder:font-normal placeholder:text-slate-400"
            style={{
              left: `calc(${textDraft.left}px - 0.3125rem)`,
              top: `calc(${textDraft.top}px - 0.0625rem)`,
              color,
              fontSize: `${fontPx / 16}rem`,
              width: `${Math.max(8, textDraft.value.length + 2)}ch`,
            }}
            onChange={(event) => {
              const value = event.target.value;
              setTextDraft((prev) => (prev ? { ...prev, value } : prev));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                commitText();
              }
            }}
            onBlur={commitText}
          />
        ) : null}
        {marks.map((mark, index) =>
          mark ? (
            <div
              key={`mark-${index}`}
              className="pointer-events-auto absolute z-[9] flex items-center gap-0.5 rounded-full border border-slate-300 bg-white/95 py-0.5 pl-1.5 pr-0.5 text-[0.6875rem] font-semibold leading-none text-slate-900 shadow-sm"
              style={{
                left: `${mark.x * 100}%`,
                top: `${mark.y * 100}%`,
                transform: mark.y < 0.08 ? "translate(0.35rem, 0.25rem)" : "translate(0.35rem, -1.35rem)",
              }}
              onPointerDown={(event) => {
                if (!enabled || event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                selectedRef.current = index;
                publishOverlay();
              }}
            >
              <span>({index + 1})</span>
              <button
                type="button"
                className="grid h-4 w-4 place-items-center rounded-full text-slate-500 hover:bg-destructive-soft hover:text-destructive"
                aria-label={`${index + 1}번 표시 지우기`}
                title={`${index + 1}번 표시 지우기`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  removeAt(index);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null,
        )}
        {enabled
          ? handles.map((handle) => (
              <div
                key={`${selected ?? "x"}-${handle.id}`}
                aria-label="크기 조정"
                title="드래그해서 크기 조정"
                className="absolute z-[10] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-slate-900 bg-white shadow-sm"
                style={{
                  left: `${handle.x * 100}%`,
                  top: `${handle.y * 100}%`,
                  cursor: handle.cursor,
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0 || selectedRef.current == null) return;
                  const shape = shapesRef.current[selectedRef.current];
                  if (!shape) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  resizeRef.current = {
                    index: selectedRef.current,
                    id: handle.id,
                    start: cloneShape(shape),
                  };
                }}
                onPointerMove={applyResize}
                onPointerUp={() => {
                  resizeRef.current = null;
                }}
                onPointerCancel={() => {
                  resizeRef.current = null;
                }}
              />
            ))
          : null}
      </>
    );
  },
);
