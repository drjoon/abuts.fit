// 페인트를 켜면 뷰 위에 뜨는 도구 막대. 도구·색·굵기, 되돌리기·지우기, 이미지 저장·채팅 첨부, 끄기.
// AI 디자인과 3D·이미지 프리뷰가 같이 쓴다.
// related files:
// - web/frontend/src/shared/components/practice/ViewPaintSurface.tsx
// - web/frontend/src/shared/components/PreviewAnnotateActions.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Circle,
  CircleDot,
  ImageDown,
  MoveUpRight,
  Paperclip,
  Pencil,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";

import { cn } from "@/shared/ui/cn";
import {
  VIEW_PAINT_COLORS,
  VIEW_PAINT_WIDTHS,
  viewPaintColorLabel,
  type ViewPaintHandle,
  type ViewPaintTool,
} from "@/shared/components/practice/ViewPaintSurface";

const PAINT_TOOLS: Array<{ id: ViewPaintTool; label: string; hint: string; icon: ReactNode }> = [
  { id: "pen", label: "펜", hint: "자유 곡선", icon: <Pencil /> },
  { id: "arrow", label: "화살표", hint: "끌어서 화살표", icon: <MoveUpRight /> },
  { id: "rect", label: "사각형", hint: "끌어서 사각형 · Shift 정사각형", icon: <Square /> },
  { id: "ellipse", label: "원", hint: "끌어서 원 · Shift 정원", icon: <Circle /> },
  { id: "dot", label: "점", hint: "눌러서 점", icon: <CircleDot /> },
  { id: "text", label: "글자", hint: "눌러서 글자 입력 · Enter로 확정", icon: <Type /> },
];

const WIDTH_LABEL = ["얇게", "보통", "굵게"] as const;

/** 닫히면 표시를 지우고 끈다. `resetKey`가 바뀌어도(다른 파일·의뢰) 지우고 끈다. */
export function useViewPaint({ open, resetKey }: { open: boolean; resetKey: string }) {
  const paintRef = useRef<ViewPaintHandle | null>(null);
  const [paintOn, setPaintOn] = useState(false);
  const [tool, setTool] = useState<ViewPaintTool>("pen");
  const [color, setColor] = useState<string>(VIEW_PAINT_COLORS[0]);
  const [width, setWidth] = useState<number>(VIEW_PAINT_WIDTHS[1]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (open) return;
    setPaintOn(false);
    paintRef.current?.clear();
    setCount(0);
  }, [open]);

  useEffect(() => {
    setPaintOn(false);
    paintRef.current?.clear();
    setCount(0);
  }, [resetKey]);

  return {
    paintRef,
    paintOn,
    setPaintOn,
    tool,
    setTool,
    color,
    setColor,
    width,
    setWidth,
    count,
    setCount,
  };
}

export type ViewPaintState = ReturnType<typeof useViewPaint>;

/** `ViewPaintSurface`에 넘길 값. */
export function viewPaintSurfaceProps(paint: ViewPaintState) {
  return {
    ref: paint.paintRef,
    enabled: paint.paintOn,
    tool: paint.tool,
    color: paint.color,
    width: paint.width,
    onShapesChange: paint.setCount,
    onEscape: () => paint.setPaintOn(false),
  };
}

const toolBtn =
  "grid h-8 w-8 shrink-0 place-items-center rounded-md text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4";
const toolBtnOn = "bg-primary text-primary-foreground hover:bg-primary/90";
const divider = <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;

export function ViewPaintToolbar({
  paint,
  onSaveImage,
  onAttachChat,
  className,
}: {
  paint: ViewPaintState;
  onSaveImage?: () => void;
  /** 없으면 채팅 첨부를 두지 않는다. 표시가 없어도 현재 화면을 첨부한다. */
  onAttachChat?: () => void;
  className?: string;
}) {
  const { paintRef, tool, setTool, color, setColor, width, setWidth, count, setPaintOn } = paint;
  return (
    <div
      role="toolbar"
      aria-label="페인트 도구"
      className={cn(
        "pointer-events-auto flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-center gap-y-1 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur",
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-0.5">
        {PAINT_TOOLS.map((row) => (
          <button
            key={row.id}
            type="button"
            className={cn(toolBtn, tool === row.id && toolBtnOn)}
            aria-pressed={tool === row.id}
            aria-label={row.label}
            title={`${row.label} — ${row.hint}`}
            onClick={() => setTool(row.id)}
          >
            {row.icon}
          </button>
        ))}
      </div>
      {divider}
      <div className="flex items-center gap-1 px-0.5" role="group" aria-label="표시 색">
        {VIEW_PAINT_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={cn(
              "h-5 w-5 shrink-0 rounded-full border border-black/15",
              color === swatch && "ring-2 ring-primary ring-offset-1",
            )}
            style={{ backgroundColor: swatch }}
            aria-label={viewPaintColorLabel(swatch)}
            aria-pressed={color === swatch}
            title={viewPaintColorLabel(swatch)}
            onClick={() => setColor(swatch)}
          />
        ))}
      </div>
      {divider}
      <div className="flex items-center gap-0.5" role="group" aria-label="굵기">
        {VIEW_PAINT_WIDTHS.map((value, index) => (
          <button
            key={value}
            type="button"
            className={cn(toolBtn, width === value && "bg-muted ring-1 ring-border")}
            aria-pressed={width === value}
            aria-label={`굵기 ${WIDTH_LABEL[index]}`}
            title={`굵기 ${WIDTH_LABEL[index]}`}
            onClick={() => setWidth(value)}
          >
            <span
              className="rounded-full"
              style={{
                width: `${(value + 2) / 16}rem`,
                height: `${(value + 2) / 16}rem`,
                backgroundColor: color,
              }}
            />
          </button>
        ))}
      </div>
      {divider}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={toolBtn}
          disabled={count === 0}
          aria-label="되돌리기"
          title="되돌리기 (⌘/Ctrl+Z)"
          onClick={() => paintRef.current?.undo()}
        >
          <Undo2 />
        </button>
        <button
          type="button"
          className={cn(toolBtn, "text-destructive hover:bg-destructive-soft")}
          disabled={count === 0}
          aria-label="모두 지우기"
          title="모두 지우기"
          onClick={() => paintRef.current?.clear()}
        >
          <Trash2 />
        </button>
      </div>
      {onSaveImage || onAttachChat ? (
        <>
          {divider}
          <div className="flex items-center gap-1">
            {onSaveImage ? (
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium text-foreground hover:bg-muted [&_svg]:size-3.5"
                title="표시가 입혀진 현재 화면을 PNG로 저장"
                aria-label="이미지 저장"
                onClick={onSaveImage}
              >
                <ImageDown />
                이미지 저장
              </button>
            ) : null}
            {onAttachChat ? (
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 [&_svg]:size-3.5"
                title="현재 화면(표시 포함)을 채팅에 첨부"
                aria-label="채팅 첨부"
                onClick={onAttachChat}
              >
                <Paperclip />
                채팅 첨부
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {divider}
      <button
        type="button"
        className={toolBtn}
        aria-label="페인트 끄기"
        title="페인트 끄기 (Esc) — 그린 표시는 남습니다"
        onClick={() => setPaintOn(false)}
      >
        <X />
      </button>
    </div>
  );
}
